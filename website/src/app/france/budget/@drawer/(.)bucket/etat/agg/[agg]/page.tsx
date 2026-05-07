import { notFound } from "next/navigation";

import {
  DetailDrawer,
  BudgetDrilldownFiche,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import { getEtatAggregation, isStub } from "@/lib/budget-drilldown";
import { getEditorialAsidesForEtatAggregation } from "@/lib/editorial-asides";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  formatNationalAnnualLabel,
  parseDailyBreadProfile,
  projectEtatAggregationMonthly,
  shellRootCrumb,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";
import { readLocale } from "@/lib/seo";

type Params = { agg: string };

const BASE_PATH = "/france/budget";
const VOICE = "budget" as const;

export default async function DrawerBudgetAggPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { agg } = await params;
  const sp = (await searchParams) ?? {};
  const decodedAgg = decodeURIComponent(agg);

  const found = getEtatAggregation(decodedAgg);
  if (!found) return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const aggLabel = locale === "en" ? found.label_en : found.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · editorial aggregate`
      : `${bucketLabel} · agrégat éditorial`;

  const shareUrl = `${BASE_PATH}/bucket/etat/agg/${encodeURIComponent(
    decodedAgg,
  )}`;

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    const etatTotal = db.state_breakdown.total_net_cp_eur;
    if (etatTotal && found.share_of_parent > 0) {
      nationalAnnualEur = etatTotal * found.share_of_parent;
    }
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur = monthlies
    ? projectEtatAggregationMonthly(
        monthlies,
        found.share_of_parent ?? 0,
        found.missions,
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
    { label: aggLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={aggLabel}
        shareUrl={shareUrl}
        backHref={`${BASE_PATH}${profileQuery ? `?${profileQuery}` : ""}`}
        breadcrumbLabel={aggLabel}
      >
        <BudgetDrilldownFiche
          bucket={found.bucket}
          bucketKey="etat"
          aggregation={found}
          resolvedMissions={found.resolvedMissions}
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
            getEditorialAsidesForEtatAggregation(decodedAgg) ?? undefined
          }
        />
      </DetailDrawer>
    </div>
  );
}
