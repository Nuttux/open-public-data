import { notFound } from "next/navigation";

import {
  DetailDrawer,
  BudgetDrilldownFiche,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import {
  getDrilldownEntry,
  isStub,
  type BucketKey,
} from "@/lib/budget-drilldown";
import { getEditorialAsidesForLevel2 } from "@/lib/editorial-asides";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  formatNationalAnnualLabel,
  nationalEtatLevel2Annual,
  nationalLocalLevel2Annual,
  nationalSecuLevel2Annual,
  parseDailyBreadProfile,
  projectLevel2Monthly,
  shellRootCrumb,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);
const BASE_PATH = "/ville/paris/daily-bread";
const VOICE = "daily_bread" as const;

export default async function DrawerL2Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bucket, level2 } = await params;
  const sp = (await searchParams) ?? {};
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return notFound();
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);

  const found = getDrilldownEntry(bucketKey, decodedL2);
  if (!found || found.kind !== "level2") return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

  const shareUrl = `${BASE_PATH}/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}`;

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    if (bucketKey === "etat")
      nationalAnnualEur = nationalEtatLevel2Annual(db, decodedL2);
    else if (bucketKey === "secu")
      nationalAnnualEur = nationalSecuLevel2Annual(
        db,
        found.entry.share_of_parent ?? 0,
      );
    else
      nationalAnnualEur = nationalLocalLevel2Annual(
        db,
        "bloc_communal",
        found.entry.share_of_parent ?? 0,
      );
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur = monthlies
    ? projectLevel2Monthly(
        monthlies,
        bucketKey,
        decodedL2,
        found.entry.share_of_parent ?? 0,
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
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.entry}
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
            getEditorialAsidesForLevel2(bucketKey, decodedL2) ?? undefined
          }
        />
      </DetailDrawer>
    </div>
  );
}
