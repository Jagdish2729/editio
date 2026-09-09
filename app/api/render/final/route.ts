import { NextResponse } from "next/server";
import { POST as renderReel } from "../draft/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: string; clips?: unknown[]; plan?: unknown };
    if (!body.orderId || !Array.isArray(body.clips) || !body.clips.length) {
      return NextResponse.json({ error: "Final render data is incomplete." }, { status: 400 });
    }

    const renderRequest = new Request(new URL("/api/render/draft", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, outputType: "final" }),
    });
    const response = await renderReel(renderRequest);
    const data = await response.json() as { ok?: boolean; url?: string; error?: string; outputName?: string; usedAiCuts?: boolean };
    if (!response.ok || !data.url) {
      return NextResponse.json({ error: data.error || "Final rendering failed." }, { status: response.status || 500 });
    }

    return NextResponse.json({ ok: true, status: "ready", url: data.url, outputName: data.outputName, usedAiCuts: data.usedAiCuts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Final rendering failed." }, { status: 500 });
  }
}
