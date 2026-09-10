import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const transientStatuses = new Set([429, 500, 502, 503, 504]);

type Frame = { clipName: string; timestampSeconds: number; duration: number; imageDataUrl: string };
type RawPlan = {
  visualSummary?: string;
  heroMoment?: { clip: string; timestampSeconds: number; reason: string };
  bestMoments?: Array<{ clip: string; timestampSeconds: number; reason: string }>;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  hook?: string;
  hookEnabled?: boolean;
  clipSequence?: Array<{
    clip: string;
    startSeconds?: number;
    endSeconds?: number;
    timestampSeconds?: number;
    reason?: string;
    speed?: number;
    zoom?: number;
    zoomDirection?: "in" | "out" | "none";
    isHero?: boolean;
  }>;
  textOverlays?: Array<{ text: string; startSeconds?: number; endSeconds?: number; kind?: string; position?: string; style?: string; animation?: string }>;
  captions?: Array<{ text: string; placement: string; style: string; startSeconds?: number; endSeconds?: number }>;
  transitions?: Array<{ afterClip: string; type: string }>;
  audioDirection?: string;
  musicMood?: string;
  musicIntensity?: number;
  sfx?: Array<{ timeSeconds: number; type: string; durationSeconds?: number; intensity?: number }>;
  colorDirection?: string;
  colorPreset?: string;
  ending?: string;
  coverText?: string;
  socialCaption?: string;
  hashtags?: string[];
};

type NormalisedPlan = {
  visualSummary: string;
  heroMoment?: { clip: string; timestampSeconds: number; reason: string };
  bestMoments: Array<{ clip: string; timestampSeconds: number; reason: string }>;
  targetDurationSeconds: number;
  aspectRatio: string;
  hook: string;
  hookEnabled: boolean;
  clipSequence: Array<{
    clip: string;
    startSeconds: number;
    endSeconds: number;
    timestampSeconds: number;
    reason: string;
    speed: number;
    zoom: number;
    zoomDirection: "in" | "out" | "none";
    isHero?: boolean;
  }>;
  textOverlays: Array<{ text: string; startSeconds: number; endSeconds: number; kind: "hook" | "editorial" | "caption" | "ending"; position: "top" | "center" | "bottom"; style: "clean" | "bold" | "cinematic" | "funny" | "sports"; animation: "pop" | "fade" | "slide" | "none" }>;
  captions: Array<{ text: string; placement: string; style: string; startSeconds?: number; endSeconds?: number }>;
  transitions: Array<{ afterClip: string; type: string }>;
  audioDirection: string;
  musicMood: "none" | "hype" | "cinematic" | "chill" | "funny" | "emotional";
  musicIntensity: number;
  sfx: Array<{ timeSeconds: number; type: "impact" | "whoosh" | "pop" | "record-scratch" | "crowd" | "ding"; durationSeconds: number; intensity: number }>;
  colorDirection: string;
  colorPreset: "natural" | "crisp" | "warm" | "cinematic" | "punchy";
  ending: string;
  coverText: string;
  socialCaption: string;
  hashtags: string[];
};

function cleanJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI returned an invalid edit plan.");
  return JSON.parse(trimmed.slice(start, end + 1)) as RawPlan;
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }
function normName(name: string) { return name.trim().toLowerCase().replace(/\\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, ""); }

function resolveClip(name: string, frames: Frame[]) {
  const exact = frames.find(f => f.clipName.toLowerCase() === name.toLowerCase());
  if (exact) return exact.clipName;
  const n = normName(name);
  const byStem = frames.find(f => normName(f.clipName) === n || normName(f.clipName).includes(n) || n.includes(normName(f.clipName)));
  if (byStem) return byStem.clipName;
  const number = name.match(/(?:clip|video|file)[^0-9]*(\\d+)/i)?.[1];
  if (number) {
    const match = frames.find(f => (f.clipName.match(/(\\d+)/)?.[1] || "") === number);
    if (match) return match.clipName;
  }
  return frames[0]?.clipName || name;
}

