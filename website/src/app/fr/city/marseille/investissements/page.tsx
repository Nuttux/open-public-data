import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadInvestissementsData } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleInvestissementsHub } from "@/lib/seo/sections/marseille";
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
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleInvestissementsHub()));
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
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleInvestissementsHub()} locale={locale} />
      <InvestissementsClient d={d} posts={[]} enableDrilldowns={false} />
    </>
  );
}
