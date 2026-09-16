import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, loadQuiRecoitData, loadQuiRecoitIndex, marchesDoorTotal } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import SubventionsClient from "./SubventionsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("subventions", yearParam(sp.year));
}

export default async function QuiRecoitPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadQuiRecoitIndex();
  const d = loadQuiRecoitData(requestedYear);
  const posts = getPostsForPage("qui-recoit");
  // The doors carry a number: the year's budget, and the contracts of the next section.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("paris", d.year)),
    next: safe(() => marchesDoorTotal("paris", d.year)),
  };
  return (
    <>
      {parisSectionJsonLd("subventions", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <SubventionsClient idx={idx} d={d} posts={posts} doors={doors} />
    </>
  );
}
