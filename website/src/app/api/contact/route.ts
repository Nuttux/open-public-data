import { NextResponse } from "next/server";
import { clip, getMailConfig, isValidEmail, preformattedHtml, sendMail } from "@/lib/mail/resend";

export const runtime = "nodejs";

const TOPICS = ["question", "correction", "presse", "partenariat", "autre"] as const;
type Topic = (typeof TOPICS)[number];

const TOPIC_LABEL_FR: Record<Topic, string> = {
  question: "Question sur les données",
  correction: "Correction ou erreur",
  presse: "Presse",
  partenariat: "Collectivité / partenariat",
  autre: "Autre",
};

type Body = {
  name?: string;
  email?: string;
  topic?: string;
  message?: string;
  page_url?: string;
  /** Honeypot : si rempli, c'est un bot. */
  website?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = clip(body.email, 200).trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  const message = clip(body.message, 5000).trim();
  if (message.length < 10) {
    return NextResponse.json({ ok: false, error: "message_too_short" }, { status: 400 });
  }
  const name = clip(body.name, 120).trim();
  const topic = (TOPICS as readonly string[]).includes(body.topic ?? "") ? (body.topic as Topic) : "autre";
  const pageUrl = clip(body.page_url, 500).trim();

  const cfg = getMailConfig("contact");
  if (!cfg.ok) {
    if (cfg.isProd) {
      console.error(`[contact] mail non configuré en production (${cfg.reason}) — message REFUSÉ`);
      return NextResponse.json({ ok: false, error: "mail_not_configured" }, { status: 503 });
    }
    console.warn(`[contact] ${cfg.reason} — mode test, payload non envoyé:`, { name, email, topic, message });
    return NextResponse.json({ ok: true, dev_mode: true });
  }

  const subject = `[Contact] ${TOPIC_LABEL_FR[topic]} — ${name || email}`;
  const lines = [
    `Sujet : ${TOPIC_LABEL_FR[topic]}`,
    `De : ${name ? `${name} <${email}>` : email}`,
    pageUrl ? `Depuis la page : ${pageUrl}` : null,
    "",
    message,
  ].filter((l) => l !== null) as string[];
  const text = lines.join("\n");

  try {
    const sent = await sendMail(cfg, { subject, text, html: preformattedHtml(text), replyTo: email });
    if (!sent.ok) {
      console.error("[contact] resend.emails.send error:", sent.error);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
}
