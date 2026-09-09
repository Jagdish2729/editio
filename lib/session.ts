export type EditioUser = {
  name: string;
  identifier: string;
  role: "creator" | "editor";
};

const USER_KEY = "editio_user";
const SESSION_KEY = "editio_session";

export function saveCreatorUser(user: Omit<EditioUser, "role">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, role: "creator" }));
}

export function getUser(): EditioUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as EditioUser; } catch { return null; }
}

export function startSession() {
  if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, "active");
}

export function hasSession() {
  return typeof window !== "undefined" && localStorage.getItem(SESSION_KEY) === "active";
}

export function endSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}
