import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfServiceFiche from "@/components/us/SfServiceFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfServiceFiche,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };
type SP = { year?: string; side?: string };

/**
 * Root-level intercepting drawer for SF service-area fiches — what a "by
 * service" bar on /us/city/sf/budget opens.
 */
export default async function DrawerSfServicePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const side = (sp.side === "revenue" ? "revenue" : sp.side === "spending" ? "spending" : undefined) as
    | SfSide
    | undefined;
  const s = loadSfServiceFiche(slug, year, side);
  if (!s) return notFound();

  const backHref = `/us/city/sf/budget?year=${year}`;
  const shareText = `${s.label} — ${fmtUsdCompact(s.total_usd)} across ${s.n_departments} departments (FY${year}, San Francisco budget).`;
  const sideParam = sp.side ? `&side=${s.side}` : "";

  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Service area · FY{year} adopted budget</>}
          title={s.label}
          shareUrl={`/us/city/sf/budget/service/${slug}?year=${year}${sideParam}`}
          shareText={shareText}
          backHref={backHref}
          breadcrumbLabel={s.label}
        >
          <SfServiceFiche s={s} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
