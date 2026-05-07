import { notFound } from "next/navigation";

import {
  DetailDrawer,
  BudgetDrilldownFiche,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import {
  getBucket,
  getRegionDrilldown,
  getRegionEntry,
  isStub,
} from "@/lib/budget-drilldown";
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatAnnualCompact,
  formatMonthlyEur,
  nationalLocalLevel2Annual,
  parseDailyBreadProfile,
  projectLocalScopeLevel2Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { level2: string };
type Search = Record<string, string | string[] | undefined>;

export default async function DrawerRegionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { level2 } = await params;
  const sp = await searchParams;
  const decoded = decodeURIComponent(level2);
  const bucket = getBucket("local");
  const block = getRegionDrilldown();
  const entry = getRegionEntry(decoded);
  if (!bucket || !block || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow = `${bucketLabel} · ${blockLabel}`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  const personalMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "region",
        entry.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  // National absolute : APUL.S1313 × part_regions × share_of_parent
  // (depuis 2026-05 : sync_eurostat_apu_subsectors.py expose annual_eur).
  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "region", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = nationalAnnualEur
    ? formatAnnualCompact(nationalAnnualEur, locale)
    : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";

  const shareUrl = `/ville/paris/daily-bread/bucket/local/region/${encodeURIComponent(
    decoded,
  )}${profileSuffix}`;

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    { label: blockLabel },
    { label: entryLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread${profileSuffix}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={bucket}
          bucketKey="local"
          scope="region"
          scopeBlock={block}
          level2={entry}
          isStub={isStub()}
          breadcrumb={breadcrumb}
          profileQuery={profileQueryStr}
          amounts={{
            nationalAnnualLabel,
            personalMonthlyLabel,
            parentPersonalMonthlyEur: personalMonthlyEur,
          }}
        />
      </DetailDrawer>
    </div>
  );
}
