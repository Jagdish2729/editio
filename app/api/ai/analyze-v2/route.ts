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

type Moment = { clip?: string; timestampSeconds?: number; reason?: string };
type RawPlan = {
  visualSummary?: string;
  heroMoment?: Moment;
  bestMoments?: Moment[];
  targetDurationSeconds?: number;
  aspectRatio?: string;
  hook?: string;
  clipSequence?: Array<{
    clip?: string;
    startSeconds?: number;
    endSeconds?: number;
    timestampSeconds?: number;
    reason?: string;
    speed?: number;
    zoom?: number;
    zoomDirection?: "in" | "out" | "none";
  }>;
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
  const exact = knownClips.find(name => name === value); if (exact) return exact;
  const key = clipKey(value); const byKey = knownClips.find(name => clipKey(name) === key); if (byKey) return byKey;
  const stem = clipStem(value); const byStem = knownClips.find(name => clipStem(name) === stem); if (byStem) return byStem;
  const match = key.match(/^(?:clip|video)[ _-]?(\d+)$/i);
  if (match) { const index = Number(match[1]) - 1; if (knownClips[index]) return knownClips[index]; }
  return knownClips.length === 1 ? knownClips[0] : null;
}

function normalisePlan(raw: RawPlan, body: AnalyzeRequest): RawPlan {
  const durations = new Map<string, number>();
  for (const frame of body.frames) durations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = Array.from(durations.keys());

  const rawSequence = raw.clipSequence?.length ? raw.clipSequence : (raw.bestMoments || []).map(moment => ({
    clip: moment.clip, timestampSeconds: moment.timestampSeconds, reason: moment.reason || "Selected as a strong moment."
  }));

  const makeItem = (item: NonNullable<RawPlan["clipSequence"]>[number]) => {
    const clip = resolveClipName(item.clip, knownClips);
    if (!clip) return null;
    const duration = durations.get(clip) || 0;
    const anchor = Number(item.timestampSeconds);
    let start = Number(item.startSeconds), end = Number(item.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      const safeAnchor = Number.isFinite(anchor) ? anchor : duration * 0.5;
      start = Math.max(0, safeAnchor - 1.25); end = Math.min(duration || safeAnchor + 2, safeAnchor + 2);
    }
    start = Math.max(0, Math.min(start, Math.max(0, duration - 0.3)));
    end = Math.max(start + 0.75, Math.min(end, duration || end));
    const requestedSpeed = Number(item.speed);
    const speed = Number.isFinite(requestedSpeed) ? Math.max(0.65, Math.min(1.35, requestedSpeed)) : 1;
    const requestedZoom = Number(item.zoom);
    const zoom = Number.isFinite(requestedZoom) ? Math.max(1, Math.min(1.12, requestedZoom)) : 1;
    const zoomDirection = item.zoomDirection === "in" || item.zoomDirection === "out" ? item.zoomDirection : "none";
    return { ...item, clip, startSeconds: Number(start.toFixed(2)), endSeconds: Number(end.toFixed(2)), timestampSeconds: Number.isFinite(anchor) ? Number(anchor.toFixed(2)) : Number(((start + end) / 2).toFixed(2)), reason: item.reason || "Selected for the story.", speed: Number(speed.toFixed(2)), zoom: Number(zoom.toFixed(2)), zoomDirection };
  };

  let sequence = rawSequence.map(makeItem).filter(Boolean) as NonNullable<RawPlan["clipSequence"]>;

  // The hero moment is mandatory. If the model identified one but forgot to put it in
  // the sequence, inject it near the ending so the actual payoff can never disappear.
  const heroClip = resolveClipName(raw.heroMoment?.clip, knownClips);
  const heroTime = Number(raw.heroMoment?.timestampSeconds);
  if (heroClip && Number.isFinite(heroTime)) {
    const hasHero = sequence.some(item => item.clip === heroClip && heroTime >= Number(item.startSeconds) - 0.35 && heroTime <= Number(item.endSeconds) + 0.35);
    if (!hasHero) {
      const hero = makeItem({ clip: heroClip, timestampSeconds: heroTime, startSeconds: heroTime - 1.0, endSeconds: heroTime + 1.5, speed: 0.78, zoom: 1.06, zoomDirection: "in", reason: raw.heroMoment?.reason || "Mandatory hero/payoff moment." });
      if (hero) {
        const insertAt = Math.max(0, sequence.length - 1);
        sequence = [...sequence.slice(0, insertAt), hero, ...sequence.slice(insertAt)].slice(0, 8);
      }
    }
  }

  const total = sequence.reduce((sum, item) => sum + ((Number(item.endSeconds) - Number(item.startSeconds)) / Math.max(0.65, Number(item.speed) || 1)), 0);
  const bestMoments = (raw.bestMoments || []).slice(0, 8).map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || item.clip })).filter(item => knownClips.includes(item.clip || "")) as RawPlan["bestMoments"];
  const normalisedHero = heroClip && Number.isFinite(heroTime) ? { clip: heroClip, timestampSeconds: Number(heroTime.toFixed(2)), reason: raw.heroMoment?.reason || "Mandatory hero/payoff moment." } : undefined;

  return {
    visualSummary: raw.visualSummary || "AI-selected first-cut Reel based on the supplied footage.",
    heroMoment: normalisedHero,
    bestMoments,
    targetDurationSeconds: Math.max(6, Math.min(24, Math.round(total || Number(raw.targetDurationSeconds) || 14))),
    aspectRatio: "9:16",
    hook: body.hookEnabled && (body.hookText || "").trim().split(/\s+/).length >= 4 ? (body.hookText || "").trim().slice(0, 90) : "",
    clipSequence: sequence,
    captions: [], captionIdeas: [], transitions: raw.transitions || [],
    transitionDirection: raw.transitionDirection || "Use clean, invisible-feeling cuts that preserve visual and audio continuity.",
    audioDirection: "Keep original source audio. No added music. Preserve continuity across clips.",
    colorDirection: raw.colorDirection || "Clean, natural and consistent across all source clips.",
    ending: raw.ending || "End on the strongest meaningful moment; never use an accidental tail or phone UI."
  };
}

