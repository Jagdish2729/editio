import { NextResponse } from "next/server";
import { mkdir, stat } from "fs/promises";
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
    if (!ffmpegPath) return reject(new Error("FFmpeg binary is unavailable. Run npm install and restart the dev server."));
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-2200)}`)));
  });
}

function safeName(value: string) { return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_"); }

function clipNameFromUrl(url: string) {
  try { return new URL(`http://editio.local${url}`).searchParams.get("name") || ""; } catch { return ""; }
}

function resolveClip(clips: RenderClip[], requested: string) {
  if (!requested) return undefined;
  const exact = clips.find(clip => clip.originalName === requested);
  if (exact) return exact;
  const lower = requested.toLowerCase();
  return clips.find(clip => clip.originalName.toLowerCase() === lower)
    || clips.find(clip => path.basename(clip.originalName).toLowerCase() === path.basename(requested).toLowerCase());
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

    const usable = body.plan.clipSequence.map(item => {
      const clip = resolveClip(body.clips!, item.clip);
      if (!clip) return null;
      const timestamp = Number(item.timestampSeconds);
      const hasRange = Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && Number(item.endSeconds) > Number(item.startSeconds);
      const start = hasRange ? Number(item.startSeconds) : (Number.isFinite(timestamp) ? Math.max(0, timestamp - 1.5) : 0);
      const end = hasRange ? Number(item.endSeconds) : (Number.isFinite(timestamp) ? timestamp + 2.5 : start + 5);
      return end > start ? { clip, start: Math.max(0, start), end: Math.max(start + 0.05, end) } : null;
    }).filter(Boolean) as Array<{ clip: RenderClip; start: number; end: number }>;

    // If the AI plan is malformed, still make a safe first draft from the uploaded footage.
    const renderParts = usable.length ? usable : body.clips.map(clip => ({ clip, start: 0, end: 8 }));

    const inputPaths: string[] = [];
    const inputIndex = new Map<string, number>();
    for (const part of renderParts) {
      const filename = clipNameFromUrl(part.clip.url);
      if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) continue;
      const filePath = path.join(uploadDir, safeName(filename));
      try { await stat(filePath); } catch { continue; }
      if (!inputIndex.has(filePath)) { inputIndex.set(filePath, inputPaths.length); inputPaths.push(filePath); }
    }

    if (!inputPaths.length) return NextResponse.json({ error: "Uploaded footage could not be located on this server. Re-upload the footage to create a new draft." }, { status: 404 });

    const filters: string[] = [];
    const concatInputs: string[] = [];
    renderParts.forEach((part, index) => {
      const filename = clipNameFromUrl(part.clip.url);
      const sourceIndex = inputIndex.get(path.join(uploadDir, safeName(filename)));
      if (sourceIndex === undefined) return;
      const safeStart = Math.max(0, Number(part.start) || 0);
      const safeEnd = Math.max(safeStart + 0.05, Number(part.end) || safeStart + 5);
      filters.push(`[${sourceIndex}:v]trim=start=${safeStart}:end=${safeEnd},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${index}]`);
      concatInputs.push(`[v${index}]`);
    });

    if (!concatInputs.length) return NextResponse.json({ error: "No valid video cuts were available to render." }, { status: 422 });
    filters.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=1:a=0[outv]`);

    const outputName = `${body.orderId}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);
    const baseArgs = ["-y"];
    for (const inputPath of inputPaths) baseArgs.push("-i", inputPath);
    const filterArgs = ["-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-movflags", "+faststart"];

    // Prefer H.264. If the local FFmpeg build does not include libx264, fall back to
    // the built-in MPEG-4 encoder so local development still produces a playable draft.
    try {
      await runFfmpeg([...baseArgs, ...filterArgs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", outputPath]);
    } catch (firstError) {
      try {
        await runFfmpeg([...baseArgs, ...filterArgs, "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", outputPath]);
      } catch (secondError) {
        const first = firstError instanceof Error ? firstError.message : "H.264 render failed.";
        const second = secondError instanceof Error ? secondError.message : "Fallback render failed.";
        return NextResponse.json({ error: `Draft render failed. H.264: ${first.slice(-900)} Fallback: ${second.slice(-900)}` }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, status: "ready", url: `/api/render/file?name=${encodeURIComponent(outputName)}`, outputName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft rendering failed." }, { status: 500 });
  }
}
