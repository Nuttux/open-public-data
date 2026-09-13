import ArrondissementGarantiesFiche from "@/components/fusion/ArrondissementGarantiesFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { fmtBillions, fmtInt, fmtMillions } from "@/lib/fmt";
import { loadArrondissementGaranties } from "@/lib/fusion-data";
import { eur, int, dataDate, sourceLine } from "@/lib/entities/seo-text";
import { arrondissementRelated } from "@/lib/entities/related";

type D = NonNullable<ReturnType<typeof loadArrondissementGaranties>> & {
  /** Année explicitement demandée via ?year= — propagée dans les liens. */
  requestedYear: number | undefined;
};

const fmtEur = (v: number) =>
  v >= 1e9 ? `${fmtBillions(v)} Md €` : `${fmtMillions(v, 0)} M €`;

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

/** num 0 = fiche virtuelle Paris Centre (arr 1-4 fusionnés depuis 2020). */
const whereFr = (n: number) =>
  n === 0 ? "Paris Centre (1er–4ᵉ)" : `${n}${suf(n)} arrondissement de Paris`;
const whereEn = (n: number) => {
  if (n === 0) return "Paris Centre (1st–4th)";
  const s = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `Paris's ${n}${s} arrondissement`;
};

export const arrondissementGarantiesConfig: EntityPageConfig<D> = {
  load: ({ num }, sp) => {
    const n = parseInt(num, 10);
    if (!Number.isInteger(n)) return null;
    const requestedYear = sp.year ? Number(sp.year) : undefined;
    const d = loadArrondissementGaranties(n, requestedYear);
    if (!d) return null;
    return { ...d, requestedYear };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Arrondissement not found — Qipu" : "Arrondissement introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ arr, year }, locale) => {
    const canonical = `/fr/city/paris/dette/garanties/arrondissement/${arr.arr}`;
    const amount = locale === "en"
      ? (arr.capital_restant >= 1e9 ? `€${fmtBillions(arr.capital_restant)}Bn` : `€${fmtMillions(arr.capital_restant, 0)}M`)
      : fmtEur(arr.capital_restant);
    const title = locale === "en"
      ? `${whereEn(arr.arr)} — Loan guarantees ${year} · Qipu`
      : `${whereFr(arr.arr)} — Garanties d'emprunt ${year} · Qipu`;
    const description = locale === "en"
      ? `Loans guaranteed by the Ville de Paris in ${whereEn(arr.arr)}: ${amount} outstanding at end ${year} across ${fmtInt(arr.count_emprunts)} loans, mostly social housing.`
      : `Emprunts garantis par la Ville de Paris dans le ${whereFr(arr.arr)} : ${amount} de capital restant dû au 31.12.${year}, ${fmtInt(arr.count_emprunts)} emprunts, essentiellement logement social.`;
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
  seo: ({ arr, year }, locale) => {
  const amt = eur(arr.capital_restant, locale);
  const n = arr.count_emprunts;
  const date = dataDate(`hors_bilan_${year}.json`, locale);
  if (locale === "en") {
    return {
      title: `${whereEn(arr.arr)}: ${amt} of loans guaranteed by the City of Paris (${year})`,
      answer: `${whereEn(arr.arr)}: at the end of ${year}, the City of Paris guarantees ${amt} of outstanding loans there, across ${int(n, "en")} loan${n > 1 ? "s" : ""}, mostly for social housing. ${sourceLine("en", "opendata.paris.fr (guaranteed debt)", date)}`,
    };
  }
  return {
    title: `${whereFr(arr.arr)} : ${amt} d'emprunts garantis par la Ville de Paris (${year})`,
    answer: `${whereFr(arr.arr)} : fin ${year}, la Ville de Paris y garantit ${amt} d'emprunts (${int(n, "fr")} emprunt${n > 1 ? "s" : ""}), essentiellement pour le logement social. ${sourceLine("fr", "opendata.paris.fr (dette garantie)", date)}`,
  };
  },
  related: ({ arr }, locale) => arrondissementRelated("garanties", arr.arr === 0 ? "centre" : arr.arr, locale),
  page: {
    header: ({ arr, year }) => (
      <>
        <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
          Garanties d'emprunt · {year} · Ville de Paris
        </div>
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
          {whereFr(arr.arr)}
        </h1>
      </>
    ),
    body: ({ arr, year }) => <ArrondissementGarantiesFiche arr={arr} year={year} />,
  },
  drawer: {
    kicker: () => (
      <span className="fx-kicker-mono">Arrondissement · garanties d'emprunt</span>
    ),
    title: ({ arr }) => whereFr(arr.arr),
    shareUrl: ({ arr, requestedYear }) =>
      `/fr/city/paris/dette/garanties/arrondissement/${arr.arr}${requestedYear ? `?year=${requestedYear}` : ""}`,
    shareText: ({ arr, year }) =>
      `${whereFr(arr.arr)} — ${fmtEur(arr.capital_restant)} d'emprunts garantis par la Ville de Paris au 31.12.${year} (${fmtInt(arr.count_emprunts)} emprunts).`,
    backHref: ({ requestedYear }) =>
      requestedYear
        ? `/fr/city/paris/dette?year=${requestedYear}#sec-hors-bilan`
        : "/fr/city/paris/dette#sec-hors-bilan",
    breadcrumbLabel: ({ arr }) => (arr.arr === 0 ? "Paris Centre" : `${arr.arr}${suf(arr.arr)} arr.`),
    children: ({ arr, year }) => <ArrondissementGarantiesFiche arr={arr} year={year} />,
  },
};
