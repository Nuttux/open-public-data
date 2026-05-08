/**
 * Daily Bread — server-side helpers for drawer / standalone drill-down pages.
 *
 * Mirrors the parsing + computation done in `DailyBreadClient.tsx` and
 * `app/api/og-poster/route.tsx` so every drill-down route can:
 *   1. Read the same searchParams as the page (`?net=...&parts=...&c=...&...`)
 *      and recover the user's profile-derived monthly contribution.
 *   2. Project that monthly contribution down to a single drill-down node
 *      (Sécu→CNAM→ONDAM ville, État→Défense agg→mission→action PLF, etc.).
 *
 * Pure, server-side, no React. Designed to be called from server components.
 */

import {
  computeBreakdown,
  computeBreakdownRetraite,
  computeBreakdownCapital,
  computeBreakdownIndependant,
  computeInstitutionShares,
  computeAssoBreakdown,
  computeLocalLevels,
  isCollectiviteUnique,
  type IndepActivityType,
} from "@/lib/daily-bread";
import {
  loadDailyBread,
  type DailyBreadConstants,
} from "@/lib/national-data";
import { findCommuneByAny } from "@/lib/all-communes";

export const INDEP_TYPES: IndepActivityType[] = [
  "vente",
  "services_bic",
  "services_bnc",
];

export type DailyBreadProfileQuery = {
  /** Was at least one income param provided? Drives "show €/mo" UI gates. */
  hasProfile: boolean;
  salaireMonthly: number;
  pensionMonthly: number;
  capitalAnnuel: number;
  indepCaAnnuel: number;
  indepType: IndepActivityType;
  parts: number;
  communeSlug: string;
  isOwner: boolean;
  tfCustom: number;
};

export type DailyBreadProfileMonthlies = {
  query: DailyBreadProfileQuery;
  /** Total €/mois personnels (cumul des sources de revenus + TF si owner). */
  totalMonthly: number;
  secuMonthly: number;
  etatMonthly: number;
  localMonthly: number;
  /** Bloc communal monthly (déjà pondéré par eur_hab/national). */
  blocCommunalMonthly: number;
  departementMonthly: number;
  regionMonthly: number;
};

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function estimateTaxeFonciereFromCommune(impotsLocauxEurHab: number): number {
  return Math.round(impotsLocauxEurHab * 0.4 * 2.2);
}

/**
 * Parse the same query-string DailyBreadClient.tsx accepts.
 * Distinguishes "no profile" (no `net` param) vs "explicit zero" — both must
 * lead to no €/mo display, so we expose `hasProfile` as the gate.
 */
export function parseDailyBreadProfile(
  searchParams: Record<string, string | string[] | undefined>,
): DailyBreadProfileQuery {
  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  const rawNet = get("net");
  const rawPension = get("pension");
  const rawCapital = get("capital");
  const rawIndepCa = get("indep_ca");
  const rawTf = get("tf");
  const rawIndepType = (get("indep_type") || "services_bic") as IndepActivityType;
  const indepType: IndepActivityType = INDEP_TYPES.includes(rawIndepType)
    ? rawIndepType
    : "services_bic";

  const salaireMonthly =
    rawNet !== undefined ? clampNonNeg(Number(rawNet)) : 2100;
  const pensionMonthly = clampNonNeg(Number(rawPension ?? 0));
  const capitalAnnuel = clampNonNeg(Number(rawCapital ?? 0));
  const indepCaAnnuel = clampNonNeg(Number(rawIndepCa ?? 0));
  const rawParts = Number(get("parts") || 1);
  const parts = Number.isFinite(rawParts)
    ? Math.min(10, Math.max(1, rawParts))
    : 1;
  const communeSlug = get("c") || "paris";
  const isOwner = get("owner") === "1";
  const tfCustom = clampNonNeg(Number(rawTf ?? 0));

  // hasProfile = at least one income-shaped param was provided. We also
  // accept `parts` / `c` / `owner` — these alone don't define a profile but
  // if `net` is present (even = 0 explicitly), the user has gone through the
  // calculator and we should display their projection.
  const hasProfile =
    rawNet !== undefined ||
    pensionMonthly > 0 ||
    capitalAnnuel > 0 ||
    indepCaAnnuel > 0;

  return {
    hasProfile,
    salaireMonthly,
    pensionMonthly,
    capitalAnnuel,
    indepCaAnnuel,
    indepType,
    parts,
    communeSlug,
    isOwner,
    tfCustom,
  };
}

