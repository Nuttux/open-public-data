import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MarchesPublicsClient from "@/app/fr/city/paris/marches/MarchesPublicsClient";

// POC v1 Marseille marches — réutilise MarchesPublicsClient avec data Marseille.
// Limites POC connues :
//   - Une seule année (2020) — Marseille SCDL Ville n'expose que 2020
//   - Pas d'enrichissement DECP (pas de offresRecues, pas de procédure normalisée)
//   - Pas d'articles Marseille (posts: [])
//   - Liens drill-down (contrat/fournisseur) → 404 pour l'instant (routes pas créées)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Marchés publics de Marseille — France Open Data",
    description:
      "Contrats attribués par la Ville de Marseille en 2020 : titulaires, montants, objets et catégories CPV. Source : data.gouv.fr (SCDL Ville).",
    en: {
      title: "Marseille public contracts — France Open Data",
      description:
        "Contracts awarded by the Ville de Marseille in 2020: contractors, amounts, objects, and CPV categories. Source: data.gouv.fr (SCDL Ville).",
    },
    path: "/fr/city/marseille/marches",
  });
}

export default async function MarchesPublicsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadMarchesIndex("marseille");
  const d = loadMarchesPageData(requestedYear, "marseille");
  // No Marseille-specific blog posts yet — empty list filters out the
  // RelatedArticles section (handled inside MarchesPublicsClient).
  const posts: Parameters<typeof MarchesPublicsClient>[0]["posts"] = [];
  return <MarchesPublicsClient ranking={null} idx={idx} d={d} posts={posts} />;
}
