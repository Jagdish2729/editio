export type EditioUser = {
  name: string;
  identifier: string;
  passwordHash?: string;
  role: "creator" | "editor";
};

const USER_KEY = "editio_user";
const SESSION_KEY = "editio_session";

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function saveCreatorUser(user: Omit<EditioUser, "role" | "passwordHash">, password: string) {
  if (typeof window === "undefined") return;
  const passwordHash = await hashPassword(password);
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, passwordHash, role: "creator" }));
}

export function getUser(): EditioUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as EditioUser; } catch { return null; }
}

export async function validateCreatorLogin(identifier: string, password: string) {
  const user = getUser();
  if (!user || user.identifier.toLowerCase() !== identifier.trim().toLowerCase() || !user.passwordHash) return false;
  return user.passwordHash === await hashPassword(password);
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
