import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAlertsConfig, verifyToken } from "@/lib/abonnement/token";

export const runtime = "nodejs";

/**
 * Step two of the data alert: the reader clicked the link in the mail. The
 * signature and the age of the link are checked, then the address joins the
 * Resend audience. The reader lands on /abonnement with one of three states:
 * confirme, lien-expire, erreur. Nothing is indexable here (an API route).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("l") === "en" ? "en" : "fr";
  const page = lang === "en" ? "/en/alerts" : "/fr/abonnement";
  const back = (state: string) => NextResponse.redirect(new URL(`${page}?etat=${state}`, url.origin), 303);

  const cfg = getAlertsConfig();
  if (!cfg.ok) {
    console.error(`[abonnement] confirmation sans configuration (${cfg.reason})`);
    return back("erreur");
  }
  const v = verifyToken(cfg.secret, url.searchParams);
  if (!v.ok) return back(v.reason === "expired" ? "lien-expire" : "erreur");

  try {
    const resend = new Resend(cfg.apiKey);
    const res = await resend.contacts.create({ audienceId: cfg.audienceId, email: v.email, unsubscribed: false });
    // An address already on the list is not an error: the reader clicked twice.
    if (res.error && !/already|exists|duplicate/i.test(res.error.message ?? "")) {
      console.error("[abonnement] resend.contacts.create error:", res.error);
      return back("erreur");
    }
    return back("confirme");
  } catch (err) {
    console.error("[abonnement] unexpected error:", err);
    return back("erreur");
  }
}
