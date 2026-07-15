import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadPatrimoineData, loadPatrimoineStructure, loadHorsBilan, loadHorsBilanTrajectory, loadCitiesDebtSnapshot } from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import DettePatrimoineClient from "./DettePatrimoineClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Dette & patrimoine — France Open Data",
    description:
      "Le bilan consolidé de la Ville de Paris : actif, passif, dette, fonds propres. Règle d'or et garde-fous d'équilibre.",
    en: {
      title: "Debt & assets — France Open Data",
      description:
        "The Ville de Paris consolidated balance sheet: assets, liabilities, debt, equity. Golden rule and balance safeguards.",
    },
    path: "/fr/city/paris/dette",
  });
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
    <DettePatrimoineClient
      d={d}
      structure={structure}
      horsBilan={horsBilan}
      horsBilanTrajectory={horsBilanTrajectory}
      citiesSnapshot={citiesSnapshot}
      posts={posts}
    />
  );
}
