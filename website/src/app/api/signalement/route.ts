import { NextResponse } from "next/server";
import { clip, getMailConfig, isValidEmail, preformattedHtml, sendMail } from "@/lib/mail/resend";

export const runtime = "nodejs";

const CATEGORIES = ["erreur_chiffre", "erreur_methodologie", "lien_casse", "autre"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL_FR: Record<Category, string> = {
  erreur_chiffre: "Erreur dans un chiffre",
  erreur_methodologie: "Erreur de méthodologie",
  lien_casse: "Lien cassé",
  autre: "Autre",
};

type Body = {
  category?: string;
  page_url?: string;
  element?: string;
  source_contradictoire?: string;
  description?: string;
  contact_email?: string;
  /** Honeypot : si rempli, c'est un bot. Champ caché visuellement, label `website`. */
  website?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Honeypot : drop silently (renvoie un 200 pour pas signaler au bot que c'était filtré).
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const category = (CATEGORIES as readonly string[]).includes(body.category ?? "")
    ? (body.category as Category)
    : "autre";
  const description = clip(body.description, 5000).trim();
  if (description.length < 10) {
    return NextResponse.json({ ok: false, error: "description_too_short" }, { status: 400 });
  }

  const pageUrl = clip(body.page_url, 500).trim();
  const element = clip(body.element, 500).trim();
  const sourceContradictoire = clip(body.source_contradictoire, 1000).trim();
  const contactEmail = clip(body.contact_email, 200).trim();
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const cfg = getMailConfig("signalement");
  if (!cfg.ok) {
    // En prod : erreur visible. Un « merci » sur un message perdu est pire
    // qu'un échec franc — le visiteur a un mailto de repli sous le bouton.
    if (cfg.isProd) {
      console.error(`[signalement] mail non configuré en production (${cfg.reason}) — signalement REFUSÉ`);
      return NextResponse.json({ ok: false, error: "mail_not_configured" }, { status: 503 });
    }
    console.warn(`[signalement] ${cfg.reason} — mode test, payload non envoyé:`, {
      category, pageUrl, element, sourceContradictoire, description, contactEmail,
    });
    return NextResponse.json({ ok: true, dev_mode: true });
  }

  const subject = `[Signalement] ${CATEGORY_LABEL_FR[category]}`;
  const lines = [
    `Catégorie : ${CATEGORY_LABEL_FR[category]}`,
    pageUrl ? `Page concernée : ${pageUrl}` : null,
    element ? `Élément / chiffre : ${element}` : null,
    sourceContradictoire ? `Source contradictoire : ${sourceContradictoire}` : null,
    "",
    "Description :",
    description,
    "",
    contactEmail ? `Contact (optionnel) : ${contactEmail}` : "Contact : non fourni",
  ].filter((l) => l !== null) as string[];
  const text = lines.join("\n");

  try {
    const sent = await sendMail(cfg, { subject, text, html: preformattedHtml(text), replyTo: contactEmail });
    if (!sent.ok) {
      console.error("[signalement] resend.emails.send error:", sent.error);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[signalement] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
}
