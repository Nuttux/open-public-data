import { notFound } from "next/navigation";

import {
  DetailDrawer,
  BudgetDrilldownFiche,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import { getEtatAggregation, isStub } from "@/lib/budget-drilldown";
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatAnnualCompact,
  formatMonthlyEur,
  parseDailyBreadProfile,
  projectEtatAggregationMonthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { agg: string };
type Search = Record<string, string | string[] | undefined>;

export default async function DrawerEtatAggPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { agg } = await params;
  const sp = await searchParams;
  const decoded = decodeURIComponent(agg);
  const found = getEtatAggregation(decoded);
  if (!found) return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const aggLabel =
    locale === "en" ? found.label_en : found.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · aggregation`
      : `${bucketLabel} · agrégation`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  // L'agg parent englobe la somme des shares_of_state des missions résolues —
  // on l'utilise pour pondérer etatMonthly. share_of_parent du JSON peut
  // diverger légèrement de cette somme (rounding).
  const aggShare = (() => {
    const sumShares = found.resolvedMissions.reduce(
      (acc, m) => acc + (m.share_of_parent ?? 0),
      0,
    );
    if (sumShares > 0) return sumShares;
    return found.share_of_parent ?? 0;
  })();
  const personalMonthlyEur = monthlies
    ? projectEtatAggregationMonthly(monthlies, aggShare)
    : null;

  // National absolute = sum of cp_eur for resolved missions.
  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? found.resolvedMissions.reduce((acc, m) => {
        const found = db.state_breakdown.missions.find(
          (x) => x.code.toLowerCase() === m.key.toLowerCase(),
        );
        return acc + (found?.cp_eur ?? 0);
      }, 0)
    : 0;
  const nationalAnnualLabel =
    nationalAnnualEur > 0 ? formatAnnualCompact(nationalAnnualEur, locale) : null;

  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";

  const shareUrl = `/ville/paris/daily-bread/bucket/etat/agg/${encodeURIComponent(
    decoded,
  )}${profileSuffix}`;

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    { label: aggLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={aggLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread${profileSuffix}`}
        breadcrumbLabel={aggLabel}
      >
        <BudgetDrilldownFiche
          bucket={found.bucket}
          bucketKey="etat"
          aggregation={found}
          resolvedMissions={found.resolvedMissions}
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
