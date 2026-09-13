/**
 * Every entity page of the French and Brazilian cities, as paths, for the
 * sitemap (feedback_seo_aigeo_by_default: a page that is not declared is a page
 * Google finds by luck — that was the state of ~30 000 fiches until 2026-09-08).
 *
 * Each enumerator reads the same export the fiche route resolves against and
 * builds the slug the same way the loader does, so a listed URL always renders.
 * Enumerators are guarded like the SF ones in sitemap.ts: on a branch where
 * public/data is not hydrated a family is skipped, never the build.
 */
import { cityJsonPath, listDataDir, readDataJsonOrNull } from "@/lib/data/read";
import { canonicalBailleurSlug, loadLogementSocialData } from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { loadPlacesIndex as loadMarseillePlaces } from "@/lib/marseille/marseille-places-data";
import { slugifyChapitre, slugifyLabel } from "@/lib/projet-utils";
import { associationUniqueNames, countByLetter, fournisseurList, marchesYears, projetArrondissements, projetYears, recifeRecipientNames, sfPayeeNames, PAGE_SIZE } from "@/lib/seo/browse";
import { assocSlug } from "@/lib/assoc-slug";

type SubvIndex = { availableYears: number[] };
type SubvBen = { data: { beneficiaire: string; nature_juridique?: string | null }[] };

/** Private individuals receive grants too; their pages are noindex and never listed. */
const PRIVATE_INDIVIDUAL = "Personnes physiques";
type Treemap = { data: { thematique?: string; name?: string; theme?: string }[] };
type MarchesIndex = { availableYears: number[] };
type MarchesFile = { data?: MarcheRow[]; marches?: MarcheRow[] };
type MarcheRow = { numero_marche?: string; fournisseur_siret?: string; categorie_libelle?: string };
type Sankey = { nodes: { name: string; category?: string }[]; links: { source: string; target: string }[] };
type BudgetIndex = { latestYear?: number; availableYears?: number[] };
type InvTrends = { years: { year: number; par_chapitre?: { label?: string; chapitre?: string }[] }[] };
type InvComplet = { data: { id: string }[] };
type HorsBilanIndex = { latestYear: number };
type HorsBilan = { top_beneficiaires: { name: string }[] };
type Patrimoine = {
  structure_dette: { instruments: { key: string }[] };
  masses_actif: { label: string }[];
  masses_passif: { label: string }[];
};

