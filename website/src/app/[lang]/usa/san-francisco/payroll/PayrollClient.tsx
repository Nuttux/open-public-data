"use client";

import Link from "@/components/LocalizedLink";
import { useMemo, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import PageHook from "@/components/fusion/PageHook";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import Tip from "@/components/fusion/Tip";
import DistributionStrip from "@/components/us/DistributionStrip";
import SfMoneyBar from "@/components/us/SfMoneyBar";
import SfPayLadder from "@/components/us/SfPayLadder";
import SfBucketComposition from "@/components/us/SfBucketComposition";
import ChartSource from "@/components/fusion/ChartSource";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { useT } from "@/lib/localeContext";
import { areaSlug, familySlug, payrollDeptSlug } from "@/lib/us/sf-payroll-slugs";
import {
  fmtUsd,
  fmtUsdCompact,
  fmtShare,
  fmtDateLong,
} from "@/lib/us/format";
import UsOtChart from "./UsOtChart";
import UsFamilyChart from "./UsFamilyChart";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
  PayrollByFamilyCitywide,
  PayrollFamilyDistRow,
} from "./payroll-types";

/**
 * /us/city/sf/payroll — EN-only page (ADR-0010 D3). All copy goes through
 * `us.sf.payroll.*` keys whose EN and FR values are identical English.
 * Every number renders from the payroll exports; arithmetic here is limited
 * to shares/ratios of exported values (e.g. "overtime tripled" = last/first
 * of the exported series).
 *
 * SHAPE OF THE PAGE. Three sections; every list that restated the chart above
 * it is gone, because the rows worth reading live in the entity's own fiche.
 *   1. what the city pays, by kind of work — ONE lens (kind of work / service
 *      area / department) driving both the 13-year trajectory and the FY
 *      composition bar, every slice a fiche;
 *   2. the overtime lens — the departmental curves, and a line of links out;
 *   3. the spread — one chart, two views: everyone (histogram, click a band
 *      to see who is in it) or by kind of work (the pay ladder).
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

/** Slices drawn on the composition bar; the rest folds into "Other". */
const BAR_SLICES = 8;

type Lens = "area" | "dept" | "family";
type Metric = "usd" | "headcount";
/** The spread reads two ways off the same year: everyone, or by kind of work. */
type SpreadView = "all" | "family";

