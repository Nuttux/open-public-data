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
  getBucket,
  getRegionDrilldown,
  getRegionEntry,
  isStub,
} from "@/lib/budget-drilldown";
import { getEditorialAsidesForLocalScope } from "@/lib/editorial-asides";
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

type Params = { level2: string };

const BASE_PATH = "/france/budget";
const VOICE = "budget" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { level2 } = await params;
  const locale = await readLocale();
  const entry = getRegionEntry(decodeURIComponent(level2));
  if (!entry) {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? entry.label_en : entry.label_fr;
  const title = `${label} — Régions · Budget · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/local/region/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneBudgetRegionL2Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { level2 } = await params;
  const sp = (await searchParams) ?? {};
  const decodedL2 = decodeURIComponent(level2);

  const bucket = getBucket("local");
  const block = getRegionDrilldown();
  const entry = getRegionEntry(decodedL2);
  if (!bucket || !block || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · regional level`
      : `${bucketLabel} · niveau régional`;

  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "region", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "region",
        entry.share_of_parent ?? 0,
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
    { label: blockLabel },
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
          bucket={bucket}
          bucketKey="local"
          scope="region"
          scopeBlock={block}
          level2={entry}
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
            getEditorialAsidesForLocalScope("region") ?? undefined
          }
        />
      </div>
      </main>
      <Footer />
    </div>
  );
}
