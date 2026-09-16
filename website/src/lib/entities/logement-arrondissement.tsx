import { ArrondissementLogementFiche } from "@/components/fusion";
import { LogementArrKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { loadArrondissementLogement, PARIS_CENTRE_SLUG } from "@/lib/fusion-data";
import { pct, int, ordFr, ordEn, sourceLine } from "@/lib/entities/seo-text";
import { arrondissementRelated } from "@/lib/entities/related";

type D = { data: NonNullable<ReturnType<typeof loadArrondissementLogement>> };

const isValidSlug = (s: string) => {
  if (s === PARIS_CENTRE_SLUG) return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 20;
};

export const logementArrondissementConfig: EntityPageConfig<D> = {
  load: ({ arr }) => {
    if (!isValidSlug(arr)) return null;
    const data = loadArrondissementLogement(arr);
    if (!data) return null;
    return { data };
  },
  // Avant le refacto, la page renvoyait `{}` (pas de title/robots) quand le
  // slug était invalide ou introuvable — on préserve tel quel.
  notFoundMetadata: () => ({}),
  metadata: ({ data }, locale) => {
    const canonical = `/france/paris/logement/arrondissement/${data.slug}`;
    const title = locale === "en"
      ? `${data.label} · social housing — Qipu`
      : `${data.label} · logement social — Qipu`;
    const description = locale === "en"
      ? `Funded social-housing operations · ${data.label} · Paris.`
      : `Opérations de logement social financées · ${data.label} · Paris.`;
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
  seo: ({ data: d }, locale) => {
  const n = d.totalLogements;
  const share = pct(d.shareCity, locale, 0);
  if (locale === "en") {
    return {
      title: `Social housing, ${d.label}: ${int(n, "en")} homes funded by the City of Paris in ${d.year}`,
      answer: `${d.label}: in ${d.year}, the City of Paris funded ${int(n, "en")} social homes there (${int(d.nbOperations, "en")} operations), ${share} of its output that year (${ordEn(d.rank)} among the arrondissements). ${sourceLine("en", "opendata.paris.fr (funded social housing)", null)}`,
    };
  }
  return {
    title: `Logement social, ${d.label} : ${int(n, "fr")} logements financés par la Ville de Paris en ${d.year}`,
    answer: `${d.label} : en ${d.year}, la Ville de Paris y a financé ${int(n, "fr")} logements sociaux (${int(d.nbOperations, "fr")} opérations), soit ${share} de sa production de l'année (${ordFr(d.rank)} arrondissement). ${sourceLine("fr", "opendata.paris.fr (logements sociaux financés)", null)}`,
  };
  },
  related: ({ data }, locale) => arrondissementRelated("logement", data.slug === PARIS_CENTRE_SLUG ? "centre" : Number(data.slug), locale, data.section != null),
  page: {
    header: ({ data }) => (
      <>
        <div className="fx-page-kicker">
          <LogementArrKicker year={data.year} />
        </div>
        <h1 className="fx-page-title">{data.label}</h1>
      </>
    ),
    bodyWrapper: "none",
    body: ({ data }) => (
      <section className="fx-section">
        <div className="fx-wrap">
          <ArrondissementLogementFiche data={data} topN={data.projects.length} />
        </div>
      </section>
    ),
  },
  drawer: {
    kicker: ({ data }, locale) => relatedT(locale)("fx.drawer.kicker.arrondissement", { year: data.year }),
    title: ({ data }, locale) => {
      if (locale !== "en") return data.label;
      const n = Number(data.slug);
      return Number.isInteger(n) ? `${ordEn(n)} arrondissement` : relatedT(locale)("fx.drawer.paris_centre");
    },
    shareUrl: ({ data }) => `/france/paris/logement/arrondissement/${data.slug}`,
    backHref: () => "/france/paris/logement",
    breadcrumbLabel: ({ data }) => data.label,
    children: ({ data }) => <ArrondissementLogementFiche data={data} />,
  },
};
