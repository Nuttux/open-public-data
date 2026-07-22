import MasseFiche from "@/components/fusion/MasseFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import { loadPatrimoineMasse } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";

type D = NonNullable<ReturnType<typeof loadPatrimoineMasse>> & {
  /** Année explicitement demandée via ?year= — propagée dans les liens. */
  requestedYear: number | undefined;
};

const fmtEur = (v: number) =>
  v >= 1e9 ? `${fmtBillions(v)} Md €` : `${fmtMillions(v, 0)} M €`;

export const masseConfig: EntityPageConfig<D> = {
  load: ({ slug }, sp) => {
    const requestedYear = sp.year ? Number(sp.year) : undefined;
    const d = loadPatrimoineMasse(slug, requestedYear);
    if (!d) return null;
    return { ...d, requestedYear };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Balance-sheet item not found — Qipu" : "Masse du bilan introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ masse, year, slug }, locale) => {
    const canonical = `/fr/city/paris/dette/masse/${slug}`;
    const label = trLabel(masse.label, locale);
    const amount = locale === "en"
      ? (masse.value >= 1e9 ? `€${fmtBillions(masse.value)}Bn` : `€${fmtMillions(masse.value, 0)}M`)
      : fmtEur(masse.value);
    const sideLabel = locale === "en"
      ? (masse.side === "actif" ? "assets" : "liabilities")
      : masse.side;
    const title = locale === "en"
      ? `${label} — Paris balance sheet ${year} · Qipu`
      : `${label} — Bilan ${year} · Qipu`;
    const description = locale === "en"
      ? `${label}: ${amount}, ${fmtDec(masse.share * 100, 1)}% of ${sideLabel} on the Ville de Paris ${year} balance sheet.`
      : `${label} : ${amount}, soit ${fmtDec(masse.share * 100, 1)} % du ${sideLabel} au bilan ${year} de la Ville de Paris.`;
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
    header: ({ masse, year }) => (
      <>
        <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
          {masse.side === "actif" ? "Actif" : "Passif"} · Bilan {year} · Ville de Paris
        </div>
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
          {masse.label}
        </h1>
      </>
    ),
    body: ({ masse, year }) => <MasseFiche masse={masse} year={year} />,
  },
  drawer: {
    kicker: ({ masse, year }) => (
      <span className="fx-kicker-mono">
        {masse.tag} · {fmtDec(masse.share * 100, 1)} % {masse.side === "actif" ? "de l'actif" : "du passif"} · Bilan {year}
      </span>
    ),
    title: ({ masse }) => `${masse.label} · ${fmtEur(masse.value)}`,
    shareUrl: ({ slug, requestedYear }) =>
      `/fr/city/paris/dette/masse/${slug}${requestedYear ? `?year=${requestedYear}` : ""}`,
    shareText: ({ masse, year }) =>
      `${masse.label} — ${fmtEur(masse.value)} au bilan ${year} de la Ville de Paris (${fmtDec(masse.share * 100, 1)} % du ${masse.side}).`,
    backHref: ({ requestedYear }) =>
      requestedYear
        ? `/fr/city/paris/dette?year=${requestedYear}#sec-bilan`
        : "/fr/city/paris/dette#sec-bilan",
    breadcrumbLabel: ({ masse }) => masse.label,
    children: ({ masse, year }) => <MasseFiche masse={masse} year={year} />,
  },
};
