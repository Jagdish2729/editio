import { NextResponse } from "next/server";
import type { VideoFrame } from "../../../../lib/video-analysis";

export const runtime = "nodejs";

type AnalyzeRequest = {
  orderId: string;
  editType: string;
  format: string;
  vibe: string;
  brief: string;
  reference?: string;
  includeHook?: boolean;
  includeCaptions?: boolean;
  frames: VideoFrame[];
};

type RawPlan = {
  visualSummary?: string;
  bestMoments?: Array<{ clip?: string; timestampSeconds?: number; reason?: string }>;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  hook?: string;
  clipSequence?: Array<{ clip?: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number; reason?: string }>;
  captions?: Array<{ text?: string; placement?: string; style?: string; startSeconds?: number; endSeconds?: number }>;
  captionIdeas?: string[];
  transitions?: Array<{ afterClip?: string; type?: string }>;
  transitionDirection?: string;
  audioDirection?: string;
  colorDirection?: string;
  ending?: string;
};

function parseJson(text: string): RawPlan {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as RawPlan;
}

function localDraftPlan(body: AnalyzeRequest) {
  const grouped = new Map<string, VideoFrame[]>();
  for (const frame of body.frames) grouped.set(frame.clipName, [...(grouped.get(frame.clipName) || []), frame]);
  const candidates = Array.from(grouped.entries()).flatMap(([clip, frames]) => {
    const picks = frames.length > 2 ? [frames[1], frames[Math.floor(frames.length / 2)], frames[frames.length - 2]] : frames;
    return picks.filter(Boolean).map((frame, index) => ({
      clip,
      timestampSeconds: frame.timestampSeconds,
      startSeconds: Math.max(0, frame.timestampSeconds - (index === 0 ? 1.2 : 1.5)),
      endSeconds: Math.min(frame.durationSeconds, frame.timestampSeconds + (index === 2 ? 1.8 : 2.2)),
      reason: "Development fallback selected a representative moment from the uploaded footage."
    }));
  });
  const clipSequence = candidates.slice(0, 8);
  return {
    visualSummary: "Development fallback montage. Connect a real vision-capable model for content-aware selection.",
    bestMoments: clipSequence.map(item => ({ clip: item.clip, timestampSeconds: item.timestampSeconds, reason: item.reason })),
    targetDurationSeconds: Math.max(6, Math.min(24, clipSequence.reduce((sum, item) => sum + (item.endSeconds - item.startSeconds), 0))),
    aspectRatio: "9:16",
    hook: body.includeHook ? (body.brief ? body.brief.slice(0, 60) : "Wait for this") : "",
    clipSequence,
    captions: body.includeCaptions ? [{ text: body.brief ? body.brief.slice(0, 55) : "Watch this", placement: "bottom", style: "bold", startSeconds: 0, endSeconds: 3 }] : [],
    captionIdeas: body.includeCaptions ? [body.brief ? body.brief.slice(0, 55) : "Watch this"] : [],
    transitions: [],
    transitionDirection: "Hard cuts with momentum",
    audioDirection: "Keep source audio only. No music added by EDITIO.",
    colorDirection: "Natural source look with a clean, consistent grade.",
    ending: "Finish on the strongest available moment and avoid dead air."
  };
}

function isPlaceholderKey(key: string | undefined) {
  if (!key) return true;
  const normalized = key.trim().toLowerCase();
  return normalized === "your_api_key_here" || normalized.includes("your_api_key") || normalized.includes("replace_with");
}

