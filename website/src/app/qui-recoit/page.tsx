import type { Metadata } from "next";
import "../fusion.css";
import { loadQuiRecoitData, loadQuiRecoitIndex } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import QuiRecoitClient from "./QuiRecoitClient";

export const metadata: Metadata = {
  title: "Qui reçoit l'argent public ? — France Open Data",
  description:
    "Subventions versées par la Ville de Paris : bénéficiaires, thématiques, évolution. Données publiées en open data, reventilées et classifiées.",
  alternates: { canonical: "/qui-recoit" },
};

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
