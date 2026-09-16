/**
 * "See also" rows for the Paris/Marseille fiches that used to be dead ends
 * (components/fiche/RelatedLinks.tsx). Every row is built from an export the
 * fiche route already resolves against, with the slug the loader expects, so
 * a listed link always renders. The first blocks (bailleur → contrat) carry
 * their FR and EN titles inline; the blocks added since read them from the
 * dictionaries (`fx.related.*`) through lib/related-t.ts.
 */
import { cityJsonPath, readDataJsonOrNull } from "@/lib/data/read";
import { makeFmt } from "@/lib/fmt";
import { getCity } from "@/lib/cities";
import { relatedInt, relatedT } from "@/lib/related-t";
import { NATURE_GROUPS, NATURE_LABELS } from "@/lib/budget-natures";
import { canonicalBailleurSlug, loadBudgetPoste, getProjetNameEn, loadBudgetNature, type BudgetNatureFiche, loadArrondissementGaranties, loadArrondissementLogement, PARIS_CENTRE_SLUG, type BudgetPosteFiche, type MarcheCategorieFiche, type ThemeSubventionsFiche, loadArrondissement, loadChapitre, loadFournisseur, loadThemeSubventions, type FournisseurFiche, type ProjetFiche } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { rowObjet } from "@/lib/objet-normalizer";
import { OFFRES_BUCKETS, offresBucketOf, offresBucketSlug } from "@/lib/marches-offres";
import { sumLots } from "@/lib/marches-shape";
import type { MarchesOffresFiche } from "@/lib/fusion-data";
import { detteDoorTotal, loadInvestForYear, loadInvestLatest, loadLogementSocialData, marchesDomainesOfYear, marchesYearTotal, subventionsYearTotal, type MarchesDomaineFiche } from "@/lib/fusion-data";
import { dedupMixedSources } from "@/lib/marches-dedup";
import { domaineLabel } from "@/lib/marches-domaines";
import { serviceToM57, slugifyChapitre, slugifyLabel } from "@/lib/projet-utils";
import { ordEn, ordFr } from "@/lib/entities/seo-text";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { POSTE_LINKS, type PosteLinkSpec } from "@/lib/budget-poste-links";
import { assocSlug } from "@/lib/assoc-slug";
import { lieuxVoisins, loadLieuxIndex, type LieuFicheData } from "@/lib/lieux-data";
import { loadPlacesIndex as loadMarseillePlaces, type MarseillePlace } from "@/lib/marseille/marseille-places-data";
import { displayOrgName } from "@/lib/fournisseur-display";
import { lotInfo, lotRepeatFlags } from "@/lib/marches-shape";

type L = "fr" | "en";
const FMT = { fr: makeFmt("fr"), en: makeFmt("en") };
/** Montant compact dans la langue de la fiche (« 4,76 Md € » / « 4.76 €B »). */
const eur = (n: number, locale: L) => {
  const c = FMT[locale].fmtCompactEur(n);
  return { v: c.value, u: c.unit };
};

/**
 * « Dans le budget » rows: the Paris budget item whose hand-written link
 * table (lib/budget-poste-links.ts) names this theme, contract category,
 * investment chapter or place family. It is the table the budget item fiche
 * reads to list where its money lands, read the other way; nothing is matched
 * on words. A row appears only when the item resolves on its route with an
 * amount, and its sub line says the scope is wider, since a budget item and
 * a list of grants or contracts never add up.
 */
function budgetRows(match: (spec: PosteLinkSpec) => boolean, locale: L, max = 1): RelatedRow[] {
  const t = relatedT(locale);
  const out: RelatedRow[] = [];
  for (const [slug, spec] of Object.entries(POSTE_LINKS)) {
    if (out.length >= max) break;
    if (!match(spec)) continue;
    let p: BudgetPosteFiche | null = null;
    try { p = loadBudgetPoste(slug); } catch { p = null; }
    if (!p || p.total <= 0) continue;
    out.push({
      href: `/france/paris/budget/poste/${slug}`,
      label: t("fx.related.budget.poste", { poste: trLabel(p.label, locale), year: p.year }),
      sub: t("fx.related.budget.poste_sub"),
      amount: eur(p.total, locale),
      group: t("fx.related.g.budget"),
    });
  }
  return out;
}

/**
 * The door back up to the section page, with the year's number: what turns a
 * fiche reached from a search engine into a visit of the section. The number
 * is the year's total as the page counts it (a shared lot once, a contract
 * published by both sources once).
 */
export function marchesSectionRow(city: string, year: number, locale: L): RelatedRow {
  const t = relatedT(locale);
  const total = marchesYearTotal(city, year);
  return {
    href: `/france/${city}/marches?year=${year}`,
    label: t("fx.related.marches_section", { year }),
    sub: t("fx.related.marches_section_sub"),
    ...(total > 0 ? { amount: eur(total, locale) } : {}),
    group: t("fx.related.g.context"),
  };
}

/** The same door for the Chantiers section: the year's investment as the
 *  page counts it (spending net of debt repayment), the latest published
 *  year when the fiche's year has none. */
