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
    captions: [],
    captionIdeas: [],
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

function clipKey(value: string) {
  return value.trim().toLowerCase().replace(/\\/g, "/").split("/").pop() || "";
}

function clipStem(value: string) {
  return clipKey(value).replace(/\.[a-z0-9]{2,5}$/i, "");
}

function resolveClipName(value: string | undefined, knownClips: string[]) {
  if (!value) return null;
  const exact = knownClips.find(name => name === value);
  if (exact) return exact;
  const key = clipKey(value);
  const stem = clipStem(value);
  const byKey = knownClips.find(name => clipKey(name) === key);
  if (byKey) return byKey;
  const byStem = knownClips.find(name => clipStem(name) === stem);
  if (byStem) return byStem;
  const match = key.match(/^(?:clip|video)[ _-]?(\d+)$/i);
  if (match) {
    const index = Number(match[1]) - 1;
    if (knownClips[index]) return knownClips[index];
  }
  if (knownClips.length === 1) return knownClips[0];
  return null;
}

function normalisePlan(raw: RawPlan, body: AnalyzeRequest): RawPlan {
  const clipDurations = new Map<string, number>();
  for (const frame of body.frames) clipDurations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = Array.from(clipDurations.keys());
  const sequence = (raw.clipSequence || [])
    .map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || undefined }))
    .filter(item => item.clip)
    .slice(0, 8)
    .map(item => {
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
    })
    .filter(item => Number(item.endSeconds) > Number(item.startSeconds));
  const target = sequence.reduce((sum, item) => sum + Number(item.endSeconds) - Number(item.startSeconds), 0);
  return {
    ...raw,
    visualSummary: raw.visualSummary || "AI-selected short-form edit from the supplied footage.",
    targetDurationSeconds: Math.max(6, Math.min(24, Math.round(target || Number(raw.targetDurationSeconds) || 15))),
    aspectRatio: "9:16",
    hook: body.includeHook ? String(raw.hook || "").trim().slice(0, 70) : "",
    clipSequence: sequence,
    captions: [],
    captionIdeas: [],
    transitions: raw.transitions || [],
    transitionDirection: raw.transitionDirection || "Hard cuts with momentum",
    audioDirection: "Keep source audio only. No music added by EDITIO.",
    colorDirection: raw.colorDirection || "Clean, consistent source grade.",
    ending: raw.ending || "End on the strongest moment without dead air."
  };
}

const EDITOR_PROMPT = (body: AnalyzeRequest, frameText: string) => {
  const hookInstruction = body.includeHook
    ? "Use the creator's hook text EXACTLY as supplied in the brief. Do not rewrite it, add another hook, or invent a claim."
    : "Do not add an opening hook.";
  return `You are EDITIO's senior short-form video editor. You are given sampled frames from the creator's actual uploaded clips. Design a genuinely useful first-cut Reel, not a generic montage.

CREATOR REQUEST
- Edit type: ${body.editType}
- Format: ${body.format}
- Vibe: ${body.vibe}
- Creative direction: ${body.brief || "No extra direction. Use the selected vibe."}
- Reference: ${body.reference || "None"}
- Hook requested: ${body.includeHook ? "YES" : "NO"}

FOOTAGE MAP
${frameText}

EDITING RULES
1. Inspect every supplied frame and make decisions from the actual footage.
2. Build a 12–24 second Reel when the footage allows it. Prefer 4–8 purposeful segments, usually 1.0–3.5 seconds each.
3. Start with the strongest attention-grabbing visual.
4. Build a clear setup -> action -> payoff/story arc whenever the footage supports it.
5. Remove dead space, repeated visuals, weak reaction shots, black frames, phone UI, screen recordings, menus, control centers, accidental camera-down footage and obvious unusable tails.
6. Avoid using two near-identical moments back-to-back.
7. For sports footage, prioritize the actual action: setup, run-up/approach, release, contact/action, result and reaction when visible. Never claim a score/result that is not visible.
8. For fashion/beauty, prioritize reveal, strongest pose/detail, movement and final look. For travel, prioritize establishing shot, movement, location detail and strongest payoff. For food, prioritize preparation/action, hero shot and final result. For fitness, prioritize setup, movement peak and result. For gaming, prioritize gameplay action and payoff. These are guidelines, not excuses to invent footage.
9. The creator's custom direction is authoritative and may override category defaults.
10. Every clipSequence item MUST use the EXACT clip filename from the FOOTAGE MAP. Do not invent, abbreviate or rename filenames.
11. Every clipSequence item MUST include source startSeconds and endSeconds inside that clip's duration.
12. timestampSeconds is the visual anchor for the selected moment.
13. Do not invent dialogue, actions, people, scores, locations or objects.
14. Preserve original source audio only. No music.
15. ${hookInstruction}
16. End on a meaningful visual payoff, never a screen recording/control center/dead frame.

RETURN JSON ONLY:
{
  "visualSummary":"brief description",
  "bestMoments":[{"clip":"EXACT filename","timestampSeconds":number,"reason":"why this moment is strong"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"string or empty",
  "clipSequence":[{"clip":"EXACT filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"reason":"editing reason"}],
  "captions":[],
  "captionIdeas":[],
  "transitions":[{"afterClip":"EXACT filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"string",
  "audioDirection":"Keep source audio only",
  "colorDirection":"string",
  "ending":"string"
}`;
};

