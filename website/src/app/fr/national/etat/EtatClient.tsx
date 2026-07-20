"use client";
import { useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import ChartSource from "@/components/fusion/ChartSource";
import FranceMacroNav from "@/components/fusion/FranceMacroNav";
import { useT, useLocale } from "@/lib/localeContext";
import { numLocale } from "@/lib/fmt";
import type { EtatLFI, EtatMission } from "@/lib/national-data";

type Unit = "cp" | "ae";

const REMB_LABEL = "Remboursements et dégrèvements";

const fmtBillions = (eur: number, locale: string) =>
  (eur / 1e9).toLocaleString(numLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

const fmtMillions = (eur: number, locale: string) =>
  (eur / 1e6).toLocaleString(numLocale(locale), {
    maximumFractionDigits: 0,
  });

const fmtPct = (n: number, total: number, locale: string) => {
  if (!total) return "";
  return ((n / total) * 100).toLocaleString(numLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
};

export default function EtatClient({
  etat,
  history,
}: {
  etat: EtatLFI | null;
  history: EtatLFI[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const [unit, setUnit] = useState<Unit>("cp");

  if (!etat) {
    return (
      <div className="theme-fusion">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="fx-wrap" style={{ padding: "120px 0", minHeight: "60vh" }}>
          <p>{t("etat.no_data")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  const totalNet = unit === "cp" ? etat.totals.bg_net_cp : etat.totals.bg_net_ae;
  const totalBrut = unit === "cp" ? etat.totals.bg_brut_cp : etat.totals.bg_brut_ae;
  const remb =
    unit === "cp" ? etat.totals.remboursements_degrev_cp : etat.totals.remboursements_degrev_ae;

  const missionValue = (m: EtatMission) => (unit === "cp" ? m.cp : m.ae);

  // YoY mapping: previous-year value per mission code, for delta annotation
  const prevYearEtat = history.find((h) => h.exercice === etat.exercice - 1);
  const prevByCode = new Map<string, number>();
  if (prevYearEtat) {
    for (const m of prevYearEtat.missions) {
      prevByCode.set(m.code, missionValue(m));
    }
  }

  // Missions excluding R&D, sorted by chosen unit desc
  const missions = etat.missions
    .filter((m) => m.label !== REMB_LABEL)
    .map((m) => {
      const cur = missionValue(m);
      const prev = prevByCode.get(m.code);
      const yoyPct = prev && prev > 0 ? ((cur - prev) / prev) * 100 : null;
      return { ...m, value: cur, prev, yoyPct };
    })
    .sort((a, b) => b.value - a.value);

  const maxMission = missions[0]?.value ?? 1;

  // YoY summary (for the section subtitle)
  const totalPrevNet = prevYearEtat?.totals.bg_net_cp;
  const totalYoyPct =
    totalPrevNet && totalPrevNet > 0
      ? ((etat.totals.bg_net_cp - totalPrevNet) / totalPrevNet) * 100
      : null;
  const nMissionsUp = missions.filter((m) => m.yoyPct != null && m.yoyPct > 5).length;
  const nMissionsDown = missions.filter((m) => m.yoyPct != null && m.yoyPct < -5).length;

  const perimeterLabel =
    locale === "en" ? etat.perimeter_label_en : etat.perimeter_label_fr;
  const notes = locale === "en" ? etat.notes_en : etat.notes_fr;

  return (
    <div className="theme-fusion">
      <Navbar />
      <FranceMacroNav />

      <main id="main-content" tabIndex={-1}>
        <h1 className="fx-sr-only">{t("etat.hero.title")}</h1>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 36px" }}>
          <SectionHead
            number="01"
            kind={t("etat.section.kind")}
            title={t("etat.hero.title")}
            subtitle={t("etat.hero.subtitle")}
          />

          <div style={{ marginTop: 32 }}>
            <span className="fx-perimeter-badge">{perimeterLabel}</span>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setUnit("cp")}
              className={`fx-toggle-btn ${unit === "cp" ? "is-active" : ""}`}
            >
              {t("etat.toggle.cp")}
            </button>
            <button
              type="button"
              onClick={() => setUnit("ae")}
              className={`fx-toggle-btn ${unit === "ae" ? "is-active" : ""}`}
            >
              {t("etat.toggle.ae")}
            </button>
          </div>

          <div style={{ marginTop: 24, maxWidth: 760 }}>
            <HeroNumber
              label={t("etat.hero.label")}
              value={fmtBillions(totalNet, locale)}
              unit=" Mds €"
              caption={
                <>
                  {t("etat.hero.caption_year").replace("{year}", String(etat.exercice))}
                  <span style={{ marginLeft: 12, color: "var(--muted)" }}>
                    ·{" "}
                    {t("etat.hero.caption_brut")
                      .replace("{brut}", fmtBillions(totalBrut, locale))
                      .replace("{remb}", fmtBillions(remb, locale))}
                  </span>
                </>
              }
            />
          </div>
        </section>

        {/* Mission breakdown ───────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="02"
            kind={t("etat.missions.kind")}
            title={t("etat.missions.title").replace("{n}", String(missions.length))}
            subtitle={
              <>
                {t("etat.missions.subtitle")}
                {totalYoyPct != null && (
                  <>
                    {" "}
                    <span style={{ color: "var(--ink-2)" }}>
                      {t("etat.missions.yoy_summary")
                        .replace("{prev}", String(prevYearEtat?.exercice ?? ""))
                        .replace("{cur}", String(etat.exercice))
                        .replace(
                          "{delta}",
                          (totalYoyPct > 0 ? "+" : "") +
                            totalYoyPct.toLocaleString(
                              numLocale(locale),
                              { maximumFractionDigits: 1, minimumFractionDigits: 1 },
                            ),
                        )
                        .replace("{up}", String(nMissionsUp))
                        .replace("{down}", String(nMissionsDown))}
                    </span>
                  </>
                )}
              </>
            }
          />

          <figure style={{ margin: "32px 0 0" }}>
            <div className="fx-cofog-box">
              <div className="fx-cofog-head">
                <span><b>{t("etat.missions.header_left")}</b></span>
                <span>{t("etat.missions.header_right").replace("{year}", String(etat.exercice))}</span>
              </div>
              <div className="fx-mission-list">
                {missions.map((m) => {
                  const pct = (m.value / maxMission) * 100;
                  const share = fmtPct(m.value, totalNet, locale);
                  return (
                    <details key={m.code} className="fx-mission-row">
                      <summary>
                        <span className="fx-mission-label">{m.label}</span>
                        <span className="fx-mission-bar">
                          <span
                            className="fx-mission-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="fx-mission-val tnum">
                          {fmtBillions(m.value, locale)}
                          <span className="fx-mission-unit">Mds €</span>
                          <span className="fx-mission-share">· {share} %</span>
                          {m.yoyPct != null && (
                            <span
                              className={`fx-mission-yoy ${
                                m.yoyPct > 1
                                  ? "yoy-up"
                                  : m.yoyPct < -1
                                  ? "yoy-down"
                                  : ""
                              }`}
                              title={t("etat.missions.yoy_tooltip").replace(
                                "{prev}",
                                String(prevYearEtat?.exercice ?? ""),
                              )}
                            >
                              {m.yoyPct > 0 ? "+" : ""}
                              {m.yoyPct.toLocaleString(numLocale(locale), {
                                maximumFractionDigits: 1,
                                minimumFractionDigits: 1,
                              })}{" %"}
                            </span>
                          )}
                        </span>
                        <span className="fx-mission-chev" aria-hidden="true">
                          ▸
                        </span>
                      </summary>
                      <div className="fx-mission-progs">
                        {m.programmes.map((p) => (
                          <div key={p.code} className="fx-mission-prog">
                            <span className="fx-mission-prog-label">
                              <span className="fx-mission-prog-code">{p.code}</span>
                              {p.label}
                            </span>
                            <span className="fx-mission-prog-val tnum">
                              {(unit === "cp" ? p.cp : p.ae) >= 1e9
                                ? `${fmtBillions(unit === "cp" ? p.cp : p.ae, locale)} Mds €`
                                : `${fmtMillions(unit === "cp" ? p.cp : p.ae, locale)} M €`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
            <ChartSource
              source={`${etat.source} · ${etat.exercice}`}
              dataHref={etat.source_url}
              methodAnchor="etat"
            />
          </figure>

          <p style={{ marginTop: 18, maxWidth: 800, color: "var(--muted)", fontSize: 14 }}>
            {notes}
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
