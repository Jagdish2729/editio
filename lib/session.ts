export type EditioUser = {
  name: string;
  identifier: string;
  passwordHash?: string;
  role: "creator" | "editor";
  aiFreeCreditUsed?: boolean;
};

const USER_KEY = "editio_user";
const SESSION_KEY = "editio_session";
const AI_CREDIT_KEY = "editio_ai_credit_usage";

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function accountKey(identifier: string) {
  return identifier.trim().toLowerCase();
}

function readCreditUsage(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(AI_CREDIT_KEY) || "{}") as Record<string, boolean>; } catch { return {}; }
}

function writeCreditUsage(usage: Record<string, boolean>) {
  if (typeof window !== "undefined") localStorage.setItem(AI_CREDIT_KEY, JSON.stringify(usage));
}

export async function saveCreatorUser(user: Omit<EditioUser, "role" | "passwordHash">, password: string) {
  if (typeof window === "undefined") return;
  const passwordHash = await hashPassword(password);
  const key = accountKey(user.identifier);
  const usage = readCreditUsage();
  if (usage[key] === undefined) usage[key] = false;
  writeCreditUsage(usage);
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, passwordHash, role: "creator", aiFreeCreditUsed: usage[key] }));
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

export function hasFreeAiCredit() {
  const user = getUser();
  if (!user) return false;
  return readCreditUsage()[accountKey(user.identifier)] !== true;
}

export function consumeFreeAiCredit() {
  if (typeof window === "undefined") return false;
  const user = getUser();
  if (!user) return false;
  const usage = readCreditUsage();
  const key = accountKey(user.identifier);
  if (usage[key] === true) return false;
  usage[key] = true;
  writeCreditUsage(usage);
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, aiFreeCreditUsed: true }));
  return true;
}

export function endSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}