function durationFor(clip: string, frames: Frame[]) {
  return Math.max(0.5, frames.filter(f => f.clipName === clip).reduce((m, f) => Math.max(m, f.duration), 0.5));
}

function normalisePlan(raw: RawPlan, frames: Frame[], category: string, hookEnabled: boolean): NormalisedPlan {
  const firstClip = frames[0]?.clipName || "clip-1";
  const heroRaw = raw.heroMoment;
  const hero = heroRaw ? { clip: resolveClip(heroRaw.clip, frames), timestampSeconds: heroRaw.timestampSeconds, reason: heroRaw.reason || "Main moment" } : undefined;
  if (hero) hero.timestampSeconds = clamp(hero.timestampSeconds, 0, Math.max(0, durationFor(hero.clip, frames) - 0.05));

  const sequence = (raw.clipSequence || []).map(item => {
    const clip = resolveClip(item.clip || firstClip, frames);
    const duration = durationFor(clip, frames);
    let start = Number.isFinite(item.startSeconds) ? Number(item.startSeconds) : Number(item.timestampSeconds ?? 0);
    let end = Number.isFinite(item.endSeconds) ? Number(item.endSeconds) : start + 1.2;
    if (end <= start) end = start + 1.2;
    start = clamp(start, 0, Math.max(0, duration - 0.08));
    end = clamp(end, start + 0.25, duration);
    return {
      clip, startSeconds: start, endSeconds: end, timestampSeconds: (start + end) / 2,
      reason: item.reason || "Best usable moment", speed: clamp(Number(item.speed ?? 1), 0.65, 1.35),
      zoom: clamp(Number(item.zoom ?? 1), 0.88, 1.12), zoomDirection: item.zoomDirection || "none", isHero: Boolean(item.isHero)
    };
  }).filter(x => x.endSeconds - x.startSeconds >= 0.25);

  if (!sequence.length) {
    const fallback = hero || { clip: firstClip, timestampSeconds: 0.5, reason: "Fallback usable moment" };
    const d = durationFor(fallback.clip, frames);
    sequence.push({ clip: fallback.clip, startSeconds: clamp(fallback.timestampSeconds - 0.6, 0, Math.max(0, d - 0.8)), endSeconds: clamp(fallback.timestampSeconds + 0.8, 0.8, d), timestampSeconds: fallback.timestampSeconds, reason: fallback.reason, speed: 1, zoom: 1, zoomDirection: "none", isHero: Boolean(hero) });
  }

  // The hero is the story climax, not an accidental final shot. Force it into the middle/end of the narrative when the model supplied one.
  if (hero) {
    const d = durationFor(hero.clip, frames);
    const hs = clamp(hero.timestampSeconds - 0.85, 0, Math.max(0, d - 1.45));
    const he = clamp(hero.timestampSeconds + 0.85, hs + 0.8, d);
    const heroIndex = sequence.findIndex(x => x.clip === hero.clip && hero.timestampSeconds >= x.startSeconds - 0.35 && hero.timestampSeconds <= x.endSeconds + 0.35);
    const heroSegment = { clip: hero.clip, startSeconds: hs, endSeconds: he, timestampSeconds: hero.timestampSeconds, reason: hero.reason, speed: category.toLowerCase() === "cricket" ? 0.72 : 0.86, zoom: 0.98, zoomDirection: "out" as const, isHero: true };
    if (heroIndex >= 0) {
      sequence[heroIndex] = { ...sequence[heroIndex], ...heroSegment, isHero: true };
      const desired = Math.min(Math.max(1, Math.floor(sequence.length * 0.62)), sequence.length - 1);
      if (heroIndex !== desired) { const [picked] = sequence.splice(heroIndex, 1); sequence.splice(desired, 0, picked); }
    } else {
      const desired = Math.min(Math.max(1, Math.floor(sequence.length * 0.62)), sequence.length);
      sequence.splice(desired, 0, heroSegment);
    }
  }

  // Avoid a bloated first cut: purposeful story beats, not every upload.
  const compact = sequence.slice(0, 9);
  const target = clamp(Number(raw.targetDurationSeconds || 16), 8, 24);
  const total = compact.reduce((s, x) => s + (x.endSeconds - x.startSeconds) / x.speed, 0);
  if (total > 25) compact.splice(Math.floor(compact.length / 2), Math.max(0, compact.length - 7));

  const rawTexts = raw.textOverlays || [];
  const textOverlays = rawTexts.map(t => {
    const start = clamp(Number(t.startSeconds ?? 0), 0, target - 0.2);
    const end = clamp(Number(t.endSeconds ?? start + 1.2), start + 0.35, target);
    const kind = ["hook", "editorial", "caption", "ending"].includes(t.kind || "") ? t.kind as NormalisedPlan["textOverlays"][number]["kind"] : "editorial";
    const style = ["clean", "bold", "cinematic", "funny", "sports"].includes(t.style || "") ? t.style as NormalisedPlan["textOverlays"][number]["style"] : category.toLowerCase() === "cricket" ? "sports" : "bold";
    const position = ["top", "center", "bottom"].includes(t.position || "") ? t.position as NormalisedPlan["textOverlays"][number]["position"] : "center";
    const animation = ["pop", "fade", "slide", "none"].includes(t.animation || "") ? t.animation as NormalisedPlan["textOverlays"][number]["animation"] : "pop";
    return { text: String(t.text || "").trim().slice(0, 70), startSeconds: start, endSeconds: end, kind, position, style, animation };
  }).filter(t => t.text.length > 0).slice(0, 7);

  const musicMood = ["none", "hype", "cinematic", "chill", "funny", "emotional"].includes(raw.musicMood || "") ? raw.musicMood as NormalisedPlan["musicMood"] : "none";
  const sfx = (raw.sfx || []).map(s => ({ timeSeconds: clamp(Number(s.timeSeconds || 0), 0, target), type: ["impact", "whoosh", "pop", "record-scratch", "crowd", "ding"].includes(s.type) ? s.type as NormalisedPlan["sfx"][number]["type"] : "impact", durationSeconds: clamp(Number(s.durationSeconds || 0.18), 0.08, 0.7), intensity: clamp(Number(s.intensity ?? 0.65), 0.1, 1) })).slice(0, 8);

  return {
    visualSummary: raw.visualSummary || "AI-selected story edit",
    heroMoment: hero,
    bestMoments: (raw.bestMoments || []).slice(0, 10).map(m => ({ ...m, clip: resolveClip(m.clip, frames), timestampSeconds: clamp(Number(m.timestampSeconds || 0), 0, durationFor(resolveClip(m.clip, frames), frames)) })),
    targetDurationSeconds: target, aspectRatio: "9:16", hook: hookEnabled ? String(raw.hook || "") : "", hookEnabled,
    clipSequence: compact, textOverlays: textOverlays.filter(t => hookEnabled || t.kind !== "hook"), captions: raw.captions || [], transitions: raw.transitions || [],
    audioDirection: raw.audioDirection || "Keep natural source audio prominent.", musicMood, musicIntensity: clamp(Number(raw.musicIntensity ?? 0.25), 0, 0.45), sfx,
    colorDirection: raw.colorDirection || "Natural exposure and balanced contrast.", colorPreset: ["natural", "crisp", "warm", "cinematic", "punchy"].includes(raw.colorPreset || "") ? raw.colorPreset as NormalisedPlan["colorPreset"] : "natural",
    ending: raw.ending || "End on the payoff and remove accidental tail.", coverText: String(raw.coverText || "").slice(0, 45), socialCaption: String(raw.socialCaption || "").slice(0, 220), hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 8).map(String) : []
  };
}