export default function PayrollClient({
  byYear,
  byDept,
  distribution,
  overtime,
  byFamily,
  familyDistribution,
  familyDistNotes,
}: {
  byYear: PayrollByYear;
  byDept: PayrollByDept;
  distribution: PayrollDistribution;
  overtime: PayrollOvertime;
  byFamily: PayrollByFamilyCitywide;
  /** The distribution cut by job family — the pay ladder and the "who is
   *  paid in this band" panel both read this. Keyed by fiscal year. */
  familyDistribution: Record<string, PayrollFamilyDistRow[]>;
  familyDistNotes: { ladder: string; attribution: string };
}) {
  const t = useT();
  const [lens, setLens] = useState<Lens>("family");
  const [metric, setMetric] = useState<Metric>("usd");
  const [spreadView, setSpreadView] = useState<SpreadView>("all");
  const [bucketFloor, setBucketFloor] = useState<number | null>(null);
  const [distYear, setDistYear] = useState<number | null>(null);

  const points = byYear.points;
  const latest = points[points.length - 1];
  const first = points[0];
  const fy = latest.fiscal_year;

  // ── job families (citywide, over time) ──
  const TRAJECTORY_TOP_N = 8;
  const familyYears = useMemo(
    () => Object.keys(byFamily.years).map(Number).sort((a, b) => a - b),
    [byFamily],
  );
  const familyLatest = useMemo(
    () => byFamily.years[String(fy)] ?? [],
    [byFamily, fy],
  );

  // ── departments & service areas (latest FY) ──
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
  const orgLatest = useMemo(
    () =>
      byDept.organization_groups
        .map((g) => ({ ...g, y: g.years[String(fy)] }))
        .filter((g) => g.y),
    [byDept, fy],
  );

  /**
   * The trajectory, cut the same way as the bar below it — one lens drives
   * both, so "kind of work" reads as a growth curve and an exact FY share
   * without switching sections. Capped at the biggest N of the latest year so
   * the stack stays readable (6 service areas are always all drawn; 51
   * departments never are).
   */
  const trajectory = useMemo(() => {
    if (lens === "area") {
      return orgLatest
        .slice()
        .sort((a, b) => b.y.total_compensation_usd - a.y.total_compensation_usd)
        .map((g) => ({
          family: g.organization_group,
          series: Object.entries(g.years)
            .map(([y, v]) => ({ fiscal_year: Number(y), value: v.total_compensation_usd }))
            .sort((a, b) => a.fiscal_year - b.fiscal_year),
        }));
    }
    if (lens === "dept") {
      return deptLatest
        .slice()
        .sort((a, b) => b.p.total_compensation_usd - a.p.total_compensation_usd)
        .slice(0, TRAJECTORY_TOP_N)
        .map((d) => ({
          family: d.department,
          series: d.series
            .map((pt) => ({ fiscal_year: pt.fiscal_year, value: pt.total_compensation_usd }))
            .sort((a, b) => a.fiscal_year - b.fiscal_year),
        }));
    }
    return familyLatest.slice(0, TRAJECTORY_TOP_N).map((f) => ({
      family: f.display_family,
      series: familyYears
        .map((y) => {
          const row = (byFamily.years[String(y)] ?? []).find(
            (r) => r.display_family === f.display_family,
          );
          return row ? { fiscal_year: y, value: row.total_compensation_usd } : null;
        })
        .filter((x): x is { fiscal_year: number; value: number } => x !== null),
    }));
  }, [lens, orgLatest, deptLatest, familyLatest, familyYears, byFamily]);

  // ── the one composition bar, three lenses ──
  const allSlices = useMemo(() => {
    const list =
      lens === "area"
        ? orgLatest.map((g) => ({
            label: g.organization_group,
            amount:
              metric === "usd" ? g.y.total_compensation_usd : g.y.n_employees_listed,
            count: g.y.n_employees_listed,
            href: `/usa/san-francisco/payroll/area/${areaSlug(g.organization_group)}`,
          }))
        : lens === "dept"
          ? deptLatest.map((d) => ({
              label: d.department,
              amount: metric === "usd" ? d.p.total_compensation_usd : d.p.n_employees,
              count: d.p.n_employees,
              href: `/usa/san-francisco/payroll/dept/${payrollDeptSlug(d.department_code)}`,
            }))
          : familyLatest.map((f) => ({
              label: f.display_family,
              amount: metric === "usd" ? f.total_compensation_usd : f.n_employees,
              count: f.n_employees,
              href: `/usa/san-francisco/payroll/family/${familySlug(f.display_family)}`,
            }));
    return [...list].sort((a, b) => b.amount - a.amount);
  }, [lens, metric, orgLatest, deptLatest, familyLatest]);
  const slices = useMemo(() => allSlices.slice(0, BAR_SLICES), [allSlices]);

  /**
   * The denominator, and the one place this page could quietly lie.
   *
   * DOLLARS partition: every dollar sits in exactly one department, so the
   * citywide total is the right whole and the gap vs the drawn slices is
   * real — department-years below the publication threshold, folded into
   * citywide totals and never listed. That gap IS the grey slice.
   *
   * PEOPLE DO NOT partition: an employee who worked in two departments (or
   * two job families) is counted in each, so the rows sum ABOVE the citywide
   * headcount — 41,863 listed positions against 40,786 people in FY2025.
   * Using the citywide count as the denominator would silently absorb that
   * 1,077 overcount into the grey slice and understate the departments not
   * drawn. In headcount mode the whole is therefore the sum of the lens's own
   * rows, so the grey slice is exactly "the entities not drawn".
   */
  const barTotal =
    metric === "usd"
      ? latest.total_compensation_usd
      : allSlices.reduce((sum, x) => sum + x.amount, 0);

  const lensCounts = {
    area: orgLatest.length,
    dept: deptLatest.length,
    family: familyLatest.length,
  };
  const topThreeShare =
    barTotal > 0
      ? slices.slice(0, 3).reduce((s, x) => s + x.amount, 0) / barTotal
      : 0;

  // ── overtime ──
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
  // ── distribution ──
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

  // ── the pay ladder + the selected band's composition ──
  const activeDistYear = distYear ?? fy;
  const famDistRows = useMemo(
    () => familyDistribution[String(activeDistYear)] ?? [],
    [familyDistribution, activeDistYear],
  );
  const ladderRows = useMemo(
    () =>
      famDistRows
        .filter((r) => !r.is_pooled && r.p50_usd != null && r.n_people != null)
        .map((r) => ({
          family: r.display_family,
          n_people: r.n_people as number,
          p25_usd: r.p25_usd as number,
          p50_usd: r.p50_usd as number,
          p75_usd: r.p75_usd as number,
          p90_usd: r.p90_usd as number,
          href: `/usa/san-francisco/payroll/family/${familySlug(r.display_family)}`,
        }))
        .sort((a, b) => b.p50_usd - a.p50_usd),
    [famDistRows],
  );
  const distYearPoint =
    distribution.points.find((p) => p.fiscal_year === activeDistYear) ?? distLatest;
  const selectedBucket =
    bucketFloor == null
      ? null
      : distYearPoint.histogram.find((b) => b.floor_usd === bucketFloor) ?? null;
  const bucketRows = useMemo(() => {
    if (bucketFloor == null) return [];
    return famDistRows
      .map((r) => {
        const cell = r.histogram.find((b) => b.floor_usd === bucketFloor);
        return cell
          ? {
              family: r.display_family,
              n_employees: cell.n_employees,
              is_pooled: r.is_pooled,
              href: r.is_pooled
                ? undefined
                : `/usa/san-francisco/payroll/family/${familySlug(r.display_family)}`,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [famDistRows, bucketFloor]);
  const bucketLabel = selectedBucket
    ? selectedBucket.ceiling_usd == null
      ? fill(t("us.sf.payroll.s04.open_bucket"), {
          floor: fmtUsdTick(selectedBucket.floor_usd),
        })
      : `${fmtUsdTick(selectedBucket.floor_usd)}–${fmtUsdTick(selectedBucket.ceiling_usd)}`
    : "";

  const chip = <T extends string>(
    current: T,
    set: (v: T) => void,
    key: T,
    label: string,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={current === key}
      onClick={() => set(key)}
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 11.5,
        padding: "5px 10px",
        border: "1px solid #0a0a0a",
        background: current === key ? "#0a0a0a" : "transparent",
        color: current === key ? "#fff" : "#0a0a0a",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="theme-fusion">
      <main id="main-content" tabIndex={-1}>
        <PageTOC
          items={[
            { id: "sec-work", label: t("us.sf.payroll.s02.kind") },
            { id: "sec-overtime", label: t("us.sf.payroll.s03.kind") },
            { id: "sec-distribution", label: t("us.sf.payroll.s04.kind") },
          ]}
        />

        {/* ── Opener: signature stat band ── */}
        <PageIntro
          title={
            <>
              {t("us.sf.payroll.title.before")}
              <em>{t("us.sf.payroll.title.em")}</em>
              {t("us.sf.payroll.title.after")}
            </>
          }
          lede={t("us.sf.payroll.lede")}
          meta={fill(t("us.sf.payroll.asof"), {
            date: byYear.as_of ? fmtDateLong(byYear.as_of.slice(0, 10)) : "",
            y0: first.fiscal_year,
            y1: fy,
          })}
          stats={
            <>
              <IntroStat
                value={
                  <AnimatedNumber
                    value={latest.median_total_comp_usd}
                    format={(n) => fmtUsd(n)}
                  />
                }
                label={
                  <Tip label={t("us.sf.payroll.s01.hero.cap")}>
                    {fill(t("us.sf.payroll.s01.hero.label"), { fy })}
                  </Tip>
                }
              />
              <IntroStat
                value={
                  <AnimatedNumber
                    value={latest.total_compensation_usd}
                    format={(n) => fmtUsdCompact(n)}
                  />
                }
                label={fill(t("us.sf.payroll.s01.kpi.total"), { fy })}
              />
              <IntroStat
                value={
                  <AnimatedNumber
                    value={latest.n_employees}
                    format={(n) => nfInt.format(n)}
                  />
                }
                label={t("us.sf.payroll.s01.kpi.people")}
              />
              <IntroStat
                value={
                  latest.per_resident_usd != null ? (
                    <AnimatedNumber
                      value={latest.per_resident_usd}
                      format={(n) => fmtUsd(n)}
                    />
                  ) : (
                    "—"
                  )
                }
                label={t("us.sf.payroll.s01.kpi.pr")}
              />
            </>
          }
        />

        {/* ── §1 What the city pays, by kind of work ──
         *  One lens drives two graphics: how the stack grew over 13 years,
         *  and exactly where it sits in the latest year, slice by slice. The
         *  separate "by job family" section this replaced drew the same
         *  families twice, once as an area chart and once as a ranked list. */}
        <section className="fx-section" id="sec-work">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.payroll.s02.title.before")}
                  <em>{t(`us.sf.payroll.s02.title.em.${lens}`)}</em>
                </>
              }
              subtitle={fill(t(`us.sf.payroll.s02.sub.${lens}`), {
                y0: familyYears[0],
                fy,
                n: lensCounts[lens],
                nShown: trajectory.length,
              })}
            />
            <div
              role="group"
              aria-label={t("us.sf.payroll.s02.lens.aria")}
              style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}
            >
              {chip<Lens>(lens, setLens, "family", t("us.sf.payroll.s02.lens.family"))}
              {chip<Lens>(lens, setLens, "area", t("us.sf.payroll.s02.lens.area"))}
              {chip<Lens>(lens, setLens, "dept", t("us.sf.payroll.s02.lens.dept"))}
            </div>

            <figure style={{ margin: 0 }}>
              <UsFamilyChart
                families={trajectory}
                ariaLabel={fill(t("us.sf.payroll.s02.chart.aria"), {
                  n: trajectory.length,
                  y0: familyYears[0],
                  fy,
                  lens: t(`us.sf.payroll.s02.lens.${lens}`).toLowerCase(),
                })}
              />
            </figure>

            <div
              role="group"
              aria-label={t("us.sf.payroll.s02.metric.aria")}
              style={{ display: "flex", gap: 6, margin: "26px 0 14px", flexWrap: "wrap" }}
            >
              {chip<Metric>(metric, setMetric, "usd", t("us.sf.payroll.s02.toggle.usd"))}
              {chip<Metric>(metric, setMetric, "headcount", t("us.sf.payroll.s02.toggle.headcount"))}
            </div>
            <SfMoneyBar
              slices={slices}
              total={barTotal}
              formatAmount={
                metric === "usd" ? undefined : (n) => nfInt.format(Math.round(n))
              }
              kicker={fill(
                t(
                  metric === "usd"
                    ? `us.sf.payroll.s02.kicker.${lens}`
                    : `us.sf.payroll.s02.kicker_n.${lens}`,
                ),
                { fy, total: fmtUsdCompact(barTotal), n: nfInt.format(barTotal) },
              )}
              otherLabel={
                lensCounts[lens] > slices.length
                  ? fill(t("us.sf.payroll.s02.other"), {
                      n: lensCounts[lens] - slices.length,
                    })
                  : t("us.sf.payroll.s02.other_none")
              }
              footnote={
                <>
                  {fill(t(`us.sf.payroll.s02.foot.${lens}`), {
                    share: fmtShare(topThreeShare),
                    what: t(
                      metric === "usd"
                        ? "us.sf.payroll.s02.foot.what_usd"
                        : "us.sf.payroll.s02.foot.what_n",
                    ),
                    nShown: slices.length,
                    nTotal: lensCounts[lens],
                  })}{" "}
                  <Tip label={byDept.fold_note}>
                    {t(
                      metric === "usd"
                        ? "us.sf.payroll.s02.foot.fold"
                        : "us.sf.payroll.s02.foot.fold_n",
                    )}
                  </Tip>
                </>
              }
            />
            <ChartSource
              source={byYear.source.name}
              dataHref={byYear.source.source_url}
              methodHref="/usa/san-francisco/sources#sec-payroll"
            />
          </div>
        </section>

        {/* ── The overtime lens ── */}
        <section className="fx-section" id="sec-overtime">
          <div className="fx-wrap">
            <SectionHead
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
            <UsOtChart
              departments={overtime.departments.slice(0, 6)}
              ariaLabel={fill(t("us.sf.payroll.s03.chart.aria"), {
                n: Math.min(6, overtime.departments.length),
              })}
            />
            <p className="fx-note">
              {overtime.framing_note}{" "}
              <Tip label={overtime.dept_series_note}>
                {t("us.sf.payroll.s03.series_note")}
              </Tip>
            </p>
            {policeFirst && policeLast && (
              <PageHook
                variant="card"
                cite={fill(t("us.sf.payroll.hook.cite"), {
                  y0: otFirst.fiscal_year,
                  fy,
                })}
                shareText={fill(t("us.sf.payroll.hook.share"), {
                  ot: fmtUsdCompact(otLatest.overtime_usd),
                  fy,
                  share: fmtShare(otLatest.ot_share_of_comp),
                  ot0: fmtUsdCompact(policeFirst.overtime_usd),
                  ot1: fmtUsdCompact(policeLast.overtime_usd),
                  y0: policeFirst.fiscal_year,
                  counter: nfInt.format(otLatest.n_ot_exceeds_salary_floored),
                })}
              >
                <span
                  dangerouslySetInnerHTML={{
                    __html: fill(t("us.sf.payroll.hook.body"), {
                      ot: fmtUsdCompact(otLatest.overtime_usd),
                      fy,
                      share: fmtShare(otLatest.ot_share_of_comp),
                      share0: fmtShare(otFirst.ot_share_of_comp),
                      y0: policeFirst.fiscal_year,
                      ot0: fmtUsdCompact(policeFirst.overtime_usd),
                      ot1: fmtUsdCompact(policeLast.overtime_usd),
                      n0: nfInt.format(policeFirst.n_employees),
                      n1: nfInt.format(policeLast.n_employees),
                      counter: nfInt.format(otLatest.n_ot_exceeds_salary_floored),
                    }),
                  }}
                />
              </PageHook>
            )}
            {/* The chart above already draws every one of these series, so a
             *  ranked list of the same eight departments was the chart in
             *  words. What it uniquely offered was a way IN — that is all that
             *  survives: one line of links to the departments' payroll fiches. */}
            <p className="fx-linkline">
              <span className="fx-linkline-k">{t("us.sf.payroll.s03.open")}</span>
              {otDeptRanking.map((d, i) => (
                <span key={d.department_code}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  <Link
                    href={`/usa/san-francisco/payroll/dept/${payrollDeptSlug(d.department_code)}`}
                    scroll={false}
                  >
                    {d.department}
                  </Link>
                </span>
              ))}
            </p>
            <p className="fx-footnote">
              <Tip label={fill(t("us.sf.payroll.s03.counter_floor.tip"), {
                floor: fmtUsd(overtime.ot_salary_floor_usd),
                naive: nfInt.format(otLatest.n_ot_exceeds_salary_naive),
                floored: nfInt.format(otLatest.n_ot_exceeds_salary_floored),
                fy,
              })}>
                {t("us.sf.payroll.s03.counter_floor")}
              </Tip>
            </p>
            <ChartSource
              source={byYear.source.name}
              dataHref={byYear.source.source_url}
              methodHref="/usa/san-francisco/sources#sec-payroll"
            />
          </div>
        </section>

        {/* ── §3 The spread — one chart, two views ──
         *  "Everyone" is the citywide histogram, and clicking a band names
         *  the work inside it. "By kind of work" is the same year's exact
         *  percentiles as a ladder. They answer the same question at two
         *  resolutions, so they are one graphic with a switch, not two
         *  sections one under the other. */}
        <section className="fx-section" id="sec-distribution">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.payroll.s04.title.before")}
                  <em>{t("us.sf.payroll.s04.title.em")}</em>
                </>
              }
              subtitle={
                spreadView === "all"
                  ? fill(t("us.sf.payroll.s04.sub"), {
                      p25: fmtUsd(distLatest.p25_usd),
                      p75: fmtUsd(distLatest.p75_usd),
                      p99: fmtUsd(distLatest.p99_usd),
                      fy,
                    })
                  : ladderRows.length > 0
                    ? fill(t("us.sf.payroll.s04.sub_family"), {
                        fy: activeDistYear,
                        top: ladderRows[0].family,
                        topMedian: fmtUsd(ladderRows[0].p50_usd),
                        bottom: ladderRows[ladderRows.length - 1].family,
                        bottomMedian: fmtUsd(ladderRows[ladderRows.length - 1].p50_usd),
                      })
                    : ""
              }
            />
            <div
              role="group"
              aria-label={t("us.sf.payroll.s04.view.aria")}
              style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}
            >
              {chip<SpreadView>(spreadView, setSpreadView, "all", t("us.sf.payroll.s04.view.all"))}
              {chip<SpreadView>(spreadView, setSpreadView, "family", t("us.sf.payroll.s04.view.family"))}
            </div>

            {spreadView === "all" ? (
              <>
                <DistributionStrip
                  points={distPoints}
                  initialYear={activeDistYear}
                  fmtUsd={fmtUsd}
                  fmtUsdTick={fmtUsdTick}
                  fmtCount={(n) => nfInt.format(n)}
                  onSelectBucket={(b) => setBucketFloor(b ? b.floorUsd : null)}
                  selectedFloorUsd={bucketFloor}
                  onYearChange={(y) => {
                    setDistYear(y);
                    setBucketFloor(null);
                  }}
                  labels={{
                    chartAria: (year, n) =>
                      fill(t("us.sf.payroll.s04.chart.aria"), { year, n }),
                    scrubAria: t("us.sf.payroll.s04.scrub.aria"),
                    bucketAria: (range, count) =>
                      fill(t("us.sf.payroll.s04.bucket.aria"), { range, count }),
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
                        fy: activeDistYear,
                      })}{" "}
                      <Tip label={distribution.percentile_note}>
                        {t("us.sf.payroll.s04.percentile_note")}
                      </Tip>
                    </p>
                  }
                />
                {selectedBucket ? (
                  <SfBucketComposition
                    kicker={fill(t("us.sf.payroll.s04.who.kicker"), { fy: activeDistYear })}
                    title={fill(t("us.sf.payroll.s04.who.title"), { range: bucketLabel })}
                    rows={bucketRows}
                    total={selectedBucket.n_employees}
                    fmtCount={(n) => nfInt.format(n)}
                    shareLabel={(share) =>
                      fill(t("us.sf.payroll.s04.who.share"), { share })
                    }
                    moreLabel={(n, people) =>
                      fill(t("us.sf.payroll.s04.who.more"), { n, people })
                    }
                    hint={t("us.sf.payroll.s04.who.hint")}
                  />
                ) : (
                  <p className="fx-bucketwho-hint" style={{ marginTop: 14 }}>
                    {t("us.sf.payroll.s04.who.prompt")}
                  </p>
                )}
              </>
            ) : (
              ladderRows.length > 0 && (
                <>
                  <div
                    role="group"
                    aria-label={t("us.sf.payroll.s04.scrub.aria")}
                    style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}
                  >
                    {distribution.points.map((pt) =>
                      chip<string>(
                        String(activeDistYear),
                        (v) => setDistYear(Number(v)),
                        String(pt.fiscal_year),
                        String(pt.fiscal_year),
                      ),
                    )}
                  </div>
                  <SfPayLadder
                    rows={ladderRows}
                    cityMedianUsd={distYearPoint.p50_usd}
                    fmtUsd={fmtUsd}
                    fmtUsdTick={fmtUsdTick}
                    fmtCount={(n) => nfInt.format(n)}
                    labels={{
                      head: fill(t("us.sf.payroll.ladder.head"), { fy: activeDistYear }),
                      headRight: t("us.sf.payroll.ladder.head_right"),
                      median: t("us.sf.payroll.ladder.key.median"),
                      cityMedian: t("us.sf.payroll.ladder.key.city"),
                      people: (n) => fill(t("us.sf.payroll.ladder.people"), { n }),
                      rowAria: (r, p25, p50, p75) =>
                        fill(t("us.sf.payroll.ladder.row.aria"), {
                          family: r.family,
                          p25,
                          p50,
                          p75,
                        }),
                    }}
                  />
                  <p className="fx-note">
                    {familyDistNotes.ladder}{" "}
                    <Tip label={familyDistNotes.attribution}>
                      {t("us.sf.payroll.ladder.attrib_note")}
                    </Tip>
                  </p>
                </>
              )
            )}

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
            <ChartSource
              source={byYear.source.name}
              dataHref={byYear.source.source_url}
              methodHref="/usa/san-francisco/sources#sec-payroll"
            />
          </div>
        </section>

        <SfSourceFooter
          perimeter={byYear.perimeter}
          coverage={byDept.keying_note}
          source={{ name: byYear.source.name, href: byYear.source.source_url }}
          sourcesAnchor="sec-payroll"
          exports={[
            { label: "payroll_by_year.json", href: "/data/us/sf/payroll_by_year.json" },
            { label: "payroll_overtime.json", href: "/data/us/sf/payroll_overtime.json" },
            { label: "payroll_by_dept_year.json", href: "/data/us/sf/payroll_by_dept_year.json" },
            { label: "payroll_distribution.json", href: "/data/us/sf/payroll_distribution.json" },
            {
              label: "payroll_family_distribution.json",
              href: "/data/us/sf/payroll_family_distribution.json",
            },
            {
              label: "payroll_by_family_citywide.json",
              href: "/data/us/sf/payroll_by_family_citywide.json",
            },
          ]}
        />
      </main>
    </div>
  );
}
