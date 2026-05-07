"use client";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import CountUpOnReveal from "@/components/fusion/CountUpOnReveal";
import ChartSource from "@/components/fusion/ChartSource";
import CofogCompareBars, { type CofogCompareRow } from "@/components/fusion/CofogCompareBars";
import FranceMacroNav from "@/components/fusion/FranceMacroNav";
import { useT, useLocale } from "@/lib/localeContext";
import type { EurostatCofog } from "@/lib/national-data";

export default function ApuClient({ cofog }: { cofog: EurostatCofog | null }) {
  const t = useT();
  const { locale } = useLocale();

  if (!cofog) {
    return (
      <div className="theme-fusion">
        <Navbar />
        <main className="fx-wrap" style={{ padding: "120px 0", minHeight: "60vh" }}>
          <p>{t("apu.no_data")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  // Total = the synthetic "TOTAL" row from the Eurostat fetch
  const total = cofog.functions.find((f) => f.code === "TOTAL");
  const totalFr = total?.values_pct_gdp.FR ?? 0;
  const totalEu = total?.values_pct_gdp.EU27_2020 ?? 0;
  const totalGap = totalFr - totalEu;

  // Per-function rows, sorted by FR descending (largest spending first)
  const rows: CofogCompareRow[] = cofog.functions
    .filter((f) => f.code !== "TOTAL")
    .map((f) => ({
      code: f.code,
      label: locale === "en" ? f.label_en : f.label_fr,
      fr: f.values_pct_gdp.FR ?? 0,
      eu: f.values_pct_gdp.EU27_2020 ?? 0,
    }))
    .sort((a, b) => b.fr - a.fr);

  const maxRef = Math.max(...rows.flatMap((r) => [r.fr, r.eu])) * 1.05;

  // Localised labels
  const perimeterLabel =
    locale === "en" ? cofog.perimeter_label_en : cofog.perimeter_label_fr;
  const notes = locale === "en" ? cofog.notes_en : cofog.notes_fr;
  const unit = locale === "en" ? cofog.unit_en : cofog.unit;

  return (
    <div className="theme-fusion">
      <Navbar />
      <FranceMacroNav />

      <main>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 40px" }}>
          <SectionHead
            number="01"
            kind={t("apu.section.kind")}
            title={t("apu.hero.title")}
            subtitle={t("apu.hero.subtitle")}
          />

          <div style={{ marginTop: 36 }}>
            <span className="fx-perimeter-badge">{perimeterLabel}</span>
          </div>

          <div style={{ marginTop: 28, maxWidth: 720 }}>
            <HeroNumber
              label={t("apu.hero.label")}
              value={
                <CountUpOnReveal
                  value={totalFr}
                  format={(n) =>
                    n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })
                  }
                />
              }
              unit={` ${unit}`}
              caption={
                <>
                  {t("apu.hero.caption_year").replace("{year}", String(cofog.year))}
                  <span style={{ marginLeft: 12, color: "var(--muted)" }}>
                    {t("apu.hero.caption_eu")
                      .replace(
                        "{eu}",
                        totalEu.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                          maximumFractionDigits: 1,
                          minimumFractionDigits: 1,
                        }),
                      )
                      .replace(
                        "{gap}",
                        (totalGap >= 0 ? "+" : "") +
                          totalGap.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                            maximumFractionDigits: 1,
                            minimumFractionDigits: 1,
                          }),
                      )}
                  </span>
                </>
              }
            />
          </div>
        </section>

        {/* Compare bars ─────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="02"
            kind={t("apu.compare.kind")}
            title={t("apu.compare.title")}
            subtitle={t("apu.compare.subtitle")}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <CofogCompareBars
              rows={rows}
              max={maxRef}
              unit="%"
              frLabel={t("apu.series.fr")}
              euLabel={t("apu.series.eu")}
              gapLabel={t("apu.series.gap")}
              header={{
                left: <b>{t("apu.compare.header_left")}</b>,
                right: t("apu.compare.header_right").replace("{year}", String(cofog.year)),
              }}
            />
            <ChartSource
              source={`Eurostat — gov_10a_exp · ${cofog.year}`}
              dataHref={cofog.source_url}
              methodAnchor="apu-cofog"
            />
          </figure>

          <p style={{ marginTop: 24, maxWidth: 760, color: "var(--muted)", fontSize: 14.5 }}>
            {notes}
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
