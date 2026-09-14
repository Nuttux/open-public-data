"use client";

import { useState } from "react";
import Link from "@/components/LocalizedLink";
// Direct imports only — no fusion barrel (node:fs leak precedent, ADR-0010 D3).
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow from "@/components/fusion/BarRow";
import YearPicker from "@/components/fusion/YearPicker";
import EmptyState from "@/components/fusion/EmptyState";
import Button from "@/components/fusion/Button";
import Tip from "@/components/fusion/Tip";
import DualFlowBars, { type FlowRow } from "@/components/fusion/DualFlowBars";
import UsBudgetTrend from "./UsBudgetTrend";
import ChartSource from "@/components/fusion/ChartSource";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { useT } from "@/lib/localeContext";
import { deptSlug, characterSlug, serviceSlug } from "@/lib/us/sf-budget-slugs";
import {
  fmtUsd,
  fmtUsdCompact,
  fmtShare,
  fmtYoy,
} from "@/lib/us/format";
import type {
  SfBudgetYearPoint,
  SfBudgetBreakdown,
  SfBvaDeptRow,
  SfExecutionStatus,
  SfSourceBlock,
} from "@/lib/us/sf-budget-data";

/**
 * /us/city/sf/budget — EN-only (ADR-0010 D3): every string flows through
 * `us.sf.budget.*` keys whose EN and FR values are identical English.
 * Every number on the page comes from the exports; the only client-side
 * arithmetic is ratios of two exported values (execution rate) and
 * "top-N vs rest" list splits — rollups are dbt marts, identity-tested.
 */

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
  spine: SfBvaSpinePoint[];
  trend: { fiscal_year: number; budget_net_usd: number | null; actual_all_usd: number | null }[];
  bvaTable: {
    fiscal_year: number;
    rows: SfBvaDeptRow[];
    perimeter: string;
    coverage_note: string;
    sources: { budget_url: string; actuals_url: string };
  } | null;
  source: SfSourceBlock;
  generated_at: string;
  source_pipeline: string;
};

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** UI display constants (presentation choices, not data). */
const REV_FOLD = 8;
const SP_TYPE_FOLD = 8;



