import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfCategoryFiche from "@/components/us/SfCategoryFiche";
import { loadSfCategory } from "@/lib/us/sf-spending";
import { loadSfCategoryLinks } from "@/lib/us/sf-category-links";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a spending
 * category on the who-gets-paid page or on a payee fiche opens it as a
 * drawer. Direct URLs fall back to the full page under
 * app/us/city/sf/who-gets-paid/category/[slug]/page.tsx.
 */
export default async function DrawerSfCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;
  const { year } = await searchParams;
  const requestedFy = year && /^\d{4}$/.test(year) ? Number(year) : undefined;
  const d = loadSfCategory(slug, requestedFy);
  if (!d) return notFound();
  const { vendorSlugMap, deptHrefs } = loadSfCategoryLinks();

  const shareText = `${d.label}: San Francisco paid ${fmtUsdCompact(d.paidUsd)} under this category in FY${d.fiscalYear} — ${fmtShare(d.shareOfYear)} of every payment that year, across ${d.nVendors.toLocaleString("en-US")} payees.`;

  // ForcedLocale, like the payee drawer: the root @drawer slot renders OUTSIDE
  // app/us/layout.tsx, so without it the drawer chrome falls back to the site
  // default and an EN-only US page shows a "PARTAGER" button.
  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker="SPENDING CATEGORY · SAN FRANCISCO"
          title={d.label}
          shareUrl={`/us/city/sf/who-gets-paid/category/${slug}?year=${d.fiscalYear}`}
          shareText={shareText}
          backHref="/us/city/sf/who-gets-paid"
          breadcrumbLabel={d.label}
        >
          <SfCategoryFiche d={d} vendorSlugMap={vendorSlugMap} deptHrefs={deptHrefs} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
