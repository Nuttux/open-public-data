import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfContractFiche from "@/components/us/SfContractFiche";
import { loadSfContractFiche, sfContractDeptHref } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { contractLabel } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import { contractPrimePayeeSlug } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { no: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a contract from
 * /us/city/sf/contracts renders the fiche as a side drawer over the list.
 * Direct URL navigation falls back to the full page under
 * app/us/city/sf/contracts/contract/[no]/page.tsx.
 */
export default async function DrawerSfContractPage({ params }: { params: Promise<Params> }) {
  const { no } = await params;
  const fiche = loadSfContractFiche(no);
  if (!fiche) return notFound();
  const c = fiche.contract;
  const primePayeeSlug = contractPrimePayeeSlug(c.contract_no);
  const deptContractsHref = sfContractDeptHref(c.department_code);

  const label = contractLabel(c) || `Contract ${c.contract_no}`;
  const shareText = `San Francisco contract ${c.contract_no} — ${label}: ${fmtUsdCompact(c.agreed_usd)} agreed with ${c.prime_contractor ?? "?"}, ${fmtUsdCompact(c.paid_usd)} paid so far.`;

  return (
  /* Self-wraps in ForcedLocale: the root @drawer slot renders OUTSIDE
     app/us/layout.tsx, so without this the shared fusion chrome falls back
     to French inside an EN-only drawer ("PARTAGER" on the share button). */
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker={`CONTRACT · ${c.department_code ?? "SF"} · ${c.contract_no}`}
          title={label}
          shareUrl={`/usa/san-francisco/contracts/contract/${c.contract_no}`}
          shareText={shareText}
          backHref="/usa/san-francisco/contracts"
          breadcrumbLabel={`Contract ${c.contract_no}`}
        >
          <SfContractFiche
            fiche={fiche}
            primePayeeSlug={primePayeeSlug}
            deptContractsHref={deptContractsHref}
          />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