export default function SfBudgetClient({ d }: { d: SfBudgetPageData }) {
  const t = useT();
  const bd = d.breakdown;
  const status = bd.execution_status;
  const fy = d.year;

  const spendingPoint = d.points.spending.find((p) => p.fiscal_year === fy);
  const prevPoint = d.points.spending.find((p) => p.fiscal_year === fy - 1);
  const yoy =
    spendingPoint && prevPoint && prevPoint.total_usd > 0
      ? spendingPoint.total_usd / prevPoint.total_usd - 1
      : null;

  const votedYears = d.years.filter((y) => d.statuses[String(y)] === "adopted_only");
  const previewYears = d.years.filter(
    (y) => d.statuses[String(y)] === "recently_closed_preliminary",
  );
  const lastClosed = Math.max(
    ...d.years.filter((y) => d.statuses[String(y)] === "closed"),
  );


  // The flow section — revenue on the left, spending on the right, one
  // toggle switching how the spending side is grouped (service area / type
  // of money). Same shape as the Paris budget flow: bars, not a treemap.
  const [compView, setCompView] = useState<"service" | "type">("service");
  const compBtn = (key: "service" | "type", label: string) => (
    <button
      type="button"
      aria-pressed={compView === key}
      onClick={() => setCompView(key)}
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 11.5,
        padding: "6px 14px",
        border: "1px solid #0a0a0a",
        background: compView === key ? "#0a0a0a" : "transparent",
        color: compView === key ? "#fff" : "#0a0a0a",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  // strend — the long view: actuals span (first/last year with an actual),
  // and the FY the adopted budget begins (first year with a budget point).
  const actualYears = d.trend.filter((p) => p.actual_all_usd != null).map((p) => p.fiscal_year);
  const budgetYears = d.trend.filter((p) => p.budget_net_usd != null).map((p) => p.fiscal_year);
  const trendY0 = actualYears.length ? Math.min(...actualYears) : 0;
  const trendY1 = actualYears.length ? Math.max(...actualYears) : 0;
  const budgetY0 = budgetYears.length ? Math.min(...budgetYears) : 0;

  // Service areas — the 7-row spending lens. Group totals are already net of
  // their own transfer adjustments, so this column sums to the citywide total.
  const orgGroups = [...bd.org_groups.spending].sort((a, b) => b.total_usd - a.total_usd);
  const serviceRows = orgGroups.filter((g) => g.total_usd > 0);
  const orgGroupRank = new Map(orgGroups.map((g, i) => [g.code, i]));
  const orgGroupLabel = new Map(orgGroups.map((g) => [g.code, g.label]));
  // Departments sort by service area (biggest area first), then by size
  // within it — reading down the folded list retraces the bars above instead
  // of interleaving areas by raw department size.
  const depts = [...bd.departments.spending].sort((a, b) => {
    const rankDiff =
      (orgGroupRank.get(a.org_group_code) ?? Infinity) -
      (orgGroupRank.get(b.org_group_code) ?? Infinity);
    return rankDiff !== 0 ? rankDiff : b.total_usd - a.total_usd;
  });

  // Spending characters (standard = bars; offsets/adjustments = folded block)
  const spChars = bd.characters.spending;
  const spBars = [...spChars]
    .filter((c) => c.display_category === "standard" && c.total_usd > 0)
    .sort((a, b) => b.total_usd - a.total_usd);
  const spOffsets = spChars.filter(
    (c) => c.display_category === "offset" || c.display_category === "adjustment" || c.total_usd < 0,
  );

  // Revenue characters — always the left column, whichever spending lens is on.
  const revChars = bd.characters.revenue;
  const revBars = [...revChars]
    .filter((c) => c.display_category === "standard" && c.total_usd > 0)
    .sort((a, b) => b.total_usd - a.total_usd);
  const revInternal = revChars.filter(
    (c) => c.display_category === "internal" || c.display_category === "adjustment" || c.total_usd < 0,
  );

  // ── Flow rows ────────────────────────────────────────────────────────────
  // Both columns show the head of the distribution and fold the tail into one
  // explicitly-counted "other" row, so a column never silently omits money.
  const sumUsd = (xs: { total_usd: number }[]) => xs.reduce((s, x) => s + x.total_usd, 0);
  const linkable = bd.drill.available;
  const deptWord = (n: number) =>
    t(n === 1 ? "us.sf.budget.sflux.dept_one" : "us.sf.budget.sflux.dept_many");

  const revHead = revBars.slice(0, REV_FOLD);
  const revTail = revBars.slice(REV_FOLD);
  const leftRows: FlowRow[] = [
    ...revHead.map((c) => ({
      label: c.label,
      value: c.total_usd,
      display: fmtUsdCompact(c.total_usd),
      sub: fill(t("us.sf.budget.s04.char_sub"), { share: fmtShare(c.share_of_side) }),
      href: linkable
        ? `/usa/san-francisco/budget/character/${characterSlug(c.code)}?year=${fy}&side=revenue`
        : undefined,
    })),
    ...(revTail.length > 0
      ? [
          {
            label: t("us.sf.budget.sflux.other_sources"),
            value: sumUsd(revTail),
            display: fmtUsdCompact(sumUsd(revTail)),
            sub: fill(t("us.sf.budget.sflux.other_sub"), { n: revTail.length }),
          },
        ]
      : []),
  ];

  const spTypeHead = spBars.slice(0, SP_TYPE_FOLD);
  const spTypeTail = spBars.slice(SP_TYPE_FOLD);
  const rightRows: FlowRow[] =
    compView === "service"
      ? serviceRows.map((g) => ({
          label: g.label,
          value: g.total_usd,
          display: fmtUsdCompact(g.total_usd),
          sub: fill(t("us.sf.budget.sflux.service_sub"), {
            share: fmtShare(g.share_of_side),
            n: g.n_departments,
            dept_word: deptWord(g.n_departments),
          }),
          href: linkable
            ? `/usa/san-francisco/budget/service/${serviceSlug(g.label)}?year=${fy}&side=spending`
            : undefined,
        }))
      : [
          ...spTypeHead.map((c) => ({
            label: c.label,
            value: c.total_usd,
            display: fmtUsdCompact(c.total_usd),
            sub: fill(t("us.sf.budget.sflux.type_sub"), {
              share: fmtShare(c.share_of_side),
              n: c.n_departments,
              dept_word: deptWord(c.n_departments),
            }),
            href: `/usa/san-francisco/budget/character/${characterSlug(c.code)}?year=${fy}&side=spending`,
          })),
          ...(spTypeTail.length > 0
            ? [
                {
                  label: t("us.sf.budget.sflux.other_types"),
                  value: sumUsd(spTypeTail),
                  display: fmtUsdCompact(sumUsd(spTypeTail)),
                  sub: fill(t("us.sf.budget.sflux.other_sub"), { n: spTypeTail.length }),
                },
              ]
            : []),
        ];

  // Gross vs net. Service-area rows are already net; character rows are gross,
  // because the negative transfer-adjustment lines sit in their own category.
  // Whichever column is gross gets said out loud rather than quietly rounded.
  const netTotal = bd.totals.spending.total_usd;
  const taUsd = Math.abs(bd.totals.spending.transfer_adjustment_usd);
  const isGross = (v: number) => netTotal > 0 && Math.abs(v - netTotal) > netTotal * 0.01;
  const revGross = sumUsd(revBars);
  const spGross = compView === "service" ? sumUsd(serviceRows) : sumUsd(spBars);
  const grossNoteKey = isGross(spGross)
    ? "us.sf.budget.sflux.gross_note"
    : isGross(revGross)
      ? "us.sf.budget.sflux.gross_note_rev"
      : null;

  const internalRows = [
    ...spOffsets.map((c) => ({ ...c, sideLabel: t("us.sf.side.spending") })),
    ...revInternal.map((c) => ({ ...c, sideLabel: t("us.sf.side.revenue") })),
  ];


  const statusNoticeKey =
    status === "adopted_only"
      ? "us.sf.budget.notice.adopted_only"
      : status === "recently_closed_preliminary"
        ? "us.sf.budget.notice.preliminary"
        : null;

  // overflow-x: clip on <main> contains the shared TOC's -16px edge-bleed
  // margins (France pages carry the same 16px document overflow at ≤860px)
  // WITHOUT creating a scroll container — position:sticky keeps working
  // because main spans the full scroll range.

  // The long view — 28 years of actuals + adopted budget. Closing context,
  // after the composition and execution sections.
  const trendSection = d.trend.length > 0 && trendY0 > 0 ? (
    <section className="fx-section" id="sec-trend">
      <div className="fx-wrap">
        <SectionHead
          title={
            <>
              {t("us.sf.budget.strend.title.before")}
              <em>{t("us.sf.budget.strend.title.em")}</em>
            </>
          }
          subtitle={fill(t("us.sf.budget.strend.sub"), { y0: trendY0, y1: budgetY0 })}
        />
        <figure style={{ margin: 0 }}>
          <UsBudgetTrend
            points={d.trend}
            labels={{
              actual: t("us.sf.budget.strend.legend.actual"),
              budget: t("us.sf.budget.strend.legend.budget"),
            }}
            ariaLabel={fill(t("us.sf.budget.strend.aria"), {
              y0: trendY0,
              y1: budgetY0,
              y1e: trendY1,
            })}
          />
          <ChartSource
            source={d.source.name}
            dataHref={d.source.source_url}
            methodHref="/usa/san-francisco/sources#sec-budget"
          />
        </figure>
        <p className="fx-note" style={{ marginTop: 12 }}>
          {t("us.sf.budget.strend.note")}
        </p>
        {/* The 28 years above are where the machine-readable data starts. The
         *  timeline page carries the archive-transcribed 1880s→ series; it had
         *  no entry point from anywhere on the site. */}
        <p style={{ marginTop: 14, fontFamily: "var(--f-ui)", fontSize: 14.5, lineHeight: 1.6 }}>
          <Link
            href="/usa/san-francisco/budget/timeline"
            style={{
              color: "var(--bleu)",
              borderBottom: "1px solid var(--bleu)",
              paddingBottom: 1,
              textDecoration: "none",
            }}
          >
            {t("us.sf.budget.strend.timeline_cta")}
          </Link>
        </p>
      </div>
    </section>
  ) : null;

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageTOC
        items={[
          { id: "sec-flux", label: t("us.sf.budget.sflux.kind") },
          { id: "sec-trend", label: t("us.sf.budget.strend.kind") },
        ]}
      />

      {/* ── Opener: signature stat band (folds the former "01 Overview") ── */}
      <PageIntro
        title={
          <>
            {t("us.sf.budget.title.before")}
            <em>{t("us.sf.budget.title.em")}</em>
            {t("us.sf.budget.title.after")}
          </>
        }
        lede={t("us.sf.budget.lede")}
        actions={
          <YearPicker
            years={d.years}
            votedYears={votedYears}
            previewYears={previewYears}
            current={fy}
            basePath="/usa/san-francisco/budget"
            label={t("us.sf.budget.year_label")}
            previewTitle={t("us.sf.budget.year_preview_title")}
          />
        }
        stats={
          <>
            <IntroStat
              value={
                <AnimatedNumber
                  value={bd.totals.spending.total_usd}
                  format={(n) => fmtUsdCompact(n)}
                />
              }
              label={
                <Tip label={t("us.sf.budget.s01.hero.net_tip")}>
                  {fill(t("us.sf.budget.s01.hero.label"), { fy })}
                  {yoy != null ? ` · ${fmtYoy(yoy)}` : ""}
                </Tip>
              }
            />
            <IntroStat
              value={
                bd.totals.spending.per_resident_usd != null ? (
                  <AnimatedNumber
                    value={bd.totals.spending.per_resident_usd}
                    format={(n) => fmtUsd(n)}
                  />
                ) : (
                  "—"
                )
              }
              label={t("us.sf.budget.s01.kpi.per_resident")}
            />
            {/* No third "budgeted revenue" stat: the budget balances, so it
             *  printed the same $15.9B as the first one. The flow section
             *  below shows the balance properly — two columns, one total. */}
          </>
        }
      >
        {statusNoticeKey && spendingPoint && (
          <p
            style={{
              marginTop: 14,
              marginBottom: 0,
              fontFamily: "var(--f-mono)",
              fontSize: 11.5,
              color: "var(--ink-2)",
              letterSpacing: ".04em",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span>
              {fill(t(statusNoticeKey), {
                fy,
                n_lines: spendingPoint.n_lines.toLocaleString("en-US"),
                n_lines_y1: (
                  d.points.spending.find((p) => p.fiscal_year === fy - 1)?.n_lines ?? 0
                ).toLocaleString("en-US"),
              })}
            </span>
            <Link
              href={`/usa/san-francisco/budget?year=${lastClosed}`}
              style={{
                color: "var(--bleu)",
                borderBottom: "1px solid var(--bleu)",
                paddingBottom: 1,
                textDecoration: "none",
              }}
            >
              {fill(t("us.sf.budget.notice.cta"), { fy: lastClosed })}
            </Link>
          </p>
        )}
      </PageIntro>

      {/* ── The flow: where it comes from, where it goes (one bar diagram) ── */}
      <section className="fx-section" id="sec-flux">
        <div className="fx-wrap">
          {/* Without the drill (FY2018) only the spending side is publishable,
           *  so the heading promises the one side that is actually there. */}
          <SectionHead
            title={
              bd.drill.available ? (
                <>
                  {t("us.sf.budget.sflux.title.before")}
                  <em>{t("us.sf.budget.sflux.title.em")}</em>
                </>
              ) : (
                <>
                  {t("us.sf.budget.scomp.title.before")}
                  <em>{t("us.sf.budget.scomp.title.em")}</em>
                </>
              )
            }
            subtitle={fill(
              t(bd.drill.available ? "us.sf.budget.sflux.sub" : "us.sf.budget.sflux.sub_nodrill"),
              { total: fmtUsdCompact(netTotal), fy },
            )}
          />

          {bd.drill.available ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                  marginBottom: 22,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--f-mono)",
                    fontSize: 11,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  {t("us.sf.budget.sflux.toggle_label")}
                </span>
                <div
                  role="group"
                  aria-label={t("us.sf.budget.scomp.toggle_aria")}
                  style={{ display: "inline-flex" }}
                >
                  {compBtn("service", t("us.sf.budget.scomp.by_service"))}
                  {compBtn("type", t("us.sf.budget.scomp.by_type"))}
                </div>
              </div>

              <DualFlowBars
                wrapLabels
                left={{
                  title: fill(t("us.sf.budget.sflux.left_head"), { n: revBars.length }),
                  rows: leftRows,
                }}
                right={{
                  title:
                    compView === "service"
                      ? fill(t("us.sf.budget.sflux.right_head_service"), {
                          n: serviceRows.length,
                        })
                      : fill(t("us.sf.budget.sflux.right_head_type"), { n: spBars.length }),
                  rows: rightRows,
                }}
                center={{
                  label: fill(t("us.sf.budget.sflux.center_label"), { fy }),
                  value: fmtUsdCompact(netTotal),
                }}
                // One line only. Per-category explanation (e.g. why "Charges
                // for Services" is not fees on residents) is the character's
                // own `gloss`, rendered by the fiche the bar opens — the page
                // used to repeat it here.
                callout={
                  grossNoteKey
                    ? fill(t(grossNoteKey), {
                        ta: fmtUsdCompact(taUsd),
                        net: fmtUsdCompact(netTotal),
                      })
                    : undefined
                }
              />

              {/* Depth on demand — the two long lists that used to sit open on
               *  the page. Nothing is dropped; both carry an honest count. */}
              <div style={{ marginTop: 26, display: "grid", gap: 6 }}>
                <details className="fx-more">
                  <summary>{fill(t("us.sf.budget.sflux.depts_h"), { n: depts.length })}</summary>
                  <div className="fx-more-body">
                    <BarRow
                      header={{
                        left: t("us.sf.budget.s02.header.left"),
                        right: t("us.sf.budget.s02.header.right"),
                      }}
                      items={depts.map((dep) => ({
                        label: dep.display_name ?? dep.label,
                        value: Math.max(0, dep.total_usd),
                        display: fmtUsdCompact(dep.total_usd),
                        href: `/usa/san-francisco/budget/dept/${deptSlug(dep.code)}?year=${fy}`,
                        sub: fill(t("us.sf.budget.s02.dept_sub"), {
                          share: fmtShare(dep.share_of_side),
                          group: orgGroupLabel.get(dep.org_group_code) ?? dep.org_group_code,
                        }),
                      }))}
                    />
                  </div>
                </details>

                {internalRows.length > 0 && (
                  <details className="fx-more">
                    <summary>
                      {fill(t("us.sf.budget.sflux.internal_h"), { n: internalRows.length })}
                    </summary>
                    <div className="fx-more-body">
                      <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 0 }}>
                        {t("us.sf.budget.sflux.internal_expl")}
                      </p>
                      <div style={{ display: "grid", gap: 8 }}>
                        {internalRows.map((c) => (
                          <div
                            key={`${c.sideLabel}-${c.code}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 16,
                              flexWrap: "wrap",
                              borderTop: "1px solid var(--rule)",
                              paddingTop: 8,
                              fontSize: 13.5,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {c.gloss ? <Tip label={c.gloss}>{c.label}</Tip> : c.label}{" "}
                              <span
                                style={{
                                  fontFamily: "var(--f-mono)",
                                  fontSize: 10.5,
                                  fontWeight: 400,
                                  color: "var(--muted)",
                                }}
                              >
                                {c.sideLabel}
                              </span>
                            </span>
                            <span
                              className="tnum"
                              style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}
                            >
                              {fmtUsdCompact(c.total_usd)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </div>

              {bd.program_strip.available && bd.program_strip.rows.length > 0 && (
                <div
                  style={{
                    marginTop: 26,
                    paddingTop: 18,
                    borderTop: "1px solid var(--rule)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px 28px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      alignSelf: "center",
                    }}
                  >
                    {t("us.sf.budget.s01.strip.label")}
                  </span>
                  {bd.program_strip.rows.slice(0, 4).map((r) => (
                    <span key={r.program} style={{ fontSize: 13.5 }}>
                      <b>{r.program}</b>{" "}
                      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
                        {fmtUsdCompact(r.total_usd)} · {fmtShare(r.share_of_side)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            // FY2018 (PeopleSoft migration): service-area and citywide totals
            // are consistent and shipped; department/character detail is not.
            <>
              <BarRow
                reveal
                header={{
                  left: t("us.sf.budget.sflux.service_col"),
                  right: t("us.sf.budget.s02.header.right"),
                }}
                items={serviceRows.map((g) => ({
                  label: g.label,
                  value: g.total_usd,
                  display: fmtUsdCompact(g.total_usd),
                  sub: fill(t("us.sf.budget.sflux.service_sub"), {
                    share: fmtShare(g.share_of_side),
                    n: g.n_departments,
                    dept_word: deptWord(g.n_departments),
                  }),
                }))}
              />
              <div style={{ marginTop: 24 }}>
                <EmptyState
                  label={t("us.sf.budget.s02.no_drill.label")}
                  title={fill(t("us.sf.budget.s02.no_drill.title"), { fy })}
                  body={bd.drill.reason ?? ""}
                  actions={
                    // Was href="#fy2018-note" — an anchor that only exists on
                    // the sources page, so the button went nowhere.
                    <>
                      <Button href="/usa/san-francisco/sources#fy2018-note">
                        {t("us.sf.budget.s02.no_drill.cta")}
                      </Button>
                      <Button href={`/usa/san-francisco/budget?year=${lastClosed}`}>
                        {fill(t("us.sf.budget.notice.cta"), { fy: lastClosed })}
                      </Button>
                    </>
                  }
                />
              </div>
            </>
          )}

          <ChartSource
            source={d.source.name}
            dataHref={d.source.source_url}
            methodHref="/usa/san-francisco/sources#sec-budget"
          />
        </div>
      </section>

      {/* ── The long view (closing context) ── */}
      {trendSection}

      <SfSourceFooter
        perimeter={d.bvaTable?.perimeter ?? t("us.sf.budget.footer.perimeter")}
        coverage={d.bvaTable?.coverage_note}
        source={{ name: d.source.name, href: d.source.source_url }}
        sourcesAnchor="sec-budget"
        exports={[
          { label: `budget_breakdown_${fy}.json`, href: `/data/us/sf/budget_breakdown_${fy}.json` },
          { label: "budget_by_year.json", href: "/data/us/sf/budget_by_year.json" },
          { label: "budget_vs_actual.json", href: "/data/us/sf/budget_vs_actual.json" },
          {
            label: "budget_vs_actual_departments.json",
            href: "/data/us/sf/budget_vs_actual_departments.json",
          },
        ]}
      />
    </main>
  );
}
