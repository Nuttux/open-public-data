"use client";

import { useMemo, useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import DistributionStrip from "@/components/us/DistributionStrip";
import SfPayLadder from "@/components/us/SfPayLadder";
import SfBucketComposition from "@/components/us/SfBucketComposition";
import UsOtChart from "./UsOtChart";
import UsFamilyChart from "./UsFamilyChart";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { fill } from "@/lib/fmt";
import { areaSlug, familySlug, payrollDeptSlug } from "@/lib/us/sf-payroll-slugs";
import { fmtUsd, fmtUsdAmt, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
  PayrollByFamilyCitywide,
  PayrollFamilyDistRow,
} from "./payroll-types";

/**
 * San Francisco's payroll on the section grammar (2026-09-18) : the number
 * (total compensation of everyone the City paid in the fiscal year, its year
 * as a menu, the median per person, the movement in ochre) with the rail of
 * the years ; the scene (who is paid : by kind of work, service area or
 * department, each line with its small curve, opening its fiche) ; overtime
 * (the departments that pay the most of it, the curves and the top titles
 * behind folds) ; the spread of pay (the histogram, a band opening who is
 * paid there, or the ladder by kind of work) ; Understand ; See also ; the
 * next section ; the source. EN-only (ADR-0010 D3) : `us.sf.pay3.*`.
 *
 * Every number renders from the payroll exports ; arithmetic here is limited
 * to shares of exported values.
 */

const BASE = "/usa/san-francisco";
const PAY = `${BASE}/payroll`;
const SLICES = 8;
const OT_ROWS = 8;

type Lens = "family" | "area" | "dept";
const LENSES: Lens[] = ["family", "area", "dept"];
type SpreadView = "all" | "family";

export type SfPayrollDoors = {
  budget: { fy: number; total: number } | null;
  payees: { fy: number; total: number } | null;
  places: { total: number; n: number } | null;
};

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct1 = (x: number) => `${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
/** $250k-style tick (thousands stay short on the axis). */
function fmtUsdTick(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${int.format(n)}`;
}

