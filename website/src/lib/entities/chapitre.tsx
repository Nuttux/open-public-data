import { ChapitreFiche } from "@/components/fusion";
import { InvestBackKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { numLocale } from "@/lib/fmt";
import { loadChapitre } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { eur, int, ordFr, ordEn, dataDate, sourceLine, clip } from "@/lib/entities/seo-text";
import { chapitreRelated } from "@/lib/entities/related";

type D = { chap: NonNullable<ReturnType<typeof loadChapitre>> };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

export const chapitreConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const chap = loadChapitre(slug);
    if (!chap) return null;
    return { chap };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Chapter not found — Qipu" : "Chapitre introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ chap: c }, locale) => {
    const canonical = `/fr/city/paris/investissements/chapitre/${c.slug}`;
    const labelEn = trLabel(c.label, locale);
    const totalFmt = c.total.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${labelEn} — Paris investments ${c.year} · Qipu`
      : `${c.label} — Investissements ${c.year} · Qipu`;
    const description = locale === "en"
      ? `Ville de Paris investments in the ${labelEn} chapter, fiscal year ${c.year}. ${c.nbProjets} projects, €${totalFmt} total.`
      : `Investissements de la Ville de Paris dans le chapitre ${c.label}, exercice ${c.year}. ${c.nbProjets} projets, ${totalFmt} € au total.`;
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
  seo: ({ chap: c }, locale) => {
  const amt = eur(c.total, locale);
  const label = trLabel(c.label, locale);
  const date = dataDate("investissement_tendances.json", locale);
  if (locale === "en") {
    return {
      title: `Paris ${clip(label, 30)} investment ${c.year}: ${amt}`,
      answer: `In ${c.year}, the City of Paris budgeted ${amt} of investment in the ${label.toLowerCase()} chapter (${ordEn(c.rank)} of ${c.nbChapitres} chapters), with ${int(c.nbProjets, "en")} localised projects. ${sourceLine("en", "City of Paris, administrative account (M57) and localised investments", date)}`,
    };
  }
  return {
    title: `Investissements ${clip(c.label, 30)} à Paris ${c.year} : ${amt}`,
    answer: `En ${c.year}, la Ville de Paris a inscrit ${amt} d'investissements au chapitre ${c.label.toLowerCase()} (${ordFr(c.rank)} chapitre sur ${c.nbChapitres}), avec ${int(c.nbProjets, "fr")} projets localisés. ${sourceLine("fr", "Ville de Paris, compte administratif (M57) et investissements localisés", date)}`,
  };
  },
  related: ({ chap: c }, locale) => chapitreRelated(c.slug, c.year, locale),
  page: {
    header: ({ chap }) => (
      <>
        <InvestBackKicker />
        <h1 className="fx-page-title">{chap.label}</h1>
      </>
    ),
    body: ({ chap }) => <ChapitreFiche chap={chap} />,
  },
  drawer: {
    kicker: ({ chap }, locale) => relatedT(locale)("fx.drawer.kicker.chapitre", { year: chap.year }),
    title: ({ chap }, locale) => trLabel(chap.label, locale),
    shareUrl: ({ chap }) => `/fr/city/paris/investissements/chapitre/${chap.slug}`,
    shareText: ({ chap }) =>
      `${chap.label} — ${fmtEur(chap.total)} investis en ${chap.year} par la Ville de Paris · ${chap.nbProjets} projets`,
    backHref: () => "/fr/city/paris/investissements",
    breadcrumbLabel: ({ chap }) => chap.label,
    children: ({ chap }) => <ChapitreFiche chap={chap} />,
  },
};
