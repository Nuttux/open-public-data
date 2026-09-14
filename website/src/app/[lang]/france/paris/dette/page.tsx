import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadPatrimoineData, loadPatrimoineStructure, loadHorsBilan, loadHorsBilanTrajectory, loadCitiesDebtSnapshot } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata, yearParam } from "@/lib/seo/sections/paris";
import DettePatrimoineClient from "./DettePatrimoineClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return parisSectionMetadata("dette", yearParam(sp.year));
}

export default async function DettePatrimoinePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadPatrimoineData(requestedYear);
  const structure = loadPatrimoineStructure(d.year);
  const horsBilan = loadHorsBilan(d.year);
  const horsBilanTrajectory = loadHorsBilanTrajectory(d.yearsSummary.map((y) => y.year));
  const citiesSnapshot = loadCitiesDebtSnapshot(d.year);
  const posts = getPostsForPage("dette-patrimoine");
  return (
    <>
      {parisSectionJsonLd("dette", await readLocale(), requestedYear).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <DettePatrimoineClient
        d={d}
        structure={structure}
        horsBilan={horsBilan}
        horsBilanTrajectory={horsBilanTrajectory}
        citiesSnapshot={citiesSnapshot}
        posts={posts}
      />
    </>
  );
}
