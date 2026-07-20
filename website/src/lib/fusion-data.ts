import { loadLieuxIndex, loadLieu } from "./lieux-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { readDataJson, readDataJsonOrNull, cityJsonPath } from "./data/read";

export { PARIS_POPULATION } from "@/lib/methodology";
import {
  PARIS_POPULATION,
  PARIS_SRU_RATIO,
  PARIS_SRU_TARGET,
  PARIS_SRU_YEAR,
  PARIS_SRU_STOCK_TOTAL,
  parisBailleurShare,
} from "@/lib/methodology";

type BudgetIndex = {
  availableYears: number[];
  latestYear: number;
  latestCompleteYear: number;
  completeYears?: number[];
  partialYears?: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute"; recettes: number; depenses: number; solde: number }[];
};

export function loadBudgetIndex(city: string = "paris") {
  return readJson<BudgetIndex>(cityJsonPath(city, "budget_index.json"));
}

// ─── Voté vs exécuté ───────────────────────────────────────────────────────

type VoteGlobalRate = {
  annee: number;
  type: "comparaison" | "previsionnel";
  depenses_vote?: number;
  depenses_execute?: number;
  taux_global?: number;
  vote_fonct?: number;
  execute_fonct?: number;
  taux_fonct?: number;
  vote_inves?: number;
  execute_inves?: number;
  taux_inves?: number;
};

type VoteEcartRow = {
  thematique: string;
  section?: string;
  sens_flux?: string;
  ecart_moyen_pct?: number;
  vote_total?: number;
  execute_total?: number;
  taux_execution?: number;
  nb_annees?: number;
};

type VoteVsExecute = {
  coverage: { comparison_years: number[]; forecast_years: number[] };
  global_rates: VoteGlobalRate[];
  ecart_ranking?: VoteEcartRow[];
};

export type VoteExecuteRow = {
  year: number;
  voted: number;
  executed: number | null;
  tauxGlobal: number | null;
};

export type VoteExecuteData = {
  comparisonYears: number[];
  forecastYears: number[];
  rows: VoteExecuteRow[];
  topEcarts: { thematique: string; section: string; ecartMoyenPct: number; voteTotal: number; executeTotal: number }[];
};

export function loadVoteExecute(): VoteExecuteData {
  const raw = readJson<VoteVsExecute>("vote_vs_execute.json");
  const rows: VoteExecuteRow[] = raw.global_rates.map((g) => ({
    year: g.annee,
    voted: g.depenses_vote ?? 0,
    executed: g.type === "comparaison" ? g.depenses_execute ?? null : null,
    tauxGlobal: g.type === "comparaison" ? g.taux_global ?? null : null,
  })).sort((a, b) => a.year - b.year);

  const topEcarts = (raw.ecart_ranking ?? [])
    .filter((r) => (r.nb_annees ?? 0) >= 3)
    .slice(0, 10)
    .map((r) => ({
      thematique: r.thematique,
      section: r.section ?? "",
      ecartMoyenPct: r.ecart_moyen_pct ?? 0,
      voteTotal: r.vote_total ?? 0,
      executeTotal: r.execute_total ?? 0,
    }));

  return {
    comparisonYears: raw.coverage.comparison_years,
    forecastYears: raw.coverage.forecast_years,
    rows,
    topEcarts,
  };
}

type SankeyLink = { source: string; target: string; value: number };
type BudgetSankey = {
  year: number;
  totals: { recettes: number; depenses: number; solde: number };
  links: SankeyLink[];
};

// All IO goes through the shared memoized reader (lib/data/read.ts) — the
// multi-year scan loaders below would otherwise re-parse the same 2-24 MB
// vintage files on every request. cityJsonPath also lives there now.
const readJson = readDataJson;
const readJsonOrNull = readDataJsonOrNull;

function centralNodeFor(city: string): string {
  if (city === "paris") return "Budget Paris";
  return `Budget ${city.charAt(0).toUpperCase()}${city.slice(1)}`;
}

// ─── Enrichment caches (written by pipeline/scripts/enrich/*) ──────────────

type VulgarizationCache<T> = { items: Record<string, T>; generated_at?: string; model?: string };

export type MarcheVulgarization = {
  objet_clair: string;
  quoi_concretement: string;
  pourquoi_ca_compte: string;
  year?: number;
  model?: string;
  /** EN siblings — populated when vulgarization_marches_en.json is present */
  objet_clair_en?: string;
  quoi_concretement_en?: string;
  pourquoi_ca_compte_en?: string;
};

export type SubventionVulgarization = {
  activite_claire: string;
  pourquoi_subvention: string;
  impact_citoyen: string;
  model?: string;
  /** EN siblings — populated when vulgarization_subventions_en.json is present */
  activite_claire_en?: string;
  pourquoi_subvention_en?: string;
  impact_citoyen_en?: string;
};

export type SireneCompany = {
  siren: string;
  nom: string;
  forme_juridique?: string;
  libelle_activite?: string;
  activite_principale?: string;
  commune?: string;
  code_postal?: string;
  adresse?: string;
  tranche_effectifs?: string;
  date_creation?: string;
  etat?: string;
  dirigeants?: { nom: string; prenom: string; qualite: string }[];
};

export type BeneficiaireGrounded = {
  activite_verifiee: string;
  perimetre_geographique?: string;
  sources?: ({ url?: string; title?: string } | string)[];
  confiance?: number;
  source_type?: string;
  /** EN siblings — populated when beneficiaire_grounded_en.json is present */
  activite_verifiee_en?: string;
  perimetre_geographique_en?: string;
};

// Cache loaders are memoised at module level — these JSON blobs are small
// and re-reading them on every request wastes IO.
// City-aware caches: each city gets its own vulgarization map so the loader
// can serve Paris and Marseille (and future cities) independently. The path
// helpers cityJsonPath() route to data/<city>/enrichment/ for non-Paris.
const _marchesVulgByCity: Record<string, Record<string, MarcheVulgarization>> = {};
const _subvVulgByCity: Record<string, Record<string, SubventionVulgarization>> = {};
let _sirene: Record<string, SireneCompany> | null = null;
let _benefGrounded: Record<string, BeneficiaireGrounded> | null = null;

export function loadMarcheVulgarization(numero: string, city: string = "paris"): MarcheVulgarization | null {
  if (!_marchesVulgByCity[city]) {
    const data = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_marches.json"));
    const en = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_marches_en.json"));
    const merged: Record<string, MarcheVulgarization> = {};
    for (const [k, v] of Object.entries(data?.items ?? {})) {
      const e = en?.items?.[k];
      merged[k] = e
        ? {
            ...v,
            objet_clair_en: e.objet_clair,
            quoi_concretement_en: e.quoi_concretement,
            pourquoi_ca_compte_en: e.pourquoi_ca_compte,
          }
        : v;
    }
    _marchesVulgByCity[city] = merged;
  }
  return _marchesVulgByCity[city][numero] ?? null;
}

export function loadSubventionVulgarization(name: string, city: string = "paris"): SubventionVulgarization | null {
  if (!_subvVulgByCity[city]) {
    const data = readJsonOrNull<VulgarizationCache<SubventionVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_subventions.json"));
    const en = readJsonOrNull<VulgarizationCache<SubventionVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_subventions_en.json"));
    const merged: Record<string, SubventionVulgarization> = {};
    for (const [k, v] of Object.entries(data?.items ?? {})) {
      const e = en?.items?.[k];
      merged[k] = e
        ? {
            ...v,
            activite_claire_en: e.activite_claire,
            pourquoi_subvention_en: e.pourquoi_subvention,
            impact_citoyen_en: e.impact_citoyen,
          }
        : v;
    }
    _subvVulgByCity[city] = merged;
  }
  return _subvVulgByCity[city][name] ?? null;
}

export function loadSirene(siren: string): SireneCompany | null {
  if (_sirene === null) {
    const data = readJsonOrNull<VulgarizationCache<SireneCompany>>("enrichment/sirene_companies.json");
    _sirene = data?.items ?? {};
  }
  return _sirene[siren] ?? null;
}

const normalizeBenefKey = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export function loadBeneficiaireGrounded(name: string): BeneficiaireGrounded | null {
  if (_benefGrounded === null) {
    const data = readJsonOrNull<{ items?: Record<string, BeneficiaireGrounded> }>("enrichment/beneficiaire_grounded.json");
    const en = readJsonOrNull<{ items?: Record<string, BeneficiaireGrounded> } | Record<string, BeneficiaireGrounded>>("enrichment/beneficiaire_grounded_en.json");
    const raw = data?.items ?? {};
    // EN file may use the same shape (with `items`) or be a flat dict — handle both.
    const enRaw: Record<string, BeneficiaireGrounded> =
      en && typeof en === "object" && "items" in en && en.items
        ? (en.items as Record<string, BeneficiaireGrounded>)
        : ((en as Record<string, BeneficiaireGrounded>) ?? {});
    const reindexed: Record<string, BeneficiaireGrounded> = {};
    for (const [k, v] of Object.entries(raw)) {
      const e = enRaw[k];
      const merged: BeneficiaireGrounded = e
        ? {
            ...v,
            activite_verifiee_en: e.activite_verifiee,
            perimetre_geographique_en: e.perimetre_geographique,
          }
        : v;
      reindexed[normalizeBenefKey(k)] = merged;
    }
    _benefGrounded = reindexed;
  }
  return _benefGrounded[normalizeBenefKey(decodeURIComponent(name))] ?? null;
}

export type LandingStats = {
  year: number;
  /** Type du budget de l'année hero — "vote" si latestYear est un budget primitif voté
   *  pas encore exécuté, "execute" sinon. Sert à afficher "(voté)" sur la landing. */
  budgetType: "vote" | "execute";
  /** Population utilisée pour les calculs per-capita — exposée pour
   *  affichage dans la caption (évite hardcode en i18n). */
  parisPopulation: number;
  totalDepenses: number;
  perCapitaYear: number;
  perCapitaMonth: number;
  deltaVsLastExecutedPct: number;
  deltaVsLastExecutedPerMonth: number;
  lastExecutedYear: number;
  breakdown: { label: string; annual: number; perMonth: number }[];
  nbMarchesCumul: number;
  nbSubventionsCumul: number;
  /** Première année de la couverture marchés (utilisée pour le lede "depuis YYYY"). */
  marchesSinceYear: number;
  /** Première année de la couverture subventions. */
  subventionsSinceYear: number;
  capaciteDesendettement: number; // années, pour teaser stress-test landing
  topBeneficiaires: { name: string; amount: number; year: number }[];
  topFournisseurs: { name: string; siret: string; amount: number; year: number }[];
  /** Lieu vedette pour la card 1 du hero deck — la porte d'entrée « lieux ». */
  featuredLieu: FeaturedLieu | null;
  /** Subvention vedette (Paris Musées). */
  featuredAsso: FeaturedAsso | null;
  /** Catégorie de marché vedette (espaces verts). */
  featuredMarcheCategorie: FeaturedMarcheCategorie | null;
  /** Bailleur vedette (Paris Habitat). */
  featuredBailleur: FeaturedBailleur | null;
};

export type FeaturedLieu = {
  slug: string;
  name: string;
  kind: string;
  arrondissement: number;
  /** Total d'argent public relié au lieu (délibs + marchés + subventions). */
  argentTotal: number;
  depuis: number | null;
  photoPath: string;
  credit: string | null;
};

export type FeaturedAsso = {
  slug: string;
  nom: string;
  year: number;
  montant: number;
  theme: string | null;
  photoPath: string;
  photoCredit: string | null;
};

export type FeaturedMarcheCategorie = {
  slug: string;
  nom: string;
  year: number;
  total: number;
  nbMarches: number;
  photoPath: string;
  photoCredit: string | null;
};

export type FeaturedBailleur = {
  slug: string;
  nom: string;
  year: number;
  capitalRestant: number;
  nbEmprunts: number;
  photoPath: string;
  photoCredit: string | null;
};

// Château-Landon plutôt que Belliard : même famille (piscine, photo dédiée)
// mais 5 marchés rapprochés 2022→2026 dont le gros lot travaux porte des
// données de concurrence DECP (offres reçues) — Belliard, notifié en 2023,
// n'en aura jamais (champ publié à partir du millésime 2024).
const HERO_FEATURED_LIEU_SLUG = "philharmonie-de-paris";

const HERO_FEATURED_ASSO_NAME = "PARIS MUSEES";
const HERO_FEATURED_ASSO_PHOTO = "/photos/hero/petit-palais.jpg";
const HERO_FEATURED_ASSO_PHOTO_CREDIT = "Wikimedia CC";

const HERO_FEATURED_CATEGORIE_LIBELLE = "entretien des espaces verts";
const HERO_FEATURED_CATEGORIE_PHOTO = "/photos/hero/buttes-chaumont.jpg";
const HERO_FEATURED_CATEGORIE_PHOTO_CREDIT = "Wikimedia CC";

const HERO_FEATURED_BAILLEUR_SLUG = "paris-habitat";
const HERO_FEATURED_BAILLEUR_PHOTO = "/photos/hero/cite-michelet.jpg";
const HERO_FEATURED_BAILLEUR_PHOTO_CREDIT = "Wikimedia CC";

function loadFeaturedLieu(): FeaturedLieu | null {
  const l = loadLieuxIndex().find((x) => x.slug === HERO_FEATURED_LIEU_SLUG);
  if (!l?.photo || !l.argent_total_eur) return null;
  const fiche = loadLieu(l.slug);
  return {
    slug: l.slug,
    name: l.name,
    kind: l.kind_fr,
    arrondissement: l.arrondissement,
    argentTotal: l.argent_total_eur,
    depuis: l.depuis ?? null,
    photoPath: l.photo,
    credit: fiche?.photo_credit?.auteur ?? fiche?.photo_credit?.source ?? null,
  };
}

function loadFeaturedAsso(): FeaturedAsso | null {
  try {
    const subvIdx = readJson<{
      totalsByYear: Record<string, unknown>;
      previewYears?: number[];
    }>("subventions/index.json");
    const previewSet = new Set(subvIdx.previewYears ?? []);
    const years = Object.keys(subvIdx.totalsByYear)
      .map(Number)
      .filter((y) => !previewSet.has(y))
      .sort((a, b) => b - a);
    const yr = years[0];
    if (!yr) return null;
    const file = readJson<{
      data: Array<{ beneficiaire: string; montant_total: number; thematique?: string }>;
    }>(`subventions/beneficiaires_${yr}.json`);
    const match = file.data.find(
      (b) => b.beneficiaire.trim().toUpperCase() === HERO_FEATURED_ASSO_NAME,
    );
    if (!match) return null;
    return {
      slug: encodeURIComponent(match.beneficiaire.trim()),
      nom: match.beneficiaire.trim(),
      year: yr,
      montant: match.montant_total,
      theme: match.thematique ?? null,
      photoPath: HERO_FEATURED_ASSO_PHOTO,
      photoCredit: HERO_FEATURED_ASSO_PHOTO_CREDIT,
    };
  } catch {
    return null;
  }
}

