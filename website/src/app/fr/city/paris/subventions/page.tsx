import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadQuiRecoitData, loadQuiRecoitIndex } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import QuiRecoitClient from "./QuiRecoitClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Qui reçoit l'argent public ? — France Open Data",
    description:
      "Subventions versées par la Ville de Paris : bénéficiaires, thématiques, évolution. Données publiées en open data, reventilées et classifiées.",
    en: {
      title: "Who receives public money? — France Open Data",
      description:
        "Grants paid by the Ville de Paris: beneficiaries, themes, trends. Open-data figures reaggregated and classified.",
    },
    path: "/fr/city/paris/subventions",
  });
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
  return <QuiRecoitClient idx={idx} d={d} posts={posts} />;
}
