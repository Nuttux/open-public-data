import { ChapitreFiche } from "@/components/fusion";
import { InvestBackKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale } from "@/lib/fmt";
import { loadChapitre } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";

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
    title: locale === "en" ? "Chapter not found — France Open Data" : "Chapitre introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ chap: c }, locale) => {
    const canonical = `/fr/city/paris/investissements/chapitre/${c.slug}`;
    const labelEn = trLabel(c.label, locale);
    const totalFmt = c.total.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${labelEn} — Paris investments ${c.year} · France Open Data`
      : `${c.label} — Investissements ${c.year} · France Open Data`;
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
    kicker: ({ chap }) => <>Chapitre · Investissement · {chap.year}</>,
    title: ({ chap }) => chap.label,
    shareUrl: ({ chap }) => `/fr/city/paris/investissements/chapitre/${chap.slug}`,
    shareText: ({ chap }) =>
      `${chap.label} — ${fmtEur(chap.total)} investis en ${chap.year} par la Ville de Paris · ${chap.nbProjets} projets`,
    backHref: () => "/fr/city/paris/investissements",
    breadcrumbLabel: ({ chap }) => chap.label,
    children: ({ chap }) => <ChapitreFiche chap={chap} />,
  },
};
