import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, loadInvestissementsData, marchesDoorTotal, subventionsYearTotal } from "@/lib/fusion-data";
import { loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleInvestissementsHub } from "@/lib/seo/sections/marseille";
import InvestissementsClient from "@/app/[lang]/france/paris/investissements/InvestissementsClient";

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
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("marseille", d.year)),
    marches: safe(() => marchesDoorTotal("marseille", d.year)),
    next: safe(() => subventionsYearTotal("marseille", d.year)),
    lieux: safe(() => ({ count: loadPlacesIndex().length })),
  };
  return (
    <>
      <FrHubJsonLd hub={marseilleInvestissementsHub()} locale={locale} />
      <InvestissementsClient d={d} posts={[]} doors={doors} enableDrilldowns={false} />
    </>
  );
}
