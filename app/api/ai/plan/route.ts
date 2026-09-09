import { NextResponse } from "next/server";
import { generateAIPlan, type AIEditBrief } from "../../../../lib/ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AIEditBrief;

    if (!body.orderId || !body.editType || !body.format || !body.vibe || !body.clipCount || !Array.isArray(body.clipNames)) {
      return NextResponse.json({ error: "Incomplete AI edit brief." }, { status: 400 });
    }

    const plan = await generateAIPlan(body);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI planning failed.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
