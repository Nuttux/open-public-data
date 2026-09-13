import CategorieMarcheFiche from "@/components/fusion/CategorieMarcheFiche";
import { DataLabel, DrawerKicker } from "@/components/fusion/DataLabel";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadMarcheCategorie } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { eur, pct, int, dataDate, sourceLine, clip } from "@/lib/entities/seo-text";

type D = { fiche: NonNullable<ReturnType<typeof loadMarcheCategorie>> };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M€`;
  return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
};

export const categorieConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const fiche = loadMarcheCategorie(slug);
    if (!fiche) return null;
    return { fiche };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Category not found — Qipu" : "Catégorie introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ fiche: f }, locale) => {
    const canonical = `/fr/city/paris/marches/categorie/${f.slug}`;
    const categoryLabel = trLabel(f.category, locale);
    const totalM = Math.round(f.total / 1e6);
    const title = locale === "en"
      ? `${categoryLabel} — Paris public contracts ${f.year} · Qipu`
      : `${f.category} — Marchés publics Paris ${f.year} · Qipu`;
    const description = locale === "en"
      ? `${f.nbContrats} contracts for a total of €${totalM}M in the ${categoryLabel} category.`
      : `${f.nbContrats} contrats pour un total de ${totalM} M € dans la catégorie ${f.category}.`;
    return {
      title,
      description,
      alternates: {
        canonical,
        languages: { "fr-FR": canonical, "en-US": canonical },
      },
      openGraph: {
        title,
        description,
        type: "article",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  seo: ({ fiche: f }, locale) => {
  const amt = eur(f.total, locale);
  const cat = trLabel(f.category, locale);
  const date = dataDate("marches-publics/index.json", locale);
  if (locale === "en") {
    return {
      title: `Paris ${clip(cat, 30)} contracts ${f.year}: ${amt}`,
      answer: `In ${f.year}, the City of Paris notified ${int(f.nbContrats, "en")} ${cat.toLowerCase()} contracts to ${int(f.nbTitulaires, "en")} suppliers, for ${amt} (maximum amounts), ${pct(f.shareOfTotalPct, "en")} of the year's contracts. ${sourceLine("en", "DECP via opendata.paris.fr", date)}`,
    };
  }
  return {
    title: `Marchés ${clip(f.category, 30)} à Paris ${f.year} : ${amt}`,
    answer: `En ${f.year}, la Ville de Paris a notifié ${int(f.nbContrats, "fr")} marchés de ${f.category.toLowerCase()} à ${int(f.nbTitulaires, "fr")} titulaires, pour ${amt} (montants maximaux), soit ${pct(f.shareOfTotalPct, "fr")} des marchés de l'année. ${sourceLine("fr", "DECP via opendata.paris.fr", date)}`,
  };
  },
  page: {
    header: ({ fiche }) => (
      <>
        <MarchesBackKicker />
        <h1 className="fx-page-title"><DataLabel value={fiche.category} /></h1>
      </>
    ),
    body: ({ fiche }) => <CategorieMarcheFiche fiche={fiche} />,
  },
  drawer: {
    kicker: ({ fiche }) => <DrawerKicker k="categorie" year={fiche.year} />,
    title: ({ fiche }) => <DataLabel value={fiche.category} />,
    shareUrl: ({ fiche }) => `/fr/city/paris/marches/categorie/${fiche.slug}`,
    shareText: ({ fiche }) =>
      `${fiche.category} — ${fmtEur(fiche.total)} d'enveloppe sur ${fiche.nbContrats} contrats (Paris ${fiche.year})`,
    backHref: () => "/fr/city/paris/marches",
    breadcrumbLabel: ({ fiche }) => fiche.category,
    children: ({ fiche }) => <CategorieMarcheFiche fiche={fiche} />,
  },
};
