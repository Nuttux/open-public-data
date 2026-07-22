import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { getCityOrNull, listCities, listCitySlugs } from "@/lib/cities";
import {
  computeCapaciteDesendettement,
  loadCommune,
  loadCommuneMarches,
  loadPeerCities,
} from "@/lib/commune-data";
import {
  findCommuneByAny,
  loadAllCommunesKpiLabels,
  loadAllCommunesSource,
} from "@/lib/all-communes";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import CityClient from "./CityClient";
import CitySlimClient from "./CitySlimClient";

// Statically pre-render only the 9 rich top-N cities (Paris excluded — it
// redirects to /). The thousands of slim "tail" pages are generated on
// demand via Next.js dynamic rendering — keeps the build fast.
export async function generateStaticParams() {
  return listCitySlugs()
    .filter((slug) => slug !== "paris")
    .map((slug) => ({ slug }));
}
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Try rich registry first
  const cityRich = getCityOrNull(slug);
  if (cityRich) {
    return buildLocaleAwareMetadata({
      title: `${cityRich.nom} — Finances locales · France Open Data`,
      description: `Budget, dette, fiscalité de la commune de ${cityRich.nom} (${cityRich.code_insee}, ${cityRich.reg_name}). Données OFGL harmonisées 2014-aujourd'hui.`,
      en: {
        title: `${cityRich.nom} — Local finances · France Open Data`,
        description: `Budget, debt, taxation of ${cityRich.nom} (${cityRich.code_insee}, ${cityRich.reg_name}). OFGL harmonised data 2014-present.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  // Tail commune (slim page)
  const slim = findCommuneByAny(slug);
  if (slim) {
    return buildLocaleAwareMetadata({
      title: `${slim.nom} (${slim.dep_name}) — Finances locales · France Open Data`,
      description: `Budget, dette, fiscalité de la commune de ${slim.nom} (INSEE ${slim.insee}, ${slim.reg_name}). Données OFGL.`,
      en: {
        title: `${slim.nom} (${slim.dep_name}) — Local finances · France Open Data`,
        description: `Budget, debt, taxation of ${slim.nom} (INSEE ${slim.insee}, ${slim.reg_name}). OFGL data.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  return { title: "Page non trouvée — France Open Data" };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Branch 1: rich top 10 (registered in cities.ts)
  const cityRich = getCityOrNull(slug);
  if (cityRich) {
    const data = loadCommune(slug);
    const peers = loadPeerCities(slug);
    const marches = loadCommuneMarches(slug);
    const capDesend = data ? computeCapaciteDesendettement(data) : null;
    const allCities = listCities();
    return (
      <CityClient
        city={cityRich}
        data={data}
        peers={peers}
        marches={marches}
        capDesend={capDesend}
        allCities={allCities}
      />
    );
  }

  // Branch 2: tail commune (slim page from bulk index)
  const slim = findCommuneByAny(slug);
  if (slim) {
    const src = loadAllCommunesSource();
    if (!src) notFound();
    const labels = loadAllCommunesKpiLabels();
    // Data-derived capability — surfaces the budget-by-nature page iff its export
    // exists for this commune. No city list; adding data flips the link on.
    const caps = getCommuneCapabilities(slim.slug);
    return (
      <CitySlimClient
        entry={slim}
        year={src.year}
        source={src.source}
        sourceUrl={src.source_url}
        labels={labels}
        budgetHref={caps.budget.nature ? `/fr/city/${slim.slug}/budget` : undefined}
      />
    );
  }

  notFound();
}
