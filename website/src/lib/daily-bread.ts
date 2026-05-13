/**
 * Daily Bread — calculateur fiscal personnalisé.
 *
 * Estime ce qu'un salarié français paie en prélèvements obligatoires
 * (IR + CSG + cotisations + TVA), exprimé en € par jour, ventilé par
 * fonction COFOG (où va l'argent au niveau APU consolidé).
 *
 * **Toutes les valeurs factuelles sont sourcées** depuis le pipeline :
 *   pipeline/seeds/seed_fiscal_constants.csv → daily_bread.json
 * (loaded via `loadDailyBread()` in `@/lib/national-data`).
 *
 * Le but n'est pas le calcul fiscal exact (impossible sans la déclaration
 * complète) mais l'ordre de grandeur — pour donner intuition de "à quoi
 * sert chaque jour de mon salaire". Les approximations sont documentées
 * dans la section caveats du frontend.
 */

import type {
  DailyBreadConstants,
  DailyBreadDeepDiveLocal,
  DailyBreadDeepDiveStack,
} from "@/lib/national-data";

export type DailyBreadInput = {
  /** Salaire net annuel après cotisations salariées (avant IR). En €. */
  net_annuel: number;
  /** Nombre de parts fiscales (1 = célibataire, 2 = couple, +0.5/enfant). */
  parts: number;
};

