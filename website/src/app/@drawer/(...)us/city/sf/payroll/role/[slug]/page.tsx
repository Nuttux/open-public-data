import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import SfPayrollRoleFiche from "@/components/us/SfPayrollRoleFiche";
import { loadSfPayrollRole } from "@/lib/us/sf-payroll-entities";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Intercepted route (root-level drawer doctrine) — clicking a job code inside
 * a family fiche opens that code as a drawer. Direct URLs fall back to
 * app/us/city/sf/payroll/role/[slug]/page.tsx.
 */
export default async function DrawerSfPayrollRolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollRole(slug);
  if (!d) return notFound();

  const shareText = `${d.label}: ${d.latest.n_employees.toLocaleString("en-US")} people and ${fmtUsdCompact(
    d.latest.total_compensation_usd,
  )} of San Francisco payroll in FY${d.fiscalYear}.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={`JOB CODE · ${d.family.toUpperCase()}`}
        title={d.label}
        shareUrl={`/us/city/sf/payroll/role/${slug}`}
        shareText={shareText}
        backHref="/us/city/sf/payroll"
        breadcrumbLabel={d.label}
      >
        <SfPayrollRoleFiche d={d} />
      </DetailDrawer>
    </div>
  );
}