export function investSectionRow(year: number | null, locale: L): RelatedRow {
  const t = relatedT(locale);
  const s = (year != null ? loadInvestForYear(year) : null) ?? loadInvestLatest();
  const y = s?.year ?? year ?? new Date().getFullYear() - 1;
  return {
    href: `/france/paris/investissements?year=${y}`,
    label: t("fx.related.invest_section", { year: y }),
    sub: t("fx.related.invest_section_sub"),
    ...(s ? { amount: eur(s.total, locale) } : {}),
    group: t("fx.related.g.context"),
  };
}

/** The same door for the Subventions section: the year's total paid, the
 *  latest published year when the fiche's year has none. */
export function subventionsSectionRow(city: string, year: number | null, locale: L): RelatedRow {
  const t = relatedT(locale);
  const s = subventionsYearTotal(city, year ?? new Date().getFullYear());
  const y = s?.year ?? year ?? new Date().getFullYear() - 1;
  return {
    href: `/france/${city}/subventions?year=${y}`,
    label: t("fx.related.subv_section", { year: y }),
    sub: t("fx.related.subv_section_sub"),
    ...(s ? { amount: eur(s.total, locale) } : {}),
    group: t("fx.related.g.context"),
  };
}

/** The same door for the Dette section: the financial debt at the last closed balance sheet. */
export function detteSectionRow(year: number | null, locale: L): RelatedRow {
  const t = relatedT(locale);
  const s = detteDoorTotal("paris", year ?? new Date().getFullYear());
  const y = s?.year ?? year ?? new Date().getFullYear() - 1;
  return {
    href: `/france/paris/dette?year=${y}`,
    label: t("fx.related.dette_section", { year: y }),
    sub: t("fx.related.dette_section_sub"),
    ...(s ? { amount: eur(s.total, locale) } : {}),
    group: t("fx.related.g.context"),
  };
}

/** The same door for the Logement section: the year's funded homes. */
export function logementSectionRow(year: number | null, locale: L): RelatedRow {
  const t = relatedT(locale);
  let s: { year: number; financed: number } | null = null;
  try {
    const d = loadLogementSocialData(year ?? undefined, "paris");
    s = { year: d.year, financed: d.nouveauxParAn };
  } catch { s = null; }
  const y = s?.year ?? year ?? new Date().getFullYear() - 1;
  return {
    href: `/france/paris/logement?year=${y}`,
    label: t("fx.related.logement_section", { year: y }),
    sub: t("fx.related.logement_section_sub"),
    ...(s ? { amount: { v: relatedInt(s.financed, locale), u: locale === "en" ? "homes" : "logements" } } : {}),
    group: t("fx.related.g.context"),
  };
}

/** « Number of bids » fiche: the section door, the other bids counts of the
 *  same year (each with its fiche), the year's index. */
