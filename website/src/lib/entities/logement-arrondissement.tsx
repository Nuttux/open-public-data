import { ArrondissementLogementFiche } from "@/components/fusion";
import { LogementArrKicker, LogementArrBackLink } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadArrondissementLogement, PARIS_CENTRE_SLUG } from "@/lib/fusion-data";

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
    const canonical = `/fr/city/paris/logement/arrondissement/${data.slug}`;
    const title = locale === "en"
      ? `${data.label} · social housing — France Open Data`
      : `${data.label} · logement social — France Open Data`;
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
  page: {
    header: ({ data }) => (
      <>
        <div className="fx-page-kicker">
          <LogementArrKicker year={data.year} />
        </div>
        <h1 className="fx-page-title">{data.label}</h1>
        <LogementArrBackLink />
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
    kicker: ({ data }) => (
      <span
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Logement social · {data.year}
      </span>
    ),
    title: ({ data }) => data.label,
    shareUrl: ({ data }) => `/fr/city/paris/logement/arrondissement/${data.slug}`,
    backHref: () => "/fr/city/paris/logement",
    breadcrumbLabel: ({ data }) => data.label,
    children: ({ data }) => <ArrondissementLogementFiche data={data} />,
  },
};
