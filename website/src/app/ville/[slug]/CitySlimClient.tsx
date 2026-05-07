"use client";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import ChartSource from "@/components/fusion/ChartSource";
import { useT, useLocale } from "@/lib/localeContext";
import type { AllCommuneEntry } from "@/lib/all-communes";

const fmtInt = (n: number, locale: string) =>
  n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");

const fmtMillions = (eur: number, locale: string) => {
  if (Math.abs(eur) >= 1e9) {
    return (
      (eur / 1e9).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }) + " Md€"
    );
  }
  return (
    (eur / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
      maximumFractionDigits: 1,
    }) + " M€"
  );
};

const fmtSigned = (n: number, locale: string) =>
  n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });

const KPI_DISPLAY: Array<{ key: string; signed?: boolean }> = [
  { key: "depenses_totales" },
  { key: "encours_dette" },
  { key: "frais_personnel" },
  { key: "capacite_financement", signed: true },
  { key: "recettes_totales" },
  { key: "impots_locaux" },
  { key: "epargne_brute" },
];

export default function CitySlimClient({
  entry,
  year,
  source,
  sourceUrl,
  labels,
}: {
  entry: AllCommuneEntry;
  year: number;
  source: string;
  sourceUrl: string;
  labels: Record<string, string>;
}) {
  const t = useT();
  const { locale } = useLocale();

  // Capacité de désendettement (computed)
  const dette = entry.kpis.encours_dette?.montant ?? 0;
  const epargne = entry.kpis.epargne_brute?.montant ?? 0;
  const capDesend = epargne > 0 ? dette / epargne : null;

  return (
    <div className="theme-fusion">
      <Navbar />

      <main>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 32px" }}>
          <SectionHead
            number="01"
            kind={t("city.section.kind")}
            title={entry.nom}
            subtitle={
              <>
                {entry.dep_name} · {entry.reg_name} · INSEE {entry.insee} ·{" "}
                {fmtInt(entry.pop, locale)} {t("city.hero.unit")}
              </>
            }
          />

          <div style={{ marginTop: 28 }}>
            <span className="fx-perimeter-badge">
              {t("city.slim.badge")}
            </span>
          </div>

          {/* KPI grid (4 essentials) */}
          <div className="fx-kpi-grid" style={{ marginTop: 32 }}>
            {KPI_DISPLAY.slice(0, 4).map(({ key, signed }, i) => {
              const k = entry.kpis[key];
              const eurHab = k?.eur_hab ?? null;
              const montant = k?.montant ?? null;
              return (
                <div
                  key={key}
                  className={`fx-kpi-card ${i === 0 ? "is-hero" : ""}`}
                >
                  <p className="fx-kpi-label">{labels[key] ?? key}</p>
                  <p className="fx-kpi-value tnum">
                    {eurHab != null
                      ? signed
                        ? fmtSigned(Math.round(eurHab), locale)
                        : fmtInt(Math.round(eurHab), locale)
                      : "—"}
                    <span className="fx-kpi-unit">€/hab</span>
                  </p>
                  {montant != null && (
                    <p className="fx-kpi-aside tnum">
                      ≈ {fmtMillions(montant, locale)}
                    </p>
                  )}
                  <p className="fx-kpi-year">· {year}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Capacité de désendettement (computed) */}
        {capDesend !== null && (
          <section className="fx-wrap" style={{ padding: "0 0 36px" }}>
            <div className="fx-cap-desend">
              <div className="fx-cap-desend-num tnum">
                {capDesend.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}
                <span className="fx-cap-desend-unit">
                  {capDesend > 1.5 ? t("city.capdesend.years") : t("city.capdesend.year")}
                </span>
              </div>
              <div className="fx-cap-desend-text">
                <p className="fx-cap-desend-label">
                  {t("city.capdesend.label")}
                  <span
                    className={`fx-cap-desend-tag tag-${
                      capDesend < 8 ? "ok" : capDesend < 12 ? "warn" : "stress"
                    }`}
                  >
                    {capDesend < 8
                      ? t("city.capdesend.tag.ok")
                      : capDesend < 12
                      ? t("city.capdesend.tag.warn")
                      : t("city.capdesend.tag.stress")}
                  </span>
                </p>
                <p className="fx-cap-desend-help">{t("city.capdesend.help")}</p>
              </div>
            </div>
          </section>
        )}

        {/* Detail rows for the other 3 KPIs */}
        <section className="fx-wrap" style={{ padding: "0 0 60px" }}>
          <SectionHead
            number="02"
            kind={t("city.slim.detail.kind")}
            title={t("city.slim.detail.title").replace("{city}", entry.nom)}
            subtitle={t("city.slim.detail.subtitle")}
          />

          <div className="fx-cofog-box" style={{ marginTop: 24 }}>
            <div className="fx-cofog-head">
              <span>
                <b>{t("city.slim.detail.header_left")}</b>
              </span>
              <span>{year}</span>
            </div>
            <div className="fx-cofog-list">
              {KPI_DISPLAY.slice(4).map(({ key }) => {
                const k = entry.kpis[key];
                if (!k) return null;
                return (
                  <div key={key} className="fx-cofog-row" style={{ gridTemplateColumns: "300px 1fr 140px" }}>
                    <div className="fx-cofog-label">{labels[key] ?? key}</div>
                    <div className="fx-cofog-pair">
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>
                        {fmtMillions(k.montant, locale)}
                      </div>
                    </div>
                    <div className="fx-cofog-val tnum" style={{ textAlign: "right" }}>
                      {fmtInt(Math.round(k.eur_hab), locale)}
                      <span className="fx-cofog-unit"> €/hab</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <ChartSource source={`${source} · ${year}`} dataHref={sourceUrl} methodAnchor="c-villes" />
        </section>

        {/* Limitations + cross-link to comparator + top 10 */}
        <section className="fx-wrap" style={{ padding: "0 0 80px" }}>
          <div
            style={{
              border: "1px solid var(--ink)",
              padding: "28px 32px",
              background: "#fff",
            }}
          >
            <p
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 12,
              }}
            >
              {t("city.slim.limits.kicker")}
            </p>
            <h2 className="fx-display" style={{ fontSize: 22, lineHeight: 1.2, margin: "0 0 14px" }}>
              {t("city.slim.limits.title")}
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 760 }}>
              {t("city.slim.limits.body")}
            </p>
            <p style={{ marginTop: 18, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Link
                href="/comparer"
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 13,
                  color: "var(--bleu-vif)",
                  textDecoration: "underline",
                }}
              >
                {t("city.slim.limits.cta_compare")} →
              </Link>
              <Link
                href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${entry.siren}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 13,
                  color: "var(--bleu-vif)",
                  textDecoration: "underline",
                }}
              >
                {t("city.slim.limits.cta_siren")} ↗
              </Link>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