function normalisePlan(raw: RawPlan, body: AnalyzeRequest): RawPlan {
  const clipDurations = new Map<string, number>();
  for (const frame of body.frames) clipDurations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = new Set(clipDurations.keys());

  const sequence = (raw.clipSequence || []).filter(item => item.clip && knownClips.has(item.clip)).slice(0, 8).map(item => {
    const duration = clipDurations.get(item.clip!) || 0;
    const anchor = Number(item.timestampSeconds);
    let start = Number(item.startSeconds);
    let end = Number(item.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      const safeAnchor = Number.isFinite(anchor) ? anchor : duration * 0.5;
      start = Math.max(0, safeAnchor - 1.5);
      end = Math.min(duration || safeAnchor + 2.5, safeAnchor + 2.5);
    }
    start = Math.max(0, Math.min(start, Math.max(0, duration - 0.25)));
    end = Math.max(start + 0.75, Math.min(end, duration || end));
    return {
      ...item,
      startSeconds: Number(start.toFixed(2)),
      endSeconds: Number(end.toFixed(2)),
      timestampSeconds: Number.isFinite(anchor) ? Number(anchor.toFixed(2)) : Number(((start + end) / 2).toFixed(2)),
      reason: item.reason || "Selected as a strong visual moment."
    };
  }).filter(item => Number(item.endSeconds) > Number(item.startSeconds));

  const target = sequence.reduce((sum, item) => sum + Number(item.endSeconds) - Number(item.startSeconds), 0);
  const captions = body.includeCaptions ? (raw.captions || []).filter(item => item.text).slice(0, 5).map(item => ({
    text: String(item.text).trim().slice(0, 90),
    placement: ["top", "center", "bottom"].includes(String(item.placement)) ? String(item.placement) : "bottom",
    style: item.style === "clean" ? "clean" : "bold",
    startSeconds: Math.max(0, Number(item.startSeconds) || 0),
    endSeconds: Math.max(0.5, Number(item.endSeconds) || 3)
  })) : [];

  return {
    ...raw,
    visualSummary: raw.visualSummary || "AI-selected short-form edit from the supplied footage.",
    targetDurationSeconds: Math.max(6, Math.min(24, Math.round(target || Number(raw.targetDurationSeconds) || 15))),
    aspectRatio: "9:16",
    hook: body.includeHook ? String(raw.hook || "").trim().slice(0, 70) : "",
    clipSequence: sequence,
    captions,
    captionIdeas: body.includeCaptions ? (raw.captionIdeas || []).slice(0, 6) : [],
    transitions: raw.transitions || [],
    transitionDirection: raw.transitionDirection || "Hard cuts with momentum",
    audioDirection: "Keep source audio only. No music added by EDITIO.",
    colorDirection: raw.colorDirection || "Clean, consistent source grade.",
    ending: raw.ending || "End on the strongest moment without dead air."
  };
}

const EDITOR_PROMPT = (body: AnalyzeRequest, frameText: string) => {
  const hookInstruction = body.includeHook
    ? "Create one short hook (maximum 7 words) for the first 2–3 seconds. It must match the actual footage/brief; do not invent a claim."
    : "Do not add an opening hook.";
  const captionInstruction = body.includeCaptions
    ? "Create 1–5 short caption lines. Their startSeconds/endSeconds are TIMELINE positions in the final reel, not source-video positions. Keep each line punchy and readable."
    : "Do not add on-screen captions.";

  return `You are EDITIO's senior short-form video editor. You are given sampled frames from the creator's actual uploaded clips. Your job is to design a genuinely useful first-cut Reel, not a generic montage.

CREATOR REQUEST
- Edit type: ${body.editType}
- Format: ${body.format}
- Vibe: ${body.vibe}
- Brief: ${body.brief || "No extra brief. Use the selected vibe."}
- Reference: ${body.reference || "None"}
- Hook requested: ${body.includeHook ? "YES" : "NO"}
- Captions requested: ${body.includeCaptions ? "YES" : "NO"}

FOOTAGE MAP
${frameText}

EDITING RULES
1. Visually inspect every supplied frame. Choose moments that are actually supported by the images.
2. Build a 12–24 second short-form sequence when the footage allows it. Prefer 4–8 purposeful segments, usually 1.5–4 seconds each.
3. Start with the strongest attention-grabbing visual, not automatically the first source clip.
4. Remove obvious dead space. Vary shot selection and avoid repeating the same moment unless it serves the story.
5. Use the creator's brief and vibe as the primary creative direction; do not blindly apply generic trends.
6. Every clipSequence item MUST include startSeconds and endSeconds using the SOURCE clip's timeline. They should surround the chosen visual moment and stay inside that clip's duration.
7. timestampSeconds is the visual anchor for the selected moment.
8. The sequence should have a clear opening, build/middle and satisfying ending. Explain why each chosen moment is there.
9. Do not invent dialogue, actions, people, scores, locations or objects that are not visible in the supplied frames.
10. No music. Preserve the creator's original audio.
11. ${hookInstruction}
12. ${captionInstruction}
13. Keep captions away from the extreme bottom UI area. Prefer bottom/center with concise text.
14. If the footage is weak, still make the best honest edit possible rather than fabricating a stronger moment.

RETURN JSON ONLY:
{
  "visualSummary":"brief description of what the footage supports",
  "bestMoments":[{"clip":"filename","timestampSeconds":number,"reason":"why this moment is strong"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"short string or empty",
  "clipSequence":[{"clip":"filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"reason":"editing reason"}],
  "captions":[{"text":"string","placement":"top|center|bottom","style":"bold|clean","startSeconds":number,"endSeconds":number}],
  "captionIdeas":["string"],
  "transitions":[{"afterClip":"filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"string",
  "audioDirection":"Keep source audio only",
  "colorDirection":"string",
  "ending":"string"
}`;
};

