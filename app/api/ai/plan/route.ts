import { NextResponse } from "next/server";
import { buildAIJob, type AIEditBrief } from "../../../../lib/ai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AIEditBrief;

    if (!body.orderId || !body.editType || !body.format || !body.vibe || !body.clipCount) {
      return NextResponse.json({ error: "Incomplete AI edit brief." }, { status: 400 });
    }

    const job = buildAIJob(body);
    return NextResponse.json({ ok: true, job });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
