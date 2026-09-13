import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadFournisseursRanking, loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import MarchesPublicsClient from "./MarchesPublicsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("marches", yearParam(sp.year));
}

export default async function MarchesPublicsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadMarchesIndex();
  const d = loadMarchesPageData(requestedYear);
  const ranking = loadFournisseursRanking();
  const posts = getPostsForPage("marches-publics");
  return (
    <>
      {parisSectionJsonLd("marches", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <MarchesPublicsClient idx={idx} d={d} ranking={ranking} posts={posts} />
    </>
  );
}
