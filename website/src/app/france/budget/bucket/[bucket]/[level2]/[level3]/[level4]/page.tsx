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
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  formatNationalAnnualLabel,
  nationalEtatLevel2Annual,
  nationalLocalLevel2Annual,
  nationalSecuLevel2Annual,
  parseDailyBreadProfile,
  projectLevel4Monthly,
  shellRootCrumb,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";
import { readLocale } from "@/lib/seo";

type Params = {
  bucket: string;
  level2: string;
  level3: string;
  level4: string;
};

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);
const BASE_PATH = "/france/budget";
const VOICE = "budget" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bucket, level2, level3, level4 } = await params;
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
    decodeURIComponent(level4),
  );
  if (!found || found.kind !== "level4") {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const parentLabel =
    locale === "en"
      ? found.parentLevel3.label_en
      : found.parentLevel3.label_fr;
  const title = `${label} — ${parentLabel} · Budget · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/${bucket}/${level2}/${level3}/${level4}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneBudgetL4Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bucket, level2, level3, level4 } = await params;
  const sp = (await searchParams) ?? {};
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

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    if (bucketKey === "etat") {
      const l2Annual = nationalEtatLevel2Annual(db, decodedL2);
      if (l2Annual != null)
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
    } else if (bucketKey === "secu") {
      const l2Annual = nationalSecuLevel2Annual(
        db,
        found.parentLevel2.share_of_parent ?? 0,
      );
      if (l2Annual != null)
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
    } else {
      const l2Annual = nationalLocalLevel2Annual(
        db,
        "bloc_communal",
        found.parentLevel2.share_of_parent ?? 0,
      );
      if (l2Annual != null)
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
    }
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

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
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const root = shellRootCrumb(VOICE, locale, BASE_PATH);
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: root.label, href: root.href },
    { label: bucketLabel },
    {
      label: l2Label,
      href: `${BASE_PATH}/bucket/${bucketKey}/${encodeURIComponent(
        decodedL2,
      )}${profileQuery ? `?${profileQuery}` : ""}`,
    },
    {
      label: l3Label,
      href: `${BASE_PATH}/bucket/${bucketKey}/${encodeURIComponent(
        decodedL2,
      )}/${encodeURIComponent(decodedL3)}${
        profileQuery ? `?${profileQuery}` : ""
      }`,
    },
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
          level2={found.parentLevel2}
          level3={found.parentLevel3}
          level4={found.entry}
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
      </div>
      </main>
      <Footer />
    </div>
  );
}
