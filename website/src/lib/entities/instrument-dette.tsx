import InstrumentDetteFiche from "@/components/fusion/InstrumentDetteFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { loadInstrumentDette } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { eur, pct, int, dataDate, sourceLine } from "@/lib/entities/seo-text";
import { instrumentRelated } from "@/lib/entities/related";

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
    title: locale === "en" ? "Debt instrument not found — Qipu" : "Instrument de dette introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ instrument, year, slug }, locale) => {
    const canonical = `/fr/city/paris/dette/instrument/${slug}`;
    const label = trLabel(instrument.label, locale);
    const amount = locale === "en"
      ? (instrument.encours >= 1e9 ? `€${fmtBillions(instrument.encours)}Bn` : `€${fmtMillions(instrument.encours, 0)}M`)
      : fmtEur(instrument.encours);
    const title = locale === "en"
      ? `${label} — Ville de Paris debt ${year} · Qipu`
      : `${label} — Dette Ville de Paris ${year} · Qipu`;
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
  seo: ({ instrument: i, year }, locale) => {
  const amt = eur(i.encours, locale);
  const label = trLabel(i.label, locale);
  const part = pct(i.part * 100, locale);
  const date = dataDate(`patrimoine_structure_${year}.json`, locale);
  const rate = i.taux_moyen_pct != null ? pct(i.taux_moyen_pct, locale, 2) : null;
  const mat = i.maturite_moyenne_ans != null ? int(Math.round(i.maturite_moyenne_ans), locale) : null;
  if (locale === "en") {
    return {
      title: `${label}: ${amt} of City of Paris debt at end ${year}`,
      answer: `At 31 December ${year}, ${label.toLowerCase()} makes up ${amt} of outstanding debt, ${part} of the City of Paris's financial debt${rate ? `, at an average rate of ${rate}` : ""}${mat ? ` over ${mat} years` : ""}. ${sourceLine("en", "City of Paris, administrative account (debt statement)", date)}`,
    };
  }
  return {
    title: `${i.label} : ${amt} de dette de la Ville de Paris fin ${year}`,
    answer: `Au 31 décembre ${year}, ${i.label.toLowerCase()} représente ${amt} d'encours, soit ${part} de la dette financière de la Ville de Paris${rate ? `, à ${rate} de taux moyen` : ""}${mat ? ` sur ${mat} ans` : ""}. ${sourceLine("fr", "Ville de Paris, compte administratif (état de la dette)", date)}`,
  };
  },
  related: ({ slug, year }, locale) => instrumentRelated(slug, year, locale),
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
    // Pas de montant dans le titre : le chiffre est le rôle du héros de la fiche.
    kicker: ({ year }, locale) => relatedT(locale)("fx.drawer.kicker.instrument", { year }),
    title: ({ instrument }, locale) => trLabel(instrument.label, locale),
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
