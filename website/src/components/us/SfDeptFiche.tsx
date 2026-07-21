"use client";

import type { SfDeptFicheData, SfDeptSideBlock } from "@/lib/us/sf-budget-data";
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

      {/* Revenue side */}
      {d.revenue && d.revenue.characters.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.dept.revenue_h"), { fy: d.fiscal_year })}
          </div>
          <CharacterBars
            block={d.revenue}
            glossFallback={t("us.sf.fiche.dept.no_gloss")}
          />
        </section>
      )}

      {/* Adopted vs executed (latest closed year, Operating perimeter) */}
      {d.bva && d.bva.is_comparable && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.dept.bva_h"), { fy: d.bva.fiscal_year })}
          </div>
          <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
            <Row label={t("us.sf.fiche.dept.bva_budget")} value={fmtUsd(d.bva.budget_usd ?? 0)} />
            <Row label={t("us.sf.fiche.dept.bva_actual")} value={fmtUsd(d.bva.actual_usd ?? 0)} />
            <Row
              label={t("us.sf.fiche.dept.bva_residual")}
              value={`${fmtUsdCompact(d.bva.residual_usd ?? 0)} (${fmtYoy(d.bva.residual_pct ?? 0)})`}
            />
          </div>
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

function Row({ label, value }: { label: string; value: string }) {
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
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CharacterBars({
  block,
  glossFallback,
}: {
  block: SfDeptSideBlock;
  glossFallback: string;
}) {
  const max = Math.max(...block.characters.map((c) => c.amount_usd), 1);
  // Plain bars, not links. The character breakdown is the readable leaf of a
  // department's view — "Public Health spends X on salaries, Y on materials".
  // It used to link to the citywide character fiche, which read as a drill-down
  // but teleported to a different axis (all departments' salaries) — confusing.
  // The citywide by-type view still lives on the budget page's own section.
  return (
    <div>
      {block.characters.map((c) => (
        <div
          key={c.code}
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
        </div>
      ))}
    </div>
  );
}
