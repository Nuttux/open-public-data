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
import { relatedT } from "@/lib/related-t";
import { canonicalBailleurSlug, getProjetNameEn, loadArrondissement, loadChapitre, loadFournisseur, loadThemeSubventions, type FournisseurFiche, type ProjetFiche } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { serviceToM57, slugifyChapitre, slugifyLabel } from "@/lib/projet-utils";
import { ordEn, ordFr } from "@/lib/entities/seo-text";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { assocSlug } from "@/lib/assoc-slug";
import { lieuxVoisins, loadLieuxIndex, type LieuFicheData } from "@/lib/lieux-data";

type L = "fr" | "en";
const FMT = { fr: makeFmt("fr"), en: makeFmt("en") };
/** Montant compact dans la langue de la fiche (« 4,76 Md € » / « 4.76 €B »). */
const eur = (n: number, locale: L) => {
  const c = FMT[locale].fmtCompactEur(n);
  return { v: c.value, u: c.unit };
};

/** Bailleur: the other operators the City guarantees, then the two hubs. */
export function bailleurRelated(slug: string, locale: L): RelatedBlock | null {
  const idx = readDataJsonOrNull<{ latestYear: number }>("hors_bilan_index.json");
  const hb = idx
    ? readDataJsonOrNull<{ year: number; top_beneficiaires: { name: string; capital_restant: number; count_emprunts: number }[] }>(
        `hors_bilan_${idx.latestYear}.json`,
      )
    : null;
  const me = canonicalBailleurSlug(decodeURIComponent(slug));
  const rows: RelatedRow[] = (hb?.top_beneficiaires ?? [])
    .filter((b) => canonicalBailleurSlug(b.name) !== me)
    .slice(0, 5)
    .map((b) => ({
      href: `/fr/city/paris/dette/bailleur/${canonicalBailleurSlug(b.name)}`,
      label: b.name,
      sub: locale === "en" ? `${b.count_emprunts.toLocaleString("en-GB")} loans guaranteed, end ${hb?.year}` : `${b.count_emprunts.toLocaleString("fr-FR")} emprunts garantis, fin ${hb?.year}`,
      amount: eur(b.capital_restant, locale),
    }));
  rows.push(
    { href: "/fr/city/paris/logement", label: locale === "en" ? "Social housing in Paris" : "Le logement social à Paris", sub: locale === "en" ? "The homes financed each year, by arrondissement and operator" : "Les logements financés chaque année, par arrondissement et par bailleur" },
    { href: "/fr/city/paris/dette", label: locale === "en" ? "The City of Paris's debt" : "La dette de la Ville de Paris", sub: locale === "en" ? "Balance sheet, financial debt and every guarantee" : "Bilan, dette financière et l'ensemble des garanties" },
  );
  return {
    title: locale === "en" ? "See also" : "Voir aussi",
    sub: locale === "en" ? "The other operators the City guarantees, and the pages that put this one in context." : "Les autres bailleurs garantis par la Ville, et les pages qui situent celui-ci.",
    rows,
  };
}

type Patrimoine = {
  year: number;
  structure_dette: { instruments: { key: string; label: string; encours: number; part: number }[] };
  masses_actif: { label: string; value: number; share: number }[];
  masses_passif: { label: string; value: number; share: number }[];
};

/** Debt instrument: its siblings in the same year, then the debt hub. */
export function instrumentRelated(key: string, year: number, locale: L): RelatedBlock | null {
  const doc = readDataJsonOrNull<Patrimoine>(`patrimoine_structure_${year}.json`);
  if (!doc) return null;
  const rows: RelatedRow[] = doc.structure_dette.instruments
    .filter((i) => i.key !== key)
    .map((i) => ({
      href: `/fr/city/paris/dette/instrument/${i.key}${year ? `?year=${year}` : ""}`,
      label: trLabel(i.label, locale),
      sub: locale === "en" ? `${Math.round(i.part * 100)}% of the financial debt at end ${year}` : `${Math.round(i.part * 100)} % de la dette financière fin ${year}`,
      amount: eur(i.encours, locale),
    }));
  rows.push({ href: "/fr/city/paris/dette", label: locale === "en" ? "The City of Paris's debt" : "La dette de la Ville de Paris", sub: locale === "en" ? "All instruments, the balance sheet and the guarantees" : "Tous les instruments, le bilan et les garanties" });
  return { title: locale === "en" ? "See also" : "Voir aussi", sub: locale === "en" ? `The other instruments of the ${year} debt.` : `Les autres instruments de la dette ${year}.`, rows };
}

