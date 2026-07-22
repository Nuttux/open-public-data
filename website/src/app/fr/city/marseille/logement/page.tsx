import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadLogementSocialData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import LogementSocialClient from "@/app/fr/city/paris/logement/LogementSocialClient";

// POC v1 Marseille — réutilise LogementSocialClient Paris avec data Marseille.
// Limites POC connues (P3.2 option a — sections disparaissent silencieusement) :
//   - Pas de section §05/§06 Tension : DRIHL est IDF-only et le SNE national
//     ne publie pas de CSV exploitable (portail web uniquement).
//   - Pas de drill-down par arrondissement (routes /arrondissement/[arr]
//     non créées en POC). Le choropleth Paris reste Paris-only — on remplace
//     par une vue barres horizontales pour Marseille.
//   - Pas de drill-down par bailleur (cards rendues comme blocs simples,
//     pas de routes /dette/bailleur/[slug] côté Marseille).
//   - yearsSummary = stock SRU annuel (pas un flux "logements financés / an" :
//     le RPLS est un état du parc, pas un flux de production).

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Logement social à Marseille",
    description:
      "Le parc social marseillais : taux SRU, parc par arrondissement, principaux bailleurs. Source : Métropole Aix-Marseille-Provence (RPLS atlas + sru-taux).",
    en: {
      title: "Marseille social housing",
      description:
        "Marseille's social-housing stock: SRU rate, stock per arrondissement, main social landlords. Source: Aix-Marseille-Provence Métropole (RPLS atlas + sru-taux).",
    },
    path: "/fr/city/marseille/logement",
  });
}

export default async function LogementSocialMarseillePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadLogementSocialData(requestedYear, "marseille");
  // No Marseille-specific blog posts yet — empty list filters out the
  // RelatedArticles section (handled inside LogementSocialClient).
  const posts: Parameters<typeof LogementSocialClient>[0]["posts"] = [];
  return <LogementSocialClient sruArr={null} d={d} posts={posts} />;
}
