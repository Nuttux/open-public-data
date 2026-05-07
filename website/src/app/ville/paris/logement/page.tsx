import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadLogementSocialData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import LogementSocialClient from "./LogementSocialClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Logement social — France Open Data",
    description:
      "Le parc social parisien, la loi SRU et la tension locative. Données publiques reventilées par arrondissement et par bailleur.",
    en: {
      title: "Social housing — France Open Data",
      description:
        "The Paris social-housing stock, the SRU law, and rental pressure. Public data reaggregated by arrondissement and operator.",
    },
    path: "/ville/paris/logement",
  });
}

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
