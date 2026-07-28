import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfContractTypeFiche from "@/components/us/SfContractTypeFiche";
import { loadSfContractType } from "@/app/us/city/sf/contracts/data";
import { typeLabel } from "@/app/us/city/sf/contracts/us-sf-contracts-types";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a contract type
 * from the contracts page or from a contract fiche opens the type as a
 * drawer. Direct URLs fall back to the full page under
 * app/us/city/sf/contracts/type/[slug]/page.tsx.
 */
export default async function DrawerSfContractTypePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfContractType(slug);
  if (!d) return notFound();

  const label = typeLabel(d.raw);
  const shareText = `${label}: ${d.register.n_contracts.toLocaleString("en-US")} San Francisco contracts worth ${fmtUsdCompact(d.register.agreed_usd)} — ${fmtShare(d.register.share_of_register_agreed)} of everything the City has committed.`;

  return (
  /* Self-wraps in ForcedLocale: the root @drawer slot renders OUTSIDE
     app/us/layout.tsx, so without this the shared fusion chrome falls back
     to French inside an EN-only drawer ("PARTAGER" on the share button). */
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker="CONTRACT TYPE · SAN FRANCISCO"
          title={label}
          shareUrl={`/us/city/sf/contracts/type/${slug}`}
          shareText={shareText}
          backHref="/us/city/sf/contracts"
          breadcrumbLabel={label}
        >
          <SfContractTypeFiche d={d} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
