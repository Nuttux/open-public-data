/**
 * Server-side loader for the Marseille landing numbers. Kept apart from the
 * (client-safe) model builder so the fusion-data node:fs reads never bundle
 * into the client — the page passes the plain result to MarseilleLandingClient.
 */
import { loadBudgetIndex, loadBudgetPageData } from "@/lib/fusion-data";
import { readDataJsonOrNull } from "@/lib/data/read";
import { cityPopulation } from "@/lib/methodology";
import type { MarseilleLandingData } from "@/lib/marseille/marseille-landing-model";

// Marseille's money data (budget/subventions/marchés) lives at the un-prefixed
// `marseille/` namespace, like Paris at root — France still routes via
// cityJsonPath, not the registry's forward-looking `fr/marseille` (ADR-0010 D3).
// (The new places directory is the exception, at `fr/marseille/`.)
const NS = "marseille";

type BenefRow = { beneficiaire: string; montant_total: number };
type BenefFile = { year: number; data: BenefRow[] };
type PlaceSubv = { beneficiaire: string; montant_total: number };
type PlacesFile = { places: { slug: string; subvention: PlaceSubv | null }[] };
type TreemapRow = { thematique: string; montant_total: number };
type TreemapFile = { data: TreemapRow[] };

export function loadMarseilleLandingData(): MarseilleLandingData {
  const pop = cityPopulation("marseille");

  const budIdx = loadBudgetIndex("marseille");
  const budYear = budIdx.latestYear ?? budIdx.availableYears[0];
  const totalDep = loadBudgetPageData(budYear, "marseille").depenses;

  const subvIdx = readDataJsonOrNull<{ availableYears: number[] }>(
    `${NS}/subventions/index.json`,
  );
  const subvYear = subvIdx?.availableYears?.[0];

  const benef = subvYear
    ? readDataJsonOrNull<BenefFile>(`${NS}/subventions/beneficiaires_${subvYear}.json`)
    : null;
  const topBenef = (benef?.data ?? [])
    .slice()
    .sort((a, b) => b.montant_total - a.montant_total)
    .slice(0, 12)
    .map((r) => ({ name: r.beneficiaire, montant: r.montant_total }));

  const marIdx = readDataJsonOrNull<{ totalsByYear: Record<string, { nb_marches: number }> }>(
    `${NS}/marches-publics/index.json`,
  );
  const marYear = marIdx ? Object.keys(marIdx.totalsByYear).sort().reverse()[0] : undefined;
  const nbMarches = marYear ? marIdx!.totalsByYear[marYear].nb_marches : 0;

  // Featured deck entities — the place↔grant crosswalk (Friche, La Criée) lives
  // in the places directory; the Culture theme total in the treemap. All at the
  // forward-looking fr/marseille namespace where the places data lives.
  const places = readDataJsonOrNull<PlacesFile>("fr/marseille/places.json");
  const subvFor = (slug: string) => {
    const sv = places?.places.find((p) => p.slug === slug)?.subvention;
    return sv ? { name: sv.beneficiaire, montant: sv.montant_total } : null;
  };
  const treemap = subvYear
    ? readDataJsonOrNull<TreemapFile>(`${NS}/subventions/treemap_${subvYear}.json`)
    : null;
  const cultureMontant =
    treemap?.data.find((r) => r.thematique === "Culture")?.montant_total ?? null;

  return {
    budYear,
    totalDep,
    pop,
    nbMarches,
    topBenef,
    friche: subvFor("friche-belle-de-mai"),
    criee: subvFor("la-criee"),
    cultureMontant,
  };
}