function loadFeaturedMarcheCategorie(): FeaturedMarcheCategorie | null {
  try {
    const idx = readJson<{ availableYears?: number[] }>("marches-publics/index.json");
    // Schema changed across years: granular categories ("entretien des espaces verts")
    // existed pre-2025; recent years coarsened to ("Travaux", "Fournitures").
    // Scan years descending and use the most recent year where the granular
    // category still resolves.
    const years = (idx.availableYears ?? []).slice().sort((a, b) => b - a);
    for (const yr of years) {
      try {
        const file = readJson<{
          data?: Array<{ categorie_libelle?: string; nature?: string; montant_max?: number; montant_min?: number }>;
          marches?: Array<{ categorie_libelle?: string; nature?: string; montant_max?: number; montant_min?: number }>;
        }>(`marches-publics/marches_${yr}.json`);
        const rows = file.data ?? file.marches ?? [];
        const matching = rows.filter(
          (r) => (r.categorie_libelle ?? r.nature ?? "").toLowerCase() === HERO_FEATURED_CATEGORIE_LIBELLE,
        );
        if (matching.length === 0) continue;
        const total = matching.reduce((s, r) => s + (Number(r.montant_max ?? r.montant_min) || 0), 0);
        return {
          slug: HERO_FEATURED_CATEGORIE_LIBELLE.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          nom: "Entretien des espaces verts",
          year: yr,
          total,
          nbMarches: matching.length,
          photoPath: HERO_FEATURED_CATEGORIE_PHOTO,
          photoCredit: HERO_FEATURED_CATEGORIE_PHOTO_CREDIT,
        };
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function loadFeaturedBailleur(): FeaturedBailleur | null {
  try {
    const idx = readJson<{ latestYear: number }>("hors_bilan_index.json");
    const hb = readJson<{
      year: number;
      top_beneficiaires: Array<{
        name: string;
        capital_restant: number;
        count_emprunts: number;
      }>;
    }>(`hors_bilan_${idx.latestYear}.json`);
    // Match canonical slug "paris-habitat" against entries
    const match = hb.top_beneficiaires.find((b) => {
      const slug = b.name
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s+oph\b/i, "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return slug === HERO_FEATURED_BAILLEUR_SLUG;
    });
    if (!match) return null;
    return {
      slug: HERO_FEATURED_BAILLEUR_SLUG,
      nom: "Paris Habitat",
      year: hb.year,
      capitalRestant: match.capital_restant,
      nbEmprunts: match.count_emprunts,
      photoPath: HERO_FEATURED_BAILLEUR_PHOTO,
      photoCredit: HERO_FEATURED_BAILLEUR_PHOTO_CREDIT,
    };
  } catch {
    return null;
  }
}

/**
 * Loads the figures powering the landing hero + scale section.
 * Server-side only — reads JSON straight from /public/data.
 */
export function loadLandingStats(): LandingStats {
  const index = readJson<BudgetIndex>("budget_index.json");
  const year = index.latestYear;
  const lastExecutedYear = index.latestCompleteYear;

  const sankey = readJson<BudgetSankey>(`budget_sankey_${year}.json`);
  const totalDepenses = sankey.totals.depenses;

  const byYear = Object.fromEntries(index.summary.map((s) => [s.year, s]));
  const ref = byYear[lastExecutedYear];
  const deltaAbs = ref ? totalDepenses - ref.depenses : 0;
  const deltaVsLastExecutedPct = ref ? (deltaAbs / ref.depenses) * 100 : 0;
  const deltaVsLastExecutedPerMonth = deltaAbs / PARIS_POPULATION / 12;

  const perCapitaYear = totalDepenses / PARIS_POPULATION;
  const perCapitaMonth = perCapitaYear / 12;

  const breakdown = sankey.links
    .filter((l) => l.source === "Budget Paris")
    .map((l) => ({
      label: l.target,
      annual: l.value,
      perMonth: l.value / PARIS_POPULATION / 12,
    }))
    .sort((a, b) => b.annual - a.annual);

  const marchesIdx = readJson<{ totalsByYear: Record<string, { nb_marches: number }> }>(
    "marches-publics/index.json",
  );
  const subventionsIdx = readJson<{ totalsByYear: Record<string, { nb_subventions: number }> }>(
    "subventions/index.json",
  );
  const nbMarchesCumul = Object.values(marchesIdx.totalsByYear).reduce(
    (s, v) => s + (v.nb_marches ?? 0),
    0,
  );
  const nbSubventionsCumul = Object.values(subventionsIdx.totalsByYear).reduce(
    (s, v) => s + (v.nb_subventions ?? 0),
    0,
  );
  // Span temporel pour le lede transparent — sinon le user croit que les
  // nb_marches/nb_subventions sont annuels alors qu'ils sont cumulés.
  const marchesYears = Object.keys(marchesIdx.totalsByYear).map(Number).filter((y) => Number.isFinite(y));
  const subventionsYears = Object.keys(subventionsIdx.totalsByYear).map(Number).filter((y) => Number.isFinite(y));
  const marchesSinceYear = marchesYears.length ? Math.min(...marchesYears) : year;
  const subventionsSinceYear = subventionsYears.length ? Math.min(...subventionsYears) : year;

  // Capacité de désendettement — même formule que loadPatrimoineData, mais
  // sans recharger tout le bilan complet (on se contente du dernier exercice
  // exécuté). Sert au teaser stress-test sur la landing.
  let capaciteDesendettement = 0;
  try {
    const bilan = readJson<{ totals: { dettes_financieres: number } }>(
      `bilan_sankey_${lastExecutedYear}.json`,
    );
    const budget = readJson<BudgetSankeyFull>(`budget_sankey_${lastExecutedYear}.json`);
    let fonctionnement = 0;
    for (const cat of Object.values(budget.bySection)) {
      fonctionnement += cat.Fonctionnement?.total ?? 0;
    }
    const emprunts = budget.links
      .filter((l) => l.source === "Emprunts" && l.target === "Budget Paris")
      .reduce((s, l) => s + l.value, 0);
    const recettesInvest = budget.links
      .filter((l) => l.source === "Investissement" && l.target === "Budget Paris")
      .reduce((s, l) => s + l.value, 0);
    const recettesFonct = budget.totals.recettes - emprunts - recettesInvest;
    const epargneBrute = Math.max(0, recettesFonct - fonctionnement);
    capaciteDesendettement = epargneBrute > 0
      ? bilan.totals.dettes_financieres / epargneBrute
      : 0;
  } catch {}

  // Top 3 bénéficiaires — dernière année de subventions NON preview (données
  // consolidées, pas un aperçu partiel).
  let topBeneficiaires: LandingStats["topBeneficiaires"] = [];
  try {
    const subvIdxFull = readJson<{
      totalsByYear: Record<string, { nb_subventions: number }>;
      previewYears?: number[];
    }>("subventions/index.json");
    const previewSet = new Set(subvIdxFull.previewYears ?? []);
    const subvYears = Object.keys(subvIdxFull.totalsByYear)
      .map(Number)
      .filter((y) => !previewSet.has(y))
      .sort((a, b) => b - a);
    const latestSubvYear = subvYears[0];
    if (latestSubvYear) {
      const benFile = readJson<{ data: { beneficiaire: string; montant_total: number }[] }>(
        `subventions/beneficiaires_${latestSubvYear}.json`,
      );
      topBeneficiaires = benFile.data
        .slice()
        .sort((a, b) => b.montant_total - a.montant_total)
        .slice(0, 3)
        .map((b) => ({ name: b.beneficiaire, amount: b.montant_total, year: latestSubvYear }));
    }
  } catch {}

  // Top 3 fournisseurs — dernière année de marchés disponible
  let topFournisseurs: LandingStats["topFournisseurs"] = [];
  try {
    const marchesYears = Object.keys(marchesIdx.totalsByYear)
      .map(Number)
      .sort((a, b) => b - a);
    const latestMarchesYear = marchesYears[0];
    if (latestMarchesYear) {
      const MULTI_NAME = "MARCHE MULTIATTRIBUTAIRE";
      const marchesFile = readJson<{
        data?: MarcheRow[];
        marches?: MarcheRow[];
      }>(`marches-publics/marches_${latestMarchesYear}.json`);
      const rows = marchesFile.data ?? marchesFile.marches ?? [];
      const agg = new Map<string, { name: string; siret: string; amount: number }>();
      for (const r of rows) {
        const name = (r.fournisseur_nom ?? "").trim();
        if (!name || name === MULTI_NAME) continue;
        if ((r as { is_multiattributaire?: boolean }).is_multiattributaire) continue;
        const rawSiret = ((r as { fournisseur_siret?: string }).fournisseur_siret ?? "").replace(/\s/g, "");
        const siren = rawSiret.slice(0, 9);
        const key = siren || name.toLowerCase();
        const v = Number(r.montant_max ?? r.montant_min ?? 0);
        const curr = agg.get(key) ?? { name, siret: rawSiret, amount: 0 };
        curr.amount += v;
        if (!curr.siret && rawSiret) curr.siret = rawSiret;
        agg.set(key, curr);
      }
      topFournisseurs = [...agg.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map((f) => ({ ...f, year: latestMarchesYear }));
    }
  } catch {}

  // budgetType : on regarde la summary entry pour l'année hero. Si l'année
  // est dans `latestCompleteYear`+, c'est encore voté.
  const heroEntry = byYear[year];
  const budgetType: "vote" | "execute" = heroEntry?.type_budget === "execute" ? "execute" : "vote";

  return {
    year,
    budgetType,
    parisPopulation: PARIS_POPULATION,
    totalDepenses,
    perCapitaYear,
    perCapitaMonth,
    deltaVsLastExecutedPct,
    deltaVsLastExecutedPerMonth,
    lastExecutedYear,
    breakdown,
    nbMarchesCumul,
    nbSubventionsCumul,
    marchesSinceYear,
    subventionsSinceYear,
    capaciteDesendettement,
    topBeneficiaires,
    topFournisseurs,
    featuredLieu: loadFeaturedLieu(),
    featuredAsso: loadFeaturedAsso(),
    featuredMarcheCategorie: loadFeaturedMarcheCategorie(),
    featuredBailleur: loadFeaturedBailleur(),
  };
}

// Re-export format helpers from `./fmt` so existing `import { fmtInt } from
// "@/lib/fusion-data"` keeps working. Client components should import from
// `@/lib/fmt` directly to avoid pulling the server-only loaders.
export { fmtInt, fmtDec, fmtBillions, fmtMillions, fmtCompactEur } from "./fmt";

export type BudgetPageData = {
  year: number;
  previousYear: number;
  recettes: number;
  depenses: number;
  solde: number;
  deltaDepensesPct: number;
  fonctionnement: number;
  investissement: number;
  epargneBrute: number;
  topDepenses: {
    label: string;
    value: number;
    /** Variation en % vs l'année précédente (null si indisponible). */
    deltaPct: number | null;
    /** Top sous-postes (fonctionnement + investissement fusionnés, triés par montant desc). */
    subPostes: { name: string; value: number }[];
  }[];
  recettesBreakdown: {
    label: string;
    value: number;
    /** Top sous-sources (depuis drilldown.revenue), triées par montant desc. */
    subSources: { name: string; value: number }[];
  }[];
  sankeyNodes: { name: string; category?: string }[];
  sankeyLinks: { source: string; target: string; value: number }[];
  yearsSummary: {
    year: number;
    type: "vote" | "execute";
    depenses: number;
    recettes: number;
    solde: number;
  }[];
};

type BudgetSankeyFull = {
  year: number;
  totals: { recettes: number; depenses: number; solde: number };
  nodes?: { name: string; category?: string }[];
  links: SankeyLink[];
  bySection: Record<
    string,
    {
      Fonctionnement?: { total: number; items?: BudgetDrilldownItem[] };
      Investissement?: { total: number; items?: BudgetDrilldownItem[] };
    }
  >;
  drilldown?: {
    revenue?: Record<string, BudgetDrilldownItem[]>;
    expenses?: Record<string, BudgetDrilldownItem[]>;
  };
};

/**
 * Une ligne de drilldown budget. `fonction` (sous-thématique fonctionnelle —
 * Musées, Piscines, Théâtre, etc.) et `flow_category` (Personnel, Subventions,
 * Achats, Investissement…) ont été ajoutés au pipeline 2026-05-20 pour
 * structurer les sub-postes dans le drawer. Optionnels pour rétro-compat
 * avec d'éventuels JSON pré-export.
 */
type BudgetDrilldownItem = {
  name: string;
  value: number;
  fonction?: string;
  flow_category?: string;
};

// ─── Subventions ───────────────────────────────────────────────────────────

type SubvIndex = {
  availableYears: number[];
  previewYears?: number[];
  totalsByYear: Record<string, { montant_total: number; nb_subventions: number }>;
};

type SubvBen = {
  year: number;
  total_montant: number;
  nb_beneficiaires: number;
  data: Array<{
    beneficiaire: string;
    thematique?: string | null;
    montant_total: number;
    nb_subventions: number;
    nature_juridique?: string | null;
    direction?: string | null;
    secteurs_activite?: string | null;
    sous_categorie?: string | null;
    objet_principal?: string | null;
    siret?: string | null;
  }>;
};

type _SubvTreemap = {
  year: number;
  data: Array<{ name: string; montant_total?: number; montant?: number; value?: number; nb?: number; nb_subventions?: number }>;
};

export type QuiRecoitData = {
  year: number;
  previousYear: number;
  isPreview: boolean;
  total: number;
  nbSubventions: number;
  nbBeneficiaires: number;
  medianSubvention: number;
  topThemeName: string | null;
  topThemeAmount: number;
  concentrationTop10Pct: number;
  deltaMontantPct: number;
  deltaNbPct: number;
  top10: {
    rank: number;
    name: string;
    theme: string | null;
    amount: number;
    totalAmount: number;
    lastActiveYear: number;
    nb: number;
    history: { year: number; amount: number }[];
  }[];
  byTheme: {
    theme: string;
    amount: number;
    count: number;
    topBen: { name: string; amount: number; nb: number }[];
  }[];
  yearsSummary: { year: number; total: number; count: number; preview: boolean }[];
  availableThemes: string[];
  /** Aides aux personnes physiques (agrégat ; count null si source déjà agrégée). */
  personnesPhysiques: { amount: number; count: number | null };
  movers: {
    hausses: { name: string; amount: number; delta: number }[];
    baisses: { name: string; amount: number; delta: number }[];
    /** Nombre total de bénéficiaires passant les seuils de bruit
     *  (montant courant ≥ 100 k€ ET année précédente ≥ 50 k€). */
    qualifiedCount: number;
    thresholdCurrentEur: number;
    thresholdPrevEur: number;
  };
  /** « Par exemple » : plus gros bénéficiaire, plus grosse association,
   *  association soutenue chaque année de la fenêtre de données. */
  exemples: {
    kind: "gros" | "asso" | "fidele";
    name: string;
    theme: string | null;
    nature: string | null;
    amount: number;
    sinceYear: number | null;
    photoUrl: string | null;
    photoCredit: string | null;
    photoKind: "reelle" | "illustration" | null;
  }[];
};

export function loadQuiRecoitIndex(city: string = "paris") {
  return readJson<SubvIndex>(cityJsonPath(city, "subventions/index.json"));
}

// ─── Association fiche ────────────────────────────────────────────────────

export type AssociationFiche = {
  name: string;
  theme: string | null;
  natureJuridique: string | null;
  totalAmount: number;
  subventionCount: number;
  siret: string | null;
  yearsActive: number[];
  byYear: { year: number; amount: number; count: number }[];
  byTheme: { theme: string; amount: number; count: number }[];
  /** Ranking within primary thematic (1-indexed) + total count. Null if theme missing. */
  themeRank: { rank: number; total: number; theme: string } | null;
  /** Year-over-year swings ≥ 20% on the byYear timeline — used to annotate the chart. */
  highlights: { year: number; pct: number; kind: "up" | "down" }[];
  /** One entry per (year × direction) with aggregated montant + objet principal.
   * Beneficiaires_*.json already pre-aggregates per beneficiary per year, so
   * this is essentially the line-level public data we have. */
  lignes: {
    year: number;
    direction: string | null;
    subCategory: string | null;
    objet: string | null;
    secteurs: string | null;
    amount: number;
    nb: number;
  }[];
};

/**
 * Load an association by its decoded name. Scans every available year
 * and aggregates totals. Name must match exactly (case-insensitive).
 */
export function loadAssociation(name: string, city: string = "paris"): AssociationFiche | null {
  const idx = readJson<SubvIndex>(cityJsonPath(city, "subventions/index.json"));
  const target = decodeURIComponent(name).toLowerCase();
  const byYearMap = new Map<number, { amount: number; count: number }>();
  const byThemeMap = new Map<string, { amount: number; count: number }>();
  const lignes: AssociationFiche["lignes"] = [];
  let canonicalName = "";
  let theme: string | null = null;
  let natureJuridique: string | null = null;
  let siret: string | null = null;

  for (const y of idx.availableYears) {
    try {
      const f = readJson<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${y}.json`));
      for (const b of f.data) {
        if (b.beneficiaire.toLowerCase() !== target) continue;
        canonicalName = canonicalName || b.beneficiaire;
        theme = theme ?? b.thematique ?? null;
        natureJuridique = natureJuridique ?? b.nature_juridique ?? null;
        siret = siret ?? b.siret ?? null;

        const cur = byYearMap.get(y) ?? { amount: 0, count: 0 };
        cur.amount += b.montant_total;
        cur.count += b.nb_subventions;
        byYearMap.set(y, cur);

        if (b.thematique) {
          const t = byThemeMap.get(b.thematique) ?? { amount: 0, count: 0 };
          t.amount += b.montant_total;
          t.count += b.nb_subventions;
          byThemeMap.set(b.thematique, t);
        }

        lignes.push({
          year: y,
          direction: b.direction ?? null,
          subCategory: b.sous_categorie ?? null,
          objet: b.objet_principal ?? null,
          secteurs: b.secteurs_activite ?? null,
          amount: b.montant_total,
          nb: b.nb_subventions,
        });
      }
    } catch {}
  }

  if (!canonicalName) return null;

  const byYear = [...byYearMap.entries()]
    .map(([year, v]) => ({ year, amount: v.amount, count: v.count }))
    .sort((a, b) => a.year - b.year);
  const totalAmount = byYear.reduce((s, y) => s + y.amount, 0);
  const subventionCount = byYear.reduce((s, y) => s + y.count, 0);
  const byTheme = [...byThemeMap.entries()]
    .map(([th, v]) => ({ theme: th, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // Highlights: YoY swings ≥ 20% (absolute) on the byYear series
  const highlights: { year: number; pct: number; kind: "up" | "down" }[] = [];
  for (let i = 1; i < byYear.length; i++) {
    const cur = byYear[i];
    const prev = byYear[i - 1];
    if (prev.amount <= 0) continue;
    const pct = ((cur.amount - prev.amount) / prev.amount) * 100;
    if (Math.abs(pct) >= 20) {
      highlights.push({ year: cur.year, pct, kind: pct > 0 ? "up" : "down" });
    }
  }

  // Theme rank — where does this asso sit in its primary thematic?
  // Compare against the most recent year available in the subventions index.
  let themeRank: AssociationFiche["themeRank"] = null;
  if (theme) {
    try {
      const latestYear = idx.availableYears[0];
      const f = readJson<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${latestYear}.json`));
      const sameTheme = f.data
        .filter((b) => b.thematique === theme)
        .sort((a, b) => b.montant_total - a.montant_total);
      const targetLower = canonicalName.toLowerCase();
      const rank = sameTheme.findIndex((b) => b.beneficiaire.toLowerCase() === targetLower) + 1;
      if (rank > 0) {
        themeRank = { rank, total: sameTheme.length, theme };
      }
    } catch {
      /* missing file — skip */
    }
  }

  return {
    name: canonicalName,
    theme,
    natureJuridique,
    siret,
    totalAmount,
    subventionCount,
    yearsActive: byYear.map((y) => y.year),
    byYear,
    lignes: lignes.sort((a, b) => (b.year - a.year) || (b.amount - a.amount)),
    byTheme,
    themeRank,
    highlights,
  };
}

// ─── Projet (investissements) fiche ────────────────────────────────────────

export type ProjetVulgarization = {
  description_claire: string;
  quoi_concretement: string;
  pourquoi_ca_compte: string;
  typologie_normalisee: string;
  model?: string;
  /** EN siblings — populated when vulgarization_projets_en.json is present */
  description_claire_en?: string;
  quoi_concretement_en?: string;
  pourquoi_ca_compte_en?: string;
};

export type ProjetMarche = {
  numero_marche: string;
  fournisseur_nom: string | null;
  fournisseur_siret: string | null;
  objet: string;
  annee: number | null;
  montant_max: number;
  montant_notifie: number | null;
  date_notification: string | null;
  ccag: string | null;
  cpv_famille: string | null;
  lieu_execution: string | null;
  score: number;
  label: "confirmed" | "probable";
  /** Nombre d'offres reçues (DECP), joint au chargement depuis les exports
   *  marchés. Absent de projet_marches.json — null pour les millésimes
   *  antérieurs à 2024 où le champ n'est pas publié. */
  offres_recues?: number | null;
  /** Libellés vulgarisés, joints au chargement — même précédence que les
   *  autres listes : objet_clair (EN si dispo) → normalizeObjet(objet). */
  objet_clair?: string | null;
  objet_clair_en?: string | null;
};

// Index numero_marche → offres reçues, construit une fois depuis les exports
// marchés (le champ n'existe pas dans projet_marches.json). Mémoïsé process-
// wide comme les autres caches de ce module.
let _offresByNumero: Map<string, number> | null = null;

function offresRecuesFor(numero: string): number | null {
  if (_offresByNumero === null) {
    _offresByNumero = new Map();
    const indexRaw = readJsonOrNull<MarchesIndexRaw>("marches-publics/index.json");
    for (const y of indexRaw?.availableYears ?? []) {
      const f = readJsonOrNull<MarchesFile>(`marches-publics/marches_${y}.json`);
      for (const m of f?.data ?? f?.marches ?? []) {
        const r = m as MarcheRow & { numero_marche?: string };
        const n = Number(r.decp_offres_recues ?? 0);
        if (r.numero_marche && Number.isFinite(n) && n > 0) {
          _offresByNumero.set(r.numero_marche, n);
        }
      }
    }
  }
  return _offresByNumero.get(numero) ?? null;
}

export type ProjetFiche = {
  id: string;
  name: string;
  name_en?: string;
  arrondissement: number;
  chapitre: string;
  typeAp: string | null;
  montant: number;
  year: number;
  lat: number | null;
  lon: number | null;
  geoLabel: string | null;
  sourcePdf: string | null;
  sourcePage: number | null;
  confidence: number | null;
  /** Vulgarisation IA si dispo dans le cache. */
  vulgarization: ProjetVulgarization | null;
  /** Photo résolue pour client (photo + générique + typologie). */
  photo: ProjetPhotoResolved;
  /** Rank parmi les projets de même typologie (ou chapitre) dans le même exercice. */
  typologieRank: { rank: number; total: number; typologie: string } | null;
  /** Rank parmi tous les projets du même arrondissement, même exercice. */
  arrRank: { rank: number; total: number; arr: number } | null;
  /** Projets similaires (même typologie + top montants) — pour "voir aussi". */
  similaires: {
    id: string;
    name: string;
    name_en?: string;
    montant: number;
    arrondissement: number;
    typologie: string | null;
  }[];
  /** Matchs projet ↔ marchés publics (rapprochement heuristique). */
  marches: ProjetMarche[];
  /** Couverture du rapprochement projet↔marchés sur les projets NOMMÉS
   *  (PDF Investissements Localisés 2022-2024). Les lignes AP des années
   *  antérieures n'étant pas des projets identifiables, elles ne sont pas
   *  comptées dans le dénominateur. */
  marchesCoverage: { matched: number; total: number; pct: number; scopeYears: [number, number] };
};

let _projetMarches: Record<string, ProjetMarche[]> | null = null;

export function loadProjetMarches(id: string): ProjetMarche[] {
  if (_projetMarches === null) {
    const raw = readJsonOrNull<{ projets?: Record<string, ProjetMarche[]> }>("map/projet_marches.json");
    _projetMarches = raw?.projets ?? {};
  }
  // Joins au moment de la lecture (pas stockés dans le fichier de
  // rapprochement) : offres reçues depuis les exports marchés, et nom du
  // titulaire via le cache SIRENE quand DECP ne publie que le SIRET — les
  // lignes decp-2025/2026 arrivent parfois sans `fournisseur_nom` alors que
  // l'entreprise est résolvable localement.
  return (_projetMarches[id] ?? []).map((m) => {
    let nom = m.fournisseur_nom;
    if (!nom && m.fournisseur_siret) {
      const siren = m.fournisseur_siret.replace(/\s/g, "").slice(0, 9);
      if (/^\d{9}$/.test(siren)) nom = loadSirene(siren)?.nom ?? null;
    }
    const vulg = m.numero_marche ? loadMarcheVulgarization(m.numero_marche) : null;
    return {
      ...m,
      fournisseur_nom: nom,
      offres_recues: m.numero_marche ? offresRecuesFor(m.numero_marche) : null,
      objet_clair: vulg?.objet_clair ?? null,
      objet_clair_en: vulg?.objet_clair_en ?? null,
    };
  });
}

/** Lien inverse marché → chantier (projet d'investissement). Donne à la
 *  fiche contrat sa photo et son contexte : « ce marché contribue au
 *  chantier X ». Index construit une fois depuis projet_marches.json +
 *  noms/arrondissements des exports investissements + photos d'enrichissement. */
export type ContratProjetLink = {
  id: string;
  nom: string;
  nomEn: string | null;
  arrondissement: number | null;
  nbMarches: number;
  photoUrl: string | null;
  photoCredit: string | null;
};

let _projetByNumero: Map<string, ContratProjetLink> | null = null;

export function loadContratProjet(numero: string): ContratProjetLink | null {
  if (_projetByNumero === null) {
    _projetByNumero = new Map();
    const raw = readJsonOrNull<{ projets?: Record<string, ProjetMarche[]> }>("map/projet_marches.json");
    const projets = raw?.projets ?? {};

    // Noms + arrondissements : premier fichier qui connaît l'id gagne.
    const meta = new Map<string, { nom: string; arr: number | null }>();
    for (let y = 2024; y >= 2018; y--) {
      for (const file of [
        readJsonOrNull<InvComplet>(`map/investissements_complet_${y}.json`),
        readJsonOrNull<InvComplet>(`map/investissements_localises_${y}.json`),
      ]) {
        for (const p of file?.data ?? []) {
          if (p.id && p.nom_projet && !meta.has(p.id)) {
            meta.set(p.id, { nom: p.nom_projet, arr: Number(p.arrondissement) || null });
          }
        }
      }
    }
    const namesEn = readJsonOrNull<Record<string, string>>("enrichment/projet_names_en.json") ?? {};
    const photos = readJsonOrNull<{ items: Record<string, { photo_url?: string | null; credit?: string | null }> }>(
      "enrichment/projet_photos.json",
    );

    for (const [pid, marches] of Object.entries(projets)) {
      const m = meta.get(pid);
      if (!m) continue;
      const ph = photos?.items?.[pid];
      const link: ContratProjetLink = {
        id: pid,
        nom: m.nom,
        nomEn: typeof namesEn[pid] === "string" ? namesEn[pid] : null,
        arrondissement: m.arr,
        nbMarches: marches.length,
        photoUrl: ph?.photo_url ?? null,
        photoCredit: ph?.credit ?? null,
      };
      for (const mm of marches) {
        // Un marché peut apparaître dans plusieurs projets (lots partagés) :
        // on garde le projet au rapprochement le plus riche (plus de marchés
        // = chantier mieux documenté).
        const prev = _projetByNumero.get(mm.numero_marche);
        if (!prev || link.nbMarches > prev.nbMarches) {
          _projetByNumero.set(mm.numero_marche, link);
        }
      }
    }
  }
  return _projetByNumero.get(numero) ?? null;
}

let _projetMarchesCoverage: {
  matched: number;
  total: number;
  pct: number;
  scopeYears: [number, number];
} | null = null;

/** Couverture du rapprochement projet↔marchés. Le dénominateur est limité
 *  aux PROJETS NOMMÉS (avec `nom_projet` non vide), c'est-à-dire ceux
 *  extraits du PDF Investissements Localisés (2022-2024). Les lignes AP
 *  2018-2021 ne sont PAS des projets mais des enveloppes budgétaires
 *  agrégées et ne se prêtent pas au rapprochement marché. Mémoïsé. */
export function loadProjetMarchesCoverage(): {
  matched: number;
  total: number;
  pct: number;
  scopeYears: [number, number];
} {
  if (_projetMarchesCoverage !== null) return _projetMarchesCoverage;
  if (_projetMarches === null) {
    const raw = readJsonOrNull<{ projets?: Record<string, ProjetMarche[]> }>("map/projet_marches.json");
    _projetMarches = raw?.projets ?? {};
  }
  const matchedIds = new Set(Object.keys(_projetMarches));
  const namedIds = new Set<string>();
  let minYear = Infinity;
  let maxYear = -Infinity;
  // Scan des deux sources : 'complet' (priorité, contient géoloc) et
  // 'localises' (PDF IL extraits, contient les vrais projets nommés
  // 2019-2021 absents de 'complet'). Un même id présent dans les deux
  // n'est compté qu'une fois (Set).
  for (let y = 2024; y >= 2018; y--) {
    const filesToScan = [
      readJsonOrNull<InvComplet>(`map/investissements_complet_${y}.json`),
      readJsonOrNull<InvComplet>(`map/investissements_localises_${y}.json`),
    ].filter(Boolean) as InvComplet[];
    for (const file of filesToScan) {
      for (const p of file.data) {
        const nom = (p.nom_projet ?? "").trim();
        if (nom.length > 0) {
          namedIds.add(p.id);
          if (y < minYear) minYear = y;
          if (y > maxYear) maxYear = y;
        }
      }
    }
  }
  const total = namedIds.size;
  const matched = [...matchedIds].filter((id) => namedIds.has(id)).length;
  const pct = total > 0 ? (matched / total) * 100 : 0;
  _projetMarchesCoverage = {
    matched,
    total,
    pct,
    scopeYears: [
      Number.isFinite(minYear) ? minYear : 2022,
      Number.isFinite(maxYear) ? maxYear : 2024,
    ],
  };
  return _projetMarchesCoverage;
}

let _projetsVulg: Record<string, ProjetVulgarization> | null = null;

export function loadProjetVulgarization(id: string): ProjetVulgarization | null {
  if (_projetsVulg === null) {
    const data = readJsonOrNull<VulgarizationCache<ProjetVulgarization>>("enrichment/vulgarization_projets.json");
    const en = readJsonOrNull<VulgarizationCache<ProjetVulgarization>>("enrichment/vulgarization_projets_en.json");
    const merged: Record<string, ProjetVulgarization> = {};
    for (const [k, v] of Object.entries(data?.items ?? {})) {
      const e = en?.items?.[k];
      merged[k] = e
        ? {
            ...v,
            description_claire_en: e.description_claire,
            quoi_concretement_en: e.quoi_concretement,
            pourquoi_ca_compte_en: e.pourquoi_ca_compte,
          }
        : v;
    }
    _projetsVulg = merged;
  }
  return _projetsVulg[id] ?? null;
}

let _projetNamesEn: Record<string, string> | null = null;

export function getProjetNameEn(id: string): string | null {
  if (_projetNamesEn === null) {
    _projetNamesEn = readJsonOrNull<Record<string, string>>("enrichment/projet_names_en.json") ?? {};
  }
  return _projetNamesEn[id] ?? null;
}

// `guessTypologieFromName`, types photos — déplacés vers `@/lib/projet-utils`
// pour être importables depuis les composants client sans embarquer fs/path.
import { guessTypologieFromName } from "./projet-utils";
import type { GenericPhotoEntry, ProjetPhotoDecision, ProjetPhotoResolved } from "./projet-utils";
export { guessTypologieFromName };
export type { GenericPhotoEntry, ProjetPhotoDecision, ProjetPhotoResolved };

// ─── Projet photo decision ─────────────────────────────────────────────────

let _projetPhotos: Record<string, ProjetPhotoDecision> | null = null;
let _genericBank: Record<string, GenericPhotoEntry> | null = null;

export function loadProjetPhoto(id: string): ProjetPhotoDecision | null {
  if (_projetPhotos === null) {
    const data = readJsonOrNull<{ items?: Record<string, ProjetPhotoDecision> }>("enrichment/projet_photos.json");
    _projetPhotos = data?.items ?? {};
  }
  return _projetPhotos[id] ?? null;
}

export function loadGenericPhoto(typologie: string): GenericPhotoEntry | null {
  if (_genericBank === null) {
    const data = readJsonOrNull<{ items?: Record<string, GenericPhotoEntry> }>("enrichment/generic_photo_bank.json");
    _genericBank = data?.items ?? {};
  }
  const hit = _genericBank[typologie];
  return hit && hit.url ? hit : null;
}

/** Résout photo + générique + typologie en une fois pour un projet — à appeler
 *  depuis les pages serveurs pour pré-calculer et passer aux composants clients. */
export function resolveProjetPhoto(projetId: string, name?: string | null): ProjetPhotoResolved {
  const photo = loadProjetPhoto(projetId);
  const vulg = loadProjetVulgarization(projetId);
  const typologie = vulg?.typologie_normalisee ?? guessTypologieFromName(name ?? null) ?? null;
  const generic = typologie ? loadGenericPhoto(typologie) : null;
  return { photo, generic, typologie };
}

export function loadProjet(id: string): ProjetFiche | null {
  const decoded = decodeURIComponent(id);
  // Scan toutes les années — d'abord investissements_complet (priorité,
  // car contient géoloc + métadonnées riches), puis investissements_localises
  // en fallback (pour les projets PDF 2019-2021 absents du complet).
  for (let y = 2024; y >= 2018; y--) {
    let year: InvComplet | null = null;
    try {
      year = readJson<InvComplet>(`map/investissements_complet_${y}.json`);
    } catch { /* fichier absent */ }
    const localises = readJsonOrNull<InvComplet>(`map/investissements_localises_${y}.json`);
    let row = year?.data.find((p) => p.id === decoded);
    if (!row && localises) {
      row = localises.data.find((p) => p.id === decoded);
    }
    if (!row) continue;
    // Cohort = jeu de données utilisé pour calculer les ranks. Préfère
    // 'complet' s'il existe (plus large), sinon 'localises'.
    const cohort: InvComplet = year ?? localises ?? { data: [] } as unknown as InvComplet;
    const r = row as typeof row & {
      type_ap?: string;
      source_pdf?: string;
      source_page?: number;
      confidence?: number;
      geo_label?: string;
    };

    const vulgarization = loadProjetVulgarization(r.id);
    const typologie = vulgarization?.typologie_normalisee ?? null;
    const montant = Number(r.montant ?? 0);
    const arrondissement = Number(r.arrondissement) || 0;

    // Rank by typologie + same year — requires vulgarization cache to be useful
    let typologieRank: ProjetFiche["typologieRank"] = null;
    if (typologie) {
      const sameTypo = cohort.data
        .filter((p) => {
          const vv = loadProjetVulgarization(p.id);
          return vv?.typologie_normalisee === typologie;
        })
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0));
      const rank = sameTypo.findIndex((p) => p.id === r.id) + 1;
      if (rank > 0) typologieRank = { rank, total: sameTypo.length, typologie };
    }

    // Rank by arrondissement + same year
    let arrRank: ProjetFiche["arrRank"] = null;
    if (arrondissement > 0) {
      const sameArr = cohort.data
        .filter((p) => Number(p.arrondissement) === arrondissement)
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0));
      const rank = sameArr.findIndex((p) => p.id === r.id) + 1;
      if (rank > 0) arrRank = { rank, total: sameArr.length, arr: arrondissement };
    }

    // Similar projects — same typologie, different id, top montants
    const similaires: ProjetFiche["similaires"] = [];
    if (typologie) {
      const peers = cohort.data
        .filter((p) => {
          if (p.id === r.id) return false;
          const vv = loadProjetVulgarization(p.id);
          return vv?.typologie_normalisee === typologie;
        })
        .slice()
        .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0))
        .slice(0, 4);
      for (const peer of peers) {
        const pvv = loadProjetVulgarization(peer.id);
        similaires.push({
          id: peer.id,
          name: peer.nom_projet ?? "Projet sans nom",
          name_en: getProjetNameEn(peer.id) ?? undefined,
          montant: Number(peer.montant ?? 0),
          arrondissement: Number(peer.arrondissement) || 0,
          typologie: pvv?.typologie_normalisee ?? null,
        });
      }
    }

    return {
      id: r.id,
      name: r.nom_projet ?? "Projet sans nom",
      name_en: getProjetNameEn(r.id) ?? undefined,
      arrondissement,
      chapitre: r.chapitre_libelle ?? "—",
      typeAp: r.type_ap ?? null,
      montant,
      year: y,
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      geoLabel: r.geo_label ?? null,
      sourcePdf: r.source_pdf ?? null,
      sourcePage: r.source_page ?? null,
      confidence: r.confidence ?? null,
      vulgarization,
      typologieRank,
      arrRank,
      similaires,
      photo: resolveProjetPhoto(r.id, r.nom_projet),
      marches: loadProjetMarches(r.id),
      marchesCoverage: loadProjetMarchesCoverage(),
    };
  }
  return null;
}

