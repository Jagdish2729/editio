export type AIPlan = {
  visualSummary?: string;
  bestMoments?: Array<{ clip: string; timestampSeconds: number; reason: string }>;
  targetDurationSeconds: number;
  aspectRatio?: "9:16" | string;
  hook: string;
  clipSequence: Array<{ clip: string; startSeconds?: number; endSeconds?: number; timestampSeconds?: number; reason: string }>;
  captions?: Array<{ text: string; placement: string; style: string; startSeconds?: number; endSeconds?: number }>;
  captionIdeas?: string[];
  transitions?: Array<{ afterClip: string; type: string }>;
  transitionDirection?: string;
  audioDirection: string;
  colorDirection: string;
  ending: string;
};

export type EditMode = "ai" | "human" | "both";

export type EditOrder = {
  id: string;
  mode: EditMode;
  modeLabel: string;
  format: string;
  vibe: string;
  brief: string;
  reference: string;
  includeHook?: boolean;
  includeCaptions?: boolean;
  clipNames: string[];
  clipUrls?: string[];
  clipCount: number;
  status: "submitted" | "processing" | "in_review" | "revision_requested" | "completed";
  aiStatus?: "not_started" | "queued" | "analyzing" | "ready" | "failed";
  aiPlan?: AIPlan;
  aiError?: string;
  draftUrl?: string;
  finalUrl?: string;
  revisionNote?: string;
  revisionCount?: number;
  renderStatus?: "not_started" | "rendering" | "ready" | "failed";
  createdAt: string;
};

const ORDERS_KEY = "editio_orders";

export function getOrders(): EditOrder[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as EditOrder[];
  } catch {
    return [];
  }
}

export function createOrder(order: Omit<EditOrder, "id" | "createdAt" | "status">) {
  if (typeof window === "undefined") return null;
  const next: EditOrder = {
    ...order,
    id: `ED-${Date.now().toString(36).toUpperCase()}`,
    status: "submitted",
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ORDERS_KEY, JSON.stringify([next, ...getOrders()]));
  return next;
}

export function updateOrder(id: string, patch: Partial<EditOrder>) {
  if (typeof window === "undefined") return null;
  const next = getOrders().map(order => order.id === id ? { ...order, ...patch } : order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  return next.find(order => order.id === id) || null;
}
