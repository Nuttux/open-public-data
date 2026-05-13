import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadInvestissementsData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MarseilleInvestissementsClient from "./MarseilleInvestissementsClient";

// POC v1 Marseille investissements — uses a dedicated client (not the Paris
// one) for the reasons listed at the top of MarseilleInvestissementsClient.
// Data is parsed from the CA presentation PDFs (cf. docs/marseille-data-
// inventory.md section E + script
// pipeline/scripts/poc/generate_marseille_investissements_stub.py).
//
// Limites POC connues :
//   - 1-2 années (2023, 2024) seulement
//   - Granularité arrondissement (pas adresse)
//   - Pas de géolocalisation lat/lon → pas de carte (P3.2 option a stricte)
//   - Pas de photos / vulgarisations dédiées par projet
//   - Pas de drill-down chapitre/projet (cards non-cliquables)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Investissements de Marseille — France Open Data",
    description:
      "Projets d'investissement de la Ville de Marseille classés par thématique et arrondissement. Source : rapports de présentation des comptes administratifs (PDF marseille.fr).",
    en: {
      title: "Marseille investments — France Open Data",
      description:
        "Ville de Marseille investment projects, classified by theme and district. Source: administrative account presentation reports (PDF marseille.fr).",
    },
    path: "/ville/marseille/investissements",
  });
}

type SP = { year?: string };

export default async function InvestissementsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadInvestissementsData(requestedYear, "marseille");
  return <MarseilleInvestissementsClient d={d} />;
}
