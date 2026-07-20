import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadInvestissementsData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import InvestissementsClient from "./InvestissementsClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Investissements — France Open Data",
    description:
      "Les chantiers de Paris en un coup d'œil : projets, budgets, arrondissements. Investissements extraits des comptes administratifs et classifiés.",
    en: {
      title: "Investments — France Open Data",
      description:
        "Paris construction projects at a glance: projects, budgets, districts. Investments extracted from the administrative accounts and classified.",
    },
    path: "/fr/city/paris/investissements",
  });
}

export default async function InvestissementsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadInvestissementsData(requestedYear);
  const posts = getPostsForPage("investissements");
  return <InvestissementsClient d={d} posts={posts} />;
}
