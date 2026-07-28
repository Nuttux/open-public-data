"use client";

import Link from "next/link";
import type { SfDeptFicheData, SfDeptSideBlock, SfSide } from "@/lib/us/sf-budget-data";
import { deptSlug, characterSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsd, fmtUsdCompact, fmtShare, fmtYoy } from "@/lib/us/format";
import { useT } from "@/lib/localeContext";
import Tip from "@/components/fusion/Tip";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/**
 * Department fiche — the SF equivalent of the Paris ChapitreFiche
 * (character breakdown + offsets line + two-sided context + the measured
 * execution row). Rendered inside the root-level drawer and on the
 * full-page fallback route.
 */
export default function SfDeptFiche({ d }: { d: SfDeptFicheData }) {
  const t = useT();
  const sp = d.spending;
  const hasOffsets =
    (sp?.offsets.length ?? 0) > 0 || (d.revenue?.offsets.length ?? 0) > 0;

  return (
    <div>
      {/* KPI header */}
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {fill(t("us.sf.fiche.dept.kpi.budget"), { fy: d.fiscal_year })}
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {sp ? fmtUsdCompact(sp.total_usd) : "—"}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.dept.kpi.share")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {sp ? fmtShare(sp.share_of_side) : "—"}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.dept.kpi.revenue")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {d.revenue ? fmtUsdCompact(d.revenue.total_usd) : "—"}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.dept.kpi.group")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15, lineHeight: 1.35 }}>
            {d.org_group_label ?? d.org_group_code}
          </div>
        </div>
      </div>

      {/* Spending by character */}
      {sp && sp.characters.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.dept.spending_h"), { fy: d.fiscal_year })}
          </div>
          <CharacterBars
            block={sp}
            side="spending"
            deptCode={d.code}
            fiscalYear={d.fiscal_year}
            glossFallback={t("us.sf.fiche.dept.no_gloss")}
          />
        </section>
      )}

      {/* Offsets — transfer adjustments + negative cells, never in the bars */}
      {hasOffsets && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            <Tip label={t("us.sf.fiche.dept.offsets_expl")}>{t("us.sf.fiche.dept.offsets_h")}</Tip>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              ...(sp?.offsets.map((o) => ({ ...o, side: t("us.sf.side.spending") })) ?? []),
              ...(d.revenue?.offsets.map((o) => ({ ...o, side: t("us.sf.side.revenue") })) ?? []),
            ].map((o, i) => (
              <div
                key={`${o.code}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  borderTop: "1px solid var(--rule)",
                  paddingTop: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {o.label}{" "}
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {o.side}</span>
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                  {fmtUsdCompact(o.amount_usd)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Revenue side — collapsed by default: spending is what users come
          for, funding is context (closed <details>, opens on click). */}
      {d.revenue && d.revenue.characters.length > 0 && (
        <section className="fx-fiche-section">
          <details>
            <summary className="fx-fiche-h" style={{ cursor: "pointer" }}>
              {fill(t("us.sf.fiche.dept.revenue_h"), { fy: d.fiscal_year })}
            </summary>
            <CharacterBars
              block={d.revenue}
              side="revenue"
              deptCode={d.code}
              fiscalYear={d.fiscal_year}
              glossFallback={t("us.sf.fiche.dept.no_gloss")}
            />
          </details>
        </section>
      )}

      {/* Adopted vs executed (latest closed year, Operating perimeter) */}
      {d.bva && d.bva.is_comparable && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.dept.bva_h"), { fy: d.bva.fiscal_year })}
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <Row label={t("us.sf.fiche.dept.bva_budget")} value={fmtUsdCompact(d.bva.budget_usd ?? 0)} exact={fmtUsd(d.bva.budget_usd ?? 0)} />
            <Row label={t("us.sf.fiche.dept.bva_actual")} value={fmtUsdCompact(d.bva.actual_usd ?? 0)} exact={fmtUsd(d.bva.actual_usd ?? 0)} />
            <Row
              label={t("us.sf.fiche.dept.bva_residual")}
              value={`${fmtUsdCompact(d.bva.residual_usd ?? 0)} (${fmtYoy(d.bva.residual_pct ?? 0)})`}
            />
          </div>
          {/* Execution history — the export carries every covered year; the
           *  fiche used to show only the latest. One row per year: adopted
           *  bar (rule) with the executed bar drawn over it, so over- and
           *  under-execution read at a glance. */}
          {d.bvaSeries.length > 1 && (
            <div style={{ marginTop: 16, display: "grid", gap: 7 }}>
              <div
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                {t("us.sf.fiche.dept.bva_series_h")}
              </div>
              {(() => {
                const refMax = Math.max(
                  ...d.bvaSeries.flatMap((r) => [r.budget_usd ?? 0, r.actual_usd ?? 0]),
                  1,
                );
                return d.bvaSeries.map((r) => {
                  const over = (r.residual_pct ?? 0) > 0;
                  return (
                    <div
                      key={r.fiscal_year}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "42px 1fr 62px",
                        gap: 10,
                        alignItems: "center",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
                        {r.fiscal_year}
                      </span>
                      <span style={{ position: "relative", height: 12, display: "block" }}>
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${((r.budget_usd ?? 0) / refMax) * 100}%`,
                            border: "1px solid var(--ink)",
                            // Above the fill: when actual overruns adopted the
                            // ochre bar covers this edge, and the adopted mark
                            // is the whole point of the row.
                            zIndex: 1,
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            top: 3,
                            left: 0,
                            height: 6,
                            width: `${((r.actual_usd ?? 0) / refMax) * 100}%`,
                            background: over ? "var(--ocre)" : "var(--ink)",
                          }}
                        />
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--f-mono)",
                          textAlign: "right",
                          color: over ? "var(--ocre)" : "var(--ink-2)",
                        }}
                      >
                        {fmtYoy(r.residual_pct ?? 0)}
                      </span>
                    </div>
                  );
                });
              })()}
              <div
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 10.5,
                  color: "var(--muted)",
                  marginTop: 2,
                }}
              >
                {t("us.sf.fiche.dept.bva_series_legend")}
              </div>
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "10px 0 0" }}>
            {t("us.sf.fiche.dept.bva_perimeter")}
          </p>
          {d.bva.is_structural_outlier && d.bva.outlier_note && (
            <div className="fx-callout" style={{ marginTop: 10 }}>
              <b>{t("us.sf.fiche.dept.outlier_title")}</b> {d.bva.outlier_note}
            </div>
          )}
        </section>
      )}

      {/* Source */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.fiche.source_h")}</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          {fill(t("us.sf.fiche.dept.source_note"), { fy: d.fiscal_year, code: d.code })}{" "}
          <a
            href={d.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.source.name} ({d.source.dataset_id}) ↗
          </a>
        </p>
      </section>
    </div>
  );
}

