import { BudgetBackKicker } from "@/components/fusion/EntityPageHeaders";
import PosteFiche from "@/components/fusion/PosteFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadBudgetPoste } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { eur, pct, int, ordFr, ordEn, sourceLine, clip } from "@/lib/entities/seo-text";
import { posteRelated } from "@/lib/entities/related";

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
    title: locale === "en" ? "Item not found — Qipu" : "Poste introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ poste: p }, locale) => {
    const canonical = `/fr/city/paris/budget/poste/${p.slug}`;
    const labelEn = trLabel(p.label, locale);
    const kindLabel = locale === "en"
      ? (p.kind === "depense" ? "expense" : "revenue")
      : (p.kind === "depense" ? "dépense" : "recette");
    const title = locale === "en"
      ? `${labelEn} — Paris budget ${p.year} · Qipu`
      : `${p.label} — Budget ${p.year} · Qipu`;
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
  seo: ({ poste: p }, locale) => {
  const amt = eur(p.total, locale);
  const label = trLabel(p.label, locale);
  const dep = p.kind === "depense";
  const share = pct(p.shareOfKindPct, locale);
  const perHab = int(Math.round(p.perHabitant), locale);
  const voted = p.typeBudget === "vote";
  if (locale === "en") {
    return {
      title: `${clip(label, 36)}: ${amt} in the Paris ${p.year} budget`,
      answer: `In ${p.year}, ${label} ${dep ? "costs" : "brings in"} ${amt}, ${share} of the City of Paris's ${voted ? "voted" : "actual"} ${dep ? "spending" : "revenue"} (${ordEn(p.rank)} of ${p.nbPostes} items), €${perHab} per inhabitant. ${sourceLine("en", "opendata.paris.fr (administrative accounts and primary budgets, M57)", null)}`,
    };
  }
  return {
    title: `${clip(p.label, 36)} : ${amt} au budget ${p.year} de Paris`,
    answer: `En ${p.year}, ${p.label} ${dep ? "coûte" : "rapporte"} ${amt}, soit ${share} des ${dep ? "dépenses" : "recettes"} ${voted ? "votées" : "exécutées"} de la Ville de Paris (${ordFr(p.rank)} poste sur ${p.nbPostes}), ${perHab} € par habitant. ${sourceLine("fr", "opendata.paris.fr (comptes administratifs et budgets primitifs, M57)", null)}`,
  };
  },
  related: ({ poste }, locale) => posteRelated(poste, "paris", locale),
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
