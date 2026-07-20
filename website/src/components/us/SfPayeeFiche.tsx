import Link from "next/link";
import type { SfPayeeFicheData, SfPayeePaperTrail } from "@/lib/us/sf-payees-data";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

/**
 * SF payee fiche — a normalized top-payee's money footprint. No Paris
 * equivalent (subventions are annual aggregates; SF vouchers are per-payee).
 * Shows lifetime + per-year paid, the departments that pay it, the active
 * contracts it holds with award-vs-paid, the name variants merged into it
 * (the normalization made transparent), and any archive paper trail.
 */

const KIND_LABEL: Record<string, string> = {
  supplier: "Supplier",
  nonprofit: "Nonprofit",
  healthcare: "Healthcare",
  fiscal_agent_debt_service: "Fiscal agent / debt service",
  payroll_passthrough: "Payroll pass-through",
  other: "Payee",
};

function highlight(snippet: string) {
  return snippet.split(/(«[^»]*»)/g).map((p, i) =>
    p.startsWith("«") && p.endsWith("»") ? (
      <mark key={i} className="fx-doc-hit">{p.slice(1, -1)}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function PaperTrailRow({ doc }: { doc: SfPayeePaperTrail }) {
  return (
    <li className="fx-doc-row">
      <a href={doc.deep_link} target="_blank" rel="noopener noreferrer" className="fx-doc-title">
        {doc.title}
        {doc.year ? <span className="fx-doc-year"> · {doc.year}</span> : null} ↗
      </a>
      {doc.snippet ? <p className="fx-doc-snippet">“{highlight(doc.snippet)}”</p> : null}
      <div className="fx-doc-source">{doc.source_label}</div>
    </li>
  );
}

export default function SfPayeeFiche({ payee }: { payee: SfPayeeFicheData }) {
  const years = Object.entries(payee.by_year)
    .map(([y, v]) => ({ year: Number(y), v }))
    .sort((a, b) => a.year - b.year);
  const maxY = Math.max(...years.map((y) => y.v), 1);

  return (
    <div className="fx-fiche fx-place-fiche">
      {/* Hero stats */}
      <div className="fx-payee-hero">
        <div>
          <div className="fx-payee-hero-num">{fmtUsdCompact(payee.total_paid_usd)}</div>
          <div className="fx-payee-hero-cap">
            paid {payee.first_year}–{payee.last_year} · {KIND_LABEL[payee.kind] ?? "Payee"}
            {payee.is_non_profit ? " · nonprofit" : ""}
          </div>
        </div>
      </div>

      {/* Per-year paid */}
      <section className="fx-place-block">
        <h2 className="fx-place-h2">Paid by year</h2>
        <div className="fx-payee-years">
          {years.map((y) => (
            <div key={y.year} className="fx-payee-year">
              <div className="fx-payee-year-bar-wrap" title={`${y.year}: ${fmtUsd(y.v)}`}>
                <div className="fx-payee-year-bar" style={{ height: `${Math.max(2, (y.v / maxY) * 100)}%` }} />
              </div>
              <div className="fx-payee-year-label">{`'${String(y.year).slice(2)}`}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Departments */}
      {payee.top_departments.length > 0 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">Who pays them</h2>
          <p className="fx-place-money-line">{payee.top_departments.join(" · ")}</p>
        </section>
      )}

      {/* Contracts held */}
      {payee.contracts_held.length > 0 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">
            Active contracts ({payee.n_contracts_held})
          </h2>
          <ul className="fx-place-contracts">
            {payee.contracts_held.slice(0, 10).map((c) => (
              <li key={c.contract_no}>
                <Link href={`/us/city/sf/contracts/contract/${c.contract_no}`} className="fx-row-link">
                  {c.title ?? c.contract_no}
                </Link>
                <span className="fx-place-contract-meta">
                  {c.department_code ? ` · ${c.department_code}` : ""}
                  {c.agreed_usd != null ? ` · ${fmtUsdCompact(c.agreed_usd)} awarded` : ""}
                  {c.paid_usd != null ? ` · ${fmtUsdCompact(c.paid_usd)} paid` : ""}
                  {c.sole_source ? " · sole-source" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Archive paper trail */}
      {payee.paper_trail && payee.paper_trail.length > 0 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">Paper trail in the archive</h2>
          <p className="fx-place-sub">
            Where this vendor appears in San Francisco’s digitized public record — bid bulletins,
            commission agendas, bond documents.
          </p>
          <ul className="fx-doc-list">
            {payee.paper_trail.map((d) => (
              <PaperTrailRow key={d.identifier} doc={d} />
            ))}
          </ul>
        </section>
      )}

      {/* Normalization transparency */}
      {payee.n_variants > 1 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">Name variants merged ({payee.n_variants})</h2>
          <ul className="fx-payee-variants">
            {payee.variants.map((v) => (
              <li key={v.name}>
                <span className="fx-payee-variant-name">{v.name}</span>
                <span className="fx-place-contract-meta"> · {fmtUsdCompact(v.total)}</span>
              </li>
            ))}
          </ul>
          {payee.merges.length > 0 && (
            <ul className="fx-payee-merges">
              {payee.merges.map((m, i) => (
                <li key={i} className="fx-doc-source">
                  {m.variant}: {m.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="fx-place-sources">
        <p className="fx-footer-sources-meta">
          <b>Source</b>: SF Controller — Vendor Payments (Vouchers) & Supplier Contracts, name-normalized.
          Payees outside the top ~200 by lifetime dollars are not keyed and appear as plain text.
        </p>
      </footer>
    </div>
  );
}
