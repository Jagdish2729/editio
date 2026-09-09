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
