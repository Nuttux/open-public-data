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
  getDeptLevel3Entry,
  isStub,
} from "@/lib/budget-drilldown";
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

type Params = { level2: string; level3: string };

const BASE_PATH = "/ville/paris/daily-bread";
const VOICE = "daily_bread" as const;

export default async function DrawerDeptL3Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { level2, level3 } = await params;
  const sp = (await searchParams) ?? {};
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);

  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const l2 = getDeptEntry(decodedL2);
  const l3 = getDeptLevel3Entry(decodedL2, decodedL3);
  if (!bucket || !block || !l2 || !l3) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const l2Label = locale === "en" ? l2.label_en : l2.label_fr;
  const entryLabel = locale === "en" ? l3.label_en : l3.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · departmental · ${l2Label}`
      : `${bucketLabel} · départemental · ${l2Label}`;

  const shareUrl = `${BASE_PATH}/bucket/local/dept/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}`;

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    const l2Annual = nationalLocalLevel2Annual(
      db,
      "dept",
      l2.share_of_parent ?? 0,
    );
    if (l2Annual != null)
      nationalAnnualEur = l2Annual * (l3.share_of_parent ?? 0);
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const l2Monthly = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "dept",
        l2.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyEur =
    l2Monthly != null ? l2Monthly * (l3.share_of_parent ?? 0) : null;
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const root = shellRootCrumb(VOICE, locale, BASE_PATH);
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: root.label, href: root.href },
    {
      label: bucketLabel,
      href: `${BASE_PATH}/bucket/local${
        profileQuery ? `?${profileQuery}` : ""
      }`,
    },
    { label: blockLabel },
    {
      label: l2Label,
      href: `${BASE_PATH}/bucket/local/dept/${encodeURIComponent(
        decodedL2,
      )}${profileQuery ? `?${profileQuery}` : ""}`,
    },
    { label: entryLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`${BASE_PATH}/bucket/local/dept/${encodeURIComponent(
          decodedL2,
        )}${profileQuery ? `?${profileQuery}` : ""}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={bucket}
          bucketKey="local"
          scope="dept"
          scopeBlock={block}
          level2={l2}
          level3={l3}
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
        />
      </DetailDrawer>
    </div>
  );
}