function isPlaceholderKey(key: string | undefined) {
  if (!key) return true; const value = key.trim().toLowerCase();
  return value === "your_api_key_here" || value.includes("your_api_key") || value.includes("replace_with");
}
function transient(status: number) { return [429, 500, 502, 503, 504].includes(status); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

const prompt = (body: AnalyzeRequest, frameText: string) => `You are EDITIO's senior short-form video editor. Make an intentional, professional Reel from the actual supplied frames. You are NOT making a generic montage.

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

HERO MOMENT / MAIN EVENT — ABSOLUTE PRIORITY
Before building the sequence, inspect ALL frames and identify the single most important real event/payoff in the footage. Return it as heroMoment.
- The hero moment is NOT simply the prettiest, clearest, or most cinematic frame.
- It is the moment the viewer most needs to see to understand what actually happened.
- The hero moment MUST be included in clipSequence. It is never optional.
- Build the Reel around it: setup/build → action → HERO/PAYOFF → reaction/ending, whenever the footage supports those stages.
- If the hero happens late in a source clip, DO NOT stop the Reel before it. Reach the event.
- If a later clip contains the actual result/payoff of an earlier setup, prefer the later payoff even if its frames are less aesthetically pleasing.
- Never replace an actual event with a reaction shot when the actual event itself is visible.

For CRICKET specifically: an actual wicket, catch, boundary, big hit, dismissal, or clear result outranks run-up, generic bowling, batting stance, or celebration. If a wicket is visible, the wicket-taking action is the hero moment and MUST be shown. A celebration may follow it, but must not replace it.

NON-NEGOTIABLE EDITING BRAIN
1. Inspect every supplied frame before deciding the sequence.
2. Story/payoff is more important than visual beauty.
3. Prefer a 14–18 second Reel when enough meaningful footage exists. Use shorter output only when the footage genuinely does not support that duration. NEVER pad with weak footage.
4. Usually use 5–8 purposeful segments. Use roughly 0.8–3 seconds per segment, with longer coverage around the hero action when needed.
5. The sequence is editorial, not upload order. You decide which clip comes first, second, third, etc.
6. Open with a strong visual, then build toward the hero rather than spending the whole Reel on setup.
7. The hero/payoff should normally occur in the final third, followed by a short reaction/ending when available.
8. Remove dead air, awkward pauses, repeated frames, empty/black frames, menus, screen recordings, phone UI, control-center overlays and accidental tails.
9. Never repeat the same visual moment unless repetition has a clear editorial purpose.
10. Follow CATEGORY and CREATIVE DIRECTION exactly. Never invent people, dialogue, scores, locations, actions, results or events.
11. Every clipSequence clip MUST be an EXACT filename from the FOOTAGE MAP.
12. Every clipSequence item MUST have valid SOURCE-video startSeconds and endSeconds inside that clip's duration.
13. timestampSeconds is the visual anchor for the selected source moment.
14. No captions or caption ideas. Only use an optional creator-written hook overlay.
15. No music. Preserve original source audio.
16. The final selected segment must be a meaningful ending. Never end on an accidental tail or UI.
17. If the hook text is simple/short (under 4 words), return an empty hook instead of forcing it.

FRAMING / ZOOM — CRITICAL
18. Think about composition, not just clip selection. Before choosing a crop/zoom, make sure the viewer can understand the action.
19. For cricket/sports, NEVER punch in so aggressively that the bowler, batsman, ball/action area, wicket and relevant pitch context are lost. The key action must remain readable.
20. If the source framing is too tight, use a subtle ZOOM OUT / wider framing so the bowler + batsman + pitch/action area can be seen together. Context is more important than a dramatic crop.
21. If the source is already wide enough, keep zoom at 1.0. Do not zoom just for decoration.
22. Use subtle punch-ins only when they improve focus on a hero action/reaction and do not remove essential context. Prefer 1.03–1.10x.
23. Use zoomDirection "out" when more context needs to be visible, "in" for emphasis, and "none" when no reframing is needed.
24. A zoom decision must be based on what is actually visible in the source frame. Never crop out the subject needed to understand the event.

PRO EDITING EFFECTS — CRITICAL
25. Do NOT just join normal video clips. The final Reel must have intentional editorial movement and rhythm.
26. Use speed changes selectively: slow important impact/action/reaction moments around 0.65–0.85x; speed up dead/low-energy movement around 1.10–1.30x; keep normal moments at 1.0x.
27. Sports/action should often use slow motion around the key action/contact/result and slightly faster pacing around setup/run-up when supported.
28. Use roughly 1–3 speed changes and 1–3 subtle zoom moments across the whole Reel, not effects everywhere.
29. Never invent an action because an effect would look cool. Effects must follow what is actually visible.
30. Avoid flashy transitions, random shakes, excessive zooms, or gimmicks unless requested.

MULTI-CLIP CONTINUITY — CRITICAL
31. If 2+ clips are uploaded, edit them as ONE continuous Reel, not separate clips stitched together.
32. Do not make it feel like “Clip 1 finished → Clip 2 started → Clip 3 started.”
33. Choose cut points based on matching action, movement, subject position, direction, framing, energy, or story progression.
34. If one clip contains setup and another contains the actual payoff, cut from the setup into the payoff at the right moment. Do not discard the payoff just to keep the sequence short.
35. Do not automatically give every clip equal screen time. Use only what supports the story.
36. Preserve natural audio continuity and consistent 9:16 composition.

CATEGORY PRIORITIES
Cricket: setup/run-up → release → batting action/contact → RESULT/HERO → reaction. If wicket is visible, show the wicket-taking action itself. Slow the key action selectively and use subtle framing that keeps bowler, batsman, ball/action area and pitch context readable.
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
  "heroMoment":{"clip":"EXACT filename","timestampSeconds":number,"reason":"the actual main event/payoff and why it matters"},
  "bestMoments":[{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific reason"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"meaningful creator hook or empty string",
  "clipSequence":[{"clip":"EXACT filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"speed":number,"zoom":number,"zoomDirection":"in|out|none","reason":"specific editorial reason and how this cut connects to the next"}],
  "captions":[],
  "captionIdeas":[],
  "transitions":[{"afterClip":"EXACT filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"describe how to make the cuts feel seamless and continuous",
  "audioDirection":"Keep source audio only and describe continuity",
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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.12, responseMimeType: "application/json" } })
      });
      const data = await response.json();
      if (!response.ok) {
        last = data?.error?.message || `Gemini failed (HTTP ${response.status}).`;
        if (attempt < 3 && transient(response.status)) { await sleep(attempt === 1 ? 2500 : 6000); continue; }
        throw new Error(last);
      }
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty analysis.");
      return parseJson(text);
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      if (attempt < 3 && /fetch failed|timeout|timed out/i.test(last)) { await sleep(attempt === 1 ? 2500 : 6000); continue; }
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.12, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are EDITIO's precise senior video editor. Return only JSON." }, { role: "user", content }] })
  });
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
    if (isPlaceholderKey(key)) return NextResponse.json({ error: `${provider === "openai" ? "OpenAI" : "Gemini"} API key is missing. Add it to .env.local and restart the dev server.` }, { status: 500 });
    try {
      const raw = provider === "openai" ? await openai(body, key!, model) : await gemini(body, key!, model);
      const plan = normalisePlan(raw, body);
      if (!plan.clipSequence?.length) return NextResponse.json({ error: "AI could not find any usable video moments. Please use the single retry." }, { status: 422 });
      return NextResponse.json({ ok: true, plan, provider, model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI analysis failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid AI analysis request." }, { status: 500 });
  }
}