export type DailyBreadBreakdown = {
  cotisations_sal: number;
  csg: number;
  ir: number;
  tva_estimee: number;
  total: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Reconstruct the IR bracket array (with Infinity as last upper bound)
 * from the sourced JSON. Returns ordered tranches `{ to, rate }`.
 */
function buildIRBaremes(
  baremes: DailyBreadConstants["fiscal_constants"]["ir"]["baremes"],
): Array<{ to: number; rate: number }> {
  const sorted = [...baremes].sort((a, b) => a.tranche - b.tranche);
  return sorted.map((b) => ({
    to: b.seuil_haut_eur_par_part ?? Number.POSITIVE_INFINITY,
    rate: b.taux_marginal,
  }));
}

// ─── IR (with quotient familial + plafonnement) ────────────────────────────

/**
 * Compute IR with abattement 10% frais pro + quotient familial + plafonnement
 * + décote bas revenus.
 *
 * Pipeline complet (article 197 CGI 2025) :
 *   1. Abattement forfaitaire 10% frais professionnels sur net_imposable
 *      (min 504 €, max 14 426 € par membre du foyer — LFI 2025).
 *   2. Bareme par tranche × parts fiscales (quotient familial).
 *   3. Plafonnement avantage demi-parts (1 791 € / demi-part).
 *   4. Décote pour bas revenus :
 *      - célibataire : si IR ≤ 1 964 €, décote = max(0, 889 - 0,4525 × IR)
 *      - couple : si IR ≤ 3 248 €, décote = max(0, 1 470 - 0,4525 × IR)
 *
 * @param net_imposable Net imposable (après CSG déductible).
 * @param parts Number of fiscal parts.
 * @param db Sourced constants from daily_bread.json.
 */
export function computeIR(
  net_imposable: number,
  parts: number,
  db: DailyBreadConstants,
): number {
  if (net_imposable <= 0 || parts <= 0) return 0;
  const ir = db.fiscal_constants.ir;
  const baremes = buildIRBaremes(ir.baremes);
  const plafond_demi_part = ir.plafond_demi_part_eur;

  // 1. Abattement 10% frais professionnels (par membre, plafonné min/max).
  // Si les constantes ne sont pas dispo (ancienne version JSON) on saute.
  // Heuristique nb_membres : foyer = 1 célib, 2 couple, sinon ≈ parts (ne
  // tient pas compte des enfants — limite acceptable, vu que la majorité
  // des revenus salariaux d'un foyer viennent des 1-2 adultes).
  let revenu_apres_abattement = net_imposable;
  if (
    typeof ir.abattement_10pct_taux === "number" &&
    typeof ir.abattement_10pct_min_eur === "number" &&
    typeof ir.abattement_10pct_max_eur === "number"
  ) {
    const nb_membres = parts >= 2 ? 2 : 1;
    const abat_brut = net_imposable * ir.abattement_10pct_taux;
    const abat_min = ir.abattement_10pct_min_eur * nb_membres;
    const abat_max = ir.abattement_10pct_max_eur * nb_membres;
    const abat = Math.min(Math.max(abat_brut, abat_min), abat_max);
    revenu_apres_abattement = Math.max(0, net_imposable - abat);
  }

  // 2. Bareme par parts.
  const quotient = revenu_apres_abattement / parts;
  let ir_par_part = 0;
  let prev = 0;
  for (const { to, rate } of baremes) {
    if (quotient <= prev) break;
    const taxable = Math.min(quotient, to) - prev;
    if (taxable > 0) ir_par_part += taxable * rate;
    if (quotient <= to) break;
    prev = to;
  }
  let ir_brut = ir_par_part * parts;

  // 3. Plafonnement quotient familial : compare avec IR célibataire et limite
  //    l'avantage à PLAFOND × demi-parts supplémentaires.
  if (parts > 1) {
    let ir_seul = 0;
    let p2 = 0;
    for (const { to, rate } of baremes) {
      if (revenu_apres_abattement <= p2) break;
      const taxable = Math.min(revenu_apres_abattement, to) - p2;
      if (taxable > 0) ir_seul += taxable * rate;
      if (revenu_apres_abattement <= to) break;
      p2 = to;
    }
    const demi_parts_supp = (parts - 1) * 2;
    const plafond_avantage = plafond_demi_part * demi_parts_supp;
    const avantage_brut = ir_seul - ir_brut;
    if (avantage_brut > plafond_avantage) {
      ir_brut = ir_seul - plafond_avantage;
    }
  }

  // 4. Décote bas revenus. Couple = parts ≥ 2 (heuristique : on ne distingue
  //    pas couple-avec-enfants vs célib-avec-enfants — limite acceptable).
  if (
    typeof ir.decote_taux === "number" &&
    typeof ir.decote_celibataire_seuil_eur === "number" &&
    typeof ir.decote_celibataire_base_eur === "number" &&
    typeof ir.decote_couple_seuil_eur === "number" &&
    typeof ir.decote_couple_base_eur === "number"
  ) {
    const isCouple = parts >= 2;
    const seuil = isCouple
      ? ir.decote_couple_seuil_eur
      : ir.decote_celibataire_seuil_eur;
    const base = isCouple
      ? ir.decote_couple_base_eur
      : ir.decote_celibataire_base_eur;
    if (ir_brut > 0 && ir_brut <= seuil) {
      const decote = Math.max(0, base - ir.decote_taux * ir_brut);
      ir_brut = Math.max(0, ir_brut - decote);
    }
  }

  return Math.max(0, ir_brut);
}

// ─── Full breakdown ────────────────────────────────────────────────────────

/**
 * Compute total annual contribution (cotisations + CSG + IR + TVA estimée)
 * given a salary, fiscal parts, and the sourced constants.
 */
export function computeBreakdown(
  { net_annuel, parts }: DailyBreadInput,
  db: DailyBreadConstants,
): DailyBreadBreakdown {
  const cotisRate = db.fiscal_constants.cotisations_salariales.taux_hors_csg_moyen;
  const csgTotal = db.fiscal_constants.csg_crds.taux_total_activite;
  const csgAbattement = db.fiscal_constants.csg_crds.assiette_abattement;
  const csgDeductible = db.fiscal_constants.csg_crds.taux_csg_deductible_ir;
  const tvaEffective = db.fiscal_constants.tva.taux_effectif_sur_disponible;

  // Reverse-compute brut from net using both prélèvements (cotisations +
  // CSG/CRDS on abated assiette).
  const brut_estime = net_annuel / (1 - cotisRate - csgTotal * csgAbattement);
  const cotisations_sal = brut_estime * cotisRate;
  const csg = brut_estime * csgTotal * csgAbattement;
  // Part déductible de la CSG (~6,8%/9,2% ≈ 73%) réduit l'assiette IR.
  const csg_deductible_eur = brut_estime * csgDeductible * csgAbattement;
  const net_imposable = Math.max(0, net_annuel - csg_deductible_eur);
  const ir = computeIR(net_imposable, parts, db);
  const net_apres_ir = Math.max(0, net_annuel - ir);
  const tva_estimee = net_apres_ir * tvaEffective;

  const total = cotisations_sal + csg + ir + tva_estimee;
  return { cotisations_sal, csg, ir, tva_estimee, total };
}

// ─── Retraite (pensions) ──────────────────────────────────────────────────

export type DailyBreadBreakdownRetraite = {
  csg_crds_casa: number;
  ir: number;
  tva_estimee: number;
  total: number;
  /** taux CSG/CRDS/CASA appliqué (selon tranche RFR/part) — pour debug/affichage */
  taux_csg_applied: number;
};

/**
 * Sélectionne le taux CSG/CRDS/CASA selon RFR/part (4 tranches URSSAF/BOFiP 2025).
 *
 * NB approximation : on ne dispose pas du RFR exact du foyer ; on l'approxime
 * en première itération comme `pension_brute_annuelle / parts`. Le RFR officiel
 * est calculé sur les revenus N-2 et inclut tous les revenus du foyer.
 * TODO Phase 5 (OpenFisca) : remplacer par calcul RFR exact.
 */
function pickCsgRetraiteTaux(
  rfr_par_part: number,
  tranches: DailyBreadConstants["fiscal_constants"]["csg_retraite"]["tranches"],
): { taux_total: number; taux_csg: number; taux_crds: number; taux_casa: number } {
  const sorted = [...tranches].sort((a, b) => a.tranche - b.tranche);
  for (const t of sorted) {
    const max = t.seuil_rfr_par_part_max ?? Number.POSITIVE_INFINITY;
    if (rfr_par_part > t.seuil_rfr_par_part_min && rfr_par_part <= max) {
      return {
        taux_total: t.taux_total,
        taux_csg: t.taux_csg,
        taux_crds: t.taux_crds,
        taux_casa: t.taux_casa,
      };
    }
  }
  // Fallback : si RFR/part = 0 strictement, première tranche (exonération).
  const first = sorted[0];
  return {
    taux_total: first?.taux_total ?? 0,
    taux_csg: first?.taux_csg ?? 0,
    taux_crds: first?.taux_crds ?? 0,
    taux_casa: first?.taux_casa ?? 0,
  };
}

/**
 * Compute breakdown for a retiree.
 * @param pension_brute_annuelle Pension brute annuelle (avant CSG/CRDS/CASA).
 * @param parts Number of fiscal parts.
 * @param db Sourced constants from daily_bread.json.
 *
 * Hypothèses :
 *  - Pas de cotisations vieillesse (les retraités n'en paient pas).
 *  - CSG/CRDS/CASA : taux selon tranche RFR/part. RFR/part approximé par
 *    `pension_brute / parts × 1,01` (les RFR officiels intègrent un léger
 *    redressement). Approximation documentée — le calcul exact requiert le
 *    RFR N-2 du foyer (TODO OpenFisca).
 *  - IR : abattement 10 % plafonné à `abattement_plafond_eur` par foyer,
 *    plancher `abattement_plancher_eur` par bénéficiaire (CGI 158-5-a).
 *  - TVA : 10,4 % du revenu disponible.
 */
export function computeBreakdownRetraite(
  pension_brute_annuelle: number,
  parts: number,
  db: DailyBreadConstants,
): DailyBreadBreakdownRetraite {
  if (pension_brute_annuelle <= 0 || parts <= 0) {
    return { csg_crds_casa: 0, ir: 0, tva_estimee: 0, total: 0, taux_csg_applied: 0 };
  }

  // Approximation RFR/part : pension brute / parts × 1,01
  // (le RFR officiel inclut généralement un léger redressement vs revenus déclarés).
  // TODO Phase 5 OpenFisca : remplacer par RFR exact.
  const rfr_par_part = (pension_brute_annuelle * 1.01) / parts;
  const csgPick = pickCsgRetraiteTaux(
    rfr_par_part,
    db.fiscal_constants.csg_retraite.tranches,
  );
  const csg_crds_casa = pension_brute_annuelle * csgPick.taux_total;

  // Net imposable IR = pension brute - abattement 10% plafonné à 4 399 € par foyer
  const abat_taux = db.fiscal_constants.pension.abattement_taux;
  const abat_plafond = db.fiscal_constants.pension.abattement_plafond_eur;
  const abat_plancher = db.fiscal_constants.pension.abattement_plancher_eur;
  const abat_brut = pension_brute_annuelle * abat_taux;
  const abattement = Math.min(abat_plafond, Math.max(abat_plancher, abat_brut));
  const net_imposable = Math.max(0, pension_brute_annuelle - abattement);
  const ir = computeIR(net_imposable, parts, db);

  // Revenu disponible : pension brute - CSG/CRDS/CASA - IR
  const net_apres_prel = Math.max(0, pension_brute_annuelle - csg_crds_casa - ir);
  const tvaEffective = db.fiscal_constants.tva.taux_effectif_sur_disponible;
  const tva_estimee = net_apres_prel * tvaEffective;

  const total = csg_crds_casa + ir + tva_estimee;
  return {
    csg_crds_casa,
    ir,
    tva_estimee,
    total,
    taux_csg_applied: csgPick.taux_total,
  };
}

// ─── Capital (dividendes / plus-values via PFU) ───────────────────────────

export type DailyBreadBreakdownCapital = {
  ir: number; // 12,8 % du brut (PFU IR libératoire)
  prelevements_sociaux: number; // 17,2 % du brut
  tva_estimee: number;
  total: number;
};

/**
 * Compute breakdown for capital income (dividendes, intérêts, plus-values
 * mobilières) — PFU 30 % par défaut.
 *
 * Hypothèses :
 *  - PFU : 12,8 % IR + 17,2 % prélèvements sociaux (= 30 % flat).
 *  - Option barème IR + 17,2 % PS non implémentée ici (Phase 5 OpenFisca,
 *    intéressante seulement si TMI < 30 %).
 *  - TVA : on l'applique sur le net (montant brut × 70 %) si l'utilisateur
 *    consomme ce revenu — hypothèse de propension à consommer 100 %, ce
 *    qui est conservateur (les revenus du capital sont plus épargnés en
 *    pratique). Caveat documenté côté UI.
 */
export function computeBreakdownCapital(
  montant_brut_annuel: number,
  db: DailyBreadConstants,
): DailyBreadBreakdownCapital {
  if (montant_brut_annuel <= 0) {
    return { ir: 0, prelevements_sociaux: 0, tva_estimee: 0, total: 0 };
  }
  const pfu_ir = db.fiscal_constants.pfu.taux_ir;
  const pfu_ps = db.fiscal_constants.pfu.taux_prelevements_sociaux;
  const ir = montant_brut_annuel * pfu_ir;
  const prelevements_sociaux = montant_brut_annuel * pfu_ps;
  const net = Math.max(0, montant_brut_annuel - ir - prelevements_sociaux);
  const tvaEffective = db.fiscal_constants.tva.taux_effectif_sur_disponible;
  const tva_estimee = net * tvaEffective;
  const total = ir + prelevements_sociaux + tva_estimee;
  return { ir, prelevements_sociaux, tva_estimee, total };
}

// ─── Indépendant (micro-entrepreneur) ─────────────────────────────────────

export type IndepActivityType = "vente" | "services_bic" | "services_bnc";

export type DailyBreadBreakdownIndep = {
  cotisations_urssaf: number;
  ir: number;
  tva_estimee: number;
  total: number;
  /** Pour info / debug : bénéfice imposable après abattement micro. */
  benefice_imposable: number;
};

/**
 * Compute breakdown for a micro-entrepreneur.
 * @param ca_annuel Chiffre d'affaires annuel HT.
 * @param type "vente" | "services_bic" | "services_bnc"
 * @param parts Nombre de parts fiscales.
 * @param db Sourced constants.
 *
 * Hypothèses :
 *  - Cotisations URSSAF + CFP appliquées sur le CA encaissé (régime micro).
 *  - Bénéfice imposable IR = CA × (1 - abattement_micro). Pas de plancher
 *    305 € appliqué (négligeable aux ordres de grandeur considérés).
 *  - IR : barème normal sur bénéfice imposable, sans autres revenus du
 *    foyer (caveat — le calcul exact intègre les autres revenus).
 *  - TVA : 10,4 % du revenu disponible (CA - cotis - IR).
 *  - Versement libératoire IR non utilisé par défaut (option à activer
 *    en Phase 5 — RFR conditionné).
 *  - TODO Phase 5 OpenFisca : intégrer plancher 305 €, option versement
 *    libératoire, autres revenus du foyer.
 */
export function computeBreakdownIndependant(
  ca_annuel: number,
  type: IndepActivityType,
  parts: number,
  db: DailyBreadConstants,
): DailyBreadBreakdownIndep {
  if (ca_annuel <= 0 || parts <= 0) {
    return {
      cotisations_urssaf: 0,
      ir: 0,
      tva_estimee: 0,
      total: 0,
      benefice_imposable: 0,
    };
  }
  const cotisRate =
    db.fiscal_constants.micro.cotisations[type] +
    db.fiscal_constants.micro.cfp[type];
  const cotisations_urssaf = ca_annuel * cotisRate;

  const abat = db.fiscal_constants.micro.abattements_ir[type];
  const benefice_imposable = ca_annuel * (1 - abat);
  const ir = computeIR(benefice_imposable, parts, db);

  const net_apres_prel = Math.max(0, ca_annuel - cotisations_urssaf - ir);
  const tvaEffective = db.fiscal_constants.tva.taux_effectif_sur_disponible;
  const tva_estimee = net_apres_prel * tvaEffective;

  const total = cotisations_urssaf + ir + tva_estimee;
  return { cotisations_urssaf, ir, tva_estimee, total, benefice_imposable };
}

// ─── COFOG breakdown of public spending ────────────────────────────────────
//
// Apply COFOG ratios (Eurostat FR) to the user's total contribution.
// "For every euro of public spending, X% goes to santé, Y% to retraites…" —
// applied to user's contribution = how much of THEIR money funds each function.

export type CofogShare = {
  code: string;
  label_fr: string;
  label_en: string;
  share: number; // 0..1
  daily_eur: number;
};

/**
 * Build per-COFOG-function share + daily € given user's total annual contribution.
 */
export function computeCofogShares(
  totalAnnuel: number,
  cofogFunctions: Array<{
    code: string;
    label_fr: string;
    label_en: string;
    values_pct_gdp: Record<string, number>;
  }>,
): CofogShare[] {
  const fr_total =
    cofogFunctions.find((f) => f.code === "TOTAL")?.values_pct_gdp.FR ?? 0;
  if (fr_total <= 0) return [];

  const out: CofogShare[] = [];
  for (const fn of cofogFunctions) {
    if (fn.code === "TOTAL") continue;
    const fr_pct = fn.values_pct_gdp.FR ?? 0;
    if (fr_pct <= 0) continue;
    const share = fr_pct / fr_total;
    const daily_eur = (totalAnnuel * share) / 365;
    out.push({
      code: fn.code,
      label_fr: fn.label_fr,
      label_en: fn.label_en,
      share,
      daily_eur,
    });
  }
  out.sort((a, b) => b.share - a.share);
  return out;
}

// ─── Local dimension ───────────────────────────────────────────────────────

/**
 * Estimate how much of the user's annual contribution "ends up" in their
 * commune's budget.
 *
 * APU breakdown (Eurostat S1311 + S1313 + S1314, non-consolidated):
 * - S1311 (État + ODAC) ≈ 37 %
 * - S1314 (Sécu) ≈ 44 %
 * - S1313 (collectivités locales) ≈ 18 %
 *
 * Within S1313, the bloc communal (communes + EPCI) ≈ 55 % (OFGL).
 * → Share user → commune ≈ S1313_share × communal_share × ratio_to_avg
 *
 * `nationalAvgEurHab` is the population-weighted national average of
 * commune-level dépenses €/hab (computed by `export_daily_bread.py` from
 * the OFGL `index.json`).
 */
export function computeLocalShare(
  totalAnnuel: number,
  communeEurHab: number,
  nationalAvgEurHab: number,
  s1313ShareInApu: number,
  blocCommunalShareInApul: number,
): { commune_annual: number; commune_daily: number; ratio_to_avg: number } {
  const local_share_of_total = s1313ShareInApu * blocCommunalShareInApul;
  const ratio = communeEurHab > 0 && nationalAvgEurHab > 0
    ? communeEurHab / nationalAvgEurHab
    : 1;
  const commune_annual = totalAnnuel * local_share_of_total * ratio;
  return {
    commune_annual,
    commune_daily: commune_annual / 365,
    ratio_to_avg: ratio,
  };
}

// ─── Per-institution breakdown (Sécu / État / Local / Reste) ───────────────
//
// Distributes the user's total contribution across the four main institutional
// blocks using Eurostat APU sub-sector shares (gov_10a_main, non-consolidated).

export type InstitutionShare = {
  code: string;
  label_fr: string;
  label_en: string;
  share: number;
  annual_eur: number;
  daily_eur: number;
};

export function computeInstitutionShares(
  totalAnnuel: number,
  db: DailyBreadConstants,
): InstitutionShare[] {
  const inst = db.apu_subsectors.institutions;
  const out: InstitutionShare[] = [];
  for (const code of ["S1314", "S1311", "S1313"]) {
    const i = inst[code];
    if (!i) continue;
    const annual = totalAnnuel * i.share;
    out.push({
      code,
      label_fr: i.label_fr,
      label_en: i.label_en,
      share: i.share,
      annual_eur: annual,
      daily_eur: annual / 365,
    });
  }
  return out;
}

// ─── Dispatch CAUSAL (où VONT réellement les impôts du foyer) ───────────
//
// Contrairement à `computeInstitutionShares` qui utilise les ratios Eurostat
// S13 (proportions des dépenses nationales), le dispatch causal mappe CHAQUE
// composante d'impôt à son AFFECTATAIRE LÉGAL réel :
//
//   - Cotisations sociales (salarié + indép)     → S1314 Sécurité sociale
//   - CSG/CRDS (activité + retraite + capital)   → S1314 Sécurité sociale
//   - PFU prélèvements sociaux 17,2 %             → S1314 Sécurité sociale
//   - Impôt sur le revenu                        → S1311 État central
//   - PFU IR 12,8 %                              → S1311 État central
//   - TVA estimée (45 % État + 31 % Sécu + 24 % Local) — répartition PLF V&M
//   - Taxe foncière                              → S1313 Local (bloc communal)
//
// Cette vue est plus pédagogique pour la promesse "où va MA contribution"
// que la vue proportionnelle Eurostat. Les locataires verront une part Local
// faible (DGF aux collectivités vient de l'État, pas directement d'eux) —
// c'est la réalité causale.

export type InstitutionShareCausalComponent = {
  label_fr: string;
  label_en: string;
  annual_eur: number;
};

export type InstitutionShareCausal = InstitutionShare & {
  /** Détail des impôts qui flow vers cette institution (cotisations, CSG,
   *  IR, TVA part, etc.). Sert à expliquer le calcul dans l'UI. */
  components: InstitutionShareCausalComponent[];
};

export type CausalDispatchInputs = {
  breakdownSalaire?: DailyBreadBreakdown | null;
  breakdownRetraite?: DailyBreadBreakdownRetraite | null;
  breakdownCapital?: DailyBreadBreakdownCapital | null;
  breakdownIndep?: DailyBreadBreakdownIndep | null;
  /** Taxe foncière annuelle (si propriétaire). 0 sinon. */
  tfAnnual?: number;
};

export function computeInstitutionSharesCausal(
  inputs: CausalDispatchInputs,
  db: DailyBreadConstants,
): InstitutionShareCausal[] {
  const inst = db.apu_subsectors.institutions;
  // Coefficients TVA — fallback aux valeurs PLF V&M 2025 si pas dans le JSON.
  const tvaEtat = db.fiscal_constants.tva.part_etat_nette ?? 0.45;
  const tvaSecu = db.fiscal_constants.tva.part_secu_nette ?? 0.31;
  const tvaLocal = db.fiscal_constants.tva.part_local_nette ?? 0.24;

  let secu = 0;
  let etat = 0;
  let local = 0;
  const cSecu: InstitutionShareCausalComponent[] = [];
  const cEtat: InstitutionShareCausalComponent[] = [];
  const cLocal: InstitutionShareCausalComponent[] = [];

  const addTva = (
    amount: number,
    sourceLabelFr: string,
    sourceLabelEn: string,
  ) => {
    if (amount <= 0) return;
    const eP = amount * tvaEtat;
    const sP = amount * tvaSecu;
    const lP = amount * tvaLocal;
    etat += eP;
    secu += sP;
    local += lP;
    cEtat.push({
      label_fr: `TVA → État (${sourceLabelFr})`,
      label_en: `VAT → State (${sourceLabelEn})`,
      annual_eur: eP,
    });
    cSecu.push({
      label_fr: `TVA → Sécu (${sourceLabelFr})`,
      label_en: `VAT → Social Security (${sourceLabelEn})`,
      annual_eur: sP,
    });
    cLocal.push({
      label_fr: `TVA → Local (${sourceLabelFr})`,
      label_en: `VAT → Local (${sourceLabelEn})`,
      annual_eur: lP,
    });
  };

  // ── Salaire ──
  if (inputs.breakdownSalaire) {
    const b = inputs.breakdownSalaire;
    if (b.cotisations_sal > 0) {
      secu += b.cotisations_sal;
      cSecu.push({
        label_fr: "Cotisations sociales (salaire)",
        label_en: "Social contributions (salary)",
        annual_eur: b.cotisations_sal,
      });
    }
    if (b.csg > 0) {
      secu += b.csg;
      cSecu.push({
        label_fr: "CSG/CRDS sur salaire",
        label_en: "CSG/CRDS on salary",
        annual_eur: b.csg,
      });
    }
    if (b.ir > 0) {
      etat += b.ir;
      cEtat.push({
        label_fr: "Impôt sur le revenu",
        label_en: "Personal income tax",
        annual_eur: b.ir,
      });
    }
    addTva(b.tva_estimee, "consommation", "consumption");
  }

  // ── Retraite ──
  if (inputs.breakdownRetraite) {
    const r = inputs.breakdownRetraite;
    if (r.csg_crds_casa > 0) {
      secu += r.csg_crds_casa;
      cSecu.push({
        label_fr: "CSG/CRDS/CASA sur retraite",
        label_en: "CSG/CRDS/CASA on pension",
        annual_eur: r.csg_crds_casa,
      });
    }
    if (r.ir > 0) {
      etat += r.ir;
      cEtat.push({
        label_fr: "Impôt sur le revenu (retraite)",
        label_en: "Income tax (pension)",
        annual_eur: r.ir,
      });
    }
    addTva(r.tva_estimee, "consommation retraite", "pension consumption");
  }

  // ── Capital (dividendes, intérêts, plus-values via PFU) ──
  if (inputs.breakdownCapital) {
    const c = inputs.breakdownCapital;
    if (c.ir > 0) {
      etat += c.ir;
      cEtat.push({
        label_fr: "PFU IR (12,8 % sur capital)",
        label_en: "Flat tax — income part (capital)",
        annual_eur: c.ir,
      });
    }
    if (c.prelevements_sociaux > 0) {
      secu += c.prelevements_sociaux;
      cSecu.push({
        label_fr: "Prélèvements sociaux capital (17,2 %)",
        label_en: "Social levies on capital (17.2 %)",
        annual_eur: c.prelevements_sociaux,
      });
    }
    addTva(c.tva_estimee, "consommation capital", "capital consumption");
  }

  // ── Indépendant ──
  if (inputs.breakdownIndep) {
    const i = inputs.breakdownIndep;
    if (i.cotisations_urssaf > 0) {
      secu += i.cotisations_urssaf;
      cSecu.push({
        label_fr: "Cotisations sociales (indépendant)",
        label_en: "Social contributions (self-employed)",
        annual_eur: i.cotisations_urssaf,
      });
    }
    if (i.ir > 0) {
      etat += i.ir;
      cEtat.push({
        label_fr: "Impôt sur le revenu (indépendant)",
        label_en: "Income tax (self-employed)",
        annual_eur: i.ir,
      });
    }
    addTva(i.tva_estimee, "consommation indépendant", "self-employed cons.");
  }

  // ── Taxe foncière (si propriétaire) ──
  if (inputs.tfAnnual && inputs.tfAnnual > 0) {
    local += inputs.tfAnnual;
    cLocal.push({
      label_fr: "Taxe foncière (propriétaire)",
      label_en: "Property tax (owner)",
      annual_eur: inputs.tfAnnual,
    });
  }

  const total = secu + etat + local;
  const safeShare = (x: number) => (total > 0 ? x / total : 0);

  return [
    {
      code: "S1314",
      label_fr: inst.S1314?.label_fr ?? "Sécurité sociale",
      label_en: inst.S1314?.label_en ?? "Social security",
      share: safeShare(secu),
      annual_eur: secu,
      daily_eur: secu / 365,
      components: cSecu,
    },
    {
      code: "S1311",
      label_fr: inst.S1311?.label_fr ?? "État central et ODAC",
      label_en: inst.S1311?.label_en ?? "Central government + ODAC",
      share: safeShare(etat),
      annual_eur: etat,
      daily_eur: etat / 365,
      components: cEtat,
    },
    {
      code: "S1313",
      label_fr: inst.S1313?.label_fr ?? "Administrations publiques locales (APUL)",
      label_en: inst.S1313?.label_en ?? "Local government (APUL)",
      share: safeShare(local),
      annual_eur: local,
      daily_eur: local / 365,
      components: cLocal,
    },
  ];
}

// ─── Sécu sub-branch breakdown (CNAM/CNAV/CAF/UNEDIC/AT-MP) ───────────────

export type AssoBranch = {
  key: string;
  label_fr: string;
  label_en: string;
  share: number; // share of ASSO
  annual_eur: number;
  monthly_eur: number;
};

export function computeAssoBreakdown(
  secuAnnuel: number,
  db: DailyBreadConstants,
): AssoBranch[] {
  const items = db.subsector_breakdowns.asso_breakdown.items;
  const out: AssoBranch[] = [];
  for (const [key, item] of Object.entries(items)) {
    const annual = secuAnnuel * item.value;
    out.push({
      key,
      label_fr: item.label_fr,
      label_en: item.label_en,
      share: item.value,
      annual_eur: annual,
      monthly_eur: annual / 12,
    });
  }
  out.sort((a, b) => b.share - a.share);
  return out;
}

// ─── State (S1311) breakdown — re-grouped into 9 readable buckets + autres ─
//
// Bucketise les 33 missions du PLF en 9 catégories thématiques + un dernier
// bucket "autres" qui ÉNUMÈRE explicitement ses contenus (agriculture, Outre-
// mer, action extérieure, économie, anciens combattants…) pour préserver la
// dignité de chaque domaine.
// Les codes ci-dessous correspondent aux codes mission PLF (cf.
// `data.economie.gouv.fr/explore/dataset/plf25-depenses-2025-selon-destination`).

export type StateBucket = {
  key: string;
  label_fr: string;
  label_en: string;
  share_of_state: number;
  annual_eur: number;
  monthly_eur: number;
  missions: Array<{ code: string; label: string; share: number }>;
  /**
   * Composants overlay rattachés à ce bucket (CAS Pensions par ministère,
   * opérateurs ODAC ressources propres, budgets annexes, etc.). Vide pour les
   * buckets purement PLF, peuplé pour les buckets enrichis par
   * state_overlay.items.
   */
  overlay_items?: Array<{
    key: string;
    label_fr: string;
    label_en: string;
    annual_eur: number;
    monthly_eur: number;
    type:
      | "cas_pensions"
      | "odac_ressources_propres"
      | "budget_annexe"
      | "psr_ue"
      | "residuel";
    source: string;
    source_url: string;
    notes?: string;
  }>;
};

const STATE_BUCKET_DEFS: Array<{
  key: string;
  label_fr: string;
  label_en: string;
  codes: string[];
}> = [
  {
    key: "education_recherche",
    label_fr: "Éducation, recherche",
    label_en: "Education and research",
    codes: ["EC", "RA"],
  },
  {
    key: "defense",
    label_fr: "Défense",
    label_en: "Defense",
    codes: ["DA"],
  },
  {
    key: "securite",
    label_fr: "Sécurité (police, gendarmerie, sécurité civile)",
    label_en: "Security (police, gendarmerie, civil safety)",
    codes: ["SB"],
  },
  {
    key: "justice",
    label_fr: "Justice",
    label_en: "Justice",
    codes: ["JA"],
  },
  {
    key: "solidarite_insertion",
    label_fr: "Solidarité et insertion",
    label_en: "Social protection and inclusion",
    codes: ["SE"],
  },
  {
    key: "travail_emploi",
    label_fr: "Travail et emploi",
    label_en: "Labour and employment",
    codes: ["TB"],
  },
  {
    key: "ecologie_logement_transports",
    label_fr: "Écologie, logement, transports, territoires",
    label_en: "Ecology, housing, transport, territories",
    codes: ["TA", "VA", "RC"],
  },
  {
    key: "culture_medias_sport",
    label_fr: "Culture, médias, sport, jeunesse",
    label_en: "Culture, media, sport, youth",
    codes: ["CB", "MA", "SF", "AQ"],
  },
  {
    key: "dette",
    label_fr: "Service de la dette",
    label_en: "Debt service",
    codes: ["EB"],
  },
  {
    key: "autres_ministeres",
    // Label énumère les missions les plus visibles pour préserver la dignité
    // de chaque domaine (l'agriculteur ou l'ultramarin doit voir son nom).
    // Le drawer liste les 18 missions complètes avec leurs montants.
    label_fr: "Agriculture, Outre-mer, action extérieure, économie, anciens combattants…",
    label_en: "Agriculture, overseas, foreign affairs, economy, veterans…",
    codes: [
      "GA", "RB", "AV", "AD", "AB", "AC", "DB", "AA", "OA",
      "IA", "MB", "SA", "PB", "DC", "CA", "TR", "PC", "PR",
    ],
  },
  // ─── Buckets overlay-only (pas de missions PLF) ───────────────────────
  // Construits exclusivement à partir de state_overlay.items du JSON.
  // contribution_ue : ligne dédiée pour le PSR-UE (visibilité éditoriale).
  // autres_etat_hors_plf : résiduel non rattaché (long tail ODAC, écarts).
  {
    key: "contribution_ue",
    label_fr: "Contribution Union européenne",
    label_en: "European Union contribution",
    codes: [],
  },
  {
    key: "autres_etat_hors_plf",
    label_fr: "Autres dépenses (opérateurs non rattachables, flux internes)",
    label_en: "Other spending (unallocated operators, internal flows)",
    codes: [],
  },
];

export function computeStateBuckets(
  /**
   * Contribution annuelle de l'utilisateur au sous-secteur S1311 (= user_total
   * × `apu_subsectors.S1311.share`). On la projette ici sur chacun des 11
   * buckets éditoriaux pour produire le €/mois perso.
   *
   * Méthodo : (1) missions PLF rescalées sharePlf × (PLF_total / S1311_total)
   * pour donner leur vraie part dans S1311 ; (2) state_overlay.items
   * (CAS Pensions répartis, opérateurs ODAC, PSR-UE, budgets annexes,
   * résiduel) ajoutés par `parent_bucket` — leur share = annual_eur / S1311.
   * Résultat : Σ share_of_state = 1.0 (≈ 100 % de S1311 attribué).
   */
  etatAnnuel: number,
  db: DailyBreadConstants,
): StateBucket[] {
  const missions = db.state_breakdown.missions;
  const s1311 = db.apu_subsectors.institutions?.S1311?.annual_eur ?? 0;
  const totalNet = db.state_breakdown?.total_net_cp_eur ?? 0;
  const scale = s1311 > 0 && totalNet > 0 ? totalNet / s1311 : 1;

  // Group overlay items by parent_bucket pour ajout par bucket.
  const overlayByBucket = new Map<
    string,
    DailyBreadConstants["state_overlay"] extends infer T
      ? T extends { items: infer I }
        ? I
        : never
      : never
  >();
  const overlayItems = db.state_overlay?.items ?? [];
  for (const item of overlayItems) {
    const arr = overlayByBucket.get(item.parent_bucket) ?? [];
    arr.push(item);
    overlayByBucket.set(item.parent_bucket, arr);
  }

  const out: StateBucket[] = [];
  for (const def of STATE_BUCKET_DEFS) {
    // 1. Part PLF (rescalée S1311) — buckets avec missions PLF.
    const matched = missions.filter((m) => def.codes.includes(m.code));
    const sharePlf = matched.reduce(
      (acc, m) => acc + m.share_of_state_net,
      0,
    );
    let share = sharePlf * scale;

    // 2. Part overlay (CAS Pensions / ODAC / PSR-UE / budgets annexes /
    //    résiduel rattachée à ce bucket). share = annual_eur / S1311.
    const bucketOverlay = overlayByBucket.get(def.key) ?? [];
    const overlayAnnualSum = bucketOverlay.reduce(
      (acc, it) => acc + (it.annual_eur ?? 0),
      0,
    );
    const overlayShare = s1311 > 0 ? overlayAnnualSum / s1311 : 0;
    share += overlayShare;

    const annual = etatAnnuel * share;
    out.push({
      key: def.key,
      label_fr: def.label_fr,
      label_en: def.label_en,
      share_of_state: share,
      annual_eur: annual,
      monthly_eur: annual / 12,
      missions: matched.map((m) => ({
        code: m.code,
        label: m.label,
        share: m.share_of_state_net * scale,
      })),
      overlay_items: bucketOverlay.map((it) => {
        const itemShare = s1311 > 0 ? (it.annual_eur ?? 0) / s1311 : 0;
        const itemAnnual = etatAnnuel * itemShare;
        return {
          key: it.key,
          label_fr: it.label_fr,
          label_en: it.label_en,
          annual_eur: itemAnnual,
          monthly_eur: itemAnnual / 12,
          type: it.type,
          source: it.source,
          source_url: it.source_url,
          notes: it.notes,
        };
      }),
    });
  }
  // Filtre les buckets de share 0 (cas où l'overlay est absent et le bucket
  // est overlay-only — éviterait d'afficher une ligne vide).
  const filtered = out.filter((b) => b.share_of_state > 0);
  filtered.sort((a, b) => b.share_of_state - a.share_of_state);
  return filtered;
}

// ─── Local detail (Bloc communal / Département / Région) ─────────────────
//
// TODO pipeline : sync OFGL EPCI/dept/régions for proper consolidation.
// Pour l'instant on s'appuie uniquement sur les ratios APUL_breakdown
// (OFGL national 2023) appliqués au montant local de l'utilisateur.
// Le commune.eur_hab (OFGL) est utilisé pour pondérer la part bloc
// communal vs moyenne nationale ; dépt/région restent à la moyenne
// nationale (faute de data de niveau infra).

export type LocalLevel = {
  key: "bloc_communal" | "departement" | "region";
  label_fr: string;
  label_en: string;
  share_of_local: number;
  annual_eur: number;
  monthly_eur: number;
};

/**
 * Vrai si la commune est une collectivité à statut particulier où commune
 * et département sont fusionnés en une seule entité (budget consolidé).
 * Pour ces cas, afficher dept séparé du bloc double-compte les dépenses
 * (exemple : Paris dept = budget de la Ville, pas une entité distincte).
 *
 * À enrichir : Lyon Métropole (2015), CTU Martinique/Guyane (2015),
 * Collectivité de Corse (2018), Paris (2019).
 */
export function isCollectiviteUnique(slug: string | undefined | null): boolean {
  if (!slug) return false;
  return slug === "paris";
}

export function computeLocalLevels(
  localAnnuel: number,
  db: DailyBreadConstants,
  ratioBlocCommunal: number = 1, // commune.eur_hab / national_avg
  /** Pour les collectivités à statut particulier (Paris ville-département,
   *  Lyon Métropole, Métropole de Lyon, Martinique CTU, Guyane CTU, Corse CTU)
   *  où commune et département sont fusionnés en une seule entité, on agrège
   *  la part dept dans bloc et on retire la ligne dept (sinon double-comptage :
   *  les dépenses dept sont déjà incluses dans le budget consolidé de la
   *  collectivité unique). */
  mergeDeptIntoBloc: boolean = false,
): LocalLevel[] {
  const items = db.subsector_breakdowns.apul_breakdown.items;
  const blocItem = items.part_communes_epci;
  const deptItem = items.part_departements;
  const regItem = items.part_regions;
  if (!blocItem || !deptItem || !regItem) return [];

  // Pondération bloc communal : on multiplie la part nationale par le
  // ratio commune/moyenne. Les autres niveaux restent à la part nationale
  // (re-normalisation pour que la somme = 1).
  // Pour collectivité unique : bloc agrège bloc+dept (dept share absorbé).
  const blocBaseValue = mergeDeptIntoBloc
    ? blocItem.value + deptItem.value
    : blocItem.value;
  const blocWeighted = blocBaseValue * ratioBlocCommunal;
  const deptValue = mergeDeptIntoBloc ? 0 : deptItem.value;
  const sum = blocWeighted + deptValue + regItem.value;
  const norm = sum > 0 ? sum : 1;

  const blocShare = blocWeighted / norm;
  const deptShare = deptValue / norm;
  const regShare = regItem.value / norm;

  const out: LocalLevel[] = [
    {
      key: "bloc_communal",
      label_fr: blocItem.label_fr,
      label_en: blocItem.label_en,
      share_of_local: blocShare,
      annual_eur: localAnnuel * blocShare,
      monthly_eur: (localAnnuel * blocShare) / 12,
    },
  ];
  if (!mergeDeptIntoBloc) {
    out.push({
      key: "departement",
      label_fr: deptItem.label_fr,
      label_en: deptItem.label_en,
      share_of_local: deptShare,
      annual_eur: localAnnuel * deptShare,
      monthly_eur: (localAnnuel * deptShare) / 12,
    });
  }
  out.push({
    key: "region",
    label_fr: regItem.label_fr,
    label_en: regItem.label_en,
    share_of_local: regShare,
    annual_eur: localAnnuel * regShare,
    monthly_eur: (localAnnuel * regShare) / 12,
  });
  return out;
}

// ─── Deep-dive helpers ──────────────────────────────────────────────────
//
// Sous chaque panel Zoom on descend d'un cran : ONDAM sous-objectifs (Santé),
// titres budgétaires (Défense), fonctions M14 (Bloc communal).

export type DeepDiveStackEntry = {
  key: string;
  label_fr: string;
  label_en: string;
  share: number;       // 0..1, normalisé sur la somme des shares de la stack
  monthly_eur: number; // €/mois pour CET utilisateur
  notes?: string;
};

/**
 * Ventile un montant mensuel selon une stack de sous-objectifs / titres
 * (Santé ONDAM, Défense titres). Les shares du seed sont déjà ~normalisées,
 * on les utilise telles quelles.
 */
export function computeDeepDiveStack(
  monthly: number,
  dive: DailyBreadDeepDiveStack | undefined | null,
): DeepDiveStackEntry[] {
  if (!dive || !dive.items) return [];
  const items = Object.entries(dive.items);
  const sum = items.reduce((acc, [, v]) => acc + (v.share || 0), 0) || 1;
  const out: DeepDiveStackEntry[] = items.map(([key, v]) => {
    const share = (v.share || 0) / sum;
    return {
      key,
      label_fr: v.label_fr,
      label_en: v.label_en,
      share,
      monthly_eur: monthly * share,
      notes: v.notes,
    };
  });
  out.sort((a, b) => b.share - a.share);
  return out;
}

/**
 * Ventile un montant mensuel bloc communal selon les fonctions M14 OFGL.
 * Si l'INSEE de la commune sélectionnée a un overlay top-200 → on l'utilise,
 * sinon on tombe sur la moyenne nationale pondérée.
 */
export function computeDeepDiveLocal(
  monthly: number,
  dive: DailyBreadDeepDiveLocal | undefined | null,
  insee?: string | null,
): DeepDiveStackEntry[] {
  if (!dive) return [];
  const overlay =
    insee && dive.by_insee_top_200 && dive.by_insee_top_200[insee]
      ? dive.by_insee_top_200[insee]
      : null;
  const src = overlay ?? dive.national_avg_weighted ?? {};
  const items = Object.entries(src);
  if (items.length === 0) return [];
  const sum = items.reduce((acc, [, v]) => acc + (v.share || 0), 0) || 1;
  const out: DeepDiveStackEntry[] = items.map(([key, v]) => {
    const share = (v.share || 0) / sum;
    return {
      key,
      label_fr: v.label_fr,
      label_en: v.label_en,
      share,
      monthly_eur: monthly * share,
    };
  });
  out.sort((a, b) => b.share - a.share);
  return out;
}
