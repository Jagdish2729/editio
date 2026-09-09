import { NextResponse } from "next/server";
import type { VideoFrame } from "../../../../lib/video-analysis";

export const runtime = "nodejs";

type AnalyzeRequest = {
  orderId: string; editType: string; format: string; vibe: string; brief: string; reference?: string;
  includeHook?: boolean; includeCaptions?: boolean; frames: VideoFrame[];
};

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

function localDraftPlan(body: AnalyzeRequest) {
  const grouped = new Map<string, VideoFrame[]>();
  for (const frame of body.frames) grouped.set(frame.clipName, [...(grouped.get(frame.clipName) || []), frame]);
  const clipSequence = Array.from(grouped.entries()).flatMap(([clip, frames]) => {
    const chosen = frames[Math.floor(frames.length / 2)] || frames[0];
    return chosen ? [{ clip, timestampSeconds: chosen.timestampSeconds, reason: "Development fallback selected a representative point from this uploaded clip." }] : [];
  });
  return {
    visualSummary: "Development draft plan generated locally. A real AI provider can replace this with visual moment selection.",
    bestMoments: clipSequence.map(item => ({ ...item })),
    targetDurationSeconds: Math.min(20, Math.max(6, clipSequence.length * 6)),
    aspectRatio: "9:16",
    hook: body.includeHook ? (body.brief ? body.brief.slice(0, 70) : `${body.vibe} — watch this`) : "",
    clipSequence,
    captions: body.includeCaptions ? [{ text: body.brief ? body.brief.slice(0, 55) : "Wait for it…", placement: "bottom", style: "bold", startSeconds: 0, endSeconds: 4 }] : [],
    captionIdeas: body.includeCaptions ? [body.brief ? body.brief.slice(0, 55) : "Wait for it…"] : [],
    transitions: [], transitionDirection: "Clean cuts",
    audioDirection: "Keep source audio. No music added by EDITIO.",
    colorDirection: "Natural source look.", ending: "End on the strongest available moment."
  };
}

function isPlaceholderKey(key: string | undefined) {
  if (!key) return true;
  const normalized = key.trim().toLowerCase();
  return normalized === "your_api_key_here" || normalized.includes("your_api_key") || normalized.includes("replace_with");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    if (!body.orderId || !body.format || !body.vibe || !body.frames?.length) return NextResponse.json({ error: "Missing edit brief or video frames." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    const useLocalFallback = process.env.EDITIO_AI_FALLBACK !== "false";
    if (isPlaceholderKey(apiKey)) {
      if (!useLocalFallback) return NextResponse.json({ error: "OPENAI_API_KEY is not configured. Add a real API key to .env.local." }, { status: 503 });
      return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", fallback: true });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const frameText = body.frames.map((frame, index) => `Frame ${index + 1}: clip=${frame.clipName}, timestamp=${frame.timestampSeconds}s`).join("\n");
    const hookInstruction = body.includeHook ? "Generate one short, punchy opening hook to display in the first 2–3 seconds." : "Do not add an opening hook.";
    const captionInstruction = body.includeCaptions ? "Generate 1–4 concise on-screen caption lines with approximate startSeconds/endSeconds, matched to the footage and brief." : "Do not add on-screen captions.";
    const content: Array<Record<string, unknown>> = [{ type: "text", text: `You are EDITIO's visual AI video editor. Analyze the supplied frames from the creator's actual footage and create a practical first-cut plan.\n\nORDER: ${body.orderId}\nEDIT TYPE: ${body.editType}\nFORMAT: ${body.format}\nVIBE: ${body.vibe}\nCREATOR BRIEF: ${body.brief || "Use the selected vibe as the creative direction."}\nREFERENCE: ${body.reference || "None"}\nHOOK: ${body.includeHook ? "YES" : "NO"}\nCAPTIONS: ${body.includeCaptions ? "YES" : "NO"}\n\n${hookInstruction}\n${captionInstruction}\nNo music should be added; keep source audio.\n\n${frameText}\n\nOnly recommend moments visually supported by the supplied frames. Treat timestamps as approximate anchors. Build a useful short-form sequence, not a single arbitrary moment. Prefer a strong opening and remove dead space. Return JSON only with: {\"visualSummary\":\"string\",\"bestMoments\":[{\"clip\":\"filename\",\"timestampSeconds\":number,\"reason\":\"string\"}],\"targetDurationSeconds\":number,\"aspectRatio\":\"9:16\",\"hook\":\"string or empty\",\"clipSequence\":[{\"clip\":\"filename\",\"timestampSeconds\":number,\"reason\":\"string\"}],\"captions\":[{\"text\":\"string\",\"placement\":\"bottom|center|top\",\"style\":\"bold|clean\",\"startSeconds\":number,\"endSeconds\":number}],\"captionIdeas\":[\"string\"],\"transitionDirection\":\"string\",\"audioDirection\":\"Keep source audio only\",\"colorDirection\":\"string\",\"ending\":\"string\"}` }];
    for (const frame of body.frames.slice(0, 12)) content.push({ type: "image_url", image_url: { url: frame.imageDataUrl } });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: "You create concise, production-ready editing plans. Never invent visual details that are not supported by the frames." },
        { role: "user", content },
      ] }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (useLocalFallback && (response.status === 401 || response.status === 403)) return NextResponse.json({ ok: true, plan: localDraftPlan(body), model: "editio-local-draft-planner", fallback: true });
      return NextResponse.json({ error: data?.error?.message || "AI analysis failed." }, { status: 502 });
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ error: "AI returned an empty analysis." }, { status: 502 });
    return NextResponse.json({ ok: true, plan: parseJson(text), model, fallback: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed." }, { status: 500 });
  }
}