/** Balance-sheet item: the other items on the same side, then the hub. */
export function masseRelated(slug: string, year: number, locale: L): RelatedBlock | null {
  const doc = readDataJsonOrNull<Patrimoine>(`patrimoine_structure_${year}.json`);
  if (!doc) return null;
  const all = [
    ...doc.masses_actif.map((m) => ({ ...m, side: "actif" as const })),
    ...doc.masses_passif.map((m) => ({ ...m, side: "passif" as const })),
  ];
  const me = all.find((m) => slugifyLabel(m.label) === slug);
  const rows: RelatedRow[] = all
    .filter((m) => slugifyLabel(m.label) !== slug && (!me || m.side === me.side))
    .map((m) => ({
      href: `/fr/city/paris/dette/masse/${slugifyLabel(m.label)}${year ? `?year=${year}` : ""}`,
      label: trLabel(m.label, locale),
      sub: locale === "en" ? `${(m.share * 100).toFixed(1)}% of ${m.side === "actif" ? "assets" : "liabilities"}, ${year}` : `${(m.share * 100).toFixed(1).replace(".", ",")} % ${m.side === "actif" ? "de l'actif" : "du passif"}, ${year}`,
      amount: eur(m.value, locale),
    }));
  rows.push({ href: "/fr/city/paris/dette", label: locale === "en" ? "The City of Paris's balance sheet and debt" : "Le bilan et la dette de la Ville de Paris", sub: locale === "en" ? "Assets, liabilities, instruments and guarantees" : "Actif, passif, instruments et garanties" });
  return { title: locale === "en" ? "See also" : "Voir aussi", sub: locale === "en" ? `The other items on the same side of the ${year} balance sheet.` : `Les autres masses du même côté du bilan ${year}.`, rows };
}

/** Investment chapter: the other chapters of the same year, then the hub. */
export function chapitreRelated(slug: string, year: number, locale: L): RelatedBlock | null {
  const trends = readDataJsonOrNull<{ years: { year: number; par_chapitre?: { label: string; depenses: number }[] }[] }>("investissement_tendances.json");
  const y = trends?.years.find((x) => x.year === year) ?? trends?.years[trends.years.length - 1];
  if (!y?.par_chapitre) return null;
  const rows: RelatedRow[] = y.par_chapitre
    .filter((c) => slugifyChapitre(c.label) !== slug)
    .sort((a, b) => b.depenses - a.depenses)
    .slice(0, 6)
    .map((c) => ({
      href: `/fr/city/paris/investissements/chapitre/${slugifyChapitre(c.label)}${year ? `?year=${year}` : ""}`,
      label: trLabel(c.label, locale),
      sub: locale === "en" ? `Investment chapter, ${y.year}` : `Chapitre d'investissement, ${y.year}`,
      amount: eur(c.depenses, locale),
    }));
  rows.push({ href: "/fr/city/paris/investissements", label: locale === "en" ? "The City of Paris's investments" : "Les investissements de la Ville de Paris", sub: locale === "en" ? "Every chapter, every arrondissement, the map of projects" : "Tous les chapitres, tous les arrondissements, la carte des projets" });
  return { title: locale === "en" ? "See also" : "Voir aussi", sub: locale === "en" ? `The other chapters of ${y.year} investment.` : `Les autres chapitres d'investissement ${y.year}.`, rows };
}

