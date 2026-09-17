import type { Metadata } from "next";
import "@/app/fusion.css";

import LieuxClient, { type LieuxCity } from "@/app/[lang]/france/paris/lieux/LieuxClient";
import { marseilleLieuxIndex, marseilleLieuxSection } from "@/lib/marseille/marseille-lieux-section";
import { loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { budgetDoorTotal, loadInvestLatestCity, subventionsYearTotal } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleLieuxHub } from "@/lib/seo/sections/marseille";

// Marseille's Lieux on the section grammar (2026-09-17) : the Paris client,
// fed by places.json. The money is what the Ville paid each place's operator
// in grants, 2017 to 2022 ; the fiches stay Marseille's own.

const MARSEILLE_LIEUX: LieuxCity = {
  slug: "marseille",
  base: "/france/marseille",
  name: "Marseille",
  seeds: ["MuCEM", "Friche", "Vieux-Port"],
  arrMax: 16,
  archive: false,
  // The commune, sea to hills ; the 12 places sit in its centre and north.
  bounds: [[43.21, 5.32], [43.36, 5.48]],
  sources: [
    { label: "data.gouv.fr", href: "https://www.data.gouv.fr/fr/datasets/subventions-versees-aux-associations-1/" },
    { label: "Wikimedia Commons", href: "https://commons.wikimedia.org/" },
  ],
  json: "/data/fr/marseille/places.json",
};

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleLieuxHub()));
}

export default async function LieuxPage({ searchParams }: { searchParams: Promise<{ famille?: string; arrondissement?: string }> }) {
  const sp = await searchParams;
  const places = loadPlacesIndex();
  const lieux = marseilleLieuxIndex(places);
  const section = marseilleLieuxSection(places);
  const locale = await readLocale();
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const thisYear = new Date().getFullYear();
  const doors = {
    invest: safe(() => loadInvestLatestCity("marseille")),
    subventions: safe(() => subventionsYearTotal("marseille", thisYear)),
    next: safe(() => budgetDoorTotal("marseille", thisYear)),
  };
  const arr = sp.arrondissement ? Number(sp.arrondissement) : null;
  return (
    <>
      <FrHubJsonLd hub={marseilleLieuxHub()} locale={locale} />
      <LieuxClient lieux={lieux} section={section} doors={doors} city={MARSEILLE_LIEUX} initial={{ famille: sp.famille ?? null, arr: arr != null && Number.isFinite(arr) ? arr : null }} />
    </>
  );
}
