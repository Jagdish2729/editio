import { NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

export type RenderClip = {
  originalName: string;
  url: string;
};

type SequenceItem = {
  clip: string;
  startSeconds: number;
  endSeconds: number;
};

type RenderPlan = {
  aspectRatio?: string;
  clipSequence?: SequenceItem[];
};

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("FFmpeg binary is unavailable."));
      return;
    }

    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-1200)}`));
    });
  });
}

function safeName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      orderId?: string;
      clips?: RenderClip[];
      plan?: RenderPlan;
    };

    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length || !body.plan?.clipSequence?.length) {
      return NextResponse.json({ error: "Render data is incomplete." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "data", "uploads");
    const renderDir = path.join(process.cwd(), "data", "renders");
    await mkdir(renderDir, { recursive: true });

    const byName = new Map(body.clips.map(clip => [clip.originalName, clip]));
    const sequence = body.plan.clipSequence.filter(item => {
      const clip = byName.get(item.clip);
      return Boolean(clip) && Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && item.endSeconds > item.startSeconds;
    });

    if (!sequence.length) {
      return NextResponse.json({ error: "AI plan did not contain usable video cuts." }, { status: 422 });
    }

    const inputPaths: string[] = [];
    const inputIndex = new Map<string, number>();
    for (const item of sequence) {
      const clip = byName.get(item.clip)!;
      const filename = new URL(`http://editio.local${clip.url}`).searchParams.get("name");
      if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) continue;
      const filePath = path.join(uploadDir, safeName(filename));
      if (!inputIndex.has(filePath)) {
        inputIndex.set(filePath, inputPaths.length);
        inputPaths.push(filePath);
      }
    }

    if (!inputPaths.length) return NextResponse.json({ error: "Uploaded footage could not be located." }, { status: 404 });

    const filters: string[] = [];
    const concatInputs: string[] = [];
    sequence.forEach((item, index) => {
      const clip = byName.get(item.clip)!;
      const filename = new URL(`http://editio.local${clip.url}`).searchParams.get("name")!;
      const sourceIndex = inputIndex.get(path.join(uploadDir, safeName(filename)));
      if (sourceIndex === undefined) return;
      const start = Math.max(0, item.startSeconds);
      const end = Math.max(start + 0.05, item.endSeconds);
      filters.push(`[${sourceIndex}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v${index}]`);
      concatInputs.push(`[v${index}]`);
    });

    if (!concatInputs.length) return NextResponse.json({ error: "No valid cuts were available to render." }, { status: 422 });

    filters.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=1:a=0[outv]`);

    const outputName = `${body.orderId}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);
    const args = ["-y"];
    for (const inputPath of inputPaths) args.push("-i", inputPath);
    args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", outputPath];

    await runFfmpeg(args);

    return NextResponse.json({
      ok: true,
      status: "ready",
      url: `/api/render/file?name=${encodeURIComponent(outputName)}`,
      outputName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft rendering failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
