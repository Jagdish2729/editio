export type AIPlan = {
  targetDurationSeconds: number;
  aspectRatio: "9:16" | string;
  hook: string;
  clipSequence: Array<{ clip: string; startSeconds: number; endSeconds: number; reason: string }>;
  captions: Array<{ text: string; placement: string; style: string }>;
  transitions: Array<{ afterClip: string; type: string }>;
  audioDirection: string;
  colorDirection: string;
  ending: string;
};

export type EditOrder = {
  id: string;
  mode: "ai" | "human" | "both";
  modeLabel: string;
  format: string;
  vibe: string;
  brief: string;
  reference: string;
  clipNames: string[];
  clipUrls?: string[];
  clipCount: number;
  status: "submitted" | "processing" | "in_review" | "completed";
  aiStatus?: "not_started" | "queued" | "ready" | "failed";
  aiPlan?: AIPlan;
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