/** `exact` keeps the full figure one hover away when `value` is abbreviated. */
function Row({ label, value, exact }: { label: string; value: string; exact?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 6,
      }}
    >
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontWeight: 600 }} title={exact}>
        {value}
      </span>
    </div>
  );
}

function CharacterBars({
  block,
  side,
  deptCode,
  fiscalYear,
  glossFallback,
}: {
  block: SfDeptSideBlock;
  side: SfSide;
  deptCode: string;
  fiscalYear: number;
  glossFallback: string;
}) {
  const max = Math.max(...block.characters.map((c) => c.amount_usd), 1);
  // 13 categories unfolded pushed the execution history below the fold on
  // every big department. Show the ones that carry the money, fold the tail.
  const CHAR_FOLD = 8;
  const head = block.characters.slice(0, CHAR_FOLD);
  const tail = block.characters.slice(CHAR_FOLD);
  // Links one level deeper (dept × THIS character → line items + vendor
  // payments), same axis as this fiche — not the citywide character fiche
  // (that used to be the link target and read as a confusing axis
  // teleport, see git history). Side is threaded through so the drawer
  // resolves the right dept×character cell without a second lookup.
  const row = (c: SfDeptSideBlock["characters"][number]) => (
        <Link
          key={c.code}
          href={`/us/city/sf/budget/dept/${deptSlug(deptCode)}/character/${characterSlug(c.code)}?year=${fiscalYear}&side=${side}`}
          scroll={false}
          className="fx-row-link"
          title={c.gloss ?? glossFallback}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 1fr) minmax(80px, 2fr) auto",
            alignItems: "center",
            gap: 12,
            padding: "8px 4px",
            borderBottom: "1px solid var(--rule)",
            fontFamily: "var(--f-ui)",
            fontSize: 13,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span>{c.label}</span>
          <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
            <span
              style={{
                position: "absolute",
                inset: "0 auto 0 0",
                width: `${Math.max(0, Math.min(100, (c.amount_usd / max) * 100))}%`,
                background: "var(--ink)",
              }}
            />
          </span>
          <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
            {fmtUsdCompact(c.amount_usd)}
          </span>
        </Link>
  );

  return (
    <div>
      {head.map(row)}
      {tail.length > 0 && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontFamily: "var(--f-mono)",
              fontSize: 12,
              color: "var(--ink-2)",
              padding: "10px 4px",
            }}
          >
            {`+ ${tail.length} smaller categories`}
          </summary>
          {tail.map(row)}
        </details>
      )}
    </div>
  );
}