export default function PayrollClient({ fy, years, byYear, byDept, distribution, overtime, byFamily, familyDistribution, familyDistNotes, doors }: {
  fy: number;
  years: number[];
  byYear: PayrollByYear;
  byDept: PayrollByDept;
  distribution: PayrollDistribution;
  overtime: PayrollOvertime;
  byFamily: PayrollByFamilyCitywide;
  /** The distribution cut by job family — the pay ladder and the "who is
   *  paid in this band" panel both read this. Keyed by fiscal year. */
  familyDistribution: Record<string, PayrollFamilyDistRow[]>;
  familyDistNotes: { ladder: string; attribution: string };
  doors: SfPayrollDoors;
}) {
  const t = useT();
  const track = useTrack();
  const Amt = ({ n }: { n: number }) => { const f = fmtUsdAmt(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const points = byYear.points.slice().sort((a, b) => a.fiscal_year - b.fiscal_year);
  const latest = points.find((p) => p.fiscal_year === fy) ?? points[points.length - 1];
  const prev = points.find((p) => p.fiscal_year === fy - 1);

  /* ── The number : total compensation of everyone paid in the fiscal year ── */
  const total = fmtUsdAmt(latest.total_compensation_usd);
  const yoy = prev && prev.total_compensation_usd > 0 ? (latest.total_compensation_usd / prev.total_compensation_usd - 1) * 100 : null;
  const move = yoy == null ? undefined : Math.abs(yoy) < 0.05 ? fill(t("us.sf.pay3.move_flat"), { y: fy - 1 }) : fill(t(yoy > 0 ? "us.sf.pay3.move_up" : "us.sf.pay3.move_down"), { pct: pct1(yoy), y: fy - 1 });
  const series = points.map((p) => ({ year: p.fiscal_year, amount: p.total_compensation_usd }));
  const shareTitle = fill(t("us.sf.pay3.share_title"), { total: fmtUsdCompact(latest.total_compensation_usd), y: fy, n: int.format(latest.n_employees) });
  const otYear = overtime.citywide.find((c) => c.fiscal_year === fy) ?? overtime.citywide[overtime.citywide.length - 1];
  const otFirst = overtime.citywide[0];
  const meta = [
    fill(t("us.sf.pay3.meta_median"), { m: fmtUsd(Math.round(latest.median_total_comp_usd)) }),
    latest.per_resident_usd != null ? fill(t("us.sf.pay3.meta_pr"), { pr: fmtUsd(Math.round(latest.per_resident_usd)) }) : null,
    fill(t("us.sf.pay3.meta_ot"), { ot: fmtUsdCompact(latest.overtime_usd), share: fmtShare(latest.ot_share_of_comp) }),
  ].filter(Boolean).join(" · ");

  /* ── The scene : who is paid, three readings, each line with its small curve ── */
  const [lens, setLens] = useState<Lens>("family");
  const pickLens = (l: Lens) => {
    if (l === lens) return;
    track("filter_change", { page: "us-sf-payroll", field: "scene_lens", value: l });
    setLens(l);
  };
  type Slice = { key: string; label: string; amount: number; people: number; href: string; spark: { year: number; value: number }[] };
  const { slices, lensCount, lensTotal } = useMemo(() => {
    let list: Slice[];
    if (lens === "area") {
      list = byDept.organization_groups
        .filter((g) => g.years[String(fy)])
        .map((g) => ({
          key: g.organization_group_code,
          label: g.organization_group,
          amount: g.years[String(fy)].total_compensation_usd,
          people: g.years[String(fy)].n_employees_listed,
          href: `${PAY}/area/${areaSlug(g.organization_group)}`,
          spark: Object.entries(g.years).map(([y, v]) => ({ year: Number(y), value: v.total_compensation_usd })).sort((a, b) => a.year - b.year),
        }));
    } else if (lens === "dept") {
      list = byDept.departments
        .map((d) => ({ d, p: d.series.find((s) => s.fiscal_year === fy) }))
        .filter((x): x is { d: (typeof byDept.departments)[number]; p: NonNullable<typeof x.p> } => Boolean(x.p))
        .map(({ d, p }) => ({
          key: d.department_code,
          label: d.department,
          amount: p.total_compensation_usd,
          people: p.n_employees,
          href: `${PAY}/dept/${payrollDeptSlug(d.department_code)}`,
          spark: d.series.map((s) => ({ year: s.fiscal_year, value: s.total_compensation_usd })).sort((a, b) => a.year - b.year),
        }));
    } else {
      const rows = byFamily.years[String(fy)] ?? [];
      list = rows.map((f) => ({
        key: f.display_family,
        label: f.display_family,
        amount: f.total_compensation_usd,
        people: f.n_employees,
        href: `${PAY}/family/${familySlug(f.display_family)}`,
        spark: Object.entries(byFamily.years)
          .map(([y, rs]) => { const r = rs.find((x) => x.display_family === f.display_family); return r ? { year: Number(y), value: r.total_compensation_usd } : null; })
          .filter((x): x is { year: number; value: number } => x !== null)
          .sort((a, b) => a.year - b.year),
      }));
    }
    const sorted = list.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
    return { slices: sorted.slice(0, SLICES), lensCount: sorted.length, lensTotal: sorted.reduce((s, x) => s + x.amount, 0) };
  }, [lens, fy, byDept, byFamily]);
  // Dollars partition : every dollar sits in one department, so the citywide
  // total is the whole and the gap to the drawn lines is real (the
  // department-years below the publication threshold, folded, never listed).
  const whole = latest.total_compensation_usd;
  const sliceMax = slices[0]?.amount ?? 1;
  const otherAmount = Math.max(0, whole - slices.reduce((s, x) => s + x.amount, 0));
  const sparkYears = years.filter((y) => y <= fy);
  const sparkSpan = sparkYears.length > 1 ? `FY${sparkYears[0]}–FY${sparkYears[sparkYears.length - 1]}` : `FY${fy}`;
  const Spark = ({ pts: all }: { pts: { year: number; value: number }[] }) => {
    const pts = all.filter((p) => p.year <= fy);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `FY${p.year}: ${fmtUsdCompact(p.value)}`).join(" · ")}>
        {pts.map((p) => <i key={p.year} className={p.year === fy ? "now" : ""} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />)}
      </span>
    );
  };

  /* ── Overtime : the departments that pay the most of it ── */
  const otDepts = useMemo(() =>
    overtime.departments
      .map((d) => ({ d, p: d.series.find((s) => s.fiscal_year === fy) }))
      .filter((x): x is { d: (typeof overtime.departments)[number]; p: NonNullable<typeof x.p> } => Boolean(x.p))
      .sort((a, b) => b.p.overtime_usd - a.p.overtime_usd)
      .slice(0, OT_ROWS),
    [overtime, fy]);
  const otMax = otDepts[0]?.p.overtime_usd ?? 1;
  const otTitles = useMemo(() => overtime.top_titles.filter((x) => x.fiscal_year === fy).sort((a, b) => b.overtime_usd - a.overtime_usd).slice(0, 8), [overtime, fy]);

  /* ── The spread : the histogram, a band opening who is paid there, or the ladder ── */
  const [spreadView, setSpreadView] = useState<SpreadView>("all");
  const [bucketFloor, setBucketFloor] = useState<number | null>(null);
  const [distYear, setDistYear] = useState<number | null>(null);
  const activeDistYear = distYear ?? fy;
  const distPoints = distribution.points.map((p) => ({ year: p.fiscal_year, n_employees: p.n_employees, p25_usd: p.p25_usd, p50_usd: p.p50_usd, p75_usd: p.p75_usd, p90_usd: p.p90_usd, p99_usd: p.p99_usd, histogram: p.histogram }));
  const distYearPoint = distribution.points.find((p) => p.fiscal_year === activeDistYear) ?? distribution.points[distribution.points.length - 1];
  const distFirst = distribution.points[0];
  const under25kShare = distYearPoint.histogram[0].n_employees / distYearPoint.n_employees;
  const famDistRows = useMemo(() => familyDistribution[String(activeDistYear)] ?? [], [familyDistribution, activeDistYear]);
  const ladderRows = useMemo(() =>
    famDistRows
      .filter((r) => !r.is_pooled && r.p50_usd != null && r.n_people != null)
      .map((r) => ({ family: r.display_family, n_people: r.n_people as number, p25_usd: r.p25_usd as number, p50_usd: r.p50_usd as number, p75_usd: r.p75_usd as number, p90_usd: r.p90_usd as number, href: `${PAY}/family/${familySlug(r.display_family)}` }))
      .sort((a, b) => b.p50_usd - a.p50_usd),
    [famDistRows]);
  const selectedBucket = bucketFloor == null ? null : distYearPoint.histogram.find((b) => b.floor_usd === bucketFloor) ?? null;
  const bucketRows = useMemo(() => {
    if (bucketFloor == null) return [];
    return famDistRows
      .map((r) => { const cell = r.histogram.find((b) => b.floor_usd === bucketFloor); return cell ? { family: r.display_family, n_employees: cell.n_employees, is_pooled: r.is_pooled, href: r.is_pooled ? undefined : `${PAY}/family/${familySlug(r.display_family)}` } : null; })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [famDistRows, bucketFloor]);
  const bucketLabel = selectedBucket ? (selectedBucket.ceiling_usd == null ? fill(t("us.sf.payroll.s04.open_bucket"), { floor: fmtUsdTick(selectedBucket.floor_usd) }) : `${fmtUsdTick(selectedBucket.floor_usd)}–${fmtUsdTick(selectedBucket.ceiling_usd)}`) : "";
  const highTitles = distribution.high_earners.titles.filter((x) => !x.is_remainder);
  const highRemainder = distribution.high_earners.titles.find((x) => x.is_remainder);
  const distLatest = distribution.points[distribution.points.length - 1];

  /* ── Understand : how the stack grew, by kind of work ── */
  const familyYears = Object.keys(byFamily.years).map(Number).sort((a, b) => a - b);
  const trajectory = useMemo(() => (byFamily.years[String(fy)] ?? []).slice(0, SLICES).map((f) => ({
    family: f.display_family,
    series: familyYears.map((y) => { const r = (byFamily.years[String(y)] ?? []).find((x) => x.display_family === f.display_family); return r ? { fiscal_year: y, value: r.total_compensation_usd } : null; }).filter((x): x is { fiscal_year: number; value: number } => x !== null),
  })), [byFamily, familyYears, fy]);

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={BASE}>San Francisco</Link> › {t("us.sf.pay3.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("us.sf.pay3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={fill(t("us.sf.pay3.cap_before"), { n: int.format(latest.n_employees) })}
              years={years}
              year={fy}
              yearLabel={(y) => `FY${y}`}
              basePath={PAY}
              meta={meta}
              move={move}
              shareTitle={shareTitle}
            />
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                <AnneesRail rows={series} current={fy} format={fmtUsdCompact} />
                <p className="fx-v3-note">{t("us.sf.pay3.years_note")}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="scene" title={fill(t("us.sf.pay3.h.scene"), { y: fy })} sub={fill(t("us.sf.pay3.scene_sub"), { total: fmtUsdCompact(whole), span: sparkSpan })} hint={t("us.sf.pay3.scene_hint")}>
              <div id="pay-scene" className="fx-bud-cols fx-bud-cols--one">
                <div className="fx-bud-col">
                  <h3>
                    <span className="fx-sec-switch" role="group" aria-label={t("us.sf.pay3.g.aria")}>
                      {LENSES.map((l) => (
                        <button key={l} type="button" aria-pressed={lens === l} onClick={() => pickLens(l)}>{t(`us.sf.pay3.g.${l}`)}</button>
                      ))}
                    </span>
                    <span className="tnum">{fmtUsdCompact(whole)}</span>
                  </h3>
                  {slices.map((s) => (
                    <Link key={s.key} href={s.href} scroll={false} className="fx-bud-row" data-peek={fill(t("us.sf.pay3.people"), { n: int.format(s.people) })}>
                      <span className="n">
                        {s.label}
                        <i className="bar" style={{ width: `${Math.max(2, Math.round((s.amount / sliceMax) * 100))}%` }} aria-hidden="true" />
                      </span>
                      <span className="sp"><Spark pts={s.spark} /></span>
                      <Amt n={s.amount} />
                      <span className="p tnum">{Math.round((s.amount / whole) * 100)} %</span>
                      <span className="c" aria-hidden="true">›</span>
                    </Link>
                  ))}
                  {otherAmount > whole * 0.005 ? (
                    <div className="fx-bud-row fx-bud-row--static">
                      <span className="n">{lensCount > slices.length ? fill(t("us.sf.pay3.other"), { n: int.format(lensCount - slices.length) }) : t("us.sf.pay3.other_folded")}</span>
                      <span className="sp" /><Amt n={otherAmount} /><span className="p tnum">{Math.round((otherAmount / whole) * 100)} %</span><span className="c" />
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="fx-v3-note">{lensTotal > whole * 1.005 ? fill(t("us.sf.pay3.scene_note_over"), { listed: fmtUsdCompact(lensTotal) }) : byDept.fold_note}</p>
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${lens}`} anchor="pay-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="overtime" title={fill(t("us.sf.pay3.h.ot"), { ot: fmtUsdCompact(otYear.overtime_usd), y: fy, share: fmtShare(otYear.ot_share_of_comp) })} sub={fill(t("us.sf.pay3.ot_sub"), { share0: fmtShare(otFirst.ot_share_of_comp), y0: otFirst.fiscal_year })}>
              <div className="fx-bud-cols fx-bud-cols--one">
                <div className="fx-bud-col">
                  {otDepts.map(({ d, p }) => (
                    <Link key={d.department_code} href={`${PAY}/dept/${payrollDeptSlug(d.department_code)}`} scroll={false} className="fx-bud-row" data-peek={fill(t("us.sf.pay3.people"), { n: int.format(p.n_employees) })}>
                      <span className="n">
                        {d.department}
                        <i className="bar" style={{ width: `${Math.max(2, Math.round((p.overtime_usd / otMax) * 100))}%` }} aria-hidden="true" />
                      </span>
                      <span className="sp"><Spark pts={d.series.map((s) => ({ year: s.fiscal_year, value: s.overtime_usd }))} /></span>
                      <Amt n={p.overtime_usd} />
                      <span className="p tnum">{Math.round(p.ot_share_of_comp * 100)} %</span>
                      <span className="c" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              </div>
              <p className="fx-v3-note">{t("us.sf.pay3.ot_share_note")} {overtime.framing_note}</p>
              <p className="fx-v3-sentence">{fill(t("us.sf.pay3.ot_counter"), { y: fy, n: int.format(otYear.n_ot_exceeds_salary_floored) })} {fill(t("us.sf.pay3.ot_counter_floor"), { floor: fmtUsd(overtime.ot_salary_floor_usd), naive: int.format(otYear.n_ot_exceeds_salary_naive) })}</p>
              <V3Fold id="ot-curves" label={fill(t("us.sf.pay3.u.ot_curves"), { y0: otFirst.fiscal_year })}>
                <UsOtChart departments={overtime.departments.slice(0, 6)} ariaLabel={fill(t("us.sf.payroll.s03.chart.aria"), { n: Math.min(6, overtime.departments.length) })} height={320} />
                <p className="fx-v3-sentence">{overtime.dept_series_note}</p>
              </V3Fold>
              {otTitles.length > 0 ? (
                <V3Fold id="ot-titles" label={fill(t("us.sf.pay3.ot_titles"), { y: fy })}>
                  {otTitles.map((x) => (
                    <V3Row key={x.job_title} label={x.job_title} subText={fill(t("us.sf.pay3.ot_title_sub"), { n: int.format(x.n_ot_earners), m: int.format(x.n_employees), avg: fmtUsd(Math.round(x.avg_ot_per_ot_earner_usd)) })} amount={<Amt n={x.overtime_usd} />} />
                  ))}
                  <p className="fx-v3-note">{overtime.titles_note}</p>
                </V3Fold>
              ) : null}
            </V3Section>

            <V3Section id="spread" title={fill(t("us.sf.pay3.h.spread"), { y: activeDistYear })} sub={fill(t("us.sf.pay3.spread_sub"), { p25: fmtUsd(distYearPoint.p25_usd), p75: fmtUsd(distYearPoint.p75_usd), p99: fmtUsd(distYearPoint.p99_usd) })}>
              <div className="fx-sec-switch" role="group" aria-label={t("us.sf.payroll.s04.view.aria")}>
                {(["all", "family"] as SpreadView[]).map((v) => (
                  <button key={v} type="button" aria-pressed={spreadView === v} onClick={() => { track("filter_change", { page: "us-sf-payroll", field: "spread_view", value: v }); setSpreadView(v); }}>{t(`us.sf.payroll.s04.view.${v}`)}</button>
                ))}
              </div>
              {spreadView === "all" ? (
                <>
                  <DistributionStrip
                    points={distPoints}
                    initialYear={activeDistYear}
                    fmtUsd={fmtUsd}
                    fmtUsdTick={fmtUsdTick}
                    fmtCount={(n) => int.format(n)}
                    onSelectBucket={(b) => { track("chart_element_click", { chart: "pay_histogram", band: b ? b.floorUsd : null }); setBucketFloor(b ? b.floorUsd : null); }}
                    selectedFloorUsd={bucketFloor}
                    onYearChange={(y) => { setDistYear(y); setBucketFloor(null); }}
                    labels={{
                      chartAria: (year, n) => fill(t("us.sf.payroll.s04.chart.aria"), { year, n }),
                      scrubAria: t("us.sf.payroll.s04.scrub.aria"),
                      bucketAria: (range, count) => fill(t("us.sf.payroll.s04.bucket.aria"), { range, count }),
                      median: t("us.sf.payroll.s04.median"),
                      p25: t("us.sf.payroll.s04.p25"),
                      p99: t("us.sf.payroll.s04.p99"),
                      employees: t("us.sf.payroll.s04.employees"),
                      openBucket: (floor) => fill(t("us.sf.payroll.s04.open_bucket"), { floor }),
                    }}
                    annotation={<p className="fx-v3-note">{fill(t("us.sf.payroll.s04.parttime"), { share: fmtShare(under25kShare), fy: activeDistYear })} {distribution.percentile_note}</p>}
                  />
                  {selectedBucket ? (
                    <SfBucketComposition
                      kicker={fill(t("us.sf.payroll.s04.who.kicker"), { fy: activeDistYear })}
                      title={fill(t("us.sf.payroll.s04.who.title"), { range: bucketLabel })}
                      rows={bucketRows}
                      total={selectedBucket.n_employees}
                      fmtCount={(n) => int.format(n)}
                      shareLabel={(share) => fill(t("us.sf.payroll.s04.who.share"), { share })}
                      moreLabel={(n, people) => fill(t("us.sf.payroll.s04.who.more"), { n, people })}
                      hint={t("us.sf.payroll.s04.who.hint")}
                    />
                  ) : (
                    <p className="fx-v3-hint-line">{t("us.sf.payroll.s04.who.prompt")}</p>
                  )}
                </>
              ) : ladderRows.length > 0 ? (
                <>
                  <SfPayLadder
                    rows={ladderRows}
                    cityMedianUsd={distYearPoint.p50_usd}
                    fmtUsd={fmtUsd}
                    fmtUsdTick={fmtUsdTick}
                    fmtCount={(n) => int.format(n)}
                    labels={{
                      head: fill(t("us.sf.payroll.ladder.head"), { fy: activeDistYear }),
                      headRight: t("us.sf.payroll.ladder.head_right"),
                      median: t("us.sf.payroll.ladder.key.median"),
                      cityMedian: t("us.sf.payroll.ladder.key.city"),
                      people: (n) => fill(t("us.sf.payroll.ladder.people"), { n }),
                      rowAria: (r, p25, p50, p75) => fill(t("us.sf.payroll.ladder.row.aria"), { family: r.family, p25, p50, p75 }),
                    }}
                  />
                  <p className="fx-v3-note">{familyDistNotes.ladder} {familyDistNotes.attribution}</p>
                </>
              ) : null}
              <V3Fold id="high" label={fill(t("us.sf.pay3.u.high"), { n: int.format(distLatest.n_above_400k), y: distLatest.fiscal_year })}>
                <p className="fx-v3-sentence">{fill(t("us.sf.payroll.s04.high.body"), { n0: int.format(distFirst.n_above_400k), y0: distFirst.fiscal_year, n500: int.format(distLatest.n_above_500k) })}</p>
                {highTitles.map((x) => (
                  <V3Row key={x.job_title} label={x.job_title} subText={x.display_family ?? undefined} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{int.format(x.n_employees)}</span>} />
                ))}
                {highRemainder ? <p className="fx-v3-note">{fill(t("us.sf.payroll.s04.high.other"), { n: int.format(highRemainder.n_employees) })}</p> : null}
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="comp" label={t("us.sf.pay3.u.comp")}>
                <p className="fx-v3-sentence">{fill(t("us.sf.pay3.u.comp_body"), { y: fy, sal: fmtUsdCompact(latest.salaries_usd), ot: fmtUsdCompact(latest.overtime_usd), other: fmtUsdCompact(latest.other_salaries_usd), ben: fmtUsdCompact(latest.total_benefits_usd), total: fmtUsdCompact(latest.total_compensation_usd) })}</p>
              </V3Fold>
              <V3Fold id="head" label={t("us.sf.pay3.u.head")}><p className="fx-v3-sentence">{byYear.perimeter} {byYear.fiscal_year_note}</p></V3Fold>
              <V3Fold id="median" label={t("us.sf.pay3.u.median")}><p className="fx-v3-sentence">{byYear.median_note}</p></V3Fold>
              <V3Fold id="privacy" label={t("us.sf.pay3.u.privacy")}><p className="fx-v3-sentence">{byYear.privacy.rule} {byDept.keying_note}</p></V3Fold>
              {trajectory.length > 0 ? (
                <V3Fold id="stack" label={fill(t("us.sf.pay3.u.stack"), { y0: familyYears[0] })}>
                  <UsFamilyChart families={trajectory} ariaLabel={fill(t("us.sf.payroll.s02.chart.aria"), { n: trajectory.length, y0: familyYears[0], fy, lens: t("us.sf.pay3.g.family").toLowerCase() })} height={320} />
                </V3Fold>
              ) : null}
              <V3Fold id="sources" label={t("us.sf.pay3.u.source")}>
                <p className="fx-v3-sentence">{t("us.sf.pay3.u.source_body")}</p>
                <p className="fx-v3-sentence">
                  <a href={byYear.source.source_url} target="_blank" rel="noopener noreferrer">{byYear.source.name} · DataSF ↗</a>
                  {" · "}
                  <a href="/data/us/sf/payroll_by_year.json" target="_blank" rel="noopener noreferrer">payroll_by_year.json ↗</a>
                  {" · "}
                  <a href="/data/us/sf/payroll_overtime.json" target="_blank" rel="noopener noreferrer">payroll_overtime.json ↗</a>
                  {" · "}
                  <a href="/data/us/sf/payroll_distribution.json" target="_blank" rel="noopener noreferrer">payroll_distribution.json ↗</a>
                  {" · "}
                  <a href="/data/us/sf/payroll_by_family_citywide.json" target="_blank" rel="noopener noreferrer">payroll_by_family_citywide.json ↗</a>
                  {" · "}
                  <Link href={`${BASE}/sources#sec-payroll`}>{t("us.sf.bud3.u.method")}</Link>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related-doors" title={t("fx.sec.see_also")}>
              {doors.budget ? (
                <Door href={`${BASE}/budget?year=${doors.budget.fy}`} hard title={t("us.sf.wgp3.r.budget")} sub={fill(t("us.sf.wgp3.r.budget_sub"), { y: doors.budget.fy })} value={fmtUsdAmt(doors.budget.total).v} unit={fmtUsdAmt(doors.budget.total).u} />
              ) : (
                <Door href={`${BASE}/budget`} hard title={t("us.sf.wgp3.r.budget")} sub={t("us.sf.wgp3.r.budget_sub_noyear")} />
              )}
              {doors.payees ? (
                <Door href={`${BASE}/who-gets-paid?year=${doors.payees.fy}`} hard title={t("us.sf.ct3.r.payees")} sub={fill(t("us.sf.ct3.r.payees_sub"), { y: doors.payees.fy })} value={fmtUsdAmt(doors.payees.total).v} unit={fmtUsdAmt(doors.payees.total).u} />
              ) : (
                <Door href={`${BASE}/who-gets-paid`} hard title={t("us.sf.ct3.r.payees")} sub={t("us.sf.ct3.r.payees_sub_noyear")} />
              )}
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={`${BASE}/places`}
              kicker={t("fx.sec.next")}
              title={t("us.sf.pay3.next")}
              sub={doors.places ? fill(t("us.sf.pay3.next_sub"), { n: int.format(doors.places.n) }) : t("us.sf.pay3.next_sub_noyear")}
              value={doors.places ? fmtUsdAmt(doors.places.total).v : undefined}
              unit={doors.places ? fmtUsdAmt(doors.places.total).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("us.sf.pay3.foot"), { src: byYear.source.attribution || "SF Controller’s Office", name: byYear.source.name })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
