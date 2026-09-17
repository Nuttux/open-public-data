import type { Metadata } from "next";
import "@/app/fusion.css";
import LieuxClient from "./LieuxClient";
import { loadLieuxIndex, loadLieuxSection } from "@/lib/lieux-data";
import { budgetDoorTotal, loadInvestLatest, subventionsYearTotal } from "@/lib/fusion-data";
import { frLieuxDoors } from "@/lib/lieux-doors";
import { readLocale } from "@/lib/seo";
import { parisSectionJsonLd, parisSectionMetadata } from "@/lib/seo/sections/paris";

export async function generateMetadata(): Promise<Metadata> {
  return parisSectionMetadata("lieux");
}

/**
 * Lieux, on the section grammar (2026-09-16). The address can carry a family
 * or an arrondissement (?famille=culture, ?arrondissement=18): the fiche
 * kickers and the scene rows link here, the list opens filtered.
 */
export default async function LieuxPage({ searchParams }: { searchParams: Promise<{ famille?: string; arrondissement?: string }> }) {
  const sp = await searchParams;
  const lieux = loadLieuxIndex();
  const section = loadLieuxSection();
  const locale = await readLocale();
  // The doors carry a number: the latest investment year, the latest subsidies year, the budget of the next section.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const thisYear = new Date().getFullYear();
  const doors = frLieuxDoors("/france/paris", {
    invest: safe(() => loadInvestLatest()),
    subventions: safe(() => subventionsYearTotal("paris", thisYear)),
    next: safe(() => budgetDoorTotal("paris", thisYear)),
  });
  return (
    <>
      {parisSectionJsonLd("lieux", locale).map((o, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />
      ))}
      <LieuxClient lieux={lieux} section={section} doors={doors} initial={{ famille: sp.famille ?? null, area: sp.arrondissement ?? null }} />
    </>
  );
}
