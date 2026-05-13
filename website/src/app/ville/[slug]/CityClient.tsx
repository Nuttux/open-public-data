"use client";
import { useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import ChartSource from "@/components/fusion/ChartSource";
import BarRow, { type BarRowItem } from "@/components/fusion/BarRow";
import DebtLineChart, { type DebtSeriesProp } from "@/components/fusion/DebtLineChart";
import FranceCitiesMap, { type FranceCityPoint } from "@/components/fusion/FranceCitiesMap";
import { useT, useLocale } from "@/lib/localeContext";
import type { City } from "@/lib/cities";
import type { CommuneData, CommuneMarches, KpiPoint } from "@/lib/commune-data";

type Unit = "total" | "perhab";

const fmtMillionsBig = (eur: number, locale: string) => {
  if (Math.abs(eur) >= 1e9) {
    return (eur / 1e9).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }
  return (eur / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
  });
};

const fmtUnitLabel = (eur: number, locale: string) => {
  if (Math.abs(eur) >= 1e9) return locale === "en" ? "B €" : "Md €";
  return locale === "en" ? "M €" : "M €";
};

const fmtInt = (n: number, locale: string) =>
  n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");

const fmtSigned = (n: number, locale: string) =>
  n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });

const latestPoint = (pts: KpiPoint[] | undefined) =>
  pts && pts.length ? pts[pts.length - 1] : undefined;

