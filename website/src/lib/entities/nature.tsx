import { BudgetBackKicker } from "@/components/fusion/EntityPageHeaders";
import NatureFiche from "@/components/fusion/NatureFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadBudgetNature } from "@/lib/fusion-data";
import { NATURE_LABELS } from "@/lib/budget-natures";
import { eur, pct, int, ordFr, ordEn, sourceLine } from "@/lib/entities/seo-text";
import { natureRelated } from "@/lib/entities/related";

type D = {
  nature: NonNullable<ReturnType<typeof loadBudgetNature>>;
  year: number | undefined;
};

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md €`;
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString("fr-FR")} M €`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

/**
 * Fiche de nature (2026-09-09) — le transposé de la fiche de poste. Le poste
 * dit à quoi sert l'argent ; la nature dit sous quelle forme il sort
 * (salaires, subventions, chantiers…) et, poste par poste, où il va.
 */
export const natureConfig: EntityPageConfig<D> = {
  load: ({ slug }, sp) => {
    const year = sp.year ? Number(sp.year) : undefined;
    const nature = loadBudgetNature(slug, year);
    if (!nature) return null;
    return { nature, year };
  },
  metadata: ({ nature: n }, locale) => {
    const canonical = `/fr/city/paris/budget/nature/${n.key}`;
    const label = NATURE_LABELS[n.key][locale === "en" ? "en" : "fr"];
    const title = locale === "en"
      ? `${label} — Paris budget ${n.year} · Qipu`
      : `${label} — Budget ${n.year} · Qipu`;
    const description = locale === "en"
      ? `${label} in the City of Paris budget ${n.year}: how much, and which items it goes to.`
      : `${label} au budget ${n.year} de la Ville de Paris : combien, et dans quels postes.`;
    return {
      title,
      description,
      alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
      openGraph: {
        title,
        description,
        type: "article",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  seo: ({ nature: n }, locale) => {
    const amt = eur(n.total, locale);
    const share = pct(n.shareOfDepensesPct, locale);
    const perHab = int(Math.round(n.perHabitant), locale);
    const voted = n.typeBudget === "vote";
    const top = n.byPoste[0];
    if (locale === "en") {
      const label = NATURE_LABELS[n.key].en;
      return {
        title: `${label}: ${amt} in the City of Paris ${n.year} budget`,
        answer: `In ${n.year}, ${label.toLowerCase()} come to ${amt}, ${share} of the City of Paris's ${voted ? "voted" : "actual"} spending (${ordEn(n.rank)} of ${n.nbNatures} kinds of spending), €${perHab} per inhabitant${top ? `, the largest share going to ${top.label} (${eur(top.value, locale)})` : ""}. ${sourceLine("en", "opendata.paris.fr (administrative accounts and primary budgets, M57)", null)}`,
      };
    }
    const label = NATURE_LABELS[n.key].fr;
    const low = label.toLowerCase();
    const les = `les ${low}`;
    // « nature » est féminin : 1re, 2e, 3e…
    const rankFr = n.rank === 1 ? "1re" : ordFr(n.rank);
    return {
      title: `${label} : ${amt} au budget ${n.year} de la Ville de Paris`,
      answer: `En ${n.year}, ${les} représentent ${amt}, soit ${share} des dépenses ${voted ? "votées" : "exécutées"} de la Ville de Paris (${rankFr} nature de dépense sur ${n.nbNatures}), ${perHab} € par habitant${top ? `, la plus grosse part allant à ${top.label} (${eur(top.value, locale)})` : ""}. ${sourceLine("fr", "opendata.paris.fr (comptes administratifs et budgets primitifs, M57)", null)}`,
    };
  },
  related: ({ nature }, locale) => natureRelated(nature, locale),
  page: {
    header: ({ nature, year }, locale) => (
      <>
        <BudgetBackKicker href={year ? `/fr/city/paris/budget?year=${year}` : "/fr/city/paris/budget"} />
        <h1 className="fx-page-title">{NATURE_LABELS[nature.key][locale === "en" ? "en" : "fr"]}</h1>
      </>
    ),
    body: ({ nature }) => <NatureFiche nature={nature} />,
  },
  drawer: {
    usesLocale: true,
    kicker: ({ nature }, locale) => <>{locale === "en" ? "Kind of spending" : "Nature de dépense"} · Budget {nature.year}</>,
    title: ({ nature }, locale) => NATURE_LABELS[nature.key][locale === "en" ? "en" : "fr"],
    shareUrl: ({ nature, year }) => `/fr/city/paris/budget/nature/${nature.key}${year ? `?year=${year}` : ""}`,
    shareText: ({ nature }, locale) => `${NATURE_LABELS[nature.key][locale === "en" ? "en" : "fr"]} — ${fmtEur(nature.total)} (${nature.year}) · ${nature.byPoste.length} postes.`,
    backHref: ({ year }) => (year ? `/fr/city/paris/budget?year=${year}` : "/fr/city/paris/budget"),
    breadcrumbLabel: ({ nature }, locale) => NATURE_LABELS[nature.key][locale === "en" ? "en" : "fr"],
    children: ({ nature }) => <NatureFiche nature={nature} />,
  },
};
