import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import SfPayrollFamilyFiche from "@/components/us/SfPayrollFamilyFiche";
import { loadSfPayrollFamily } from "@/lib/us/sf-payroll-family";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a job family on
 * /us/city/sf/payroll opens it as a drawer over the page. Direct URLs fall
 * back to app/us/city/sf/payroll/family/[slug]/page.tsx.
 */
export default async function DrawerSfPayrollFamilyPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollFamily(slug);
  if (!d) return notFound();

  const shareText = `${d.family}: ${d.latest.n_employees.toLocaleString("en-US")} San Francisco city employees paid ${fmtUsdCompact(d.latest.total_compensation_usd)} in FY${d.fiscalYear} — ${fmtShare(d.latest.ot_share_of_comp)} of it overtime.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker="JOB FAMILY · SAN FRANCISCO"
        title={d.family}
        shareUrl={`/us/city/sf/payroll/family/${slug}`}
        shareText={shareText}
        backHref="/us/city/sf/payroll"
        breadcrumbLabel={d.family}
      >
        <SfPayrollFamilyFiche d={d} />
      </DetailDrawer>
    </div>
  );
}
