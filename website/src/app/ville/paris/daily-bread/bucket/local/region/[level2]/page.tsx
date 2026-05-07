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
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatAnnualCompact,
  formatMonthlyEur,
  nationalLocalLevel2Annual,
  parseDailyBreadProfile,
  projectLocalScopeLevel2Monthly,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";

type Params = { level2: string };
type Search = Record<string, string | string[] | undefined>;

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
          ? "Region breakdown not found — France Open Data"
          : "Détail région introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? entry.label_en : entry.label_fr;
  const title = `${label} — Région · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/local/region/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneRegionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { level2 } = await params;
  const sp = await searchParams;
  const decoded = decodeURIComponent(level2);
  const bucket = getBucket("local");
  const block = getRegionDrilldown();
  const entry = getRegionEntry(decoded);
  if (!bucket || !block || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow = `${bucketLabel} · ${blockLabel}`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  const personalMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "region",
        entry.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;
  // National absolute : APUL.S1313 × part_regions × share_of_parent.
  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "region", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = nationalAnnualEur
    ? formatAnnualCompact(nationalAnnualEur, locale)
    : null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    { label: blockLabel },
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
          bucket={bucket}
          bucketKey="local"
          scope="region"
          scopeBlock={block}
          level2={entry}
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
