import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfAuthorityFiche from "@/components/us/SfAuthorityFiche";
import { loadSfContractAuthority } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { family: string };

/** Intercepted route — clicking an authority family opens it as a drawer. */
export default async function DrawerSfAuthorityPage({ params }: { params: Promise<Params> }) {
  const { family } = await params;
  const d = loadSfContractAuthority(family);
  if (!d) return notFound();

  return (
  /* Self-wraps in ForcedLocale: the root @drawer slot renders OUTSIDE
     app/us/layout.tsx, so without this the shared fusion chrome falls back
     to French inside an EN-only drawer ("PARTAGER" on the share button). */
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker="HOW IT WAS AWARDED · SAN FRANCISCO"
          title={d.label}
          shareUrl={`/usa/san-francisco/contracts/authority/${family}`}
          shareText={`${d.register.n_contracts.toLocaleString("en-US")} San Francisco contracts worth ${fmtUsdCompact(d.register.agreed_usd)} were awarded under ${d.label.toLowerCase()}.`}
          backHref="/usa/san-francisco/contracts"
          breadcrumbLabel={d.label}
        >
          <SfAuthorityFiche d={d} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