/**
 * Compute the user's monthly contributions distributed across institutions,
 * aligned with the calculator on `/france/daily-bread`.
 *
 * Returns null if the daily_bread.json is unavailable — caller should hide
 * the personal column in that case.
 */
export function computeProfileMonthlies(
  query: DailyBreadProfileQuery,
): DailyBreadProfileMonthlies | null {
  const db = loadDailyBread();
  if (!db) return null;

  const breakdownSalaire =
    query.salaireMonthly > 0
      ? computeBreakdown(
          { net_annuel: query.salaireMonthly * 12, parts: query.parts },
          db,
        )
      : { cotisations_sal: 0, csg: 0, ir: 0, tva_estimee: 0, total: 0 };
  const breakdownRetraite =
    query.pensionMonthly > 0
      ? computeBreakdownRetraite(query.pensionMonthly * 12, query.parts, db)
      : {
          csg_crds_casa: 0,
          ir: 0,
          tva_estimee: 0,
          total: 0,
          taux_csg_applied: 0,
        };
  const breakdownCapital =
    query.capitalAnnuel > 0
      ? computeBreakdownCapital(query.capitalAnnuel, db)
      : { ir: 0, prelevements_sociaux: 0, tva_estimee: 0, total: 0 };
  const breakdownIndep =
    query.indepCaAnnuel > 0
      ? computeBreakdownIndependant(
          query.indepCaAnnuel,
          query.indepType,
          query.parts,
          db,
        )
      : {
          cotisations_urssaf: 0,
          ir: 0,
          tva_estimee: 0,
          total: 0,
          benefice_imposable: 0,
        };

  const commune = findCommuneByAny(query.communeSlug);
  const impotsLocauxEurHab = commune?.kpis?.impots_locaux?.eur_hab ?? 0;
  let tfEstimated = 0;
  if (query.isOwner) {
    if (query.tfCustom > 0) tfEstimated = query.tfCustom;
    else if (impotsLocauxEurHab > 0)
      tfEstimated = estimateTaxeFonciereFromCommune(impotsLocauxEurHab);
  }

  const totalAnnuel =
    breakdownSalaire.total +
    breakdownRetraite.total +
    breakdownCapital.total +
    breakdownIndep.total +
    tfEstimated;

  if (totalAnnuel <= 0) {
    return {
      query,
      totalMonthly: 0,
      secuMonthly: 0,
      etatMonthly: 0,
      localMonthly: 0,
      blocCommunalMonthly: 0,
      departementMonthly: 0,
      regionMonthly: 0,
    };
  }

  const institutionShares = computeInstitutionShares(totalAnnuel, db);
  const secu = institutionShares.find((i) => i.code === "S1314");
  const etat = institutionShares.find((i) => i.code === "S1311");
  const local = institutionShares.find((i) => i.code === "S1313");

  const secuMonthly = (secu?.annual_eur ?? 0) / 12;
  const etatMonthly = (etat?.annual_eur ?? 0) / 12;
  const localAnnuel = local?.annual_eur ?? 0;
  const localMonthly = localAnnuel / 12;

  // Reproduit le ratio bloc communal vs moyenne nationale utilisé par le
  // client : commune.eur_hab / national_avg, sinon 1.
  const nationalAvg = db.local_avg_dep_eur_hab.value_eur_hab ?? 1500;
  const communeEurHab = commune?.kpis?.depenses_totales?.eur_hab ?? 0;
  const ratio =
    communeEurHab > 0 && nationalAvg > 0 ? communeEurHab / nationalAvg : 1;
  const localLevels = computeLocalLevels(
    localAnnuel,
    db,
    ratio,
    isCollectiviteUnique(commune?.slug),
  );
  const blocCommunalMonthly =
    localLevels.find((l) => l.key === "bloc_communal")?.monthly_eur ?? 0;
  const departementMonthly =
    localLevels.find((l) => l.key === "departement")?.monthly_eur ?? 0;
  const regionMonthly =
    localLevels.find((l) => l.key === "region")?.monthly_eur ?? 0;

  return {
    query,
    totalMonthly: totalAnnuel / 12,
    secuMonthly,
    etatMonthly,
    localMonthly,
    blocCommunalMonthly,
    departementMonthly,
    regionMonthly,
  };
}

