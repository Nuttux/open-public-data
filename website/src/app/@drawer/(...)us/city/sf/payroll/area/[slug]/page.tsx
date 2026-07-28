import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import SfPayrollAreaFiche from "@/components/us/SfPayrollAreaFiche";
import { loadSfPayrollArea } from "@/lib/us/sf-payroll-entities";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a segment of the
 * payroll composition bar opens that service area as a drawer. Direct URLs
 * fall back to app/us/city/sf/payroll/area/[slug]/page.tsx.
 */
export default async function DrawerSfPayrollAreaPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollArea(slug);
  if (!d) return notFound();

  const shareText = `${d.name} is ${fmtUsdCompact(
    d.latest.total_compensation_usd,
  )} of San Francisco's payroll in FY${d.fiscalYear}, across ${d.latest.n_departments} departments.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker="SERVICE AREA · PAYROLL · SAN FRANCISCO"
        title={d.name}
        shareUrl={`/us/city/sf/payroll/area/${slug}`}
        shareText={shareText}
        backHref="/us/city/sf/payroll"
        breadcrumbLabel={d.name}
      >
        <SfPayrollAreaFiche d={d} />
      </DetailDrawer>
    </div>
  );
}
