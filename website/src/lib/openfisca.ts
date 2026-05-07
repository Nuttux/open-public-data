/**
 * OpenFisca-France integration — calcul fiscal exact (Phase 5 MVP).
 *
 * OpenFisca-France est le moteur officiel open-source maintenu par Etalab/DINUM,
 * utilisé par Mes Aides, Mes Allocations, etc. Il encode l'intégralité du Code
 * général des impôts + Code de la Sécu + barèmes URSSAF (cotisations, CSG, IR
 * avec décote/plafond demi-part/niches).
 *
 * API publique gratuite, pas de clé requise. Latence typique 1-3s par requête,
 * disponibilité non garantie. C'est pour ça qu'on l'expose en couche optionnelle
 * "opt-in" : l'utilisateur clique pour activer le calcul certifié, et on tombe
 * sur le calcul JS local en cas de timeout/erreur.
 *
 * Endpoint : `https://api.fr.openfisca.org/latest/calculate`
 * Version (au moment de l'écriture) : openfisca-france@175.0.40
 *
 * Limitations Phase 5 MVP :
 *  - Profil **salarié uniquement** (les autres sources : pension, capital,
 *    indépendant restent en calcul JS local).
 *  - **Pas de TVA** : OpenFisca ne calcule pas la TVA effectivement payée.
 *    On garde l'estimation INSEE 10,4 % pour ce poste.
 *  - Conversion net→brut via ratio 1/0,778 (cohérent avec le seed actuel).
 */

const OPENFISCA_BASE = "https://api.fr.openfisca.org/latest";
const OPENFISCA_TIMEOUT_MS = 5000;

/** Ratio net→brut moyen cadre (cohérent seed_fiscal_constants.csv). */
const NET_TO_BRUT_RATIO = 1 / 0.778;

/** Taux de TVA effective sur revenu disponible (estimation INSEE). */
const TVA_TAUX_EFFECTIF_DEFAULT = 0.104;

// ─── Types ───────────────────────────────────────────────────────────────

/** Profil utilisateur côté UI (avant conversion net→brut). */
export type OpenFiscaProfile = {
  /** Salaire net mensuel après cotisations (avant IR). En €. */
  salaireMonthly: number;
  /** Nombre de parts fiscales (1 = célibataire, 2 = couple, +0.5/enfant). */
  parts: number;
  /** Année de naissance (par défaut 1985 si non fournie). */
  anneeNaissance?: number;
  /** Code INSEE 5 chiffres de la commune (par défaut Paris 75056). */
  departementInsee?: string;
};

/** Payload Situation envoyé à OpenFisca. */
export type OpenFiscaPayload = {
  individus: Record<string, Record<string, Record<string, number | string | null>>>;
  menages: Record<string, Record<string, unknown>>;
  foyers_fiscaux: Record<string, Record<string, unknown>>;
  familles: Record<string, Record<string, unknown>>;
};

/** Réponse brute OpenFisca (mêmes clés que le payload, valeurs computées). */
export type OpenFiscaResponse = {
  individus: Record<string, Record<string, unknown>>;
  menages: Record<string, Record<string, unknown>>;
  foyers_fiscaux: Record<string, Record<string, unknown>>;
  familles: Record<string, Record<string, unknown>>;
};

/** Breakdown final (mêmes champs que `DailyBreadBreakdown` JS local). */
export type OpenFiscaBreakdown = {
  cotisations_sal: number;
  csg: number;
  ir: number;
  tva_estimee: number;
  total: number;
  /** Métadonnées pour debug / affichage. */
  meta: {
    salaire_imposable: number;
    salaire_super_brut: number;
    revenu_disponible: number;
    api_version_marker: string;
  };
};

// ─── Build payload ───────────────────────────────────────────────────────

const MONTHS_2025 = [
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
  "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
] as const;

/**
 * Build a Situation payload for a salaried profile.
 *
 * Convention : `salaire_de_base` est le brut **annuel** indiqué pour la
 * période "2025" (OF répartit automatiquement sur 12 mois). Les variables
 * de période MONTH (cotisations_salariales, csg_*, crds_salaire,
 * salaire_imposable) sont demandées sur les 12 mois pour récupérer la
 * valeur annuelle (somme côté client).
 */
