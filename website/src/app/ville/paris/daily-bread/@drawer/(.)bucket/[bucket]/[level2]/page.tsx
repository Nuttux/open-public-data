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
  nationalLocalLevel2Annual,
  nationalSecuLevel2Annual,
  parseDailyBreadProfile,
  projectLevel2Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { bucket: string; level2: string };
type Search = Record<string, string | string[] | undefined>;

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export default async function DrawerL2Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { bucket, level2 } = await params;
  const sp = await searchParams;
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

  // Profil utilisateur — si fourni, on calcule €/mois sur ce nœud.
  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  const personalMonthlyEur = monthlies
    ? projectLevel2Monthly(
        monthlies,
        bucketKey,
        decodedL2,
        found.entry.share_of_parent ?? 0,
      )
    : null;

  // National absolute :
  //   - État : `state_breakdown.missions[].cp_eur`
  //   - Sécu : `apu_subsectors.S1314.annual_eur` × share branche (drilldown)
  //   - Local (bloc communal) : S1313.annual_eur × part_communes_epci × share
  const db = loadDailyBread();
  const level2Share = found.entry.share_of_parent ?? 0;
  const nationalAnnualEur = !db
    ? null
    : bucketKey === "etat"
      ? nationalEtatLevel2Annual(db, decodedL2)
      : bucketKey === "secu"
        ? nationalSecuLevel2Annual(db, level2Share)
        : bucketKey === "local"
          ? nationalLocalLevel2Annual(db, "bloc_communal", level2Share)
          : null;
  const nationalAnnualLabel = nationalAnnualEur
    ? formatAnnualCompact(nationalAnnualEur, locale)
    : null;

  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const shareUrl = `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}${profileQueryStr ? `?${profileQueryStr}` : ""}`;

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    {
      label:
        locale === "en"
          ? "Daily Bread"
          : "Daily Bread",
      href: `/ville/paris/daily-bread${profileQueryStr ? `?${profileQueryStr}` : ""}`,
    },
    { label: bucketLabel },
    { label: entryLabel },
  ];

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread${profileQueryStr ? `?${profileQueryStr}` : ""}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.entry}
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