function dataUrlToGeminiPart(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s);
  if (!match) return null;
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

function isTransientStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeWithGemini(body: AnalyzeRequest, apiKey: string, model: string) {
  const frameList = body.frames.slice(0, 18);
  const frameText = frameList.map((frame, index) => `Frame ${index + 1}: clip=${frame.clipName}, time=${frame.timestampSeconds}s, clipDuration=${frame.durationSeconds}s`).join("\n");
  const parts: Array<Record<string, unknown>> = [{ text: EDITOR_PROMPT(body, frameText) }];
  for (const frame of frameList) {
    const imagePart = dataUrlToGeminiPart(frame.imageDataUrl);
    if (imagePart) parts.push(imagePart);
  }

  let lastError = "Gemini analysis failed.";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.15, responseMimeType: "application/json" }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini analysis failed (HTTP ${response.status}).`;
        if (attempt === 1 && isTransientStatus(response.status)) {
          await sleep(response.status === 429 ? 4000 : 2500);
          continue;
        }
        throw new Error(lastError);
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty analysis.");
      return parseJson(text);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt === 1 && /fetch failed|timed out|timeout/i.test(lastError)) {
        await sleep(2500);
        continue;
      }
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
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
    const provider = (process.env.EDITIO_AI_PROVIDER || "gemini").trim().toLowerCase();
    const useLocalFallback = process.env.EDITIO_AI_FALLBACK !== "false";
    const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
    if (isPlaceholderKey(apiKey)) {
      if (!useLocalFallback) {
        return NextResponse.json({ error: provider === "openai" ? "OPENAI_API_KEY is not configured. Add a real API key to .env.local." : "GEMINI_API_KEY is not configured. Add a real Gemini API key to .env.local." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", provider, fallback: true });
    }
    const model = provider === "openai" ? (process.env.OPENAI_MODEL || "gpt-4o-mini") : (process.env.GEMINI_MODEL || "gemini-3.8-flash");
    try {
      const rawPlan = provider === "openai" ? await analyzeWithOpenAI(body, apiKey!, model) : await analyzeWithGemini(body, apiKey!, model);
      const plan = normalisePlan(rawPlan, body);
      if (!plan.clipSequence?.length) return NextResponse.json({ error: "AI returned a plan, but no usable video cuts could be mapped to the uploaded footage. Please retry the AI edit." }, { status: 422 });
      return NextResponse.json({ ok: true, plan, model, provider, fallback: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI analysis failed.";
      if (useLocalFallback) return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", provider, fallback: true, aiError: message });
      const busy = /high demand|spikes in demand|too many requests|rate limit|quota|429/i.test(message);
      return NextResponse.json({ error: busy ? "Gemini is temporarily busy. EDITIO already waited and retried once. Please try your available EDITIO retry again in a moment." : message }, { status: busy ? 503 : 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed." }, { status: 500 });
  }
}
