"use client";

import { useState } from "react";
import Link from "next/link";
// Direct imports only — no fusion barrel (node:fs leak precedent, ADR-0010 D3).
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow from "@/components/fusion/BarRow";
import YearPicker from "@/components/fusion/YearPicker";
import EmptyState from "@/components/fusion/EmptyState";
import Button from "@/components/fusion/Button";
import Tip from "@/components/fusion/Tip";
import UsTreemap from "@/components/us/UsTreemap";
import UsBudgetTrend from "./UsBudgetTrend";
import { useT } from "@/lib/localeContext";
import { deptSlug, characterSlug } from "@/lib/us/sf-budget-slugs";
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
const DEPT_LIST_FOLD = 12;

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
        <span key={`${l.href}-${i}`}>
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

function CompareBar({
  label,
  value,
  widthPct,
  muted,
}: {
  label: string;
  value: string;
  widthPct: number;
  muted: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr minmax(100px, auto)", gap: 16, alignItems: "center" }}>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-2)", letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ position: "relative", height: 18, background: "var(--rule)" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.max(0, Math.min(100, widthPct))}%`,
            background: muted ? "var(--ink-2)" : "var(--ink)",
            transition: "width 300ms",
          }}
        />
      </div>
      <div className="tnum" style={{ fontFamily: "var(--f-num)", fontSize: 15, fontWeight: 600, textAlign: "right" }}>{value}</div>
    </div>
  );
}

export default function SfBudgetClient({ d }: { d: SfBudgetPageData }) {
  const t = useT();
  const bd = d.breakdown;
  const status = bd.execution_status;
  const fy = d.year;

  const spendingPoint = d.points.spending.find((p) => p.fiscal_year === fy);
  const revenuePoint = d.points.revenue.find((p) => p.fiscal_year === fy);
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

  const dataWord = t("us.sf.budget.data_link");
  const srcLabel = t("us.sf.budget.source_label");
  const budgetLinks = [{ name: d.source.name, href: d.source.source_url }];

  // "Where the money goes" — one section, two lenses: by service (org, the
  // treemap-led default) and by type (economic characters).
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

  // s02 — services. Departments sort by org group (in the treemap's own
  // group order, biggest tile first), then by size within the group — so
  // reading down the list retraces the treemap left-to-right instead of
  // interleaving groups by raw department size.
  const orgGroups = bd.org_groups.spending;
  const orgGroupRank = new Map(orgGroups.map((g, i) => [g.code, i]));
  const orgGroupLabel = new Map(orgGroups.map((g) => [g.code, g.label]));
  const depts = [...bd.departments.spending].sort((a, b) => {
    const rankDiff =
      (orgGroupRank.get(a.org_group_code) ?? Infinity) -
      (orgGroupRank.get(b.org_group_code) ?? Infinity);
    return rankDiff !== 0 ? rankDiff : b.total_usd - a.total_usd;
  });
  const deptTop = depts.slice(0, DEPT_LIST_FOLD);
  const deptRest = depts.slice(DEPT_LIST_FOLD);

  // s03 — spending characters (standard = bars; the rest = labeled blocks)
  const spChars = bd.characters.spending;
  const spBars = spChars.filter((c) => c.display_category === "standard" && c.total_usd > 0);
  const spOffsets = spChars.filter(
    (c) => c.display_category === "offset" || c.display_category === "adjustment" || c.total_usd < 0,
  );

  // s04 — revenue characters
  const revChars = bd.characters.revenue;
  const revBars = revChars.filter((c) => c.display_category === "standard" && c.total_usd > 0);
  const revInternal = revChars.filter(
    (c) => c.display_category === "internal" || c.display_category === "adjustment" || c.total_usd < 0,
  );

  // s05 — spine + selected point
  const spinePoint = d.spine.find((p) => p.fiscal_year === fy);
  const showComparison =
    (status === "closed" || status === "recently_closed_preliminary") &&
    spinePoint?.budget_usd != null &&
    spinePoint?.actual_usd != null &&
    spinePoint.budget_usd > 0;
  const execRate =
    showComparison && spinePoint?.actual_usd != null && spinePoint?.budget_usd != null
      ? (spinePoint.actual_usd / spinePoint.budget_usd) * 100
      : null;
  // Closed years — used only for the empty-state fallback CTA on future years.
  const spineClosed = d.spine.filter(
    (p) => p.budget_usd != null && p.actual_usd != null && p.residual_pct != null &&
      d.statuses[String(p.fiscal_year)] === "closed",
  );

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
          kind={t("us.sf.budget.strend.kind")}
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
          <SourceLine label={srcLabel} links={budgetLinks} dataWord={dataWord} />
        </figure>
        <p className="fx-note" style={{ marginTop: 12 }}>
          {t("us.sf.budget.strend.note")}
        </p>
      </div>
    </section>
  ) : null;

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageTOC
        items={[
          { id: "sec-composition", label: t("us.sf.budget.scomp.kind") },
          { id: "sec-revenue", label: t("us.sf.budget.toc.revenue") },
          { id: "sec-execution", label: t("us.sf.budget.toc.execution") },
          { id: "sec-trend", label: t("us.sf.budget.strend.kind") },
        ]}
      />

      {/* ── Opener: signature stat band (folds the former "01 Overview") ── */}
      <PageIntro
        kicker={fill(t("us.sf.budget.kicker"), { fy })}
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
            basePath="/us/city/sf/budget"
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
            <IntroStat
              value={
                revenuePoint ? (
                  <AnimatedNumber
                    value={revenuePoint.total_usd}
                    format={(n) => fmtUsdCompact(n)}
                  />
                ) : (
                  "—"
                )
              }
              label={t("us.sf.budget.s01.kpi.revenue")}
            />
            <IntroStat
              value={fmtUsdCompact(bd.totals.spending.transfer_adjustment_usd)}
              label={
                <Tip label={t("us.sf.budget.s01.kpi.ta_tip")}>
                  {t("us.sf.budget.s01.kpi.ta")}
                </Tip>
              }
            />
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
              href={`/us/city/sf/budget?year=${lastClosed}`}
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

      {/* ── Signature: where the money goes, by service ── */}
      {/* ── Where the money goes — one section, two lenses (service / type) ── */}
      <section className="fx-section" id="sec-composition">
        <div className="fx-wrap">
          <SectionHead
            kind={t("us.sf.budget.scomp.kind")}
            title={
              <>
                {t("us.sf.budget.scomp.title.before")}
                <em>{t("us.sf.budget.scomp.title.em")}</em>
              </>
            }
            subtitle={
              compView === "service"
                ? fill(t("us.sf.budget.s02.sub"), {
                    n_groups: orgGroups.length,
                    n_depts: depts.length,
                    fy,
                  })
                : fill(t("us.sf.budget.s03.sub"), { n: spBars.length, fy })
            }
          />
          <div
            role="group"
            aria-label={t("us.sf.budget.scomp.toggle_aria")}
            style={{ display: "inline-flex", marginBottom: 24 }}
          >
            {compBtn("service", t("us.sf.budget.scomp.by_service"))}
            {compBtn("type", t("us.sf.budget.scomp.by_type"))}
          </div>

          {compView === "service" ? (
            <>
          <UsTreemap
            data={orgGroups
              .filter((g) => g.total_usd > 0)
              .map((g) => ({
                id: g.code,
                shortLabel: g.label,
                fullLabel: g.label,
                value: g.total_usd,
                shareOfTotal: g.share_of_side,
                subLabel: fill(t("us.sf.budget.s02.tile_sub"), { n: g.n_departments }),
              }))}
            height={420}
            totalLabel={t("us.sf.budget.s02.of_spending")}
            ariaLabel={fill(t("us.sf.budget.s02.treemap_aria"), { fy })}
          />

          {bd.drill.available ? (
            <div style={{ marginTop: 34 }}>
              <BarRow
                reveal
                header={{
                  left: t("us.sf.budget.s02.header.left"),
                  right: t("us.sf.budget.s02.header.right"),
                }}
                items={deptTop.map((dep) => ({
                  label: dep.display_name ?? dep.label,
                  value: Math.max(0, dep.total_usd),
                  display: fmtUsdCompact(dep.total_usd),
                  href: `/us/city/sf/budget/dept/${deptSlug(dep.code)}?year=${fy}`,
                  sub: fill(t("us.sf.budget.s02.dept_sub"), {
                    share: fmtShare(dep.share_of_side),
                    group: orgGroupLabel.get(dep.org_group_code) ?? dep.org_group_code,
                  }),
                }))}
              />
              {deptRest.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontFamily: "var(--f-mono)",
                      fontSize: 12,
                      color: "var(--ink-2)",
                      padding: "8px 0",
                    }}
                  >
                    {fill(t("us.sf.budget.s02.show_all"), { n: deptRest.length })}
                  </summary>
                  <BarRow
                    max={Math.max(...deptTop.map((x) => x.total_usd), 1)}
                    items={deptRest.map((dep) => ({
                      label: dep.display_name ?? dep.label,
                      value: Math.max(0, dep.total_usd),
                      display: fmtUsdCompact(dep.total_usd),
                      href: `/us/city/sf/budget/dept/${deptSlug(dep.code)}?year=${fy}`,
                      sub: fill(t("us.sf.budget.s02.dept_sub"), {
                        share: fmtShare(dep.share_of_side),
                        group: orgGroupLabel.get(dep.org_group_code) ?? dep.org_group_code,
                      }),
                    }))}
                  />
                </details>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <EmptyState
                label={t("us.sf.budget.s02.no_drill.label")}
                title={fill(t("us.sf.budget.s02.no_drill.title"), { fy })}
                body={bd.drill.reason ?? ""}
                actions={
                  <Button href="#fy2018-note">{t("us.sf.budget.s02.no_drill.cta")}</Button>
                }
              />
            </div>
          )}

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
          ) : bd.drill.available ? (
            <>
              <UsTreemap
                data={spBars.map((c) => ({
                  id: c.code,
                  shortLabel: c.label,
                  fullLabel: c.label,
                  value: c.total_usd,
                  shareOfTotal: c.share_of_side,
                  subLabel: fill(t("us.sf.budget.s03.tile_sub"), { n: c.n_departments }),
                }))}
                height={420}
                totalLabel={t("us.sf.budget.s02.of_spending")}
                ariaLabel={fill(t("us.sf.budget.s03.treemap_aria"), { fy })}
              />

              <div style={{ marginTop: 34 }}>
              <BarRow
                reveal
                header={{
                  left: t("us.sf.budget.s03.header.left"),
                  right: t("us.sf.budget.s03.header.right"),
                }}
                items={spBars.map((c) => ({
                  label: c.gloss ? (
                    <Tip label={c.gloss}>{c.label}</Tip>
                  ) : (
                    c.label
                  ),
                  value: c.total_usd,
                  display: fmtUsdCompact(c.total_usd),
                  href: `/us/city/sf/budget/character/${characterSlug(c.code)}?year=${fy}`,
                  sub: fill(t("us.sf.budget.s03.char_sub"), {
                    share: fmtShare(c.share_of_side),
                    n: c.n_departments,
                  }),
                }))}
              />
              </div>

              {spOffsets.length > 0 && (
                <div className="fx-callout" style={{ marginTop: 28 }}>
                  <b>{t("us.sf.budget.s03.offsets.title")}</b>{" "}
                  {t("us.sf.budget.s03.offsets.expl")}
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    {spOffsets.map((c) => (
                      <div
                        key={c.code}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          flexWrap: "wrap",
                          borderTop: "1px solid var(--rule)",
                          paddingTop: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {c.gloss ? <Tip label={c.gloss}>{c.label}</Tip> : c.label}
                        </span>
                        <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                          {fmtUsdCompact(c.total_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="fx-note">{fill(t("us.sf.budget.s03.no_drill"), { fy })}</p>
          )}
          <SourceLine label={srcLabel} links={budgetLinks} dataWord={dataWord} />
        </div>
      </section>

      {/* ── 04 · Where the money comes from ── */}
      <section className="fx-section" id="sec-revenue">
        <div className="fx-wrap">
          <SectionHead
            kind={t("us.sf.budget.s04.kind")}
            title={
              <>
                {t("us.sf.budget.s04.title.before")}
                <em>{t("us.sf.budget.s04.title.em")}</em>
              </>
            }
            subtitle={fill(t("us.sf.budget.s04.sub"), {
              n: revBars.length,
              total: fmtUsdCompact(bd.totals.revenue.total_usd),
              fy,
            })}
          />
          {bd.drill.available ? (
            <>
              <BarRow
                reveal
                header={{
                  left: t("us.sf.budget.s04.header.left"),
                  right: t("us.sf.budget.s04.header.right"),
                }}
                items={revBars.map((c) => ({
                  label:
                    c.code === "CHGS_FOR_SERVICES" ? (
                      <Tip
                        label={fill(t("us.sf.budget.s04.charges.body"), {
                          amount: fmtUsdCompact(c.total_usd),
                          fy,
                        })}
                      >
                        {c.label}
                      </Tip>
                    ) : c.gloss ? (
                      <Tip label={c.gloss}>{c.label}</Tip>
                    ) : (
                      c.label
                    ),
                  value: c.total_usd,
                  display: fmtUsdCompact(c.total_usd),
                  href: `/us/city/sf/budget/character/${characterSlug(c.code)}?year=${fy}&side=revenue`,
                  sub: fill(t("us.sf.budget.s04.char_sub"), {
                    share: fmtShare(c.share_of_side),
                  }),
                }))}
              />
              {revInternal.length > 0 && (
                <div className="fx-callout" style={{ marginTop: 28 }}>
                  <b>{t("us.sf.budget.s04.internal.title")}</b>{" "}
                  {t("us.sf.budget.s04.internal.expl")}
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    {revInternal.map((c) => (
                      <div
                        key={c.code}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          flexWrap: "wrap",
                          borderTop: "1px solid var(--rule)",
                          paddingTop: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {c.gloss ? <Tip label={c.gloss}>{c.label}</Tip> : c.label}
                        </span>
                        <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                          {fmtUsdCompact(c.total_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="fx-note">{fill(t("us.sf.budget.s03.no_drill"), { fy })}</p>
          )}
          <SourceLine label={srcLabel} links={budgetLinks} dataWord={dataWord} />
        </div>
      </section>

      {/* ── 05 · Adopted vs executed ── */}
      <section className="fx-section" id="sec-execution">
        <div className="fx-wrap">
          <SectionHead
            kind={t("us.sf.budget.s05.kind")}
            title={
              <>
                {t("us.sf.budget.s05.title.before")}
                <em>{t("us.sf.budget.s05.title.em")}</em>
                {t("us.sf.budget.s05.title.after")}
              </>
            }
            subtitle={(() => {
              const sub = t("us.sf.budget.s05.sub");
              const term = "Operating funds";
              const i = sub.indexOf(term);
              if (i < 0) return sub;
              return (
                <>
                  {sub.slice(0, i)}
                  <Tip label="Operating funds only: capital and multi-year project funds legitimately spend across years and can't be compared to a single year's budget.">
                    {term}
                  </Tip>
                  {sub.slice(i + term.length)}
                </>
              );
            })()}
          />

          {!showComparison ? (
            <EmptyState
              label={t("us.sf.budget.s05.empty.label")}
              title={fill(t("us.sf.budget.s05.empty.title"), { fy })}
              body={t("us.sf.budget.s05.empty.body")}
              actions={
                <>
                  {spineClosed
                    .slice(-3)
                    .reverse()
                    .map((p) => (
                      <Button
                        key={p.fiscal_year}
                        href={`/us/city/sf/budget?year=${p.fiscal_year}#sec-execution`}
                      >
                        {fill(t("us.sf.budget.s05.empty.cta"), { fy: p.fiscal_year })}
                      </Button>
                    ))}
                </>
              }
            />
          ) : (
            <>
              {status === "recently_closed_preliminary" && (
                <div className="fx-callout" style={{ marginBottom: 22 }}>
                  <b>{t("us.sf.budget.s05.prelim.title")}</b>{" "}
                  {fill(t("us.sf.budget.s05.prelim.body"), { fy })}
                </div>
              )}
              <div className="fx-overview">
                <HeroNumber
                  label={fill(t("us.sf.budget.s05.hero_label"), { fy })}
                  value={
                    <AnimatedNumber
                      value={execRate ?? 0}
                      format={(n) => n.toFixed(1)}
                    />
                  }
                  unit="%"
                  caption={
                    <>
                      {t("us.sf.budget.s05.hero_cap.a")}
                      <b>{fmtUsdCompact(spinePoint?.budget_usd ?? 0)}</b>
                      {t("us.sf.budget.s05.hero_cap.b")}
                      <b>{fmtUsdCompact(spinePoint?.actual_usd ?? 0)}</b>
                      {t("us.sf.budget.s05.hero_cap.c")}
                    </>
                  }
                />
                <KPIGrid
                  cols={2}
                  items={[
                    {
                      label: (
                        <Tip label={t("us.sf.budget.s05.kpi.budget_tip")}>
                          {t("us.sf.budget.s05.kpi.budget")}
                        </Tip>
                      ),
                      value: fmtUsdCompact(spinePoint?.budget_usd ?? 0),
                    },
                    {
                      label: (
                        <Tip label={t("us.sf.budget.s05.kpi.actual_tip")}>
                          {t("us.sf.budget.s05.kpi.actual")}
                        </Tip>
                      ),
                      value: fmtUsdCompact(spinePoint?.actual_usd ?? 0),
                    },
                    {
                      label: t("us.sf.budget.s05.kpi.gap"),
                      value: fmtUsdCompact(
                        (spinePoint?.actual_usd ?? 0) - (spinePoint?.budget_usd ?? 0),
                      ),
                    },
                    {
                      label: t("us.sf.budget.s05.kpi.residual"),
                      value: fmtYoy(spinePoint?.residual_pct ?? 0),
                      delta: t("us.sf.budget.s05.kpi.residual_note"),
                    },
                  ]}
                />
              </div>
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                  {t("us.sf.budget.s05.compare_kicker")}
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                  <CompareBar
                    label={t("us.sf.budget.s05.kpi.budget")}
                    value={fmtUsdCompact(spinePoint?.budget_usd ?? 0)}
                    widthPct={100}
                    muted={false}
                  />
                  <CompareBar
                    label={t("us.sf.budget.s05.kpi.actual")}
                    value={fmtUsdCompact(spinePoint?.actual_usd ?? 0)}
                    widthPct={execRate ?? 0}
                    muted
                  />
                </div>
              </div>
            </>
          )}

          <SourceLine
            label={srcLabel}
            links={
              d.bvaTable
                ? [
                    { name: t("us.sf.budget.s05.src_budget"), href: d.bvaTable.sources.budget_url },
                    { name: t("us.sf.budget.s05.src_actuals"), href: d.bvaTable.sources.actuals_url },
                  ]
                : budgetLinks
            }
            dataWord={dataWord}
          />
        </div>
      </section>

      {/* ── The long view (closing context) ── */}
      {trendSection}

    </main>
  );
}