function guarded(out: string[], fn: () => void) {
  try {
    fn();
  } catch {
    /* data not hydrated on this branch — skip this family */
  }
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Subventions: every beneficiary name that appears in any year, plus the themes. */
function subventionPaths(city: string, base: string): string[] {
  const out: string[] = [];
  guarded(out, () => {
    const idx = readDataJsonOrNull<SubvIndex>(cityJsonPath(city, "subventions/index.json"));
    if (!idx) return;
    const names = new Set<string>();
    const themes = new Set<string>();
    for (const y of idx.availableYears) {
      const f = readDataJsonOrNull<SubvBen>(cityJsonPath(city, `subventions/beneficiaires_${y}.json`));
      for (const r of f?.data ?? []) {
        if (r.beneficiaire && r.nature_juridique !== PRIVATE_INDIVIDUAL) names.add(r.beneficiaire);
      }
      const t = readDataJsonOrNull<Treemap>(cityJsonPath(city, `subventions/treemap_${y}.json`));
      for (const r of t?.data ?? []) {
        const label = r.thematique ?? r.theme ?? r.name;
        if (label) themes.add(slugifyLabel(label));
      }
    }
    for (const n of names) out.push(`${base}/subventions/association/${assocSlug(n)}`);
    for (const s of themes) out.push(`${base}/subventions/theme/${s}`);
  });
  return out;
}

/** Marchés: every contract number, every supplier SIREN, every category. */
function marchesPaths(city: string, base: string): string[] {
  const out: string[] = [];
  guarded(out, () => {
    const idx = readDataJsonOrNull<MarchesIndex>(cityJsonPath(city, "marches-publics/index.json"));
    if (!idx) return;
    const numeros = new Set<string>();
    const sirens = new Set<string>();
    const cats = new Set<string>();
    for (const y of idx.availableYears) {
      const f = readDataJsonOrNull<MarchesFile>(cityJsonPath(city, `marches-publics/marches_${y}.json`));
      for (const r of f?.data ?? f?.marches ?? []) {
        if (r.numero_marche) numeros.add(r.numero_marche);
        const siren = (r.fournisseur_siret ?? "").replace(/\s/g, "").slice(0, 9);
        if (/^\d{9}$/.test(siren)) sirens.add(siren);
        if (r.categorie_libelle) cats.add(slugifyLabel(r.categorie_libelle));
      }
    }
    for (const n of numeros) out.push(`${base}/marches/contrat/${encodeURIComponent(n)}`);
    for (const s of sirens) out.push(`${base}/marches/fournisseur/${s}`);
    // The category fiche exists for Paris only (app/fr/city/paris/marches/categorie).
    if (city === "paris") for (const c of cats) out.push(`${base}/marches/categorie/${c}`);
  });
  return out;
}

/** Budget: the postes of the latest published sankey (the fiche resolves by label slug). */
function budgetPostePaths(city: string, base: string): string[] {
  const out: string[] = [];
  guarded(out, () => {
    const idx = readDataJsonOrNull<BudgetIndex>(cityJsonPath(city, "budget_index.json"));
    const year = idx?.latestYear ?? (idx?.availableYears ? Math.max(...idx.availableYears) : null);
    if (!year) return;
    const sk = readDataJsonOrNull<Sankey>(cityJsonPath(city, `budget_sankey_${year}.json`));
    if (!sk) return;
    const central = sk.nodes.find((n) => n.category === "central")?.name;
    if (!central) return;
    const slugs = new Set<string>();
    for (const l of sk.links) {
      if (l.source === central) slugs.add(slugifyLabel(l.target));
      else if (l.target === central) slugs.add(slugifyLabel(l.source));
    }
    for (const s of slugs) out.push(`${base}/budget/poste/${s}`);
  });
  return out;
}

/** Paris-only families: investments, places, guaranteed debt, balance sheet, arrondissements. */
function parisOnlyPaths(): string[] {
  const base = "/fr/city/paris";
  const out: string[] = [];
  guarded(out, () => {
    const ids = new Set<string>();
    for (const f of listDataDir("map")) {
      const m = f.match(/^investissements_complet_(\d{4})$/);
      if (!m) continue;
      const doc = readDataJsonOrNull<InvComplet>(`map/${f}.json`);
      for (const r of doc?.data ?? []) if (r.id) ids.add(r.id);
    }
    for (const id of ids) out.push(`${base}/investissements/projet/${encodeURIComponent(id)}`);
  });
  guarded(out, () => {
    const trends = readDataJsonOrNull<InvTrends>("investissement_tendances.json");
    const last = trends?.years[trends.years.length - 1];
    const labels = uniq((last?.par_chapitre ?? []).map((c) => c.label ?? c.chapitre ?? "").filter(Boolean));
    for (const l of labels) out.push(`${base}/investissements/chapitre/${slugifyChapitre(l)}`);
    for (let a = 1; a <= 20; a++) out.push(`${base}/investissements/arrondissement/${a}`);
  });
  guarded(out, () => {
    for (const l of loadLieuxIndex()) out.push(`${base}/lieu/${l.slug}`);
  });
  guarded(out, () => {
    // The fiche resolves a slug by canonicalBailleurSlug(name) on both the
    // guaranteed-debt beneficiaries and the social-housing operators.
    const idx = readDataJsonOrNull<HorsBilanIndex>("hors_bilan_index.json");
    const hb = idx ? readDataJsonOrNull<HorsBilan>(`hors_bilan_${idx.latestYear}.json`) : null;
    const names = new Set<string>((hb?.top_beneficiaires ?? []).map((b) => b.name));
    for (const b of loadLogementSocialData().bailleursAll) names.add(b.name);
    for (const n of names) out.push(`${base}/dette/bailleur/${canonicalBailleurSlug(n)}`);
    // 0 = the virtual Paris Centre fiche (arrondissements 1-4 merged since 2020).
    for (let a = 0; a <= 20; a++) if (a === 0 || a > 4) out.push(`${base}/dette/garanties/arrondissement/${a}`);
  });
  guarded(out, () => {
    const years = listDataDir(".")
      .map((f) => f.match(/^patrimoine_structure_(\d{4})$/)?.[1])
      .filter((y): y is string => !!y)
      .map(Number);
    if (years.length === 0) return;
    const doc = readDataJsonOrNull<Patrimoine>(`patrimoine_structure_${Math.max(...years)}.json`);
    for (const i of doc?.structure_dette.instruments ?? []) out.push(`${base}/dette/instrument/${i.key}`);
    for (const m of [...(doc?.masses_actif ?? []), ...(doc?.masses_passif ?? [])]) out.push(`${base}/dette/masse/${slugifyLabel(m.label)}`);
  });
  guarded(out, () => {
    out.push(`${base}/logement/arrondissement/paris-centre`);
    for (let a = 5; a <= 20; a++) out.push(`${base}/logement/arrondissement/${a}`);
  });
  return out;
}

/** Marseille has its own places corpus under lieu/[slug]. */
function marseillePlacesPaths(): string[] {
  const out: string[] = [];
  guarded(out, () => {
    for (const p of loadMarseillePlaces()) if (p.slug) out.push(`/fr/city/marseille/lieu/${p.slug}`);
  });
  return out;
}

/** Recife (br-municipal): one JSON per family, keyed the way each route resolves. */
function recifePaths(): string[] {
  const base = "/br/city/recife";
  const out: string[] = [];
  const b = "br/recife";
  guarded(out, () => {
    const q = readDataJsonOrNull<{ items?: Record<string, unknown> }>(`${b}/recipients.json`);
    for (const cnpj of Object.keys(q?.items ?? {})) out.push(`${base}/quem-recebe/${cnpj}`);
  });
  for (const [file, seg] of [
    ["orgaos", "orgao"],
    ["temas", "tema"],
    ["modalidades", "modalidade"],
  ] as const) {
    guarded(out, () => {
      const doc = readDataJsonOrNull<{ items?: Record<string, unknown> }>(`${b}/${file}.json`);
      for (const slug of Object.keys(doc?.items ?? {})) out.push(`${base}/${seg}/${slug}`);
    });
  }
  guarded(out, () => {
    const doc = readDataJsonOrNull<{ contratos?: { contrato_id: string }[] }>(`${b}/contratos.json`);
    for (const c of doc?.contratos ?? []) if (c.contrato_id) out.push(`${base}/contratos/${encodeURIComponent(c.contrato_id)}`);
  });
  guarded(out, () => {
    const doc = readDataJsonOrNull<{ places?: { slug: string }[] }>(`${b}/places.json`);
    for (const p of doc?.places ?? []) if (p.slug) out.push(`${base}/lugares/${p.slug}`);
  });
  guarded(out, () => {
    const doc = readDataJsonOrNull<{ anos?: { funcoes?: { funcao: string }[] }[] }>(`${b}/budget.json`);
    const last = doc?.anos?.[doc.anos.length - 1];
    for (const f of last?.funcoes ?? []) if (f.funcao) out.push(`${base}/budget/funcao/${slugifyLabel(f.funcao)}`);
  });
  return uniq(out);
}

/** Section pages of the French cities that have dedicated routes (Marseille…). */
// Marseille has its own routes (app/fr/city/marseille/*). The other big cities
// have none left: since the page-ville refonte (2026-09-09) their budget,
// investissements, evolution and comparaison tabs 308 to an anchor of the city
// page, and a redirect in a sitemap is an error. Their marchés explorer is
// listed with every other commune's (communeMarchesPaths, sitemap.ts).
const MARSEILLE_SECTIONS = ["budget", "subventions", "marches", "investissements", "dette", "logement", "lieux"];

function frenchCitySectionPaths(): string[] {
  return MARSEILLE_SECTIONS.map((s) => `/fr/city/marseille/${s}`);
}

/** Browse indexes (lib/seo/browse.ts): index, letter/year pages and their pagination. */
function lettersPaged(base: string, names: string[]): string[] {
  const out = [base];
  for (const c of countByLetter(names)) {
    if (c.count === 0) continue;
    const pages = Math.ceil(c.count / PAGE_SIZE);
    for (let p = 1; p <= pages; p++) out.push(p === 1 ? `${base}/${c.letter}` : `${base}/${c.letter}/${p}`);
  }
  return out;
}
function frBrowsePaths(city: string): string[] {
  const out: string[] = [];
  guarded(out, () => out.push(...lettersPaged(`/fr/city/${city}/subventions/associations`, associationUniqueNames(city))));
  guarded(out, () => out.push(...lettersPaged(`/fr/city/${city}/marches/fournisseurs`, fournisseurList(city).map((f) => f.nom))));
  guarded(out, () => {
    const base = `/fr/city/${city}/marches/contrats`;
    out.push(base);
    for (const y of marchesYears(city)) out.push(`${base}/${y}`);
  });
  if (city === "paris") {
    guarded(out, () => {
      const base = "/fr/city/paris/investissements/projets";
      out.push(base);
      for (const y of projetYears()) {
        out.push(`${base}/${y}`);
        for (const a of projetArrondissements(y)) out.push(`${base}/${y}/${a.arr}`);
      }
    });
  }
  return out;
}
export function sfBrowsePaths(): string[] {
  const out: string[] = [];
  guarded(out, () => out.push(...lettersPaged("/us/city/sf/who-gets-paid/payees", sfPayeeNames())));
  return out;
}

/** Every French (Paris + Marseille) and Brazilian entity page, deduplicated. */
export function frEntityPaths(): string[] {
  const out: string[] = [];
  for (const city of ["paris", "marseille"]) {
    const base = `/fr/city/${city}`;
    out.push(...frBrowsePaths(city), ...subventionPaths(city, base), ...marchesPaths(city, base), ...budgetPostePaths(city, base));
  }
  out.push(...parisOnlyPaths(), ...marseillePlacesPaths());
  return uniq(out);
}

export function brEntityPaths(): string[] {
  return [
    "/br/city/recife",
    "/br/city/recife/budget",
    "/br/city/recife/contratos",
    "/br/city/recife/quem-recebe",
    "/br/city/recife/lugares",
    ...lettersPaged("/br/city/recife/quem-recebe/todos", recifeRecipientNames()),
    ...recifePaths(),
  ];
}

export { frenchCitySectionPaths };
