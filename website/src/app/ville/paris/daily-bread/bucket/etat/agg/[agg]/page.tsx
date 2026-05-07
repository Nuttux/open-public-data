import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import {
  Navbar,
  Footer,
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

const BASE_PATH = "/ville/paris/daily-bread";
const VOICE = "daily_bread" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { agg } = await params;
  const locale = await readLocale();
  const found = getEtatAggregation(decodeURIComponent(agg));
  if (!found) {
    return {
      title:
        locale === "en"
          ? "Aggregate not found — France Open Data"
          : "Agrégat introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? found.label_en : found.label_fr;
  const title = `${label} — État · Daily Bread · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/etat/agg/${agg}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneAggPage({
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
    {
      label: bucketLabel,
      href: `${BASE_PATH}/bucket/etat${
        profileQuery ? `?${profileQuery}` : ""
      }`,
    },
    { label: aggLabel },
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
            {aggLabel}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
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
      </div>
      </main>
      <Footer />
    </div>
  );
}
