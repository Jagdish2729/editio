import type { AIPlan } from "./orders";

export type EditMode = "ai" | "human" | "both";

export type AIEditBrief = {
  orderId: string;
  editType: string;
  format: string;
  vibe: string;
  brief: string;
  reference?: string;
  clipNames: string[];
  clipCount: number;
};

export function buildAIEditPrompt(input: AIEditBrief) {
  return `You are EDITIO's AI video editor. Create a structured editing plan for the uploaded footage.

ORDER
- ID: ${input.orderId}
- Edit type: ${input.editType}
- Output format: ${input.format}
- Vibe: ${input.vibe}
- Number of clips: ${input.clipCount}
- Clip names: ${input.clipNames.join(", ")}

CREATOR BRIEF
${input.brief || "No extra instructions were provided. Use the selected vibe as the creative direction."}

REFERENCE
${input.reference || "No reference reel provided."}

IMPORTANT
The footage is uploaded separately. For this planning pass, use the supplied clip names and creator brief. Do not invent exact visual events that cannot be verified. Keep cuts conservative when timing is unknown.

YOUR JOB
Create a practical first-cut plan that a rendering engine can execute. Decide the strongest opening direction, clip order, approximate trims, pacing, captions, transitions, audio direction, framing/cropping and ending. Prioritize the creator's brief over generic trends.

RETURN JSON ONLY with this exact shape:
{
  "targetDurationSeconds": number,
  "aspectRatio": "9:16",
  "hook": "string",
  "clipSequence": [{ "clip": "filename", "startSeconds": number, "endSeconds": number, "reason": "string" }],
  "captions": [{ "text": "string", "placement": "top|center|bottom", "style": "string" }],
  "transitions": [{ "afterClip": "filename", "type": "string" }],
  "audioDirection": "string",
  "colorDirection": "string",
  "ending": "string"
}`;
}

export function buildAIJob(input: AIEditBrief) {
  return {
    provider: "openai",
    status: "queued" as const,
    prompt: buildAIEditPrompt(input),
    createdAt: new Date().toISOString(),
  };
}

function cleanJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] || text).trim();
}

export async function generateAIPlan(input: AIEditBrief): Promise<AIPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are EDITIO's structured AI video editing planner. Return valid JSON only." },
        { role: "user", content: buildAIEditPrompt(input) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI provider error (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned an empty plan.");

  return JSON.parse(cleanJson(content)) as AIPlan;
}
