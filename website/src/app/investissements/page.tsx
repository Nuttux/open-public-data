import type { Metadata } from "next";
import "../fusion.css";
import { loadInvestissementsData } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import InvestissementsClient from "./InvestissementsClient";

export const metadata: Metadata = {
  title: "Investissements — France Open Data",
  description:
    "Les chantiers de Paris en un coup d'œil : projets, budgets, arrondissements. Investissements extraits des comptes administratifs et classifiés.",
  alternates: { canonical: "/investissements" },
};

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
