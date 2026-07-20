import { DataLabel, DrawerKicker } from "@/components/fusion/DataLabel";
import { SubventionsBackKicker } from "@/components/fusion/EntityPageHeaders";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadThemeSubventions } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";

type D = { fiche: NonNullable<ReturnType<typeof loadThemeSubventions>> };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M€`;
  return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
};

export const themeConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const fiche = loadThemeSubventions(slug);
    if (!fiche) return null;
    return { fiche };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Theme not found — France Open Data" : "Thématique introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ fiche: f }, locale) => {
    const canonical = `/fr/city/paris/subventions/theme/${f.slug}`;
    const themeLabel = trLabel(f.theme, locale);
    const totalM = Math.round(f.total / 1e6);
    const title = locale === "en"
      ? `${themeLabel} — Paris grants ${f.year} · France Open Data`
      : `${f.theme} — Subventions Paris ${f.year} · France Open Data`;
    const description = locale === "en"
      ? `${f.nbBeneficiaires} beneficiaries, ${f.nbSubventions} grants for a total of €${totalM}M in the ${themeLabel} theme.`
      : `${f.nbBeneficiaires} bénéficiaires, ${f.nbSubventions} subventions pour un total de ${totalM} M € dans la thématique ${f.theme}.`;
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
    header: ({ fiche }) => (
      <>
        <SubventionsBackKicker />
        <h1 className="fx-page-title"><DataLabel value={fiche.theme} /></h1>
      </>
    ),
    body: ({ fiche }) => <ThemeFiche fiche={fiche} />,
  },
  drawer: {
    kicker: ({ fiche }) => <DrawerKicker k="theme" year={fiche.year} />,
    title: ({ fiche }) => <DataLabel value={fiche.theme} />,
    shareUrl: ({ fiche }) => `/fr/city/paris/subventions/theme/${fiche.slug}`,
    shareText: ({ fiche }) =>
      `${fiche.theme} — ${fmtEur(fiche.total)} versés en ${fiche.year} à ${fiche.nbBeneficiaires} bénéficiaires par la Ville de Paris`,
    backHref: () => "/fr/city/paris/subventions",
    breadcrumbLabel: ({ fiche }) => fiche.theme,
    children: ({ fiche }) => <ThemeFiche fiche={fiche} />,
  },
};
