import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadLogementSocialData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleLogementHub } from "@/lib/seo/sections/marseille";
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
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleLogementHub()));
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
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleLogementHub()} locale={locale} />
      <LogementSocialClient sruArr={null} d={d} posts={posts} />
    </>
  );
}
