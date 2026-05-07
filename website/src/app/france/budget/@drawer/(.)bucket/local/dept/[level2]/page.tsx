import { notFound } from "next/navigation";

import {
  DetailDrawer,
  BudgetDrilldownFiche,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import {
  getBucket,
  getDeptDrilldown,
  getDeptEntry,
  isStub,
} from "@/lib/budget-drilldown";
import { getEditorialAsidesForLocalScope } from "@/lib/editorial-asides";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  formatNationalAnnualLabel,
  nationalLocalLevel2Annual,
  parseDailyBreadProfile,
  projectLocalScopeLevel2Monthly,
  shellRootCrumb,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";
import { readLocale } from "@/lib/seo";

type Params = { level2: string };

const BASE_PATH = "/france/budget";
const VOICE = "budget" as const;

export default async function DrawerBudgetDeptL2Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { level2 } = await params;
  const sp = (await searchParams) ?? {};
  const decodedL2 = decodeURIComponent(level2);

  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const entry = getDeptEntry(decodedL2);
  if (!bucket || !block || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · departmental level`
      : `${bucketLabel} · niveau départemental`;

  const shareUrl = `${BASE_PATH}/bucket/local/dept/${encodeURIComponent(
    decodedL2,
  )}`;

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "dept", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "dept",
        entry.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const root = shellRootCrumb(VOICE, locale, BASE_PATH);
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: root.label, href: root.href },
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
        backHref={`${BASE_PATH}${profileQuery ? `?${profileQuery}` : ""}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={bucket}
          bucketKey="local"
          scope="dept"
          scopeBlock={block}
          level2={entry}
          isStub={isStub()}
          amounts={{
            nationalAnnualLabel,
            personalMonthlyLabel,
            parentPersonalMonthlyEur: personalMonthlyEur,
            parentNationalAnnualEur: nationalAnnualEur,
          }}
          breadcrumb={breadcrumb}
          profileQuery={profileQuery}
          basePath={BASE_PATH}
          editorialAsides={
            getEditorialAsidesForLocalScope("dept") ?? undefined
          }
        />
      </DetailDrawer>
    </div>
  );
}
