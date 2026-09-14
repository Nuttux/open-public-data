import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadInvestLatest, loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
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
  searchParams: Promise<{ year?: string; scene?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  // Two renderings of the scene to compare (2026-09-14): bars, or the mosaic
  // with the bars folded under it. `?scene=mosaique` picks the second.
  const variant = sp.scene === "mosaique" ? "mosaic" : "bars";
  const idx = loadMarchesIndex();
  const d = loadMarchesPageData(requestedYear);
  const invest = loadInvestLatest();
  return (
    <>
      {parisSectionJsonLd("marches", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <MarchesPublicsClient idx={idx} d={d} doors={{ invest }} variant={variant} />
    </>
  );
}
