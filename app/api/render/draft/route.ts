import { NextResponse } from "next/server";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";

export const runtime = "nodejs";

type RenderClip = { originalName: string; url: string };
type SequenceItem = { clip: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number };
type Caption = { text?: string; placement?: string; startSeconds?: number; endSeconds?: number };
type RenderPlan = { aspectRatio?: string; clipSequence?: SequenceItem[]; hook?: string; captions?: Caption[]; captionIdeas?: string[] };
type RenderRequest = { orderId?: string; clips?: RenderClip[]; plan?: RenderPlan; outputType?: "draft" | "final" };

async function resolveFfmpeg() {
  const candidates = [
    path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ];
  for (const candidate of candidates) {
    try { await stat(candidate); return candidate; } catch { /* try next */ }
  }
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function runFfmpeg(args: string[]) {
  return new Promise<void>(async (resolve, reject) => {
    const executable = await resolveFfmpeg();
    const child = spawn(executable, args, { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => reject(new Error(`${error.message} | FFmpeg executable: ${executable}`)));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}) using ${executable}: ${stderr.slice(-1800)}`)));
  });
}

function safeName(value: string) { return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_"); }
function filenameFromUrl(url: string) { try { return new URL(`http://editio.local${url}`).searchParams.get("name") || ""; } catch { return ""; } }
function resolveClip(clips: RenderClip[], requested: string) {
  if (!requested) return undefined;
  const exact = clips.find(c => c.originalName === requested); if (exact) return exact;
  const lower = requested.toLowerCase();
  return clips.find(c => c.originalName.toLowerCase() === lower) || clips.find(c => path.basename(c.originalName).toLowerCase() === path.basename(requested).toLowerCase());
}
function inputArgs(input: string, start?: number, duration?: number) {
  const args: string[] = [];
  if (Number.isFinite(start) && (start || 0) > 0) args.push("-ss", String(Math.max(0, start || 0)));
  args.push("-i", input);
  if (Number.isFinite(duration) && (duration || 0) > 0) args.push("-t", String(Math.min(30, Math.max(0.25, duration || 0))));
  return args;
}
async function findFont() {
  const candidates = process.platform === "win32" ? ["C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\arial.ttf"] : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  for (const candidate of candidates) { try { await stat(candidate); return candidate; } catch { /* try next */ } }
  return null;
}
function escapeDrawText(value: string) { return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/\n/g, " ").trim().slice(0, 110); }
function fontForFilter(font: string) { return font.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:"); }
function overlayFilters(font: string | null, hook?: string, caption?: string) {
  if (!font || (!hook && !caption)) return "";
  const filters: string[] = [];
  if (hook) filters.push(`drawtext=fontfile='${fontForFilter(font)}':text='${escapeDrawText(hook)}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h*0.18:box=1:boxcolor=black@0.55:boxborderw=18`);
  if (caption) filters.push(`drawtext=fontfile='${fontForFilter(font)}':text='${escapeDrawText(caption)}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h*0.78:box=1:boxcolor=black@0.45:boxborderw=14`);
  return filters.join(",");
}

async function renderSegment(input: string, output: string, start?: number, end?: number, hook?: string, caption?: string, finalQuality = false) {
  const duration = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0.25, Math.min(30, (end as number) - (start as number))) : undefined;
  const font = await findFont();
  const baseFilters = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30";
  const overlays = overlayFilters(font, hook, caption);
  const videoFilter = overlays ? `${baseFilters},${overlays}` : baseFilters;
  const args = ["-y", ...inputArgs(input, start, duration), "-vf", videoFilter, "-c:v", "libx264", "-preset", finalQuality ? "medium" : "veryfast", "-crf", finalQuality ? "20" : "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", finalQuality ? "192k" : "128k", "-ar", "48000", "-movflags", "+faststart", output];
  try { await runFfmpeg(args); }
  catch (firstError) {
    const fallback = ["-y", ...inputArgs(input, start, duration), "-vf", videoFilter, "-c:v", "mpeg4", "-q:v", finalQuality ? "3" : "5", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", finalQuality ? "192k" : "128k", "-ar", "48000", output];
    try { await runFfmpeg(fallback); }
    catch (secondError) {
      const a = firstError instanceof Error ? firstError.message : "H.264 failed."; const b = secondError instanceof Error ? secondError.message : "MPEG-4 failed.";
      throw new Error(`${a.slice(-650)} | ${b.slice(-650)}`);
    }
  }
}

export async function POST(request: Request) {
  const tempDir = path.join(process.cwd(), "data", "render-tmp");
  try {
    const body = await request.json() as RenderRequest;
    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length) return NextResponse.json({ error: "Render data is incomplete." }, { status: 400 });
    const outputType = body.outputType || "draft";
    const uploadDir = path.join(process.cwd(), "data", "uploads"); const renderDir = path.join(process.cwd(), "data", "renders");
    await mkdir(renderDir, { recursive: true }); await mkdir(tempDir, { recursive: true });
    const available = body.clips.map(clip => { const filename = filenameFromUrl(clip.url); const filePath = filename ? path.join(uploadDir, safeName(filename)) : ""; return { clip, filePath }; }).filter(item => item.filePath);
    const existing = [] as typeof available;
    for (const item of available) { try { await stat(item.filePath); existing.push(item); } catch { /* skip missing */ } }
    if (!existing.length) return NextResponse.json({ error: "Uploaded footage could not be located on this server. Re-upload the footage to create a new render." }, { status: 404 });

    const outputName = `${body.orderId}-${outputType}-${crypto.randomUUID()}.mp4`; const outputPath = path.join(renderDir, outputName); const finalQuality = outputType === "final";
    const planParts = (body.plan?.clipSequence || []).map(item => {
      const clip = resolveClip(body.clips!, item.clip); if (!clip) return null; const found = existing.find(x => x.clip === clip); if (!found) return null;
      const timestamp = Number(item.timestampSeconds); const hasRange = Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds) && Number(item.endSeconds) > Number(item.startSeconds);
      const start = hasRange ? Number(item.startSeconds) : Number.isFinite(timestamp) ? Math.max(0, timestamp - 1.5) : 0; const end = hasRange ? Number(item.endSeconds) : Number.isFinite(timestamp) ? timestamp + 2.5 : 8;
      return { input: found.filePath, start: Math.max(0, start), end: Math.max(start + 0.25, end) };
    }).filter(Boolean) as Array<{ input: string; start: number; end: number }>;

    // Never silently render the original footage. A successful AI render must contain
    // at least one valid segment from the AI plan.
    if (!planParts.length) {
      return NextResponse.json({ error: "AI did not return any valid video cuts. The original footage was not rendered as a fallback. Please retry the AI edit." }, { status: 422 });
    }

    const captions = (body.plan?.captions || []).filter(c => c.text).map(c => c.text!.trim()).filter(Boolean);
    const fallbackCaption = captions.length ? captions[0] : body.plan?.captionIdeas?.[0]; const hook = body.plan?.hook?.trim();
    const tempFiles: string[] = [];

    try {
      for (let i = 0; i < planParts.length; i++) {
        const temp = path.join(tempDir, `${body.orderId}-${crypto.randomUUID()}-${i}.mp4`);
        await renderSegment(planParts[i].input, temp, planParts[i].start, planParts[i].end, i === 0 ? hook : undefined, captions[i] || (i === 0 ? fallbackCaption : undefined), finalQuality);
        tempFiles.push(temp);
      }

      if (tempFiles.length === 1) {
        await writeFile(outputPath, await readFile(tempFiles[0]));
      } else {
        // Re-encode during concatenation so segments with different timestamps/codecs
        // cannot fail silently and leave us tempted to fall back to the source footage.
        const listPath = path.join(tempDir, `${body.orderId}-${crypto.randomUUID()}.txt`);
        await writeFile(listPath, tempFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
        try {
          await runFfmpeg([
            "-y", "-f", "concat", "-safe", "0", "-i", listPath,
            "-c:v", "libx264", "-preset", finalQuality ? "medium" : "veryfast",
            "-crf", finalQuality ? "20" : "24", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", finalQuality ? "192k" : "128k", "-ar", "48000",
            "-movflags", "+faststart", outputPath,
          ]);
        } finally { await rm(listPath, { force: true }); }
      }
    } catch (error) {
      for (const file of tempFiles) await rm(file, { force: true });
      await rm(outputPath, { force: true });
      const message = error instanceof Error ? error.message : "AI segment rendering failed.";
      return NextResponse.json({ error: `AI ${outputType} render failed. ${message}` }, { status: 500 });
    }

    for (const file of tempFiles) await rm(file, { force: true });
    return NextResponse.json({ ok: true, status: "ready", url: `/api/render/file?name=${encodeURIComponent(outputName)}`, outputName, outputType, usedAiCuts: true, aiCutCount: planParts.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Render failed." }, { status: 500 });
  }
}
