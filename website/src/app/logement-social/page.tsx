import type { Metadata } from "next";
import "../fusion.css";
import { loadLogementSocialData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import LogementSocialClient from "./LogementSocialClient";

export const metadata: Metadata = {
  title: "Logement social — France Open Data",
  description:
    "Le parc social parisien, la loi SRU et la tension locative. Données publiques reventilées par arrondissement et par bailleur.",
  alternates: { canonical: "/logement-social" },
};

export default async function LogementSocialPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadLogementSocialData(requestedYear);
  const posts = getPostsForPage("logement-social");
  return <LogementSocialClient d={d} posts={posts} />;
}
