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

YOUR JOB
Analyze the available footage and produce an editing plan that a video rendering engine can execute. Decide the strongest hook, clip order, trims, pacing, transitions, captions, music/SFX direction, framing/cropping and ending. Prioritize the creator's brief over generic trends.

RETURN JSON ONLY with this shape:
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