export function buildOpenFiscaPayload(profile: OpenFiscaProfile): OpenFiscaPayload {
  const brutAnnuel = Math.round(profile.salaireMonthly * 12 * NET_TO_BRUT_RATIO);
  const annee = profile.anneeNaissance ?? 1985;
  const insee = (profile.departementInsee || "75056").padStart(5, "0").slice(0, 5);

  // Demande monthly ouputs for variables defined per MONTH
  const monthlyNulls = Object.fromEntries(MONTHS_2025.map((m) => [m, null]));

  return {
    individus: {
      demandeur: {
        salaire_de_base: { "2025": brutAnnuel },
        date_naissance: { ETERNITY: `${annee}-01-01` },
        salaire_imposable: { ...monthlyNulls },
        salaire_super_brut: { ...monthlyNulls },
        csg_imposable_salaire: { ...monthlyNulls },
        csg_deductible_salaire: { ...monthlyNulls },
        crds_salaire: { ...monthlyNulls },
        cotisations_salariales: { ...monthlyNulls },
      },
    },
    menages: {
      menage_1: {
        personne_de_reference: ["demandeur"],
        depcom: { "2025": insee },
        revenu_disponible: { "2025": null },
      },
    },
    foyers_fiscaux: {
      fofi_1: {
        declarants: ["demandeur"],
        nbptr: { "2025": profile.parts },
        impot_revenu_restant_a_payer: { "2025": null },
        irpp_economique: { "2025": null },
      },
    },
    familles: {
      fam_1: {
        parents: ["demandeur"],
      },
    },
  };
}

// ─── Call API ────────────────────────────────────────────────────────────

/**
 * POST the payload to OpenFisca. Throws on timeout / network / non-2xx.
 *
 * @param payload Full Situation payload (use `buildOpenFiscaPayload`).
 * @param timeoutMs Override default 5s timeout (kept short to fail fast).
 */
export async function callOpenFisca(
  payload: OpenFiscaPayload,
  timeoutMs: number = OPENFISCA_TIMEOUT_MS,
): Promise<OpenFiscaResponse> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENFISCA_BASE}/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OpenFisca HTTP ${res.status}: ${txt.slice(0, 500)}`);
    }
    return (await res.json()) as OpenFiscaResponse;
  } finally {
    clearTimeout(tid);
  }
}

// ─── Map response → breakdown ────────────────────────────────────────────

/**
 * Sum 12 monthly values from a `{ "2025-01": x, "2025-02": y, ... }` map.
 * Returns 0 if the map is missing or contains non-numbers.
 */
function sumMonthly(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  let s = 0;
  for (const m of MONTHS_2025) {
    const v = obj[m];
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

function pickAnnual(node: unknown, year = "2025"): number {
  if (typeof node === "number" && Number.isFinite(node)) return node;
  if (!node || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  const v = obj[year];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Map an OpenFisca calculate response to the internal `Breakdown` shape.
 *
 * Conventions OpenFisca :
 *  - Les cotisations/CSG/CRDS sont retournées **négatives** (= à payer).
 *  - L'IR (`impot_revenu_restant_a_payer`) est négatif (= à payer).
 *  - On prend la valeur absolue pour exposer un "montant prélevé" positif.
 *
 * TVA : OpenFisca ne la calcule pas — on applique le taux INSEE 10,4 % sur
 * le revenu disponible (cohérent avec le calcul JS local).
 *
 * @param response Réponse brute OpenFisca.
 * @param tvaTauxEffectif Taux TVA effective sur revenu disponible (par défaut 10,4 %).
 */
export function formatOpenFiscaToBreakdown(
  response: OpenFiscaResponse,
  tvaTauxEffectif: number = TVA_TAUX_EFFECTIF_DEFAULT,
): OpenFiscaBreakdown {
  const ind = response.individus?.demandeur ?? {};
  const fofi = response.foyers_fiscaux?.fofi_1 ?? {};
  const menage = response.menages?.menage_1 ?? {};

  const cotisations_sal = Math.abs(sumMonthly(ind.cotisations_salariales));
  const csg_imp = Math.abs(sumMonthly(ind.csg_imposable_salaire));
  const csg_ded = Math.abs(sumMonthly(ind.csg_deductible_salaire));
  const crds = Math.abs(sumMonthly(ind.crds_salaire));
  const csg = csg_imp + csg_ded + crds;

  const ir = Math.abs(pickAnnual(fofi.impot_revenu_restant_a_payer));

  const salaire_imposable = sumMonthly(ind.salaire_imposable);
  const salaire_super_brut = sumMonthly(ind.salaire_super_brut);
  const revenu_disponible = pickAnnual(menage.revenu_disponible);

  const tva_estimee = Math.max(0, revenu_disponible) * tvaTauxEffectif;
  const total = cotisations_sal + csg + ir + tva_estimee;

  return {
    cotisations_sal,
    csg,
    ir,
    tva_estimee,
    total,
    meta: {
      salaire_imposable,
      salaire_super_brut,
      revenu_disponible,
      api_version_marker: "openfisca-france (latest)",
    },
  };
}

// ─── High-level helper ───────────────────────────────────────────────────

/**
 * One-shot helper : profile → breakdown. Wraps payload build + API call +
 * mapping. Caller should catch errors and fallback to JS local breakdown.
 */
export async function computeBreakdownOpenFisca(
  profile: OpenFiscaProfile,
  tvaTauxEffectif?: number,
): Promise<OpenFiscaBreakdown> {
  const payload = buildOpenFiscaPayload(profile);
  const response = await callOpenFisca(payload);
  return formatOpenFiscaToBreakdown(response, tvaTauxEffectif);
}
