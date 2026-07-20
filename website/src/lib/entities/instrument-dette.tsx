import InstrumentDetteFiche from "@/components/fusion/InstrumentDetteFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { loadInstrumentDette } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";

type D = NonNullable<ReturnType<typeof loadInstrumentDette>> & {
  /** Année explicitement demandée via ?year= — propagée dans les liens. */
  requestedYear: number | undefined;
};

const fmtEur = (v: number) =>
  v >= 1e9 ? `${fmtBillions(v)} Md €` : `${fmtMillions(v, 0)} M €`;

export const instrumentDetteConfig: EntityPageConfig<D> = {
  load: ({ slug }, sp) => {
    const requestedYear = sp.year ? Number(sp.year) : undefined;
    const d = loadInstrumentDette(slug, requestedYear);
    if (!d) return null;
    return { ...d, requestedYear };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Debt instrument not found — France Open Data" : "Instrument de dette introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ instrument, year, slug }, locale) => {
    const canonical = `/fr/city/paris/dette/instrument/${slug}`;
    const label = trLabel(instrument.label, locale);
    const amount = locale === "en"
      ? (instrument.encours >= 1e9 ? `€${fmtBillions(instrument.encours)}Bn` : `€${fmtMillions(instrument.encours, 0)}M`)
      : fmtEur(instrument.encours);
    const title = locale === "en"
      ? `${label} — Ville de Paris debt ${year} · France Open Data`
      : `${label} — Dette Ville de Paris ${year} · France Open Data`;
    const description = locale === "en"
      ? `${label}: ${amount} outstanding at end ${year}, ${fmtInt(instrument.part * 100)}% of the Ville de Paris financial debt.`
      : `${label} : ${amount} d'encours au 31.12.${year}, soit ${fmtInt(instrument.part * 100)} % de la dette financière de la Ville de Paris.`;
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
    header: ({ instrument, year }) => (
      <>
        <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
          Dette financière · {year} · Ville de Paris
        </div>
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
          {instrument.label}
        </h1>
      </>
    ),
    body: ({ instrument, year, bondIssuances }) => (
      <InstrumentDetteFiche instrument={instrument} year={year} bondIssuances={bondIssuances} />
    ),
  },
  drawer: {
    kicker: ({ instrument }) => (
      <span className="fx-kicker-mono">{instrument.tag} · {fmtInt(instrument.part * 100)} % de l'encours</span>
    ),
    title: ({ instrument }) => `${instrument.label} · ${fmtEur(instrument.encours)}`,
    shareUrl: ({ slug, requestedYear }) =>
      `/fr/city/paris/dette/instrument/${slug}${requestedYear ? `?year=${requestedYear}` : ""}`,
    shareText: ({ instrument, year }) =>
      `${instrument.label} — ${fmtEur(instrument.encours)} d'encours au 31.12.${year}, ${fmtInt(instrument.part * 100)} % de la dette de la Ville de Paris (taux moyen ${fmtDec(instrument.taux_moyen_pct, 1)} %).`,
    backHref: ({ requestedYear }) =>
      requestedYear
        ? `/fr/city/paris/dette?year=${requestedYear}#sec-dette`
        : "/fr/city/paris/dette#sec-dette",
    breadcrumbLabel: ({ instrument }) => instrument.label,
    children: ({ instrument, year, bondIssuances }) => (
      <InstrumentDetteFiche instrument={instrument} year={year} bondIssuances={bondIssuances} />
    ),
  },
};
