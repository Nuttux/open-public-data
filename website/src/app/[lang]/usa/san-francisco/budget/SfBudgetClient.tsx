"use client";

import { useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import UsBudgetTrend from "./UsBudgetTrend";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { fill } from "@/lib/fmt";
import { deptSlug, characterSlug, serviceSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsd, fmtUsdAmt, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type {
  SfBudgetYearPoint,
  SfBudgetBreakdown,
  SfExecutionStatus,
  SfSourceBlock,
} from "@/lib/us/sf-budget-data";

/**
 * San Francisco's budget on the section grammar (2026-09-18), the same page
 * as Paris's Budget : the number (the adopted budget of the fiscal year, its
 * year as a menu that says « closed », « preliminary » or « adopted », the
 * amount per resident, the movement in ochre) with the rail of the years
 * facing it, hatched for the years not yet closed ; then SPENDING AND
 * REVENUE FACE TO FACE, each line with its small curve, its amount, its
 * share and its chevron, each opening its fiche ; the spending column reads
 * by service area or by type ; then the departments that weigh the most,
 * « See also » with the figures of the other sections, « Understand » (with
 * the long view, actual vs adopted since FY1999, behind a fold), the next
 * section, the source. EN-only (ADR-0010 D3) : `us.sf.bud3.*` keys whose EN
 * and FR values are identical English.
 */

const BASE = "/usa/san-francisco";
const BUDGET = `${BASE}/budget`;
const LINES_CAP = 6;
const TYPES_CAP = 8;
const REV_CAP = 8;

export type SfSpark = {
  /** By service-area label, every year. */
  services: Record<string, { year: number; value: number }[]>;
  /** By character code, the years on the same chart of accounts as the page's year. */
  spending: Record<string, { year: number; value: number }[]>;
  revenue: Record<string, { year: number; value: number }[]>;
};

export type SfBvaSpinePoint = {
  fiscal_year: number;
  budget_usd: number | null;
  actual_usd: number | null;
  residual_pct: number | null;
};

export type SfBudgetPageData = {
  year: number;
  years: number[];
  statuses: Record<string, SfExecutionStatus>;
  points: { spending: SfBudgetYearPoint[]; revenue: SfBudgetYearPoint[] };
  population: { value: number; year: number; source: string; source_url: string };
  breakdown: SfBudgetBreakdown;
  sparks: SfSpark;
  spine: SfBvaSpinePoint[];
  trend: { fiscal_year: number; budget_net_usd: number | null; actual_all_usd: number | null }[];
  doors: {
    payees: { fy: number; total: number } | null;
    contracts: { n: number; agreed: number } | null;
    payroll: { fy: number; total: number; n: number } | null;
  };
  source: SfSourceBlock;
  generated_at: string;
};

type Group = "service" | "type";

const STATUS_KEY: Record<SfExecutionStatus, string> = {
  closed: "us.sf.bud3.status.closed",
  recently_closed_preliminary: "us.sf.bud3.status.preliminary",
  in_progress: "us.sf.bud3.status.in_progress",
  adopted_only: "us.sf.bud3.status.adopted",
};

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct1 = (x: number) => `${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

export default function SfBudgetClient({ d }: { d: SfBudgetPageData }) {
  const t = useT();
  const track = useTrack();
  const bd = d.breakdown;
  const fy = d.year;
  const status = bd.execution_status;
  const closed = (y: number) => d.statuses[String(y)] === "closed";
  const Amt = ({ n }: { n: number }) => { const f = fmtUsdAmt(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };

  /* ── The number : the adopted budget of the fiscal year ── */
  const total = fmtUsdAmt(bd.totals.spending.total_usd);
  const spendingPoint = d.points.spending.find((p) => p.fiscal_year === fy);
  const prevPoint = d.points.spending.find((p) => p.fiscal_year === fy - 1);
  const yoy = spendingPoint && prevPoint && prevPoint.total_usd > 0 ? (spendingPoint.total_usd / prevPoint.total_usd - 1) * 100 : null;
  const move = yoy == null
    ? undefined
    : Math.abs(yoy) < 0.05
      ? fill(t("us.sf.bud3.move_flat"), { y: fy - 1 })
      : fill(t(yoy > 0 ? "us.sf.bud3.move_up" : "us.sf.bud3.move_down"), { pct: pct1(yoy), y: fy - 1 });
  const series = d.points.spending.filter((p) => p.total_usd > 0).map((p) => ({ year: p.fiscal_year, amount: p.total_usd }));
  const provisional = d.years.filter((y) => !closed(y));
  const shareTitle = fill(t("us.sf.bud3.share_title"), { total: fmtUsdCompact(bd.totals.spending.total_usd), y: fy });
  const yearLabel = (y: number) => `FY${y} · ${t(STATUS_KEY[d.statuses[String(y)] ?? "closed"])}`;
  const taUsd = Math.abs(bd.totals.spending.transfer_adjustment_usd);
  const lastClosed = Math.max(...d.years.filter(closed));

  /* ── The table : spending and revenue face to face ── */
  const [group, setGroup] = useState<Group>("service");
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "budget", field: "scene_group", value: g });
    setGroup(g);
  };
  const netTotal = bd.totals.spending.total_usd;
  const services = [...bd.org_groups.spending].filter((g) => g.total_usd > 0).sort((a, b) => b.total_usd - a.total_usd);
  const spChars = [...bd.characters.spending].filter((c) => c.display_category === "standard" && c.total_usd > 0).sort((a, b) => b.total_usd - a.total_usd);
  const revChars = [...bd.characters.revenue].filter((c) => c.display_category === "standard" && c.total_usd > 0).sort((a, b) => b.total_usd - a.total_usd);
  const internal = [
    ...bd.characters.spending.filter((c) => c.display_category !== "standard" || c.total_usd < 0).map((c) => ({ ...c, side: t("us.sf.bud3.col_sp") })),
    ...bd.characters.revenue.filter((c) => c.display_category !== "standard" || c.total_usd < 0).map((c) => ({ ...c, side: t("us.sf.bud3.col_rev") })),
  ];
  const sum = (xs: { total_usd: number }[]) => xs.reduce((s, x) => s + x.total_usd, 0);
  const spGross = sum(spChars);
  const revGross = sum(revChars);
  const isGross = (v: number) => netTotal > 0 && Math.abs(v - netTotal) > netTotal * 0.01;
  const drill = bd.drill.available;
  // One note under the table when a column is gross (the negative transfer
  // lines sit in their own category) : which column, said once.
  const grossNote = group === "type" && isGross(spGross)
    ? fill(t("us.sf.budget.sflux.gross_note"), { ta: fmtUsdCompact(taUsd), net: fmtUsdCompact(netTotal) })
    : drill && isGross(revGross)
      ? fill(t("us.sf.budget.sflux.gross_note_rev"), { ta: fmtUsdCompact(taUsd), net: fmtUsdCompact(netTotal) })
      : null;
  const sparkYears = d.years.filter((y) => y <= fy);
  const sparkSpan = sparkYears.length > 1 ? `FY${sparkYears[0]}–FY${sparkYears[sparkYears.length - 1]}` : `FY${fy}`;
  /** The line's own years, tiny : grey closed, hatched not yet closed, blue the year shown. */
  const Spark = ({ pts: all }: { pts?: { year: number; value: number }[] }) => {
    const pts = (all ?? []).filter((p) => p.year <= fy);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `FY${p.year}: ${fmtUsdCompact(p.value)}`).join(" · ")}>
        {pts.map((p) => (
          <i key={p.year} className={`${p.year === fy ? "now" : ""} ${closed(p.year) ? "" : "vote"}`.trim()} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />
        ))}
      </span>
    );
  };
  type RowProps = { label: string; value: number; of: number; max: number; href?: string; spark?: { year: number; value: number }[]; sub?: string };
  const Row = ({ label, value, of, max, href, spark, sub }: RowProps) => {
    const body = (
      <>
        <span className="n">
          {label}
          <i className="bar" style={{ width: `${Math.max(2, Math.round((value / Math.max(max, 1)) * 100))}%` }} aria-hidden="true" />
        </span>
        <span className="sp"><Spark pts={spark} /></span>
        <Amt n={value} />
        <span className="p tnum">{Math.round((value / of) * 100)} %</span>
        <span className="c" aria-hidden="true">{href ? "›" : ""}</span>
      </>
    );
    return href ? (
      <Link href={href} scroll={false} className="fx-bud-row" data-peek={sub}>{body}</Link>
    ) : (
      <div className="fx-bud-row fx-bud-row--static">{body}</div>
    );
  };
  const spTypesShown = spChars.slice(0, TYPES_CAP);
  const spTypesRest = spChars.slice(TYPES_CAP);
  const revShown = revChars.slice(0, REV_CAP);
  const revRest = revChars.slice(REV_CAP);
  const serviceMax = Math.max(...services.map((g) => g.total_usd), 1);
  const typeMax = Math.max(...spChars.map((c) => c.total_usd), 1);
  const revMax = Math.max(...revChars.map((c) => c.total_usd), 1);
  const deptWord = (n: number) => (n === 1 ? t("us.sf.bud3.dept_one") : t("us.sf.bud3.dept_many"));

  /* ── The departments that weigh the most, inside the service areas above ── */
  const areaLabel = new Map(bd.org_groups.spending.map((g) => [g.code, g.label]));
  const depts = [...bd.departments.spending].filter((x) => x.total_usd > 0).sort((a, b) => b.total_usd - a.total_usd);
  const deptsShown = depts.slice(0, LINES_CAP);
  const deptsRest = depts.length - LINES_CAP >= 2 ? depts.slice(LINES_CAP) : [];
  const deptsAll = deptsRest.length ? deptsShown : depts;
  const DeptRow = (x: (typeof depts)[number]) => (
    <V3Row
      key={x.code}
      href={`${BUDGET}/dept/${deptSlug(x.code)}?year=${fy}`}
      label={x.display_name ?? x.label}
      subText={fill(t("us.sf.bud3.dept_sub"), { area: areaLabel.get(x.org_group_code) ?? x.org_group_code, share: fmtShare(x.share_of_side) })}
      amount={<Amt n={x.total_usd} />}
    />
  );

  /* ── Understand : adopted vs spent, the long view, the status of the year ── */
  const exec = d.spine.filter((p) => p.actual_usd != null && p.budget_usd != null && closed(p.fiscal_year)).sort((a, b) => b.fiscal_year - a.fiscal_year)[0] ?? null;
  const actualYears = d.trend.filter((p) => p.actual_all_usd != null).map((p) => p.fiscal_year);
  const budgetYears = d.trend.filter((p) => p.budget_net_usd != null).map((p) => p.fiscal_year);
  const trendY0 = actualYears.length ? Math.min(...actualYears) : 0;
  const trendY1 = actualYears.length ? Math.max(...actualYears) : 0;
  const budgetY0 = budgetYears.length ? Math.min(...budgetYears) : 0;
  const statusFold = status === "recently_closed_preliminary"
    ? { label: fill(t("us.sf.bud3.u.status_prelim"), { y: fy }), body: fill(t("us.sf.budget.notice.preliminary"), { fy }) }
    : status === "adopted_only" && spendingPoint
      ? { label: fill(t("us.sf.bud3.u.status_adopted"), { y: fy }), body: fill(t("us.sf.budget.notice.adopted_only"), { fy, n_lines: int.format(spendingPoint.n_lines), n_lines_y1: int.format(prevPoint?.n_lines ?? 0) }) }
      : null;

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={BASE}>San Francisco</Link> › {t("us.sf.bud3.kicker")}</div>
        <div className="fx-sec-grid" data-layout="budget">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("us.sf.bud3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={t("us.sf.bud3.cap_before")}
              captionAfter={t("us.sf.bud3.cap_after")}
              years={d.years}
              year={fy}
              yearLabel={yearLabel}
              basePath={BUDGET}
              meta={[bd.totals.spending.per_resident_usd != null ? fill(t("us.sf.bud3.meta_hab"), { hab: fmtUsd(Math.round(bd.totals.spending.per_resident_usd)) }) : null, fill(t("us.sf.bud3.meta_lines"), { lines: int.format(bd.totals.spending.n_lines) }), taUsd > 0 ? fill(t("us.sf.bud3.meta_ta"), { ta: fmtUsdCompact(taUsd) }) : null].filter(Boolean).join(" · ")}
              move={move}
              shareTitle={shareTitle}
            />
          </div>

          <div className="fx-sec-a-rail">
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                <AnneesRail rows={series} current={fy} provisional={provisional} format={fmtUsdCompact} />
                <p className="fx-v3-note">{t("us.sf.bud3.years_note")}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-table">
            <V3Section id="scene" title={fill(t("us.sf.bud3.h.table"), { y: fy })} sub={fill(t(drill ? "us.sf.bud3.table_sub" : "us.sf.bud3.table_sub_nodrill"), { span: sparkSpan, y: fy })} hint={drill ? t("us.sf.bud3.table_hint") : undefined}>
              <div id="budget-scene" className={`fx-bud-cols${drill ? "" : " fx-bud-cols--one"}`}>
                <div className="fx-bud-col">
                  {/* The switch lives in the column head so the first rows of both columns start on the same line. */}
                  <h3>
                    <span>{t("us.sf.bud3.col_sp")}</span>
                    {drill ? (
                      <span className="fx-sec-switch" role="group" aria-label={t("us.sf.bud3.g.aria")}>
                        {(["service", "type"] as Group[]).map((g) => (
                          <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{t(`us.sf.bud3.g.${g}`)}</button>
                        ))}
                      </span>
                    ) : null}
                    <span className="tnum">{fmtUsdCompact(netTotal)}</span>
                  </h3>
                  {group === "service" || !drill
                    ? services.map((g) => (
                        <Row key={g.code} label={g.label} value={g.total_usd} of={netTotal} max={serviceMax} spark={d.sparks.services[g.label]} sub={`${g.n_departments} ${deptWord(g.n_departments)}`} href={drill ? `${BUDGET}/service/${serviceSlug(g.label)}?year=${fy}&side=spending` : undefined} />
                      ))
                    : (
                      <>
                        {spTypesShown.map((c) => (
                          <Row key={c.code} label={c.label} value={c.total_usd} of={spGross} max={typeMax} spark={d.sparks.spending[c.code]} sub={c.gloss ?? undefined} href={`${BUDGET}/character/${characterSlug(c.code)}?year=${fy}&side=spending`} />
                        ))}
                        {spTypesRest.length > 0 ? <Row label={fill(t("us.sf.bud3.other_types"), { n: spTypesRest.length })} value={sum(spTypesRest)} of={spGross} max={typeMax} /> : null}
                      </>
                    )}
                </div>
                {drill ? (
                  <div className="fx-bud-col">
                    <h3>
                      <span>{t("us.sf.bud3.col_rev")}</span>
                      <span className="tnum">{fmtUsdCompact(bd.totals.revenue.total_usd)}</span>
                    </h3>
                    {revShown.map((c) => (
                      <Row key={c.code} label={c.label} value={c.total_usd} of={revGross} max={revMax} spark={d.sparks.revenue[c.code]} sub={c.gloss ?? undefined} href={`${BUDGET}/character/${characterSlug(c.code)}?year=${fy}&side=revenue`} />
                    ))}
                    {revRest.length > 0 ? <Row label={fill(t("us.sf.bud3.other_sources"), { n: revRest.length })} value={sum(revRest)} of={revGross} max={revMax} /> : null}
                  </div>
                ) : null}
              </div>
              {grossNote ? <p className="fx-v3-note">{grossNote}</p> : null}
              {internal.length > 0 ? (
                <V3Fold id="internal" label={fill(t("us.sf.bud3.internal_h"), { n: internal.length })}>
                  <p className="fx-v3-sentence">{t("us.sf.budget.sflux.internal_expl")}</p>
                  {internal.map((c) => (
                    <V3Row key={`${c.side}-${c.code}`} label={c.label} subText={[c.side, c.gloss].filter(Boolean).join(" · ")} amount={<Amt n={c.total_usd} />} />
                  ))}
                </V3Fold>
              ) : null}
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="budget-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-rows">
            {deptsAll.length > 0 ? (
              <V3Section id="lines" title={fill(t("us.sf.bud3.h.lines"), { y: fy })} sub={t("us.sf.bud3.lines_sub")}>
                {deptsAll.map(DeptRow)}
                {deptsRest.length > 0 ? <V3Fold id="more-lines" label={fill(t("us.sf.bud3.lines_more"), { n: deptsRest.length })}>{deptsRest.map(DeptRow)}</V3Fold> : null}
              </V3Section>
            ) : null}
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related" title={t("fx.sec.see_also")}>
              {d.doors.payees ? (
                <Door href={`${BASE}/who-gets-paid?year=${d.doors.payees.fy}`} hard title={t("us.sf.bud3.r.payees")} sub={fill(t("us.sf.bud3.r.payees_sub"), { y: d.doors.payees.fy })} value={fmtUsdAmt(d.doors.payees.total).v} unit={fmtUsdAmt(d.doors.payees.total).u} />
              ) : (
                <Door href={`${BASE}/who-gets-paid`} hard title={t("us.sf.bud3.r.payees")} sub={t("us.sf.bud3.r.payees_sub_noyear")} />
              )}
              {d.doors.contracts ? (
                <Door href={`${BASE}/contracts`} hard title={t("us.sf.bud3.r.contracts")} sub={fill(t("us.sf.bud3.r.contracts_sub"), { n: int.format(d.doors.contracts.n) })} value={fmtUsdAmt(d.doors.contracts.agreed).v} unit={fmtUsdAmt(d.doors.contracts.agreed).u} />
              ) : (
                <Door href={`${BASE}/contracts`} hard title={t("us.sf.bud3.r.contracts")} sub={t("us.sf.bud3.r.contracts_sub_noyear")} />
              )}
              {d.doors.payroll ? (
                <Door href={`${BASE}/payroll`} hard title={t("us.sf.bud3.r.payroll")} sub={fill(t("us.sf.bud3.r.payroll_sub"), { n: int.format(d.doors.payroll.n), y: d.doors.payroll.fy })} value={fmtUsdAmt(d.doors.payroll.total).v} unit={fmtUsdAmt(d.doors.payroll.total).u} />
              ) : (
                <Door href={`${BASE}/payroll`} hard title={t("us.sf.bud3.r.payroll")} sub={t("us.sf.bud3.r.payroll_sub_noyear")} />
              )}
              <V3Row href={`${BUDGET}/timeline`} label={t("us.sf.bud3.r.timeline")} subText={t("us.sf.bud3.r.timeline_sub")} />
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="exec" label={t("us.sf.bud3.u.exec")}>
                <p className="fx-v3-sentence">
                  {exec && exec.actual_usd != null && exec.budget_usd != null && exec.residual_pct != null
                    ? fill(t("us.sf.bud3.u.exec_body"), { y: exec.fiscal_year, actual: fmtUsdCompact(exec.actual_usd), budget: fmtUsdCompact(exec.budget_usd), pct: pct1(exec.residual_pct * 100), dir: t(exec.residual_pct <= 0 ? "us.sf.bud3.u.exec_under" : "us.sf.bud3.u.exec_over") })
                    : t("us.sf.bud3.u.exec_body_nofig")}
                </p>
              </V3Fold>
              {d.trend.length > 0 && trendY0 > 0 ? (
                <V3Fold id="trend" label={fill(t("us.sf.bud3.u.trend"), { y0: trendY0, y1: budgetY0 })}>
                  <UsBudgetTrend
                    points={d.trend}
                    labels={{ actual: t("us.sf.budget.strend.legend.actual"), budget: t("us.sf.budget.strend.legend.budget") }}
                    ariaLabel={fill(t("us.sf.budget.strend.aria"), { y0: trendY0, y1: budgetY0, y1e: trendY1 })}
                    height={300}
                  />
                  <p className="fx-v3-sentence">{t("us.sf.budget.strend.note")}</p>
                </V3Fold>
              ) : null}
              <V3Fold id="count" label={t("us.sf.bud3.u.count")}>
                <p className="fx-v3-sentence">{fill(t("us.sf.bud3.u.count_body"), { ta: fmtUsdCompact(taUsd), pop: int.format(d.population.value), py: d.population.year })}</p>
              </V3Fold>
              {statusFold ? (
                <V3Fold id="status" label={statusFold.label}>
                  <p className="fx-v3-sentence">{statusFold.body} <Link href={`${BUDGET}?year=${lastClosed}`}>{fill(t("us.sf.budget.notice.cta"), { fy: lastClosed })}</Link></p>
                </V3Fold>
              ) : null}
              {!drill ? (
                <V3Fold id="nodrill" label={fill(t("us.sf.bud3.u.nodrill"), { y: fy })}>
                  <p className="fx-v3-sentence">{bd.drill.reason ?? ""} <Link href={`${BASE}/sources#fy2018-note`}>{t("us.sf.budget.s02.no_drill.cta")}</Link> · <Link href={`${BUDGET}?year=${lastClosed}`}>{fill(t("us.sf.budget.notice.cta"), { fy: lastClosed })}</Link></p>
                </V3Fold>
              ) : null}
              <V3Fold id="sources" label={t("us.sf.bud3.u.source")}>
                <p className="fx-v3-sentence">{t("us.sf.bud3.u.source_body")}</p>
                <p className="fx-v3-sentence">
                  <a href={d.source.source_url} target="_blank" rel="noopener noreferrer">{d.source.name} · DataSF ↗</a>
                  {" · "}
                  <a href={`/data/us/sf/budget_breakdown_${fy}.json`} target="_blank" rel="noopener noreferrer">JSON FY{fy} ↗</a>
                  {" · "}
                  <a href="/data/us/sf/budget_by_year.json" target="_blank" rel="noopener noreferrer">budget_by_year.json ↗</a>
                  {" · "}
                  <a href="/data/us/sf/budget_vs_actual.json" target="_blank" rel="noopener noreferrer">budget_vs_actual.json ↗</a>
                  {" · "}
                  <Link href={`${BASE}/sources#sec-budget`}>{t("us.sf.bud3.u.method")}</Link>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={d.doors.payees ? `${BASE}/who-gets-paid?year=${d.doors.payees.fy}` : `${BASE}/who-gets-paid`}
              kicker={t("fx.sec.next")}
              title={t("us.sf.bud3.next")}
              sub={d.doors.payees ? fill(t("us.sf.bud3.next_sub"), { y: d.doors.payees.fy }) : t("us.sf.bud3.next_sub_noyear")}
              value={d.doors.payees ? fmtUsdAmt(d.doors.payees.total).v : undefined}
              unit={d.doors.payees ? fmtUsdAmt(d.doors.payees.total).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("us.sf.bud3.foot"), { src: d.source.attribution })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
