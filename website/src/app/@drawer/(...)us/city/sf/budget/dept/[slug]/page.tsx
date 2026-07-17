import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfDeptFiche from "@/components/us/SfDeptFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfDeptFiche,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };
type SP = { year?: string };

/**
 * Root-level intercepting drawer for SF department fiches (drawer
 * architecture doctrine: one global drawer per entity, `(...)` at the
 * root — mirrors @drawer/(...)fr/city/paris/budget/poste).
 */
export default async function DrawerSfDeptPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const dept = loadSfDeptFiche(slug, year);
  if (!dept) return notFound();

  const title = dept.display_name ?? dept.label;
  const backHref = `/us/city/sf/budget?year=${year}`;
  const shareText = `${title} — ${dept.spending ? fmtUsdCompact(dept.spending.total_usd) : ""} adopted budget (FY${year}, San Francisco).`;

  return (
    <ForcedLocale locale="en">
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Department · FY{year} adopted budget</>}
        title={title}
        shareUrl={`/us/city/sf/budget/dept/${slug}?year=${year}`}
        shareText={shareText}
        backHref={backHref}
        breadcrumbLabel={title}
      >
        <SfDeptFiche d={dept} />
      </DetailDrawer>
    </div>
    </ForcedLocale>
  );
}
