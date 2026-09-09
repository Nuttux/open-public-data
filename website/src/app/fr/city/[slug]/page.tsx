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
import { loadCommuneBudget } from "@/lib/commune-budget";
import { deNom } from "@/lib/nom-commune";

/** « 213,9 M€ », « 386 k€ » — les mêmes unités que la page, pour le titre. */
function fmtEur(eur: number, locale: "fr" | "en"): string {
  const tag = locale === "en" ? "en-GB" : "fr-FR";
  const a = Math.abs(eur);
  if (a >= 1e9) return `${(eur / 1e9).toLocaleString(tag, { maximumFractionDigits: 2 })} Md€`;
  if (a >= 1e6) return `${(eur / 1e6).toLocaleString(tag, { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${Math.round(eur / 1e3).toLocaleString(tag)} k€`;
  return `${Math.round(eur).toLocaleString(tag)} €`;
}
import CityClient from "./CityClient";
import CitySlimClient from "./CitySlimClient";
import PageVilleClient from "./PageVilleClient";
import { loadPageVille } from "./page-ville-data";
import { loadPageVilleRiche } from "./page-ville-riche-data";
import VilleRicheClient from "./VilleRicheClient";

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
      title: `Budget ${deNom(cityRich.nom)} : combien dépense la Ville ? Dépenses, subventions, marchés, dette, lieux`,
      description: `Ce que ${cityRich.nom} dépense par politique publique, ce qu'elle construit, ce qu'elle doit, les associations qu'elle soutient, ce qu'elle achète, ses lieux, et sa position face aux grandes villes. Sources : la Ville, OFGL, DECP.`,
      en: {
        title: `${cityRich.nom} budget: how much does the City spend? Spending, grants, contracts, debt, places`,
        description: `What ${cityRich.nom} spends by public policy, what it builds, what it owes, the associations it supports, what it buys, its places, and where it stands among big cities. Sources: the City, OFGL, DECP.`,
      },
      path: `/fr/city/${slug}`,
    });
  }
  // Tail commune (slim page)
  const slim = findCommuneByAny(slug);
  if (slim) {
    // Le titre répond à la question avec les chiffres de la page elle-même
    // (SEO / moteurs de réponse) : « Budget de Pantin : 213,9 M€ dépensés en
    // 2024, 3 509 € par habitant ». Même fichier que la page, mémoïsé.
    const bud = getCommuneCapabilities(slim.slug).budget.nature ? await loadCommuneBudget(slim.slug).catch(() => null) : null;
    if (bud) {
      const y = bud.year;
      const dep = bud.data.depenses;
      const rec = bud.data.recettes;
      const hab = slim.pop > 0 ? Math.round(dep / slim.pop) : null;
      const fr = (n: number) => fmtEur(n, "fr");
      const en = (n: number) => fmtEur(n, "en");
      return buildLocaleAwareMetadata({
        title: `Budget ${deNom(slim.nom)} : ${fr(dep)} dépensés en ${y}${hab != null ? `, ${hab.toLocaleString("fr-FR")} € par habitant` : ""} (${slim.dep_name})`,
        description: `${slim.nom} (${slim.dep_name}, ${slim.reg_name}) a dépensé ${fr(dep)} en ${y}${hab != null ? `, soit ${hab.toLocaleString("fr-FR")} € par habitant` : ""}, pour ${fr(rec)} de recettes. Dette, taxe foncière, investissements et marchés publics, face aux communes de sa taille. Sources : DGFiP, OFGL, DECP, comptes ${y}.`,
        en: {
          title: `${slim.nom} budget: ${en(dep)} spent in ${y}${hab != null ? `, €${hab.toLocaleString("en-GB")} per inhabitant` : ""} (${slim.dep_name})`,
          description: `${slim.nom} (${slim.dep_name}, ${slim.reg_name}) spent ${en(dep)} in ${y}${hab != null ? `, or €${hab.toLocaleString("en-GB")} per inhabitant` : ""}, against ${en(rec)} in revenue. Debt, property tax, investment and public contracts, compared with towns of its size. Sources: DGFiP, OFGL, DECP, ${y} accounts.`,
        },
        path: `/fr/city/${slug}`,
      });
    }
    return buildLocaleAwareMetadata({
      title: `Budget ${deNom(slim.nom)} : combien dépense la commune ? Dépenses, dette, marchés (${slim.dep_name})`,
      description: `Ce que ${slim.nom} (${slim.dep_name}, ${slim.reg_name}) dépense et encaisse, ce qu'elle construit, ce qu'elle doit, ce qu'elle achète, et sa position face aux communes de même taille. Sources : DGFiP, OFGL, DECP.`,
      en: {
        title: `${slim.nom} budget: how much does the town spend? Spending, debt, contracts (${slim.dep_name})`,
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

  // Branch 1 : villes à routes dédiées (Paris, Marseille) — la même page
  // ville que toute commune (bloc 5), alimentée par leurs données propres.
  // Les autres villes du registre (Lyon…) passent par la branche 2.
  const cityRich = getCityOrNull(slug);
  if (cityRich && hasDedicatedRoutes(slug)) {
    const sp = await searchParams;
    const locale = await readLocale();
    const pv = await loadPageVilleRiche(slug, sp.year ? Number(sp.year) : undefined, locale === "en");
    if (pv) return <VilleRicheClient {...pv} />;
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
