import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadFournisseursRanking, loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MarchesPublicsClient from "./MarchesPublicsClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Paris — Marchés publics",
    description:
      "Contrats attribués par la Ville de Paris : titulaires, catégories CPV, volumes. Enveloppes pluriannuelles, pas des dépenses annuelles.",
    en: {
      title: "Paris — Public contracts",
      description:
        "Contracts awarded by the Ville de Paris: contractors, CPV categories, volumes. Multi-year envelopes, not annual spend.",
    },
    path: "/fr/city/paris/marches",
  });
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
  return <MarchesPublicsClient idx={idx} d={d} ranking={ranking} posts={posts} />;
}
