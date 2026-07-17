import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import SfContractFiche from "@/components/us/SfContractFiche";
import { loadSfContractFiche } from "@/app/us/city/sf/contracts/data";
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

  const label = c.title_plain || c.title || `Contract ${c.contract_no}`;
  const shareText = `San Francisco contract ${c.contract_no} — ${label}: ${fmtUsdCompact(c.agreed_usd)} agreed with ${c.prime_contractor ?? "?"}, ${fmtUsdCompact(c.paid_usd)} paid so far.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={`CONTRACT · ${c.department_code ?? "SF"} · ${c.contract_no}`}
        title={label}
        shareUrl={`/us/city/sf/contracts/contract/${c.contract_no}`}
        shareText={shareText}
        backHref="/us/city/sf/contracts"
        breadcrumbLabel={`Contract ${c.contract_no}`}
      >
        <SfContractFiche fiche={fiche} />
      </DetailDrawer>
    </div>
  );
}
