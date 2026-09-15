import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadMarchesIndex, loadMarchesPageData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleMarchesHub } from "@/lib/seo/sections/marseille";
import MarchesPublicsClient from "@/app/[lang]/france/paris/marches/MarchesPublicsClient";

// POC v1 Marseille marches — réutilise MarchesPublicsClient avec data Marseille.
// Le client dérive la ville de l'URL (CityProvider) : liste, filtres, année et
// fiches contrat/fournisseur restent dans /fr/city/marseille (routes créées).
// Limites POC connues :
//   - Une seule année (2020) — Marseille SCDL Ville n'expose que 2020
//   - Pas d'enrichissement DECP (pas de offresRecues, pas de procédure normalisée)
//   - Backfill DECP national 2021+ = phase 2 (voir index.json note)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleMarchesHub()));
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
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleMarchesHub()} locale={locale} />
      <MarchesPublicsClient idx={idx} d={d} />
    </>
  );
}
