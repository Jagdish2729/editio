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
type SequenceItem = {
  clip?: string;
  startSeconds?: number;
  endSeconds?: number;
  timestampSeconds?: number;
  reason?: string;
  speed?: number;
  zoom?: number;
  zoomDirection?: "in" | "out" | "none";
};
type RawPlan = {
  visualSummary?: string;
  heroMoment?: Moment;
  bestMoments?: Moment[];
  targetDurationSeconds?: number;
  aspectRatio?: string;
  hook?: string;
  clipSequence?: SequenceItem[];
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
function selectVisionFrames(allFrames: VideoFrame[], maxFrames = 18) {
  const groups = Array.from(new Set(allFrames.map(frame => frame.clipName))).map(name => allFrames.filter(frame => frame.clipName === name));
  if (groups.length <= 1) return allFrames.slice(0, maxFrames);
  const selected: VideoFrame[] = [];
  const perGroup = Math.max(1, Math.floor(maxFrames / groups.length));
  for (const group of groups) {
    for (let i = 0; i < Math.min(perGroup, group.length); i++) selected.push(group[Math.min(group.length - 1, Math.floor((i * group.length) / Math.min(perGroup, group.length)))]);
  }
  let cursor = 0;
  while (selected.length < maxFrames && cursor < maxFrames * groups.length * 2) {
    const group = groups[cursor % groups.length];
    const index = Math.floor(((cursor + 1) * group.length) / (Math.ceil(maxFrames / groups.length) + 1));
    const frame = group[Math.min(group.length - 1, Math.max(0, index))];
    if (frame && !selected.includes(frame)) selected.push(frame);
    cursor++;
  }
  return selected.slice(0, maxFrames);
}

function isCricket(body: AnalyzeRequest) { return /cricket|sports?/i.test(`${body.category} ${body.creativeDirection}`); }
function eventLooksLikeHero(reason = "") { return /wicket|dismiss|catch|caught|boundary|six|four|goal|impact|result|out/i.test(reason); }

function normalisePlan(raw: RawPlan, body: AnalyzeRequest): RawPlan {
  const durations = new Map<string, number>();
  for (const frame of body.frames) durations.set(frame.clipName, Math.max(0, frame.durationSeconds));
  const knownClips = Array.from(durations.keys());
  const rawSequence = raw.clipSequence?.length
    ? raw.clipSequence
    : (raw.bestMoments || []).map(moment => ({ clip: moment.clip, timestampSeconds: moment.timestampSeconds, reason: moment.reason || "Selected as a strong moment." }));

  const makeItem = (item: SequenceItem) => {
    const clip = resolveClipName(item.clip, knownClips);
    if (!clip) return null;
    const duration = durations.get(clip) || 0;
    const anchor = Number(item.timestampSeconds);
    let start = Number(item.startSeconds), end = Number(item.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      const safeAnchor = Number.isFinite(anchor) ? anchor : duration * 0.5;
      start = Math.max(0, safeAnchor - 1.1); end = Math.min(duration || safeAnchor + 1.8, safeAnchor + 1.8);
    }
    start = Math.max(0, Math.min(start, Math.max(0, duration - 0.25)));
    end = Math.max(start + 0.45, Math.min(end, duration || end));
    const requestedSpeed = Number(item.speed);
    const speed = Number.isFinite(requestedSpeed) ? Math.max(0.65, Math.min(1.35, requestedSpeed)) : 1;
    const requestedZoom = Number(item.zoom);
    const zoom = Number.isFinite(requestedZoom) ? Math.max(1, Math.min(1.12, requestedZoom)) : 1;
    const zoomDirection = item.zoomDirection === "in" || item.zoomDirection === "out" ? item.zoomDirection : "none";
    return {
      ...item,
      clip,
      startSeconds: Number(start.toFixed(2)),
      endSeconds: Number(end.toFixed(2)),
      timestampSeconds: Number.isFinite(anchor) ? Number(anchor.toFixed(2)) : Number(((start + end) / 2).toFixed(2)),
      reason: item.reason || "Selected for the story.",
      speed: Number(speed.toFixed(2)), zoom: Number(zoom.toFixed(2)), zoomDirection,
    };
  };

  let sequence = rawSequence.map(makeItem).filter(Boolean) as SequenceItem[];
  const heroClip = resolveClipName(raw.heroMoment?.clip, knownClips);
  const heroTime = Number(raw.heroMoment?.timestampSeconds);
  const cricket = isCricket(body);
  const heroReason = raw.heroMoment?.reason || "Mandatory hero/payoff moment.";

  if (heroClip && Number.isFinite(heroTime)) {
    // Replace whatever tiny/poor segment the model chose around the hero with a
    // proper event package: build-up + impact + post-event breathing room.
    const heroStart = Math.max(0, heroTime - (cricket ? 1.35 : 1.1));
    const heroEnd = Math.min(durations.get(heroClip) || heroTime + 1.2, heroTime + (cricket ? 1.15 : 1.0));
    const hero = makeItem({ clip: heroClip, startSeconds: heroStart, endSeconds: heroEnd, timestampSeconds: heroTime, speed: cricket ? 0.78 : 0.85, zoom: 1.03, zoomDirection: "in", reason: heroReason });
    if (hero) {
      sequence = sequence.filter(item => !(item.clip === heroClip && heroTime >= Number(item.startSeconds) - 0.35 && heroTime <= Number(item.endSeconds) + 0.35));
      const desiredIndex = Math.min(sequence.length, Math.max(2, Math.round(sequence.length * 0.68)));
      sequence = [...sequence.slice(0, desiredIndex), hero, ...sequence.slice(desiredIndex)];

      // For a decisive cricket event, a short replay makes the edit feel like a
      // highlight rather than a straight clip montage. Only add it when the model
      // has explicitly identified the event as a wicket/catch/boundary/result.
      if (cricket && eventLooksLikeHero(heroReason) && sequence.length < 8) {
        const replayStart = Math.max(0, heroTime - 0.55);
        const replayEnd = Math.min(durations.get(heroClip) || heroTime + 0.8, heroTime + 0.8);
        const replay = makeItem({
          clip: heroClip, startSeconds: replayStart, endSeconds: replayEnd, timestampSeconds: heroTime,
          speed: 0.72, zoom: 1.06, zoomDirection: "in", reason: "Replay the decisive hero event from a tighter framing."
        });
        if (replay) {
          const heroIndex = sequence.indexOf(hero);
          sequence = [...sequence.slice(0, heroIndex + 1), replay, ...sequence.slice(heroIndex + 1)];
        }
      }
    }
  }

  // Keep the edit purposeful. Extremely long model-selected shots are a common
  // source of the "clips joined together" look, so cap normal segments while
  // allowing the hero package to breathe.
  sequence = sequence.map((item, index) => {
    const duration = Number(item.endSeconds) - Number(item.startSeconds);
    const maxDuration = item === sequence.find(candidate => candidate.clip === heroClip && Number.isFinite(heroTime) && heroTime >= Number(candidate.startSeconds) && heroTime <= Number(candidate.endSeconds)) ? 2.9 : 2.25;
    if (duration <= maxDuration) return item;
    return { ...item, endSeconds: Number((Number(item.startSeconds) + maxDuration).toFixed(2)) };
  });

  const total = sequence.reduce((sum, item) => sum + ((Number(item.endSeconds) - Number(item.startSeconds)) / Math.max(0.65, Number(item.speed) || 1)), 0);
  const bestMoments = (raw.bestMoments || []).slice(0, 8).map(item => ({ ...item, clip: resolveClipName(item.clip, knownClips) || item.clip })).filter(item => knownClips.includes(item.clip || "")) as RawPlan["bestMoments"];
  return {
    visualSummary: raw.visualSummary || "AI-selected first-cut Reel based on the supplied footage.",
    heroMoment: heroClip && Number.isFinite(heroTime) ? { clip: heroClip, timestampSeconds: Number(heroTime.toFixed(2)), reason: heroReason } : undefined,
    bestMoments,
    targetDurationSeconds: Math.max(6, Math.min(24, Math.round(total || Number(raw.targetDurationSeconds) || 14))),
    aspectRatio: "9:16",
    hook: body.hookEnabled && (body.hookText || "").trim().split(/\s+/).length >= 4 ? (body.hookText || "").trim().slice(0, 90) : "",
    clipSequence: sequence.slice(0, 8),
    captions: [], captionIdeas: [], transitions: raw.transitions || [],
    transitionDirection: "Use clean hard/match cuts; let the cricket action provide the energy.",
    audioDirection: "Keep original source audio. No added music. Preserve continuity across clips.",
    colorDirection: raw.colorDirection || "Clean, natural and consistent across all source clips.",
    ending: raw.ending || "End on the strongest meaningful reaction or replay; never an accidental tail or phone UI.",
  };
}

function isPlaceholderKey(key: string | undefined) { if (!key) return true; const value = key.trim().toLowerCase(); return value === "your_api_key_here" || value.includes("your_api_key") || value.includes("replace_with"); }
function transient(status: number) { return [429, 500, 502, 503, 504].includes(status); }
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

const prompt = (body: AnalyzeRequest, frameText: string) => `You are EDITIO's senior short-form video editor AND sports highlight editor. You are creating a REAL Reel from supplied timestamped video frames. First understand what actually happens over time. Then design an edit that feels intentionally cut by a professional editor, not a montage of attractive frames.

CREATOR UI INPUT
Edit type: ${body.editType}
Format: ${body.format}
Vibe: ${body.vibe}
Category: ${body.category}
Creator editing direction: ${body.creativeDirection}
Hook enabled: ${body.hookEnabled ? "YES" : "NO"}
Creator hook: ${body.hookEnabled ? `"${body.hookText || ""}"` : "NO HOOK"}
Reference context: ${body.reference || "None"}

The UI choices are real constraints, but the creator does NOT need to identify the main moment. You must discover the main event yourself. A reference URL is only text/context here; do not claim you watched it.

FOOTAGE MAP
${frameText}

========================================
EVENT DETECTION — DO THIS BEFORE EDITING
========================================
1. Inspect the entire timestamped frame sequence before choosing any cut.
2. Identify the single most important REAL EVENT / PAYOFF in the footage and return it as heroMoment.
3. Think temporally: compare nearby frames around the event. Do not select a single pretty frame as the hero.
4. Distinguish SETUP, BUILD-UP, ACTION, RESULT/EVENT and REACTION.
5. The RESULT/EVENT is more important than the reaction. If the actual event is visible, it MUST be shown.
6. If the event occurs near the end, that is NOT a reason to omit it. Build the Reel toward it.
7. If a result graphic appears, use it as supporting evidence only. Never substitute a WICKET graphic for an actual visible wicket/catch when the play is available.
8. heroMoment timestamp must be the closest timestamp to the actual event, not the celebration afterward.

========================================
CRICKET HIGHLIGHT BRAIN — ABSOLUTE PRIORITY
========================================
For cricket, rank moments roughly like this:
ACTUAL WICKET/DISMISSAL/CATCH/BOUNDARY/BIG HIT/DECISIVE RESULT > BALL CONTACT/ACTION > IMMEDIATE REACTION > CELEBRATION > SETUP.

If a catch/wicket is the story, the edit MUST show:
1. enough run-up/setup to understand the play,
2. delivery/action,
3. the actual catch/wicket/result moment,
4. a short reaction/celebration if available,
5. optionally a replay of the decisive event if the same event can be replayed from the footage.

Never make a Reel whose only evidence of a wicket is a later WICKET graphic or celebration when the actual play is visible.
Never spend several seconds on a bowler standing/walking while cutting the actual wicket to a tiny ending shot.
If the decisive catch/wicket is at 17s, it is completely acceptable for the Reel to build for 12–15s and pay off at 17s. Do NOT shorten the story by deleting the late payoff.

========================================
PRO EDITING STYLE — USE THE REFERENCE PRINCIPLES
========================================
Do NOT simply join source clips from beginning to end.
Create a highlight sequence with varied shot lengths and intentional micro-cuts.
Typical structure when supported:
HOOK/tease → setup → build-up → delivery/action → HERO EVENT → reaction → replay/alternate view → clean ending.

The hero should normally land in the final third of the Reel. Do not put the payoff in the first few seconds unless the footage genuinely demands it.
Use 5–8 purposeful segments. A segment should exist because it contributes to the story.
Normal shots should usually be 0.5–2.2 seconds. Give the hero event enough time to be understood.
Use exact startSeconds/endSeconds around meaningful action, not arbitrary chunks.
Do not give every clip equal time.
Remove dead air, empty scenery, repeated generic shots, sky-only shots, vehicles, screen recordings, phone/control UI and accidental tails unless they are clearly intentional parts of the source edit.
Use hard cuts or action-matched cuts. Avoid flashy transitions.

========================================
HERO EVENT PACKAGE
========================================
The hero is not just one frame. Build a small package around it.
For a cricket wicket/catch/boundary:
- include approximately 0.8–1.5 seconds before the decisive action when available,
- include the decisive action itself,
- include approximately 0.5–1.2 seconds after it when useful,
- optionally replay the decisive action with a tighter crop/slow motion if source footage permits.
Do not make the replay replace the original event; original event first, replay second.

========================================
FRAMING / ZOOM
========================================
Composition must help the viewer understand the action.
For cricket, preserve bowler + batsman + pitch/wicket/action area whenever source framing allows it.
Do NOT aggressively zoom into one player if it makes the actual play impossible to understand.
Use subtle zoom-in (roughly 1.03–1.08x) for emphasis after context is established.
Use zoomDirection "out" when the source shot is too tight and a wider readable composition is needed.
If zoom-out cannot reveal source pixels, prefer the original wider source framing rather than inventing information.
Never invent a wider view that the source does not contain.

========================================
SPEED / MOTION
========================================
Use speed changes intentionally, not as decoration.
- setup/low-energy: 1.10–1.30x when useful
- normal play: 1.0x
- decisive action/replay: 0.65–0.85x when it improves clarity
Aim for 1–3 meaningful speed changes across the Reel.
A wicket/catch replay should often be slower than the live action.

========================================
DURATION
========================================
When enough meaningful footage exists, target roughly 15–20 seconds.
A strong 17–19 second cricket highlight is better than a weak 10-second montage that misses the payoff.
Do not pad with irrelevant footage just to reach a duration.

========================================
HOOK
========================================
If hook is disabled, return empty string.
If enabled but the creator text is weak/short, return empty string. Do not invent a generic hook.
A visual cold-open is allowed only when it helps the story and does not hide the actual payoff.

========================================
ACCURACY
========================================
Never invent a player, score, wicket, shot type, dialogue, result or action.
Every clip name must exactly match FOOTAGE MAP.
Every timestamp must be inside its source duration.
Sequence order is your editorial decision, not upload order.

RETURN JSON ONLY
{
  "visualSummary":"what the footage actually supports",
  "heroMoment":{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific actual event, e.g. caught at the ball/result moment"},
  "bestMoments":[{"clip":"EXACT filename","timestampSeconds":number,"reason":"specific useful moment"}],
  "targetDurationSeconds":number,
  "aspectRatio":"9:16",
  "hook":"creator hook or empty string",
  "clipSequence":[{"clip":"EXACT filename","startSeconds":number,"endSeconds":number,"timestampSeconds":number,"speed":number,"zoom":number,"zoomDirection":"in|out|none","reason":"specific editorial purpose"}],
  "captions":[],"captionIdeas":[],
  "transitions":[{"afterClip":"EXACT filename","type":"hard cut|match cut|quick cut"}],
  "transitionDirection":"string",
  "audioDirection":"Keep source audio only",
  "colorDirection":"string",
  "ending":"specific reason the ending works"
}`;

function geminiPart(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s);
  return match ? { inline_data: { mime_type: match[1], data: match[2] } } : null;
}
async function gemini(body: AnalyzeRequest, key: string, model: string) {
  const frames = selectVisionFrames(body.frames, 18);
  const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const parts: Array<Record<string, unknown>> = [{ text: prompt(body, frameText) }];
  for (const frame of frames) { const part = geminiPart(frame.imageDataUrl); if (part) parts.push(part); }
  let last = "Gemini analysis failed.";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.08, responseMimeType: "application/json" } }),
      });
      const data = await response.json();
      if (!response.ok) { last = data?.error?.message || `Gemini failed (HTTP ${response.status}).`; if (attempt < 3 && transient(response.status)) { await sleep(attempt === 1 ? 2500 : 6000); continue; } throw new Error(last); }
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
  const frames = selectVisionFrames(body.frames, 18);
  const frameText = frames.map((f, i) => `Frame ${i + 1}: clip=${f.clipName}, time=${f.timestampSeconds}s, duration=${f.durationSeconds}s`).join("\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt(body, frameText) }];
  for (const frame of frames) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl, detail: "low" } });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.08, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are EDITIO's precise senior video editor. Return only JSON." }, { role: "user", content }] }),
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
