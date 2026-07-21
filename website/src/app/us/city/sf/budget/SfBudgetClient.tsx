"use client";

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
import Fy2018Note from "@/components/us/Fy2018Note";
import { useT } from "@/lib/localeContext";
import { deptSlug, characterSlug } from "@/lib/us/sf-budget-slugs";
import {
  fmtUsd,
  fmtUsdCompact,
  fmtShare,
  fmtYoy,
  fmtDateLong,
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
const BVA_TABLE_FLOOR_USD = 50_000_000;

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

  // s02 — services
  const orgGroups = bd.org_groups.spending;
  const depts = bd.departments.spending;
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
  const spineClosed = d.spine.filter(
    (p) => p.budget_usd != null && p.actual_usd != null && p.residual_pct != null &&
      d.statuses[String(p.fiscal_year)] === "closed",
  );

  const bvaRows = (d.bvaTable?.rows ?? [])
    .filter((r) => r.is_comparable && (r.budget_usd ?? 0) >= BVA_TABLE_FLOOR_USD)
    .sort((a, b) => Math.abs(b.residual_usd ?? 0) - Math.abs(a.residual_usd ?? 0));

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
  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageTOC
        items={[
          { id: "sec-services", label: t("us.sf.budget.toc.services") },
          { id: "sec-types", label: t("us.sf.budget.toc.types") },
          { id: "sec-revenue", label: t("us.sf.budget.toc.revenue") },
          { id: "sec-execution", label: t("us.sf.budget.toc.execution") },
          { id: "sec-sources", label: t("us.sf.budget.toc.sources") },
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
      <section className="fx-section" id="sec-services">
        <div className="fx-wrap">
          <SectionHead
            kind={t("us.sf.budget.s02.kind")}
            title={
              <>
                {t("us.sf.budget.s02.title.before")}
                <em>{t("us.sf.budget.s02.title.em")}</em>
              </>
            }
            subtitle={fill(t("us.sf.budget.s02.sub"), {
              n_groups: orgGroups.length,
              n_depts: depts.length,
              fy,
            })}
          />
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
                    code: dep.code,
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
                        code: dep.code,
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
          <SourceLine label={srcLabel} links={budgetLinks} dataWord={dataWord} />
        </div>
      </section>

      {/* ── By type of spending (characters) ── */}
      <section className="fx-section" id="sec-types">
        <div className="fx-wrap">
          <SectionHead
            kind={t("us.sf.budget.s03.kind")}
            title={
              <>
                {t("us.sf.budget.s03.title.before")}
                <em>{t("us.sf.budget.s03.title.em")}</em>
              </>
            }
            subtitle={fill(t("us.sf.budget.s03.sub"), { n: spBars.length, fy })}
          />
          {bd.drill.available ? (
            <>
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

          {/* The long spine — execution rate per closed year */}
          {spineClosed.length > 0 && (
            <div style={{ marginTop: 34 }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
                {fill(t("us.sf.budget.s05.spine_kicker"), {
                  y0: spineClosed[0].fiscal_year,
                  y1: spineClosed[spineClosed.length - 1].fiscal_year,
                })}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {spineClosed.map((p) => {
                  const rate =
                    p.actual_usd != null && p.budget_usd != null && p.budget_usd > 0
                      ? (p.actual_usd / p.budget_usd) * 100
                      : 0;
                  return (
                    <div
                      key={p.fiscal_year}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "64px 1fr 170px",
                        gap: 12,
                        alignItems: "center",
                        fontSize: 12.5,
                      }}
                    >
                      <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-2)" }}>
                        FY{p.fiscal_year}
                      </span>
                      <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
                        <span
                          style={{
                            position: "absolute",
                            inset: "0 auto 0 0",
                            width: `${Math.max(0, Math.min(100, rate))}%`,
                            background: p.fiscal_year === fy ? "var(--ink)" : "var(--ink-2)",
                          }}
                        />
                      </span>
                      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 11.5 }}>
                        {fmtYoy(p.residual_pct ?? 0)}
                        {p.fiscal_year === 2021 && (
                          <span style={{ color: "var(--ocre)", marginLeft: 6 }}>
                            {t("us.sf.budget.s05.covid_note")}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="fx-note" style={{ marginTop: 14 }}>
                {t("us.sf.budget.s05.spine_note")}
              </p>
            </div>
          )}

          {/* Department table */}
          {d.bvaTable && bvaRows.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
                {fill(t("us.sf.budget.s05.table_kicker"), { fy: d.bvaTable.fiscal_year })}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px 6px 0", borderBottom: "1px solid var(--ink)" }}>{t("us.sf.budget.s05.table.dept")}</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--ink)" }}>{t("us.sf.budget.s05.table.budget")}</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "1px solid var(--ink)" }}>{t("us.sf.budget.s05.table.actual")}</th>
                      <th style={{ textAlign: "right", padding: "6px 0 6px 8px", borderBottom: "1px solid var(--ink)" }}>{t("us.sf.budget.s05.table.deviation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bvaRows.map((r) => (
                      <tr key={r.code}>
                        <td style={{ padding: "8px 8px 8px 0", borderBottom: "1px solid var(--rule)" }}>
                          <Link
                            href={`/us/city/sf/budget/dept/${deptSlug(r.code)}?year=${d.bvaTable!.fiscal_year}`}
                            scroll={false}
                            className="fx-row-link"
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            {r.display_name ?? r.label}
                          </Link>
                          {r.is_structural_outlier && r.outlier_note && (
                            <>
                              {" "}
                              <Tip label={r.outlier_note}>
                                <span
                                  style={{
                                    fontFamily: "var(--f-mono)",
                                    fontSize: 10,
                                    color: "var(--ocre)",
                                    border: "1px solid var(--ocre)",
                                    padding: "1px 5px",
                                    letterSpacing: ".05em",
                                  }}
                                >
                                  {t("us.sf.budget.s05.table.outlier_chip")}
                                </span>
                              </Tip>
                            </>
                          )}
                        </td>
                        <td className="tnum" style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--f-mono)", fontSize: 12 }}>
                          {fmtUsdCompact(r.budget_usd ?? 0)}
                        </td>
                        <td className="tnum" style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--f-mono)", fontSize: 12 }}>
                          {fmtUsdCompact(r.actual_usd ?? 0)}
                        </td>
                        <td className="tnum" style={{ textAlign: "right", padding: "8px 0 8px 8px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--f-mono)", fontSize: 12 }}>
                          {fmtUsdCompact(r.residual_usd ?? 0)}{" "}
                          <span style={{ color: "var(--muted)" }}>({fmtYoy(r.residual_pct ?? 0)})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fx-note" style={{ marginTop: 12 }}>
                {fill(t("us.sf.budget.s05.table_note"), {
                  floor: fmtUsdCompact(BVA_TABLE_FLOOR_USD),
                  fy: d.bvaTable.fiscal_year,
                })}
              </p>
            </div>
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

      {/* ── Sources & method ── */}
      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("us.sf.budget.s06.label")}</span>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.perimeter_label")}</b>: {bd.perimeter}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.status_label")}</b>:{" "}
            {fill(t(`us.sf.budget.s06.status.${status}`), { fy })}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.two_year_label")}</b>: {t("us.sf.budget.s06.two_year")}
          </p>
          <Fy2018Note />
          <p className="fx-footer-sources-meta" style={{ marginTop: 16 }}>
            <b>{t("us.sf.budget.s06.enrichment_label")}</b>: {t("us.sf.budget.s06.enrichment")}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.population_label")}</b>:{" "}
            {fill(t("us.sf.budget.s06.population"), {
              pop: d.population.value.toLocaleString("en-US"),
              year: d.population.year,
            })}{" "}
            <a href={d.population.source_url} target="_blank" rel="noopener noreferrer">
              {d.population.source} ↗
            </a>
          </p>
          <p className="fx-footer-sources-meta">
            <b>{srcLabel}s</b>:{" "}
            <a href={d.source.source_url} target="_blank" rel="noopener noreferrer">
              {d.source.name} ({d.source.dataset_id}) — {d.source.attribution} ↗
            </a>
            {d.bvaTable && (
              <>
                {" "}
                <span className="sep">·</span>{" "}
                <a href={d.bvaTable.sources.actuals_url} target="_blank" rel="noopener noreferrer">
                  {t("us.sf.budget.s05.src_actuals")} ↗
                </a>
              </>
            )}
          </p>
          <p
            className="fx-footer-sources-meta"
            style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}
          >
            {fill(t("us.sf.budget.s06.generated"), {
              ts: fmtDateLong(d.generated_at.slice(0, 10)),
              asof: bd.as_of ? fmtDateLong(bd.as_of.slice(0, 10)) : "—",
            })}{" "}
            <span className="sep">·</span> {d.source_pipeline}
          </p>
        </div>
      </section>
    </main>
  );
}
