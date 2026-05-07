import type { Metadata } from "next";
import "@/app/fusion.css";
import {
  loadPatrimoineData,
  loadPatrimoineStructure,
  loadHorsBilan,
  loadHorsBilanTrajectory,
  loadCitiesDebtSnapshot,
} from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import DettePatrimoineClient from "@/app/ville/paris/dette/DettePatrimoineClient";

// POC v1 Marseille dette/patrimoine — réutilise DettePatrimoineClient Paris
// avec data Marseille issue de l'agrégat OFGL national (code INSEE 13055).
// Limites POC connues (P3.2 option a — la section disparait silencieusement) :
//   - Pas de bilan détaillé Actif/Passif (CA M57 row-level pas encore intégré)
//     → BilanBoard / PatrimoineDrillList absents
//   - Pas de structure dette qualitative (split obligataire/bancaire/divers)
//     → DetteStructurePanel absent
//   - Pas de hors-bilan (RPLS national pas encore croisé pour Marseille)
//     → section hors-bilan absente
//   - Pas de série CRC (Marseille n'a qu'un rapport ponctuel "Marseille en
//     Grand" 2024) → snapshot CRC = null, hook "deux lectures" disparait
//   - Pas d'articles éditoriaux Marseille → posts vide
//   - Pas de drill-down bailleur Marseille → routes /bailleur skipées du POC

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Dette de Marseille — France Open Data",
    description:
      "Encours de dette et trajectoire financière de la Ville de Marseille. Source : OFGL (base consolidée des communes).",
    en: {
      title: "Marseille debt — France Open Data",
      description:
        "Debt outstanding and financial trajectory of the Ville de Marseille. Source: OFGL (consolidated communes dataset).",
    },
    path: "/ville/marseille/dette",
  });
}

export default async function MarseilleDettePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadPatrimoineData(requestedYear, "marseille");
  const structure = loadPatrimoineStructure(d.year, "marseille");
  const horsBilan = loadHorsBilan(d.year, "marseille");
  const horsBilanTrajectory = loadHorsBilanTrajectory(
    d.yearsSummary.map((y) => y.year),
    "marseille",
  );
  const citiesSnapshot = loadCitiesDebtSnapshot(d.year);
  // No Marseille-specific blog posts yet — empty list filters out the
  // RelatedArticles section (placeholders rendered as preview only).
  const posts: Parameters<typeof DettePatrimoineClient>[0]["posts"] = [];
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
