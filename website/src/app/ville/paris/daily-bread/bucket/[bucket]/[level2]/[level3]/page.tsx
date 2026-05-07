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
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatAnnualCompact,
  formatMonthlyEur,
  nationalEtatLevel2Annual,
  parseDailyBreadProfile,
  projectLevel3Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { bucket: string; level2: string; level3: string };
type Search = Record<string, string | string[] | undefined>;

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bucket, level2, level3 } = await params;
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
    decodeURIComponent(level3),
  );
  if (!found || found.kind !== "level3") {
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
  const parentLabel =
    locale === "en" ? found.parent.label_en : found.parent.label_fr;
  const title = `${label} — ${parentLabel} · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/${bucket}/${level2}/${level3}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneL3Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { bucket, level2, level3 } = await params;
  const sp = await searchParams;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return notFound();
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);

  const found = getDrilldownEntry(bucketKey, decodedL2, decodedL3);
  if (!found || found.kind !== "level3") return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const parentLabel =
    locale === "en" ? found.parent.label_en : found.parent.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · ${parentLabel} · level 3`
      : `${bucketLabel} · ${parentLabel} · niveau 3`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  const personalMonthlyEur = monthlies
    ? projectLevel3Monthly(
        monthlies,
        bucketKey,
        decodedL2,
        found.parent.share_of_parent ?? 0,
        found.entry.share_of_parent ?? 0,
      )
    : null;

  const db = loadDailyBread();
  const nationalParentAnnual =
    bucketKey === "etat" && db
      ? nationalEtatLevel2Annual(db, decodedL2)
      : null;
  const nationalAnnualEur =
    nationalParentAnnual !== null
      ? nationalParentAnnual * (found.entry.share_of_parent ?? 0)
      : null;
  const nationalAnnualLabel = nationalAnnualEur
    ? formatAnnualCompact(nationalAnnualEur, locale)
    : null;
  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    {
      label: parentLabel,
      href: `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
        decodedL2,
      )}${profileSuffix}`,
    },
    { label: entryLabel },
  ];

  return (
    <div className="theme-fusion">
      <Navbar />
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
          level2={found.parent}
          level3={found.entry}
          isStub={isStub()}
          breadcrumb={breadcrumb}
          profileQuery={profileQueryStr}
          amounts={{
            nationalAnnualLabel,
            personalMonthlyLabel,
            parentPersonalMonthlyEur: personalMonthlyEur,
          }}
        />
      </div>
      <Footer />
    </div>
  );
}
