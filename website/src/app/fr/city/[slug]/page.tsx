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
import { loadCommuneBudget } from "@/lib/commune-budget";
import CityClient from "./CityClient";
import CitySlimClient from "./CitySlimClient";
import CommuneBudgetClient from "./budget/CommuneBudgetClient";

const COMMUNE_BUDGET_SOURCE_URL =
  "https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-communes-en-2024/";

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
      title: `${cityRich.nom} — Finances locales`,
      description: `Budget, dette, fiscalité de la commune de ${cityRich.nom} (${cityRich.code_insee}, ${cityRich.reg_name}). Données OFGL harmonisées 2014-aujourd'hui.`,
      en: {
        title: `${cityRich.nom} — Local finances`,
        description: `Budget, debt, taxation of ${cityRich.nom} (${cityRich.code_insee}, ${cityRich.reg_name}). OFGL harmonised data 2014-present.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  // Tail commune (slim page)
  const slim = findCommuneByAny(slug);
  if (slim) {
    return buildLocaleAwareMetadata({
      title: `${slim.nom} (${slim.dep_name}) — Finances locales`,
      description: `Budget, dette, fiscalité de la commune de ${slim.nom} (INSEE ${slim.insee}, ${slim.reg_name}). Données OFGL.`,
      en: {
        title: `${slim.nom} (${slim.dep_name}) — Local finances`,
        description: `Budget, debt, taxation of ${slim.nom} (INSEE ${slim.insee}, ${slim.reg_name}). OFGL data.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  return { title: "Page non trouvée" };
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
    // Data-derived: if the commune has a budget-by-nature export, the landing
    // page LEADS with the rich breakdown (+ an OFGL financial-health strip),
    // instead of the thin summary. (National capability matrix.)
    const caps = getCommuneCapabilities(slim.slug);
    if (caps.budget.nature) {
      const loaded = await loadCommuneBudget(slim.slug);
      if (loaded) {
        const dette = slim.kpis?.encours_dette;
        const epargne = slim.kpis?.epargne_brute;
        const capaciteDesend =
          dette?.montant && epargne?.montant && epargne.montant > 0
            ? dette.montant / epargne.montant
            : null;
        return (
          <CommuneBudgetClient
            commune={{
              slug: slim.slug,
              insee: slim.insee,
              nom: slim.nom,
              dep_name: slim.dep_name,
              reg_name: slim.reg_name,
              pop: slim.pop,
            }}
            data={loaded.data}
            availableYears={loaded.availableYears}
            year={loaded.year}
            hasFonction={caps.budget.fonction}
            sourceUrl={COMMUNE_BUDGET_SOURCE_URL}
            health={{
              detteEurHab: dette?.eur_hab ?? null,
              epargneBrute: epargne?.montant ?? null,
              capaciteDesend,
              year: src.year,
            }}
            marchesHref={caps.marches ? `/fr/city/${slim.slug}/marches` : undefined}
            investissementsHref={
              caps.investissements ? `/fr/city/${slim.slug}/investissements` : undefined
            }
            evolutionHref={caps.evolution ? `/fr/city/${slim.slug}/evolution` : undefined}
            comparaisonHref={
              caps.comparaison ? `/fr/city/${slim.slug}/comparaison` : undefined
            }
          />
        );
      }
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
