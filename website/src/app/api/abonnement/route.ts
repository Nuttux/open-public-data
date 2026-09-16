import { NextResponse } from "next/server";
import { Resend } from "resend";
import { clip, escapeHtml, isValidEmail } from "@/lib/mail/resend";
import { getAlertsConfig, makeToken, normalizeEmail, tokenToQuery } from "@/lib/abonnement/token";

export const runtime = "nodejs";

/**
 * Step one of the data alert: the reader leaves an address, we send ONE mail
 * with a link to confirm. Nothing is stored until the link is clicked
 * (/api/abonnement/confirmer). Same honesty rule as /api/contact: in
 * production a missing configuration is a visible 503, never a silent « merci ».
 */
type Body = { email?: string; lang?: string; section?: string; page_url?: string; website?: string };

const SECTIONS = new Set(["budget", "marches", "investissements", "subventions", "logement", "dette", "lieux", "hub"]);

function siteOrigin(req: Request): string {
  if (process.env.VERCEL_ENV === "production") return "https://www.qipu.org";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const COPY = {
  fr: {
    subject: "Qipu — confirmez votre adresse",
    intro: "Vous avez demandé à être prévenu quand de nouvelles données sur les finances de Paris arrivent sur qipu.org.",
    cta: "Confirmer mon adresse",
    valid: "Ce lien est valable deux jours. Si vous n'avez rien demandé, ignorez ce message : rien ne sera enregistré.",
    what: "Ensuite : un message quand la Ville publie un nouveau compte, un nouveau budget ou une nouvelle année, jamais plus d'un par semaine, et un lien pour se désinscrire dans chacun.",
  },
  en: {
    subject: "Qipu — confirm your address",
    intro: "You asked to be told when new data on the finances of Paris reaches qipu.org.",
    cta: "Confirm my address",
    valid: "This link works for two days. If you did not ask for this, ignore this message: nothing will be stored.",
    what: "Then: one message when the City publishes a new account, a new budget or a new year, never more than one a week, with an unsubscribe link in each.",
  },
} as const;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // Honeypot: a filled hidden field is a bot; it gets a quiet yes.
  if (body.website && body.website.trim().length > 0) return NextResponse.json({ ok: true });

  const email = normalizeEmail(clip(body.email, 200));
  if (!email || !isValidEmail(email)) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const lang = body.lang === "en" ? "en" : "fr";
  const section = SECTIONS.has(body.section ?? "") ? body.section! : "hub";

  const cfg = getAlertsConfig();
  if (!cfg.ok) {
    if (cfg.isProd) {
      console.error(`[abonnement] non configuré en production (${cfg.reason}) — demande REFUSÉE`);
      return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
    }
    console.warn(`[abonnement] ${cfg.reason} — mode test, aucun mail envoyé:`, { email, lang, section });
    return NextResponse.json({ ok: true, dev_mode: true });
  }

  const link = `${siteOrigin(req)}/api/abonnement/confirmer?${tokenToQuery(makeToken(cfg.secret, email, lang))}`;
  const c = COPY[lang];
  const text = [c.intro, "", `${c.cta} : ${link}`, "", c.valid, "", c.what].join("\n");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;line-height:1.5;color:#111">` +
    `<p>${escapeHtml(c.intro)}</p>` +
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px">${escapeHtml(c.cta)}</a></p>` +
    `<p style="color:#555;font-size:14px">${escapeHtml(c.valid)}</p>` +
    `<p style="color:#555;font-size:14px">${escapeHtml(c.what)}</p></div>`;

  try {
    const resend = new Resend(cfg.apiKey);
    const sent = await resend.emails.send({ from: cfg.from, to: email, subject: c.subject, text, html, tags: [{ name: "kind", value: "alert_confirm" }, { name: "section", value: section }] });
    if (sent.error) {
      console.error("[abonnement] resend.emails.send error:", sent.error);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[abonnement] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
}
