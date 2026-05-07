/**
 * POST /api/openfisca-calc
 *
 * Wraps the OpenFisca-France public API to compute exact taxes/contributions
 * for a salaried profile. Returns a `Breakdown` shape compatible with the
 * Daily Bread JS local breakdown.
 *
 * Body (JSON, typed strict) :
 *   {
 *     salaireMonthly: number,       // net mensuel après cotisations (€)
 *     parts: number,                // 1 / 1.5 / 2 / 2.5 / 3 / 4
 *     anneeNaissance?: number,      // ex 1985 (default 1985)
 *     departementInsee?: string     // ex "75056" (default "75056" Paris)
 *   }
 *
 * Response :
 *   - { ok: true, breakdown: OpenFiscaBreakdown } on success
 *   - { ok: false, error: string } on timeout / 5xx / parse error
 *
 * Timeout : 5s. Pas de cache (chaque requête recalcule).
 *
 * Caveats :
 *  - OpenFisca calcule cotis + CSG + IR exhaustivement, mais **pas la TVA**
 *    (estimation INSEE 10,4 % conservée côté serveur).
 *  - Phase 5 MVP : profil **salarié uniquement**. Les autres sources
 *    (pension, capital, indépendant) restent en calcul JS local côté client.
 */

import { NextResponse } from "next/server";
import {
  computeBreakdownOpenFisca,
  type OpenFiscaProfile,
} from "@/lib/openfisca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Partial<OpenFiscaProfile>;

function parseBody(raw: unknown): OpenFiscaProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Body;
  const salaireMonthly = Number(b.salaireMonthly);
  const parts = Number(b.parts);
  if (!Number.isFinite(salaireMonthly) || salaireMonthly <= 0) return null;
  if (!Number.isFinite(parts) || parts < 1 || parts > 10) return null;

  // Bornes raisonnables pour éviter le bombing sur l'API publique
  // (un salaire net > 50k€/mois est traité mais aberrant pédagogiquement).
  const safeSalaire = Math.min(salaireMonthly, 50000);

  const annee =
    typeof b.anneeNaissance === "number" &&
    Number.isFinite(b.anneeNaissance) &&
    b.anneeNaissance >= 1900 &&
    b.anneeNaissance <= 2025
      ? b.anneeNaissance
      : 1985;

  const insee =
    typeof b.departementInsee === "string" &&
    /^\d{5}$/.test(b.departementInsee)
      ? b.departementInsee
      : "75056";

  return {
    salaireMonthly: safeSalaire,
    parts,
    anneeNaissance: annee,
    departementInsee: insee,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const profile = parseBody(body);
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  try {
    const breakdown = await computeBreakdownOpenFisca(profile);
    return NextResponse.json({ ok: true, breakdown });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    // Pas de status 500 — on renvoie 200 avec ok:false pour que le client
    // fallback gracieusement sur le calcul JS local sans déclencher un crash.
    return NextResponse.json({
      ok: false,
      error: msg.includes("aborted") || msg.includes("timeout")
        ? "timeout"
        : "openfisca_unavailable",
      detail: msg.slice(0, 240),
    });
  }
}
