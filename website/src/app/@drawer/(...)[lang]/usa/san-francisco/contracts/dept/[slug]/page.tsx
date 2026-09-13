import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfDeptContractsFiche from "@/components/us/SfDeptContractsFiche";
import { deptDisplayName } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import { loadSfContractDept } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a department from
 * the contracts page opens its CONTRACTS fiche as a drawer over the list.
 * Direct URLs fall back to the full page under
 * app/us/city/sf/contracts/dept/[slug]/page.tsx.
 */
export default async function DrawerSfDeptContractsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfContractDept(slug);
  if (!d) return notFound();

  const label = deptDisplayName(d.name);
  const shareText = `${label} holds ${d.n_active.toLocaleString("en-US")} San Francisco contracts active today, worth ${fmtUsdCompact(d.activeAgreedUsd)} agreed.`;

  return (
  /* Self-wraps in ForcedLocale: the root @drawer slot renders OUTSIDE
     app/us/layout.tsx, so without this the shared fusion chrome falls back
     to French inside an EN-only drawer ("PARTAGER" on the share button). */
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker={`DEPARTMENT · CONTRACTS · ${d.code}`}
          title={label}
          shareUrl={`/usa/san-francisco/contracts/dept/${slug}`}
          shareText={shareText}
          backHref="/usa/san-francisco/contracts"
          breadcrumbLabel={label}
        >
          <SfDeptContractsFiche d={d} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