// ─── Bailleur (logement social) fiche ──────────────────────────────────────

export type BailleurGaranties = {
  year: number;
  name_raw: string;
  capital_restant: number;
  montant_initial: number;
  count_emprunts: number;
  share: number;
  taux_moyen_pondere_pct: number;
  duree_residuelle_moyenne_ans: number;
  part_fixe: number;
  nature_dominante: string;
  preteurs: HorsBilanPreteur[];
  emprunts_top: HorsBilanEmprunt[];
};

export type BailleurFiche = {
  slug: string;
  name: string;
  type?: string;
  color?: string;
  share?: number;
  description?: string;
  garanties?: BailleurGaranties;
};

/**
 * Normalise un nom de bailleur en slug stable qui absorbe les variations :
 * suffixes entre parenthèses, formes juridiques (OPH, SEM, ESH, SA HLM…),
 * casse, accents. Permet de faire matcher "Paris Habitat" (liste éditoriale
 * logement-social) avec "PARIS Habitat OPH (EPIC)" (données hors-bilan).
 */
// `slugifyBailleur` vit dans `@/lib/projet-utils` (client-safe).
import { slugifyBailleur } from "./projet-utils";
export { slugifyBailleur };

/**
 * Mappings manuels pour les bailleurs dont le slug auto-généré ne converge
 * pas entre les deux sources (typiquement les filiales type "3F Résidences"
 * vs "Immobilière 3F - I3F").
 */
const BAILLEUR_SLUG_ALIASES: Record<string, string> = {
  "immobiliere-3f-i3f": "3f-residences",
  "icf-habitat-la-sabliere": "icf-habitat",
};

function canonicalBailleurSlug(name: string): string {
  const base = slugifyBailleur(name);
  return BAILLEUR_SLUG_ALIASES[base] ?? base;
}

export function loadBailleur(slug: string): BailleurFiche | null {
  const target = canonicalBailleurSlug(decodeURIComponent(slug));

  // ─── Volet éditorial logement social ─────────────────────────────────
  // Cherche dans `bailleursAll` (vue complète : 5 grands bailleurs +
  // aménageurs + EPIC/fondations garanties) et non dans `bailleurs` (vue
  // restreinte aux cards de la page logement-social).
  const ls = loadLogementSocialData();
  const lsMatch = ls.bailleursAll.find(
    (b) => canonicalBailleurSlug(b.name) === target,
  );

  // ─── Volet garanties d'emprunt (dernier exercice disponible) ─────────
  let garanties: BailleurGaranties | undefined;
  try {
    const idx = readJson<{ latestYear: number }>("hors_bilan_index.json");
    const hb = readJson<HorsBilanData>(`hors_bilan_${idx.latestYear}.json`);
    const hbMatch = hb.top_beneficiaires.find(
      (b) => canonicalBailleurSlug(b.name) === target,
    );
    if (hbMatch) {
      garanties = {
        year: hb.year,
        name_raw: hbMatch.name,
        capital_restant: hbMatch.capital_restant,
        montant_initial: hbMatch.montant_initial,
        count_emprunts: hbMatch.count_emprunts,
        share: hbMatch.share,
        taux_moyen_pondere_pct: hbMatch.taux_moyen_pondere_pct,
        duree_residuelle_moyenne_ans: hbMatch.duree_residuelle_moyenne_ans,
        part_fixe: hbMatch.part_fixe,
        nature_dominante: hbMatch.nature_dominante,
        preteurs: hbMatch.preteurs,
        emprunts_top: hbMatch.emprunts_top,
      };
    }
  } catch {
    // Fichiers hors-bilan indisponibles — on ignore
  }

  if (!lsMatch && !garanties) return null;

  return {
    slug: target,
    name: lsMatch?.name ?? garanties?.name_raw ?? "",
    type: lsMatch?.type,
    color: lsMatch?.color,
    share: lsMatch?.share,
    description: lsMatch?.description,
    garanties,
  };
}

