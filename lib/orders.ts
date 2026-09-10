import { getUser } from "./session";

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
  finalRenderStatus?: "not_started" | "rendering" | "ready" | "failed";
  finalError?: string;
  createdAt: string;
  creatorIdentifier?: string;
};

const ORDERS_KEY = "editio_orders";

function getAccountKey() {
  return getUser()?.identifier?.trim().toLowerCase() || null;
}

export function getOrders(): EditOrder[] {
  if (typeof window === "undefined") return [];
  const accountKey = getAccountKey();
  if (!accountKey) return [];

  try {
    const allOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as EditOrder[];
    return allOrders.filter(order => order.creatorIdentifier === accountKey);
  } catch {
    return [];
  }
}

export function createOrder(order: Omit<EditOrder, "id" | "createdAt" | "status">) {
  if (typeof window === "undefined") return null;
  const accountKey = getAccountKey();
  if (!accountKey) return null;

  const next: EditOrder = {
    ...order,
    creatorIdentifier: accountKey,
    id: `ED-${Date.now().toString(36).toUpperCase()}`,
    status: "submitted",
    createdAt: new Date().toISOString(),
  };

  try {
    const allOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as EditOrder[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify([next, ...allOrders]));
  } catch {
    localStorage.setItem(ORDERS_KEY, JSON.stringify([next]));
  }
  return next;
}

export function updateOrder(id: string, patch: Partial<EditOrder>) {
  if (typeof window === "undefined") return null;
  const accountKey = getAccountKey();
  if (!accountKey) return null;

  try {
    const allOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") as EditOrder[];
    const next = allOrders.map(order =>
      order.id === id && order.creatorIdentifier === accountKey
        ? { ...order, ...patch }
        : order
    );
    localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
    return next.find(order => order.id === id && order.creatorIdentifier === accountKey) || null;
  } catch {
    return null;
  }
}
