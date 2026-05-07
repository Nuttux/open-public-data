import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import {
  Navbar,
  Footer,
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
const BASE_PATH = "/france/budget";
const VOICE = "budget" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bucket, level2 } = await params;
  const locale = await readLocale();
  if (!VALID_BUCKETS.has(bucket as BucketKey)) {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const found = getDrilldownEntry(
    bucket as BucketKey,
    decodeURIComponent(level2),
  );
  if (!found || found.kind !== "level2") {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const title =
    locale === "en"
      ? `${label} — ${bucketLabel} · Budget · France Open Data`
      : `${label} — ${bucketLabel} · Budget · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/${bucket}/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneBudgetL2Page({
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
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

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
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <p className="fx-page-kicker">{eyebrow}</p>
          <h1
            className="fx-page-title"
            style={{ fontSize: "clamp(28px, 4vw, 48px)" }}
          >
            {entryLabel}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
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
      </div>
      </main>
      <Footer />
    </div>
  );
}
