/**
 * Envoi de mail transactionnel (Resend) — une seule porte pour les formulaires
 * du site (/api/signalement, /api/contact).
 *
 * Règle d'honnêteté : en production, une configuration absente est une ERREUR
 * visible pour le visiteur (503), jamais un « merci » sur un message perdu.
 * Le 2026-09-08 on a découvert que la prod n'avait ni RESEND_API_KEY ni
 * SIGNALEMENT_EMAIL_TO : le formulaire de signalement affichait un succès et
 * écrivait le message dans les logs serveur — personne ne les lit.
 *
 * Hors production (preview Vercel, dev local, CI), on accepte le message et on
 * répond `dev_mode: true` : l'interface le dit au visiteur (« reçu en mode
 * test, non envoyé »), et le formulaire reste testable sans clé.
 */
import { Resend } from "resend";

export type MailKind = "signalement" | "contact";

export type MailConfig =
  | { ok: true; apiKey: string; to: string; from: string }
  | { ok: false; reason: "missing_api_key" | "missing_recipient"; isProd: boolean };

/** Sous-ensemble de process.env qui nous concerne — testable avec un objet nu. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

/** Vercel met VERCEL_ENV=production sur www.qipu.org, `preview` sur les branches. */
export function isProductionRuntime(env: EnvLike = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export function getMailConfig(kind: MailKind, env: EnvLike = process.env): MailConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to =
    (kind === "contact" ? env.CONTACT_EMAIL_TO?.trim() : undefined) || env.SIGNALEMENT_EMAIL_TO?.trim();
  const from = env.SIGNALEMENT_EMAIL_FROM?.trim() || "onboarding@resend.dev";
  if (!apiKey) return { ok: false, reason: "missing_api_key", isProd: isProductionRuntime(env) };
  if (!to) return { ok: false, reason: "missing_recipient", isProd: isProductionRuntime(env) };
  return { ok: true, apiKey, to, from };
}

export type MailMessage = { subject: string; text: string; html: string; replyTo?: string };

export async function sendMail(
  cfg: Extract<MailConfig, { ok: true }>,
  msg: MailMessage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = new Resend(cfg.apiKey);
  const result = await resend.emails.send({
    from: cfg.from,
    to: cfg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    replyTo: msg.replyTo || undefined,
  });
  if (result.error) {
    return { ok: false, error: result.error.message ?? String(result.error) };
  }
  return { ok: true };
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function clip(s: string | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Corps monospace pré-formaté, même rendu pour tous les formulaires. */
export function preformattedHtml(text: string): string {
  return `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap;">${escapeHtml(text)}</pre>`;
}
