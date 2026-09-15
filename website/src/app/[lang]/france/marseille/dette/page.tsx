import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, detteCostOfYear, loadHorsBilan, loadLogementSocialData, loadPatrimoineData, loadPatrimoineStructure } from "@/lib/fusion-data";
import { loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleDetteHub } from "@/lib/seo/sections/marseille";
import DetteClient from "@/app/[lang]/france/paris/dette/DetteClient";

// Marseille shares the Paris debt page with the OFGL outstanding debt (INSEE
// 13055): no detailed balance sheet, no debt structure, no guarantees yet, so
// the page keeps the number, its years and « Comprendre » (P3.2 option a).

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleDetteHub()));
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
  const posts: Parameters<typeof DetteClient>[0]["posts"] = [];
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("marseille", d.year)),
    logement: safe(() => { const l = loadLogementSocialData(undefined, "marseille"); return l.stockTotal > 0 ? { total: l.stockTotal } : null; }),
    next: safe(() => ({ count: loadPlacesIndex().length })),
  };
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleDetteHub()} locale={locale} />
      <DetteClient d={d} structure={structure} horsBilan={horsBilan} posts={posts} cost={safe(() => detteCostOfYear("marseille", d.year))} costSeries={d.availableYears.map((y) => { const c = safe(() => detteCostOfYear("marseille", y)); return { year: y, amount: c ? c.interets + c.remboursement : 0 }; })} doors={doors} />
    </>
  );
}
