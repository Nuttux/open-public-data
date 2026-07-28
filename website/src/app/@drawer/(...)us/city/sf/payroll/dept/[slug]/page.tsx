import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import SfPayrollDeptFiche from "@/components/us/SfPayrollDeptFiche";
import { loadSfPayrollDept } from "@/lib/us/sf-payroll-entities";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a department from
 * the payroll page opens its PAYROLL fiche as a drawer, not its budget fiche.
 * Direct URLs fall back to app/us/city/sf/payroll/dept/[slug]/page.tsx.
 */
export default async function DrawerSfPayrollDeptPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollDept(slug);
  if (!d) return notFound();

  const shareText = `${d.name} paid ${d.latest.n_employees.toLocaleString("en-US")} people ${fmtUsdCompact(
    d.latest.total_compensation_usd,
  )} in FY${d.fiscalYear} — a median of ${fmtUsd(d.latest.median_total_comp_usd)} per person.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={`DEPARTMENT · PAYROLL · ${d.code}`}
        title={d.name}
        shareUrl={`/us/city/sf/payroll/dept/${slug}`}
        shareText={shareText}
        backHref="/us/city/sf/payroll"
        breadcrumbLabel={d.name}
      >
        <SfPayrollDeptFiche d={d} />
      </DetailDrawer>
    </div>
  );
}
