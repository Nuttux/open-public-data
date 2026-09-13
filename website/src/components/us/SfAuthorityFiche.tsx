"use client";

import Link from "@/components/LocalizedLink";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { contractLabel } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import type { SfActiveRow } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";

/**
 * Purchasing-authority fiche — the SF analogue of Recife's `modalidade`
 * (components/br/RecifeModalidadeFiche.tsx): the legal route a contract was
 * awarded under, as a facet you can open rather than a label that dead-ends.
 *
 * SF records a free-text purchasing authority on every contract; those strings
 * are grouped into families upstream. This fiche shows what one family covers
 * and which live contracts sit under it.
 */

const nfInt = new Intl.NumberFormat("en-US");
const TOP_N = 12;

export type SfAuthorityData = {
  family: string;
  label: string;
  /** Register-wide totals for the family. */
  register: { n_contracts: number; agreed_usd: number; share_of_register: number };
  /** The distinct authority strings the register actually wrote, verbatim. */
  strings: string[];
  active: SfActiveRow[];
  n_active: number;
  activeAgreedUsd: number;
  source: { name: string; source_url: string };
};

export default function SfAuthorityFiche({ d }: { d: SfAuthorityData }) {
  const rows = d.active.slice(0, TOP_N);
  const refMax = rows[0]?.agreed_usd || 1;

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Agreed, whole register</div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(d.register.agreed_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Contracts awarded this way</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.register.n_contracts)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Share of everything committed</div>
          <div className="fx-fiche-kpi-value tnum">{fmtShare(d.register.share_of_register)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Running today</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.n_active)}</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
            {fmtUsdCompact(d.activeAgreedUsd)} agreed
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Biggest contracts awarded this way</div>
          <div>
            {rows.map((r) => (
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
                    {r.department ? ` · ${r.department}` : ""}
                  </span>
                </span>
                <span style={{ position: "relative", height: 10, background: "var(--rule)" }}>
                  <span
                    style={{
                      position: "absolute",
                      inset: "0 auto 0 0",
                      width: `${Math.max(0, Math.min(100, (r.agreed_usd / refMax) * 100))}%`,
                      background: "var(--ink)",
                    }}
                  />
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
                  {fmtUsdCompact(r.agreed_usd)}
                </span>
              </Link>
            ))}
          </div>
          {d.n_active > TOP_N && (
            <p style={{ margin: "10px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
              Showing the {TOP_N} biggest of {nfInt.format(d.n_active)} running today ·{" "}
              <Link href="/usa/san-francisco/contracts#sec-search" style={{ color: "var(--bleu)" }}>
                search them all →
              </Link>
            </p>
          )}
        </section>
      )}

      {d.strings.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">What the register actually writes</div>
          {/* The family is a grouping we applied; these are the source's own
            *  words, unedited, so the reader can see what was grouped. */}
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {d.strings.slice(0, 10).map((str) => (
              <li
                key={str}
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--ink-2)",
                  padding: "5px 0",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                {str}
              </li>
            ))}
          </ul>
          {d.strings.length > 10 && (
            <p style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
              …and {nfInt.format(d.strings.length - 10)} more wordings grouped into this family.
            </p>
          )}
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          The purchasing authority is recorded per contract as free text; the families group those
          wordings for display only.{" "}
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
