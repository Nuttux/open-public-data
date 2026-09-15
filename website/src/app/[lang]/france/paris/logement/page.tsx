import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, detteDoorTotal, garantiesDoorTotal, loadInvestForYear, loadLogementSocialData, loadSruArrondissements } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import LogementClient from "./LogementClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("logement", yearParam(sp.year));
}

export default async function LogementSocialPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadLogementSocialData(requestedYear);
  const sruArr = loadSruArrondissements();
  const posts = getPostsForPage("logement-social");
  // The doors carry a number: the guarantees, the year's budget and investment, and the debt that follows.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    garanties: safe(() => garantiesDoorTotal("paris")),
    budget: safe(() => budgetDoorTotal("paris", d.year)),
    invest: safe(() => loadInvestForYear(d.year)),
    next: safe(() => detteDoorTotal("paris", d.year)),
  };
  return (
    <>
      {parisSectionJsonLd("logement", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <LogementClient d={d} sruArr={sruArr} posts={posts} doors={doors} />
    </>
  );
}
