"use client";

import Link from "@/components/LocalizedLink";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtDateLong } from "@/lib/us/format";
import Tip from "@/components/fusion/Tip";
import { FicheMore } from "@/components/fiche";
import Fy2018Note from "@/components/us/Fy2018Note";
import { FAMILY_LABELS, typeLabel, typeSlug } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import type { SfContractFiche as SfContractFicheType } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";

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


/** Rows of the project team shown before the tail folds away. */
const TEAM_FOLD = 8;

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
                    // A provisional year still has to show its magnitude. This
                    // used to be a hollow outline, so any contract whose only
                    // payments fall in open fiscal years — 26% of fiches —
                    // rendered a chart that looked empty next to a KPI saying
                    // millions were paid. Tinted fill + dashed edge: the value
                    // reads, and "not final yet" still reads.
                    background: partial ? "rgba(45, 55, 128, 0.28)" : "var(--bleu)",
                    border: partial ? "1.5px dashed var(--bleu)" : "none",
                    boxSizing: "border-box",
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
      {/* These bars are the voucher join by fiscal year; the "paid" KPI is the
        *  register's own lifetime figure. On 44% of contracts they differ —
        *  usually because a still-open fiscal year appears here but not there.
        *  Saying so beats letting the reader find two numbers that disagree. */}
      {(() => {
        const curveTotal = positive.reduce((a, p) => a + p.vouchers_paid_usd, 0);
        const paid = fiche.contract.paid_usd;
        if (paid <= 0 || Math.abs(curveTotal - paid) / paid <= 0.02) return null;
        return (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            {fill(t("us.sf.contracts.fiche.curve.reconcile"), {
              curve: fmtUsdCompact(curveTotal),
              paid: fmtUsdCompact(paid),
            })}
          </p>
        );
      })()}
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

/**
 * Paid measured against the agreed amount. The larger of the two sets the full
 * track, so when payments accumulated past the base document the bar fills and
 * the base is marked, rather than the bar appearing part-full.
 *
 * The excess is drawn in NEUTRAL GREY, never ocre. Ocre is this site's "look
 * here" ink and the excess is not a finding: the register reconciles with
 * itself perfectly (award = outstanding POs + payments + remaining,
 * 31,795/31,795), but its "Payments Made" column does not match the City's
 * voucher ledger on large multi-phase contracts — median 3.1x, verified
 * PO-by-PO, cause unknown. So the bar shows the shape and stays silent about
 * why. Suppressing it entirely was worse: it left a $5.1B-paid contract
 * rendering a 43%-full bar directly under a KPI reading $5.1B.
 */
