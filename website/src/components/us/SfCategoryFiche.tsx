import Link from "next/link";
import {
  FicheShell,
  FicheStatHero,
  FicheSection,
  FicheYearBars,
  FicheBreakdown,
  FicheSourceFooter,
  type FicheBreakdownRow,
} from "@/components/fiche";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type { SfCategoryData } from "@/lib/us/sf-spending";

/**
 * Spending-category fiche — the SF analogue of the contract-type fiche
 * (SfContractTypeFiche) and of Recife's `modalidade`: a facet you navigate
 * INTO, ranked by money, instead of a label that dead-ends.
 *
 * It exists because the who-gets-paid page had exactly one thing to say about
 * a category and no way to open it: the reader could see $1.6B of construction
 * contracts and could not get to who was paid it.
 *
 * Every figure is a value from spending_subobjects.json — the year series, the
 * ranked payees and the shares are all exported, nothing is recomputed here.
 */

const nfInt = new Intl.NumberFormat("en-US");

const CLASS_CHIP: Record<string, string> = {
  purchase: "Purchase",
  obligation: "Not a purchase",
  ledger: "Ledger line",
  unclear: "Unclassified",
};

export default function SfCategoryFiche({
  d,
  vendorSlugMap = {},
  deptHrefs = {},
}: {
  d: SfCategoryData;
  vendorSlugMap?: Record<string, string>;
  deptHrefs?: Record<string, string>;
}) {
  // A payee can appear twice under two paying departments — that is the grain
  // of the ranking, and the department is what tells the two rows apart.
  const rows: FicheBreakdownRow[] = d.topPayees.map((p, i) => ({
    key: `${p.vendor}-${p.department_code ?? ""}-${i}`,
    label: p.vendor,
    meta: p.department ?? undefined,
    value: p.amount_usd,
    href: vendorSlugMap[p.vendor]
      ? `/us/city/sf/who-gets-paid/payee/${vendorSlugMap[p.vendor]}`
      : undefined,
  }));
  const notShown = Math.max(0, d.nPayeesRanked - d.topPayees.length);

  // A way back OUT of this category — the same "way out" the contract fiche
  // gives via its buying department. These are the departments appearing in
  // the ranked payments ABOVE, which is a subset of the n_departments stat:
  // Construction Contracts is bought by 6 departments but its eight biggest
  // payments were all PUC's. The heading has to say so, or the section reads
  // as a complete list that contradicts the number next to it.
  const departments = [
    ...new Map(
      d.topPayees
        .filter((p) => p.department_code && deptHrefs[p.department_code])
        .map((p) => [p.department_code!, p.department ?? p.department_code!]),
    ).entries(),
  ].slice(0, 6);

  return (
    <FicheShell>
      <div className="fx-fiche-tags">
        <span className="fx-sm-tag">{CLASS_CHIP[d.spendClass] ?? d.spendClass}</span>
        <span className="fx-sm-tag">Code {d.code}</span>
      </div>

      <div className="fx-fiche-lead">
        <p className="fx-fiche-lead-main">{d.classDefinition}</p>
      </div>

      <FicheStatHero
        value={fmtUsdCompact(d.paidUsd)}
        caption={
          <>
            paid in FY{d.fiscalYear} · {fmtShare(d.shareOfYear)} of the City&rsquo;s payments that
            year
          </>
        }
      />

      {rows.length > 0 && (
        <FicheSection
          title={`Who was paid in FY${d.fiscalYear}`}
          sub={`${nfInt.format(d.nVendors)} payees, ${nfInt.format(d.nDepartments)} departments.`}
        >
          <FicheBreakdown
            rows={rows}
            format={fmtUsdCompact}
            cap={8}
            footer={notShown > 0 ? `${nfInt.format(notShown)} more not shown.` : undefined}
          />
        </FicheSection>
      )}

      {d.series.length > 1 && (
        <FicheSection
          title="Spent by year"
          sub="From FY2018, when the City renumbered its chart of accounts."
        >
          <FicheYearBars
            points={d.series}
            format={fmtUsdCompact}
            peakNote={(peak) => (
              <>
                Tallest bar — FY{peak.year}: {fmtUsdCompact(peak.value)}. Bars are scaled to this
                category&rsquo;s own peak year.
              </>
            )}
          />
        </FicheSection>
      )}

      {departments.length > 0 && (
        <FicheSection
          title="Departments in those payments"
          sub={
            departments.length < d.nDepartments
              ? `${nfInt.format(d.nDepartments)} in all; these are the ones above.`
              : undefined
          }
        >
          <ul className="fx-place-contracts">
            {departments.map(([code, name]) => (
              <li key={code}>
                <Link href={deptHrefs[code]} scroll={false} className="fx-row-link">
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </FicheSection>
      )}

      <FicheSourceFooter>
        <b>Source</b>: SF Controller — Vendor Payments (Vouchers). The category is the City&rsquo;s
        own accounting code; sorting the codes into purchases and the rest is ours. Payees are
        ranked from the data, not selected.
      </FicheSourceFooter>
    </FicheShell>
  );
}
