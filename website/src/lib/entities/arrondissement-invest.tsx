import { ArrondissementFiche } from "@/components/fusion";
import { InvestBackKicker, ArrInvestTitleAndLede } from "@/components/fusion/EntityPageHeaders";
import LieuxLies from "@/components/fusion/LieuxLies";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale, sufOrdinal } from "@/lib/fmt";
import { loadArrondissement } from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";

type D = {
  arr: NonNullable<ReturnType<typeof loadArrondissement>>;
  arrNum: number;
  lieuxArr: ReturnType<typeof loadLieuxIndex>;
};

const sufFr = (n: number) => (n === 1 ? "er" : "ᵉ");
const sufEn = (n: number) => {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
};

const suf = (n: number) => sufOrdinal(n, "fr");

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

export const arrondissementInvestConfig: EntityPageConfig<D> = {
  load: ({ num }) => {
    const arrNum = parseInt(num, 10);
    const arr = loadArrondissement(arrNum);
    if (!arr) return null;
    // Lieux couverts dans cet arrondissement — rattachement déterministe (pas de
    // juge) : l'arrondissement est la seule clé partagée sûre lieu↔section.
    const lieuxArr = loadLieuxIndex()
      .filter((l) => l.arrondissement === arrNum)
      .sort((a, b) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || (a.depuis ?? 9999) - (b.depuis ?? 9999));
    return { arr, arrNum, lieuxArr };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Arrondissement not found — France Open Data" : "Arrondissement introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ arr: a }, locale) => {
    const canonical = `/fr/city/paris/investissements/arrondissement/${a.arr}`;
    const arrLabel = locale === "en"
      ? `${a.arr}${sufEn(a.arr)} arrondissement`
      : `${a.arr}${sufFr(a.arr)} arrondissement`;
    const totalFmt = a.total.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${arrLabel} — Paris investments ${a.year} · France Open Data`
      : `${arrLabel} — Investissements ${a.year} · France Open Data`;
    const description = locale === "en"
      ? `Investment projects in Paris's ${arrLabel}, fiscal year ${a.year}. ${a.nbProjets} projects, €${totalFmt} total.`
      : `Projets d'investissement dans le ${arrLabel} de Paris, exercice ${a.year}. ${a.nbProjets} projets, ${totalFmt} € au total.`;
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
    header: ({ arr }) => (
      <>
        <InvestBackKicker />
        <ArrInvestTitleAndLede arr={arr.arr} />
      </>
    ),
    body: ({ arr, arrNum, lieuxArr }, locale) => {
      const arrLabel = `${arrNum}${arrNum === 1 ? (locale === "en" ? "st" : "er") : (locale === "en" ? "th" : "e")}`;
      return (
        <>
          <ArrondissementFiche arr={arr} />
          <LieuxLies
            lieux={lieuxArr}
            title={locale === "en" ? `Places in the ${arrLabel}` : `Lieux du ${arrLabel}`}
            intro={locale === "en"
              ? "Places in this district with their own fiche — deliberations, archives and public money."
              : "Lieux de cet arrondissement dotés d’une fiche — délibérations, archives et argent public."}
            locale={locale}
          />
        </>
      );
    },
  },
  drawer: {
    kicker: ({ arr }) => <>Arrondissement · Investissement · {arr.year}</>,
    title: ({ arr }) => `${arr.arr}${suf(arr.arr)} arrondissement`,
    shareUrl: ({ arr }) => `/fr/city/paris/investissements/arrondissement/${arr.arr}`,
    shareText: ({ arr }) =>
      `${arr.arr}${suf(arr.arr)} arrondissement de Paris — ${fmtEur(arr.total)} investis en ${arr.year} sur ${arr.nbProjets} projets`,
    backHref: () => "/fr/city/paris/investissements",
    breadcrumbLabel: ({ arr }) => `${arr.arr}${suf(arr.arr)} arr.`,
    children: ({ arr, lieuxArr }) => (
      <>
        <ArrondissementFiche arr={arr} />
        <LieuxLies
          lieux={lieuxArr}
          title={`Lieux du ${arr.arr}${suf(arr.arr)}`}
          intro="Lieux de cet arrondissement dotés d’une fiche — délibérations, archives et argent public."
          locale="fr"
        />
      </>
    ),
  },
};
