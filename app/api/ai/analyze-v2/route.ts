import { NextResponse } from "next/server";
import type { VideoFrame } from "../../../../lib/video-analysis";

export const runtime = "nodejs";

type AnalyzeRequest = {
  orderId: string; editType: string; format: string; vibe: string; category: string;
  creativeDirection: string; hookEnabled?: boolean; hookText?: string; reference?: string; frames: VideoFrame[];
};
type Moment = { clip?: string; timestampSeconds?: number; reason?: string };
type RawPlan = {
  visualSummary?: string; heroMoment?: Moment; bestMoments?: Moment[]; targetDurationSeconds?: number; aspectRatio?: string; hook?: string;
  clipSequence?: Array<{ clip?: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number; reason?: string; speed?: number; zoom?: number; zoomDirection?: "in" | "out" | "none" }>;
  captions?: unknown[]; captionIdeas?: string[]; transitions?: Array<{ afterClip?: string; type?: string }>;
  transitionDirection?: string; audioDirection?: string; colorDirection?: string; ending?: string;
};
function parseJson(text: string): RawPlan { const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim(); return JSON.parse(cleaned) as RawPlan; }
function clipKey(value: string) { return value.trim().toLowerCase().replace(/\\/g, "/").split("/").pop() || ""; }
function clipStem(value: string) { return clipKey(value).replace(/\.[a-z0-9]{2,5}$/i, ""); }
function resolveClipName(value: string | undefined, knownClips: string[]) {
  if (!value) return null; const exact = knownClips.find(name => name === value); if (exact) return exact;
  const key = clipKey(value); const byKey = knownClips.find(name => clipKey(name) === key); if (byKey) return byKey;
  const stem = clipStem(value); const byStem = knownClips.find(name => clipStem(name) === stem); if (byStem) return byStem;
  const match = key.match(/^(?:clip|video)[ _-]?(\d+)$/i); if (match) { const index = Number(match[1]) - 1; if (knownClips[index]) return knownClips[index]; }
  return knownClips.length === 1 ? knownClips[0] : null;
}
function selectVisionFrames(allFrames: VideoFrame[], maxFrames = 18) {
  const groups = Array.from(new Map<string, VideoFrame[]>(allFrames.map(f => [f.clipName, [] as VideoFrame[]])).keys()).map(name => allFrames.filter(f => f.clipName === name));
  if (groups.length <= 1) return allFrames.slice(0, maxFrames);
  const selected: VideoFrame[] = [];
  const perGroup = Math.max(1, Math.floor(maxFrames / groups.length));
  for (const group of groups) {
    const count = Math.min(perGroup, group.length);
    for (let i = 0; i < count; i++) selected.push(group[Math.min(group.length - 1, Math.floor((i * group.length) / count))]);
  }
  // Use any remaining budget to sample the longest/most information-rich groups.
  let cursor = 0;
  while (selected.length < maxFrames) {
    const group = groups[cursor % groups.length]; const index = Math.floor(((cursor + 1) * group.length) / (Math.ceil(maxFrames / groups.length) + 1));
    const frame = group[Math.min(group.length - 1, Math.max(0, index))];
    if (frame && !selected.includes(frame)) selected.push(frame); else if (cursor > maxFrames * groups.length) break;
    cursor++;
  }
  return selected.slice(0, maxFrames);
}
function normalisePlan(raw: RawPlan, body: AnalyzeRequest): RawPlan {
  const durations = new Map<string, number>(); for (const frame of body.frames) durations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = Array.from(durations.keys());
  const rawSequence = raw.clipSequence?.length ? raw.clipSequence : (raw.bestMoments || []).map(moment => ({ clip: moment.clip, timestampSeconds: moment.timestampSeconds, reason: moment.reason || "Selected as a strong moment." }));
  const makeItem = (item: NonNullable<RawPlan["clipSequence"]>[number]) => {
    const clip = resolveClipName(item.clip, knownClips); if (!clip) return null; const duration = durations.get(clip) || 0; const anchor = Number(item.timestampSeconds);
    let start = Number(item.startSeconds), end = Number(item.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { const safeAnchor = Number.isFinite(anchor) ? anchor : duration * 0.5; start = Math.max(0, safeAnchor - 1.25); end = Math.min(duration || safeAnchor + 2, safeAnchor + 2); }
    start = Math.max(0, Math.min(start, Math.max(0, duration - 0.3))); end = Math.max(start + 0.75, Math.min(end, duration || end));
    const requestedSpeed = Number(item.speed); const speed = Number.isFinite(requestedSpeed) ? Math.max(0.65, Math.min(1.35, requestedSpeed)) : 1;
    const requestedZoom = Number(item.zoom); const zoom = Number.isFinite(requestedZoom) ? Math.max(1, Math.min(1.12, requestedZoom)) : 1;
    const zoomDirection = item.zoomDirection === "in" || item.zoomDirection === "out" ? item.zoomDirection : "none";
    return { ...item, clip, startSeconds: Number(start.toFixed(2)), endSeconds: Number(end.toFixed(2)), timestampSeconds: Number.isFinite(anchor) ? Number(anchor.toFixed(2)) : Number(((start + end) / 2).toFixed(2)), reason: item.reason || "Selected for the story.", speed: Number(speed.toFixed(2)), zoom: Number(zoom.toFixed(2)), zoomDirection };
  };
  let sequence = rawSequence.map(makeItem).filter(Boolean) as NonNullable<RawPlan["clipSequence"]>;
  const heroClip = resolveClipName(raw.heroMoment?.clip, knownClips); const heroTime = Number(raw.heroMoment?.timestampSeconds);
  if (heroClip && Number.isFinite(heroTime)) {
    const hasHero = sequence.some(item => item.clip === heroClip && heroTime >= Number(item.startSeconds) - 0.35 && heroTime <= Number(item.endSeconds) + 0.35);
    if (!hasHero) {
      const hero = makeItem({ clip: heroClip, timestampSeconds: heroTime, startSeconds: heroTime - 1.1, endSeconds: heroTime + 1.6, speed: 0.78, zoom: 1, zoomDirection: "none", reason: raw.heroMoment?.reason || "Mandatory hero/payoff moment." });
      if (hero) {
        if (sequence.length >= 8) { const dropIndex = sequence.findIndex(item => item.clip !== heroClip); if (dropIndex >= 0) sequence.splice(dropIndex, 1); }
        const insertAt = Math.min(sequence.length, Math.max(1, Math.floor(sequence.length * 0.65))); sequence = [...sequence.slice(0, insertAt), hero, ...sequence.slice(insertAt)].slice(0, 8);
      }
    }
  }
  const total = sequence.reduce((sum, item) => sum + ((Number(item.endSeconds) - Number(item.startSeconds)) / Math.max(0.65, Number(item.speed) || 1)), 0);
  const bestMoments = (raw.bestMoments || []).slice(0, 8).map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || item.clip })).filter(item => knownClips.includes(item.clip || "")) as RawPlan["bestMoments"];
  return { visualSummary: raw.visualSummary || "AI-selected first-cut Reel based on the supplied footage.", heroMoment: heroClip && Number.isFinite(heroTime) ? { clip: heroClip, timestampSeconds: Number(heroTime.toFixed(2)), reason: raw.heroMoment?.reason || "Mandatory hero/payoff moment." } : undefined, bestMoments, targetDurationSeconds: Math.max(6, Math.min(24, Math.round(total || Number(raw.targetDurationSeconds) || 14))), aspectRatio: "9:16", hook: body.hookEnabled && (body.hookText || "").trim().split(/\s+/).length >= 4 ? (body.hookText || "").trim().slice(0, 90) : "", clipSequence: sequence, captions: [], captionIdeas: [], transitions: raw.transitions || [], transitionDirection: raw.transitionDirection || "Use clean, invisible-feeling cuts that preserve visual and audio continuity.", audioDirection: "Keep original source audio. No added music. Preserve continuity across clips.", colorDirection: raw.colorDirection || "Clean, natural and consistent across all source clips.", ending: raw.ending || "End on the strongest meaningful moment; never use an accidental tail or phone UI." };
}
function isPlaceholderKey(key: string | undefined) { if (!key) return true; const value = key.trim().toLowerCase(); return value === "your_api_key_here" || value.includes("your_api_key") || value.includes("replace_with"); }
function transient(status: number) { return [429, 500, 502, 503, 504].includes(status); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

const prompt = (body: AnalyzeRequest, frameText: string) => `You are EDITIO's senior short-form video editor. You are cutting a REAL Reel from supplied video frames. Understand what ACTUALLY HAPPENS first, then edit around that event. Do not make a generic montage.

CREATOR UI INPUT — FOLLOW THIS
Edit type: ${body.editType}
Format: ${body.format}
Vibe: ${body.vibe}
Category: ${body.category}
Creator editing direction: ${body.creativeDirection}
Hook enabled: ${body.hookEnabled ? "YES" : "NO"}
Creator hook text: ${body.hookEnabled ? `USE THIS EXACT TEXT IF IT IS MEANINGFUL: "${body.hookText || ""}"` : "NO HOOK"}
Reference: ${body.reference || "None"}

The category, vibe, format and creator editing direction are real UI choices and MUST influence the edit. But the creator is NOT required to identify the main moment. YOU must discover it from the footage. Never let a generic instruction such as “fast” override the actual event/payoff.
A reference URL is currently only creator-provided text/context. Do not pretend you watched the linked Reel; use it only as a style hint when possible.

FOOTAGE MAP
${frameText}

EVENT-FIRST — ABSOLUTE PRIORITY
1. Inspect ALL supplied frames and timestamps before choosing the sequence.
2. First identify ONE HERO MOMENT / MAIN EVENT: the real event/payoff that makes this footage worth watching.
3. Return it as heroMoment with the closest visible timestamp.
4. The hero moment MUST appear in clipSequence. Never omit it because it occurs late in a clip.
5. The hero is NOT the prettiest frame, clearest face, most cinematic shot, or reaction. The actual event wins.
6. If the event itself is visible, show the event itself. A reaction is supporting material, never a replacement.
7. If the event is not directly visible but there is strong immediate evidence such as a broadcast RESULT/WICKET overlay followed by the reaction, use the closest actual action plus that evidence; never invent unseen details.
8. Build around it: setup/build → action → HERO EVENT → reaction/ending when supported.
9. If the hero occurs late, reach it. Never stop the Reel before the payoff just to keep it short.
10. Sequence order is YOUR editorial decision, not upload order.

CRICKET — VERY IMPORTANT
Actual wicket/dismissal/catch, actual boundary/big hit, or decisive ball-contact-result outranks generic run-up, bowling, batting stance, or celebration. If a wicket is visible or strongly evidenced by the play plus immediate WICKET/result graphic or celebration, the wicket-taking action is the hero and MUST be shown. Celebration may follow it but must not replace it.
For decisive cricket action, preserve enough context for the viewer to understand WHO did WHAT and WHERE: keep bowler + batsman + relevant pitch/wicket/ball area visible whenever the source framing allows it.

FRAMING / CROP / ZOOM
- Composition is part of editing. Before every crop/zoom ask: can the viewer still understand who did what and where?
- For cricket/sports, do NOT punch in so much that bowler, batsman, pitch/wicket or action area disappears.
- If a shot is too tight, prefer a wider composition / less crop so bowler + batsman + pitch/action context can be understood together.
- Use zoom-in only for emphasis after context is established. Prefer 1.03–1.08x.
- Use zoomDirection “out” when a wider readable composition is needed, “in” for controlled emphasis, “none” when original framing is best.
- Never invent a wider view that the source does not contain.

EDITING / PACING
- Prefer about 14–18 seconds when enough meaningful footage exists. If footage genuinely cannot support that, make it shorter rather than padding.
- Usually 5–8 purposeful segments.
- Use exact source startSeconds/endSeconds. Cut close to actual action, not arbitrary equal chunks.
- Give the hero enough time to be understood. Do not rush the most important moment.
- Vary segment lengths.
- Do not simply stitch clips from start to finish.
- Remove dead air, duplicate angles, empty frames, phone UI, screen recordings, control-center overlays and accidental tails.
- Preserve original source audio. No added music.

SPEED / MOTION
- Use 0.65–0.85x selectively around important impact/action/reaction moments.
- Use 1.10–1.30x for low-energy setup only when it genuinely improves pacing.
- Keep normal moments at 1.0x.
- Aim for 1–3 meaningful speed changes across the Reel, not effects everywhere.
- Never slow an irrelevant shot merely to make it cinematic.

CONTINUITY
- With multiple clips, make ONE story, not “clip 1, clip 2, clip 3”.
- If one clip contains setup and another contains payoff, the payoff MUST survive the cut.
- Do not give clips equal screen time by default.
- Use hard/match cuts where natural; no flashy transitions.

HOOK
- If disabled, return empty hook.
- If enabled but the supplied hook is under 4 words, return empty hook. Never invent a replacement.

ACCURACY
- Never invent a score, wicket, shot type, player, dialogue, result or action unsupported by the frames.
- Every clip name must exactly match FOOTAGE MAP.
- Every timestamp/range must be inside the source clip duration.
- Final segment must be meaningful payoff/reaction/ending, not an accidental tail.

CATEGORY PRIORITIES
Cricket: decisive play/result first; keep bowler + batsman + pitch context readable; then reaction.
Fashion: strongest reveal/look, movement/detail, strongest final look.
Travel: strongest establishing/experience, movement/detail, memorable ending.
Food: preparation/action, texture/detail, reveal, hero shot.
Fitness: strongest movement/effort/result, not just setup.
Beauty: before/action/detail/final result.
Lifestyle: strongest real mini-story/payoff.
Gaming: action/tension/clear payoff; reject menus.
Business: useful/action/work/product moment and credible payoff.
Other: follow creator direction while still identifying the real hero event yourself.

RETURN JSON ONLY
{
  "visualSummary":"what the footage actually supports",
  "heroMoment":{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific real main event/payoff"},
  "bestMoments":[{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific reason"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"creator hook or empty string",
  "clipSequence":[{"clip":"EXACT filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"speed":number,"zoom":number,"zoomDirection":"in|out|none","reason":"specific editorial reason"}],
  "captions":[],"captionIdeas":[],
  "transitions":[{"afterClip":"EXACT filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"string","audioDirection":"Keep source audio only","colorDirection":"string","ending":"specific reason the ending works"
}`;

function geminiPart(dataUrl: string) { const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s); return match ? { inline_data: { mime_type: match[1], data: match[2] } } : null; }
async function gemini(body: AnalyzeRequest, key: string, model: string) {
  const frames = selectVisionFrames(body.frames, 18); const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const parts: Array<Record<string, unknown>> = [{ text: prompt(body, frameText) }]; for (const frame of frames) { const part = geminiPart(frame.imageDataUrl); if (part) parts.push(part); }
  let last = "Gemini analysis failed.";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.08, responseMimeType: "application/json" } }) });
      const data = await response.json();
      if (!response.ok) { last = data?.error?.message || `Gemini failed (HTTP ${response.status}).`; if (attempt < 3 && transient(response.status)) { await sleep(attempt === 1 ? 2500 : 6000); continue; } throw new Error(last); }
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim(); if (!text) throw new Error("Gemini returned an empty analysis."); return parseJson(text);
    } catch (error) { last = error instanceof Error ? error.message : last; if (attempt < 3 && /fetch failed|timeout|timed out/i.test(last)) { await sleep(attempt === 1 ? 2500 : 6000); continue; } throw new Error(last); }
  }
  throw new Error(last);
}
async function openai(body: AnalyzeRequest, key: string, model: string) {
  const frames = selectVisionFrames(body.frames, 18); const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt(body, frameText) }]; for (const frame of frames) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl, detail: "low" } });
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.08, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are EDITIO's precise senior video editor. Return only JSON." }, { role: "user", content }] }) });
  const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `OpenAI failed (HTTP ${response.status}).`); const text = data?.choices?.[0]?.message?.content?.trim(); if (!text) throw new Error("OpenAI returned an empty analysis."); return parseJson(text);
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as AnalyzeRequest;
    if (!body.orderId || !Array.isArray(body.frames) || !body.frames.length) return NextResponse.json({ error: "AI analysis needs an order and video frames." }, { status: 400 });
    const provider = (process.env.EDITIO_AI_PROVIDER || "gemini").trim().toLowerCase(); const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY; const model = provider === "openai" ? (process.env.OPENAI_MODEL || "gpt-4o-mini") : (process.env.GEMINI_MODEL || "gemini-3.8-flash");
    if (isPlaceholderKey(key)) return NextResponse.json({ error: `${provider === "openai" ? "OpenAI" : "Gemini"} API key is missing. Add it to .env.local and restart the dev server.` }, { status: 500 });
    try { const raw = provider === "openai" ? await openai(body, key!, model) : await gemini(body, key!, model); const plan = normalisePlan(raw, body); if (!plan.clipSequence?.length) return NextResponse.json({ error: "AI could not find any usable video moments. Please use the single retry." }, { status: 422 }); return NextResponse.json({ ok: true, plan, provider, model }); }
    catch (error) { const message = error instanceof Error ? error.message : "AI analysis failed."; return NextResponse.json({ error: message }, { status: 502 }); }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid AI analysis request." }, { status: 500 }); }
}
