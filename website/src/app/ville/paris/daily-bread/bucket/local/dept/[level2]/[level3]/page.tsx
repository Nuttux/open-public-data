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
  getDeptDrilldown,
  getDeptEntry,
  getDeptLevel3Entry,
  isStub,
} from "@/lib/budget-drilldown";
import { readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  parseDailyBreadProfile,
  projectLocalScopeLevel2Monthly,
} from "@/lib/daily-bread-profile";

type Params = { level2: string; level3: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { level2, level3 } = await params;
  const locale = await readLocale();
  const entry = getDeptLevel3Entry(
    decodeURIComponent(level2),
    decodeURIComponent(level3),
  );
  if (!entry) {
    return {
      title:
        locale === "en"
          ? "Department sub-function not found — France Open Data"
          : "Sous-fonction départementale introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? entry.label_en : entry.label_fr;
  const title = `${label} — Département · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/local/dept/${level2}/${level3}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneDeptLevel3Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { level2, level3 } = await params;
  const sp = await searchParams;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);
  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const parent = getDeptEntry(decodedL2);
  const entry = getDeptLevel3Entry(decodedL2, decodedL3);
  if (!bucket || !block || !parent || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const parentLabel = locale === "en" ? parent.label_en : parent.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow = `${bucketLabel} · ${blockLabel}`;

  const query = parseDailyBreadProfile(sp);
  const profileQueryStr = query.hasProfile ? buildProfileQueryString(query) : "";
  const monthlies = query.hasProfile ? computeProfileMonthlies(query) : null;

  // Personal monthly = parent dept-level2 monthly × share_of_parent (level3).
  const parentMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "dept",
        parent.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyEur =
    parentMonthlyEur !== null
      ? parentMonthlyEur * (entry.share_of_parent ?? 0)
      : null;
  const personalMonthlyLabel =
    personalMonthlyEur !== null && personalMonthlyEur > 0
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;
  const nationalAnnualLabel: string | null = null;

  const profileSuffix = profileQueryStr ? `?${profileQueryStr}` : "";
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    { label: "Daily Bread", href: `/ville/paris/daily-bread${profileSuffix}` },
    { label: bucketLabel },
    { label: blockLabel },
    {
      label: parentLabel,
      href: `/ville/paris/daily-bread/bucket/local/dept/${encodeURIComponent(
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
          bucket={bucket}
          bucketKey="local"
          scope="dept"
          scopeBlock={block}
          level2={parent}
          level3={entry}
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
