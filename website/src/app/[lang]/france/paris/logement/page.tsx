import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadLogementSocialData, loadSruArrondissements } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import LogementSocialClient from "./LogementSocialClient";

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
  return (
    <>
      {parisSectionJsonLd("logement", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <LogementSocialClient d={d} sruArr={sruArr} posts={posts} />
    </>
  );
}
