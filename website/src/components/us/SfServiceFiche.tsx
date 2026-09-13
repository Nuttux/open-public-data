"use client";

import Link from "@/components/LocalizedLink";
import type { SfServiceFicheData } from "@/lib/us/sf-budget-data";
import { deptSlug, characterSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { useT } from "@/lib/localeContext";
import Tip from "@/components/fusion/Tip";
import { FicheMore } from "@/components/fiche";

/** Rows visible before the fold — same rule as every other SF fiche. */
const DEPT_FOLD = 8;
const CHAR_FOLD = 8;

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

function Row({
  href,
  name,
  amount,
  max,
  sub,
}: {
  href: string;
  name: React.ReactNode;
  amount: number;
  max: number;
  sub?: string;
}) {
  return (
    <Link
      href={href}
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
      <span>
        {name}
        {sub && (
          <span
            style={{
              display: "block",
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              color: "var(--muted)",
              marginTop: 2,
            }}
          >
            {sub}
          </span>
        )}
      </span>
      <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
        <span
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${Math.max(0, Math.min(100, (amount / max) * 100))}%`,
            background: "var(--ink)",
          }}
        />
      </span>
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
        {fmtUsdCompact(amount)}
      </span>
    </Link>
  );
}

/**
 * Service-area fiche — the top of the organization dimension (7 areas over 56
 * departments). It is what a "by service" bar on /budget now opens: the
 * departments inside the area, and what kinds of money the area spends.
 * Negative cells (overhead recoveries, transfer adjustments) stay out of the
 * bars, same rule as SfCharacterFiche.
 */
export default function SfServiceFiche({ s }: { s: SfServiceFicheData }) {
  const t = useT();
  const deptMax = Math.max(...s.departments.map((d) => d.amount_usd), 1);
  const charMax = Math.max(...s.characters.map((c) => c.amount_usd), 1);
  const sideLabel = s.side === "spending" ? t("us.sf.side.spending") : t("us.sf.side.revenue");

  const deptHead = s.departments.slice(0, DEPT_FOLD);
  const deptTail = s.departments.slice(DEPT_FOLD);
  const charHead = s.characters.slice(0, CHAR_FOLD);
  const charTail = s.characters.slice(CHAR_FOLD);

  const deptRow = (d: SfServiceFicheData["departments"][number]) => (
    <Row
      key={d.code}
      href={`/usa/san-francisco/budget/dept/${deptSlug(d.code)}?year=${s.fiscal_year}`}
      name={d.display_name ?? d.label}
      amount={d.amount_usd}
      max={deptMax}
      sub={fill(t("us.sf.fiche.service.dept_sub"), { share: fmtShare(d.share_of_group) })}
    />
  );
  const charRow = (c: SfServiceFicheData["characters"][number]) => (
    <Row
      key={c.code}
      href={`/usa/san-francisco/budget/character/${characterSlug(c.code)}?year=${s.fiscal_year}&side=${s.side}`}
      name={c.gloss ? <Tip label={c.gloss}>{c.label}</Tip> : c.label}
      amount={c.amount_usd}
      max={charMax}
    />
  );

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {fill(t("us.sf.fiche.char.kpi.total"), { fy: s.fiscal_year })}
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(s.total_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {s.side === "spending"
              ? t("us.sf.fiche.char.kpi.share_sp")
              : t("us.sf.fiche.char.kpi.share_rev")}
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtShare(s.share_of_side)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.char.kpi.depts")}</div>
          <div className="fx-fiche-kpi-value tnum">{s.n_departments}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.char.kpi.side")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15, lineHeight: 1.35 }}>
            {sideLabel}
          </div>
        </div>
      </div>

      {s.departments.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {fill(t("us.sf.fiche.service.depts_h"), { fy: s.fiscal_year })}
          </div>
          <div>{deptHead.map(deptRow)}</div>
          <FicheMore count={deptTail.length} noun="smaller departments">
            {deptTail.map(deptRow)}
          </FicheMore>
        </section>
      )}

      {s.characters.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            <Tip label={t("us.sf.fiche.service.chars_expl")}>
              {fill(t("us.sf.fiche.service.chars_h"), { fy: s.fiscal_year })}
            </Tip>
          </div>
          <div>{charHead.map(charRow)}</div>
          <FicheMore count={charTail.length} noun="smaller categories">
            {charTail.map(charRow)}
          </FicheMore>
        </section>
      )}

      {s.offsets.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            <Tip label={t("us.sf.fiche.char.negatives_expl")}>
              {t("us.sf.fiche.char.negatives_h")}
            </Tip>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {s.offsets.map((c) => (
              <div
                key={c.code}
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
                  {c.gloss ? <Tip label={c.gloss}>{c.label}</Tip> : c.label}
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                  {fmtUsdCompact(c.amount_usd)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.fiche.source_h")}</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          {fill(t("us.sf.fiche.service.source_note"), { fy: s.fiscal_year, label: s.label })}{" "}
          <a
            href={s.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {s.source.name} ({s.source.dataset_id}) ↗
          </a>
        </p>
      </section>
    </div>
  );
}