// ─── Per-bucket node projection ───────────────────────────────────────────
//
// Given a profile + a (bucket, level2[, level3, level4]) coordinate, compute
// the user's €/mo at that node — by chaining the relevant shares.
//
// All shares are read from the SAME pipeline as the page (no hardcode).

type BucketKey = "secu" | "etat" | "local";

/**
 * Convertit une part PLF (denominateur = `state_breakdown.total_net_cp_eur` ≈
 * 447 Md€/an, somme des 33 missions) en part « réelle » au sein du sous-secteur
 * Eurostat S1311 (numérateur = `apu_subsectors.institutions.S1311.annual_eur`
 * ≈ 676 Md€/an).
 *
 * **Pourquoi.** Les `share_of_parent` publiés dans `daily_bread_drilldown.json`
 * pour le bucket État sont normalisés sur la **somme des 33 missions PLF**
 * (≈ 447 Md€) — pas sur S1311 qui inclut aussi les ODAC, transferts UE,
 * régimes spéciaux non rattachés à une mission (~229 Md€). Multiplier
 * `etatMonthly` (= user_total × S1311.share) par cette part directement
 * surestime d'un facteur 676/447 ≈ 1,51× — par exemple Défense (DA, 60 Md€)
 * apparaîtrait à 91 Md€/an au lieu de 60.
 *
 * Renvoie le rescaling factor `total_net_cp_eur / S1311.annual_eur` (≈ 0,66)
 * qu'il faut appliquer aux `share_of_parent` du drilldown pour les ré-aligner
 * sur S1311. Renvoie 1 si la donnée n'est pas disponible (fallback safe).
 */
function etatPlfToS1311Scale(db: DailyBreadConstants | null): number {
  if (!db) return 1;
  const s1311 = db.apu_subsectors.institutions?.S1311?.annual_eur;
  const totalNet = db.state_breakdown?.total_net_cp_eur;
  if (!s1311 || !totalNet || s1311 <= 0) return 1;
  return totalNet / s1311;
}

/**
 * Projection at level2 of a top-level bucket.
 *
 *  - secu : bucketMonthly = secuMonthly ; node share = ASSO branch value
 *           (CNAM/CNAV/CAF/UNEDIC/AT-MP).
 *  - etat : bucketMonthly = etatMonthly × (mission.cp_eur / S1311.annual_eur)
 *           — i.e. on ré-aligne le `share_of_parent` PLF (denominateur 447 Md€)
 *           sur le sous-secteur Eurostat S1311 (676 Md€) pour ne pas surestimer
 *           d'un facteur ~1,51× (cf. `etatPlfToS1311Scale`).
 *  - local: bucketMonthly = blocCommunalMonthly ; node share = level2.share_of_parent
 *           (deduced from drilldown — already normalised within bloc communal).
 */
export function projectLevel2Monthly(
  monthlies: DailyBreadProfileMonthlies,
  bucket: BucketKey,
  level2Key: string,
  /** Read directly from drilldown.json — falls back to 0 if unknown. */
  level2ShareOfParent: number,
): number {
  if (bucket === "secu") {
    const db = loadDailyBread();
    if (!db) return 0;
    const branches = computeAssoBreakdown(monthlies.secuMonthly * 12, db);
    // ASSO keys are prefixed with `part_<key>` — we accept both flavours.
    const candidate =
      branches.find((b) => b.key === `part_${level2Key}`) ??
      branches.find((b) => b.key === level2Key);
    if (candidate) return candidate.monthly_eur;
    return monthlies.secuMonthly * level2ShareOfParent;
  }
  if (bucket === "etat") {
    const db = loadDailyBread();
    const s1311 = db?.apu_subsectors.institutions?.S1311?.annual_eur ?? 0;
    const m = db?.state_breakdown.missions.find(
      (x) => x.code.toLowerCase() === level2Key.toLowerCase(),
    );
    if (m && s1311 > 0) {
      // Vraie part de la mission dans S1311 (= mission.cp_eur / S1311) —
      // évite la surestimation 676/447 du `share_of_parent` PLF.
      const trueShareInS1311 = m.cp_eur / s1311;
      return monthlies.etatMonthly * trueShareInS1311;
    }
    // Fallback : si la mission n'est pas trouvée (ex: aggregation virtual key),
    // on rescale la share PLF par le ratio total_net_cp_eur / S1311 — équivalent
    // au calcul exact pour une somme de missions PLF.
    return (
      monthlies.etatMonthly * level2ShareOfParent * etatPlfToS1311Scale(db)
    );
  }
  // local — bloc communal level2 (administration_generale, enseignement, …)
  return monthlies.blocCommunalMonthly * level2ShareOfParent;
}

