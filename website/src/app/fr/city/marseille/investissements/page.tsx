import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadInvestissementsData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import InvestissementsClient from "@/app/fr/city/paris/investissements/InvestissementsClient";

// Marseille investissements — reuses the Paris InvestissementsClient (now
// city-aware). Data from the CA presentation PDFs (cf. docs/marseille-data-
// inventory.md section E + pipeline/scripts/poc/generate_marseille_
// investissements_stub.py). The shared client renders the universal
// DistrictChoropleth (Marseille geometry) via CityChoropleth.
//
// Limites POC connues :
//   - 1-2 années (2023, 2024) seulement
//   - Granularité arrondissement (pas adresse)
//   - Pas de photos / vulgarisations dédiées par projet
//   - Drill-down chapitre/projet/arrondissement pas encore construits →
//     enableDrilldowns=false : la barre par thème filtre sur place (?theme=),
//     cartes et tuiles non-cliquables (jamais de 404). P3.2 option a.

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Investissements de Marseille",
    description:
      "Projets d'investissement de la Ville de Marseille classés par thématique et arrondissement. Source : rapports de présentation des comptes administratifs (PDF marseille.fr).",
    en: {
      title: "Marseille investments",
      description:
        "Ville de Marseille investment projects, classified by theme and district. Source: administrative account presentation reports (PDF marseille.fr).",
    },
    path: "/fr/city/marseille/investissements",
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
  return <InvestissementsClient d={d} posts={[]} enableDrilldowns={false} />;
}