function PaidVsAgreedBar({ fiche }: { fiche: SfContractFicheType }) {
  const t = useT();
  const agreed = fiche.contract.agreed_usd;
  const paid = fiche.contract.paid_usd;
  if (agreed <= 0 && paid <= 0) return null;
  const over = paid > agreed && agreed > 0;

  const ref = Math.max(agreed, paid, 1);
  const agreedPct = (agreed / ref) * 100;
  const paidPct = (paid / ref) * 100;
  const withinPct = Math.min(paidPct, agreedPct);
  const overrun = Math.max(0, paid - agreed);

  return (
    <div>
      <div className="fx-fiche-sub">{t("us.sf.contracts.fiche.money.sub_ceiling")}</div>
      <div
        role="img"
        aria-label={fill(t("us.sf.contracts.fiche.bar.aria"), {
          paid: fmtUsdCompact(paid),
          agreed: fmtUsdCompact(agreed),
        })}
        style={{ position: "relative", height: 22, background: "var(--rule)", marginTop: 4 }}
      >
        {/* paid, within the agreed ceiling */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${withinPct}%`, background: "var(--bleu)" }} />
        {/* paid beyond the recorded base — neutral grey, see the note above */}
        {over && overrun > 0 && (
          <div style={{ position: "absolute", left: `${agreedPct}%`, top: 0, bottom: 0, width: `${paidPct - agreedPct}%`, background: "#9aa0ab" }} />
        )}
        {/* agreed marker — only meaningful when paid overshoots it */}
        {over && (
          <div style={{ position: "absolute", left: `${agreedPct}%`, top: -3, bottom: -3, width: 2, background: "var(--ink)" }} aria-hidden="true" />
        )}
      </div>
      {over ? (
        <p style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
          {fmtUsdCompact(paid)} {t("us.sf.contracts.fiche.kpi.paid").toLowerCase()} ·{" "}
          {fill(t("us.sf.contracts.fiche.bar.over"), { v: fmtUsdCompact(overrun) })}
          <span style={{ color: "var(--muted)" }}> · {t("us.sf.contracts.fiche.bar.agreed_marker")} {fmtUsdCompact(agreed)}</span>
        </p>
      ) : null}
    </div>
  );
}

export default function SfContractFiche({
  fiche,
  primePayeeSlug,
  deptContractsHref,
}: {
  fiche: SfContractFicheType;
  /** Slug of the prime contractor's recipient fiche when it is keyed (top ~200);
   *  null otherwise. Resolved from contracts_held inversion — a confident match. */
  primePayeeSlug?: string | null;
  /** The department's CONTRACTS fiche, server-validated (null ⇒ plain text).
   *  Never its budget fiche: from inside a contract, "the department" means
   *  the department's other contracts, and the budget is a link it offers. */
  deptContractsHref?: string | null;
}) {
  const t = useT();
  const c = fiche.contract;
  const primeHref = primePayeeSlug
    ? `/usa/san-francisco/who-gets-paid/payee/${primePayeeSlug}`
    : null;

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

  const teamRow = (m: SfContractFicheType["team"][number], i: number) => (
    <tr key={`${m.supplier}-${m.role}-${i}`}>
      <td className="c-lead" style={{ fontWeight: m.role === "Prime Contractor" ? 600 : 400 }}>
        {m.role === "Prime Contractor" && primeHref ? (
          <Link href={primeHref} scroll={false} style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>
            {m.supplier}
          </Link>
        ) : (
          m.supplier
        )}
        {m.lbe && (
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--bleu)", marginLeft: 8 }}>
            LBE
          </span>
        )}
      </td>
      <td className="muted c-fig" data-label={t("us.sf.contracts.fiche.team.col.role")}>
        {t(`us.sf.contracts.fiche.team.role.${m.role.replace(/\s/g, "_").toLowerCase()}`)}
      </td>
      <td className="num c-fig" data-label={t("us.sf.contracts.fiche.team.col.attached")}>
        {m.role === "Prime Contractor" ? "—" : m.attached_usd != null ? fmtUsdCompact(m.attached_usd) : "—"}
      </td>
    </tr>
  );

  return (
    <div>
      {/* The page header already carries the title and the prime contractor.
       *  What is NEW here: the register's own wording when it differs from the
       *  plain-English title, the buying department as a way back OUT into its
       *  other contracts, and the procurement badges. (Paris ContratFiche
       *  resolution — the card used to repeat the H1 verbatim.) */}
      {(c.what_concretely || (c.title_plain && c.title_plain !== c.title) || c.department || badges.length > 0) && (
        <div className="fx-fiche-lead">
          {/* The generated explanation leads, because on this register the
           *  verbatim title is often unreadable. It is labelled as written
           *  from the register's fields, and the raw title sits right below —
           *  the reader can always see what the City actually recorded. */}
          {c.what_concretely && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                <Tip label={t("us.sf.contracts.fiche.gen.tip")}>
                  {t("us.sf.contracts.fiche.gen.label")}
                </Tip>
              </div>
              <p className="fx-fiche-lead-main" style={{ margin: 0 }}>
                {c.what_concretely}
              </p>
            </div>
          )}
          {c.title_plain && c.title_plain !== c.title && (
            <p
              style={{ margin: 0, fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".04em", color: "var(--muted)", lineHeight: 1.6 }}
              title={t("us.sf.contracts.fiche.raw_title_tip")}
            >
              {t("us.sf.contracts.fiche.raw_title_label")} “{c.title}”
            </p>
          )}
          {c.department && (
            <p
              style={{
                margin: c.title_plain && c.title_plain !== c.title ? "10px 0 0" : 0,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                letterSpacing: ".04em",
                color: "var(--muted)",
                lineHeight: 1.6,
              }}
            >
              {t("us.sf.contracts.fiche.dept_label")}{" "}
              {deptContractsHref ? (
                <Link
                  href={deptContractsHref}
                  scroll={false}
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {c.department.replace(/^[A-Z]{2,4}\s+/, "")}
                </Link>
              ) : (
                <span style={{ color: "var(--ink-2)" }}>{c.department.replace(/^[A-Z]{2,4}\s+/, "")}</span>
              )}
            </p>
          )}
          {badges.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: (c.title_plain && c.title_plain !== c.title) || c.department ? 10 : 0,
              }}
            >
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
      )}

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
          {/* No ocre here. Ocre is the "look here" ink and paid > agreed is not
              a finding — it is an artefact of the register's payments column,
              which on multi-phase contracts also runs well above the City's own
              voucher ledger for the same contract. Colouring it would accuse
              the contract of an overrun we have not established. */}
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(c.paid_usd)}</div>
          {paidRatio != null && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
              {c.paid_exceeds_agreed ? (
                <Tip label="The City publishes two payment figures per contract and they disagree here: the register's payments column exceeds its own agreed amount. Why the two disagree is not documented in the source.">
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
            {/* The type was dead label text; it now opens the ranked fiche
             *  for that facet (Recife `modalidade` parity). */}
            {c.contract_type ? (
              <Link
                href={`/usa/san-francisco/contracts/type/${typeSlug(c.contract_type)}`}
                scroll={false}
                style={{ color: "inherit", borderBottom: "1px solid var(--bleu)", textDecoration: "none" }}
              >
                {typeLabel(c.contract_type)}
              </Link>
            ) : (
              typeLabel(c.contract_type)
            )}
          </div>
        </div>
      </div>

      {/* ── The money: ceiling, then the payment curve. One heading, because
        *  "paid vs agreed" and "paid per year" are the same question at two
        *  resolutions — they used to be two sections with two headings. ── */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.contracts.fiche.money.h")}</div>
        <PaidVsAgreedBar fiche={fiche} />
        <div style={{ marginTop: 26 }}>
          <div className="fx-fiche-sub">{t("us.sf.contracts.fiche.money.sub_curve")}</div>
          <SpendCurve fiche={fiche} />
          <div style={{ marginTop: 10 }}>
            <Fy2018Note variant="inline" />
          </div>
        </div>
      </section>

      {/* ── The deal: how long it runs and what it was awarded under. The
        *  authority string is the register's own words, quoted; a sole-source
        *  waiver is a lawful route and is presented as the recorded basis,
        *  not as a finding. ── */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("us.sf.contracts.fiche.deal.h")}</div>
        <div className="fx-fiche-sub">{t("us.sf.contracts.fiche.deal.sub_term")}</div>
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
        {(c.purchasing_authority || c.sole_source) && (
          <div style={{ marginTop: 26 }}>
            <div className="fx-fiche-sub">{t("us.sf.contracts.fiche.deal.sub_auth")}</div>
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
            {/* The family is the navigable facet — Recife's modalidade move:
              *  from one contract you can see every other awarded the same way. */}
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
              {c.sole_source && <>{t("us.sf.contracts.fiche.sole.neutral")} </>}
              {c.authority_family && (
                <Link
                  href={`/usa/san-francisco/contracts/authority/${c.authority_family}`}
                  scroll={false}
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {fill(t("us.sf.contracts.fiche.deal.auth_link"), {
                    family: FAMILY_LABELS[c.authority_family] ?? c.authority_family,
                  })}
                </Link>
              )}
            </p>
          </div>
        )}
      </section>

      {/* Project team */}
      {showTeam && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("us.sf.contracts.fiche.team.h")}</div>
          <table className="fx-table fx-table-cards" style={{ borderTop: 0 }}>
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
            <tbody>{teamMembers.slice(0, TEAM_FOLD).map(teamRow)}</tbody>
          </table>
          {/* Was a dead "+N more" line: it named up to 190 subcontractors a
           *  reader could never reach. Now it opens them. */}
          <FicheMore count={teamMembers.length - TEAM_FOLD} noun="more on the team">
            <table className="fx-table fx-table-cards" style={{ borderTop: 0 }}>
              <tbody>{teamMembers.slice(TEAM_FOLD).map(teamRow)}</tbody>
            </table>
          </FicheMore>
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
