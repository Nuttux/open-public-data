import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { getCityOrNull, hasDedicatedRoutes, listCities, listCitySlugs } from "@/lib/cities";
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
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import CityClient from "./CityClient";
import CitySlimClient from "./CitySlimClient";
import PageVilleClient from "./PageVilleClient";
import { loadPageVille } from "./page-ville-data";

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
      title: `${cityRich.nom} : budget, dette et fiscalité de la commune`,
      description: `Combien ${cityRich.nom} (${cityRich.reg_name}) dépense, encaisse et doit, année par année depuis 2014. Source : données OFGL harmonisées.`,
      en: {
        title: `${cityRich.nom}: the town's budget, debt and taxes`,
        description: `How much ${cityRich.nom} (${cityRich.reg_name}) spends, collects and owes, year by year since 2014. Source: OFGL harmonised data.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  // Tail commune (slim page)
  const slim = findCommuneByAny(slug);
  if (slim) {
    return buildLocaleAwareMetadata({
      title: `Combien dépense ${slim.nom} ? Budget, dette et marchés de la commune (${slim.dep_name})`,
      description: `Ce que ${slim.nom} (${slim.dep_name}, ${slim.reg_name}) dépense et encaisse, ce qu'elle construit, ce qu'elle doit, ce qu'elle achète, et sa position face aux communes de même taille. Sources : DGFiP, OFGL, DECP.`,
      en: {
        title: `How much does ${slim.nom} spend? The town's budget, debt and contracts (${slim.dep_name})`,
        description: `What ${slim.nom} (${slim.dep_name}, ${slim.reg_name}) spends and collects, what it builds, what it owes, what it buys, and where it stands among towns of the same size. Sources: DGFiP, OFGL, DECP.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  // A real 404 (thrown before streaming), not a page titled "not found".
  notFound();
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;

  // Branch 1: villes à routes dédiées (Paris, Marseille). Les autres villes du
  // registre (Lyon…) ont la page ville comme toute commune.
  const cityRich = getCityOrNull(slug);
  if (cityRich && hasDedicatedRoutes(slug)) {
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
    // La page ville (bloc 2, 2026-09-09) : dès que la commune a un budget par
    // nature, l'entrée unique est cette page — six écrans, sections à gates.
    // Sinon, la page mince (OFGL seul).
    const caps = getCommuneCapabilities(slim.slug);
    if (caps.budget.nature) {
      const sp = await searchParams;
      const locale = await readLocale();
      const pv = await loadPageVille(slim.slug, sp.year ? Number(sp.year) : undefined, locale === "en");
      if (pv) return <PageVilleClient {...pv} />;
    }
    return (
      <CitySlimClient
        entry={slim}
        year={src.year}
        source={src.source}
        sourceUrl={src.source_url}
        labels={labels}
      />
    );
  }

  notFound();
}