export function offresRelated(f: MarchesOffresFiche, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const rows: RelatedRow[] = [marchesSectionRow("paris", f.year, locale)];
  const file = readDataJsonOrNull<{ data?: (MarcheLite & { decp_offres_recues?: number | null })[]; marches?: (MarcheLite & { decp_offres_recues?: number | null })[] }>(`marches-publics/marches_${f.year}.json`);
  const rows0 = dedupMixedSources(file?.data ?? file?.marches ?? []).rows.filter((r) => Number(r.decp_offres_recues ?? 0) >= 1);
  for (const b of OFFRES_BUCKETS) {
    if (b === f.bucket) continue;
    const inBucket = rows0.filter((r) => offresBucketOf(Number(r.decp_offres_recues)) === b);
    if (inBucket.length === 0) continue;
    const total = sumLots(inBucket);
    rows.push({
      href: `/france/paris/marches/offres/${offresBucketSlug(b)}${f.year === f.years[f.years.length - 1] ? "" : `-${f.year}`}`,
      label: t(`fx.mp.s05.bucket.${b}`),
      sub: t("fx.related.offres.peer_sub", { n: relatedInt(inBucket.length, locale) }),
      amount: eur(total, locale),
      group: t("fx.related.g.other_buckets", { year: f.year }),
    });
  }
  rows.push({ href: `/france/paris/marches/contrats/${f.year}`, label: t("fx.related.marches.year", { year: f.year }), sub: t("fx.related.marches.year_sub"), group: t("fx.related.g.context") });
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Domain fiche: the section door, the six largest other domains of the same
 *  year (each with its fiche), the year's index. */
export function domaineRelated(f: MarchesDomaineFiche, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  // The two overview doors first, in one group; then the other domains.
  const rows: RelatedRow[] = [
    marchesSectionRow("paris", f.year, locale),
    { href: `/france/paris/marches/contrats/${f.year}`, label: t("fx.related.marches.year", { year: f.year }), sub: t("fx.related.marches.year_sub"), group: t("fx.related.g.context") },
  ];
  const idx = readDataJsonOrNull<{ availableYears?: number[] }>(cityJsonPath("paris", "marches-publics/index.json"));
  const currentYear = new Date().getFullYear();
  const latest = Math.max(...(idx?.availableYears ?? [0]).filter((y) => y < currentYear));
  for (const d of marchesDomainesOfYear("paris", f.year).filter((d) => d.slug !== f.slug && d.count > 0).slice(0, 6)) {
    rows.push({
      href: `/france/paris/marches/domaine/${d.slug}${f.year === latest ? "" : `-${f.year}`}`,
      label: domaineLabel(d.slug, locale),
      sub: t("fx.related.domaine.peer_sub", { n: relatedInt(d.count, locale) }),
      amount: eur(d.amount, locale),
      group: t("fx.related.g.other_domaines", { year: f.year }),
    });
  }
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Bailleur: the other operators the City guarantees, then the two hubs. */
export function bailleurRelated(slug: string, locale: L, hasSectionLine = false): RelatedBlock | null {
  const t = relatedT(locale);
  const idx = readDataJsonOrNull<{ latestYear: number }>("hors_bilan_index.json");
  const hb = idx
    ? readDataJsonOrNull<{ year: number; top_beneficiaires: { name: string; capital_restant: number; count_emprunts: number }[] }>(
        `hors_bilan_${idx.latestYear}.json`,
      )
    : null;
  const me = canonicalBailleurSlug(decodeURIComponent(slug));
  const peers = t("fx.related.g.other_bailleurs", { year: hb?.year ?? "" });
  const context = t("fx.related.g.context");
  const rows: RelatedRow[] = (hb?.top_beneficiaires ?? [])
    .filter((b) => canonicalBailleurSlug(b.name) !== me)
    .slice(0, 5)
    .map((b) => ({
      href: `/france/paris/dette/bailleur/${canonicalBailleurSlug(b.name)}`,
      label: displayOrgName(b.name),
      sub: locale === "en" ? `${b.count_emprunts.toLocaleString("en-GB")} loans guaranteed` : `${b.count_emprunts.toLocaleString("fr-FR")} emprunts garantis`,
      amount: eur(b.capital_restant, locale),
      group: peers,
    }));
  // The debt door only when the fiche's first screen does not already carry it.
  if (!hasSectionLine) rows.push(detteSectionRow(null, locale));
  rows.push({ ...logementSectionRow(null, locale), group: context });
  return { title: t("fx.related.title"), sub: null, rows };
}

type Patrimoine = {
  year: number;
  structure_dette: { instruments: { key: string; label: string; encours: number; part: number }[] };
  masses_actif: { label: string; value: number; share: number }[];
  masses_passif: { label: string; value: number; share: number }[];
};

/** Debt instrument: its siblings in the same year, then the debt hub. */
export function instrumentRelated(key: string, year: number, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const doc = readDataJsonOrNull<Patrimoine>(`patrimoine_structure_${year}.json`);
  if (!doc) return null;
  const peers = t("fx.related.g.other_instruments", { year });
  const rows: RelatedRow[] = doc.structure_dette.instruments
    .filter((i) => i.key !== key)
    .map((i) => ({
      href: `/france/paris/dette/instrument/${i.key}${year ? `?year=${year}` : ""}`,
      label: trLabel(i.label, locale),
      sub: locale === "en" ? `${Math.round(i.part * 100)}% of the financial debt` : `${Math.round(i.part * 100)} % de la dette financière`,
      amount: eur(i.encours, locale),
      group: peers,
    }));
  rows.push({ href: "/france/paris/dette", label: locale === "en" ? "The City of Paris's debt" : "La dette de la Ville de Paris", sub: locale === "en" ? "All instruments, the balance sheet and the guarantees" : "Tous les instruments, le bilan et les garanties", group: t("fx.related.g.context") });
  rows.push(...budgetRows((spec) => spec.page === "dette", locale, 2));
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Balance-sheet item: the other items on the same side, then the hub. */
export function masseRelated(slug: string, year: number, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const doc = readDataJsonOrNull<Patrimoine>(`patrimoine_structure_${year}.json`);
  if (!doc) return null;
  const all = [
    ...doc.masses_actif.map((m) => ({ ...m, side: "actif" as const })),
    ...doc.masses_passif.map((m) => ({ ...m, side: "passif" as const })),
  ];
  const me = all.find((m) => slugifyLabel(m.label) === slug);
  const peers = t("fx.related.g.same_side", { year });
  const rows: RelatedRow[] = all
    .filter((m) => slugifyLabel(m.label) !== slug && (!me || m.side === me.side))
    .map((m) => ({
      href: `/france/paris/dette/masse/${slugifyLabel(m.label)}${year ? `?year=${year}` : ""}`,
      label: trLabel(m.label, locale),
      sub: locale === "en" ? `${(m.share * 100).toFixed(1)}% of ${m.side === "actif" ? "assets" : "liabilities"}` : `${(m.share * 100).toFixed(1).replace(".", ",")} % ${m.side === "actif" ? "de l'actif" : "du passif"}`,
      amount: eur(m.value, locale),
      group: peers,
    }));
  rows.push({ href: "/france/paris/dette", label: locale === "en" ? "The City of Paris's balance sheet and debt" : "Le bilan et la dette de la Ville de Paris", sub: locale === "en" ? "Assets, liabilities, instruments and guarantees" : "Actif, passif, instruments et garanties", group: t("fx.related.g.context") });
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Investment chapter: the other chapters of the same year, then the hub. */
export function chapitreRelated(slug: string, year: number, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const trends = readDataJsonOrNull<{ years: { year: number; par_chapitre?: { label: string; depenses: number }[] }[] }>("investissement_tendances.json");
  const y = trends?.years.find((x) => x.year === year) ?? trends?.years[trends.years.length - 1];
  if (!y?.par_chapitre) return null;
  const peers = t("fx.related.g.other_chapitres", { year: y.year });
  const rows: RelatedRow[] = y.par_chapitre
    .filter((c) => slugifyChapitre(c.label) !== slug)
    .sort((a, b) => b.depenses - a.depenses)
    .slice(0, 5)
    .map((c) => ({
      href: `/france/paris/investissements/chapitre/${slugifyChapitre(c.label)}${year ? `?year=${year}` : ""}`,
      label: trLabel(c.label, locale),
      amount: eur(c.depenses, locale),
      group: peers,
    }));
  rows.push(investSectionRow(y.year, locale));
  rows.push(...budgetRows((spec) => spec.chapitre === slug, locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Association: the theme page and its other big recipients, plus the hub. */
export function associationRelated(asso: { name: string; theme: string | null; section?: unknown }, city: string, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const context = t("fx.related.g.context");
  const rows: RelatedRow[] = [];
  const base = `/france/${city}/subventions`;
  let themeRow: RelatedRow | null = null;
  if (asso.theme) {
    const slug = slugifyLabel(asso.theme);
    const fiche = loadThemeSubventions(slug, undefined, city);
    if (fiche) {
      const peers = t("fx.related.g.same_theme", { year: fiche.year });
      for (const b of fiche.topBeneficiaires.filter((b) => b.name !== asso.name).slice(0, 4)) {
        rows.push({ href: `${base}/association/${assocSlug(b.name)}`, label: displayOrgName(b.name), amount: eur(b.amount, locale), group: peers });
      }
      themeRow = {
        href: `${base}/theme/${slug}`,
        label: locale === "en" ? `All ${trLabel(asso.theme, locale).toLowerCase()} grants, ${fiche.year}` : `Toutes les subventions ${asso.theme.toLowerCase()}, ${fiche.year}`,
        sub: locale === "en" ? `${fiche.nbBeneficiaires.toLocaleString("en-GB")} recipients that year` : `${fiche.nbBeneficiaires.toLocaleString("fr-FR")} bénéficiaires cette année-là`,
        amount: eur(fiche.total, locale),
        group: context,
      };
    }
  }
  if (themeRow) rows.push(themeRow);
  // Only when the fiche has no section line in its first screen.
  if (!asso.section) rows.push(subventionsSectionRow(city, null, locale));
  const theme = asso.theme;
  if (city === "paris" && theme) rows.push(...budgetRows((spec) => (spec.themes ?? []).includes(theme), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/** Contract: the supplier's other contracts, its category, and the hub. */
export function contratRelated(
  c: { numero: string; fournisseurSiret: string; fournisseur: string; categorie: string; year: number },
  city: string,
  locale: L,
): RelatedBlock | null {
  const t = relatedT(locale);
  const context = t("fx.related.g.context");
  const rows: RelatedRow[] = [];
  const base = `/france/${city}/marches`;
  const siren = (c.fournisseurSiret ?? "").replace(/\s/g, "").slice(0, 9);
  if (/^\d{9}$/.test(siren)) {
    const f = loadFournisseur(siren, city);
    if (f) {
      for (const k of f.contrats.filter((x) => x.numero !== c.numero).sort((a, b) => b.montant - a.montant).slice(0, 3)) {
        rows.push({
          href: `${base}/contrat/${encodeURIComponent(k.numero)}`,
          // Sans texte clair, le libellé brut de la source arrive tel quel à
          // l'écran : « SA4 ACBC TVX ETANCHEITE/VEGETAL.BAT.ADM./LOCAUX
          // PROF.LOT1 ». Toutes les autres fiches passent par normalizeObjet ;
          // ce repli-ci l'avait oublié.
          label: (locale === "en" ? k.objetClairEn || k.objetClair : k.objetClair) || rowObjet(k.objet, 96).title,
          sub: locale === "en" ? `Signed in ${k.year}` : `Signé en ${k.year}`,
          amount: eur(k.montant, locale),
          group: t("fx.related.g.same_supplier"),
        });
      }
      rows.push({
        href: `${base}/fournisseur/${siren}`,
        label: locale === "en" ? `Every contract of ${displayOrgName(f.nom)}` : `Tous les marchés de ${displayOrgName(f.nom)}`,
        sub: locale === "en" ? `${f.contratCount.toLocaleString("en-GB")} contracts with the City` : `${f.contratCount.toLocaleString("fr-FR")} marchés avec la Ville`,
        amount: eur(f.totalAmount, locale),
        group: context,
      });
    }
  }
  if (city === "paris" && c.categorie) {
    rows.push({
      href: `${base}/categorie/${slugifyLabel(c.categorie)}`,
      label: locale === "en" ? `${trLabel(c.categorie, locale)} contracts, ${c.year}` : `Les marchés ${c.categorie.toLowerCase()}, ${c.year}`,
      sub: locale === "en" ? "The category's biggest contracts and suppliers" : "Les plus gros contrats et titulaires de la catégorie",
      group: context,
    });
  }
  rows.push(marchesSectionRow(city, c.year, locale));
  if (city === "paris" && c.categorie) rows.push(...budgetRows((spec) => (spec.categories ?? []).some((x) => slugifyLabel(x) === slugifyLabel(c.categorie)), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

type MarcheLite = { objet?: string; fournisseur_nom?: string; fournisseur_siret?: string; montant_max?: number; categorie_libelle?: string; nature?: string };

/**
 * Supplier: the other suppliers of its main category in the year it last
 * worked in it, that category's fiche when the city has one (`categoryHref`,
 * set by the route that owns the sibling category route), and the hub. Peers
 * are aggregated by SIREN — the key the supplier route resolves — so every
 * row lands on a fiche.
 */
export function fournisseurRelated(
  f: FournisseurFiche,
  city: string,
  locale: L,
  categoryHref?: (category: string) => string,
): RelatedBlock | null {
  const t = relatedT(locale);
  const base = `/france/${city}/marches`;
  const rows: RelatedRow[] = [];
  const main = f.byCategory.slice().sort((a, b) => b.amount - a.amount)[0];
  if (main) {
    const year = Math.max(...f.contrats.filter((c) => c.categorie === main.category).map((c) => c.year));
    const file = Number.isFinite(year)
      ? readDataJsonOrNull<{ data?: MarcheLite[]; marches?: MarcheLite[] }>(cityJsonPath(city, `marches-publics/marches_${year}.json`))
      : null;
    const peers = new Map<string, { name: string; amount: number }>();
    const peerRows = file?.data ?? file?.marches ?? [];
    // Un lot partagé ne range aucune entreprise parmi les pairs (voir lotInfo).
    const peerLots = lotInfo(peerRows);
    for (const [i, r] of peerRows.entries()) {
      if ((r.categorie_libelle || r.nature || "Autres") !== main.category) continue;
      if (peerLots[i].holders > 1) continue;
      const siren = (r.fournisseur_siret ?? "").replace(/\s/g, "").slice(0, 9);
      if (!/^\d{9}$/.test(siren) || siren === f.siren || !r.fournisseur_nom || r.fournisseur_nom === "MARCHE MULTIATTRIBUTAIRE") continue;
      const cur = peers.get(siren) ?? { name: r.fournisseur_nom, amount: 0 };
      cur.amount += Number(r.montant_max ?? 0);
      peers.set(siren, cur);
    }
    const cat = trLabel(main.category, locale);
    for (const [siren, p] of [...peers.entries()].filter(([, p]) => p.amount > 0).sort((a, b) => b[1].amount - a[1].amount).slice(0, 4)) {
      rows.push({
        href: `${base}/fournisseur/${siren}`,
        label: displayOrgName(p.name),
        amount: eur(p.amount, locale),
        group: t("fx.related.g.same_category", { cat, year }),
      });
    }
    if (categoryHref) {
      rows.push({
        href: categoryHref(main.category),
        label: t("fx.related.fourn.category", { cat }),
        sub: t("fx.related.fourn.category_sub"),
        group: t("fx.related.g.context"),
      });
    }
  }
  const lastYear = Math.max(...f.contrats.map((c) => c.year));
  rows.push(Number.isFinite(lastYear)
    ? marchesSectionRow(city, lastYear, locale)
    : { href: base, label: t("fx.related.marches.hub", { city: getCity(city)?.nom ?? city }), sub: t("fx.related.marches.hub_sub"), group: t("fx.related.g.context") });
  if (city === "paris" && main) rows.push(...budgetRows((spec) => (spec.categories ?? []).some((x) => slugifyLabel(x) === slugifyLabel(main.category)), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

type ProjetLite = { id: string; arrondissement: number; chapitre_libelle?: string; nom_projet: string; montant: number };

/**
 * Investment project: the other projects of its arrondissement that year (or
 * of its chapter, for a Paris-wide project), that list page, the
 * arrondissement and chapter fiches. The projects already shown under
 * "similar projects" are left out, so the block adds pages rather than
 * repeating the fiche.
 */
export function projetRelated(p: ProjetFiche, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/france/paris/investissements";
  // The way up sits in the first screen (the line under the number). Only a
  // fiche without that line repeats it here — never both (2026-09-16).
  const rows: RelatedRow[] = p.section ? [] : [investSectionRow(p.year, locale)];
  const arr = p.arrondissement;
  const ord = arr > 0 ? (locale === "en" ? ordEn(arr) : ordFr(arr)) : "";
  const cohort = readDataJsonOrNull<{ data: ProjetLite[] }>(`map/investissements_complet_${p.year}.json`)
    ?? readDataJsonOrNull<{ data: ProjetLite[] }>(`map/investissements_localises_${p.year}.json`);
  const shown = new Set([p.id, ...p.similaires.map((s) => s.id)]);
  const peers = (cohort?.data ?? [])
    .filter((x) => !shown.has(x.id) && Number(x.montant ?? 0) > 0)
    .filter((x) => (arr > 0 ? Number(x.arrondissement) === arr : (Number(x.arrondissement) || 0) === 0 && x.chapitre_libelle === p.chapitre))
    .sort((a, b) => Number(b.montant) - Number(a.montant))
    .slice(0, 3);
  for (const x of peers) {
    rows.push({
      href: `${base}/projet/${encodeURIComponent(x.id)}`,
      label: (locale === "en" ? getProjetNameEn(x.id) : null) || x.nom_projet,
      amount: eur(Number(x.montant), locale),
      group: arr > 0 ? t("fx.related.g.same_arr_year", { year: p.year }) : t("fx.related.g.same_chap_year", { year: p.year }),
    });
  }
  rows.push({
    href: `${base}/projets/${p.year}/${arr > 0 ? arr : 0}`,
    label: arr > 0 ? t("fx.related.projet.list_arr", { arr: ord, year: p.year }) : t("fx.related.projet.list_paris", { year: p.year }),
    sub: t("fx.related.projet.list_sub"),
    group: t("fx.related.g.context"),
  });
  if (arr > 0 && loadArrondissement(arr)) {
    rows.push({ href: `${base}/arrondissement/${arr}`, label: t("fx.related.projet.arr", { arr: ord }), sub: t("fx.related.projet.arr_sub"), group: t("fx.related.g.context") });
  }
  const m57 = serviceToM57(p.chapitre);
  const chap = m57 ? loadChapitre(slugifyChapitre(m57)) : null;
  if (chap) {
    rows.push({ href: `${base}/chapitre/${chap.slug}`, label: t("fx.related.projet.chap", { chap: trLabel(chap.label, locale).toLowerCase() }), sub: t("fx.related.projet.chap_sub", { year: chap.year }), amount: eur(chap.total, locale), group: t("fx.related.g.context") });
  }
  if (chap) rows.push(...budgetRows((spec) => spec.chapitre === chap.slug, locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/**
 * Place: the other places of its arrondissement that the "same kind" block
 * above does not already show (most City money first), the arrondissement's
 * investment fiche, and the map of every place.
 */
export function lieuRelated(lieu: LieuFicheData, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/france/paris";
  const rows: RelatedRow[] = [];
  const arr = lieu.arrondissement;
  const ord = arr > 0 ? (locale === "en" ? ordEn(arr) : ordFr(arr)) : "";
  if (arr > 0) {
    const shown = new Set([lieu.slug, ...lieuxVoisins(lieu.slug, lieu.famille, arr).voisins.map((l) => l.slug)]);
    for (const l of loadLieuxIndex()
      .filter((l) => l.arrondissement === arr && !shown.has(l.slug))
      .sort((a, b) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || (b.n_lieu ?? 0) - (a.n_lieu ?? 0))
      .slice(0, 3)) {
      rows.push({
        href: `${base}/lieu/${l.slug}`,
        label: l.name,
        group: t("fx.related.g.same_arr"),
        amount: (l.argent_total_eur ?? 0) > 0 ? eur(l.argent_total_eur ?? 0, locale) : null,
      });
    }
    if (loadArrondissement(arr)) {
      rows.push({ href: `${base}/investissements/arrondissement/${arr}`, label: t("fx.related.projet.arr", { arr: ord }), sub: t("fx.related.projet.arr_sub"), group: t("fx.related.g.context") });
    }
  }
  rows.push({ href: `${base}/lieux`, label: t("fx.related.lieu.hub"), sub: t("fx.related.lieu.hub_sub"), group: t("fx.related.g.context") });
  rows.push(...budgetRows((spec) => (spec.lieux ?? []).includes(lieu.famille), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/**
 * Contract category (Paris): the other categories of the same year, the list
 * of that year's contracts and the hub. A category slug resolves on the most
 * recent year that carries it, so the row says which year its amount is for.
 */
export function categorieRelated(f: MarcheCategorieFiche, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/france/paris/marches";
  const file = readDataJsonOrNull<{ data?: MarcheLite[]; marches?: MarcheLite[] }>(`marches-publics/marches_${f.year}.json`);
  const cats = new Map<string, { label: string; amount: number; n: number }>();
  // Un lot gagné par plusieurs entreprises compte une fois (voir sumLots).
  const catRows = file?.data ?? file?.marches ?? [];
  const repeats = lotRepeatFlags(catRows);
  for (const [i, r] of catRows.entries()) {
    const label = r.categorie_libelle || r.nature || "Autres";
    const slug = slugifyLabel(label);
    if (slug === f.slug) continue;
    const cur = cats.get(slug) ?? { label, amount: 0, n: 0 };
    cur.amount += repeats[i] ? 0 : Number(r.montant_max ?? 0);
    cur.n += 1;
    cats.set(slug, cur);
  }
  const rows: RelatedRow[] = [...cats.entries()]
    .filter(([, c]) => c.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 4)
    .map(([slug, c]) => ({
      href: `${base}/categorie/${slug}`,
      label: trLabel(c.label, locale),
      sub: t("fx.related.categorie.peer_sub", { n: relatedInt(c.n, locale), year: f.year }),
      amount: eur(c.amount, locale),
      group: t("fx.related.g.other_categories", { year: f.year }),
    }));
  rows.push(marchesSectionRow("paris", f.year, locale));
  rows.push({ href: `${base}/contrats/${f.year}`, label: t("fx.related.marches.year", { year: f.year }), sub: t("fx.related.marches.year_sub"), group: t("fx.related.g.context") });
  rows.push(...budgetRows((spec) => (spec.categories ?? []).some((x) => slugifyLabel(x) === f.slug), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/**
 * Grants theme: the other themes of the same year (the loader folds every
 * "Social - …" theme into the "social" fiche, so those are not listed as its
 * neighbours), and the hub.
 */
export function themeRelated(f: ThemeSubventionsFiche, city: string, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = `/france/${city}/subventions`;
  const file = readDataJsonOrNull<{ data: { beneficiaire: string; thematique?: string | null; montant_total: number }[] }>(cityJsonPath(city, `subventions/beneficiaires_${f.year}.json`));
  const themes = new Map<string, { label: string; amount: number; names: Set<string> }>();
  for (const r of file?.data ?? []) {
    if (!r.thematique) continue;
    const slug = slugifyLabel(r.thematique);
    if (slug === f.slug || (f.slug === "social" && r.thematique.toLowerCase().startsWith("social"))) continue;
    const cur = themes.get(slug) ?? { label: r.thematique, amount: 0, names: new Set<string>() };
    cur.amount += r.montant_total;
    cur.names.add(r.beneficiaire);
    themes.set(slug, cur);
  }
  const rows: RelatedRow[] = [...themes.entries()]
    .filter(([, x]) => x.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 5)
    .map(([slug, x]) => ({
      href: `${base}/theme/${slug}`,
      label: trLabel(x.label, locale),
      sub: t("fx.related.theme.peer_sub", { n: relatedInt(x.names.size, locale), year: f.year }),
      amount: eur(x.amount, locale),
      group: t("fx.related.g.other_themes", { year: f.year }),
    }));
  rows.push(subventionsSectionRow(city, f.year, locale));
  if (city === "paris") rows.push(...budgetRows((spec) => (spec.themes ?? []).includes(f.theme), locale));
  return { title: t("fx.related.title"), sub: null, rows };
}

/**
 * Budget item: the other items on the same side of the same year's budget
 * (read off the sankey the item route resolves against, same year pinned in
 * the link), then the budget page.
 */
export function posteRelated(p: BudgetPosteFiche, city: string, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = `/france/${city}/budget`;
  const sk = readDataJsonOrNull<{ nodes?: { name: string; category?: string }[]; links: { source: string; target: string; value: number }[] }>(cityJsonPath(city, `budget_sankey_${p.year}.json`));
  const central = sk?.nodes?.find((n) => n.category === "central")?.name;
  const rows: RelatedRow[] = [];
  if (sk && central) {
    const siblings = sk.links
      .filter((l) => (p.kind === "depense" ? l.source === central : l.target === central) && l.value > 0)
      .map((l) => ({ label: p.kind === "depense" ? l.target : l.source, value: l.value }))
      .filter((x) => slugifyLabel(x.label) !== p.slug)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    for (const x of siblings) {
      rows.push({
        href: `${base}/poste/${slugifyLabel(x.label)}?year=${p.year}`,
        label: trLabel(x.label, locale),
        amount: eur(x.value, locale),
        group: t("fx.related.g.other_postes", { year: p.year }),
      });
    }
  }
  rows.push({ href: `${base}?year=${p.year}`, label: t("fx.related.poste.hub", { city: getCity(city)?.nom ?? city, year: p.year }), sub: t("fx.related.poste.hub_sub"), group: t("fx.related.g.context") });
  return { title: t("fx.related.title"), sub: null, rows };
}

type ArrLens = "invest" | "logement" | "garanties";
const ARR_BASE = "/france/paris";
/** 1–4 are merged into "Paris Centre" by the housing and guarantee fiches. */
const CENTRE = [1, 2, 3, 4];
/** The page of arrondissement `n` in a lens, when its loader resolves it. */
function arrHref(lens: ArrLens, n: number): string | null {
  if (lens === "invest") return loadArrondissement(n) ? `${ARR_BASE}/investissements/arrondissement/${n}` : null;
  if (lens === "logement") return loadArrondissementLogement(String(n)) ? `${ARR_BASE}/logement/arrondissement/${n}` : null;
  return loadArrondissementGaranties(n) ? `${ARR_BASE}/dette/garanties/arrondissement/${n}` : null;
}
/** Paris Centre's page in a lens, when that lens has one. */
function centreHref(lens: ArrLens): string | null {
  if (lens === "logement") return loadArrondissementLogement(PARIS_CENTRE_SLUG) ? `${ARR_BASE}/logement/arrondissement/${PARIS_CENTRE_SLUG}` : null;
  if (lens === "garanties") return loadArrondissementGaranties(0) ? `${ARR_BASE}/dette/garanties/arrondissement/0` : null;
  return null;
}

/**
 * Arrondissement fiche (investment, social housing, guaranteed loans): the
 * same arrondissement in the two other lenses, the previous and next
 * arrondissements that have a page in this lens, and the lens hub. Every href
 * is resolved through the loader of its route — the three lenses do not cover
 * the same arrondissements (Paris Centre is merged in two of them).
 */
export function arrondissementRelated(lens: ArrLens, key: number | "centre", locale: L, hasSectionLine = false): RelatedBlock | null {
  const t = relatedT(locale);
  const where = (k: number | "centre") => (k === "centre" ? t("fx.related.arr.centre") : t("fx.related.arr.where", { arr: locale === "en" ? ordEn(k) : ordFr(k) }));
  const row = (l: ArrLens, href: string, k: number | "centre", sub?: string): RelatedRow => ({ href, label: t(`fx.related.arr.${l}`, { where: where(k) }), sub: sub ?? t(`fx.related.arr.${l}_sub`) });
  const rows: RelatedRow[] = [];
  for (const other of (["invest", "logement", "garanties"] as ArrLens[]).filter((l) => l !== lens)) {
    if (key === "centre") {
      const c = centreHref(other);
      if (c) rows.push(row(other, c, "centre"));
      else for (const n of CENTRE) { const h = arrHref(other, n); if (h) rows.push(row(other, h, n)); }
    } else {
      const h = arrHref(other, key);
      const c = !h && CENTRE.includes(key) ? centreHref(other) : null;
      if (h) rows.push(row(other, h, key));
      else if (c) rows.push(row(other, c, "centre"));
    }
  }
  // The lens's own list, in the order its hub shows it: Paris Centre first
  // where the lens merges 1–4, then the arrondissements that have a page.
  const merged = lens !== "invest" && centreHref(lens) != null;
  const seq: (number | "centre")[] = [
    ...(merged ? ["centre" as const] : []),
    ...[...Array(20).keys()].map((i) => i + 1).filter((n) => !(merged && CENTRE.includes(n)) && arrHref(lens, n)),
  ];
  const at = seq.indexOf(merged && key !== "centre" && CENTRE.includes(key) ? "centre" : key);
  const hrefOf = (k: number | "centre") => (k === "centre" ? centreHref(lens)! : arrHref(lens, k)!);
  const out = rows.slice(0, 4).map((r) => ({ ...r, group: t("fx.related.g.other_lenses") }));
  if (at > 0) out.push({ ...row(lens, hrefOf(seq[at - 1]), seq[at - 1], t("fx.related.arr.prev")), group: t("fx.related.g.prev_next") });
  if (at >= 0 && at < seq.length - 1) out.push({ ...row(lens, hrefOf(seq[at + 1]), seq[at + 1], t("fx.related.arr.next")), group: t("fx.related.g.prev_next") });
  if (!hasSectionLine) {
    if (lens === "invest") {
      out.push({ ...investSectionRow(null, locale), group: t("fx.related.g.context") });
    } else if (lens === "logement") {
      out.push({ ...logementSectionRow(null, locale), group: t("fx.related.g.context") });
    } else {
      out.push({ ...detteSectionRow(null, locale), group: t("fx.related.g.context") });
    }
  }
  return { title: t("fx.related.title"), sub: null, rows: out };
}

/**
 * Place of the Marseille places export (its own shape, no money index): the
 * other places of the same arrondissement, then of the same family, then the
 * places map.
 */
export function marseilleLieuRelated(place: MarseillePlace, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/france/marseille";
  const others = loadMarseillePlaces().filter((p) => p.slug !== place.slug);
  const ord = (n: number) => (locale === "en" ? ordEn(n) : ordFr(n));
  const sameArr = place.arrondissement ? others.filter((p) => p.arrondissement === place.arrondissement) : [];
  const sameFam = others.filter((p) => p.famille === place.famille && !sameArr.includes(p));
  const rows: RelatedRow[] = [
    ...sameArr.map((p) => ({ href: `${base}/lieu/${p.slug}`, label: p.name, sub: t("fx.related.mlieu.same_arr", { kind: locale === "en" ? p.kind_en : p.kind_fr, arr: ord(place.arrondissement!) }) })),
    ...sameFam.map((p) => ({ href: `${base}/lieu/${p.slug}`, label: p.name, sub: t("fx.related.mlieu.same_fam", { kind: locale === "en" ? p.kind_en : p.kind_fr }) })),
  ].slice(0, 5);
  rows.push({ href: `${base}/lieux`, label: t("fx.related.mlieu.hub"), sub: t("fx.related.mlieu.hub_sub") });
  return { title: t("fx.related.title"), sub: t("fx.related.mlieu.block_sub"), rows };
}

/** Kind of spending (Paris budget): the other kinds of the same year, then the budget page. */
export function natureRelated(n: BudgetNatureFiche, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/france/paris/budget";
  const rows: RelatedRow[] = NATURE_GROUPS
    .filter((g) => g.key !== n.key)
    .map((g) => loadBudgetNature(g.key, n.year))
    .filter((x): x is BudgetNatureFiche => x != null && x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((x) => ({
      href: `${base}/nature/${x.key}?year=${n.year}`,
      label: NATURE_LABELS[x.key][locale],
      amount: eur(x.total, locale),
      group: t("fx.related.g.other_natures", { year: n.year }),
    }));
  rows.push({ href: `${base}?year=${n.year}`, label: t("fx.related.poste.hub", { city: "Paris", year: n.year }), sub: t("fx.related.poste.hub_sub"), group: t("fx.related.g.context") });
  return { title: t("fx.related.title"), sub: null, rows };
}
