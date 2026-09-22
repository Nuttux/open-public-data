/**
 * The data alert (2026-09-16): « Prévenez-moi quand de nouvelles données
 * arrivent ». One address, one confirmation, one list.
 *
 * No database: the confirmation link carries the address and a signature, so
 * the site only stores an address once its owner has clicked. The list itself
 * lives at Resend (an audience), whose broadcasts carry the unsubscribe link.
 *
 * Env:
 *   RESEND_API_KEY        already used by /api/contact and /api/signalement
 *   RESEND_AUDIENCE_ID    the ID of the segment « Qipu — nouvelles données »
 *                         (Resend's « audiences » are now « segments »; the name stayed)
 *   ALERTS_EMAIL_FROM     a sender on a verified domain (alertes@qipu.org);
 *                         falls back to SIGNALEMENT_EMAIL_FROM
 *   ALERTS_SECRET         signs the links; falls back to the API key
 *   NEXT_PUBLIC_DATA_ALERTS="1"  shows the block on the section pages
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EnvLike } from "@/lib/mail/resend";
import { isProductionRuntime } from "@/lib/mail/resend";

/** A link is good for two days: long enough to read one's mail, short enough
 *  that a leaked address cannot be subscribed months later. */
export const TOKEN_TTL_MS = 48 * 3600 * 1000;

export type AlertsConfig =
  | { ok: true; apiKey: string; audienceId: string; from: string; secret: string }
  | { ok: false; reason: "missing_api_key" | "missing_audience" | "missing_sender"; isProd: boolean };

export function getAlertsConfig(env: EnvLike = process.env): AlertsConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  const audienceId = env.RESEND_AUDIENCE_ID?.trim();
  const from = env.ALERTS_EMAIL_FROM?.trim() || env.SIGNALEMENT_EMAIL_FROM?.trim();
  const isProd = isProductionRuntime(env);
  if (!apiKey) return { ok: false, reason: "missing_api_key", isProd };
  if (!audienceId) return { ok: false, reason: "missing_audience", isProd };
  if (!from) return { ok: false, reason: "missing_sender", isProd };
  return { ok: true, apiKey, audienceId, from, secret: env.ALERTS_SECRET?.trim() || apiKey };
}

/** Lower-cased, trimmed: the same address never becomes two contacts. */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function sign(secret: string, email: string, ts: number, lang: string): string {
  return createHmac("sha256", secret).update(`${email}\n${ts}\n${lang}`).digest("base64url");
}

export type Token = { e: string; t: number; l: string; s: string };

export function makeToken(secret: string, email: string, lang: string, now = Date.now()): Token {
  const e = normalizeEmail(email);
  return { e, t: now, l: lang, s: sign(secret, e, now, lang) };
}

export function tokenToQuery(tok: Token): string {
  return new URLSearchParams({ e: tok.e, t: String(tok.t), l: tok.l, s: tok.s }).toString();
}

export type Verified = { ok: true; email: string; lang: string } | { ok: false; reason: "invalid" | "expired" };

/** Reads a link back: the signature must match, and the link must be young. */
export function verifyToken(secret: string, q: URLSearchParams, now = Date.now()): Verified {
  const e = q.get("e") ?? "";
  const t = Number(q.get("t") ?? "");
  const l = q.get("l") ?? "fr";
  const s = q.get("s") ?? "";
  if (!e || !Number.isFinite(t) || !s) return { ok: false, reason: "invalid" };
  const expected = sign(secret, normalizeEmail(e), t, l);
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (now - t > TOKEN_TTL_MS || t > now + 60_000) return { ok: false, reason: "expired" };
  return { ok: true, email: normalizeEmail(e), lang: l === "en" ? "en" : "fr" };
}
