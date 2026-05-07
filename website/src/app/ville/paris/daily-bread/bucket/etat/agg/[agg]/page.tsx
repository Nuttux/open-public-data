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
          ? "Aggregation not found — France Open Data"
          : "Agrégation introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? found.label_en : found.label_fr;
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const title = `${label} — ${bucketLabel} · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/etat/agg/${agg}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneEtatAggPage({
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
  const aggLabel = locale === "en" ? found.label_en : found.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · aggregation`
      : `${bucketLabel} · agrégation`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

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

  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? found.resolvedMissions.reduce((acc, m) => {
        const mission = db.state_breakdown.missions.find(
          (x) => x.code.toLowerCase() === m.key.toLowerCase(),
        );
        return acc + (mission?.cp_eur ?? 0);
      }, 0)
    : 0;
  const nationalAnnualLabel =
    nationalAnnualEur > 0 ? formatAnnualCompact(nationalAnnualEur, locale) : null;
  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    { label: aggLabel },
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
