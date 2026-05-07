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
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatAnnualCompact,
  formatMonthlyEur,
  nationalEtatLevel2Annual,
  parseDailyBreadProfile,
  projectLevel4Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = {
  bucket: string;
  level2: string;
  level3: string;
  level4: string;
};
type Search = Record<string, string | string[] | undefined>;

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export default async function DrawerL4Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { bucket, level2, level3, level4 } = await params;
  const sp = await searchParams;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return notFound();
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);
  const decodedL4 = decodeURIComponent(level4);

  const found = getDrilldownEntry(bucketKey, decodedL2, decodedL3, decodedL4);
  if (!found || found.kind !== "level4") return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const l2Label =
    locale === "en"
      ? found.parentLevel2.label_en
      : found.parentLevel2.label_fr;
  const l3Label =
    locale === "en"
      ? found.parentLevel3.label_en
      : found.parentLevel3.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · ${l2Label} · ${l3Label} · level 4`
      : `${bucketLabel} · ${l2Label} · ${l3Label} · niveau 4`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  const personalMonthlyEur = monthlies
    ? projectLevel4Monthly(
        monthlies,
        bucketKey,
        decodedL2,
        found.parentLevel2.share_of_parent ?? 0,
        found.parentLevel3.share_of_parent ?? 0,
        found.entry.share_of_parent ?? 0,
      )
    : null;

  // National annual = État: l2.cp_eur × share_of_parent_l3 × share_of_parent_l4
  const db = loadDailyBread();
  const nationalParentAnnual =
    bucketKey === "etat" && db
      ? nationalEtatLevel2Annual(db, decodedL2)
      : null;
  const nationalAnnualEur =
    nationalParentAnnual !== null
      ? nationalParentAnnual *
        (found.parentLevel3.share_of_parent ?? 0) *
        (found.entry.share_of_parent ?? 0)
      : null;
  const nationalAnnualLabel = nationalAnnualEur
    ? formatAnnualCompact(nationalAnnualEur, locale)
    : null;

  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";

  const shareUrl = `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}/${encodeURIComponent(decodedL4)}${profileSuffix}`;

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    {
      label: l2Label,
      href: `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
        decodedL2,
      )}${profileSuffix}`,
    },
    {
      label: l3Label,
      href: `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
        decodedL2,
      )}/${encodeURIComponent(decodedL3)}${profileSuffix}`,
    },
    { label: entryLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
          decodedL2,
        )}/${encodeURIComponent(decodedL3)}${profileSuffix}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.parentLevel2}
          level3={found.parentLevel3}
          level4={found.entry}
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