function dataUrlToGeminiPart(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s);
  if (!match) return null;
  return {
    inline_data: {
      mime_type: match[1],
      data: match[2]
    }
  };
}

async function analyzeWithGemini(body: AnalyzeRequest, apiKey: string, model: string) {
  const frameList = body.frames.slice(0, 18);
  const frameText = frameList.map((frame, index) => `Frame ${index + 1}: clip=${frame.clipName}, time=${frame.timestampSeconds}s, clipDuration=${frame.durationSeconds}s`).join("\n");
  const parts: Array<Record<string, unknown>> = [{ text: EDITOR_PROMPT(body, frameText) }];

  for (const frame of frameList) {
    const imagePart = dataUrlToGeminiPart(frame.imageDataUrl);
    if (imagePart) parts.push(imagePart);
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini analysis failed.");

  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty analysis.");
  return parseJson(text);
}

async function analyzeWithOpenAI(body: AnalyzeRequest, apiKey: string, model: string) {
  const frameList = body.frames.slice(0, 18);
  const frameText = frameList.map((frame, index) => `Frame ${index + 1}: clip=${frame.clipName}, time=${frame.timestampSeconds}s, clipDuration=${frame.durationSeconds}s`).join("\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: EDITOR_PROMPT(body, frameText) }];
  for (const frame of frameList) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl, detail: "low" } });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a meticulous professional Reels editor. Make decisions from the supplied images and metadata only. Return valid JSON only." },
        { role: "user", content }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI analysis failed.");
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned an empty analysis.");
  return parseJson(text);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    if (!body.orderId || !body.format || !body.vibe || !body.frames?.length) {
      return NextResponse.json({ error: "Missing edit brief or video frames." }, { status: 400 });
    }

    // Gemini is the default provider for EDITIO's visual planning. OpenAI remains
    // available as a provider option so we can compare quality without rewriting the pipeline.
    const provider = (process.env.EDITIO_AI_PROVIDER || "gemini").trim().toLowerCase();
    const useLocalFallback = process.env.EDITIO_AI_FALLBACK !== "false";
    const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;

    if (isPlaceholderKey(apiKey)) {
      if (!useLocalFallback) {
        return NextResponse.json({
          error: provider === "openai"
            ? "OPENAI_API_KEY is not configured. Add a real API key to .env.local."
            : "GEMINI_API_KEY is not configured. Add a real Gemini API key to .env.local."
        }, { status: 503 });
      }
      return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", provider, fallback: true });
    }

    const model = provider === "openai"
      ? (process.env.OPENAI_MODEL || "gpt-4o-mini")
      : (process.env.GEMINI_MODEL || "gemini-2.5-flash");

    try {
      const rawPlan = provider === "openai"
        ? await analyzeWithOpenAI(body, apiKey!, model)
        : await analyzeWithGemini(body, apiKey!, model);
      const plan = normalisePlan(rawPlan, body);
      return NextResponse.json({ ok: true, plan, model, provider, fallback: false });
    } catch (error) {
      if (useLocalFallback) {
        return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", provider, fallback: true, aiError: error instanceof Error ? error.message : "AI analysis failed." });
      }
      return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed." }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed." }, { status: 500 });
  }
}
