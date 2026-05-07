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
  nationalLocalLevel2Annual,
  nationalSecuLevel2Annual,
  parseDailyBreadProfile,
  projectLevel2Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { bucket: string; level2: string };
type Search = Record<string, string | string[] | undefined>;

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

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
  const found = getDrilldownEntry(bucket as BucketKey, decodeURIComponent(level2));
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
      ? `${label} — ${bucketLabel} · Daily Bread · France Open Data`
      : `${label} — ${bucketLabel} · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/${bucket}/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneL2Page({
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
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

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

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
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
      </div>
      <Footer />
    </div>
  );
}
