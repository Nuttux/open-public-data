import { NextResponse } from "next/server";
import { Resend } from "resend";

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

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function clip(s: string | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SIGNALEMENT_EMAIL_TO;
  const from = process.env.SIGNALEMENT_EMAIL_FROM ?? "onboarding@resend.dev";

  // Pas de clé en local/preview ? On accepte le payload et on log — évite de
  // casser le form en dev, et le user peut quand même tester l'UX.
  if (!apiKey || !to) {
    console.warn("[signalement] RESEND_API_KEY ou SIGNALEMENT_EMAIL_TO absent — payload non envoyé:", {
      category,
      pageUrl,
      element,
      sourceContradictoire,
      description,
      contactEmail,
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
  const html = `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap;">${escapeHtml(text)}</pre>`;

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
      replyTo: contactEmail || undefined,
    });
    if (result.error) {
      console.error("[signalement] resend.emails.send error:", result.error);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[signalement] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
}
