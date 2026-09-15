import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, loadInvestissementsData, marchesDoorTotal, subventionsYearTotal } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import InvestissementsClient from "./InvestissementsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("investissements", yearParam(sp.year));
}

export default async function InvestissementsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadInvestissementsData(requestedYear);
  const posts = getPostsForPage("investissements");
  // The doors carry a number: the year's budget, its contracts, and the next section's grants.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("paris", d.year)),
    marches: safe(() => marchesDoorTotal("paris", d.year)),
    next: safe(() => subventionsYearTotal("paris", d.year)),
  };
  return (
    <>
      {parisSectionJsonLd("investissements", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <InvestissementsClient d={d} posts={posts} doors={doors} />
    </>
  );
}
