"use client";
import { useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import CountUpOnReveal from "@/components/fusion/CountUpOnReveal";
import ChartSource from "@/components/fusion/ChartSource";
import CofogCompareBars, { type CofogCompareRow } from "@/components/fusion/CofogCompareBars";
import DebtLineChart, { type DebtSeriesProp } from "@/components/fusion/DebtLineChart";
import FranceMacroNav from "@/components/fusion/FranceMacroNav";
import { useT, useLocale } from "@/lib/localeContext";
import type { EurostatDette } from "@/lib/national-data";

type Unit = "pc_gdp" | "mio_eur";

const fmtPct = (v: number, locale: string) =>
  v.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

const fmtBillions = (mio: number, locale: string) =>
  (mio / 1000).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
  });

const labelQuarter = (q: string, locale: string) => {
  // "2025-Q3" → "T3 2025" (FR) | "Q3 2025" (EN)
  const [year, qPart] = q.split("-");
  const prefix = locale === "en" ? "Q" : "T";
  return `${prefix}${qPart.slice(1)} ${year}`;
};

export default function DetteClient({ dette }: { dette: EurostatDette | null }) {
  const t = useT();
  const { locale } = useLocale();
  const [unit, setUnit] = useState<Unit>("pc_gdp");

  if (!dette) {
    return (
      <div className="theme-fusion">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="fx-wrap" style={{ padding: "120px 0", minHeight: "60vh" }}>
          <p>{t("dette.no_data")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  // Hero: APU latest values
  const s13 = dette.fr_series.find((s) => s.code === "S13");
  const lastPct = s13?.pc_gdp[s13.pc_gdp.length - 1]?.v ?? null;
  const lastEur = s13?.mio_eur[s13.mio_eur.length - 1]?.v ?? null;

  // Δ year-over-year for the hero delta
  const lastIdx = (s13?.pc_gdp.length ?? 0) - 1;
  const yagoIdx = lastIdx - 4; // 4 quarters back
  const yagoPct = yagoIdx >= 0 ? s13?.pc_gdp[yagoIdx]?.v : null;
  const deltaYoY = lastPct != null && yagoPct != null ? lastPct - yagoPct : null;

  const heroNumeric = unit === "pc_gdp" ? lastPct : lastEur;
  const heroFormat = (n: number) =>
    unit === "pc_gdp" ? fmtPct(n, locale) : fmtBillions(n, locale);
  const heroValue =
    heroNumeric != null ? (
      <CountUpOnReveal value={heroNumeric} format={heroFormat} />
    ) : (
      "—"
    );
  const heroUnit = unit === "pc_gdp" ? "% PIB" : "Mds €";

  // Line chart series
  const chartSeries: DebtSeriesProp[] = dette.fr_series.map((s) => ({
    code: s.code,
    label: locale === "en" ? s.label_en : s.label_fr,
    points: unit === "pc_gdp" ? s.pc_gdp : s.mio_eur,
    emphasized: s.code === "S13",
  }));

  // Peer compare rows (FR vs other countries) — reuse CofogCompareBars but
  // showing single value per row. We use the gap column to highlight the FR delta.
  const peerSorted = [...dette.peer_compare.values].sort(
    (a, b) => (b.value_pct_gdp ?? 0) - (a.value_pct_gdp ?? 0),
  );
  const frVal = dette.peer_compare.values.find((p) => p.geo === "FR")?.value_pct_gdp ?? 0;
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
    locale === "en" ? dette.perimeter_label_en : dette.perimeter_label_fr;
  const notes = locale === "en" ? dette.notes_en : dette.notes_fr;

  return (
    <div className="theme-fusion">
      <Navbar />
      <FranceMacroNav />

      <main id="main-content" tabIndex={-1}>
        <h1 className="fx-sr-only">{t("dette.hero.title")}</h1>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 40px" }}>
          <SectionHead
            number="01"
            kind={t("dette.section.kind")}
            title={t("dette.hero.title")}
            subtitle={t("dette.hero.subtitle")}
          />

          <div style={{ marginTop: 36 }}>
            <span className="fx-perimeter-badge">{perimeterLabel}</span>
          </div>

          <div style={{ marginTop: 28, maxWidth: 760 }}>
            <HeroNumber
              label={t("dette.hero.label")}
              value={heroValue}
              unit={` ${heroUnit}`}
              delta={
                deltaYoY != null
                  ? {
                      direction: deltaYoY > 0.05 ? "up" : deltaYoY < -0.05 ? "down" : "flat",
                      value: `${deltaYoY > 0 ? "+" : ""}${fmtPct(deltaYoY, locale)} pp`,
                      base: t("dette.hero.delta_base"),
                    }
                  : undefined
              }
              caption={
                <>
                  {labelQuarter(dette.latest_quarter, locale)}
                  {lastEur != null && lastPct != null ? (
                    <span style={{ marginLeft: 12, color: "var(--muted)" }}>
                      ·{" "}
                      {unit === "pc_gdp"
                        ? `≈ ${fmtBillions(lastEur, locale)} Mds €`
                        : `${fmtPct(lastPct, locale)} % PIB`}
                    </span>
                  ) : null}
                </>
              }
            />
          </div>
        </section>

        {/* Evolution line chart ─────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="02"
            kind={t("dette.evolution.kind")}
            title={t("dette.evolution.title")}
            subtitle={t("dette.evolution.subtitle")}
          />

          <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setUnit("pc_gdp")}
              className={`fx-toggle-btn ${unit === "pc_gdp" ? "is-active" : ""}`}
            >
              {t("dette.toggle.pct")}
            </button>
            <button
              type="button"
              onClick={() => setUnit("mio_eur")}
              className={`fx-toggle-btn ${unit === "mio_eur" ? "is-active" : ""}`}
            >
              {t("dette.toggle.eur")}
            </button>
          </div>

          <figure style={{ margin: "24px 0 0" }}>
            <DebtLineChart
              series={chartSeries}
              unitLabel={unit === "pc_gdp" ? "% PIB" : "Mds €"}
              unitMode={unit === "pc_gdp" ? "pct" : "billions"}
              height={460}
            />
            <ChartSource
              source={`Eurostat — gov_10q_ggdebt · ${labelQuarter(dette.latest_quarter, locale)}`}
              dataHref={dette.source_url}
              methodAnchor="dette"
            />
          </figure>

          <p style={{ marginTop: 18, maxWidth: 760, color: "var(--muted)", fontSize: 14 }}>
            {notes}
          </p>
        </section>

        {/* Peer compare ─────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 80px" }}>
          <SectionHead
            number="03"
            kind={t("dette.peer.kind")}
            title={t("dette.peer.title")}
            subtitle={t("dette.peer.subtitle").replace(
              "{quarter}",
              labelQuarter(dette.peer_compare.quarter, locale),
            )}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <CofogCompareBars
              rows={peerRows}
              max={peerMax}
              unit="%"
              frLabel={t("dette.peer.fr_label")}
              euLabel={t("dette.peer.peer_label")}
              gapLabel={t("dette.peer.gap_label")}
              header={{
                left: <b>{t("dette.peer.header_left")}</b>,
                right: t("dette.peer.header_right").replace(
                  "{quarter}",
                  labelQuarter(dette.peer_compare.quarter, locale),
                ),
              }}
            />
            <ChartSource
              source={`Eurostat — gov_10q_ggdebt · ${labelQuarter(dette.peer_compare.quarter, locale)}`}
              dataHref={dette.source_url}
              methodAnchor="dette"
            />
          </figure>
        </section>
      </main>

      <Footer />
    </div>
  );
}