export function loadQuiRecoitData(requestedYear?: number, city: string = "paris"): QuiRecoitData {
  const idx = readJson<SubvIndex>(cityJsonPath(city, "subventions/index.json"));
  const preview = new Set(idx.previewYears ?? []);
  const consolidated = idx.availableYears.filter((y) => !preview.has(y));
  const defaultYear = consolidated[0] ?? idx.availableYears[0];
  const yr = requestedYear && idx.availableYears.includes(requestedYear)
    ? requestedYear
    : defaultYear;
  const prev = idx.availableYears.find((y) => y !== yr) ?? yr;
  const ben = readJson<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${yr}.json`));

  // Pre-load every available year once — used for the top-10 history and the
  // "movers" section (biggest gains/losses between current year and prev).
  const yearlyData = new Map<number, SubvBen>();
  for (const y of idx.availableYears) {
    try { yearlyData.set(y, readJson<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${y}.json`))); } catch {}
  }
  // Quick index: { benefName -> { year -> amount } }
  const benHistory = new Map<string, Map<number, number>>();
  for (const [y, file] of yearlyData.entries()) {
    for (const b of file.data) {
      if (!benHistory.has(b.beneficiaire)) benHistory.set(b.beneficiaire, new Map());
      benHistory.get(b.beneficiaire)!.set(y, b.montant_total);
    }
  }

  const ty = idx.totalsByYear[String(yr)];
  const tyPrev = idx.totalsByYear[String(prev)];
  const deltaMontantPct = tyPrev ? ((ty.montant_total - tyPrev.montant_total) / tyPrev.montant_total) * 100 : 0;
  const deltaNbPct = tyPrev ? ((ty.nb_subventions - tyPrev.nb_subventions) / tyPrev.nb_subventions) * 100 : 0;

  const sorted = ben.data.slice().sort((a, b) => b.montant_total - a.montant_total);
  const top10 = sorted.slice(0, 10).map((b, i) => {
    const histMap = benHistory.get(b.beneficiaire);
    const history = idx.availableYears
      .slice()
      .sort((a, b2) => a - b2)
      .map((y) => ({ year: y, amount: histMap?.get(y) ?? 0 }));
    const totalAmount = history.reduce((s, h) => s + h.amount, 0);
    const activeYears = history.filter((h) => h.amount > 0).map((h) => h.year);
    const lastActiveYear = activeYears.length > 0 ? Math.max(...activeYears) : yr;
    return {
      rank: i + 1,
      name: b.beneficiaire,
      theme: b.thematique ?? null,
      amount: b.montant_total,
      totalAmount,
      lastActiveYear,
      nb: b.nb_subventions,
      history,
    };
  });

  // By theme: sum up + keep top-5 benéficiaires par thème
  type ThemeAgg = { amount: number; count: number; items: { name: string; amount: number; nb: number }[] };
  const themeAgg = new Map<string, ThemeAgg>();
  for (const b of ben.data) {
    const t = b.thematique || "Autres";
    const cur = themeAgg.get(t) ?? { amount: 0, count: 0, items: [] };
    cur.amount += b.montant_total;
    cur.count += b.nb_subventions;
    cur.items.push({ name: b.beneficiaire, amount: b.montant_total, nb: b.nb_subventions });
    themeAgg.set(t, cur);
  }
  const byTheme = [...themeAgg.entries()]
    .map(([theme, v]) => ({
      theme,
      amount: v.amount,
      count: v.count,
      topBen: v.items.sort((a, b) => b.amount - a.amount).slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount);

  const previewSet = new Set(idx.previewYears ?? []);
  const yearsSummary = idx.availableYears
    .map((y) => ({
      year: y,
      total: idx.totalsByYear[String(y)]?.montant_total ?? 0,
      count: idx.totalsByYear[String(y)]?.nb_subventions ?? 0,
      preview: previewSet.has(y),
    }))
    .sort((a, b) => a.year - b.year);

  // Median subvention amount — rough proxy from the top 500 values
  const amounts = ben.data.map((b) => b.montant_total).sort((a, b) => a - b);
  const medianSubvention = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;

  // Concentration top 10 / total
  const top10Sum = top10.reduce((s, t) => s + t.amount, 0);
  const concentrationTop10Pct = ty.montant_total > 0 ? (top10Sum / ty.montant_total) * 100 : 0;

  // Movers — biggest gains / losses vs previous comparable year
  const prevFile = yearlyData.get(prev);
  const prevMap = new Map<string, number>();
  if (prevFile) for (const b of prevFile.data) prevMap.set(b.beneficiaire, b.montant_total);
  const MOVERS_MIN_CURRENT = 100_000;
  const MOVERS_MIN_PREV = 50_000;
  const moversAll = ben.data
    .map((b) => {
      const pv = prevMap.get(b.beneficiaire) ?? 0;
      const delta = pv > 0 ? ((b.montant_total - pv) / pv) * 100 : b.montant_total > 0 ? 999 : 0;
      return { name: b.beneficiaire, amount: b.montant_total, delta, prev: pv };
    })
    // Seuils anti-bruit : montant courant ≥ 100 k€ ET année précédente ≥ 50 k€
    .filter((m) => m.amount >= MOVERS_MIN_CURRENT && m.prev >= MOVERS_MIN_PREV);
  const hausses = moversAll.slice().sort((a, b) => b.delta - a.delta).slice(0, 5).map(({ name, amount, delta }) => ({ name, amount, delta }));
  const baisses = moversAll.slice().sort((a, b) => a.delta - b.delta).slice(0, 5).map(({ name, amount, delta }) => ({ name, amount, delta }));

  const availableThemes = byTheme.map((t) => t.theme);

  // Aides aux personnes physiques : montrées en agrégat uniquement (vie
  // privée — cf. /methode#personnes-physiques) ; les noms ne sont ni indexés
  // ni cherchables. Certains exercices (2020-2021) arrivent déjà agrégés en
  // une ligne dans la source → le nombre de bénéficiaires n'a de sens que
  // quand la source est nominative (count > 1).
  const ppRows = ben.data.filter((b) => b.nature_juridique === "Personnes physiques");
  const personnesPhysiques = {
    amount: ppRows.reduce((s, b) => s + b.montant_total, 0),
    count: ppRows.length > 1 ? ppRows.length : null,
  };

  // « Par exemple » — règles fixes : le plus gros bénéficiaire (toutes
  // natures — souvent un opérateur de la Ville, on affiche sa nature), la
  // plus grosse association, et la plus grosse association soutenue chaque
  // année de la fenêtre de données (thématique différente si possible).
  // Photos : curation réelle (beneficiaire_photos.json) → banque générique
  // par thématique, étiquetée « Photo d'illustration ».
  const exemples: QuiRecoitData["exemples"] = (() => {
    if (city !== "paris") return [];
    const agg = new Map<string, { name: string; amount: number; theme: string | null; nature: string | null }>();
    for (const b of ben.data) {
      if (b.nature_juridique === "Personnes physiques") continue;
      const cur = agg.get(b.beneficiaire) ?? { name: b.beneficiaire, amount: 0, theme: b.thematique ?? null, nature: b.nature_juridique ?? null };
      cur.amount += b.montant_total;
      agg.set(b.beneficiaire, cur);
    }
    const all = [...agg.values()].sort((a, b) => b.amount - a.amount);
    const assos = all.filter((x) => x.nature === "Associations");

    const curated = readJsonOrNull<{ items?: Record<string, { photo_url?: string; credit?: string }> }>(
      "enrichment/beneficiaire_photos.json",
    )?.items ?? {};
    const bank = readJsonOrNull<{ items?: Record<string, { url?: string; source_label?: string }> }>(
      "enrichment/generic_photo_bank.json",
    )?.items ?? {};
    const THEME_TYPO: Record<string, string> = {
      "Culture": "equipement-culturel",
      "Sport": "gymnase",
      "Éducation": "ecole",
      "Education": "ecole",
      "Logement": "logement-social",
      "Social - Petite enfance": "creche",
      "Environnement": "espace-vert",
    };
    // Une même image générique ne sert qu'une fois par section : deux cartes
    // avec la photo d'illustration identique côte à côte cassent la section —
    // mieux vaut une carte sans photo.
    const usedPhotoUrls = new Set<string>();
    const photoFor = (name: string, theme: string | null) => {
      const c = curated[name];
      if (c?.photo_url) {
        usedPhotoUrls.add(c.photo_url);
        return { url: c.photo_url, credit: c.credit ?? null, kind: "reelle" as const };
      }
      const g = bank[THEME_TYPO[theme ?? ""] ?? "administration"];
      if (g?.url && !usedPhotoUrls.has(g.url)) {
        usedPhotoUrls.add(g.url);
        return { url: g.url, credit: g.source_label ?? null, kind: "illustration" as const };
      }
      return { url: null, credit: null, kind: null };
    };
    const yearsWindow = idx.availableYears.slice().sort((a, b) => a - b);
    const presentEveryYear = (name: string) => {
      const h = benHistory.get(name);
      return h ? yearsWindow.every((y) => (h.get(y) ?? 0) > 0) : false;
    };

    const used = new Set<string>();
    const mk = (x: (typeof all)[number], kind: "gros" | "asso" | "fidele") => {
      used.add(x.name);
      const ph = photoFor(x.name, x.theme);
      return {
        kind,
        name: x.name,
        theme: x.theme,
        nature: x.nature,
        amount: x.amount,
        sinceYear: kind === "fidele" ? yearsWindow[0] : null,
        photoUrl: ph.url,
        photoCredit: ph.credit,
        photoKind: ph.kind,
      };
    };
    const out: QuiRecoitData["exemples"] = [];
    if (all[0]) out.push(mk(all[0], "gros"));
    const asso = assos.find((x) => !used.has(x.name));
    if (asso) out.push(mk(asso, "asso"));
    const fidCandidates = assos.filter((x) => !used.has(x.name) && presentEveryYear(x.name));
    const fidele = fidCandidates.find((x) => x.theme !== asso?.theme) ?? fidCandidates[0];
    if (fidele) out.push(mk(fidele, "fidele"));
    return out;
  })();

  return {
    year: yr,
    previousYear: prev,
    isPreview: previewSet.has(yr),
    total: ty.montant_total,
    nbSubventions: ty.nb_subventions,
    nbBeneficiaires: ben.nb_beneficiaires,
    medianSubvention,
    topThemeName: byTheme[0]?.theme ?? null,
    topThemeAmount: byTheme[0]?.amount ?? 0,
    concentrationTop10Pct,
    deltaMontantPct,
    deltaNbPct,
    top10,
    byTheme,
    yearsSummary,
    availableThemes,
    movers: {
      hausses,
      baisses,
      qualifiedCount: moversAll.length,
      thresholdCurrentEur: MOVERS_MIN_CURRENT,
      thresholdPrevEur: MOVERS_MIN_PREV,
    },
    personnesPhysiques,
    exemples,
  };
}

// ─── Marchés publics ───────────────────────────────────────────────────────

type MarcheRow = {
  fournisseur_nom?: string;
  objet?: string;
  montant_min?: number;
  montant_max?: number;
  categorie_libelle?: string;
  nature?: string;
  date_notification?: string;
  decp_offres_recues?: number | null;
  decp_procedure?: string | null;
};

type MarchesFile = {
  year: number;
  generated_at?: string;
  enveloppe_max_totale?: number;
  total_montant?: number;
  nb_marches?: number;
  data?: MarcheRow[];
  marches?: MarcheRow[];
};

export type MarchesPageData = {
  year: number;
  availableYears: number[];
  total: number;
  nb: number;
  nbTitulaires: number;
  multiAttributaires: { count: number; amount: number };
  top10: {
    rank: number;
    name: string;
    siret: string;
    amount: number;
    nbContrats: number;
    contrats: { numero: string; objet: string; objetClair: string | null; objetClairEn: string | null; montant: number; categorie: string; nature: string; date: string }[];
  }[];
  byCategory: {
    category: string;
    amount: number;
    count: number;
    topTitulaires: { name: string; siret: string; amount: number; nb: number }[];
  }[];
  byNature: { nature: string; amount: number; count: number }[];
  concurrence: {
    coverageCount: number;       // contrats avec offresRecues >= 1
    coverageTotal: number;       // contrats totaux cette année
    monoCount: number;           // contrats mono-candidat
    monoPct: number;             // % par count (des couverts)
    avgOffres: number;           // moyenne des offres reçues (sur les couverts)
    buckets: { bucket: "1" | "2-3" | "4-5" | "6+"; count: number; amount: number }[];
  };
  // NOTE: the full contract list is intentionally NOT part of the server
  // props anymore — it weighed ~700 kB of RSC payload for Paris. The client
  // lazy-fetches /data/<city>/marches-publics/marches_<year>.json and shapes
  // it with lib/marches-shape (same shaping as before, shared pure module).
  yearsSummary: { year: number; total: number; count: number }[];
  /** Scène signature : trois contrats réels de l'année, choisis par des
   *  règles fixes (jamais à la main) — le plus gros marché adossé à un
   *  chantier avec photo, le plus gros attribué sur offre unique, celui qui
   *  a reçu le plus d'offres. 0 à 3 entrées selon la donnée disponible. */
  signature: {
    kind: "chantier" | "mono" | "dispute";
    numero: string;
    label: string;
    labelEn: string | null;
    fournisseur: string;
    montant: number;
    offres: number | null;
    photoUrl: string | null;
    photoCredit: string | null;
    /** « reelle » = photo du chantier lié ou curation marche_photos.json ;
     *  « illustration » = banque générique par typologie, affichée avec la
     *  mention explicite (jamais une photo générique déguisée en vraie). */
    photoKind: "reelle" | "illustration" | null;
    projetNom: string | null;
    projetNomEn: string | null;
    dateNotification: string;
    dureeJours: number;
  }[];
};

type MarchesIndexRaw = {
  availableYears?: number[];
  totalsByYear?: Record<string, { nb_marches: number; enveloppe_max_totale: number }>;
};

export function loadMarchesIndex(city: string = "paris") {
  const raw = readJson<MarchesIndexRaw>(cityJsonPath(city, "marches-publics/index.json"));
  // Masquer l'année calendaire en cours (données DECP partielles jusqu'à clôture).
  const currentYear = new Date().getFullYear();
  return {
    ...raw,
    availableYears: (raw.availableYears ?? []).filter((y) => y < currentYear),
  };
}

// Fiche-level loaders — read a single contract or supplier across years.

export type ContratFiche = {
  numero: string;
  objet: string;
  nature: string;
  categorie: string;
  fournisseur: string;
  fournisseurSiret: string;
  multiAttributaire: boolean;
  montantMin: number;
  montantMax: number;
  dateNotification: string;
  dureeJours: number;
  perimetre: string;
  year: number;
  // Enrichissement DECP (tous optionnels — absents si marché non remonté à l'État
  // ou source Paris uniquement).
  decp?: {
    ccag?: string | null;
    cpvFamille?: string | null;
    procedure?: string | null;
    montantNotifie?: number | null;
    dureeMois?: number | null;
    offresRecues?: number | null;
    lieuExecution?: string | null;
    titulairesCount?: number | null;
    nbModifications?: number | null;
    sousTraitanceDeclaree?: boolean | null;
    hasConsiderationSociale?: boolean | null;
    hasConsiderationEnvironnementale?: boolean | null;
    ecartPlafondVsNotifie?: number | null;
    afficherDeuxMontants?: boolean;
    sourceOrigin?: "paris" | "decp";
  };
};

export type ContratRanking = {
  montant: number;
  rankYear: number;          // position parmi tous les contrats de l'année (1 = plus gros)
  totalYear: number;
  rankNature: number;        // position parmi les contrats de même nature, même année
  totalNature: number;
  medianNature: number;      // médiane des montants pour cette nature/année
  year: number;
  nature: string;
  /** Médiane des offres reçues chez les contrats de même procédure, même
   *  année — le repère qui dit si « 1 offre » est banal ou notable ici.
   *  `null` quand l'échantillon est vide : `offresRecues` n'est renseigné de
   *  façon systématique dans DECP qu'à partir du millésime 2024. */
  medianOffresProcedure: number | null;
  /** Taille de l'échantillon derrière la médiane — sert à ne pas afficher un
   *  repère calculé sur trois contrats. */
  totalOffresProcedure: number;
};

/**
 * Computes where a contract sits among its peers (year + nature). Used to
 * give citizens a quick sense of scale: "is this a big deal or routine?"
 */
export function loadContratRanking(numero: string, year: number, nature: string, montant: number): ContratRanking | null {
  try {
    const f = readJson<MarchesFile>(`marches-publics/marches_${year}.json`);
    const rows = (f.data ?? f.marches ?? []) as (MarcheRow & { numero_marche?: string })[];
    const amounts = rows
      .map((r) => Number(r.montant_max ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);
    const natureRows = rows
      .filter((r) => (r.nature ?? "") === nature)
      .map((r) => Number(r.montant_max ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a);
    const rankYear = amounts.findIndex((v) => v <= montant) + 1 || amounts.length + 1;
    const rankNature = natureRows.findIndex((v) => v <= montant) + 1 || natureRows.length + 1;
    const median = natureRows.length
      ? natureRows[Math.floor(natureRows.length / 2)]
      : 0;

    // Repère de concurrence : « 1 offre » ne se lit pas pareil selon la
    // procédure — c'est la norme sur un marché sans mise en concurrence, c'est
    // notable sur un appel d'offres ouvert. On compare donc le contrat à ses
    // pairs de même procédure plutôt qu'à l'ensemble de l'année.
    const self = rows.find((r) => r.numero_marche === numero);
    const procedure = self?.decp_procedure ?? null;
    const offresPairs = procedure
      ? rows
          .filter((r) => r.decp_procedure === procedure)
          .map((r) => Number(r.decp_offres_recues ?? 0))
          .filter((n) => n > 0)
          .sort((a, b) => a - b)
      : [];

    return {
      montant,
      rankYear,
      totalYear: amounts.length,
      rankNature,
      totalNature: natureRows.length,
      medianNature: median,
      year,
      nature,
      medianOffresProcedure: offresPairs.length
        ? offresPairs[Math.floor(offresPairs.length / 2)]
        : null,
      totalOffresProcedure: offresPairs.length,
    };
  } catch {
    return null;
  }
}

export function loadContrat(numero: string): ContratFiche | null {
  // Scan every year — the id is unique enough.
  const indexRaw = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (indexRaw.availableYears ?? []).slice().sort((a, b) => b - a);
  for (const y of years) {
    try {
      const f = readJson<MarchesFile>(`marches-publics/marches_${y}.json`);
      const rows = f.data ?? f.marches ?? [];
      const row = rows.find((m) => (m as MarcheRow & { numero_marche?: string }).numero_marche === numero);
      if (!row) continue;
      const r = row as MarcheRow & {
        numero_marche?: string;
        fournisseur_siret?: string;
        montant_min?: number;
        duree_jours?: number;
        perimetre_financier?: string;
        is_multiattributaire?: boolean;
        _source_origin?: "paris" | "decp";
        decp_ccag?: string | null;
        decp_cpv_famille?: string | null;
        decp_procedure?: string | null;
        decp_montant_notifie?: number | null;
        decp_duree_mois?: number | null;
        decp_offres_recues?: number | null;
        decp_lieu_execution_lisible?: string | null;
        decp_titulaires_count?: number | null;
        decp_nb_modifications?: number | null;
        decp_sous_traitance_declaree?: boolean | null;
        decp_has_consideration_sociale?: boolean | null;
        decp_has_consideration_environnementale?: boolean | null;
        ecart_plafond_vs_notifie?: number | null;
        afficher_deux_montants?: boolean;
      };
      const hasDecp = r.decp_ccag != null
        || r.decp_cpv_famille != null
        || r.decp_montant_notifie != null
        || r.decp_lieu_execution_lisible != null;
      // Certaines lignes decp-2025/2026 arrivent sans nom de titulaire mais
      // avec un SIRET — résolvable via le cache SIRENE local.
      let fournisseurNom = r.fournisseur_nom;
      if (!fournisseurNom && r.fournisseur_siret) {
        const siren9 = r.fournisseur_siret.replace(/\s/g, "").slice(0, 9);
        if (/^\d{9}$/.test(siren9)) fournisseurNom = loadSirene(siren9)?.nom;
      }
      return {
        numero: r.numero_marche ?? numero,
        objet: r.objet ?? "",
        nature: r.nature ?? "—",
        categorie: r.categorie_libelle ?? "—",
        fournisseur: fournisseurNom ?? "Non précisé",
        fournisseurSiret: r.fournisseur_siret ?? "",
        multiAttributaire: r.fournisseur_nom === "MARCHE MULTIATTRIBUTAIRE" || Boolean(r.is_multiattributaire),
        montantMin: Number(r.montant_min ?? 0),
        montantMax: Number(r.montant_max ?? 0),
        dateNotification: r.date_notification ?? "",
        dureeJours: Number(r.duree_jours ?? 0),
        perimetre: r.perimetre_financier ?? "—",
        year: y,
        decp: hasDecp ? {
          ccag: r.decp_ccag ?? null,
          cpvFamille: r.decp_cpv_famille ?? null,
          procedure: r.decp_procedure ?? null,
          montantNotifie: r.decp_montant_notifie ?? null,
          dureeMois: r.decp_duree_mois ?? null,
          offresRecues: r.decp_offres_recues ?? null,
          lieuExecution: r.decp_lieu_execution_lisible ?? null,
          titulairesCount: r.decp_titulaires_count ?? null,
          nbModifications: r.decp_nb_modifications ?? null,
          sousTraitanceDeclaree: r.decp_sous_traitance_declaree ?? null,
          hasConsiderationSociale: r.decp_has_consideration_sociale ?? null,
          hasConsiderationEnvironnementale: r.decp_has_consideration_environnementale ?? null,
          ecartPlafondVsNotifie: r.ecart_plafond_vs_notifie ?? null,
          afficherDeuxMontants: Boolean(r.afficher_deux_montants),
          sourceOrigin: r._source_origin,
        } : undefined,
      };
    } catch {}
  }
  return null;
}

export type FournisseurFiche = {
  nom: string;
  siret: string;
  siren: string;
  totalAmount: number;
  contratCount: number;
  yearsActive: number[];
  byYear: { year: number; amount: number; count: number }[];
  byCategory: { category: string; amount: number; count: number }[];
  /** `objet` est le libellé technique DECP brut ; `objetClair`/`objetClairEn`
   *  sont la version vulgarisée quand elle existe (couverture partielle). Les
   *  consommateurs suivent la même précédence qu'ailleurs :
   *  objetClair → normalizeObjet(objet) → objet. */
  contrats: { numero: string; objet: string; objetClair?: string; objetClairEn?: string; montant: number; year: number; date: string; categorie: string; nature: string }[];
  /** Détail de l'agrégation par SIREN : un même SIREN peut couvrir plusieurs
   *  établissements (SIRETs) qui apparaissent sous des libellés différents
   *  dans DECP. Les montants ci-dessus somment tous ces SIRETs. */
  siretBreakdown: { siret: string; nom: string; amount: number; count: number }[];
};

/**
 * Loads a supplier's full history across all available years. Works
 * either from SIREN (9-digit prefix of SIRET) or from the full SIRET.
 * Best-effort — SIRET data is partial for older years.
 */
export function loadFournisseur(key: string): FournisseurFiche | null {
  const indexRaw = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (indexRaw.availableYears ?? []).slice().sort((a, b) => a - b);
  const target = key.replace(/\s/g, "");
  const siren = target.slice(0, 9);

  const contrats: FournisseurFiche["contrats"] = [];
  const byYearMap = new Map<number, { amount: number; count: number }>();
  const byCatMap = new Map<string, { amount: number; count: number }>();
  // Agrégation par SIRET (établissement) sous le SIREN, pour pouvoir
  // afficher la décomposition quand plusieurs établissements sont fusionnés.
  const bySiretMap = new Map<string, { siret: string; nom: string; amount: number; count: number }>();
  let nom = "";
  let fullSiret = "";

  for (const y of years) {
    try {
      const f = readJson<MarchesFile>(`marches-publics/marches_${y}.json`);
      const rows = f.data ?? f.marches ?? [];
      for (const m of rows) {
        const r = m as MarcheRow & {
          numero_marche?: string;
          fournisseur_siret?: string;
        };
        const thisSiret = (r.fournisseur_siret ?? "").replace(/\s/g, "");
        const matchesBySiret = thisSiret === target || (thisSiret.length >= 9 && thisSiret.slice(0, 9) === siren);
        const matchesByName =
          !thisSiret && r.fournisseur_nom && r.fournisseur_nom.toLowerCase() === key.toLowerCase();
        if (!matchesBySiret && !matchesByName) continue;

        nom = nom || r.fournisseur_nom || "Non précisé";
        fullSiret = fullSiret || thisSiret;
        const v = Number(r.montant_max ?? r.montant_min ?? 0);
        const cat = r.categorie_libelle || r.nature || "Autres";

        // Même join que les pages liste (loadMarchesPageData) : sans lui, la
        // table de la fiche fournisseur affichait le libellé brut même pour
        // les contrats qui ont une version vulgarisée. `loadMarcheVulgarization`
        // mémoïse la map par ville, donc ce lookup par ligne ne coûte qu'une
        // seule lecture de fichier.
        const vulg = r.numero_marche ? loadMarcheVulgarization(r.numero_marche) : null;

        contrats.push({
          numero: r.numero_marche ?? "",
          objet: r.objet ?? "",
          objetClair: vulg?.objet_clair,
          objetClairEn: vulg?.objet_clair_en,
          montant: v,
          year: y,
          date: r.date_notification ?? "",
          categorie: cat,
          nature: r.nature || "Autres",
        });

        const yy = byYearMap.get(y) ?? { amount: 0, count: 0 };
        yy.amount += v;
        yy.count += 1;
        byYearMap.set(y, yy);

        const cc = byCatMap.get(cat) ?? { amount: 0, count: 0 };
        cc.amount += v;
        cc.count += 1;
        byCatMap.set(cat, cc);

        if (thisSiret) {
          const ss = bySiretMap.get(thisSiret) ?? {
            siret: thisSiret,
            nom: r.fournisseur_nom || "—",
            amount: 0,
            count: 0,
          };
          ss.amount += v;
          ss.count += 1;
          // Garder le nom le plus long (souvent le plus descriptif)
          if (r.fournisseur_nom && r.fournisseur_nom.length > ss.nom.length) ss.nom = r.fournisseur_nom;
          bySiretMap.set(thisSiret, ss);
        }
      }
    } catch {}
  }

  if (contrats.length === 0) return null;

  const totalAmount = contrats.reduce((s, c) => s + c.montant, 0);
  contrats.sort((a, b) => b.montant - a.montant);

  const byYear = [...byYearMap.entries()]
    .map(([year, v]) => ({ year, amount: v.amount, count: v.count }))
    .sort((a, b) => a.year - b.year);
  const byCategory = [...byCatMap.entries()]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const siretBreakdown = [...bySiretMap.values()].sort((a, b) => b.amount - a.amount);

  return {
    nom,
    siret: fullSiret,
    siren: fullSiret.slice(0, 9) || siren,
    totalAmount,
    contratCount: contrats.length,
    yearsActive: byYear.map((y) => y.year),
    byYear,
    byCategory,
    contrats,
    siretBreakdown,
  };
}

// ─── Classement des fournisseurs (cumul pluriannuel) ─────────────────────
//
// Rang par CUMUL de plafonds notifiés depuis la première année disponible —
// volontairement pas par montant annuel : les enveloppes pluriannuelles
// rendent les rangs annuels erratiques (un accord-cadre gagné = pic isolé).
// Mêmes règles d'agrégation que loadMarchesPageData : clé SIREN (ou nom
// normalisé à défaut), multi-attributaires exclus.

export type FournisseurRankPoint = { year: number; cumul: number; rank: number };

export type FournisseurRankRow = {
  /** SIREN 9 chiffres, ou null si inconnu (pas de fiche cliquable). */
  siren: string | null;
  name: string;
  /** Catégorie dominante (par € cumulés) — libellé Paris. */
  categorie: string;
  /** Groupe éditorial dérivé de la catégorie (clé i18n fx.mp.rank.cat.*). */
  catGroup: "proprete" | "btp" | "energie" | "mobilier" | "it" | "autres";
  totalAmount: number;
  nbContrats: number;
  firstYear: number;
  points: FournisseurRankPoint[];
};

export type FournisseursRankingData = {
  years: number[];
  rows: FournisseurRankRow[];
  totalAll: number;
  topSharePct: number;
  topN: number;
};

function catGroupOf(label: string): FournisseurRankRow["catGroup"] {
  const l = label.toLowerCase();
  if (/propret|d[ée]chet|collecte|nettoie|nettoyage/.test(l)) return "proprete";
  // Énergie avant BTP : « travaux d'installations électriques » = énergie.
  if (/[ée]nergie|[ée]lectric|[ée]clairage|chauffage|gaz|carburant|combustible/.test(l)) return "energie";
  if (/voirie|travaux|b[âa]timent|construction|g[ée]nie civil|am[ée]nagement|route/.test(l)) return "btp";
  if (/mobilier urbain|affichage|signal|communication ext/.test(l)) return "mobilier";
  if (/informatique|logiciel|num[ée]rique|t[ée]l[ée]com|maintenance/.test(l)) return "it";
  return "autres";
}

export function loadFournisseursRanking(city: string = "paris", topN = 12): FournisseursRankingData | null {
  let indexRaw: MarchesIndexRaw;
  try {
    indexRaw = readJson<MarchesIndexRaw>(cityJsonPath(city, "marches-publics/index.json"));
  } catch {
    return null;
  }
  const currentYear = new Date().getFullYear();
  const years = (indexRaw.availableYears ?? [])
    .filter((y) => y < currentYear)
    .slice()
    .sort((a, b) => a - b);
  if (years.length < 3) return null;

  const MULTI_NAME = "MARCHE MULTIATTRIBUTAIRE";
  type Agg = {
    siren: string | null;
    name: string;
    byYear: Map<number, number>;
    byCat: Map<string, number>;
    nbContrats: number;
  };
  const agg = new Map<string, Agg>();

  for (const y of years) {
    let file: MarchesFile;
    try {
      file = readJson<MarchesFile>(cityJsonPath(city, `marches-publics/marches_${y}.json`));
    } catch {
      continue;
    }
    for (const m of file.data ?? file.marches ?? []) {
      const r = m as MarcheRow & { fournisseur_siret?: string; is_multiattributaire?: boolean };
      const name = (r.fournisseur_nom ?? "").trim();
      if (!name || name === MULTI_NAME || Boolean(r.is_multiattributaire)) continue;
      const v = Number(r.montant_max ?? r.montant_min ?? 0);
      if (!Number.isFinite(v) || v <= 0) continue;
      const rawSiret = (r.fournisseur_siret ?? "").replace(/\s/g, "");
      const siren = /^\d{9}/.test(rawSiret) ? rawSiret.slice(0, 9) : null;
      const key = siren ?? `n:${name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()}`;
      let a = agg.get(key);
      if (!a) {
        a = { siren, name, byYear: new Map(), byCat: new Map(), nbContrats: 0 };
        agg.set(key, a);
      }
      if (name.length > a.name.length) a.name = name;
      a.byYear.set(y, (a.byYear.get(y) ?? 0) + v);
      const cat = (r.categorie_libelle ?? "Autres").trim() || "Autres";
      a.byCat.set(cat, (a.byCat.get(cat) ?? 0) + v);
      a.nbContrats += 1;
    }
  }
  if (agg.size === 0) return null;

  // Cumuls par année pour chaque fournisseur, puis rang annuel global.
  const keys = [...agg.keys()];
  const cumulByKey = new Map<string, Map<number, number>>();
  for (const k of keys) {
    const a = agg.get(k)!;
    let run = 0;
    const c = new Map<number, number>();
    for (const y of years) {
      run += a.byYear.get(y) ?? 0;
      c.set(y, run);
    }
    cumulByKey.set(k, c);
  }
  const rankByKeyYear = new Map<string, Map<number, number>>();
  for (const y of years) {
    const arr = keys
      .map((k) => ({ k, c: cumulByKey.get(k)!.get(y) ?? 0 }))
      .filter((e) => e.c > 0)
      .sort((x, z) => z.c - x.c);
    arr.forEach((e, i) => {
      if (!rankByKeyYear.has(e.k)) rankByKeyYear.set(e.k, new Map());
      rankByKeyYear.get(e.k)!.set(y, i + 1);
    });
  }

  const lastYear = years[years.length - 1];
  const finals = keys
    .map((k) => ({ k, total: cumulByKey.get(k)!.get(lastYear) ?? 0 }))
    .sort((x, z) => z.total - x.total);
  const totalAll = finals.reduce((s2, e) => s2 + e.total, 0);
  const top = finals.slice(0, topN);

  const rows: FournisseurRankRow[] = top.map(({ k, total }) => {
    const a = agg.get(k)!;
    let bestCat = "Autres";
    let bestAmt = -1;
    for (const [cat, amt] of a.byCat) {
      if (amt > bestAmt) {
        bestAmt = amt;
        bestCat = cat;
      }
    }
    const activeYears = years.filter((y) => (cumulByKey.get(k)!.get(y) ?? 0) > 0);
    return {
      siren: a.siren,
      name: a.name,
      categorie: bestCat,
      catGroup: catGroupOf(bestCat),
      totalAmount: total,
      nbContrats: a.nbContrats,
      firstYear: activeYears[0] ?? years[0],
      points: activeYears.map((y) => ({
        year: y,
        cumul: cumulByKey.get(k)!.get(y) ?? 0,
        rank: rankByKeyYear.get(k)?.get(y) ?? 9999,
      })),
    };
  });

  const topShare = totalAll > 0 ? (top.reduce((s2, e) => s2 + e.total, 0) / totalAll) * 100 : 0;
  return { years, rows, totalAll, topSharePct: topShare, topN };
}

export function loadMarchesPageData(requestedYear?: number, city: string = "paris"): MarchesPageData {
  const indexRaw = readJson<MarchesIndexRaw>(cityJsonPath(city, "marches-publics/index.json"));
  // Exclure l'année calendaire en cours : DECP est en remontée continue, un
  // "2026" consulté en avril n'a que quelques centaines de contrats notifiés
  // et son montant agrégé est non représentatif. On masque jusqu'à clôture.
  const currentYear = new Date().getFullYear();
  const years = (indexRaw.availableYears ?? [])
    .filter((y) => y < currentYear)
    .slice()
    .sort((a, b) => a - b);
  const yr = requestedYear && years.includes(requestedYear)
    ? requestedYear
    : years[years.length - 1] ?? 2024;
  const file = readJson<MarchesFile>(cityJsonPath(city, `marches-publics/marches_${yr}.json`));
  const marches = file.data ?? file.marches ?? [];

  const MULTI_NAME = "MARCHE MULTIATTRIBUTAIRE";
  // City-aware vulgarisation cache (Paris cache for /paris, Marseille cache
  // for /marseille, etc.). Falls back to Paris cache when nothing is found,
  // so cross-city titulaires like Veolia keep their enriched description.
  if (!_marchesVulgByCity[city]) {
    const data = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_marches.json"));
    const en = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>(cityJsonPath(city, "enrichment/vulgarization_marches_en.json"));
    const merged: Record<string, MarcheVulgarization> = {};
    for (const [k, v] of Object.entries(data?.items ?? {})) {
      const e = en?.items?.[k];
      merged[k] = e
        ? {
            ...v,
            objet_clair_en: e.objet_clair,
            quoi_concretement_en: e.quoi_concretement,
            pourquoi_ca_compte_en: e.pourquoi_ca_compte,
          }
        : v;
    }
    _marchesVulgByCity[city] = merged;
  }
  const vulgMap = _marchesVulgByCity[city];
  type TitAgg = {
    name: string;
    amount: number;
    count: number;
    siret: string;
    contrats: { numero: string; objet: string; objetClair: string | null; objetClairEn: string | null; montant: number; categorie: string; nature: string; date: string }[];
  };
  // Clé d'agrégation : SIREN (9 premiers chiffres du SIRET) si dispo, sinon
  // nom normalisé. Évite la fragmentation quand un même groupe (SIREN) a
  // plusieurs établissements (SIRETs) avec des libellés DECP variants
  // ("EIFFAGE ROUTE IDF" vs "EIFFAGE ROUTE IDF/CENTRE").
  const titAgg = new Map<string, TitAgg>();
  type CatAgg = { amount: number; count: number; items: Map<string, { amount: number; count: number }> };
  const catAgg = new Map<string, CatAgg>();
  const natureAgg = new Map<string, { amount: number; count: number }>();
  const multi = { count: 0, amount: 0 };
  const concurrenceBuckets = {
    "1": { count: 0, amount: 0 },
    "2-3": { count: 0, amount: 0 },
    "4-5": { count: 0, amount: 0 },
    "6+": { count: 0, amount: 0 },
  } as Record<"1" | "2-3" | "4-5" | "6+", { count: number; amount: number }>;
  let concurrenceCovered = 0;
  let concurrenceSumOffres = 0;
  let total = 0;
  for (const m of marches) {
    const r = m as MarcheRow & { numero_marche?: string; fournisseur_siret?: string; is_multiattributaire?: boolean };
    const v = Number(r.montant_max ?? r.montant_min ?? 0);
    total += v;
    const offres = Number(r.decp_offres_recues ?? 0);
    if (Number.isFinite(offres) && offres >= 1) {
      concurrenceCovered += 1;
      concurrenceSumOffres += offres;
      const bucket: "1" | "2-3" | "4-5" | "6+" =
        offres === 1 ? "1" : offres <= 3 ? "2-3" : offres <= 5 ? "4-5" : "6+";
      concurrenceBuckets[bucket].count += 1;
      concurrenceBuckets[bucket].amount += v;
    }
    const isMulti = r.fournisseur_nom === MULTI_NAME || Boolean(r.is_multiattributaire);
    if (isMulti) {
      multi.count += 1;
      multi.amount += v;
    }
    const rawSiret = (r.fournisseur_siret ?? "").replace(/\s/g, "");
    const validSiret = rawSiret && rawSiret !== "#" && !rawSiret.includes("|") && rawSiret.length >= 9
      ? rawSiret
      : "";
    const tName = r.fournisseur_nom || "Non précisé";
    const aggKey = validSiret ? validSiret.slice(0, 9) : `name:${tName.toLowerCase()}`;
    const tA = titAgg.get(aggKey) ?? { name: tName, amount: 0, count: 0, siret: validSiret, contrats: [] };
    tA.amount += v;
    tA.count += 1;
    if (!tA.siret && validSiret) tA.siret = validSiret;
    // Garder le nom le plus long (souvent le plus descriptif, ex.
    // "EIFFAGE ROUTE ILE DE FRANCE/CENTRE" plutôt que "EIFFAGE ROUTE IDF")
    if (tName.length > tA.name.length && tName !== "Non précisé") tA.name = tName;
    const numero = r.numero_marche ?? "";
    tA.contrats.push({
      numero,
      objet: r.objet || "",
      objetClair: (numero && vulgMap[numero]?.objet_clair) || null,
      objetClairEn: (numero && vulgMap[numero]?.objet_clair_en) || null,
      montant: v,
      categorie: r.categorie_libelle || "—",
      nature: r.nature || "—",
      date: r.date_notification || "",
    });
    titAgg.set(aggKey, tA);
    const c = r.categorie_libelle || r.nature || "Autres";
    const cA = catAgg.get(c) ?? { amount: 0, count: 0, items: new Map() };
    cA.amount += v;
    cA.count += 1;
    const titInCat = cA.items.get(aggKey) ?? { amount: 0, count: 0 };
    titInCat.amount += v;
    titInCat.count += 1;
    cA.items.set(aggKey, titInCat);
    catAgg.set(c, cA);
    const nature = (r.nature || "Autres").trim() || "Autres";
    const nA = natureAgg.get(nature) ?? { amount: 0, count: 0 };
    nA.amount += v;
    nA.count += 1;
    natureAgg.set(nature, nA);
  }

  // Exclude "MARCHE MULTIATTRIBUTAIRE" from the top 10 — it's a placeholder
  // name for contracts with multiple co-attributaires, not a real fournisseur.
  const top10 = [...titAgg.values()]
    .filter((v) => v.name !== MULTI_NAME)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((v, i) => ({
      rank: i + 1,
      name: v.name,
      siret: v.siret,
      amount: v.amount,
      nbContrats: v.count,
      contrats: v.contrats.slice().sort((a, b) => b.montant - a.montant).slice(0, 12),
    }));

  const byCategory = [...catAgg.entries()]
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      count: v.count,
      topTitulaires: [...v.items.entries()]
        .map(([key, x]) => {
          const t = titAgg.get(key);
          return { key, name: t?.name ?? key, siret: t?.siret ?? "", amount: x.amount, nb: x.count };
        })
        .filter((it) => it.name !== MULTI_NAME)
        .map(({ name, siret, amount, nb }) => ({ name, siret, amount, nb }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50);

  const byNature = [...natureAgg.entries()]
    .map(([nature, v]) => ({ nature, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const concurrence: MarchesPageData["concurrence"] = {
    coverageCount: concurrenceCovered,
    coverageTotal: marches.length,
    monoCount: concurrenceBuckets["1"].count,
    monoPct: concurrenceCovered > 0 ? (concurrenceBuckets["1"].count / concurrenceCovered) * 100 : 0,
    avgOffres: concurrenceCovered > 0 ? concurrenceSumOffres / concurrenceCovered : 0,
    buckets: (["1", "2-3", "4-5", "6+"] as const).map((bucket) => ({
      bucket,
      count: concurrenceBuckets[bucket].count,
      amount: concurrenceBuckets[bucket].amount,
    })),
  };

  const yearsSummary: MarchesPageData["yearsSummary"] = years.map((y) => {
    const t = indexRaw.totalsByYear?.[String(y)];
    return {
      year: y,
      total: t?.enveloppe_max_totale ?? 0,
      count: t?.nb_marches ?? 0,
    };
  });

  // Scène signature — règles fixes, aucun choix éditorial par contrat :
  //   « chantier »  : plus gros marché de l'année adossé à un projet
  //                   d'investissement AVEC photo (la matérialité) ;
  //   « mono »      : plus gros marché attribué sur offre unique ;
  //   « dispute »   : marché ayant reçu le plus d'offres (montant départage).
  // Un même contrat ne sert qu'une fois ; les cartes absentes (pas de photo,
  // pas de données offres pour le millésime) sont simplement omises.
  const signature: MarchesPageData["signature"] = (() => {
    type SigRow = { numero: string; objet: string; fournisseur: string; montant: number; offres: number | null; date: string; dureeJours: number; nature: string };
    const rows: SigRow[] = [];
    for (const m of marches) {
      const r = m as MarcheRow & { numero_marche?: string; is_multiattributaire?: boolean; duree_jours?: number };
      const numero = r.numero_marche ?? "";
      const multi = r.fournisseur_nom === MULTI_NAME || Boolean(r.is_multiattributaire);
      const montant = Number(r.montant_max ?? 0);
      if (!numero || multi || !(montant > 0)) continue;
      rows.push({
        numero,
        objet: r.objet ?? "",
        fournisseur: r.fournisseur_nom || "Non précisé",
        montant,
        offres: r.decp_offres_recues != null ? Number(r.decp_offres_recues) : null,
        date: r.date_notification ?? "",
        dureeJours: Number(r.duree_jours ?? 0),
        nature: r.nature ?? "",
      });
    }
    const byMontant = [...rows].sort((a, b) => b.montant - a.montant);
    const used = new Set<string>();

    // Chaîne photo : (1) photo réelle du chantier lié, (2) photo réelle
    // curée pour CE contrat (enrichment/marche_photos.json, rempli
    // in-session), (3) banque générique par typologie — affichée avec la
    // mention « photo d'illustration », jamais déguisée en vraie.
    const marchePhotos = readJsonOrNull<{ items?: Record<string, { photo_url?: string; credit?: string; }> }>(
      "enrichment/marche_photos.json",
    )?.items ?? {};
    const genericBank = readJsonOrNull<{ items?: Record<string, { url?: string; source_label?: string }> }>(
      "enrichment/generic_photo_bank.json",
    )?.items ?? {};

    const mkCard = (r: SigRow, kind: "chantier" | "mono" | "dispute") => {
      const pj = loadContratProjet(r.numero);
      const vg = vulgMap[r.numero];
      used.add(r.numero);
      const label = vg?.objet_clair || normalizeObjet(r.objet);
      let photoUrl = pj?.photoUrl ?? null;
      let photoCredit = pj?.photoCredit ?? null;
      let photoKind: "reelle" | "illustration" | null = photoUrl ? "reelle" : null;
      if (!photoUrl && marchePhotos[r.numero]?.photo_url) {
        photoUrl = marchePhotos[r.numero].photo_url ?? null;
        photoCredit = marchePhotos[r.numero].credit ?? null;
        photoKind = "reelle";
      }
      if (!photoUrl) {
        const typo = guessTypologieFromName(label)
          ?? (/service|prestation/i.test(r.nature) ? "administration" : "autre");
        const g = genericBank[typo];
        if (g?.url) {
          photoUrl = g.url;
          photoCredit = g.source_label ?? null;
          photoKind = "illustration";
        }
      }
      return {
        kind,
        numero: r.numero,
        label,
        labelEn: vg?.objet_clair_en ?? null,
        fournisseur: r.fournisseur,
        montant: r.montant,
        offres: r.offres,
        photoUrl,
        photoCredit,
        photoKind,
        projetNom: pj?.nom ?? null,
        projetNomEn: pj?.nomEn ?? null,
        dateNotification: r.date,
        dureeJours: r.dureeJours,
      };
    };
    const out: MarchesPageData["signature"] = [];
    const chantier = byMontant.find((r) => loadContratProjet(r.numero)?.photoUrl);
    if (chantier) out.push(mkCard(chantier, "chantier"));
    const mono = byMontant.find((r) => r.offres === 1 && !used.has(r.numero));
    if (mono) out.push(mkCard(mono, "mono"));
    const dispute = rows
      .filter((r) => r.offres != null && !used.has(r.numero))
      .sort((a, b) => (b.offres! - a.offres!) || (b.montant - a.montant))[0];
    if (dispute && dispute.offres != null && dispute.offres > 1) out.push(mkCard(dispute, "dispute"));
    return out;
  })();

  return {
    year: yr as number,
    availableYears: years,
    total: file.enveloppe_max_totale ?? file.total_montant ?? total,
    nb: file.nb_marches ?? marches.length,
    nbTitulaires: titAgg.size,
    multiAttributaires: multi,
    top10,
    byCategory,
    byNature,
    concurrence,
    yearsSummary,
    signature,
  };
}

// ─── Investissements ───────────────────────────────────────────────────────

type InvTrends = {
  years: Array<{
    year: number;
    depenses_total: number;
    recettes_total: number;
    depenses_hors_dette: number;
    par_chapitre: Array<{ label: string; depenses: number; recettes: number }>;
  }>;
};

type InvComplet = {
  year: number;
  stats?: { total?: number; count?: number; geolocalises?: number };
  data: Array<{
    id: string;
    annee: number;
    arrondissement: number;
    chapitre_libelle?: string;
    nom_projet: string;
    montant: number;
    type_ap?: string;
    lat?: number;
    lon?: number;
  }>;
};

export type InvestissementsData = {
  year: number;
  availableYears: number[];
  total: number;
  totalHorsDette: number;
  nbProjets: number;
  nbGeo: number;
  pctGeo: number;
  byChapitre: { label: string; amount: number; count: number }[];
  /** % du montant total capté par les 10 plus gros projets (pour la bannière Pareto). */
  top10ProjetsPct: number;
  byArrondissement: { arr: number; amount: number; count: number }[];
  topProjets: { id: string; name: string; name_en?: string; arr: number; chapitre: string; amount: number; photo: ProjetPhotoResolved }[];
  /** « Par exemple » : trois projets réels de l'année, règles fixes, photo
   *  dédiée exigée (un exemple sans bonne image ne vend rien) — le plus
   *  gros, celui au plus de marchés publics liés, le plus gros équipement
   *  du quotidien (école, crèche, piscine, bibliothèque, gymnase). */
  exemples: {
    kind: "gros" | "chantier" | "quotidien";
    id: string;
    name: string;
    nameEn: string | null;
    arr: number;
    amount: number;
    nbMarches: number;
    photoUrl: string;
    photoCredit: string | null;
  }[];
  geoPoints: {
    id: string;
    lat: number;
    lon: number;
    name: string;
    name_en?: string;
    amount: number;
    chapitre: string;
    arr: number;
    typo: import("./projet-utils").TypoBucket;
    isJO: boolean;
  }[];
  yearsSummary: { year: number; total: number; horsDette: number }[];
};

/**
 * Un projet a un "vrai" nom quand `nom_projet` existe et n'est pas un placeholder.
 * Avant 2022, le dump BigQuery n'avait pas de libellé — toutes les lignes sont
 * anonymes et inutilisables pour l'UX (top projets, photos, drawers).
 */
function hasUsableName(p: { nom_projet?: string }): boolean {
  const n = (p.nom_projet ?? "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  return !["projet non nomme", "projet non nommé", "non nomme", "non nommé"].includes(lower);
}

/** Years avec au moins quelques projets nommés — les autres on les retire de la sélection. */
function computeUsableYears(allYears: number[]): number[] {
  const out: number[] = [];
  for (const y of allYears) {
    try {
      const raw = readJson<InvComplet>(`map/investissements_complet_${y}.json`);
      const named = (raw.data ?? []).filter(hasUsableName).length;
      if (named >= 20) out.push(y);
    } catch {}
  }
  return out;
}

let _usableYears: number[] | null = null;

// ─── Marseille loader (investissements POC) ────────────────────────────────
//
// Marseille exposes investissements in a denormalized format (already
// aggregated byChapitre / byArrondissement, no geo lat/lon, no typologies)
// because the source is a CA narrative PDF parsed by regex — not a row-level
// CSV like Paris. The shape mimics InvestissementsData so the page can reuse
// the Paris client component, with degraded sections (P3.2 option a):
//   - geoPoints = [] → no map
//   - topProjets without photo (uses the generic fallback)
//   - byArrondissement → fed into a Marseille-aware ranking; the Paris SVG
//     choropleth is hardcoded for Paris districts so the page switches to
//     "liste" view by default for Marseille.
type MarseilleInvFile = {
  year: number;
  source: string;
  source_url: string;
  stats: { nb_projets: number; nb_geo: number; pct_geo: number; total_montant: number; nb_thematiques: number };
  byChapitre: Array<{ label: string; label_en?: string; amount: number; count: number }>;
  byArrondissement: Array<{ arr: number; amount: number; count: number }>;
  data: Array<{
    id: string;
    annee: number;
    arrondissement: number;
    thematique: string;
    thematique_en?: string;
    nom_projet: string;
    montant: number;
    source: string;
  }>;
};

type MarseilleInvIndex = {
  city: string;
  city_label: string;
  availableYears: number[];
  latestYear: number;
  totalsByYear: Record<string, { nb_projets: number; total_montant: number; nb_thematiques: number }>;
  source: string;
  note: string;
};

type MarseilleInvTrends = {
  years: Array<{
    year: number;
    depenses_total: number;
    depenses_hors_dette: number;
    par_chapitre: Array<{ label: string; depenses: number; recettes: number }>;
  }>;
};

function loadInvestissementsDataMarseille(requestedYear?: number): InvestissementsData {
  const index = readJson<MarseilleInvIndex>(cityJsonPath("marseille", "investissements/index.json"));
  const trends = readJsonOrNull<MarseilleInvTrends>(
    cityJsonPath("marseille", "investissements/investissement_tendances.json"),
  );
  const availableYears = (index.availableYears ?? []).slice().sort((a, b) => a - b);
  const year =
    requestedYear != null && availableYears.includes(requestedYear)
      ? requestedYear
      : index.latestYear ?? availableYears[availableYears.length - 1];
  const file = readJson<MarseilleInvFile>(
    cityJsonPath("marseille", `investissements/investissements_${year}.json`),
  );
  // Filter out narrative fragments (non-project text leaked from prosaic PDF
  // parsing) — see is_project flag added by geocode_marseille_invest.py.
  // Backwards-compatible: rows without the flag are kept as-is.
  const allRows = file.data ?? [];
  const projects = allRows.filter((p) => (p as { is_project?: boolean }).is_project !== false);
  const total = projects.reduce((s, p) => s + (p.montant ?? 0), 0);
  const nbGeo = projects.filter((p) => (p as { lat?: number | null }).lat != null).length;

  // Photos cache (4/10 réelles, 6 fallback "ecole" générique).
  type PhotoEntry = { photo_url: string | null; credit: string | null; license: string | null; source: string | null; generic: string | null };
  const photosCache = readJsonOrNull<{ items: Record<string, PhotoEntry> }>(
    cityJsonPath("marseille", "enrichment/projets_photos.json"),
  );
  const photosMap = photosCache?.items ?? {};

  function photoFor(projectId: string): ProjetPhotoResolved {
    const entry = photosMap[projectId];
    if (!entry) return { photo: null, generic: null, typologie: null };
    if (entry.photo_url) {
      return {
        photo: { url: entry.photo_url, credit: entry.credit ?? null, license: entry.license ?? null, source: entry.source ?? null } as unknown as ProjetPhotoResolved["photo"],
        generic: null,
        typologie: null,
      };
    }
    return { photo: null, generic: (entry.generic ?? null) as ProjetPhotoResolved["generic"], typologie: null };
  }

  const topProjets = projects
    .slice()
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 24)
    .map((p) => ({
      id: p.id,
      name: p.nom_projet,
      arr: p.arrondissement,
      chapitre: p.thematique,
      amount: p.montant,
      photo: photoFor(p.id),
    }));

  // Recompute byArrondissement on the filtered set so the ranking only
  // shows real localised projects (not narrative fragments at arr=0).
  const arrAgg = new Map<number, { amount: number; count: number }>();
  for (const p of projects) {
    if (!p.arrondissement || p.arrondissement === 0) continue;
    const cur = arrAgg.get(p.arrondissement) ?? { amount: 0, count: 0 };
    cur.amount += p.montant ?? 0;
    cur.count += 1;
    arrAgg.set(p.arrondissement, cur);
  }
  const byArrondissementFiltered = [...arrAgg.entries()]
    .map(([arr, v]) => ({ arr, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // geoPoints: list of project markers with lat/lon (from BAN geocoding when
  // available, fallback to arrondissement centre). Useful for any future map.
  // typo/isJO defaulted (Marseille has no project typology nor JO marker).
  const geoPoints: InvestissementsData["geoPoints"] = projects
    .filter((p) => {
      const r = p as unknown as { lat?: number | null; lon?: number | null };
      return r.lat != null && r.lon != null;
    })
    .map((p) => {
      const r = p as unknown as { lat: number; lon: number };
      return {
        id: p.id,
        name: p.nom_projet,
        arr: p.arrondissement,
        chapitre: p.thematique,
        amount: p.montant,
        lat: r.lat,
        lon: r.lon,
        typo: "autre" as import("./projet-utils").TypoBucket,
        isJO: false,
      };
    });

  const sortedByAmount = projects.slice().sort((a, b) => b.montant - a.montant);
  const top10Sum = sortedByAmount.slice(0, 10).reduce((s, p) => s + (p.montant ?? 0), 0);
  const top10ProjetsPct = total > 0 ? (top10Sum / total) * 100 : 0;

  const yearsSummary = (
    trends?.years ?? [
      { year, depenses_total: total, depenses_hors_dette: total, par_chapitre: [] },
    ]
  )
    .map((y) => ({ year: y.year, total: y.depenses_total, horsDette: y.depenses_hors_dette }))
    .sort((a, b) => a.year - b.year);

  return {
    year,
    availableYears,
    total,
    totalHorsDette: total,
    nbProjets: projects.length,
    nbGeo,
    pctGeo: file.stats?.pct_geo ?? 0,
    byChapitre: (file.byChapitre ?? []).map((c) => ({
      label: c.label,
      amount: c.amount,
      count: c.count,
    })),
    top10ProjetsPct,
    byArrondissement: byArrondissementFiltered,
    topProjets,
    // Pas d'exemples pour Marseille : ni banque photo ni rapprochement
    // projet↔marchés dans le POC — la section ne s'affiche pas.
    exemples: [],
    geoPoints,
    yearsSummary,
  };
}

export function loadInvestissementsData(
  requestedYear?: number,
  city: string = "paris",
): InvestissementsData {
  if (city === "marseille") return loadInvestissementsDataMarseille(requestedYear);
  const trends = readJson<InvTrends>("investissement_tendances.json");
  const allYears = trends.years.map((y) => y.year).sort((a, b) => a - b);

  if (_usableYears === null) _usableYears = computeUsableYears(allYears);
  const usableYears = _usableYears;
  const defaultYear = usableYears[usableYears.length - 1] ?? allYears[allYears.length - 1];

  // Si l'année demandée n'a pas de données exploitables, on rabat vers la plus récente valide.
  const effectiveYear = requestedYear != null && usableYears.includes(requestedYear)
    ? requestedYear
    : defaultYear;
  const pick = trends.years.find((y) => y.year === effectiveYear) ?? trends.years[trends.years.length - 1];
  const latest = pick;
  const year = latest.year;

  let complet: InvComplet | null = null;
  try {
    complet = readJson<InvComplet>(`map/investissements_complet_${year}.json`);
  } catch {}
  const projets = complet?.data ?? [];

  const arrAgg = new Map<number, { amount: number; count: number }>();
  for (const p of projets) {
    const a = Number(p.arrondissement) || 0;
    const cur = arrAgg.get(a) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.montant ?? 0);
    cur.count += 1;
    arrAgg.set(a, cur);
  }
  const byArrondissement = [...arrAgg.entries()]
    .map(([arr, v]) => ({ arr, amount: v.amount, count: v.count }))
    .filter((x) => x.arr > 0)
    .sort((a, b) => b.amount - a.amount);

  const topProjets = projets
    .filter(hasUsableName)
    .slice()
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 24)
    .map((p) => ({
      id: p.id,
      name: p.nom_projet as string,
      name_en: getProjetNameEn(p.id) ?? undefined,
      arr: p.arrondissement,
      chapitre: p.chapitre_libelle ?? "—",
      amount: p.montant,
      photo: resolveProjetPhoto(p.id, p.nom_projet),
    }));

  // « Par exemple » — règles fixes, photo dédiée EXIGÉE (feedback user :
  // un pick sans bonne image dessert la section ; les gros projets et
  // équipements en ont presque toujours une).
  const exemples: InvestissementsData["exemples"] = (() => {
    const candidats = projets
      .filter(hasUsableName)
      .slice()
      .sort((a, b) => (b.montant ?? 0) - (a.montant ?? 0))
      .map((p) => {
        const photo = resolveProjetPhoto(p.id, p.nom_projet);
        return {
          p,
          photoUrl: photo.photo?.photo_url ?? null,
          photoCredit: photo.photo?.credit ?? null,
          typologie: photo.typologie ?? guessTypologieFromName(p.nom_projet),
        };
      })
      .filter((c) => c.photoUrl);
    const used = new Set<string>();
    const mk = (c: (typeof candidats)[number], kind: "gros" | "chantier" | "quotidien") => {
      used.add(c.p.id);
      return {
        kind,
        id: c.p.id,
        name: c.p.nom_projet as string,
        nameEn: getProjetNameEn(c.p.id),
        arr: Number(c.p.arrondissement) || 0,
        amount: Number(c.p.montant ?? 0),
        nbMarches: loadProjetMarches(c.p.id).length,
        photoUrl: c.photoUrl as string,
        photoCredit: c.photoCredit,
      };
    };
    const out: InvestissementsData["exemples"] = [];
    // Diversité territoriale : à règle égale, on préfère un exemple dans un
    // arrondissement pas encore montré (2024 : les trois plus gros sont tous
    // Porte de la Chapelle — trois cartes du même lieu ne montrent rien).
    const usedArr = new Set<number>();
    const pick = <T extends (typeof candidats)[number]>(list: T[]): T | undefined =>
      list.find((c) => !usedArr.has(Number(c.p.arrondissement) || 0)) ?? list[0];

    if (candidats[0]) {
      out.push(mk(candidats[0], "gros"));
      usedArr.add(Number(candidats[0].p.arrondissement) || 0);
    }
    const chantiers = candidats
      .filter((c) => !used.has(c.p.id))
      .map((c) => ({ c, n: loadProjetMarches(c.p.id).length }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n || (b.c.p.montant ?? 0) - (a.c.p.montant ?? 0));
    const chantier = pick(chantiers.map((x) => x.c));
    if (chantier) {
      out.push(mk(chantier, "chantier"));
      usedArr.add(Number(chantier.p.arrondissement) || 0);
    }
    const QUOTIDIEN = new Set(["ecole", "creche", "piscine", "bibliotheque", "gymnase", "college", "lycee"]);
    const quotidien = pick(candidats.filter((c) => !used.has(c.p.id) && c.typologie && QUOTIDIEN.has(c.typologie)));
    if (quotidien) out.push(mk(quotidien, "quotidien"));
    return out;
  })();

  const nbGeo = projets.filter((p) => p.lat != null && p.lon != null).length;

  const geoPoints = projets
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => {
      const vulg = loadProjetVulgarization(p.id);
      return {
        id: p.id,
        lat: p.lat as number,
        lon: p.lon as number,
        name: p.nom_projet ?? "Projet",
        name_en: getProjetNameEn(p.id) ?? undefined,
        amount: Number(p.montant ?? 0),
        chapitre: p.chapitre_libelle ?? "",
        arr: Number(p.arrondissement) || 0,
        typo: resolveTypoBucket(vulg?.typologie_normalisee, p.nom_projet),
        isJO: detectJO(p.nom_projet),
      };
    });

  // Axe M57 (classification fonctionnelle du budget) : couvre 100 % des
  // dépenses d'investissement. On mappe les libellés "service" du dump
  // projets vers les chapitres M57 via `serviceToM57` pour que la somme
  // des counts corresponde aux projets documentés par chapitre M57.
  const m57Agg = new Map<string, { amount: number; count: number }>();
  for (const c of latest.par_chapitre) {
    m57Agg.set(c.label, { amount: c.depenses, count: 0 });
  }
  for (const p of projets) {
    const m57 = serviceToM57(p.chapitre_libelle) ?? "Autres";
    const cur = m57Agg.get(m57);
    if (cur) cur.count += 1;
  }

  // Pareto : top 10 projets en montant vs total
  const sortedByAmount = projets.slice().sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0));
  const top10Sum = sortedByAmount.slice(0, 10).reduce((s, p) => s + Number(p.montant ?? 0), 0);
  const top10ProjetsPct = latest.depenses_total > 0 ? (top10Sum / latest.depenses_total) * 100 : 0;

  return {
    year,
    availableYears: usableYears,
    total: latest.depenses_total,
    totalHorsDette: latest.depenses_hors_dette,
    nbProjets: projets.length,
    nbGeo,
    pctGeo: projets.length > 0 ? (nbGeo / projets.length) * 100 : 0,
    byChapitre: [...m57Agg.entries()]
      .map(([label, v]) => ({ label, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount),
    top10ProjetsPct,
    byArrondissement,
    topProjets,
    exemples,
    geoPoints,
    // yearsSummary garde toutes les années pour la timeline (même sans noms,
    // on connaît le MONTANT total voté depuis investissement_tendances.json).
    yearsSummary: trends.years.map((y) => ({
      year: y.year,
      total: y.depenses_total,
      horsDette: y.depenses_hors_dette,
    })),
  };
}

// ─── Arrondissement fiche (investissements) ──────────────────────────────

export type ArrondissementFiche = {
  arr: number;
  year: number;
  total: number;
  nbProjets: number;
  nbGeo: number;
  rank: number;          // rang parmi les 20 arr par montant total
  totalShare: number;    // % du total Paris géolocalisé
  byChapitre: { label: string; amount: number; count: number }[];
  topProjets: {
    id: string;
    name: string;
    amount: number;
    chapitre: string;
    photo: ProjetPhotoResolved;
  }[];
};

export function loadArrondissement(arrNum: number, year?: number): ArrondissementFiche | null {
  const trends = readJson<InvTrends>("investissement_tendances.json");
  const pick = year != null
    ? trends.years.find((y) => y.year === year) ?? trends.years[trends.years.length - 1]
    : trends.years[trends.years.length - 1];
  const targetYear = pick.year;

  let complet: InvComplet | null = null;
  try {
    complet = readJson<InvComplet>(`map/investissements_complet_${targetYear}.json`);
  } catch {
    return null;
  }
  const projets = complet?.data ?? [];
  const inArr = projets.filter((p) => Number(p.arrondissement) === arrNum);
  if (inArr.length === 0) return null;

  const total = inArr.reduce((s, p) => s + Number(p.montant ?? 0), 0);
  const nbGeo = inArr.filter((p) => p.lat != null && p.lon != null).length;

  // Rang dans l'exercice — par total montant
  const arrTotals = new Map<number, number>();
  for (const p of projets) {
    const a = Number(p.arrondissement) || 0;
    if (a === 0) continue;
    arrTotals.set(a, (arrTotals.get(a) ?? 0) + Number(p.montant ?? 0));
  }
  const ranking = [...arrTotals.entries()].sort((a, b) => b[1] - a[1]);
  const rank = ranking.findIndex(([a]) => a === arrNum) + 1;

  const geolocalizedTotal = [...arrTotals.values()].reduce((s, v) => s + v, 0);
  const totalShare = geolocalizedTotal > 0 ? (total / geolocalizedTotal) * 100 : 0;

  const chapAgg = new Map<string, { amount: number; count: number }>();
  for (const p of inArr) {
    const key = p.chapitre_libelle ?? "—";
    const cur = chapAgg.get(key) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.montant ?? 0);
    cur.count += 1;
    chapAgg.set(key, cur);
  }
  const byChapitre = [...chapAgg.entries()]
    .map(([label, v]) => ({ label, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const topProjets = inArr
    .filter(hasUsableName)
    .slice()
    .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.nom_projet as string,
      amount: Number(p.montant ?? 0),
      chapitre: p.chapitre_libelle ?? "—",
      photo: resolveProjetPhoto(p.id, p.nom_projet),
    }));

  return {
    arr: arrNum,
    year: targetYear,
    total,
    nbProjets: inArr.length,
    nbGeo,
    rank,
    totalShare,
    byChapitre,
    topProjets,
  };
}

// ─── Chapitre fiche (investissements) ────────────────────────────────────

export type ChapitreFiche = {
  slug: string;
  label: string;
  year: number;
  total: number;
  nbProjets: number;
  share: number;
  rank: number;
  nbChapitres: number;
  /** Couverture du dump projet vs total chapitre M57. `pct` ∈ [0, 100].
   *  La source A (M57) est exhaustive ; la source B (PDF Investissements
   *  localisés) ne couvre que les chantiers géolocalisables. */
  coverage: {
    amount: number;
    pct: number;
    sourceLabel: string;
  };
  topArrondissements: { arr: number; amount: number; count: number }[];
  topProjets: {
    id: string;
    name: string;
    amount: number;
    arr: number;
    photo: ProjetPhotoResolved;
  }[];
};

// `slugifyChapitre` vit dans `@/lib/projet-utils` (client-safe).
import { slugifyChapitre, serviceToM57, resolveTypoBucket, detectJO } from "./projet-utils";
export { slugifyChapitre };

export function loadChapitre(slug: string, year?: number): ChapitreFiche | null {
  const trends = readJson<InvTrends>("investissement_tendances.json");
  const pick = year != null
    ? trends.years.find((y) => y.year === year) ?? trends.years[trends.years.length - 1]
    : trends.years[trends.years.length - 1];
  const targetYear = pick.year;

  // Source de vérité : classification M57 du budget (par_chapitre).
  const ranking = [...pick.par_chapitre]
    .map((c) => ({ label: c.label, amount: c.depenses }))
    .sort((a, b) => b.amount - a.amount);
  const match = ranking.find((c) => slugifyChapitre(c.label) === slug);
  if (!match) return null;
  const label = match.label;
  const rank = ranking.findIndex((c) => c.label === label) + 1;

  let complet: InvComplet | null = null;
  try {
    complet = readJson<InvComplet>(`map/investissements_complet_${targetYear}.json`);
  } catch {
    // Fiche reste affichable avec total + rang ; listes vides.
  }
  const projets = complet?.data ?? [];
  const inChap = projets.filter((p) => serviceToM57(p.chapitre_libelle) === label);
  const agg = { amount: match.amount, count: inChap.length };
  const coveredAmount = inChap.reduce((s, p) => s + Number(p.montant ?? 0), 0);
  const coveragePct = match.amount > 0 ? (coveredAmount / match.amount) * 100 : 0;

  const arrAgg = new Map<number, { amount: number; count: number }>();
  for (const p of inChap) {
    const a = Number(p.arrondissement) || 0;
    if (a === 0) continue;
    const cur = arrAgg.get(a) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.montant ?? 0);
    cur.count += 1;
    arrAgg.set(a, cur);
  }
  const topArrondissements = [...arrAgg.entries()]
    .map(([arr, v]) => ({ arr, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const topProjets = inChap
    .filter(hasUsableName)
    .slice()
    .sort((a, b) => Number(b.montant ?? 0) - Number(a.montant ?? 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.nom_projet as string,
      amount: Number(p.montant ?? 0),
      arr: Number(p.arrondissement) || 0,
      photo: resolveProjetPhoto(p.id, p.nom_projet),
    }));

  return {
    slug,
    label,
    year: targetYear,
    total: agg.amount,
    nbProjets: agg.count,
    share: pick.depenses_total > 0 ? (agg.amount / pick.depenses_total) * 100 : 0,
    rank,
    nbChapitres: ranking.length,
    coverage: {
      amount: coveredAmount,
      pct: coveragePct,
      sourceLabel: `PDF Investissements localisés ${targetYear}`,
    },
    topArrondissements,
    topProjets,
  };
}

// ─── Patrimoine / Bilan ────────────────────────────────────────────────────

type BilanIndex = {
  availableYears: number[];
  latestYear: number;
  totalsByYear: Record<string, { actif_net: number; passif_net: number }>;
};

type BilanSankey = {
  year: number;
  totals: {
    actif_net: number;
    passif_net: number;
    fonds_propres: number;
    dette_totale: number;
    dettes_financieres: number;
    dettes_non_financieres: number;
    provisions: number;
  };
  links: Array<{ source: string; target: string; value: number }>;
};

export type PatrimoineData = {
  year: number;
  availableYears: number[];
  actif: number;
  passif: number;
  fondsPropres: number;
  detteTotale: number;
  detteFinanciere: number;
  detteNonFinanciere: number;
  provisions: number;
  capaciteDesendettement: number; // en années
  epargneBrute: number;           // recettes fonct − dépenses fonct, depuis budget
  recettesFonctionnement: number; // base pour ratio RRF
  actifBreakdown: { label: string; value: number }[];
  passifBreakdown: { label: string; value: number }[];
  yearsSummary: { year: number; actif: number; passif: number; dette: number; fondsPropres: number }[];
};

const BILAN_CENTRAL = "Patrimoine Paris";

function bilanCentralFor(city: string): string {
  if (city === "paris") return BILAN_CENTRAL;
  return `Patrimoine ${city.charAt(0).toUpperCase()}${city.slice(1)}`;
}

// Optional `source` block emitted by city POC stubs (e.g. Marseille) that
// derive épargne brute from OFGL aggregates rather than from a row-level
// budget sankey. Paris keeps the canonical compute path (no `source` block).
type BilanSankeyExt = BilanSankey & {
  source?: {
    label?: string;
    url?: string;
    perimeter?: string;
    epargne_brute?: number;
  };
};

export function loadPatrimoineData(requestedYear?: number, city: string = "paris"): PatrimoineData {
  const idx = readJson<BilanIndex>(cityJsonPath(city, "bilan_index.json"));
  const availableYears = idx.availableYears.slice().sort((a, b) => a - b);
  const year = requestedYear && availableYears.includes(requestedYear)
    ? requestedYear
    : idx.latestYear;
  const bilan = readJson<BilanSankeyExt>(cityJsonPath(city, `bilan_sankey_${year}.json`));
  const central = bilanCentralFor(city);

  const actifLinks = bilan.links.filter((l) => l.target === central);
  const passifLinks = bilan.links.filter((l) => l.source === central);

  const actifBreakdown = actifLinks
    .map((l) => ({ label: l.source, value: l.value }))
    .sort((a, b) => b.value - a.value);
  const passifBreakdown = passifLinks
    .map((l) => ({ label: l.target, value: l.value }))
    .sort((a, b) => b.value - a.value);

  // Épargne brute = recettes fonctionnement − dépenses fonctionnement, via
  // budget sankey (Paris). Pour les villes POC sans rapprochement Sankey ↔
  // bilan, on lit la valeur OFGL embarquée dans `bilan.source.epargne_brute`.
  let epargneBrute = 0;
  let recettesFonctionnement = 0;
  if (city === "paris") {
    try {
      const budget = readJson<BudgetSankeyFull>(cityJsonPath(city, `budget_sankey_${year}.json`));
      const centralBudget = centralNodeFor(city);
      let fonctionnement = 0;
      for (const cat of Object.values(budget.bySection)) {
        fonctionnement += cat.Fonctionnement?.total ?? 0;
      }
      const emprunts = budget.links
        .filter((l) => l.source === "Emprunts" && l.target === centralBudget)
        .reduce((s, l) => s + l.value, 0);
      // Retrait aussi des recettes d'investissement (FCTVA, cessions, subventions
      // équipement) qui ne sont pas des RRF. Sans ça on surestimait l'épargne
      // brute d'environ 150 M€/an.
      const recettesInvest = budget.links
        .filter((l) => l.source === "Investissement" && l.target === centralBudget)
        .reduce((s, l) => s + l.value, 0);
      recettesFonctionnement = budget.totals.recettes - emprunts - recettesInvest;
      epargneBrute = Math.max(0, recettesFonctionnement - fonctionnement);
    } catch {}
  } else {
    // POC ville (Marseille v1) — épargne brute injectée par le stub OFGL.
    epargneBrute = Math.max(0, bilan.source?.epargne_brute ?? 0);
  }

  // Capacité de désendettement (méthode Ville, épargne brute non retraitée).
  // ⚠️ La CRC Île-de-France publie un chiffre nettement plus élevé après
  // retraitement des recettes non récurrentes (loyers capitalisés, cessions).
  // Voir `parisCrcDebtYearsFor()` dans lib/methodology.ts et la section
  // éditoriale "Deux lectures coexistent" sur la page dette-patrimoine.
  const capaciteDesendettement = epargneBrute > 0
    ? bilan.totals.dettes_financieres / epargneBrute
    : bilan.totals.dettes_financieres / 900_000_000;

  const yearsSummary: PatrimoineData["yearsSummary"] = [];
  for (const y of idx.availableYears.slice().sort((a, b) => a - b)) {
    try {
      const f = readJson<BilanSankey>(cityJsonPath(city, `bilan_sankey_${y}.json`));
      yearsSummary.push({
        year: y,
        actif: f.totals.actif_net,
        passif: f.totals.passif_net,
        dette: f.totals.dette_totale,
        fondsPropres: f.totals.fonds_propres,
      });
    } catch {}
  }

  return {
    year,
    availableYears,
    actif: bilan.totals.actif_net,
    passif: bilan.totals.passif_net,
    fondsPropres: bilan.totals.fonds_propres,
    detteTotale: bilan.totals.dette_totale,
    detteFinanciere: bilan.totals.dettes_financieres,
    detteNonFinanciere: bilan.totals.dettes_non_financieres,
    provisions: bilan.totals.provisions,
    capaciteDesendettement,
    epargneBrute,
    recettesFonctionnement,
    actifBreakdown,
    passifBreakdown,
    yearsSummary,
  };
}

// ─── Patrimoine — structure enrichie (dette + masses) ─────────────────────

export type BondIssuance = {
  year: number;
  amount_m_eur: number;
  rate_pct: number;
  maturity_years: number;
  label: string;
  meta: string;
};

export type DetteInstrument = {
  key: string;
  label: string;
  subtitle: string;
  tag: string;
  description: string;
  encours: number;
  part: number;
  taux_moyen_pct: number;
  maturite_moyenne_ans: number;
  part_taux_fixe: number;
};

export type MasseSubitem = {
  name: string;
  value: number;
  brut: number;
  amort: number;
};

export type PatrimoineMasse = {
  label: string;
  value: number;
  share: number;
  side: "actif" | "passif";
  tag: string;
  sub: string;
  details: string;
  subitems: MasseSubitem[];
};

export type PatrimoineStructure = {
  year: number;
  structure_dette: {
    total_dette_financiere: number;
    instruments: DetteInstrument[];
    taux: {
      part_fixe: number;
      part_variable: number;
      taux_fixe_moyen_pondere_pct: number;
      encours_taux_fixe: number;
      encours_taux_variable: number;
      indice_variable: string;
    };
    maturite_moyenne_ans: number;
    prochaine_echeance_lourde: {
      annee: number;
      mois: string;
      montant_m_eur: number;
      libelle: string;
    };
    bond_issuances: BondIssuance[];
    bond_issuances_total_m_eur: number;
    obligataire_total: number;
  };
  masses_actif: PatrimoineMasse[];
  masses_passif: PatrimoineMasse[];
  sources: {
    bilan: string;
    dette_structure_qualitative: string[];
    bond_issuances: string[];
    limites: string;
  };
};

export function loadPatrimoineStructure(year: number, city: string = "paris"): PatrimoineStructure | null {
  try {
    return readJson<PatrimoineStructure>(cityJsonPath(city, `patrimoine_structure_${year}.json`));
  } catch {
    return null;
  }
}

// ─── Hors bilan · garanties d'emprunt ──────────────────────────────────────

export type HorsBilanEmprunt = {
  objet: string;
  preteur: string;
  annee_mobilisation: number | null;
  montant_initial: number;
  capital_restant: number;
  duree_residuelle: number | null;
  taux_type: string;
  taux_index: string;
  taux_actuariel: number | null;
};

export type HorsBilanPreteur = {
  name: string;
  capital_restant: number;
  count_emprunts: number;
  share: number;
};

export type HorsBilanBeneficiaire = {
  key: string;
  name: string;
  capital_restant: number;
  montant_initial: number;
  count_emprunts: number;
  share: number;
  nature_dominante: string;
  taux_moyen_pondere_pct: number;
  duree_residuelle_moyenne_ans: number;
  part_fixe: number;
  preteurs: HorsBilanPreteur[];
  emprunts_top: HorsBilanEmprunt[];
};

export type HorsBilanData = {
  year: number;
  generated_at: string;
  totals: {
    capital_restant: number;
    montant_initial: number;
    annuite_totale: number;
    annuite_interets: number;
    annuite_capital: number;
    count_emprunts: number;
    count_beneficiaires: number;
    count_preteurs: number;
  };
  taux: {
    capital_taux_fixe: number;
    capital_taux_variable: number;
    part_fixe: number;
    part_variable: number;
    taux_moyen_pondere_pct: number;
    duree_residuelle_moyenne_ans: number;
    indices_variables: Array<{ index: string; count: number }>;
  };
  by_nature: Array<{
    key: string;
    label: string;
    capital_restant: number;
    share: number;
    count_emprunts: number;
  }>;
  by_arrondissement: Array<{
    arr: number;
    capital_restant: number;
    count_emprunts: number;
    share_of_localized: number;
    top_beneficiaires: Array<{
      name: string;
      capital_restant: number;
      count_emprunts: number;
      share_of_arr: number;
    }>;
    emprunts_top: Array<{
      objet: string;
      beneficiaire: string;
      preteur: string;
      annee_mobilisation: number | null;
      capital_restant: number;
      taux_type: string;
      taux_actuariel: number | null;
    }>;
  }>;
  non_localised: {
    capital_restant: number;
    count_emprunts: number;
    share: number;
  };
  top_beneficiaires: HorsBilanBeneficiaire[];
  autres_beneficiaires: {
    count: number;
    capital_restant: number;
    count_emprunts: number;
    share: number;
  };
  top_preteurs: Array<{
    name: string;
    capital_restant: number;
    count_emprunts: number;
    share: number;
  }>;
  sources: {
    dataset: string;
    url: string;
    license: string;
    note: string;
  };
};

export function loadHorsBilan(year: number, city: string = "paris"): HorsBilanData | null {
  try {
    return readJson<HorsBilanData>(cityJsonPath(city, `hors_bilan_${year}.json`));
  } catch {
    return null;
  }
}

export function loadHorsBilanTrajectory(
  years: number[],
  city: string = "paris",
): Array<{ year: number; capital_restant: number }> {
  const out: Array<{ year: number; capital_restant: number }> = [];
  for (const y of years) {
    const d = loadHorsBilan(y, city);
    if (d) out.push({ year: y, capital_restant: d.totals.capital_restant });
  }
  return out;
}

// ─── Benchmark inter-ville (capacité désendettement, dette/hab) ───────────

export type CityDebtSnapshot = {
  slug: string;
  name: string;
  population: number;
  encours_dette: number;
  epargne_brute: number;
  capacite_desendettement: number;
  dette_par_hab: number;
  year: number;
};

type BenchmarkingPayload = {
  latest_year: number;
  available_years: number[];
  cities: Array<{
    slug: string;
    name: string;
    population: number;
    years: Record<string, {
      encours_dette?: number;
      epargne_brute?: number;
      dette_par_hab?: number;
      ratio_dette_recettes?: number;
    }>;
  }>;
};

/**
 * Charge un snapshot inter-ville pour l'année demandée : dette, épargne brute,
 * capacité de désendettement, dette/hab. Utilisé par la mini-bande comparative
 * sur la page bilan. Retombe sur l'année la plus récente disponible si l'année
 * demandée manque pour une ville.
 */
export function loadCitiesDebtSnapshot(
  year: number,
  slugs: string[] = ["paris", "lyon", "marseille", "toulouse", "nice", "bordeaux"],
): CityDebtSnapshot[] {
  let data: BenchmarkingPayload;
  try {
    data = readJson<BenchmarkingPayload>("villes/benchmarking.json");
  } catch {
    return [];
  }
  const out: CityDebtSnapshot[] = [];
  for (const slug of slugs) {
    const city = data.cities.find((c) => c.slug === slug);
    if (!city) continue;
    const targetYear = city.years[String(year)] ? year : data.latest_year;
    const yearData = city.years[String(targetYear)];
    if (!yearData) continue;
    const encours = yearData.encours_dette ?? 0;
    const epargne = yearData.epargne_brute ?? 0;
    const capacite = epargne > 0 ? encours / epargne : 0;
    out.push({
      slug: city.slug,
      name: city.name,
      population: city.population,
      encours_dette: encours,
      epargne_brute: epargne,
      capacite_desendettement: capacite,
      dette_par_hab: yearData.dette_par_hab ?? (city.population ? encours / city.population : 0),
      year: targetYear,
    });
  }
  return out;
}

// ─── Logement social ───────────────────────────────────────────────────────

type ArrStats = {
  year: number;
  data: Array<{
    arrondissement: number;
    logements?: { total?: number; count?: number };
    investissements?: { total?: number; count?: number };
  }>;
};

export type SruArrondissement = {
  arr: number;
  label: string;
  latest: { year: number; logements_sociaux: number; residences_principales: number; taux_pct: number };
  series: { year: number; logements_sociaux: number; residences_principales: number; taux_pct: number }[];
};

export type SruArrondissementsData = {
  source: string;
  source_url: string;
  licence: string;
  latest_year: number;
  arrondissements: SruArrondissement[];
};

export function loadSruArrondissements(): SruArrondissementsData | null {
  return readJsonOrNull<SruArrondissementsData>("logement_sru_arrondissements.json");
}

export type LogementSocialData = {
  year: number;
  availableYears: number[];
  nouveauxParAn: number;
  nbOperations: number;
  sruRatio: number;
  sruTarget: number;
  /** Year the SRU ratio and stock total refer to — fixed to the latest
   *  official DDT inventory even when the YearPicker is on an earlier year. */
  sruYear: number;
  stockTotal: number;
  byArrondissement: { arr: number; logements: number; operations: number }[];
  /** Bailleurs sociaux principaux (5 + "Autres") avec part de marché — pour
   *  la grille de cards de la page logement-social. */
  bailleurs: { name: string; type: string; color: string; share: number; description: string }[];
  /** Toutes les entités éditorialisées (bailleurs sociaux + aménageurs +
   *  EPIC/fondations garanties par la Ville). Source canonique pour
   *  `loadBailleur(slug)` — couvre les 14 entités hors-bilan. */
  bailleursAll: { name: string; type: string; color: string; share?: number; description: string }[];
  yearsSummary: { year: number; logements: number }[];
  /** Tension SLS — issue directement de la data DRIHL pour Paris (seed +
   *  core_logement_attente_arr → logement_attente_paris.json). Zéro hardcode.
   *  Le délai médian est un délai d'ATTRIBUTION (biais survivant).
   *
   *  null pour les villes hors IDF (ex Marseille) : DRIHL est IDF-only et
   *  le SNE national ne publie pas de CSV exploitable. Les sections §05/§06
   *  du client se masquent silencieusement (P3.2 option a). */
  tension: {
    year: number;
    source: string;
    sourceUrl: string;
    paris: {
      demandesActives: number;
      attributions: number;
      ratio: number;
      delaiMedianMois: number | null;
    };
    parArrondissement: Array<{
      arr: number;
      demandesActives: number;
      attributions: number;
      ratio: number;
      delaiMedianMois: number | null;
      rangTension: number;
    }>;
    methodology: {
      ratioDefinition: string;
      delaiMedianCaveat: string;
      partAnciennete5ansDefinition: string;
    };
  } | null;
};

export function loadLogementSocialData(
  requestedYear?: number,
  city: string = "paris",
): LogementSocialData {
  // Non-Paris cities use a single pre-aggregated file produced by the POC
  // stub (`pipeline/scripts/poc/generate_marseille_logement_stub.py` for
  // Marseille). The schema mirrors `LogementSocialData` 1-to-1 — we just
  // pick the requested year if available and pass through the rest.
  if (city !== "paris") {
    type LogementCityFile = Omit<LogementSocialData, "year"> & {
      year: number;
      // Some cities may add an _meta block — kept loose to avoid type drift.
      _meta?: unknown;
    };
    const raw = readJson<LogementCityFile>(cityJsonPath(city, "logement/logement_data.json"));
    const availableYears = (raw.availableYears ?? []).slice().sort((a, b) => a - b);
    const pickedYear =
      requestedYear && availableYears.includes(requestedYear)
        ? requestedYear
        : (raw.year ?? availableYears[availableYears.length - 1]);
    return {
      year: pickedYear,
      availableYears,
      nouveauxParAn: raw.nouveauxParAn ?? 0,
      nbOperations: raw.nbOperations ?? 0,
      sruRatio: raw.sruRatio,
      sruTarget: raw.sruTarget,
      sruYear: raw.sruYear ?? pickedYear,
      stockTotal: raw.stockTotal,
      byArrondissement: raw.byArrondissement ?? [],
      bailleurs: raw.bailleurs ?? [],
      bailleursAll: raw.bailleursAll ?? raw.bailleurs ?? [],
      yearsSummary: raw.yearsSummary ?? [],
      tension: raw.tension ?? null,
    };
  }

  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const yearsSummary: LogementSocialData["yearsSummary"] = [];
  const files: Record<number, ArrStats> = {};
  for (const y of years) {
    try {
      const d = readJson<ArrStats>(`map/arrondissements_stats_${y}.json`);
      files[y] = d;
      const total = d.data.reduce((s, a) => s + (a.logements?.total ?? 0), 0);
      yearsSummary.push({ year: y, logements: total });
    } catch {}
  }
  const availableYears = Object.keys(files).map(Number).sort((a, b) => a - b);
  const pickedYear =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1];
  const latest = files[pickedYear];
  if (!latest) {
    throw new Error("Missing arrondissements_stats data");
  }
  const nouveauxParAn = latest.data.reduce((s, a) => s + (a.logements?.total ?? 0), 0);
  const nbOperations = latest.data.reduce((s, a) => s + (a.logements?.count ?? 0), 0);

  const byArrondissement = latest.data
    .map((a) => ({
      arr: a.arrondissement,
      logements: a.logements?.total ?? 0,
      operations: a.logements?.count ?? 0,
    }))
    .filter((x) => x.arr > 0)
    .sort((a, b) => b.logements - a.logements);

  // Bailleurs et entités garanties par la Ville. Les `share` (parts du parc
  // social parisien) ne concernent que les vrais bailleurs sociaux ; les
  // autres entités (aménagement, EPIC, fondations) sont garanties par la
  // Ville sans gérer de parc — leur fiche existe pour expliquer la nature
  // de l'entité, pas une part de marché logement.
  // Parts de marché (`share`) lues depuis methodology.json (sourced via
  // seed_city_constants.csv). Le reste des champs (name/type/color/description)
  // reste en code car ce sont des descriptions UI, pas des claims factuels.
  const bailleursAll: LogementSocialData["bailleursAll"] = [
    // ─── Cinq grands bailleurs sociaux historiques ─────────────────────
    { name: "Paris Habitat", type: "OPH (Ville)", color: "#2a3680", share: parisBailleurShare("paris_habitat"), description: "Office Public de l'Habitat de la Ville — plus grand bailleur social français." },
    { name: "RIVP", type: "SEM (Ville)", color: "#1e45e4", share: parisBailleurShare("rivp"), description: "Régie Immobilière de la Ville de Paris — SEM axée sur l'innovation habitat." },
    { name: "Elogie-Siemp", type: "SEM (Ville)", color: "#a67638", share: parisBailleurShare("elogie_siemp"), description: "Issue de la fusion Elogie et Siemp — réhabilitation et mixité sociale." },
    { name: "ICF Habitat", type: "ESH / SA HLM", color: "#5f6672", share: parisBailleurShare("icf_habitat"), description: "Filiale SNCF (groupe ICF) — logement des salariés et logement social." },
    { name: "3F Résidences", type: "ESH / SA HLM", color: "#9099a6", share: parisBailleurShare("3f_residences"), description: "Groupe Action Logement (Immobilière 3F) — bailleur national présent à Paris." },

    // ─── Autres bailleurs sociaux (ESH / SA HLM nationaux) ────────────
    { name: "CDC Habitat Social", type: "ESH (CDC)", color: "#7a8295", description: "Filiale logement social du groupe Caisse des Dépôts — opérations en VEFA et accession sociale." },
    { name: "Toit et Joie", type: "ESH (Poste Habitat)", color: "#7a8295", description: "Bailleur social du groupe La Poste Habitat — patrimoine francilien." },
    { name: "SEQENS", type: "ESH (Action Logement)", color: "#7a8295", description: "ESH du groupe Action Logement (ex-Logement Français) — IDF étendu." },
    { name: "BATIGERE Habitat IDF", type: "ESH (BATIGERE)", color: "#7a8295", description: "ESH régionale du groupe BATIGERE — couvre principalement la grande couronne." },
    { name: "RATP Habitat", type: "ESH (RATP)", color: "#7a8295", description: "Filiale logement de la RATP — historique du logement des agents, ouverte au logement social." },
    { name: "1001 Vies Habitat", type: "ESH (Action Logement)", color: "#7a8295", description: "ESH du groupe Action Logement — patrimoine national, présence parisienne." },
    { name: "L'Habitation Confortable", type: "SA HLM", color: "#7a8295", description: "Société anonyme HLM historique parisienne — petit patrimoine résidentiel." },
    { name: "HSF", type: "ESH", color: "#7a8295", description: "Habitat Social Français — ESH au patrimoine majoritairement francilien." },

    // ─── Aménageurs publics (SPL/SPLA) — pas de parc social ───────────
    { name: "SEMAPA", type: "SPLA (Ville)", color: "#a67638", description: "Société Publique Locale d'Aménagement Paris — opérateur des grandes ZAC parisiennes (Paris Rive Gauche, Bercy-Charenton). Garantie d'emprunt Ville pour ses opérations d'aménagement, pas de parc locatif." },
    { name: "Paris Métropole Aménagement", type: "SPL (Ville+métropole)", color: "#a67638", description: "Société Publique Locale d'aménagement à l'échelle métropolitaine — mêmes mécanismes de garantie que la SEMAPA." },

    // ─── Autres entités garanties (EPIC, fondations, ESS) ─────────────
    { name: "Régie Eau de Paris", type: "EPIC (Ville)", color: "#5f6672", description: "Établissement Public Industriel et Commercial de la Ville — production et distribution d'eau potable. Garantie Ville sur ses emprunts d'investissement réseau." },
    { name: "AccorHotels Arena POPB", type: "SAEM (Ville)", color: "#5f6672", description: "Société anonyme d'économie mixte exploitant le Palais Omnisports de Paris-Bercy. Garantie historique sur les emprunts de construction/rénovation." },
    { name: "Fondation Sciences Po", type: "Fondation reconnue d'utilité publique", color: "#5f6672", description: "Fondation gestionnaire de l'Institut d'Études Politiques. Garantie Ville sur les emprunts immobiliers du campus parisien." },
    { name: "Fondation Rothschild (OPTH A.)", type: "Fondation hospitalière", color: "#5f6672", description: "Fondation OPTH Adolphe de Rothschild — hôpital ophtalmologique. Garantie Ville sur emprunts d'investissement médical." },

    // ─── Catch-all dynamique pour les bailleurs non listés ─────────────
    { name: "Autres bailleurs", type: "Divers", color: "#e4e6ea", share: parisBailleurShare("autres"), description: "Dizaines de petits bailleurs sociaux et coopératifs non listés individuellement." },
  ];

  // Vue restreinte pour la grille principale de la page logement-social :
  // seuls les bailleurs ayant une part de marché documentée (les 5 grands
  // historiques + "Autres"). Les autres entités (aménageurs, EPIC, etc.)
  // restent accessibles via /dette-patrimoine/bailleur/<slug>.
  const featuredBailleurs = bailleursAll.filter(
    (b): b is typeof b & { share: number } => typeof b.share === "number",
  );

  // SRU Paris — chiffres lus depuis methodology.json (sourced via
  // seed_city_constants.csv → DDT Paris Inventaire SRU). Figés à
  // l'inventaire le plus récent même si l'utilisateur sélectionne une
  // année antérieure dans le YearPicker — pas de jeu de valeurs historiques
  // dans nos sources ouvertes actuelles.
  const sruRatio = PARIS_SRU_RATIO;
  const sruTarget = PARIS_SRU_TARGET;
  const sruYear = PARIS_SRU_YEAR;
  const stockTotal = PARIS_SRU_STOCK_TOTAL;

  // Tension SLS — chargée depuis logement_attente_paris.json (pipeline dbt →
  // seed DRIHL XLSX annuel). Zéro hardcode, tout sourcé.
  type LogementAttenteFile = {
    year: number;
    source: string;
    source_url: string;
    paris_total: {
      demandes_choix1: number;
      attributions: number;
      ratio_dem_attrib: number;
      delai_median_attribution_mois: number | null;
    };
    arrondissements: Array<{
      arrondissement: number;
      demandes_choix1: number;
      attributions: number;
      ratio_dem_attrib: number;
      delai_median_attribution_mois: number | null;
      rang_tension: number;
    }>;
    methodology: {
      ratio_definition: string;
      delai_median_caveat: string;
      part_anciennete_definition: string;
    };
  };
  const att = readJson<LogementAttenteFile>("logement_attente_paris.json");
  const tension = {
    year: att.year,
    source: att.source,
    sourceUrl: att.source_url,
    paris: {
      demandesActives: att.paris_total.demandes_choix1,
      attributions: att.paris_total.attributions,
      ratio: att.paris_total.ratio_dem_attrib,
      delaiMedianMois: att.paris_total.delai_median_attribution_mois,
    },
    parArrondissement: att.arrondissements.map((a) => ({
      arr: a.arrondissement,
      demandesActives: a.demandes_choix1,
      attributions: a.attributions,
      ratio: a.ratio_dem_attrib,
      delaiMedianMois: a.delai_median_attribution_mois,
      rangTension: a.rang_tension,
    })),
    methodology: {
      ratioDefinition: att.methodology.ratio_definition,
      delaiMedianCaveat: att.methodology.delai_median_caveat,
      partAnciennete5ansDefinition: att.methodology.part_anciennete_definition,
    },
  };

  return {
    year: latest.year,
    availableYears,
    nouveauxParAn,
    nbOperations,
    sruRatio,
    sruTarget,
    sruYear,
    stockTotal,
    byArrondissement,
    bailleurs: featuredBailleurs,
    bailleursAll,
    yearsSummary,
    tension,
  };
}

/** Project-level social-housing operation as exported in
 *  /data/map/logements_YYYY.json. Values are one-to-one with the source JSON. */
type LogementsFileProject = {
  id: string;
  annee: number;
  adresse: string;
  codePostal: string;
  arrondissement: number;
  latitude: number | null;
  longitude: number | null;
  bailleur: string;
  nbLogements: number;
  nbPlai: number;
  nbPlus: number;
  nbPlusCd: number;
  nbPls: number;
  natureProgramme: string;
  modeRealisation: string;
  commentaires: string | null;
};

type LogementsFile = {
  year: number;
  totalLogements: number;
  count: number;
  withCoords: number;
  parArrondissement: Record<string, { total: number; count: number }>;
  data: LogementsFileProject[];
};

export type ArrondissementLogementProject = {
  id: string;
  adresse: string;
  codePostal: string;
  bailleur: string;
  nbLogements: number;
  mix: { plai: number; plus: number; plusCd: number; pls: number };
  natureProgramme: string;
  modeRealisation: string;
  latitude: number | null;
  longitude: number | null;
};

/** Slug used for the Paris Centre grouping (1er–4e arrondissements). */
export const PARIS_CENTRE_SLUG = "paris-centre";
const PARIS_CENTRE_ARRS = [1, 2, 3, 4];

export type ArrondissementLogementData = {
  year: number;
  availableYears: number[];
  /** Numeric arr (1-20) when scoped to a single district, or null for the
   *  aggregated Paris Centre view (1-4). */
  arr: number | null;
  /** Display label ("12ᵉ arrondissement", "Paris Centre (1er-4ᵉ)"). */
  label: string;
  /** Slug used by the route ("12", "paris-centre"). */
  slug: string;
  /** Total logements sociaux financés pour la zone et l'année. */
  totalLogements: number;
  /** Nombre d'opérations distinctes. */
  nbOperations: number;
  /** Part de la production logement-social Ville de Paris cette année-là. */
  shareCity: number;
  /** Rang de la zone en nombre de logements produits (Paris Centre compte
   *  comme une entrée unique face aux 16 autres arrondissements). */
  rank: number;
  /** Projets triés par nbLogements desc. */
  projects: ArrondissementLogementProject[];
  /** Bailleurs distincts présents dans la zone avec cumul. */
  byBailleur: Array<{ name: string; nbLogements: number; nbOperations: number }>;
};

/** Matches the label convention used in ParisChoropleth: arr 1-4 aggregate
 *  as "Paris Centre" (c_ar = 0) since their fusion in 2020. */
const labelFor = (slug: string): string => {
  if (slug === PARIS_CENTRE_SLUG) return "Paris Centre (1er-4ᵉ)";
  const n = Number(slug);
  return n === 1 ? "1er arrondissement" : `${n}ᵉ arrondissement`;
};

const loadYearFile = (
  requestedYear: number | undefined,
): { file: LogementsFile; year: number; availableYears: number[] } | null => {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const files: Record<number, LogementsFile> = {};
  for (const y of years) {
    try {
      files[y] = readJson<LogementsFile>(`map/logements_${y}.json`);
    } catch {}
  }
  const availableYears = Object.keys(files).map(Number).sort((a, b) => a - b);
  if (availableYears.length === 0) return null;
  const year =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1];
  const file = files[year];
  if (!file) return null;
  return { file, year, availableYears };
};

const projectOf = (p: LogementsFileProject): ArrondissementLogementProject => ({
  id: p.id,
  adresse: p.adresse,
  codePostal: p.codePostal,
  bailleur: p.bailleur,
  nbLogements: p.nbLogements,
  mix: { plai: p.nbPlai, plus: p.nbPlus, plusCd: p.nbPlusCd, pls: p.nbPls },
  natureProgramme: p.natureProgramme,
  modeRealisation: p.modeRealisation,
  latitude: p.latitude,
  longitude: p.longitude,
});

const buildByBailleur = (projects: ArrondissementLogementProject[]) => {
  const m = new Map<string, { nbLogements: number; nbOperations: number }>();
  for (const p of projects) {
    const cur = m.get(p.bailleur) ?? { nbLogements: 0, nbOperations: 0 };
    cur.nbLogements += p.nbLogements;
    cur.nbOperations += 1;
    m.set(p.bailleur, cur);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.nbLogements - a.nbLogements);
};

/** Groups arrondissements as shown on the choropleth: Paris Centre (1-4)
 *  vs each district from 5-20. Returns totals per zone for ranking. */
const zoneTotals = (
  file: LogementsFile,
): Array<{ key: string; total: number }> => {
  const per = file.parArrondissement;
  const centre = PARIS_CENTRE_ARRS.reduce(
    (s, n) => s + (per[String(n)]?.total ?? 0),
    0,
  );
  const zones: Array<{ key: string; total: number }> = [
    { key: PARIS_CENTRE_SLUG, total: centre },
  ];
  for (let n = 5; n <= 20; n++) {
    zones.push({ key: String(n), total: per[String(n)]?.total ?? 0 });
  }
  return zones;
};

/** Lists social-housing operations for a given arrondissement (numeric 1-20)
 *  or the Paris Centre aggregate. Reads logements_YYYY.json and aggregates
 *  per-bailleur totals. Returns null when the year file is missing or the
 *  zone has no data. */
export function loadArrondissementLogement(
  slug: string,
  requestedYear?: number,
): ArrondissementLogementData | null {
  const loaded = loadYearFile(requestedYear);
  if (!loaded) return null;
  const { file, year, availableYears } = loaded;

  const isCentre = slug === PARIS_CENTRE_SLUG;
  const arrNum = isCentre ? null : Number(slug);
  if (!isCentre && (!Number.isInteger(arrNum!) || arrNum! < 1 || arrNum! > 20)) {
    return null;
  }
  const arrFilter = (p: LogementsFileProject) =>
    isCentre
      ? PARIS_CENTRE_ARRS.includes(p.arrondissement)
      : p.arrondissement === arrNum;

  const projects = file.data
    .filter(arrFilter)
    .sort((a, b) => b.nbLogements - a.nbLogements)
    .map(projectOf);
  if (projects.length === 0) return null;

  const totalLogements = projects.reduce((s, p) => s + p.nbLogements, 0);
  const nbOperations = projects.length;
  const cityTotal = file.totalLogements || 0;
  const shareCity = cityTotal > 0 ? (totalLogements / cityTotal) * 100 : 0;

  const zones = zoneTotals(file);
  const rank = zones.filter((z) => z.total > totalLogements).length + 1;

  return {
    year,
    availableYears,
    arr: arrNum,
    label: labelFor(slug),
    slug,
    totalLogements,
    nbOperations,
    shareCity,
    rank,
    projects,
    byBailleur: buildByBailleur(projects),
  };
}

export function loadBudgetPageData(requestedYear?: number, city: string = "paris"): BudgetPageData {
  const index = readJson<BudgetIndex>(cityJsonPath(city, "budget_index.json"));
  const year = requestedYear && index.availableYears.includes(requestedYear)
    ? requestedYear
    : index.latestYear;
  const sankey = readJson<BudgetSankeyFull>(cityJsonPath(city, `budget_sankey_${year}.json`));
  const centralNode = centralNodeFor(city);

  const byYear = Object.fromEntries(index.summary.map((s) => [s.year, s]));
  // Reference year for YoY deltas: prefer latestCompleteYear (Paris CA);
  // fallback to most recent year strictly < year (cities with BP only, like
  // Marseille v1).
  const fallbackPrevYear = index.summary
    .map((s) => s.year)
    .filter((y) => y < year)
    .sort((a, b) => b - a)[0];
  const previousYear = index.latestCompleteYear ?? fallbackPrevYear ?? null;
  const ref = previousYear ? byYear[previousYear] : undefined;
  const deltaDepensesPct = ref
    ? ((sankey.totals.depenses - ref.depenses) / ref.depenses) * 100
    : 0;

  let fonctionnement = 0;
  let investissement = 0;
  for (const cat of Object.values(sankey.bySection)) {
    fonctionnement += cat.Fonctionnement?.total ?? 0;
    investissement += cat.Investissement?.total ?? 0;
  }
  // épargne brute ≈ recettes de fonctionnement - dépenses de fonctionnement
  // approximation : total recettes hors emprunts + recettes d'investissement
  // (FCTVA, cessions, subventions équipement) - fonctionnement.
  const emprunts = sankey.links
    .filter((l) => l.source === "Emprunts" && l.target === centralNode)
    .reduce((s, l) => s + l.value, 0);
  const recettesInvest = sankey.links
    .filter((l) => l.source === "Investissement" && l.target === centralNode)
    .reduce((s, l) => s + l.value, 0);
  const epargneBrute = Math.max(0, sankey.totals.recettes - emprunts - recettesInvest - fonctionnement);

  // Load previous year's sankey to compute per-category YoY deltas. Silent
  // failure if absent (first year of the series).
  const prevDepByLabel = new Map<string, number>();
  try {
    const prev = readJson<BudgetSankeyFull>(cityJsonPath(city, `budget_sankey_${year - 1}.json`));
    for (const l of prev.links) {
      if (l.source === centralNode) prevDepByLabel.set(l.target, l.value);
    }
  } catch {
    /* previous year unavailable */
  }

  const topDepenses = sankey.links
    .filter((l) => l.source === centralNode)
    .map((l) => {
      const cat = sankey.bySection[l.target];
      const items = [
        ...(cat?.Fonctionnement?.items ?? []),
        ...(cat?.Investissement?.items ?? []),
      ];
      // Keep raw names here — the page splits N2/N3 for display.
      const subPostes = items
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      const prevVal = prevDepByLabel.get(l.target);
      const deltaPct =
        prevVal && prevVal > 0 ? ((l.value - prevVal) / prevVal) * 100 : null;
      return { label: l.target, value: l.value, deltaPct, subPostes };
    })
    .sort((a, b) => b.value - a.value);

  const recettesBreakdown = sankey.links
    .filter((l) => l.target === centralNode)
    .map((l) => {
      const items = sankey.drilldown?.revenue?.[l.source] ?? [];
      // Keep raw names — the page splits N2/N3 for display.
      const subSources = items
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      return { label: l.source, value: l.value, subSources };
    })
    .sort((a, b) => b.value - a.value);

  const yearsSummary = index.summary
    .map((s) => ({
      year: s.year,
      type: s.type_budget,
      depenses: s.depenses,
      recettes: s.recettes,
      solde: s.solde,
    }))
    .sort((a, b) => a.year - b.year);

  return {
    year,
    previousYear,
    recettes: sankey.totals.recettes,
    depenses: sankey.totals.depenses,
    solde: sankey.totals.solde,
    deltaDepensesPct,
    fonctionnement,
    investissement,
    epargneBrute,
    topDepenses,
    recettesBreakdown,
    sankeyNodes: sankey.nodes ?? [],
    sankeyLinks: sankey.links,
    yearsSummary,
  };
}

// =====================================================================
// Budget — drawer fiche par poste (recettes ou dépenses)
// =====================================================================

export type BudgetPosteSubPoste = {
  /** Nature comptable brute (peut être préfixée "Thématique: …" pour rétro-compat). */
  name: string;
  value: number;
  /** Sous-thématique fonctionnelle (Musées, Piscines, Théâtre…). Optionnel : peut être manquant pour les recettes ou JSON pré-2026-05. */
  fonction?: string;
  /** Catégorie de flux (Personnel, Subventions, Achats, Investissement…). Optionnel pour les mêmes raisons. */
  flow_category?: string;
  /** Confiance de la ventilation par fonction :
   *   "ca"      → CA exécuté, ventilation directe (haute fiabilité)
   *   "high"    → BP voté, combo (category × flow_category) dominé ≥70% par une fonction sur 6 ans
   *   "medium"  → BP voté, combo réparti entre plusieurs fonctions (dominante 40-70%)
   *   "unknown" → combo absent du seed historique (pas d'imputation possible) */
  fonction_confidence?: "ca" | "high" | "medium" | "unknown";
  /** True si l'item provient d'une répartition proportionnelle depuis l'historique CA
   *  (montant éclaté entre plusieurs fonctions selon les ratios observés 2019-2024). */
  fonction_imputed?: boolean;
  /** Ratio de cette fonction dans le combo historique (0-1), ex 0.42 = 42%. */
  fonction_ratio?: number;
  /** Libellé technique original (BP/CA officiel) si réécrit en grand-public.
   *  Utilisé en tooltip pour la transparence : le visiteur voit le libellé clair,
   *  l'audit/élu peut survoler pour voir l'intitulé d'origine du document budgétaire. */
  name_original?: string;
};

export type BudgetPosteFiche = {
  slug: string;
  label: string;
  /** "depense" | "recette" — direction du flux dans le sankey. */
  kind: "depense" | "recette";
  year: number;
  previousYear: number;
  total: number;
  /** Part du total (dépenses ou recettes selon kind). */
  shareOfKindPct: number;
  /** Variation en % vs année précédente (null si indisponible). */
  deltaPct: number | null;
  /** Sous-postes — natures comptables avec leur fonction + categorie de flux pour l'affichage groupé. */
  subPostes: BudgetPosteSubPoste[];
};

export function loadBudgetPoste(slug: string, requestedYear?: number, city: string = "paris"): BudgetPosteFiche | null {
  const index = readJson<BudgetIndex>(cityJsonPath(city, "budget_index.json"));
  const year = requestedYear && index.availableYears.includes(requestedYear)
    ? requestedYear
    : index.latestYear;
  const sankey = readJson<BudgetSankeyFull>(cityJsonPath(city, `budget_sankey_${year}.json`));
  const centralNode = centralNodeFor(city);

  const depLink = sankey.links.find(
    (l) => l.source === centralNode && slugifyLabel(l.target) === slug,
  );
  const recLink = !depLink
    ? sankey.links.find(
        (l) => l.target === centralNode && slugifyLabel(l.source) === slug,
      )
    : null;

  if (!depLink && !recLink) return null;

  const kind: "depense" | "recette" = depLink ? "depense" : "recette";
  const label = depLink ? depLink.target : recLink!.source;
  const total = depLink ? depLink.value : recLink!.value;
  const totalKind = kind === "depense" ? sankey.totals.depenses : sankey.totals.recettes;
  const shareOfKindPct = totalKind > 0 ? (total / totalKind) * 100 : 0;

  // Côté dépenses, on lit directement drilldown.expenses (top 50 incluant
  // Fonctionnement + Investissement). bySection est moins précis (top 20 par
  // section) et perd l'info `flow_category` qui rend la dim section
  // redondante. Côté recettes on garde drilldown.revenue.
  let subPostes: BudgetPosteSubPoste[] = [];
  if (kind === "depense") {
    subPostes = (sankey.drilldown?.expenses?.[label] ?? [])
      .slice()
      .sort((a, b) => b.value - a.value);
  } else {
    subPostes = (sankey.drilldown?.revenue?.[label] ?? [])
      .slice()
      .sort((a, b) => b.value - a.value);
  }

  const previousYear = year - 1;
  let deltaPct: number | null = null;
  try {
    const prev = readJson<BudgetSankeyFull>(cityJsonPath(city, `budget_sankey_${previousYear}.json`));
    const prevLink =
      kind === "depense"
        ? prev.links.find((l) => l.source === centralNode && l.target === label)
        : prev.links.find((l) => l.target === centralNode && l.source === label);
    if (prevLink && prevLink.value > 0) {
      deltaPct = ((total - prevLink.value) / prevLink.value) * 100;
    }
  } catch {
    /* previous year unavailable */
  }

  return {
    slug,
    label,
    kind,
    year,
    previousYear,
    total,
    shareOfKindPct,
    deltaPct,
    subPostes,
  };
}

// =====================================================================
// Thème subventions / catégorie marchés — drawer fiches
// =====================================================================

/** Slugifie un libellé éditorial (thème subvention / catégorie marché). */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type ThemeSubventionsFiche = {
  theme: string;
  slug: string;
  year: number;
  previousYear: number;
  total: number;
  rankPct: number;
  nbBeneficiaires: number;
  nbSubventions: number;
  shareOfTotalPct: number;
  evolution: { year: number; amount: number; count: number }[];
  topBeneficiaires: { name: string; amount: number; nb: number; direction: string | null; objet: string | null }[];
};

/** Charge la fiche agrégée pour un thème (page + drawer intercepting). */
export function loadThemeSubventions(slug: string, requestedYear?: number, city: string = "paris"): ThemeSubventionsFiche | null {
  const idx = readJson<SubvIndex>(cityJsonPath(city, "subventions/index.json"));
  const years = idx.availableYears.slice().sort((a, b) => a - b);
  const yr = requestedYear && years.includes(requestedYear) ? requestedYear : years[years.length - 1];
  const prev = years[years.length - 2] ?? yr;

  // Résout le slug : match par slugification. Les variantes `Social-*` sont
  // consolidées dans le stackbar sous `Social`, donc on doit élargir.
  const target = slug.toLowerCase();
  const matchTheme = (t: string | undefined | null): boolean => {
    if (!t) return false;
    const s = slugifyLabel(t);
    if (s === target) return true;
    if (target === "social" && t.toLowerCase().startsWith("social")) return true;
    return false;
  };

  const perYear = new Map<number, { amount: number; count: number; benes: Map<string, { amount: number; nb: number; direction: string | null; objet: string | null }> }>();
  let resolvedLabel = "";

  for (const y of years) {
    try {
      const file = readJson<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${y}.json`));
      const yearAgg = { amount: 0, count: 0, benes: new Map<string, { amount: number; nb: number; direction: string | null; objet: string | null }>() };
      for (const b of file.data) {
        if (!matchTheme(b.thematique ?? null)) continue;
        resolvedLabel = resolvedLabel || (target === "social" ? "Social" : b.thematique ?? "");
        yearAgg.amount += b.montant_total;
        yearAgg.count += b.nb_subventions;
        const cur = yearAgg.benes.get(b.beneficiaire) ?? { amount: 0, nb: 0, direction: null, objet: null };
        cur.amount += b.montant_total;
        cur.nb += b.nb_subventions;
        cur.direction = cur.direction ?? b.direction ?? null;
        cur.objet = cur.objet ?? b.objet_principal ?? null;
        yearAgg.benes.set(b.beneficiaire, cur);
      }
      if (yearAgg.count > 0) perYear.set(y, yearAgg);
    } catch {}
  }

  if (!resolvedLabel || !perYear.has(yr)) return null;
  const current = perYear.get(yr)!;

  const evolution = years
    .map((y) => {
      const p = perYear.get(y);
      return { year: y, amount: p?.amount ?? 0, count: p?.count ?? 0 };
    })
    .filter((e) => e.amount > 0);

  const topBeneficiaires = [...current.benes.entries()]
    .map(([name, v]) => ({ name, amount: v.amount, nb: v.nb, direction: v.direction, objet: v.objet }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const totalYr = idx.totalsByYear[String(yr)]?.montant_total ?? 0;
  const shareOfTotalPct = totalYr > 0 ? (current.amount / totalYr) * 100 : 0;

  return {
    theme: resolvedLabel,
    slug,
    year: yr,
    previousYear: prev,
    total: current.amount,
    rankPct: shareOfTotalPct,
    nbBeneficiaires: current.benes.size,
    nbSubventions: current.count,
    shareOfTotalPct,
    evolution,
    topBeneficiaires,
  };
}

export type MarcheCategorieFiche = {
  category: string;
  slug: string;
  year: number;
  total: number;
  shareOfTotalPct: number;
  nbContrats: number;
  nbTitulaires: number;
  topTitulaires: { name: string; siret: string; amount: number; nb: number }[];
  topContrats: { numero: string; objet: string; objetClair: string | null; objetClairEn: string | null; montant: number; fournisseur: string; fournisseurSiret: string; date: string; nature: string }[];
};

/** Charge la fiche agrégée pour une catégorie de marchés publics. */
export function loadMarcheCategorie(slug: string, requestedYear?: number): MarcheCategorieFiche | null {
  const idx = readJson<MarchesIndexRaw>("marches-publics/index.json");
  const years = (idx.availableYears ?? []).slice().sort((a, b) => a - b);

  // Le schéma des catégories DECP a changé entre 2024 et 2025/2026 : les
  // libellés granulaires ("entretien des espaces verts") existaient pre-2025,
  // remplacés depuis par des libellés grossiers ("Travaux", "Fournitures
  // courantes"). Pour ne pas 404 sur des URLs encore valides, on cherche
  // descendant depuis l'année la plus récente si on ne trouve rien dans
  // l'année par défaut.
  const candidateYears = requestedYear && years.includes(requestedYear)
    ? [requestedYear]
    : years.slice().reverse();

  const target = slug.toLowerCase();
  let yr: number | null = null;
  let rows: (MarcheRow & { numero_marche?: string; fournisseur_siret?: string; fournisseur_nom?: string })[] = [];
  let matching: (MarcheRow & { numero_marche?: string; fournisseur_siret?: string; fournisseur_nom?: string })[] = [];
  for (const candidate of candidateYears) {
    let file: MarchesFile;
    try {
      file = readJson<MarchesFile>(`marches-publics/marches_${candidate}.json`);
    } catch {
      continue;
    }
    const candidateRows = (file.data ?? file.marches ?? []) as (MarcheRow & {
      numero_marche?: string;
      fournisseur_siret?: string;
      fournisseur_nom?: string;
    })[];
    const found = candidateRows.filter((r) => {
      const cat = r.categorie_libelle || r.nature || "Autres";
      return slugifyLabel(cat) === target;
    });
    if (found.length > 0) {
      yr = candidate;
      rows = candidateRows;
      matching = found;
      break;
    }
  }
  if (yr === null || matching.length === 0) return null;

  const firstCat = matching[0].categorie_libelle || matching[0].nature || "Autres";
  const total = matching.reduce((s, r) => s + Number(r.montant_max ?? 0), 0);

  // Agrégation par SIREN (cf. note dans loadMarchesPageData) pour éviter
  // les doublons quand un même SIREN a plusieurs SIRETs/libellés DECP.
  const titMap = new Map<string, { name: string; amount: number; count: number; siret: string }>();
  for (const r of matching) {
    const name = r.fournisseur_nom || "Non précisé";
    if (name === "MARCHE MULTIATTRIBUTAIRE") continue;
    const rawSiret = (r.fournisseur_siret ?? "").replace(/\s/g, "");
    const validSiret = rawSiret && rawSiret !== "#" && !rawSiret.includes("|") && rawSiret.length >= 9
      ? rawSiret
      : "";
    const aggKey = validSiret ? validSiret.slice(0, 9) : `name:${name.toLowerCase()}`;
    const cur = titMap.get(aggKey) ?? { name, amount: 0, count: 0, siret: validSiret };
    cur.amount += Number(r.montant_max ?? 0);
    cur.count += 1;
    if (!cur.siret && validSiret) cur.siret = validSiret;
    if (name.length > cur.name.length && name !== "Non précisé") cur.name = name;
    titMap.set(aggKey, cur);
  }
  const topTitulaires = [...titMap.values()]
    .map((v) => ({ name: v.name, siret: v.siret, amount: v.amount, nb: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const vulg = loadMarcheVulgMap();
  const topContrats = matching
    .slice()
    .sort((a, b) => Number(b.montant_max ?? 0) - Number(a.montant_max ?? 0))
    .slice(0, 10)
    .map((r) => {
      const numero = r.numero_marche ?? "";
      return {
        numero,
        objet: r.objet ?? "",
        objetClair: (numero && vulg[numero]?.objet_clair) || null,
        objetClairEn: (numero && vulg[numero]?.objet_clair_en) || null,
        montant: Number(r.montant_max ?? 0),
        fournisseur: r.fournisseur_nom ?? "Non précisé",
        fournisseurSiret: (r.fournisseur_siret ?? "").replace(/\s/g, ""),
        date: r.date_notification ?? "",
        nature: r.nature ?? "—",
      };
    });

  // Grand total of marchés this year to compute a share %
  const grandTotal = rows.reduce((s, r) => s + Number(r.montant_max ?? 0), 0);
  const shareOfTotalPct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

  return {
    category: firstCat,
    slug,
    year: yr,
    total,
    shareOfTotalPct,
    nbContrats: matching.length,
    nbTitulaires: titMap.size,
    topTitulaires,
    topContrats,
  };
}

function loadMarcheVulgMap(): Record<string, MarcheVulgarization> {
  const data = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>("enrichment/vulgarization_marches.json");
  const en = readJsonOrNull<VulgarizationCache<MarcheVulgarization>>("enrichment/vulgarization_marches_en.json");
  const merged: Record<string, MarcheVulgarization> = {};
  for (const [k, v] of Object.entries(data?.items ?? {})) {
    const e = en?.items?.[k];
    merged[k] = e
      ? {
          ...v,
          objet_clair_en: e.objet_clair,
          quoi_concretement_en: e.quoi_concretement,
          pourquoi_ca_compte_en: e.pourquoi_ca_compte,
        }
      : v;
  }
  return merged;
}
