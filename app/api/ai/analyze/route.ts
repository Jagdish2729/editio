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
  frames: VideoFrame[];
};

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    if (!body.orderId || !body.format || !body.vibe || !body.frames?.length) {
      return NextResponse.json({ error: "Missing edit brief or video frames." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const frameText = body.frames.map((frame, index) =>
      `Frame ${index + 1}: clip=${frame.clipName}, timestamp=${frame.timestampSeconds}s`
    ).join("\n");

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `You are EDITIO's visual AI video editor. Analyze the supplied frames from the creator's actual footage and create a practical first-cut plan.\n\nORDER: ${body.orderId}\nEDIT TYPE: ${body.editType}\nFORMAT: ${body.format}\nVIBE: ${body.vibe}\nCREATOR BRIEF: ${body.brief || "Use the selected vibe as the creative direction."}\nREFERENCE: ${body.reference || "None"}\n\n${frameText}\n\nImportant: Only recommend moments that are visually supported by the supplied frames. Treat timestamps as approximate anchors, not exact cut boundaries. Prefer a strong opening hook, coherent sequence, fast pacing when requested, and 9:16 framing. Return JSON only with: {\"visualSummary\":\"string\",\"bestMoments\":[{\"clip\":\"filename\",\"timestampSeconds\":number,\"reason\":\"string\"}],\"targetDurationSeconds\":number,\"hook\":\"string\",\"clipSequence\":[{\"clip\":\"filename\",\"timestampSeconds\":number,\"reason\":\"string\"}],\"captionIdeas\":[\"string\"],\"transitionDirection\":\"string\",\"audioDirection\":\"string\",\"colorDirection\":\"string\",\"ending\":\"string\"}`,
      },
    ];

    for (const frame of body.frames.slice(0, 12)) {
      content.push({ type: "image_url", image_url: { url: frame.imageDataUrl } });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You create concise, production-ready editing plans. Never invent visual details that are not supported by the frames." },
          { role: "user", content },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || "AI analysis failed." }, { status: 502 });
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ error: "AI returned an empty analysis." }, { status: 502 });

    return NextResponse.json({ ok: true, plan: parseJson(text), model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI analysis failed." }, { status: 500 });
  }
}
