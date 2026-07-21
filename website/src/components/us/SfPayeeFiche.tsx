import Link from "next/link";
import type { SfPayeeFicheData } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact } from "@/lib/us/format";
import {
  FicheShell,
  FicheStatHero,
  FicheSection,
  FicheYearBars,
  FicheDocList,
  FicheSourceFooter,
  type FicheDoc,
  type FicheYearPoint,
} from "@/components/fiche";

/**
 * SF payee fiche — a normalized top-payee's money footprint, composed from the
 * neutral fiche kit (components/fiche/*). This file is now just the SF adapter:
 * it maps SfPayeeFicheData onto the shared primitives + a couple of
 * payee-specific blocks (contracts held, name variants). See docs/adding-a-city.md.
 */

const KIND_LABEL: Record<string, string> = {
  supplier: "Supplier",
  nonprofit: "Nonprofit",
  healthcare: "Healthcare",
  fiscal_agent_debt_service: "Fiscal agent / debt service",
  payroll_passthrough: "Payroll pass-through",
  other: "Payee",
};

export default function SfPayeeFiche({ payee }: { payee: SfPayeeFicheData }) {
  const years: FicheYearPoint[] = Object.entries(payee.by_year)
    .map(([y, v]) => ({ year: Number(y), value: v }))
    .sort((a, b) => a.year - b.year);

  const docs: FicheDoc[] = (payee.paper_trail ?? []).map((d) => ({
    id: d.identifier,
    title: d.title,
    year: d.year,
    href: d.deep_link,
    snippet: d.snippet,
    sourceLabel: d.source_label,
  }));

  return (
    <FicheShell>
      <FicheStatHero
        value={fmtUsdCompact(payee.total_paid_usd)}
        caption={
          <>
            paid {payee.first_year}–{payee.last_year} · {KIND_LABEL[payee.kind] ?? "Payee"}
            {payee.is_non_profit ? " · nonprofit" : ""}
          </>
        }
      />

      <FicheSection title="Paid by year">
        <FicheYearBars
          points={years}
          format={fmtUsdCompact}
          peakNote={(peak) => (
            <>
              Tallest bar — FY{peak.year}: {fmtUsdCompact(peak.value)}. Bars are scaled to this
              payee’s own peak year.
            </>
          )}
        />
      </FicheSection>

      {payee.top_departments.length > 0 && (
        <FicheSection title="Who pays them">
          <p className="fx-fiche-line">{payee.top_departments.join(" · ")}</p>
        </FicheSection>
      )}

      {payee.contracts_held.length > 0 && (
        <FicheSection title={`Active contracts (${payee.n_contracts_held})`}>
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
        </FicheSection>
      )}

      {docs.length > 0 && (
        <FicheSection
          title="Paper trail in the archive"
          sub="Where this vendor appears in San Francisco’s digitized public record — bid bulletins, commission agendas, bond documents."
        >
          <FicheDocList docs={docs} />
        </FicheSection>
      )}

      {payee.n_variants > 1 && (
        <FicheSection title={`Name variants merged (${payee.n_variants})`}>
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
        </FicheSection>
      )}

      <FicheSourceFooter>
        <b>Source</b>: SF Controller — Vendor Payments (Vouchers) & Supplier Contracts,
        name-normalized. Payees outside the top ~200 by lifetime dollars are not keyed and appear as
        plain text.
      </FicheSourceFooter>
    </FicheShell>
  );
}
