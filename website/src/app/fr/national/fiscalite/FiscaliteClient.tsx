"use client";
import { useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import CountUpOnReveal from "@/components/fusion/CountUpOnReveal";
import ChartSource from "@/components/fusion/ChartSource";
import BarRow, { type BarRowItem } from "@/components/fusion/BarRow";
import CofogCompareBars, { type CofogCompareRow } from "@/components/fusion/CofogCompareBars";
import DebtLineChart, { type DebtSeriesProp } from "@/components/fusion/DebtLineChart";
import FranceMacroNav from "@/components/fusion/FranceMacroNav";
import { useT, useLocale } from "@/lib/localeContext";
import { numLocale } from "@/lib/fmt";
import type { EurostatFiscalite, FiscaliteRow } from "@/lib/national-data";

type Unit = "pc_gdp" | "mio_eur";

const fmtPct = (v: number, locale: string) =>
  v.toLocaleString(numLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

const fmtBillions = (mio: number, locale: string) =>
  (mio / 1000).toLocaleString(numLocale(locale), {
    maximumFractionDigits: 0,
  });

/**
 * Build 6 mutually-exclusive buckets from the granular Eurostat codes.
 * Sum should approximately equal the total PO (small rounding diff possible).
 */
function buildBuckets(rows: FiscaliteRow[]) {
  const get = (code: string) => rows.find((r) => r.code === code);
  const D211 = get("D211"); // VAT
  const D2 = get("D2"); // total taxes on production
  const D51A = get("D51A"); // household income tax
  const D51B = get("D51B"); // corporate income tax
  const D5 = get("D5"); // total direct taxes
  const D61 = get("D61"); // social contribs
  const D91 = get("D91"); // capital

  const num = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : a - b;

  const otherD2_pct = num(D2?.pc_gdp, D211?.pc_gdp);
  const otherD2_eur = num(D2?.mio_eur, D211?.mio_eur);
  const otherD5_pct =
    D5 && D51A && D51B && D91
      ? (D5.pc_gdp ?? 0) - (D51A.pc_gdp ?? 0) - (D51B.pc_gdp ?? 0) + (D91.pc_gdp ?? 0)
      : null;
  const otherD5_eur =
    D5 && D51A && D51B && D91
      ? (D5.mio_eur ?? 0) - (D51A.mio_eur ?? 0) - (D51B.mio_eur ?? 0) + (D91.mio_eur ?? 0)
      : null;

  return [
    {
      key: "cotisations",
      label_fr: "Cotisations sociales",
      label_en: "Social contributions",
      sub_fr: "Sécurité sociale, assurance chômage, retraites, etc.",
      sub_en: "Social security, unemployment, pensions, etc.",
      pct: D61?.pc_gdp ?? null,
      eur: D61?.mio_eur ?? null,
    },
    {
      key: "ir",
      label_fr: "Impôt sur le revenu (IR + CSG)",
      label_en: "Personal income tax (incl. CSG)",
      sub_fr: "Inclut la CSG, classée comme impôt par Eurostat (≠ cotisation).",
      sub_en: "Includes CSG, classified as a tax by Eurostat (not a contribution).",
      pct: D51A?.pc_gdp ?? null,
      eur: D51A?.mio_eur ?? null,
    },
    {
      key: "tva",
      label_fr: "TVA",
      label_en: "Value-added tax (VAT)",
      sub_fr: "Taxe sur la valeur ajoutée payée à la consommation.",
      sub_en: "Consumption tax paid at point of sale.",
      pct: D211?.pc_gdp ?? null,
      eur: D211?.mio_eur ?? null,
    },
    {
      key: "autres_prod",
      label_fr: "Autres impôts production (hors TVA)",
      label_en: "Other production taxes (ex-VAT)",
      sub_fr: "TICPE, accises, taxe foncière entreprises, taxes salariales spécifiques.",
      sub_en: "Energy excise, business property tax, payroll-specific taxes.",
      pct: otherD2_pct,
      eur: otherD2_eur,
    },
    {
      key: "is",
      label_fr: "Impôt sur les sociétés",
      label_en: "Corporate income tax",
      sub_fr: "Impôt sur les bénéfices des entreprises.",
      sub_en: "Tax on corporate profits.",
      pct: D51B?.pc_gdp ?? null,
      eur: D51B?.mio_eur ?? null,
    },
    {
      key: "autres",
      label_fr: "Autres impôts directs + capital",
      label_en: "Other direct taxes + capital",
      sub_fr: "Impôts sur succession/donation, taxe d’habitation résiduelle, autres.",
      sub_en: "Inheritance/gift taxes, residual housing tax, miscellaneous.",
      pct: otherD5_pct,
      eur: otherD5_eur,
    },
  ];
}

export default function FiscaliteClient({ fiscalite }: { fiscalite: EurostatFiscalite | null }) {
  const t = useT();
  const { locale } = useLocale();
  const [unit, setUnit] = useState<Unit>("pc_gdp");

  if (!fiscalite) {
    return (
      <div className="theme-fusion">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="fx-wrap" style={{ padding: "120px 0", minHeight: "60vh" }}>
          <p>{t("fiscalite.no_data")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  const totalPct = fiscalite.fr_total_po.pc_gdp ?? 0;
  const totalEur = fiscalite.fr_total_po.mio_eur ?? 0;

  const buckets = buildBuckets(fiscalite.fr_breakdown).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const maxBucket = Math.max(...buckets.map((b) => b.pct ?? 0)) * 1.05;

  const breakdownItems: BarRowItem[] = buckets.map((b) => ({
    label: (
      <div>
        <div>{locale === "en" ? b.label_en : b.label_fr}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400, marginTop: 3 }}>
          {locale === "en" ? b.sub_en : b.sub_fr}
        </div>
      </div>
    ),
    value: b.pct ?? 0,
    display: (
      <div style={{ textAlign: "right" }}>
        <div>
          {b.pct != null ? fmtPct(b.pct, locale) : "—"}
          <span className="fx-br-unit"> %</span>
        </div>
        {b.eur != null && (
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginTop: 3 }}>
            ≈ {fmtBillions(b.eur, locale)} Mds €
          </div>
        )}
      </div>
    ),
  }));

  // Evolution chart series
  const evoSeries: DebtSeriesProp[] = fiscalite.fr_evolution.map((s) => ({
    code: s.code,
    label: locale === "en" ? s.label_en : s.label_fr,
    points: s.pc_gdp,
    emphasized: s.code === "D61",
  }));

  // Peer compare
  const peerSorted = [...fiscalite.peer_compare.values].sort(
    (a, b) => (b.value_pct_gdp ?? 0) - (a.value_pct_gdp ?? 0),
  );
  const frVal = fiscalite.peer_compare.values.find((p) => p.geo === "FR")?.value_pct_gdp ?? 0;
  const peerRows: CofogCompareRow[] = peerSorted
    .filter((p) => p.geo !== "FR")
    .map((p) => ({
      code: p.geo,
      label: locale === "en" ? p.label_en : p.label_fr,
      fr: frVal,
      eu: p.value_pct_gdp ?? 0,
    }));
  const peerMax = Math.max(...peerSorted.map((p) => p.value_pct_gdp ?? 0)) * 1.05;

  const perimeterLabel =
    locale === "en" ? fiscalite.perimeter_label_en : fiscalite.perimeter_label_fr;
  const notes = locale === "en" ? fiscalite.notes_en : fiscalite.notes_fr;

  return (
    <div className="theme-fusion">
      <Navbar />
      <FranceMacroNav />

      <main id="main-content" tabIndex={-1}>
        <h1 className="fx-sr-only">{t("fiscalite.hero.title")}</h1>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 36px" }}>
          <SectionHead
            number="01"
            kind={t("fiscalite.section.kind")}
            title={t("fiscalite.hero.title")}
            subtitle={t("fiscalite.hero.subtitle")}
          />

          <div style={{ marginTop: 32 }}>
            <span className="fx-perimeter-badge">{perimeterLabel}</span>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setUnit("pc_gdp")}
              className={`fx-toggle-btn ${unit === "pc_gdp" ? "is-active" : ""}`}
            >
              {t("fiscalite.toggle.pct")}
            </button>
            <button
              type="button"
              onClick={() => setUnit("mio_eur")}
              className={`fx-toggle-btn ${unit === "mio_eur" ? "is-active" : ""}`}
            >
              {t("fiscalite.toggle.eur")}
            </button>
          </div>

          <div style={{ marginTop: 24, maxWidth: 760 }}>
            <HeroNumber
              label={t("fiscalite.hero.label")}
              value={
                <CountUpOnReveal
                  key={unit}
                  value={unit === "pc_gdp" ? totalPct : totalEur}
                  format={(n) =>
                    unit === "pc_gdp" ? fmtPct(n, locale) : fmtBillions(n, locale)
                  }
                />
              }
              unit={unit === "pc_gdp" ? " % PIB" : " Mds €"}
              caption={
                <>
                  {t("fiscalite.hero.caption_year").replace("{year}", String(fiscalite.latest_year))}
                  <span style={{ marginLeft: 12, color: "var(--muted)" }}>
                    ·{" "}
                    {unit === "pc_gdp"
                      ? `≈ ${fmtBillions(totalEur, locale)} Mds €`
                      : `${fmtPct(totalPct, locale)} % PIB`}
                  </span>
                </>
              }
            />
          </div>
        </section>

        {/* Breakdown ────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="02"
            kind={t("fiscalite.breakdown.kind")}
            title={t("fiscalite.breakdown.title")}
            subtitle={t("fiscalite.breakdown.subtitle")}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <BarRow
              items={breakdownItems}
              max={maxBucket}
              header={{
                left: <b>{t("fiscalite.breakdown.header_left")}</b>,
                right: t("fiscalite.breakdown.header_right").replace(
                  "{year}",
                  String(fiscalite.latest_year),
                ),
              }}
            />
            <ChartSource
              source={`Eurostat — gov_10a_taxag · ${fiscalite.latest_year}`}
              dataHref={fiscalite.source_url}
              methodAnchor="fiscalite"
            />
          </figure>

          <p style={{ marginTop: 18, maxWidth: 760, color: "var(--muted)", fontSize: 14 }}>
            {notes}
          </p>
        </section>

        {/* Evolution ────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="03"
            kind={t("fiscalite.evolution.kind")}
            title={t("fiscalite.evolution.title")}
            subtitle={t("fiscalite.evolution.subtitle")}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <DebtLineChart
              series={evoSeries}
              unitLabel="% PIB"
              unitMode="pct"
              height={420}
            />
            <ChartSource
              source={`Eurostat — gov_10a_taxag · 2010–${fiscalite.latest_year}`}
              dataHref={fiscalite.source_url}
              methodAnchor="fiscalite"
            />
          </figure>
        </section>

        {/* Peer compare ─────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 80px" }}>
          <SectionHead
            number="04"
            kind={t("fiscalite.peer.kind")}
            title={t("fiscalite.peer.title")}
            subtitle={t("fiscalite.peer.subtitle").replace(
              "{year}",
              String(fiscalite.peer_compare.year),
            )}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <CofogCompareBars
              rows={peerRows}
              max={peerMax}
              unit="%"
              frLabel={t("fiscalite.peer.fr_label")}
              euLabel={t("fiscalite.peer.peer_label")}
              gapLabel={t("fiscalite.peer.gap_label")}
              header={{
                left: <b>{t("fiscalite.peer.header_left")}</b>,
                right: t("fiscalite.peer.header_right").replace(
                  "{year}",
                  String(fiscalite.peer_compare.year),
                ),
              }}
            />
            <ChartSource
              source={`Eurostat — gov_10a_taxag · ${fiscalite.peer_compare.year}`}
              dataHref={fiscalite.source_url}
              methodAnchor="fiscalite"
            />
          </figure>
        </section>
      </main>

      <Footer />
    </div>
  );
}
