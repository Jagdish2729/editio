import { NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

type RenderClip = { originalName: string; url: string };
type SequenceItem = { clip: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number };
type RenderPlan = { aspectRatio?: string; clipSequence?: SequenceItem[] };

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("FFmpeg binary is unavailable."));
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-1200)}`)));
  });
}

function safeName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: string; clips?: RenderClip[]; plan?: RenderPlan };
    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length || !body.plan?.clipSequence?.length) {
      return NextResponse.json({ error: "Render data is incomplete." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "data", "uploads");
    const renderDir = path.join(process.cwd(), "data", "renders");
    await mkdir(renderDir, { recursive: true });

    const byName = new Map(body.clips.map(clip => [clip.originalName, clip]));
    const usable = body.plan.clipSequence.map(item => {
      const clip = byName.get(item.clip);
      if (!clip) return null;
      const timestamp = Number(item.timestampSeconds);
      const start = Number.isFinite(item.startSeconds) ? item.startSeconds : (Number.isFinite(timestamp) ? Math.max(0, timestamp - 1.5) : 0);
      const end = Number.isFinite(item.endSeconds) ? item.endSeconds : (Number.isFinite(timestamp) ? timestamp + 2.5 : start + 5);
      return end > start ? { item, clip, start: Math.max(0, start), end: Math.max(start + 0.05, end) } : null;
    }).filter(Boolean) as Array<{ item: SequenceItem; clip: RenderClip; start: number; end: number }>;

    if (!usable.length) return NextResponse.json({ error: "AI plan did not contain usable video cuts." }, { status: 422 });

    const inputPaths: string[] = [];
    const inputIndex = new Map<string, number>();
    for (const part of usable) {
      const filename = new URL(`http://editio.local${part.clip.url}`).searchParams.get("name");
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
    usable.forEach((part, index) => {
      const filename = new URL(`http://editio.local${part.clip.url}`).searchParams.get("name")!;
      const sourceIndex = inputIndex.get(path.join(uploadDir, safeName(filename)));
      if (sourceIndex === undefined) return;
      filters.push(`[${sourceIndex}:v]trim=start=${part.start}:end=${part.end},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v${index}]`);
      concatInputs.push(`[v${index}]`);
    });
    if (!concatInputs.length) return NextResponse.json({ error: "No valid cuts were available to render." }, { status: 422 });
    filters.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=1:a=0[outv]`);

    const outputName = `${body.orderId}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);
    const args = ["-y"];
    for (const inputPath of inputPaths) args.push("-i", inputPath);
    args.push("-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", outputPath);

    await runFfmpeg(args);
    return NextResponse.json({ ok: true, status: "ready", url: `/api/render/file?name=${encodeURIComponent(outputName)}`, outputName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft rendering failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
