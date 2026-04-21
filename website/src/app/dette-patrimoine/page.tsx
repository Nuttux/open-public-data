import type { Metadata } from "next";
import "../fusion.css";
import { loadPatrimoineData, loadPatrimoineStructure } from "@/lib/fusion-data";
import DettePatrimoineClient from "./DettePatrimoineClient";

export const metadata: Metadata = {
  title: "Dette & patrimoine — France Open Data",
  description:
    "Le bilan consolidé de la Ville de Paris : actif, passif, dette, fonds propres. Règle d'or et garde-fous d'équilibre.",
  alternates: { canonical: "/dette-patrimoine" },
};

export default async function DettePatrimoinePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadPatrimoineData(requestedYear);
  const structure = loadPatrimoineStructure(d.year);
  return <DettePatrimoineClient d={d} structure={structure} />;
}