export default function CityClient({
  city,
  data,
  peers,
  marches,
  capDesend,
  allCities,
}: {
  city: City;
  data: CommuneData | null;
  peers: CommuneData[];
  marches: CommuneMarches | null;
  capDesend: { years: number; year: number } | null;
  allCities: City[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const [unit, setUnit] = useState<Unit>("perhab");
  const [mapKpi, setMapKpi] = useState<string>("encours_dette");

  // ─── Fallback if no OFGL data (shouldn't happen for the 10 registered cities) ──
  if (!data || !data.city.latest_year) {
    return (
      <div className="theme-fusion">
        <Navbar />
        <main id="main-content" tabIndex={-1} className="fx-wrap" style={{ padding: "80px 0 120px", minHeight: "60vh" }}>
          <SectionHead
            number="01"
            kind={t("city.section.kind")}
            title={city.nom}
            subtitle={
              <>
                {city.dep_name} · {city.reg_name} · INSEE {city.code_insee}
              </>
            }
          />
          <p style={{ marginTop: 24, color: "var(--muted)" }}>{t("city.no_data")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  const c = data.city;
  const labels = locale === "en" ? data.kpi_labels_en : data.kpi_labels_fr;
  const perimeterLabel =
    locale === "en" ? data.perimeter_label_en : data.perimeter_label_fr;
  const ly = c.latest_year!;

  const valueOf = (key: string, mode: Unit = unit) => {
    const pt = latestPoint(c.series[key]);
    if (!pt) return null;
    return mode === "perhab" ? pt.eur_hab : pt.montant;
  };

  const heroDepenses = valueOf("depenses_totales");
  const heroDette = valueOf("encours_dette");
  const heroPersonnel = valueOf("frais_personnel");
  const heroCapacite = valueOf("capacite_financement");

  const heroDepensesAbs = latestPoint(c.series.depenses_totales);
  const heroDetteAbs = latestPoint(c.series.encours_dette);
  const heroPersonnelAbs = latestPoint(c.series.frais_personnel);

  // ─── Sankey-like flow: revenue components → city → expense components ──
  // For V2-A we render this as a two-column comparison rather than full Sankey
  // (cleaner mobile, less ECharts overhead). Latest year only, in chosen unit.
  const buildBars = (keys: string[]): BarRowItem[] => {
    const rows = keys
      .map((k) => ({ key: k, value: valueOf(k) ?? 0, abs: latestPoint(c.series[k])?.montant ?? 0 }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return rows.map((r) => ({
      label: labels[r.key] ?? r.key,
      value: r.value,
      display: (
        <div style={{ textAlign: "right" }}>
          <div>
            {unit === "perhab"
              ? `${fmtInt(Math.round(r.value), locale)} €`
              : `${fmtMillionsBig(r.value, locale)}`}
            {unit === "total" && (
              <span className="fx-br-unit"> {fmtUnitLabel(r.value, locale)}</span>
            )}
          </div>
          {unit === "perhab" && r.abs && (
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginTop: 3 }}>
              ≈ {fmtMillionsBig(r.abs, locale)} {fmtUnitLabel(r.abs, locale)}
            </div>
          )}
        </div>
      ),
    }));
  };

  const revenueBars = buildBars([
    "impots_locaux",
    "concours_etat",
    "fiscalite_reversee",
    "subventions_recues",
    "ventes_services",
  ]);

  const expenseBars = buildBars([
    "frais_personnel",
    "achats_charges",
    "depenses_intervention",
    "depenses_equipement",
    "subventions_equipement",
    "charges_financieres",
    "remboursements_emprunts",
  ]);

  // ─── Evolution line chart ────────────────────────────────────────────
  const evoSeries: DebtSeriesProp[] = [
    {
      code: "S13",
      label: labels.depenses_totales,
      points: c.series.depenses_totales.map((p) => ({
        t: String(p.year),
        v: unit === "perhab" ? p.eur_hab : p.montant != null ? p.montant / 1e6 : null,
      })),
      emphasized: true,
    },
    {
      code: "S1311",
      label: labels.recettes_totales,
      points: c.series.recettes_totales.map((p) => ({
        t: String(p.year),
        v: unit === "perhab" ? p.eur_hab : p.montant != null ? p.montant / 1e6 : null,
      })),
    },
    {
      code: "S1313",
      label: labels.encours_dette,
      points: c.series.encours_dette.map((p) => ({
        t: String(p.year),
        v: unit === "perhab" ? p.eur_hab : p.montant != null ? p.montant / 1e6 : null,
      })),
    },
    {
      code: "S1314",
      label: labels.frais_personnel,
      points: c.series.frais_personnel.map((p) => ({
        t: String(p.year),
        v: unit === "perhab" ? p.eur_hab : p.montant != null ? p.montant / 1e6 : null,
      })),
    },
  ];

  // ─── Peer compare: this city vs other big cities, €/hab on key KPIs ──
  const PEER_KPIS = [
    { key: "depenses_totales", colorBucket: 0 },
    { key: "encours_dette", colorBucket: 1 },
    { key: "frais_personnel", colorBucket: 2 },
    { key: "impots_locaux", colorBucket: 3 },
  ];

  // ─── France map KPI: derive city points for the focal + all peers ──
  // We join `allCities` (registry with lat/lng) with the OFGL data already
  // loaded for the focal + peers.
  const allDataBySlug = new Map<string, CommuneData>();
  if (data) allDataBySlug.set(c.slug, data);
  for (const p of peers) allDataBySlug.set(p.city.slug, p);

  const peerCompareData = PEER_KPIS.map<{
    kpi_key: string;
    label: string;
    focal: number;
    all: Array<{ slug: string; nom: string; eur_hab: number; isFocal: boolean }>;
  }>(({ key }) => {
    const focal = latestPoint(c.series[key])?.eur_hab ?? 0;
    const others = peers
      .map((p) => {
        const pt = latestPoint(p.city.series[key]);
        return {
          slug: p.city.slug,
          nom: p.city.nom,
          eur_hab: pt?.eur_hab ?? 0,
        };
      })
      .filter((p) => p.eur_hab > 0)
      .sort((a, b) => b.eur_hab - a.eur_hab);
    const all = [{ slug: c.slug, nom: c.nom, eur_hab: focal, isFocal: true }, ...others.map((p) => ({ ...p, isFocal: false }))]
      .sort((a, b) => b.eur_hab - a.eur_hab);
    return { kpi_key: key, label: labels[key], focal, all };
  });

  return (
    <div className="theme-fusion">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 32px" }}>
          <SectionHead
            number="01"
            kind={t("city.section.kind")}
            title={c.nom}
            subtitle={
              <>
                {c.dep_name} · {c.reg_name} · INSEE {c.code_insee} ·{" "}
                {fmtInt(c.population_latest ?? 0, locale)} {t("city.hero.unit")}
              </>
            }
          />

          <div style={{ marginTop: 28 }}>
            <span className="fx-perimeter-badge">{perimeterLabel}</span>
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setUnit("perhab")}
              className={`fx-toggle-btn ${unit === "perhab" ? "is-active" : ""}`}
            >
              {t("city.toggle.perhab")}
            </button>
            <button
              type="button"
              onClick={() => setUnit("total")}
              className={`fx-toggle-btn ${unit === "total" ? "is-active" : ""}`}
            >
              {t("city.toggle.total")}
            </button>
          </div>

          {/* KPI grid (4 numbers) */}
          <div className="fx-kpi-grid" style={{ marginTop: 36 }}>
            <KpiCard
              label={labels.depenses_totales}
              value={heroDepenses}
              absolute={heroDepensesAbs?.montant ?? null}
              year={ly}
              unit={unit}
              locale={locale}
              isHero
            />
            <KpiCard
              label={labels.encours_dette}
              value={heroDette}
              absolute={heroDetteAbs?.montant ?? null}
              year={ly}
              unit={unit}
              locale={locale}
            />
            <KpiCard
              label={labels.frais_personnel}
              value={heroPersonnel}
              absolute={heroPersonnelAbs?.montant ?? null}
              year={ly}
              unit={unit}
              locale={locale}
            />
            <KpiCard
              label={labels.capacite_financement}
              value={heroCapacite}
              absolute={null}
              year={ly}
              unit={unit}
              locale={locale}
              signed
            />
          </div>
        </section>

        {/* Flow: revenues → city → expenses ─────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="02"
            kind={t("city.flow.kind")}
            title={t("city.flow.title").replace("{city}", c.nom)}
            subtitle={t("city.flow.subtitle")}
          />

          <div className="fx-flow-grid" style={{ marginTop: 32 }}>
            <div>
              <h3 className="fx-flow-side-title">{t("city.flow.side_revenue")}</h3>
              <BarRow items={revenueBars} />
            </div>
            <div>
              <h3 className="fx-flow-side-title">{t("city.flow.side_expense")}</h3>
              <BarRow items={expenseBars} />
            </div>
          </div>
          <ChartSource source={`${data.source} · ${ly}`} dataHref={data.source_url} methodAnchor="c-villes" />
        </section>

        {/* Evolution ────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 40px" }}>
          <SectionHead
            number="03"
            kind={t("city.evolution.kind")}
            title={t("city.evolution.title")}
            subtitle={t("city.evolution.subtitle").replace(
              "{first}",
              String(c.years[0] ?? 2014),
            ).replace("{last}", String(ly))}
          />

          <figure style={{ margin: "32px 0 0" }}>
            <DebtLineChart
              series={evoSeries}
              unitLabel={unit === "perhab" ? "€/hab" : "M €"}
              unitMode="pct"
              height={420}
            />
            <ChartSource
              source={`${data.source} · ${c.years[0] ?? 2014}–${ly}`}
              dataHref={data.source_url}
              methodAnchor="c-villes"
            />
          </figure>
        </section>

        {/* Capacité de désendettement (indicateur santé financière) ─── */}
        {capDesend && (
          <section className="fx-wrap" style={{ padding: "0 0 36px" }}>
            <div className="fx-cap-desend">
              <div className="fx-cap-desend-num tnum">
                {capDesend.years.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}
                <span className="fx-cap-desend-unit">
                  {capDesend.years > 1.5
                    ? t("city.capdesend.years")
                    : t("city.capdesend.year")}
                </span>
              </div>
              <div className="fx-cap-desend-text">
                <p className="fx-cap-desend-label">
                  {t("city.capdesend.label")}
                  <span className={`fx-cap-desend-tag tag-${capDesend.years < 8 ? "ok" : capDesend.years < 12 ? "warn" : "stress"}`}>
                    {capDesend.years < 8
                      ? t("city.capdesend.tag.ok")
                      : capDesend.years < 12
                      ? t("city.capdesend.tag.warn")
                      : t("city.capdesend.tag.stress")}
                  </span>
                </p>
                <p className="fx-cap-desend-help">
                  {t("city.capdesend.help")}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Peer compare ─────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "20px 0 80px" }}>
          <SectionHead
            number="04"
            kind={t("city.peers.kind")}
            title={t("city.peers.title").replace("{city}", c.nom)}
            subtitle={t("city.peers.subtitle").replace("{n}", String(peers.length))}
          />

          <div className="fx-peer-grid" style={{ marginTop: 32 }}>
            {peerCompareData.map((kpiRow) => {
              const max = Math.max(...kpiRow.all.map((p) => p.eur_hab)) * 1.05 || 1;
              return (
                <div key={kpiRow.kpi_key} className="fx-peer-block">
                  <h3 className="fx-peer-title">{kpiRow.label}</h3>
                  <p className="fx-peer-sub">€ par habitant · {ly}</p>
                  <div className="fx-peer-rows">
                    {kpiRow.all.map((p) => {
                      const w = (Math.abs(p.eur_hab) / max) * 100;
                      const isFocal = p.slug === c.slug;
                      return (
                        <div
                          key={p.slug}
                          className={`fx-peer-row ${isFocal ? "is-focal" : ""}`}
                        >
                          <span className="fx-peer-name">{p.nom}</span>
                          <span className="fx-peer-bar">
                            <span
                              className="fx-peer-fill"
                              style={{ width: `${w}%` }}
                            />
                          </span>
                          <span className="fx-peer-val tnum">
                            {fmtSigned(Math.round(p.eur_hab), locale)} €
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <ChartSource
            source={`${data.source} · ${ly} · 10 plus grandes communes`}
            dataHref={data.source_url}
            methodAnchor="c-villes"
          />

          <p style={{ marginTop: 24, maxWidth: 820, color: "var(--muted)", fontSize: 14 }}>
            {t("city.peers.notes")}
          </p>
        </section>

        {/* France map ──────────────────────────────────────────────── */}
        {(() => {
          const MAP_KPI_OPTIONS = [
            { key: "encours_dette", label: labels.encours_dette },
            { key: "depenses_totales", label: labels.depenses_totales },
            { key: "frais_personnel", label: labels.frais_personnel },
            { key: "impots_locaux", label: labels.impots_locaux },
          ];
          const cityPoints: FranceCityPoint[] = allCities
            .map((rc) => {
              const cdata = allDataBySlug.get(rc.slug);
              const pt = cdata
                ? latestPoint(cdata.city.series[mapKpi])
                : undefined;
              return {
                slug: rc.slug,
                nom: rc.nom,
                lat: rc.lat,
                lng: rc.lng,
                value: pt?.eur_hab ?? 0,
              };
            })
            .filter((p) => p.value > 0);

          if (cityPoints.length === 0) return null;
          return (
            <section className="fx-wrap" style={{ padding: "20px 0 80px" }}>
              <SectionHead
                number="05"
                kind={t("city.map.kind")}
                title={t("city.map.title").replace("{city}", c.nom)}
                subtitle={t("city.map.subtitle")}
              />

              <div
                style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                {MAP_KPI_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMapKpi(opt.key)}
                    className={`fx-toggle-btn ${mapKpi === opt.key ? "is-active" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <figure style={{ margin: "32px 0 0" }}>
                <FranceCitiesMap
                  cities={cityPoints}
                  focalSlug={c.slug}
                  kpiLabel={MAP_KPI_OPTIONS.find((o) => o.key === mapKpi)?.label ?? ""}
                  unitSuffix="€/hab"
                  locale={locale}
                />
                <ChartSource
                  source={`OFGL · ${ly} · 10 plus grandes communes`}
                  dataHref="https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/"
                  methodAnchor="c-villes"
                />
              </figure>
            </section>
          );
        })()}

        {/* Marchés publics ─────────────────────────────────────────── */}
        {marches && marches.aggregates.total_count > 0 && (
          <section className="fx-wrap" style={{ padding: "20px 0 80px" }}>
            <SectionHead
              number="06"
              kind={t("city.marches.kind")}
              title={t("city.marches.title").replace("{city}", c.nom)}
              subtitle={t("city.marches.subtitle")
                .replace("{n}", fmtInt(marches.aggregates.total_count, locale))
                .replace("{coverage}", String(marches.aggregates.coverage_pct))}
            />

            <div className="fx-marches-stats" style={{ marginTop: 28 }}>
              <div className="fx-marches-stat">
                <p className="fx-marches-stat-label">{t("city.marches.stat.total_montant")}</p>
                <p className="fx-marches-stat-value tnum">
                  {fmtMillionsBig(marches.aggregates.total_montant, locale)}
                  <span className="fx-marches-stat-unit">
                    {fmtUnitLabel(marches.aggregates.total_montant, locale)}
                  </span>
                </p>
                <p className="fx-marches-stat-help">
                  {t("city.marches.stat.total_help").replace(
                    "{years}",
                    String((marches.aggregates.by_year[marches.aggregates.by_year.length - 1]?.year ?? 0) - (marches.aggregates.by_year[0]?.year ?? 0) + 1),
                  )}
                </p>
              </div>
              <div className="fx-marches-stat">
                <p className="fx-marches-stat-label">{t("city.marches.stat.total_count")}</p>
                <p className="fx-marches-stat-value tnum">
                  {fmtInt(marches.aggregates.total_count, locale)}
                </p>
                <p className="fx-marches-stat-help">
                  {t("city.marches.stat.coverage").replace("{pct}", String(marches.aggregates.coverage_pct))}
                </p>
              </div>
            </div>

            <h3 className="fx-marches-h3">
              {t("city.marches.top_h3").replace(
                "{n}",
                String(marches.aggregates.top_titulaires.length),
              ).replace("{years}", String(marches.aggregates.top_titulaires_window_years))}
            </h3>
            <BarRow
              items={marches.aggregates.top_titulaires.map((tit) => ({
                label: (
                  <div>
                    <div>{tit.nom === "?" ? t("city.marches.unknown") : tit.nom}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400, marginTop: 3 }}>
                      {tit.count} {tit.count > 1 ? t("city.marches.contracts") : t("city.marches.contract")}
                      {tit.id !== "?" && (
                        <>
                          {" · SIRET "}
                          {tit.id}
                        </>
                      )}
                    </div>
                  </div>
                ),
                value: tit.montant,
                display: (
                  <div style={{ textAlign: "right" }}>
                    <div>
                      {fmtMillionsBig(tit.montant, locale)}
                      <span className="fx-br-unit"> {fmtUnitLabel(tit.montant, locale)}</span>
                    </div>
                  </div>
                ),
              }))}
            />
            <ChartSource source={marches.source} dataHref={marches.source_url} methodAnchor="c-villes" />

            <p style={{ marginTop: 18, maxWidth: 820, color: "var(--muted)", fontSize: 14 }}>
              {locale === "en" ? marches.notes_en : marches.notes_fr}
            </p>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// KpiCard — small reusable card for the hero row
// ──────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  absolute,
  year,
  unit,
  locale,
  isHero = false,
  signed = false,
}: {
  label: string;
  value: number | null;
  absolute: number | null;
  year: number;
  unit: Unit;
  locale: string;
  isHero?: boolean;
  signed?: boolean;
}) {
  if (value == null) {
    return (
      <div className={`fx-kpi-card ${isHero ? "is-hero" : ""}`}>
        <p className="fx-kpi-label">{label}</p>
        <p className="fx-kpi-value">—</p>
      </div>
    );
  }
  const main =
    unit === "perhab"
      ? signed
        ? fmtSigned(Math.round(value), locale)
        : fmtInt(Math.round(value), locale)
      : fmtMillionsBig(value, locale);
  const mainUnit =
    unit === "perhab" ? "€/hab" : fmtUnitLabel(value, locale);

  return (
    <div className={`fx-kpi-card ${isHero ? "is-hero" : ""}`}>
      <p className="fx-kpi-label">{label}</p>
      <p className="fx-kpi-value tnum">
        {main}
        <span className="fx-kpi-unit">{mainUnit}</span>
      </p>
      {unit === "perhab" && absolute != null && (
        <p className="fx-kpi-aside tnum">
          ≈ {fmtMillionsBig(absolute, locale)} {fmtUnitLabel(absolute, locale)}
        </p>
      )}
      <p className="fx-kpi-year">· {year}</p>
    </div>
  );
}