export function projectLevel3Monthly(
  monthlies: DailyBreadProfileMonthlies,
  bucket: BucketKey,
  level2Key: string,
  level2ShareOfParent: number,
  level3ShareOfParent: number,
): number {
  const l2 = projectLevel2Monthly(
    monthlies,
    bucket,
    level2Key,
    level2ShareOfParent,
  );
  return l2 * level3ShareOfParent;
}

export function projectLevel4Monthly(
  monthlies: DailyBreadProfileMonthlies,
  bucket: BucketKey,
  level2Key: string,
  level2ShareOfParent: number,
  level3ShareOfParent: number,
  level4ShareOfParent: number,
): number {
  const l3 = projectLevel3Monthly(
    monthlies,
    bucket,
    level2Key,
    level2ShareOfParent,
    level3ShareOfParent,
  );
  return l3 * level4ShareOfParent;
}

/**
 * Projection pour un drawer dept/region — bucketMonthly choisi par scope.
 */
export function projectLocalScopeLevel2Monthly(
  monthlies: DailyBreadProfileMonthlies,
  scope: "dept" | "region",
  level2ShareOfParent: number,
): number {
  if (scope === "dept") return monthlies.departementMonthly * level2ShareOfParent;
  return monthlies.regionMonthly * level2ShareOfParent;
}

/**
 * Projection pour un drawer aggregation État (Défense, Régaliens, …).
 * `aggShareOfParent` doit déjà être la part totale dans l'État central
 * (somme des `share_of_state_net` des missions composantes), telle que
 * `daily_bread_drilldown.json` la publie — i.e. denominateur =
 * `state_breakdown.total_net_cp_eur` (≈ 447 Md€).
 *
 * On rescale par `total_net_cp_eur / S1311.annual_eur` (≈ 0,66) pour ré-aligner
 * sur S1311 — sinon surestimation 1,51× (cf. `etatPlfToS1311Scale`).
 *
 * Le `missions[]` optionnel permet de calculer la part exacte = somme des
 * `cp_eur` des missions composantes / S1311.annual_eur — équivalent
 * mathématique mais évite l'erreur d'arrondi cumulée si l'aggregation est
 * obtenue par sommation de shares déjà arrondies.
 */
export function projectEtatAggregationMonthly(
  monthlies: DailyBreadProfileMonthlies,
  aggShareOfParent: number,
  missions?: ReadonlyArray<string>,
): number {
  const db = loadDailyBread();
  const s1311 = db?.apu_subsectors.institutions?.S1311?.annual_eur ?? 0;
  // Voie 1 (préférée) : somme exacte des cp_eur des missions composantes.
  if (db && s1311 > 0 && missions && missions.length > 0) {
    const codes = new Set(missions.map((c) => c.toLowerCase()));
    const sumCpEur = db.state_breakdown.missions
      .filter((m) => codes.has(m.code.toLowerCase()))
      .reduce((acc, m) => acc + (m.cp_eur ?? 0), 0);
    if (sumCpEur > 0) {
      const trueShareInS1311 = sumCpEur / s1311;
      return monthlies.etatMonthly * trueShareInS1311;
    }
  }
  // Voie 2 (fallback) : rescaling de la share PLF par total_net_cp_eur / S1311.
  return (
    monthlies.etatMonthly * aggShareOfParent * etatPlfToS1311Scale(db)
  );
}