/** Association: the theme page and its other big recipients, plus the hub. */
export function associationRelated(asso: { name: string; theme: string | null }, city: string, locale: L): RelatedBlock | null {
  const rows: RelatedRow[] = [];
  const base = `/fr/city/${city}/subventions`;
  if (asso.theme) {
    const slug = slugifyLabel(asso.theme);
    const fiche = loadThemeSubventions(slug, undefined, city);
    if (fiche) {
      rows.push({
        href: `${base}/theme/${slug}`,
        label: locale === "en" ? `All ${trLabel(asso.theme, locale).toLowerCase()} grants, ${fiche.year}` : `Toutes les subventions ${asso.theme.toLowerCase()}, ${fiche.year}`,
        sub: locale === "en" ? `${fiche.nbBeneficiaires.toLocaleString("en-GB")} recipients that year` : `${fiche.nbBeneficiaires.toLocaleString("fr-FR")} bénéficiaires cette année-là`,
        amount: eur(fiche.total, locale),
      });
      for (const b of fiche.topBeneficiaires.filter((b) => b.name !== asso.name).slice(0, 4)) {
        rows.push({
          href: `${base}/association/${assocSlug(b.name)}`,
          label: b.name,
          sub: locale === "en" ? `Same theme, ${fiche.year}` : `Même thème, ${fiche.year}`,
          amount: eur(b.amount, locale),
        });
      }
    }
  }
  rows.push({ href: base, label: locale === "en" ? "Who receives the City's grants" : "Qui reçoit les subventions de la Ville", sub: locale === "en" ? "Every recipient, by theme and by year" : "Tous les bénéficiaires, par thème et par année" });
  return { title: locale === "en" ? "See also" : "Voir aussi", sub: locale === "en" ? "The theme this recipient belongs to, and its other main recipients." : "Le thème de ce bénéficiaire, et ses autres principaux bénéficiaires.", rows };
}

/** Contract: the supplier's other contracts, its category, and the hub. */
export function contratRelated(
  c: { numero: string; fournisseurSiret: string; fournisseur: string; categorie: string; year: number },
  city: string,
  locale: L,
): RelatedBlock | null {
  const rows: RelatedRow[] = [];
  const base = `/fr/city/${city}/marches`;
  const siren = (c.fournisseurSiret ?? "").replace(/\s/g, "").slice(0, 9);
  if (/^\d{9}$/.test(siren)) {
    const f = loadFournisseur(siren, city);
    if (f) {
      for (const k of f.contrats.filter((x) => x.numero !== c.numero).sort((a, b) => b.montant - a.montant).slice(0, 4)) {
        rows.push({
          href: `${base}/contrat/${encodeURIComponent(k.numero)}`,
          // Sans texte clair, le libellé brut de la source arrive tel quel à
          // l'écran : « SA4 ACBC TVX ETANCHEITE/VEGETAL.BAT.ADM./LOCAUX
          // PROF.LOT1 ». Toutes les autres fiches passent par normalizeObjet ;
          // ce repli-ci l'avait oublié.
          label: (locale === "en" ? k.objetClairEn || k.objetClair : k.objetClair) || normalizeObjet(k.objet),
          sub: locale === "en" ? `Same supplier, ${k.year}` : `Même titulaire, ${k.year}`,
          amount: eur(k.montant, locale),
        });
      }
      rows.push({
        href: `${base}/fournisseur/${siren}`,
        label: locale === "en" ? `Every contract of ${f.nom}` : `Tous les marchés de ${f.nom}`,
        sub: locale === "en" ? `${f.contratCount.toLocaleString("en-GB")} contracts with the City` : `${f.contratCount.toLocaleString("fr-FR")} marchés avec la Ville`,
        amount: eur(f.totalAmount, locale),
      });
    }
  }
  if (city === "paris" && c.categorie) {
    rows.push({
      href: `${base}/categorie/${slugifyLabel(c.categorie)}`,
      label: locale === "en" ? `${trLabel(c.categorie, locale)} contracts, ${c.year}` : `Les marchés ${c.categorie.toLowerCase()}, ${c.year}`,
      sub: locale === "en" ? "The category's biggest contracts and suppliers" : "Les plus gros contrats et titulaires de la catégorie",
    });
  }
  rows.push({ href: base, label: locale === "en" ? "Public contracts of the City" : "Les marchés publics de la Ville", sub: locale === "en" ? "Every contract, by year, category and supplier" : "Tous les contrats, par année, catégorie et titulaire" });
  return { title: locale === "en" ? "See also" : "Voir aussi", sub: locale === "en" ? "The supplier's other contracts and the category this one belongs to." : "Les autres marchés du titulaire et la catégorie de celui-ci.", rows };
}

