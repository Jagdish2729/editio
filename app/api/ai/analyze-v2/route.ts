import { NextResponse } from "next/server";
import type { VideoFrame } from "../../../../lib/video-analysis";

export const runtime = "nodejs";

type AnalyzeRequest = {
  orderId: string;
  editType: string;
  format: string;
  vibe: string;
  category: string;
  creativeDirection: string;
  hookEnabled?: boolean;
  hookText?: string;
  reference?: string;
  frames: VideoFrame[];
};

type RawPlan = {
  visualSummary?: string;
  bestMoments?: Array<{ clip?: string; timestampSeconds?: number; reason?: string }>;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  hook?: string;
  clipSequence?: Array<{ clip?: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number; reason?: string }>;
  captions?: unknown[];
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

function clipKey(value: string) { return value.trim().toLowerCase().replace(/\\/g, "/").split("/").pop() || ""; }
function clipStem(value: string) { return clipKey(value).replace(/\.[a-z0-9]{2,5}$/i, ""); }

function resolveClipName(value: string | undefined, knownClips: string[]) {
  if (!value) return null;
  const exact = knownClips.find(name => name === value);
  if (exact) return exact;
  const key = clipKey(value);
  const byKey = knownClips.find(name => clipKey(name) === key);
  if (byKey) return byKey;
  const stem = clipStem(value);
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
  const durations = new Map<string, number>();
  for (const frame of body.frames) durations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = Array.from(durations.keys());

  // Some model responses put their strongest selections in bestMoments but leave
  // clipSequence empty. Convert those anchors into usable cuts instead of failing
  // an otherwise valid AI response.
  const rawSequence = raw.clipSequence?.length
    ? raw.clipSequence
    : (raw.bestMoments || []).map(moment => ({
        clip: moment.clip,
        timestampSeconds: moment.timestampSeconds,
        reason: moment.reason || "Selected as a strong moment."
      }));

  const sequence = rawSequence
    .map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || undefined }))
    .filter(item => item.clip)
    .slice(0, 8)
    .map(item => {
      const duration = durations.get(item.clip!) || 0;
      const anchor = Number(item.timestampSeconds);
      let start = Number(item.startSeconds);
      let end = Number(item.endSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        const safeAnchor = Number.isFinite(anchor) ? anchor : duration * 0.5;
        start = Math.max(0, safeAnchor - 1.25);
        end = Math.min(duration || safeAnchor + 2, safeAnchor + 2);
      }
      start = Math.max(0, Math.min(start, Math.max(0, duration - 0.3)));
      end = Math.max(start + 0.75, Math.min(end, duration || end));
      return {
        ...item,
        startSeconds: Number(start.toFixed(2)),
        endSeconds: Number(end.toFixed(2)),
        timestampSeconds: Number.isFinite(anchor) ? Number(anchor.toFixed(2)) : Number(((start + end) / 2).toFixed(2)),
        reason: item.reason || "Selected for the story."
      };
    })
    .filter(item => Number(item.endSeconds) > Number(item.startSeconds));

  const total = sequence.reduce((sum, item) => sum + Number(item.endSeconds) - Number(item.startSeconds), 0);
  return {
    visualSummary: raw.visualSummary || "AI-selected first-cut Reel based on the supplied footage.",
    bestMoments: (raw.bestMoments || []).slice(0, 8).map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || item.clip })).filter(item => knownClips.includes(item.clip || "")) as RawPlan["bestMoments"],
    targetDurationSeconds: Math.max(6, Math.min(24, Math.round(total || Number(raw.targetDurationSeconds) || 12))),
    aspectRatio: "9:16",
    hook: body.hookEnabled ? (body.hookText || "").trim().slice(0, 90) : "",
    clipSequence: sequence,
    captions: [],
    captionIdeas: [],
    transitions: raw.transitions || [],
    transitionDirection: raw.transitionDirection || "Purposeful hard cuts with momentum",
    audioDirection: "Keep original source audio. No added music.",
    colorDirection: raw.colorDirection || "Clean, natural and consistent.",
    ending: raw.ending || "End on the strongest meaningful moment; never use an accidental tail or phone UI."
  };
}