// ─── National absolute (€/year) ──────────────────────────────────────────
//
// Same chaining, but starting from `state_breakdown.total_net_cp_eur` for
// État (PLF 2025) and from APU subsector annual totals for Sécu / Local.
// All-source: pipeline → daily_bread.json. No hardcoded constants.

export type NationalAbsolutes = {
  /** €/an au niveau national pour ce nœud. */
  nodeAnnualEur: number;
  /** %  share_of_state ou bucket parent au niveau national (pour libellé). */
  shareOfBucket: number;
};

/**
 * Pour un nœud (bucket, level2[, level3, level4]) renvoie le €/an national.
 *
 *  - État : annuel = état_total × share2 [× share3] [× share4]
 *           où état_total = `state_breakdown.total_net_cp_eur`.
 *  - Sécu : annuel = ASSO_annual × share_of_parent (level2 ASSO)
 *           où ASSO_annual = `apu_subsectors.institutions.S1314.annual_eur`.
 *           Pour les niveaux >2, on chaîne par les `share_of_parent` du
 *           drilldown jusqu'au nœud cible.
 *  - Local : annuel = APUL_annual × share scope × share level2
 *           où APUL_annual = `apu_subsectors.institutions.S1313.annual_eur`,
 *           et share scope vient de `subsector_breakdowns.apul_breakdown`
 *           (part_communes_epci / part_departements / part_regions).
 *
 * Le PIB national vient désormais de `apu_subsectors.totals.gdp_total_md_eur`
 * (Eurostat nama_10_gdp). Avant 2026-05 il fallait fallback sur "—" ; depuis
 * la promotion de la sync, les drawers Sécu/Local ont leur national absolu.
 */
export function nationalEtatLevel2Annual(
  db: DailyBreadConstants,
  level2Key: string,
): number | null {
  const m = db.state_breakdown.missions.find(
    (x) => x.code.toLowerCase() === level2Key.toLowerCase(),
  );
  if (!m) return null;
  return m.cp_eur;
}

/**
 * National annuel d'un sous-secteur APU (S1311/S1313/S1314) en €.
 * Lit `apu_subsectors.institutions.<code>.annual_eur` (publié par
 * `sync_eurostat_apu_subsectors.py` depuis 2026-05). Renvoie null pour les
 * snapshots antérieurs où le champ n'existe pas.
 */
export function nationalAsuSubsectorAnnual(
  db: DailyBreadConstants,
  code: "S1311" | "S1313" | "S1314",
): number | null {
  const inst = db.apu_subsectors.institutions[code];
  return inst?.annual_eur ?? null;
}

/**
 * National annuel d'une branche Sécu (level2 du drilldown secu).
 * = S1314.annual_eur × share_of_parent. Le `share_of_parent` doit déjà être
 * normalisé (somme = 1 sur les branches publiées par le drilldown).
 */
export function nationalSecuLevel2Annual(
  db: DailyBreadConstants,
  level2ShareOfParent: number,
): number | null {
  const asso = nationalAsuSubsectorAnnual(db, "S1314");
  if (asso == null || level2ShareOfParent <= 0) return null;
  return asso * level2ShareOfParent;
}

/**
 * National annuel d'un niveau Local. `scope` cible le bloc géographique
 * (communes+EPCI / départements / régions) ; le share APUL entre scopes vient
 * de `subsector_breakdowns.apul_breakdown.items`. Multiplie ensuite par le
 * `share_of_parent` du level2 dans le scope (ex: administration_generale 32%
 * du bloc communal).
 */
export function nationalLocalLevel2Annual(
  db: DailyBreadConstants,
  scope: "bloc_communal" | "dept" | "region",
  level2ShareOfParent: number,
): number | null {
  const apul = nationalAsuSubsectorAnnual(db, "S1313");
  if (apul == null) return null;
  const items = db.subsector_breakdowns.apul_breakdown.items;
  const scopeShare =
    scope === "bloc_communal"
      ? items.part_communes_epci?.value
      : scope === "dept"
        ? items.part_departements?.value
        : items.part_regions?.value;
  if (typeof scopeShare !== "number" || scopeShare <= 0) return null;
  if (level2ShareOfParent <= 0) return null;
  return apul * scopeShare * level2ShareOfParent;
}

