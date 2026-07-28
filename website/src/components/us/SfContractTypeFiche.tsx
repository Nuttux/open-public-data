"use client";

import Link from "next/link";
import Tip from "@/components/fusion/Tip";
import { FicheMore } from "@/components/fiche";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { contractLabel, typeLabel } from "@/app/us/city/sf/contracts/us-sf-contracts-types";
import type { SfActiveRow } from "@/app/us/city/sf/contracts/us-sf-contracts-types";

/**
 * Contract-type fiche — the SF analogue of Recife's `modalidade` fiche
 * (components/br/RecifeModalidadeFiche.tsx): a facet you can navigate INTO,
 * ranked by money, instead of a label that dead-ends on a contract fiche.
 *
 * Every figure is a sum or share of exported rows: the register aggregate
 * comes from contracts_overview.landscape.by_type, the ranked list from the
 * active-contract rows carrying this type. Nothing is recomputed from scratch.
 */

const nfInt = new Intl.NumberFormat("en-US");

export type SfContractTypeData = {
  raw: string;
  /** Register-wide aggregate for this type (all contracts, not just active). */
  register: {
    n_contracts: number;
    agreed_usd: number;
    paid_usd: number;
    share_of_register_agreed: number;
  };
  /** Active contracts of this type, biggest first. */
  active: SfActiveRow[];
  n_active: number;
  activeAgreedUsd: number;
  nSoleSource: number;
  source: { name: string; source_url: string };
};

const TOP_N = 12;
/** Of those 12, how many are on screen before the fold. */
const SHOWN = 6;

export default function SfContractTypeFiche({ d }: { d: SfContractTypeData }) {
  const rows = d.active.slice(0, TOP_N);
  const refMax = rows[0]?.agreed_usd || 1;

  const contractRow = (r: SfContractTypeData["active"][number]) => (
    <Link
      key={r.contract_no}
      href={`/us/city/sf/contracts/contract/${r.contract_no}`}
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
          {r.department ? ` · ${r.department}` : ""}
          {r.sole_source ? " · sole-source" : ""}
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
          <div className="fx-fiche-kpi-label">Agreed, whole register</div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(d.register.agreed_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Contracts of this type</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.register.n_contracts)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Share of everything committed</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtShare(d.register.share_of_register_agreed)}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Contracts of this type flagged as awarded without competitive bidding, among those still active today.">
              Sole-source, active
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {nfInt.format(d.nSoleSource)}
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
              {" "}
              / {nfInt.format(d.n_active)}
            </span>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            Biggest active contracts of this type
          </div>
          <div>{rows.slice(0, SHOWN).map(contractRow)}</div>
          <FicheMore count={rows.length - SHOWN} noun="more contracts">
            {rows.slice(SHOWN).map(contractRow)}
          </FicheMore>
          {d.n_active > TOP_N && (
            <p style={{ margin: "10px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
              Showing the {TOP_N} biggest of {nfInt.format(d.n_active)} active contracts of this type
              · <Link href="/us/city/sf/contracts#sec-search" style={{ color: "var(--bleu)" }}>search them all →</Link>
            </p>
          )}
        </section>
      ) : (
        <p className="fx-note">
          No contract of this type is active today. The register total above covers every contract
          ever recorded under it.
        </p>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Register totals and the active list come from the supplier-contract register; the type is
          the register&rsquo;s own <code style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{d.raw}</code>{" "}
          value, shown here as &ldquo;{typeLabel(d.raw)}&rdquo;.{" "}
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
