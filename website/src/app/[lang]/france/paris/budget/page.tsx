import type { Metadata } from "next";
import "@/app/fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadInvestForYear,
  loadInvestLatest,
  loadInvestPhotoOfYear,
  marchesDoorTotal,
  subventionsYearTotal,
} from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import BudgetClient from "./BudgetClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("budget", yearParam(sp.year));
}

type SP = { year?: string };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const index = loadBudgetIndex();
  const d = loadBudgetPageData(requestedYear);
  const posts = getPostsForPage("budget");
  // The doors carry a number, and the year's largest worksite with a photo is the material moment.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    marches: safe(() => marchesDoorTotal("paris", d.year)),
    subventions: safe(() => subventionsYearTotal("paris", d.year)),
    invest: safe(() => loadInvestForYear(d.year)),
  };
  // A voted year has no worksite list yet: the latest year of published projects then.
  const photo = safe(() => loadInvestPhotoOfYear(d.year)) ?? safe(() => { const y = loadInvestLatest()?.year; return y ? loadInvestPhotoOfYear(y) : null; });

  return (
    <>
      {parisSectionJsonLd("budget", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <BudgetClient index={index} d={d} posts={posts} doors={doors} photo={photo} />
    </>
  );
}
