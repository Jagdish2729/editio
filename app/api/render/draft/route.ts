import { NextResponse } from "next/server";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
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
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}). ${stderr.slice(-2200)}`)));
  });
}

function safeName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function storedName(url: string) {
  try {
    const name = new URL(`http://editio.local${url}`).searchParams.get("name") || "";
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
    return safeName(name);
  } catch { return null; }
}

function resolveClip(clips: RenderClip[], requested: string) {
  if (!requested) return undefined;
  const exact = clips.find(c => c.originalName === requested);
  if (exact) return exact;
  const lower = requested.toLowerCase();
  return clips.find(c => c.originalName.toLowerCase() === lower)
    || clips.find(c => path.basename(c.originalName).toLowerCase() === path.basename(requested).toLowerCase());
}

export async function POST(request: Request) {
  const temporaryFiles: string[] = [];
  try {
    const body = await request.json() as { orderId?: string; clips?: RenderClip[]; plan?: RenderPlan };
    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length || !body.plan) {
      return NextResponse.json({ error: "Render data is incomplete." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "data", "uploads");
    const renderDir = path.join(process.cwd(), "data", "renders");
    await mkdir(renderDir, { recursive: true });

    const requested = Array.isArray(body.plan.clipSequence) ? body.plan.clipSequence : [];
    const sequence = requested.length ? requested : body.clips.map(c => ({ clip: c.originalName, startSeconds: 0, endSeconds: 8 }));
    const usable: Array<{ clip: RenderClip; start: number; duration: number }> = [];

    for (const item of sequence.slice(0, 12)) {
      const clip = resolveClip(body.clips, item.clip);
      if (!clip) continue;
      const filename = storedName(clip.url);
      if (!filename) continue;
      try { await stat(path.join(uploadDir, filename)); } catch { continue; }

      const timestamp = Number(item.timestampSeconds);
      const rawStart = Number(item.startSeconds);
      const rawEnd = Number(item.endSeconds);
      const hasRange = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart;
      const start = Math.max(0, Math.min(hasRange ? rawStart : Number.isFinite(timestamp) ? timestamp - 1.5 : 0, 3600));
      const end = hasRange ? rawEnd : Number.isFinite(timestamp) ? timestamp + 2.5 : start + 6;
      const duration = Math.max(0.5, Math.min(end - start, 20));
      usable.push({ clip, start, duration });
    }

    // The AI plan must never be able to make rendering fail by itself.
    if (!usable.length) {
      for (const clip of body.clips.slice(0, 3)) {
        const filename = storedName(clip.url);
        if (!filename) continue;
        try { await stat(path.join(uploadDir, filename)); usable.push({ clip, start: 0, duration: 8 }); } catch { /* try next */ }
      }
    }

    if (!usable.length) {
      return NextResponse.json({ error: "Uploaded footage could not be located on this server. Please create a new edit and upload the footage again." }, { status: 404 });
    }

    const segmentPaths: string[] = [];
    for (let i = 0; i < usable.length; i++) {
      const part = usable[i];
      const filename = storedName(part.clip.url)!;
      const inputPath = path.join(uploadDir, filename);
      const segmentPath = path.join(renderDir, `segment-${body.orderId}-${crypto.randomUUID()}.mp4`);
      temporaryFiles.push(segmentPath);

      const common = ["-y", "-ss", String(part.start), "-i", inputPath, "-t", String(part.duration), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p", "-an", "-pix_fmt", "yuv420p", "-movflags", "+faststart", segmentPath];
      try {
        await runFfmpeg([...common.slice(0, -1), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", common[common.length - 1]]);
      } catch (firstError) {
        try {
          await runFfmpeg([...common.slice(0, -1), "-c:v", "mpeg4", "-q:v", "5", common[common.length - 1]]);
        } catch (secondError) {
          const msg = secondError instanceof Error ? secondError.message : firstError instanceof Error ? firstError.message : "Unknown FFmpeg error.";
          return NextResponse.json({ error: `Could not render video segment ${i + 1}. ${msg.slice(-1800)}` }, { status: 500 });
        }
      }
      segmentPaths.push(segmentPath);
    }

    const outputName = `${body.orderId}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);

    if (segmentPaths.length === 1) {
      await writeFile(outputPath, await readFile(segmentPaths[0]));
    } else {
      const concatPath = path.join(renderDir, `concat-${body.orderId}-${crypto.randomUUID()}.txt`);
      temporaryFiles.push(concatPath);
      await writeFile(concatPath, segmentPaths.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
      try {
        await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", outputPath]);
      } catch {
        await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]);
      }
    }

    return NextResponse.json({ ok: true, status: "ready", url: `/api/render/file?name=${encodeURIComponent(outputName)}`, outputName, segments: segmentPaths.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft rendering failed." }, { status: 500 });
  } finally {
    await Promise.all(temporaryFiles.map(file => unlink(file).catch(() => undefined)));
  }
}