function isPlaceholderKey(key: string | undefined) {
  if (!key) return true;
  const value = key.trim().toLowerCase();
  return value === "your_api_key_here" || value.includes("your_api_key") || value.includes("replace_with");
}
function transient(status: number) { return [429, 500, 502, 503, 504].includes(status); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

const prompt = (body: AnalyzeRequest, frameText: string) => `You are EDITIO's senior short-form video editor. Make an intentional edit from the actual supplied frames. You are NOT making a generic montage.

CREATOR INPUT
Edit type: ${body.editType}
Format: ${body.format}
Vibe: ${body.vibe}
Category: ${body.category}
Creative direction: ${body.creativeDirection}
Hook enabled: ${body.hookEnabled ? "YES" : "NO"}
Creator hook: ${body.hookEnabled ? `USE THIS EXACT TEXT: "${body.hookText || ""}"` : "NO HOOK"}
Reference: ${body.reference || "None"}

FOOTAGE MAP
${frameText}

NON-NEGOTIABLE EDITING BRAIN
1. Inspect every supplied frame before deciding the sequence.
2. Story/payoff is more important than picking visually clear frames.
3. Prefer a 10–24 second Reel, but NEVER pad weak footage. A short excellent Reel beats a long weak one.
4. Usually use 4–8 purposeful segments. Use 0.8–4 seconds per segment based on actual action; do not force identical durations.
5. Open with the strongest attention-grabbing visual. It may come from the middle/end of a source clip.
6. Build a real progression: hook/setup → build/action → payoff/reaction/ending. Skip unsupported stages.
7. Remove dead air, awkward pauses, repeated frames, empty/black frames, menus, screen recordings, phone UI, control-center overlays and accidental tails.
8. Never repeat the same visual moment unless repetition has a clear editorial purpose.
9. If two adjacent selections are visually almost identical, keep the stronger one and choose a different moment.
10. Follow the CATEGORY and the final CREATIVE DIRECTION supplied by the creator. Treat the creative direction as an editable production brief, not a suggestion.
11. Never invent people, dialogue, scores, products, locations, actions, results or events. Only claim what the frames support.
12. Every clipSequence clip MUST be an EXACT filename from the FOOTAGE MAP. Never invent or abbreviate filenames.
13. Every clipSequence item MUST have valid SOURCE-video startSeconds and endSeconds inside that clip's duration.
14. timestampSeconds is the visual anchor for the chosen source moment.
15. No captions or caption ideas. EDITIO currently has only an optional creator-written hook overlay.
16. No music. Preserve original audio.
17. If a source contains a phone UI/control center/screen recording, treat those frames as unusable even if they are sharp.
18. The last selected segment MUST be a meaningful payoff/ending. Never end on a screen recording or accidental footage.
19. ${body.hookEnabled ? `Use the creator's exact hook text as the hook. Do not rewrite it or add claims.` : "Return an empty hook."}

CATEGORY PRIORITIES
Cricket: when visible, prioritize reaction/setup → bowler/run-up → release → batting action/contact → result → meaningful reaction. Reject phone UI and dead tails. Never invent score, wicket, shot type or outcome.
Fashion: outfit reveal → movement → detail → strongest final look.
Travel: establishing view → movement/experience → location detail → memorable ending.
Food: preparation/action → texture/detail → reveal → hero shot.
Fitness: setup → strongest movement/effort → result/reaction.
Beauty: before/application → action/detail → finished look.
Lifestyle: visually interesting moments forming a natural mini-story.
Gaming: gameplay action → tension → clear payoff/reaction; reject menus/UI-only frames.
Business: useful/product/work/talking moments → credible payoff; no invented claims.
Other: follow the creator's custom creative direction exactly.

RETURN JSON ONLY
{
  "visualSummary":"what the footage actually supports",
  "bestMoments":[{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific reason"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"exact creator hook or empty string",
  "clipSequence":[{"clip":"EXACT filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"reason":"specific editorial reason"}],
  "captions":[],
  "captionIdeas":[],
  "transitions":[{"afterClip":"EXACT filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"string",
  "audioDirection":"Keep source audio only",
  "colorDirection":"string",
  "ending":"specific reason the final moment works"
}`;

function geminiPart(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s);
  return match ? { inline_data: { mime_type: match[1], data: match[2] } } : null;
}

async function gemini(body: AnalyzeRequest, key: string, model: string) {
  const frames = body.frames.slice(0, 18);
  const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const parts: Array<Record<string, unknown>> = [{ text: prompt(body, frameText) }];
  for (const frame of frames) { const part = geminiPart(frame.imageDataUrl); if (part) parts.push(part); }

  let last = "Gemini analysis failed.";
  // High-demand responses are transient. Give the provider a little room to
  // recover, but keep the retry bounded so one user action cannot loop forever.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.12, responseMimeType: "application/json" } })
      });
      const data = await response.json();
      if (!response.ok) {
        last = data?.error?.message || `Gemini failed (HTTP ${response.status}).`;
        if (attempt < 3 && transient(response.status)) {
          await sleep(attempt === 1 ? 2500 : 6000);
          continue;
        }
        throw new Error(last);
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty analysis.");
      return parseJson(text);
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      if (attempt < 3 && /fetch failed|timeout|timed out/i.test(last)) {
        await sleep(attempt === 1 ? 2500 : 6000);
        continue;
      }
      throw new Error(last);
    }
  }
  throw new Error(last);
}

async function openai(body: AnalyzeRequest, key: string, model: string) {
  const frames = body.frames.slice(0, 18);
  const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt(body, frameText) }];
  for (const frame of frames) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl, detail: "low" } });
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.12, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are EDITIO's precise senior video editor. Return only JSON." }, { role: "user", content }] }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI failed (HTTP ${response.status}).`);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty analysis.");
  return parseJson(text);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AnalyzeRequest;
    if (!body.orderId || !Array.isArray(body.frames) || !body.frames.length) return NextResponse.json({ error: "AI analysis needs an order and video frames." }, { status: 400 });
    const provider = (process.env.EDITIO_AI_PROVIDER || "gemini").trim().toLowerCase();
    const fallback = process.env.EDITIO_AI_FALLBACK !== "false";
    const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
    const model = provider === "openai" ? (process.env.OPENAI_MODEL || "gpt-4o-mini") : (process.env.GEMINI_MODEL || "gemini-3.8-flash");
    if (isPlaceholderKey(key)) {
      return NextResponse.json({ error: `${provider === "openai" ? "OpenAI" : "Gemini"} API key is missing. Add it to .env.local and restart the dev server.` }, { status: 500 });
    }
    try {
      const raw = provider === "openai" ? await openai(body, key!, model) : await gemini(body, key!, model);
      const plan = normalisePlan(raw, body);
      if (!plan.clipSequence?.length) return NextResponse.json({ error: "AI could not find any usable video moments. Please use the single retry." }, { status: 422 });
      return NextResponse.json({ ok: true, plan, provider, model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI analysis failed.";
      if (fallback) return NextResponse.json({ error: message }, { status: 502 });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid AI analysis request." }, { status: 500 });
  }
}
