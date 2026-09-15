import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, detteCostOfYear, loadHorsBilan, loadLogementSocialData, loadPatrimoineData, loadPatrimoineStructure } from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import DetteClient from "./DetteClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("dette", yearParam(sp.year));
}

export default async function DettePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadPatrimoineData(requestedYear);
  const structure = loadPatrimoineStructure(d.year);
  const horsBilan = loadHorsBilan(d.year);
  const posts = getPostsForPage("dette-patrimoine");
  // The doors carry a number: the year's budget, the social housing stock, the places that follow.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("paris", d.year)),
    logement: safe(() => { const l = loadLogementSocialData(undefined, "paris"); return l.stockTotal > 0 ? { total: l.stockTotal } : null; }),
    next: safe(() => ({ count: loadLieuxIndex().length })),
  };
  return (
    <>
      {parisSectionJsonLd("dette", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <DetteClient d={d} structure={structure} horsBilan={horsBilan} posts={posts} cost={safe(() => detteCostOfYear("paris", d.year))} costSeries={d.availableYears.map((y) => { const c = safe(() => detteCostOfYear("paris", y)); return { year: y, amount: c ? c.interets + c.remboursement : 0 }; })} doors={doors} />
    </>
  );
}
