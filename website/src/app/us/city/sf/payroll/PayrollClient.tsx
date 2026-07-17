"use client";

import { useMemo, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow from "@/components/fusion/BarRow";
import DistributionStrip from "@/components/us/DistributionStrip";
import Fy2018Note from "@/components/us/Fy2018Note";
import { useT } from "@/lib/localeContext";
import {
  fmtUsd,
  fmtUsdCompact,
  fmtShare,
  fmtYoy,
  fmtDateLong,
} from "@/lib/us/format";
import UsOtChart from "./UsOtChart";
import CompSplit from "./CompSplit";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
} from "./payroll-types";

/**
 * /us/city/sf/payroll — EN-only page (ADR-0010 D3). All copy goes through
 * `us.sf.payroll.*` keys whose EN and FR values are identical English.
 * Every number renders from the four payroll exports; arithmetic here is
 * limited to shares/ratios of exported values (e.g. "overtime tripled" =
 * last/first of the exported series).
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** $250k-style tick (thousands stay short on the axis). */
function fmtUsdTick(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${nfInt.format(n)}`;
}

function SourceLine({
  label,
  links,
  dataWord,
}: {
  label: string;
  links: Array<{ name: string; href: string }>;
  dataWord: string;
}) {
  return (
    <figcaption className="fx-chart-source">
      <b>{label}:</b>{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && <span className="sep">·</span>}
          {l.name}{" "}
          <a href={l.href} target="_blank" rel="noopener noreferrer">
            {dataWord} ↗
          </a>
        </span>
      ))}
    </figcaption>
  );
}

export default function PayrollClient({
  byYear,
  byDept,
  distribution,
  overtime,
}: {
  byYear: PayrollByYear;
  byDept: PayrollByDept;
  distribution: PayrollDistribution;
  overtime: PayrollOvertime;
}) {
  const t = useT();
  const [metric, setMetric] = useState<"usd" | "headcount">("usd");

  const points = byYear.points;
  const latest = points[points.length - 1];
  const first = points[0];
  const fy = latest.fiscal_year;

  // ── 02 · departments & org groups (latest FY) ──
  const deptLatest = useMemo(
    () =>
      byDept.departments
        .map((d) => {
          const p = d.series.find((s) => s.fiscal_year === fy);
          return p ? { ...d, p } : null;
        })
        .filter((d): d is NonNullable<typeof d> => d !== null),
    [byDept, fy],
  );
  const rankedDepts = useMemo(
    () =>
      [...deptLatest].sort((a, b) =>
        metric === "usd"
          ? b.p.total_compensation_usd - a.p.total_compensation_usd
          : b.p.n_employees - a.p.n_employees,
      ),
    [deptLatest, metric],
  );
  const orgLatest = useMemo(
    () =>
      byDept.organization_groups
        .map((g) => ({ ...g, y: g.years[String(fy)] }))
        .filter((g) => g.y)
        .sort((a, b) =>
          metric === "usd"
            ? b.y.total_compensation_usd - a.y.total_compensation_usd
            : b.y.n_employees_listed - a.y.n_employees_listed,
        ),
    [byDept, fy, metric],
  );

  // ── 03 · overtime ──
  const otLatest = overtime.citywide[overtime.citywide.length - 1];
  const otFirst = overtime.citywide[0];
  const police = overtime.departments.find((d) => d.department_code === "POL");
  const policeFirst = police?.series[0];
  const policeLast = police?.series[police.series.length - 1];
  const otDeptRanking = useMemo(
    () =>
      overtime.departments
        .map((d) => ({ ...d, last: d.series[d.series.length - 1] }))
        .filter((d) => d.last && d.last.fiscal_year === fy)
        .sort((a, b) => b.last.overtime_usd - a.last.overtime_usd),
    [overtime, fy],
  );

  // ── 04 · distribution ──
  const distPoints = distribution.points.map((p) => ({
    year: p.fiscal_year,
    n_employees: p.n_employees,
    p25_usd: p.p25_usd,
    p50_usd: p.p50_usd,
    p75_usd: p.p75_usd,
    p90_usd: p.p90_usd,
    p99_usd: p.p99_usd,
    histogram: p.histogram,
  }));
  const distLatest = distribution.points[distribution.points.length - 1];
  const distFirst = distribution.points[0];
  const under25kShare =
    distLatest.histogram[0].n_employees / distLatest.n_employees;
  const highTitles = distribution.high_earners.titles.filter((x) => !x.is_remainder);
  const highRemainder = distribution.high_earners.titles.find((x) => x.is_remainder);

  const mtLinks = [{ name: byYear.source.name, href: byYear.source.source_url }];
  const dataWord = t("us.sf.payroll.data_link");
  const srcLabel = t("us.sf.payroll.source_label");

  const toggleBtn = (key: "usd" | "headcount", label: string) => (
    <button
      type="button"
      aria-pressed={metric === key}
      onClick={() => setMetric(key)}
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 11.5,
        padding: "5px 10px",
        border: "1px solid #0a0a0a",
        background: metric === key ? "#0a0a0a" : "transparent",
        color: metric === key ? "#fff" : "#0a0a0a",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="theme-fusion">
      <main id="main-content" tabIndex={-1}>
        {/* ── Page header ── */}
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">
              {fill(t("us.sf.payroll.kicker"), { fy })}
            </div>
            <h1 className="fx-page-title">
              {t("us.sf.payroll.title.before")}
              <em>{t("us.sf.payroll.title.em")}</em>
              {t("us.sf.payroll.title.after")}
            </h1>
            <p className="fx-page-lede">{t("us.sf.payroll.lede")}</p>
            <p className="fx-page-source">
              {fill(t("us.sf.payroll.asof"), {
                date: byYear.as_of ? fmtDateLong(byYear.as_of.slice(0, 10)) : "",
                y0: first.fiscal_year,
                y1: fy,
              })}
            </p>
          </div>
        </section>

        {/* ── 01 · The typical employee ── */}
        <section className="fx-section" id="sec-typical">
          <div className="fx-wrap">
            <SectionHead
              number="01"
              kind={t("us.sf.payroll.s01.kind")}
              title={
                <>
                  {t("us.sf.payroll.s01.title.before")}
                  <em>{t("us.sf.payroll.s01.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.payroll.s01.sub"), {
                n: nfInt.format(latest.n_employees),
                fy,
              })}
            />
            <div className="fx-overview">
              <HeroNumber
                label={fill(t("us.sf.payroll.s01.hero.label"), { fy })}
                value={
                  <AnimatedNumber
                    value={latest.median_total_comp_usd}
                    format={(n) => fmtUsd(n)}
                  />
                }
                delta={{
                  direction: "up",
                  value: fmtYoy(
                    latest.median_total_comp_usd / first.median_total_comp_usd - 1,
                  ),
                  base: fill(t("us.sf.payroll.s01.hero.delta_base"), {
                    y0: first.fiscal_year,
                    median0: fmtUsd(first.median_total_comp_usd),
                  }),
                }}
                caption={t("us.sf.payroll.s01.hero.cap")}
              />
              <KPIGrid
                cols={3}
                items={[
                  {
                    label: fill(t("us.sf.payroll.s01.kpi.total"), { fy }),
                    value: (
                      <AnimatedNumber
                        value={latest.total_compensation_usd}
                        format={(n) => fmtUsdCompact(n)}
                      />
                    ),
                    delta: fill(t("us.sf.payroll.s01.kpi.total_note"), {
                      growth: fmtYoy(
                        latest.total_compensation_usd / first.total_compensation_usd - 1,
                      ),
                      y0: first.fiscal_year,
                    }),
                  },
                  {
                    label: t("us.sf.payroll.s01.kpi.people"),
                    value: (
                      <AnimatedNumber
                        value={latest.n_employees}
                        format={(n) => nfInt.format(n)}
                      />
                    ),
                    delta: fill(t("us.sf.payroll.s01.kpi.people_note"), {
                      growth: fmtYoy(latest.n_employees / first.n_employees - 1),
                      y0: first.fiscal_year,
                    }),
                  },
                  {
                    label: t("us.sf.payroll.s01.kpi.pr"),
                    value:
                      latest.per_resident_usd != null ? (
                        <AnimatedNumber
                          value={latest.per_resident_usd}
                          format={(n) => fmtUsd(n)}
                        />
                      ) : (
                        "—"
                      ),
                    delta:
                      latest.employees_per_1k_residents != null
                        ? fill(t("us.sf.payroll.s01.kpi.pr_note"), {
                            per1k: latest.employees_per_1k_residents.toFixed(0),
                          })
                        : undefined,
                  },
                ]}
              />
            </div>
            <p className="fx-note">{byYear.perimeter}</p>
            <SourceLine label={srcLabel} links={mtLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 02 · Where the people are ── */}
        <section className="fx-section" id="sec-departments">
          <div className="fx-wrap">
            <SectionHead
              number="02"
              kind={t("us.sf.payroll.s02.kind")}
              title={
                <>
                  {t("us.sf.payroll.s02.title.before")}
                  <em>{t("us.sf.payroll.s02.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.payroll.s02.sub"), {
                nDepts: deptLatest.length,
                nGroups: orgLatest.length,
                fy,
              })}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {toggleBtn("usd", t("us.sf.payroll.s02.toggle.usd"))}
              {toggleBtn("headcount", t("us.sf.payroll.s02.toggle.headcount"))}
            </div>
            <BarRow
              header={{
                left: t("us.sf.payroll.s02.orghead.left"),
                right:
                  metric === "usd"
                    ? t("us.sf.payroll.s02.orghead.right_usd")
                    : t("us.sf.payroll.s02.orghead.right_n"),
              }}
              items={orgLatest.map((g) => ({
                label: g.organization_group,
                value:
                  metric === "usd"
                    ? g.y.total_compensation_usd
                    : g.y.n_employees_listed,
                display:
                  metric === "usd"
                    ? fmtUsdCompact(g.y.total_compensation_usd)
                    : nfInt.format(g.y.n_employees_listed),
                sub: fill(
                  t(
                    g.y.n_departments === 1
                      ? "us.sf.payroll.s02.org.sub_one"
                      : "us.sf.payroll.s02.org.sub",
                  ),
                  {
                    nDepts: g.y.n_departments,
                    other:
                      metric === "usd"
                        ? nfInt.format(g.y.n_employees_listed)
                        : fmtUsdCompact(g.y.total_compensation_usd),
                  },
                ),
              }))}
            />
            <div style={{ marginTop: 30 }}>
              <BarRow
                reveal
                header={{
                  left: t("us.sf.payroll.s02.depthead.left"),
                  right:
                    metric === "usd"
                      ? t("us.sf.payroll.s02.orghead.right_usd")
                      : t("us.sf.payroll.s02.orghead.right_n"),
                }}
                items={rankedDepts.slice(0, 15).map((d) => ({
                  label: d.department,
                  value:
                    metric === "usd"
                      ? d.p.total_compensation_usd
                      : d.p.n_employees,
                  display:
                    metric === "usd"
                      ? fmtUsdCompact(d.p.total_compensation_usd)
                      : nfInt.format(d.p.n_employees),
                  sub: fill(t("us.sf.payroll.s02.dept.sub"), {
                    group: d.organization_group,
                    n: nfInt.format(d.p.n_employees),
                    median: fmtUsd(d.p.median_total_comp_usd),
                  }),
                }))}
              />
            </div>
            <p className="fx-note">
              {fill(t("us.sf.payroll.s02.more"), {
                shown: Math.min(15, rankedDepts.length),
                total: deptLatest.length,
              })}{" "}
              {byDept.fold_note}
            </p>
            <SourceLine label={srcLabel} links={mtLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 03 · The overtime lens ── */}
        <section className="fx-section" id="sec-overtime">
          <div className="fx-wrap">
            <SectionHead
              number="03"
              kind={t("us.sf.payroll.s03.kind")}
              title={
                <>
                  {t("us.sf.payroll.s03.title.before")}
                  <em>{t("us.sf.payroll.s03.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.payroll.s03.sub"), {
                ot: fmtUsdCompact(otLatest.overtime_usd),
                fy,
                share: fmtShare(otLatest.ot_share_of_comp),
                share0: fmtShare(otFirst.ot_share_of_comp),
                y0: otFirst.fiscal_year,
              })}
            />
            <KPIGrid
              cols={3}
              items={[
                {
                  label: fill(t("us.sf.payroll.s03.kpi.total"), { fy }),
                  value: (
                    <AnimatedNumber
                      value={otLatest.overtime_usd}
                      format={(n) => fmtUsdCompact(n)}
                    />
                  ),
                  delta: fill(t("us.sf.payroll.s03.kpi.total_note"), {
                    share: fmtShare(otLatest.ot_share_of_comp),
                  }),
                },
                {
                  label: t("us.sf.payroll.s03.kpi.counter"),
                  value: (
                    <AnimatedNumber
                      value={otLatest.n_ot_exceeds_salary_floored}
                      format={(n) => nfInt.format(n)}
                    />
                  ),
                  delta: fill(t("us.sf.payroll.s03.kpi.counter_note"), {
                    n0: otFirst.n_ot_exceeds_salary_floored,
                    y0: otFirst.fiscal_year,
                  }),
                },
                {
                  label:
                    policeFirst && policeLast
                      ? fill(t("us.sf.payroll.s03.kpi.police"), {
                          y0: policeFirst.fiscal_year,
                        })
                      : "",
                  value:
                    policeFirst && policeLast
                      ? `×${(policeLast.overtime_usd / policeFirst.overtime_usd).toFixed(1)}`
                      : "—",
                  delta:
                    policeFirst && policeLast
                      ? fill(t("us.sf.payroll.s03.kpi.police_note"), {
                          ot0: fmtUsdCompact(policeFirst.overtime_usd),
                          ot1: fmtUsdCompact(policeLast.overtime_usd),
                        })
                      : undefined,
                },
              ]}
            />
            {policeFirst && policeLast && (
              <div className="fx-callout" style={{ marginTop: 24 }}>
                <b>{t("us.sf.payroll.s03.story.title")}</b>{" "}
                {fill(t("us.sf.payroll.s03.story.body"), {
                  y0: policeFirst.fiscal_year,
                  fy,
                  ot0: fmtUsdCompact(policeFirst.overtime_usd),
                  ot1: fmtUsdCompact(policeLast.overtime_usd),
                  n0: nfInt.format(policeFirst.n_employees),
                  n1: nfInt.format(policeLast.n_employees),
                })}{" "}
                {overtime.framing_note}
              </div>
            )}
            <div style={{ marginTop: 26 }}>
              <UsOtChart
                departments={overtime.departments.slice(0, 6)}
                ariaLabel={fill(t("us.sf.payroll.s03.chart.aria"), {
                  n: Math.min(6, overtime.departments.length),
                })}
              />
            </div>
            <p className="fx-note">{overtime.dept_series_note}</p>
            <div style={{ marginTop: 26 }}>
              <BarRow
                header={{
                  left: fill(t("us.sf.payroll.s03.rankhead.left"), { fy }),
                  right: t("us.sf.payroll.s03.rankhead.right"),
                }}
                items={otDeptRanking.map((d) => ({
                  label: d.department,
                  value: d.last.overtime_usd,
                  display: fmtUsdCompact(d.last.overtime_usd),
                  sub: fill(t("us.sf.payroll.s03.rank.sub"), {
                    share: fmtShare(d.last.ot_share_of_comp),
                    n: nfInt.format(d.last.n_employees),
                  }),
                }))}
              />
            </div>
            <div style={{ marginTop: 26 }}>
              <BarRow
                header={{
                  left: fill(t("us.sf.payroll.s03.titlehead.left"), { fy }),
                  right: t("us.sf.payroll.s03.titlehead.right"),
                }}
                items={overtime.top_titles.slice(0, 6).map((x) => ({
                  label: x.job_title,
                  value: x.overtime_usd,
                  display: fmtUsdCompact(x.overtime_usd),
                  sub: fill(t("us.sf.payroll.s03.title.sub"), {
                    earners: nfInt.format(x.n_ot_earners),
                    avg: fmtUsd(x.avg_ot_per_ot_earner_usd),
                  }),
                }))}
              />
            </div>
            <p className="fx-note">
              {fill(t("us.sf.payroll.s03.counter_floor"), {
                floor: fmtUsd(overtime.ot_salary_floor_usd),
                naive: nfInt.format(otLatest.n_ot_exceeds_salary_naive),
                floored: nfInt.format(otLatest.n_ot_exceeds_salary_floored),
                fy,
              })}
            </p>
            <SourceLine label={srcLabel} links={mtLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 04 · What city work pays ── */}
        <section className="fx-section" id="sec-distribution">
          <div className="fx-wrap">
            <SectionHead
              number="04"
              kind={t("us.sf.payroll.s04.kind")}
              title={
                <>
                  {t("us.sf.payroll.s04.title.before")}
                  <em>{t("us.sf.payroll.s04.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.payroll.s04.sub"), {
                p25: fmtUsd(distLatest.p25_usd),
                p75: fmtUsd(distLatest.p75_usd),
                p99: fmtUsd(distLatest.p99_usd),
                fy,
              })}
            />
            <DistributionStrip
              points={distPoints}
              fmtUsd={fmtUsd}
              fmtUsdTick={fmtUsdTick}
              fmtCount={(n) => nfInt.format(n)}
              labels={{
                chartAria: (year, n) =>
                  fill(t("us.sf.payroll.s04.chart.aria"), { year, n }),
                scrubAria: t("us.sf.payroll.s04.scrub.aria"),
                median: t("us.sf.payroll.s04.median"),
                p25: t("us.sf.payroll.s04.p25"),
                p99: t("us.sf.payroll.s04.p99"),
                employees: t("us.sf.payroll.s04.employees"),
                openBucket: (floor) =>
                  fill(t("us.sf.payroll.s04.open_bucket"), { floor }),
              }}
              annotation={
                <p className="fx-note" style={{ marginTop: 14 }}>
                  {fill(t("us.sf.payroll.s04.parttime"), {
                    share: fmtShare(under25kShare),
                    fy,
                  })}{" "}
                  {distribution.percentile_note}
                </p>
              }
            />
            <div className="fx-callout" style={{ marginTop: 24 }}>
              <b>
                {fill(t("us.sf.payroll.s04.high.title"), {
                  n: nfInt.format(distLatest.n_above_400k),
                  fy,
                })}
              </b>{" "}
              {fill(t("us.sf.payroll.s04.high.body"), {
                n0: nfInt.format(distFirst.n_above_400k),
                y0: distFirst.fiscal_year,
                n500: nfInt.format(distLatest.n_above_500k),
              })}
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {highTitles.map((x) => (
                  <span
                    key={x.job_title}
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11.5,
                      border: "1px solid var(--rule)",
                      padding: "3px 8px",
                    }}
                  >
                    {x.job_title} <b>{x.n_employees}</b>
                  </span>
                ))}
                {highRemainder && (
                  <span
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11.5,
                      padding: "3px 8px",
                      color: "var(--muted)",
                    }}
                  >
                    {fill(t("us.sf.payroll.s04.high.other"), {
                      n: nfInt.format(highRemainder.n_employees),
                    })}
                  </span>
                )}
              </div>
            </div>
            <SourceLine label={srcLabel} links={mtLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 05 · Salary, overtime, benefits ── */}
        <section className="fx-section" id="sec-split">
          <div className="fx-wrap">
            <SectionHead
              number="05"
              kind={t("us.sf.payroll.s05.kind")}
              title={
                <>
                  {t("us.sf.payroll.s05.title.before")}
                  <em>{t("us.sf.payroll.s05.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.payroll.s05.sub"), {
                benefits: fmtUsdCompact(latest.total_benefits_usd),
                share: fmtShare(latest.total_benefits_usd / latest.total_compensation_usd),
                fy,
              })}
            />
            <CompSplit
              points={points}
              labels={{
                salaries: t("us.sf.payroll.s05.leg.salaries"),
                overtime: t("us.sf.payroll.s05.leg.overtime"),
                other: t("us.sf.payroll.s05.leg.other"),
                benefits: t("us.sf.payroll.s05.leg.benefits"),
              }}
              fmtUsdCompact={fmtUsdCompact}
              fmtShare={fmtShare}
              ariaLabel={t("us.sf.payroll.s05.aria")}
            />
            <SourceLine label={srcLabel} links={mtLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── Sources & method ── */}
        <section className="fx-footer-sources" id="sec-sources">
          <div className="fx-wrap">
            <div className="fx-footer-sources-head">
              <span className="fx-footer-sources-label">
                {t("us.sf.payroll.s06.label")}
              </span>
            </div>
            <p className="fx-footer-sources-meta">
              <b>{t("us.sf.payroll.s06.privacy_label")}</b>: {byYear.privacy.rule}{" "}
              {byYear.privacy.measured_cost} {byYear.privacy.count_only_disclosures}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.sf.payroll.s06.basis_label")}</b>: {byYear.fiscal_year_note}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.sf.payroll.s06.median_label")}</b>: {byYear.median_note}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.sf.payroll.s06.ot_label")}</b>: {byYear.ot_counter_note}
            </p>
            <div style={{ margin: "14px 0" }}>
              <Fy2018Note
                extra={
                  <>
                    {" "}
                    {t("us.sf.payroll.s06.breaks")}
                  </>
                }
              />
            </div>
            <p className="fx-footer-sources-meta">
              <b>{t("us.sf.payroll.s06.population_label")}</b>:{" "}
              {byYear.population.note}{" "}
              {byYear.population.source_url && (
                <a
                  href={byYear.population.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {byYear.population.source} ↗
                </a>
              )}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{srcLabel}</b>:{" "}
              <a
                href={byYear.source.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {byYear.source.name} ({byYear.source.dataset_id}) ↗
              </a>{" "}
              — {byYear.source.attribution}
            </p>
            <p
              className="fx-footer-sources-meta"
              style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}
            >
              {fill(t("us.sf.payroll.s06.generated"), {
                ts: fmtDateLong(byYear.generated_at.slice(0, 10)),
              })}{" "}
              <span className="sep">·</span> {byYear.source_pipeline}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
