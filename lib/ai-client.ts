export type AIPlanResult = {
  targetDurationSeconds: number;
  aspectRatio: string;
  hook: string;
  clipSequence: Array<{ clip: string; startSeconds: number; endSeconds: number; reason: string }>;
  captions: Array<{ text: string; placement: string; style: string }>;
  transitions: Array<{ afterClip: string; type: string }>;
  audioDirection: string;
  colorDirection: string;
  ending: string;
};

export async function requestAIPlan(input: {
  orderId: string;
  editType: string;
  format: string;
  vibe: string;
  brief: string;
  reference?: string;
  clipNames: string[];
  clipCount: number;
}) {
  const response = await fetch("/api/ai/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI planning failed.");
  return data as { ok: true; job: { provider: string; status: string; prompt: string; createdAt: string } };
}
