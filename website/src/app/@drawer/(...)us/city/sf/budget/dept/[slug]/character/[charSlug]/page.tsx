import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import { readDataJsonOrNull } from "@/lib/data/read";
import SfDeptCharacterFiche from "@/components/us/SfDeptCharacterFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfDeptCharacterDetail,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string; charSlug: string };
type SP = { year?: string; side?: string };

function parseSide(v: string | undefined): SfSide | undefined {
  return v === "revenue" ? "revenue" : v === "spending" ? "spending" : undefined;
}

/**
 * Root-level intercepting drawer for the SF dept × character DETAIL fiche
 * — the third drill level (dept → character → this). `parentLink` sends
 * "← Back" to the department fiche (also a drawer route, so a soft nav),
 * not the sessionStorage stack — this is a fixed drill hierarchy, not an
 * arbitrary navigation chain.
 */
export default async function DrawerSfDeptCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug, charSlug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const d = loadSfDeptCharacterDetail(slug, charSlug, year, parseSide(sp.side));
  if (!d) return notFound();

  const vendorSlugMap =
    readDataJsonOrNull<Record<string, string>>("us/sf/payees/_vendor_slug_map.json") ?? {};
  const deptName = d.dept.display_name ?? d.dept.label;
  const deptHref = `/us/city/sf/budget/dept/${deptSlug(d.dept.code)}?year=${year}`;
  const shareText = `${deptName} — ${d.character.label}: ${fmtUsdCompact(d.amount_usd)} adopted (FY${year}, San Francisco).`;
  const sideParam = sp.side ? `&side=${d.side}` : "";

  return (
    <ForcedLocale locale="en">
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>{deptName} · FY{year} adopted budget</>}
        title={d.character.label}
        shareUrl={`/us/city/sf/budget/dept/${slug}/character/${charSlug}?year=${year}${sideParam}`}
        shareText={shareText}
        backHref={deptHref}
        parentLink={{ url: deptHref, label: deptName }}
        breadcrumbLabel={d.character.label}
      >
        <SfDeptCharacterFiche d={d} vendorSlugMap={vendorSlugMap} />
      </DetailDrawer>
    </div>
    </ForcedLocale>
  );
}
