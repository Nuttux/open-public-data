/**
 * "See also" rows for the Paris/Marseille fiches that used to be dead ends
 * (components/fiche/RelatedLinks.tsx). Every row is built from an export the
 * fiche route already resolves against, with the slug the loader expects, so
 * a listed link always renders. Titles are given in FR and EN here rather
 * than in the dictionaries: they are server-side and locale-picked once.
 */
import { readDataJsonOrNull } from "@/lib/data/read";
import { makeFmt } from "@/lib/fmt";
import { canonicalBailleurSlug, loadFournisseur, loadThemeSubventions } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { slugifyChapitre, slugifyLabel } from "@/lib/projet-utils";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { assocSlug } from "@/lib/assoc-slug";

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
