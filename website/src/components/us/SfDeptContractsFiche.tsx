"use client";

import Link from "@/components/LocalizedLink";
import Tip from "@/components/fusion/Tip";
import { FicheMore } from "@/components/fiche";
import { fmtUsdCompact } from "@/lib/us/format";
import { contractLabel, deptDisplayName } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import type { SfActiveRow } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";

/**
 * Department fiche, CONTRACTS lens — the sibling of SfContractTypeFiche.
 *
 * It exists because clicking a department from the contracts page used to
 * open that department's BUDGET fiche: a different register, a different
 * question, no contract in sight. A department row inside contracts now
 * answers the contracts question — what it buys, from whom, how much was
 * signed without a bid — and offers the budget as one labelled link out.
 *
 * Perimeter discipline: the register aggregate (all time) and the active
 * portfolio (today) are two different scopes and are never mixed in one
 * number. Every figure is a sum over exported rows.
 */

const nfInt = new Intl.NumberFormat("en-US");

export type SfDeptContractsData = {
  code: string;
  slug: string;
  /** The register's own department label (most frequent spelling for the code). */
  name: string;
  /** All-time totals when the export's department list carries this code. */
  register: { n_contracts: number; agreed_usd: number; paid_usd: number } | null;
  /** All-time sole-source position when the export carries this department. */
  sole: {
    n_sole: number;
    sole_agreed_usd: number;
    share_of_dept_contracts: number;
    share_of_dept_agreed: number | null;
  } | null;
  /** Contracts active today, biggest first. */
  active: SfActiveRow[];
  n_active: number;
  activeAgreedUsd: number;
  activePaidUsd: number;
  nSoleActive: number;
  primes: { name: string; n_contracts: number; agreed_usd: number }[];
  /** The department's budget fiche — null when the budget has no such code. */
  budgetHref: string | null;
  source: { name: string; source_url: string };
};

const TOP_N = 12;
/** Of those 12, how many are on screen before the fold. */
const SHOWN = 6;

export default function SfDeptContractsFiche({ d }: { d: SfDeptContractsData }) {
  const rows = d.active.slice(0, TOP_N);
  const refMax = rows[0]?.agreed_usd || 1;
  const primeMax = d.primes[0]?.agreed_usd || 1;
  const paidRatio = d.activeAgreedUsd > 0 ? d.activePaidUsd / d.activeAgreedUsd : null;

  const contractRow = (r: SfDeptContractsData["active"][number]) => (
    <Link
      key={r.contract_no}
      href={`/usa/san-francisco/contracts/contract/${r.contract_no}`}
      scroll={false}
      className="fx-row-link"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(150px, 1.4fr) minmax(60px, 1fr) auto",
        alignItems: "center",
        gap: 12,
        padding: "9px 4px",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--f-ui)",
        fontSize: 13,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span>
        {contractLabel(r)}
        <span
          style={{
            display: "block",
            fontFamily: "var(--f-mono)",
            fontSize: 10.5,
            color: "var(--muted)",
            marginTop: 2,
          }}
        >
          {r.prime ?? "—"}
          {r.sole_source ? " · sole-source" : ""}
          {r.paid_exceeds_agreed ? " · paid past ceiling" : ""}
        </span>
      </span>
      <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
        <span
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${Math.max(0, Math.min(100, (r.agreed_usd / refMax) * 100))}%`,
            background: r.sole_source ? "var(--ocre)" : "var(--ink)",
          }}
        />
      </span>
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
        {fmtUsdCompact(r.agreed_usd)}
      </span>
    </Link>
  );

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Total agreed under this department's contracts that are still running today. Multi-year envelopes, not one year of spending.">
              Agreed, active today
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(d.activeAgreedUsd)}</div>
          {paidRatio != null && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
              {fmtUsdCompact(d.activePaidUsd)} paid · {Math.round(paidRatio * 100)}%
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Contracts active today</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.n_active)}</div>
          {d.register && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
              {nfInt.format(d.register.n_contracts)} on the books all time
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Suppliers under contract</div>
          <div className="fx-fiche-kpi-value tnum">
            {nfInt.format(new Set(d.active.map((r) => (r.prime ?? "").trim()).filter(Boolean)).size)}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Contracts of this department flagged as awarded without competitive bidding, among those active today.">
              Sole-source, active
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {nfInt.format(d.nSoleActive)}
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
              {" "}
              / {nfInt.format(d.n_active)}
            </span>
          </div>
        </div>
      </div>

      {d.primes.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Biggest suppliers, active contracts</div>
          <div>
            {d.primes.map((p) => (
              <div
                key={p.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1.4fr) minmax(60px, 1fr) auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 4px",
                  borderBottom: "1px solid var(--rule)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 13,
                }}
              >
                <span>
                  {p.name}
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--f-mono)",
                      fontSize: 10.5,
                      color: "var(--muted)",
                      marginTop: 2,
                    }}
                  >
                    {nfInt.format(p.n_contracts)}{" "}
                    {p.n_contracts === 1 ? "contract" : "contracts"}
                  </span>
                </span>
                <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
                  <span
                    style={{
                      position: "absolute",
                      inset: "0 auto 0 0",
                      width: `${Math.max(0, Math.min(100, (p.agreed_usd / primeMax) * 100))}%`,
                      background: "var(--ink)",
                    }}
                  />
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
                  {fmtUsdCompact(p.agreed_usd)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Biggest active contracts</div>
        <div>{rows.slice(0, SHOWN).map(contractRow)}</div>
        <FicheMore count={rows.length - SHOWN} noun="more contracts">
          {rows.slice(SHOWN).map(contractRow)}
        </FicheMore>
        {d.n_active > TOP_N && (
          <p style={{ margin: "10px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
            Showing the {TOP_N} biggest of {nfInt.format(d.n_active)} active contracts ·{" "}
            <Link href="/usa/san-francisco/contracts#sec-search" style={{ color: "var(--bleu)" }}>
              search them all →
            </Link>
          </p>
        )}
      </section>

      {/* The budget is a neighbouring question, offered as such — it is no
       *  longer what a click on a department inside contracts lands on. */}
      {d.budgetHref && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Elsewhere on this department</div>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
            Contracts are commitments to suppliers; the budget is what the department is appropriated
            and spends across salaries, materials and everything else. The two do not add up and
            answer different questions.{" "}
            <Link href={d.budgetHref} scroll={false} style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>
              {deptDisplayName(d.name)}&rsquo;s budget →
            </Link>
          </p>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Every figure is a sum over the supplier-contract register, grouped on its own department
          code <code style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{d.code}</code>.{" "}
          <a
            href={d.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.source.name} ↗
          </a>
        </p>
      </section>
    </div>
  );
}
