"use client";

import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtDateLong } from "@/lib/us/format";
import Tip from "@/components/fusion/Tip";
import Fy2018Note from "@/components/us/Fy2018Note";
import { FAMILY_LABELS, typeLabel } from "@/app/us/city/sf/contracts/us-sf-contracts-types";
import type { SfContractFiche as SfContractFicheType } from "@/app/us/city/sf/contracts/us-sf-contracts-types";

/**
 * SF contract fiche — used by both the root-level drawer and the full-page
 * fallback (Paris ContratFiche pattern, us-municipal family). All money is
 * agreed/paid/remaining_calc from the fiche export; the spend curve is the
 * FY2018+ voucher join. The project team is context, never summed into the
 * contract's own amounts.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

function SpendCurve({ fiche }: { fiche: SfContractFicheType }) {
  const t = useT();
  const points = fiche.spend_by_fy.points;
  const positive = points.filter((p) => p.vouchers_paid_usd > 0);
  const negatives = points.filter((p) => p.vouchers_paid_usd < 0);
  if (positive.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
        {t("us.sf.contracts.fiche.curve.empty")}
      </p>
    );
  }

  const years = positive.map((p) => p.fiscal_year);
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const allYears: number[] = [];
  for (let y = y0; y <= y1; y++) allYears.push(y);
  const byYear = new Map(positive.map((p) => [p.fiscal_year, p]));
  const max = Math.max(...positive.map((p) => p.vouchers_paid_usd));

  return (
    <div>
      <div
        role="img"
        aria-label={fill(t("us.sf.contracts.fiche.curve.aria"), { y0, y1 })}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${allYears.length}, minmax(0, 1fr))`,
          gap: 6,
          alignItems: "end",
          height: 130,
          borderBottom: "1px solid var(--ink)",
          paddingBottom: 0,
        }}
      >
        {allYears.map((y) => {
          const p = byYear.get(y);
          const h = p ? Math.max((p.vouchers_paid_usd / max) * 110, 3) : 0;
          const partial = p && p.execution_status !== "closed";
          return (
            <div
              key={y}
              title={
                p
                  ? `FY${y}: ${fmtUsdCompact(p.vouchers_paid_usd)}${
                      partial ? ` — ${t(`us.sf.contracts.fiche.curve.status.${p.execution_status}`)}` : ""
                    }`
                  : `FY${y}: ${t("us.sf.contracts.fiche.curve.none")}`
              }
              style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
            >
              {p && (
                <div
                  style={{
                    height: h,
                    background: partial ? "transparent" : "var(--bleu)",
                    border: partial ? "1.5px dashed var(--bleu)" : "none",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${allYears.length}, minmax(0, 1fr))`,
          gap: 6,
          fontFamily: "var(--f-mono)",
          fontSize: 9.5,
          color: "var(--muted)",
          marginTop: 5,
        }}
      >
        {allYears.map((y) => (
          <span key={y} style={{ textAlign: "center", overflow: "hidden" }}>
            {String(y).slice(2)}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)" }}>
          {fill(t("us.sf.contracts.fiche.curve.peak"), {
            v: fmtUsdCompact(max),
          })}
          {positive.some((p) => p.execution_status !== "closed") && (
            <> · {t("us.sf.contracts.fiche.curve.partial_note")}</>
          )}
        </span>
      </div>
      {negatives.length > 0 && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
          {t("us.sf.contracts.fiche.curve.negatives")}{" "}
          {negatives
            .map((p) => `FY${p.fiscal_year}: ${fmtUsdCompact(p.vouchers_paid_usd)}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

export default function SfContractFiche({ fiche }: { fiche: SfContractFicheType }) {
  const t = useT();
  const c = fiche.contract;

  const paidRatio = c.agreed_usd > 0 ? c.paid_usd / c.agreed_usd : null;

  // Contract-life timeline (Paris ContratFiche pattern, day-level UTC to
  // avoid hydration drift).
  const timeline = (() => {
    if (!c.term_start || !c.term_end) return null;
    const startMs = Date.parse(c.term_start);
    const endMs = Date.parse(c.term_end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
    const DAY = 86400000;
    const nowMs = Math.floor(Date.now() / DAY) * DAY;
    const pct = Math.round(Math.min(Math.max(((nowMs - startMs) / (endMs - startMs)) * 100, 0), 100) * 100) / 100;
    return { pct, running: nowMs < endMs };
  })();

  const badges: Array<{ key: string; label: string; tip?: string; tone: string }> = [];
  if (c.sole_source) {
    badges.push({
      key: "sole",
      label: t("us.sf.contracts.fiche.badge.sole"),
      tip: t("us.sf.contracts.fiche.badge.sole_tip"),
      tone: "var(--ocre)",
    });
  }
  if (c.lbe_prime) {
    badges.push({ key: "lbe", label: "LBE", tip: t("us.sf.contracts.fiche.badge.lbe_tip"), tone: "var(--bleu)" });
  }
  if (c.non_profit) {
    badges.push({ key: "np", label: t("us.sf.contracts.fiche.badge.np"), tone: "var(--ink-2)" });
  }

  const teamMembers = fiche.team.filter((m) => m.supplier);
  const showTeam = teamMembers.length > 1;

  return (
    <div>
      <div className="fx-fiche-lead">
        <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 17, lineHeight: 1.45 }}>
          {c.title_plain || c.title}
        </p>
        {c.title_plain && c.title_plain !== c.title && (
          <p
            style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".05em", color: "var(--muted)", cursor: "help" }}
            title={t("us.sf.contracts.fiche.raw_title_tip")}
          >
            {t("us.sf.contracts.fiche.raw_title_label")} “{c.title}”
          </p>
        )}
        {badges.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
            {badges.map((b) => (
              <span
                key={b.key}
                title={b.tip}
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 10.5,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: b.tone,
                  border: `1px solid ${b.tone}`,
                  padding: "3px 8px",
                  cursor: b.tip ? "help" : "default",
                }}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label={t("us.sf.contracts.fiche.kpi.agreed_tip")}>
              {t("us.sf.contracts.fiche.kpi.agreed")}
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(c.agreed_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label={fiche.spend_by_fy.note}>{t("us.sf.contracts.fiche.kpi.paid")}</Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum" style={c.paid_exceeds_agreed ? { color: "var(--ocre)" } : undefined}>
            {fmtUsdCompact(c.paid_usd)}
          </div>
          {paidRatio != null && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: c.paid_exceeds_agreed ? "var(--ocre)" : "var(--muted)", marginTop: 3 }}>
              {c.paid_exceeds_agreed ? (
                <Tip label="Payments accumulate across contract modifications while the agreed amount reflects the base document, so paid can exceed agreed.">
                  {t("us.sf.contracts.fiche.kpi.exceeds")}
                </Tip>
              ) : (
                `${Math.round(paidRatio * 100)}% ${t("us.sf.contracts.fiche.kpi.of_agreed")}`
              )}
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label={t("us.sf.contracts.fiche.kpi.remaining_tip")}>
              {t("us.sf.contracts.fiche.kpi.remaining")}
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(c.remaining_calc_usd)}</div>
          {!c.src_arithmetic_consistent && (
            <div
              style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3, cursor: "help" }}
              title={t("us.sf.contracts.fiche.kpi.noreconcile_tip")}
            >
              {t("us.sf.contracts.fiche.kpi.noreconcile")} ⓘ
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.contracts.fiche.kpi.type")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }} title={c.contract_type ?? undefined}>
            {typeLabel(c.contract_type)}
          </div>
        </div>
      </div>

      {/* Term timeline */}
      {timeline && c.term_start && c.term_end ? (
        <div style={{ margin: "16px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>
            <span>{fmtDateLong(c.term_start)}</span>
            <span>{fmtDateLong(c.term_end)}</span>
          </div>
          <div style={{ position: "relative", height: 4, background: "var(--rule)", borderRadius: 2 }} aria-hidden="true">
            <div
              style={{
                position: "absolute", top: 0, bottom: 0, left: 0,
                width: `${timeline.pct}%`,
                background: timeline.running ? "var(--bleu)" : "var(--ink-2)",
                borderRadius: 2,
              }}
            />
            {timeline.running && (
              <span
                style={{
                  position: "absolute", left: `${timeline.pct}%`, top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 9, height: 9, borderRadius: "50%",
                  background: "var(--bleu)", boxShadow: "0 0 0 2px var(--bg)",
                }}
              />
            )}
          </div>
          <div style={{ marginTop: 7, fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase" }}>
            <span style={{ color: timeline.running ? "var(--bleu)" : "var(--muted)", fontWeight: 600 }}>
              {timeline.running
                ? t("us.sf.contracts.fiche.tl.running")
                : t("us.sf.contracts.fiche.tl.ended")}
            </span>
          </div>
        </div>
      ) : (
        <p style={{ margin: "14px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
          {c.term_start ? `${t("us.sf.contracts.fiche.tl.started")} ${fmtDateLong(c.term_start)} · ` : ""}
          {t("us.sf.contracts.fiche.tl.no_end")}
          {c.term_end_is_placeholder && <> · {t("us.sf.contracts.fiche.tl.placeholder")}</>}
        </p>
      )}

      {/* Sole-source: the authority string, verbatim */}
      {c.sole_source && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("us.sf.contracts.fiche.sole.h")}</div>
          <div
            style={{
              padding: "12px 16px",
              borderLeft: "3px solid var(--ocre)",
              background: "rgba(166, 118, 56, 0.05)",
            }}
          >
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
              {t("us.sf.contracts.fiche.sole.authority_label")}
            </div>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6 }}>
              {c.purchasing_authority ?? t("us.sf.contracts.fiche.sole.authority_none")}
            </span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
            {t("us.sf.contracts.fiche.sole.neutral")}
          </p>
        </section>
      )}

      {/* Spend curve */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.contracts.fiche.curve.h")}</div>
        <SpendCurve fiche={fiche} />
        <div style={{ marginTop: 10 }}>
          <Fy2018Note variant="inline" />
        </div>
      </section>

      {/* Project team */}
      {showTeam && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("us.sf.contracts.fiche.team.h")}</div>
          <table className="fx-table" style={{ borderTop: 0 }}>
            <thead>
              <tr>
                <th>{t("us.sf.contracts.fiche.team.col.supplier")}</th>
                <th>{t("us.sf.contracts.fiche.team.col.role")}</th>
                <th style={{ textAlign: "right" }}>
                  <span title={fiche.team_note} style={{ cursor: "help" }}>
                    {t("us.sf.contracts.fiche.team.col.attached")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.slice(0, 40).map((m, i) => (
                <tr key={`${m.supplier}-${m.role}-${i}`}>
                  <td style={{ fontWeight: m.role === "Prime Contractor" ? 600 : 400 }}>
                    {m.supplier}
                    {m.lbe && (
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--bleu)", marginLeft: 8 }}>
                        LBE
                      </span>
                    )}
                  </td>
                  <td className="muted">{t(`us.sf.contracts.fiche.team.role.${m.role.replace(/\s/g, "_").toLowerCase()}`)}</td>
                  <td className="num">
                    {m.role === "Prime Contractor" ? "—" : m.attached_usd != null ? fmtUsdCompact(m.attached_usd) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {teamMembers.length > 40 && (
            <p style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
              {fill(t("us.sf.contracts.fiche.team.more"), { n: nfInt.format(teamMembers.length - 40) })}
            </p>
          )}
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
            {fiche.team_note}
          </p>
        </section>
      )}

      {/* Sources */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.contracts.fiche.sources.h")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("us.sf.contracts.fiche.sources.no")}</dt>
            <dd style={{ fontFamily: "var(--f-mono)" }}>{c.contract_no}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("us.sf.contracts.fiche.sources.dept")}</dt>
            <dd>{c.department ?? "—"}</dd>
          </div>
          {!c.sole_source && c.purchasing_authority && (
            <div className="fx-fiche-prop">
              <dt>
                <Tip label={t("us.sf.contracts.fiche.sources.authority_tip")}>
                  {t("us.sf.contracts.fiche.sources.authority")}
                </Tip>
              </dt>
              <dd style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
                {c.purchasing_authority}
                <span style={{ color: "var(--muted)" }}> · {FAMILY_LABELS[c.authority_family] ?? c.authority_family}</span>
              </dd>
            </div>
          )}
          <div className="fx-fiche-prop">
            <dt>{t("us.sf.contracts.fiche.sources.dataset")}</dt>
            <dd>
              <a
                href={fiche.source.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                {fiche.source.name}
              </a>
            </dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("us.sf.contracts.fiche.sources.rows")}</dt>
            <dd>
              <a
                href={fiche.source.raw_rows_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                {t("us.sf.contracts.fiche.sources.rows_link")}
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