type MarcheLite = { fournisseur_nom?: string; fournisseur_siret?: string; montant_max?: number; categorie_libelle?: string; nature?: string };

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
  const base = `/fr/city/${city}/marches`;
  const rows: RelatedRow[] = [];
  const main = f.byCategory.slice().sort((a, b) => b.amount - a.amount)[0];
  if (main) {
    const year = Math.max(...f.contrats.filter((c) => c.categorie === main.category).map((c) => c.year));
    const file = Number.isFinite(year)
      ? readDataJsonOrNull<{ data?: MarcheLite[]; marches?: MarcheLite[] }>(cityJsonPath(city, `marches-publics/marches_${year}.json`))
      : null;
    const peers = new Map<string, { name: string; amount: number }>();
    for (const r of file?.data ?? file?.marches ?? []) {
      if ((r.categorie_libelle || r.nature || "Autres") !== main.category) continue;
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
        label: p.name,
        sub: t("fx.related.fourn.peer_sub", { cat, year }),
        amount: eur(p.amount, locale),
      });
    }
    if (categoryHref) {
      rows.push({
        href: categoryHref(main.category),
        label: t("fx.related.fourn.category", { cat }),
        sub: t("fx.related.fourn.category_sub"),
      });
    }
  }
  const nom = getCity(city)?.nom ?? city;
  rows.push({ href: base, label: t("fx.related.marches.hub", { city: nom }), sub: t("fx.related.marches.hub_sub") });
  return {
    title: t("fx.related.title"),
    sub: main ? t("fx.related.fourn.block_sub", { cat: trLabel(main.category, locale).toLowerCase() }) : null,
    rows,
  };
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
  const base = "/fr/city/paris/investissements";
  const rows: RelatedRow[] = [];
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
      sub: arr > 0 ? t("fx.related.projet.peer_arr_sub", { arr: ord, year: p.year }) : t("fx.related.projet.peer_chap_sub", { year: p.year }),
      amount: eur(Number(x.montant), locale),
    });
  }
  rows.push({
    href: `${base}/projets/${p.year}/${arr > 0 ? arr : 0}`,
    label: arr > 0 ? t("fx.related.projet.list_arr", { arr: ord, year: p.year }) : t("fx.related.projet.list_paris", { year: p.year }),
    sub: t("fx.related.projet.list_sub"),
  });
  if (arr > 0 && loadArrondissement(arr)) {
    rows.push({ href: `${base}/arrondissement/${arr}`, label: t("fx.related.projet.arr", { arr: ord }), sub: t("fx.related.projet.arr_sub") });
  }
  const m57 = serviceToM57(p.chapitre);
  const chap = m57 ? loadChapitre(slugifyChapitre(m57)) : null;
  if (chap) {
    rows.push({ href: `${base}/chapitre/${chap.slug}`, label: t("fx.related.projet.chap", { chap: trLabel(chap.label, locale).toLowerCase() }), sub: t("fx.related.projet.chap_sub", { year: chap.year }), amount: eur(chap.total, locale) });
  }
  return {
    title: t("fx.related.title"),
    sub: arr > 0 ? t("fx.related.projet.block_sub_arr", { arr: ord, year: p.year }) : t("fx.related.projet.block_sub_paris", { year: p.year }),
    rows,
  };
}

/**
 * Place: the other places of its arrondissement that the "same kind" block
 * above does not already show (most City money first), the arrondissement's
 * investment fiche, and the map of every place.
 */
export function lieuRelated(lieu: LieuFicheData, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const base = "/fr/city/paris";
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
        sub: t("fx.related.lieu.peer_sub", { arr: ord }),
        amount: (l.argent_total_eur ?? 0) > 0 ? eur(l.argent_total_eur ?? 0, locale) : null,
      });
    }
    if (loadArrondissement(arr)) {
      rows.push({ href: `${base}/investissements/arrondissement/${arr}`, label: t("fx.related.projet.arr", { arr: ord }), sub: t("fx.related.projet.arr_sub") });
    }
  }
  rows.push({ href: `${base}/lieux`, label: t("fx.related.lieu.hub"), sub: t("fx.related.lieu.hub_sub") });
  return {
    title: t("fx.related.title"),
    sub: arr > 0 ? t("fx.related.lieu.block_sub", { arr: ord }) : null,
    rows,
  };
}
