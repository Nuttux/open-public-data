"use client";

import Link from "next/link";
import type { SfCharacterFicheData } from "@/lib/us/sf-budget-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { useT } from "@/lib/localeContext";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/**
 * Character fiche — the SF equivalent of the Paris PosteFiche: one spending
 * or revenue character's citywide total, its plain-English gloss (in-session
 * enrichment seed) and its department breakdown. Negative cells (Overhead
 * recoveries, transfer adjustments) render in a separate block, never in
 * the bars.
 */
export default function SfCharacterFiche({ c }: { c: SfCharacterFicheData }) {
  const t = useT();
  const max = Math.max(...c.departments.map((d) => d.amount_usd), 1);
  const sideLabel = c.side === "spending" ? t("us.sf.side.spending") : t("us.sf.side.revenue");

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {fill(t("us.sf.fiche.char.kpi.total"), { fy: c.fiscal_year })}
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(c.total_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {c.side === "spending"
              ? t("us.sf.fiche.char.kpi.share_sp")
              : t("us.sf.fiche.char.kpi.share_rev")}
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtShare(c.share_of_side)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.char.kpi.depts")}</div>
          <div className="fx-fiche-kpi-value tnum">{c.n_departments}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.char.kpi.side")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15, lineHeight: 1.35 }}>
            {sideLabel}
          </div>
        </div>
      </div>

      {c.gloss && (
        <div className="fx-callout" style={{ marginTop: 8, marginBottom: 6 }}>
          <b>{t("us.sf.fiche.char.gloss_label")}</b> {c.gloss}
          <span
            style={{
              display: "block",
              marginTop: 6,
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              color: "var(--muted)",
            }}
          >
            {t("us.sf.fiche.char.gloss_provenance")}
          </span>
        </div>
      )}

      {c.departments.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.char.depts_h"), { fy: c.fiscal_year })}
          </div>
          <div>
            {c.departments.map((d) => (
              <Link
                key={d.code}
                href={`/us/city/sf/budget/dept/${deptSlug(d.code)}?year=${c.fiscal_year}`}
                scroll={false}
                className="fx-row-link"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1fr) minmax(80px, 2fr) auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 4px",
                  borderBottom: "1px solid var(--rule)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 13,
                }}
              >
                <span>{d.display_name ?? d.label}</span>
                <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
                  <span
                    style={{
                      position: "absolute",
                      inset: "0 auto 0 0",
                      width: `${Math.max(0, Math.min(100, (d.amount_usd / max) * 100))}%`,
                      background: "var(--ink)",
                    }}
                  />
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
                  {fmtUsdCompact(d.amount_usd)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {c.negatives.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("us.sf.fiche.char.negatives_h")}</div>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, margin: "0 0 10px" }}>
            {t("us.sf.fiche.char.negatives_expl")}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {c.negatives.map((d) => (
              <div
                key={d.code}
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
                <span style={{ fontWeight: 600 }}>{d.display_name ?? d.label}</span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                  {fmtUsdCompact(d.amount_usd)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.fiche.source_h")}</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          {fill(t("us.sf.fiche.char.source_note"), { fy: c.fiscal_year, label: c.label })}{" "}
          <a
            href={c.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {c.source.name} ({c.source.dataset_id}) ↗
          </a>
        </p>
      </section>
    </div>
  );
}
