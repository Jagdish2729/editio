import { NextResponse } from "next/server";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
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
    const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-1800)}`)));
  });
}

function safeName(value: string) { return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_"); }

function filenameFromUrl(url: string) {
  try { return new URL(`http://editio.local${url}`).searchParams.get("name") || ""; } catch { return ""; }
}

function resolveClip(clips: RenderClip[], requested: string) {
  if (!requested) return undefined;
  const exact = clips.find(c => c.originalName === requested);
  if (exact) return exact;
  const lower = requested.toLowerCase();
  return clips.find(c => c.originalName.toLowerCase() === lower)
    || clips.find(c => path.basename(c.originalName).toLowerCase() === path.basename(requested).toLowerCase());
}

function inputArgs(input: string, start?: number, duration?: number) {
  const args: string[] = [];
  if (Number.isFinite(start) && (start || 0) > 0) args.push("-ss", String(Math.max(0, start || 0)));
  args.push("-i", input);
  if (Number.isFinite(duration) && (duration || 0) > 0) args.push("-t", String(Math.min(30, Math.max(0.25, duration || 0))));
  return args;
}

async function renderSegment(input: string, output: string, start?: number, end?: number) {
  const duration = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0.25, Math.min(30, (end as number) - (start as number))) : undefined;
  const args = ["-y", ...inputArgs(input, start, duration), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
  try {
    await runFfmpeg(args);
  } catch (firstError) {
    const fallback = ["-y", ...inputArgs(input, start, duration), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30", "-an", "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", output];
    try { await runFfmpeg(fallback); } catch (secondError) {
      const a = firstError instanceof Error ? firstError.message : "H.264 failed.";
      const b = secondError instanceof Error ? secondError.message : "MPEG-4 failed.";
      throw new Error(`${a.slice(-650)} | ${b.slice(-650)}`);
    }
  }
}

async function renderWhole(input: string, output: string) {
  await renderSegment(input, output);
}

export async function POST(request: Request) {
  const tempDir = path.join(process.cwd(), "data", "render-tmp");
  try {
    const body = await request.json() as { orderId?: string; clips?: RenderClip[]; plan?: RenderPlan };
    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length) {
      return NextResponse.json({ error: "Render data is incomplete." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "data", "uploads");
    const renderDir = path.join(process.cwd(), "data", "renders");
    await mkdir(renderDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });

    const available = body.clips.map(clip => {
      const filename = filenameFromUrl(clip.url);
      const filePath = filename ? path.join(uploadDir, safeName(filename)) : "";
      return { clip, filePath };
    }).filter(item => item.filePath);

    const existing = [] as typeof available;
    for (const item of available) {
      try { await stat(item.filePath); existing.push(item); } catch { /* skip missing files */ }
    }
    if (!existing.length) {
      return NextResponse.json({ error: "Uploaded footage could not be located on this server. Re-upload the footage to create a new draft." }, { status: 404 });
    }

    const outputName = `${body.orderId}-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(renderDir, outputName);
    const planParts = (body.plan?.clipSequence || []).map(item => {
      const clip = resolveClip(body.clips!, item.clip);
      if (!clip) return null;
      const found = existing.find(x => x.clip === clip);
      if (!found) return null;
      const timestamp = Number(item.timestampSeconds);
      const hasRange = Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && Number(item.endSeconds) > Number(item.startSeconds);
      const start = hasRange ? Number(item.startSeconds) : Number.isFinite(timestamp) ? Math.max(0, timestamp - 1.5) : 0;
      const end = hasRange ? Number(item.endSeconds) : Number.isFinite(timestamp) ? timestamp + 2.5 : 8;
      return { input: found.filePath, start: Math.max(0, start), end: Math.max(start + 0.25, end) };
    }).filter(Boolean) as Array<{ input: string; start: number; end: number }>;

    const tempFiles: string[] = [];
    let lastError = "";

    // First try the AI-selected cuts, one segment at a time. This is deliberately
    // simpler than one giant filter graph so a single bad timestamp cannot kill the job.
    if (planParts.length) {
      try {
        for (let i = 0; i < planParts.length; i++) {
          const temp = path.join(tempDir, `${body.orderId}-${crypto.randomUUID()}-${i}.mp4`);
          await renderSegment(planParts[i].input, temp, planParts[i].start, planParts[i].end);
          tempFiles.push(temp);
        }
        if (tempFiles.length === 1) {
          await writeFile(outputPath, await readFile(tempFiles[0]));
        } else {
          const listPath = path.join(tempDir, `${body.orderId}-${crypto.randomUUID()}.txt`);
          await writeFile(listPath, tempFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
          try {
            await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outputPath]);
          } finally {
            await rm(listPath, { force: true });
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "AI segment rendering failed.";
        await rm(outputPath, { force: true });
      }
    }

    // Hard fallback: if the AI-selected cuts fail for any reason, render the first
    // uploaded video as a clean 9:16 draft. The creator should never be left with a
    // permanently stuck order just because an AI timestamp or codec was imperfect.
    try {
      await stat(outputPath);
    } catch {
      try {
        await renderWhole(existing[0].filePath, outputPath);
      } catch (error) {
        const fallbackError = error instanceof Error ? error.message : "Full-footage render failed.";
        return NextResponse.json({ error: `Draft render failed. ${fallbackError}${lastError ? ` AI cut attempt: ${lastError}` : ""}` }, { status: 500 });
      }
    }

    for (const file of tempFiles) await rm(file, { force: true });
    return NextResponse.json({ ok: true, status: "ready", url: `/api/render/file?name=${encodeURIComponent(outputName)}`, outputName, usedAiCuts: planParts.length > 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft rendering failed." }, { status: 500 });
  }
}
