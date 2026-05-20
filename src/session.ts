import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { env } from "./config.js";

const COOKIE_NAME = "pxr_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionData {
  oauthState?: string;
  patreonUserId?: string;
  patreonAccessToken?: string;
  patreonFullName?: string;
  discordUserId?: string;
  discordAccessToken?: string;
  isCreator?: boolean;
  campaignId?: string;
  guildId?: string;
}

function sign(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
}

function encode(data: SessionData): string {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(value: string): SessionData | null {
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionData;
  } catch {
    return null;
  }
}

export function getSession(c: Context): SessionData {
  const raw = getCookie(c, COOKIE_NAME);
  if (!raw) return {};
  return decode(raw) ?? {};
}

export function setSession(c: Context, data: SessionData): void {
  setCookie(c, COOKIE_NAME, encode(data), {
    httpOnly: true,
    secure: env.APP_BASE_URL.startsWith("https"),
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}
