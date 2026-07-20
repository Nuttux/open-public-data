import { BudgetBackKicker } from "@/components/fusion/EntityPageHeaders";
import PosteFiche from "@/components/fusion/PosteFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadBudgetPoste } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";

type D = {
  poste: NonNullable<ReturnType<typeof loadBudgetPoste>>;
  year: number | undefined;
};

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md €`;
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString("fr-FR")} M €`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

export const posteConfig: EntityPageConfig<D> = {
  load: ({ slug }, sp) => {
    const year = sp.year ? Number(sp.year) : undefined;
    const poste = loadBudgetPoste(slug, year);
    if (!poste) return null;
    return { poste, year };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Item not found — France Open Data" : "Poste introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ poste: p }, locale) => {
    const canonical = `/fr/city/paris/budget/poste/${p.slug}`;
    const labelEn = trLabel(p.label, locale);
    const kindLabel = locale === "en"
      ? (p.kind === "depense" ? "expense" : "revenue")
      : (p.kind === "depense" ? "dépense" : "recette");
    const title = locale === "en"
      ? `${labelEn} — Paris budget ${p.year} · France Open Data`
      : `${p.label} — Budget ${p.year} · France Open Data`;
    const description = locale === "en"
      ? `${labelEn} — Paris budget ${kindLabel} for fiscal year ${p.year}. ${p.subPostes.length} sub-items detailed.`
      : `${p.label} — ${kindLabel} du budget de Paris pour l'exercice ${p.year}. ${p.subPostes.length} sous-postes détaillés.`;
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
    header: ({ poste, year }) => (
      <>
        <BudgetBackKicker href={year ? `/fr/city/paris/budget?year=${year}` : "/fr/city/paris/budget"} />
        <h1 className="fx-page-title">{poste.label}</h1>
      </>
    ),
    body: ({ poste }) => <PosteFiche poste={poste} />,
  },
  drawer: {
    kicker: ({ poste }) => {
      const kindLabel = poste.kind === "depense" ? "Dépense" : "Recette";
      return <>{kindLabel} · Budget {poste.year}</>;
    },
    title: ({ poste }) => poste.label,
    shareUrl: ({ poste, year }) =>
      `/fr/city/paris/budget/poste/${poste.slug}${year ? `?year=${year}` : ""}`,
    shareText: ({ poste }) => {
      const kindLabel = poste.kind === "depense" ? "Dépense" : "Recette";
      return `${poste.label} — ${fmtEur(poste.total)} (${poste.year}, ${kindLabel.toLowerCase()}) · ${poste.subPostes.length} sous-postes.`;
    },
    backHref: ({ year }) =>
      year ? `/fr/city/paris/budget?year=${year}` : "/fr/city/paris/budget",
    breadcrumbLabel: ({ poste }) => poste.label,
    children: ({ poste }) => <PosteFiche poste={poste} />,
  },
};
