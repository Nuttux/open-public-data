import type { Metadata } from "next";
import "../fusion.css";
import { loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
import MarchesPublicsClient from "./MarchesPublicsClient";

export const metadata: Metadata = {
  title: "Marchés publics — France Open Data",
  description:
    "Contrats attribués par la Ville de Paris : titulaires, catégories CPV, volumes. Enveloppes pluriannuelles, pas des dépenses annuelles.",
  alternates: { canonical: "/marches-publics" },
};

export default async function MarchesPublicsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadMarchesIndex();
  const d = loadMarchesPageData(requestedYear);
  return <MarchesPublicsClient idx={idx} d={d} />;
}