/**
 * Format un €/an en libellé compact selon les seuils demandés :
 *   ≥ 100 M€  → "Md€" (1 décimale)
 *   ≥ 1 M€    → "M€"  (0 décimale)
 *   sinon     → "€"
 */
export function formatAnnualCompact(
  amountEur: number,
  locale: "fr" | "en",
): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const sep = locale === "fr" ? "," : ".";
  const space = locale === "fr" ? " " : " ";
  if (amountEur >= 1e8) {
    const md = amountEur / 1e9;
    const s = md.toFixed(1).replace(".", sep);
    return `${s}${space}${locale === "en" ? "bn€" : "Md€"}`;
  }
  if (amountEur >= 1e6) {
    const m = amountEur / 1e6;
    const s = m.toFixed(0);
    return `${s}${space}M€`;
  }
  return `${Math.round(amountEur).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
  )}${space}€`;
}

/**
 * Format €/mois personnel.
 *
 * Aux niveaux fins (action PLF feuille à part faible) le montant peut
 * descendre sous 1 € — un arrondi entier afficherait "0 €" et casserait
 * la promesse "où va MON argent". On préserve les centimes :
 *   - < 0,01 € → "< 0,01"  (sub-cent, on ne ment pas avec une vraie valeur)
 *   - 0,01 à < 1 € → "0,XX" (2 décimales)
 *   - ≥ 1 € → entier
 */
export function formatMonthlyEur(
  amountEur: number,
  locale: "fr" | "en",
): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "0";
  const fmtLocale = locale === "en" ? "en-GB" : "fr-FR";
  if (amountEur < 0.01) {
    return locale === "en" ? "< 0.01" : "< 0,01";
  }
  if (amountEur < 1) {
    return amountEur.toLocaleString(fmtLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(amountEur).toLocaleString(fmtLocale);
}

/**
 * Variante de format pour les libellés "national €/an" affichés à côté
 * du titre — alias de `formatAnnualCompact` pour préserver l'ergonomie
 * d'appel demandée par les pages drill-down.
 */
export function formatNationalAnnualLabel(
  amountEur: number | null | undefined,
  locale: "fr" | "en",
): string | null {
  if (amountEur == null) return null;
  if (!Number.isFinite(amountEur) || amountEur <= 0) return null;
  return formatAnnualCompact(amountEur, locale);
}

/**
 * Shell labels for drill-down routes — the breadcrumb's first crumb and
 * the eyebrow voice depends on whether we're under
 * `/ville/paris/daily-bread` (perso "Daily Bread") or `/france/budget`
 * (impersonnel "Le budget"). Centralisé pour rester DRY entre les
 * 17+ routes drawer/standalone.
 */
export type DrilldownShellVoice = "daily_bread" | "budget";

export function shellRootCrumb(
  voice: DrilldownShellVoice,
  locale: "fr" | "en",
  basePath: string,
): { label: string; href: string } {
  if (voice === "budget") {
    return {
      label: locale === "en" ? "Budget" : "Le budget",
      href: basePath,
    };
  }
  return {
    label: "Daily Bread",
    href: basePath,
  };
}

/**
 * Reconstruit le query string du profil (utilisé pour propager la sélection
 * utilisateur dans les liens drawer/standalone).
 */
export function buildProfileQueryString(
  query: DailyBreadProfileQuery,
): string {
  const params = new URLSearchParams();
  // Toujours rendre "net" explicite — y compris 0 — pour que parseDailyBreadProfile
  // ré-active hasProfile en aval et préserve la projection €/mois.
  params.set("net", String(query.salaireMonthly));
  params.set("parts", String(query.parts));
  if (query.communeSlug) params.set("c", query.communeSlug);
  if (query.isOwner) params.set("owner", "1");
  if (query.tfCustom > 0) params.set("tf", String(query.tfCustom));
  if (query.pensionMonthly > 0) params.set("pension", String(query.pensionMonthly));
  if (query.capitalAnnuel > 0) params.set("capital", String(query.capitalAnnuel));
  if (query.indepCaAnnuel > 0) {
    params.set("indep_ca", String(query.indepCaAnnuel));
    if (query.indepType !== "services_bic") {
      params.set("indep_type", query.indepType);
    }
  }
  return params.toString();
}