async function callGemini(apiKey: string, model: string, prompt: string, frames: Frame[]) {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const frame of frames.slice(0, 18)) {
    const match = frame.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    parts.push({ text: `FRAME: ${frame.clipName} @ ${frame.timestampSeconds.toFixed(2)}s / duration ${frame.duration.toFixed(2)}s` });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.25, responseMimeType: "application/json" } })
  });
  const text = await response.text();
  if (!response.ok) { const err = new Error(`Gemini request failed (${response.status}).`); (err as Error & { status?: number }).status = response.status; throw err; }
  const data = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return cleanJson(data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n") || "");
}

async function callOpenAI(apiKey: string, prompt: string, frames: Frame[]) {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const frame of frames.slice(0, 18)) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl, detail: "low" } });
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.25, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }) });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return cleanJson(data.choices?.[0]?.message?.content || "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: string; editType?: string; format?: string; vibe?: string; category?: string; creativeDirection?: string; hookEnabled?: boolean; hookText?: string; reference?: string; frames?: Frame[] };
    const frames = Array.isArray(body.frames) ? body.frames.filter(f => f?.imageDataUrl && f?.clipName) : [];
    if (!frames.length) return NextResponse.json({ error: "No usable video frames were supplied." }, { status: 400 });

    const category = body.category || "Other";
    const hookEnabled = body.hookEnabled !== false;
    const frameIndex = frames.map((f, i) => `${i + 1}. ${f.clipName} @ ${f.timestampSeconds.toFixed(2)}s / ${f.duration.toFixed(2)}s`).join("\n");
    const prompt = `You are EDITIO, an expert short-form video editor. You are given sampled frames from every uploaded video. Your job is to produce the COMPLETE edit plan for a ready-to-post vertical Reel.

INPUT
Category: ${category}
Vibe: ${body.vibe || "Fast & punchy"}
Format: ${body.format || "Instagram Reel"}
Creator direction: ${body.creativeDirection || "Use your best editorial judgement."}
Hook requested: ${hookEnabled ? "YES — create one only if it improves the opening" : "NO"}
Creator hook text override: ${body.hookText || "none"}
Reference style note/URL: ${body.reference || "none"}
Available frames:\n${frameIndex}

EDITORIAL HIERARCHY — follow this before anything else
1. REAL HERO EVENT / PAYOFF
2. ACTION that leads directly into it
3. REACTION / aftermath
4. SETUP / context
5. Everything else is optional and should be removed.
Never choose a pretty but irrelevant shot over the actual payoff. Never end a reel with the hero just because it occurs late in the source. If the hero occurs late, reach it efficiently and make it the climax, then use reaction/ending if useful.

CRICKET SPECIAL RULE
If the footage contains an actual wicket/dismissal/catch/boundary/decisive result, that real play is the HERO. A celebration alone is NOT the hero. Build delivery/setup → actual wicket/action → reaction/replay when supported. Keep bowler + batsman + pitch/wicket/ball context visible whenever the source allows. Prefer a slightly wider/zoom-out framing over a dramatic crop that hides the action. If another angle of the same event exists, use it as a replay rather than unrelated filler.

GENERAL EDITING BRAIN
- Inspect all frames and reason from what is visibly supported; never invent events, dialogue, people, scores, products or results.
- AI decides exact clip order; do not simply follow upload order.
- Remove dead time, shaky starts, camera searches, duplicate moments, empty frames, phone UI and accidental tails.
- Aim for 8–24 seconds, usually 12–18 seconds when enough useful footage exists.
- Use 5–8 purposeful segments. Individual cuts should feel intentional, not random.
- Use speed 0.65–0.85 around the hero/impact when it improves readability; 1.10–1.30 only for low-energy setup/dead time.
- Use zoom 1.00 or below when context matters; zoom-in only when it does not hide important subjects. For action, bowler + batsman + pitch/wicket context is more important than a dramatic crop.
- Replay a major moment when useful: repeat the same real event briefly, ideally with a different source angle or a tighter crop, but do not make the reel repetitive.
- Transitions should be mostly hard/action-matched cuts. Use flashy transitions only when genuinely appropriate.
- Natural source audio should remain the primary reality layer. If useful, request subtle synthetic SFX cues and a very low-volume background music mood; never let them overpower speech or real action.
- Text is editorial design, not filler. Use it only when it adds context, hook, punchline, or emphasis. Keep it short, elegant, readable, and away from faces, scoreboard and the main action. Never caption every shot just because captions are possible.
- Generate a hook only when it improves retention. Examples of style, not mandatory wording: “WAIT FOR IT…”, “THIS CHANGED EVERYTHING.”, “WHAT A DELIVERY.”
- For spoken content, use captions only when useful; for cricket/action, prefer sparse editorial text over subtitle spam.
- Decide a tasteful color treatment: natural, crisp, warm, cinematic or punchy. Preserve broadcast/source detail.
- Ending must land on the payoff, reaction, or strongest final frame — never an accidental sky/pavilion/empty tail.

AUDIO/SFX
You may choose musicMood: none/hype/cinematic/chill/funny/emotional. This prototype will synthesize a subtle royalty-free-style audio bed, so specify mood rather than a copyrighted song. Add SFX only at meaningful beats (impact, whoosh, pop, record-scratch, crowd, ding). Keep the list sparse.

TEXT STYLES
Use styles clean/bold/cinematic/funny/sports. Position top/center/bottom. Animation pop/fade/slide/none. Do not put important text over the scoreboard or key action. Hook is normally 0–2.5s. Editorial text should land exactly on the moment it refers to.

RETURN JSON ONLY with this exact shape:
{
  "visualSummary":"...",
  "heroMoment":{"clip":"exact filename","timestampSeconds":12.3,"reason":"..."},
  "bestMoments":[{"clip":"exact filename","timestampSeconds":1.2,"reason":"..."}],
  "targetDurationSeconds":16,
  "aspectRatio":"9:16",
  "hook":"short hook or empty string",
  "hookEnabled":true,
  "clipSequence":[{"clip":"exact filename","startSeconds":1.0,"endSeconds":2.4,"reason":"...","speed":1,"zoom":1,"zoomDirection":"none","isHero":false}],
  "textOverlays":[{"text":"WAIT FOR IT…","startSeconds":0.2,"endSeconds":1.8,"kind":"hook","position":"top","style":"bold","animation":"pop"}],
  "captions":[],
  "transitions":[{"afterClip":"exact filename","type":"hard-cut"}],
  "audioDirection":"...",
  "musicMood":"hype",
  "musicIntensity":0.2,
  "sfx":[{"timeSeconds":6.2,"type":"impact","durationSeconds":0.2,"intensity":0.7}],
  "colorDirection":"...",
  "colorPreset":"crisp",
  "ending":"...",
  "coverText":"short cover text or empty",
  "socialCaption":"short copy-ready caption",
  "hashtags":["#...","#..."]
}

CRITICAL: heroMoment must identify the actual main event if one exists, and clipSequence MUST contain that moment. Do not hide the hero at the end. Use exact filenames from the supplied frames.`;

    const provider = (process.env.EDITIO_AI_PROVIDER || "gemini").toLowerCase();
    let raw: RawPlan;
    let providerUsed = provider;
    if (provider === "openai") {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
      raw = await callOpenAI(process.env.OPENAI_API_KEY, prompt, frames);
    } else {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
      let last: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { raw = await callGemini(process.env.GEMINI_API_KEY, DEFAULT_MODEL, prompt, frames); break; }
        catch (e) { last = e; const status = (e as { status?: number })?.status; if (!status || !transientStatuses.has(status) || attempt === 2) throw e; await new Promise(r => setTimeout(r, 700 * (attempt + 1))); }
      }
      if (!raw!) throw last instanceof Error ? last : new Error("AI planner failed.");
    }

    const plan = normalisePlan(raw!, frames, category, hookEnabled);
    return NextResponse.json({ ok: true, provider: providerUsed, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI footage analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
