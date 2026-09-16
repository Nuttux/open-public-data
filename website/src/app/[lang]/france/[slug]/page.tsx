import { permanentRedirectLocalized } from "@/lib/redirect-server";
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
import { loadCommuneEvolution } from "@/lib/commune-evolution";
import { loadTaux } from "@/lib/commune-taux";
import { deNom } from "@/lib/nom-commune";
import { communeAlias } from "@/lib/commune-aliases";

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
import CommuneHomonymes, { homonymesOf } from "./CommuneHomonymes";

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
  // Les villes à routes dédiées (Paris, Marseille) gardent leur titre riche.
  // Les autres villes du registre (Lyon, Nice…) rendent la page ville comme
  // toute commune : leur titre porte les chiffres, ci-dessous.
  const cityRich = getCityOrNull(slug);
  if (cityRich && hasDedicatedRoutes(slug)) {
    return buildLocaleAwareMetadata({
      title: `Budget ${deNom(cityRich.nom)} : combien dépense la Ville ? Dépenses, subventions, marchés, dette, lieux`,
      description: `Ce que ${cityRich.nom} dépense par politique publique, ce qu'elle construit, ce qu'elle doit, les associations qu'elle soutient, ce qu'elle achète, ses lieux, et sa position face aux grandes villes. Sources : la Ville, OFGL, DECP.`,
      en: {
        title: `${cityRich.nom} budget: how much does the City spend? Spending, grants, contracts, debt, places`,
        description: `What ${cityRich.nom} spends by public policy, what it builds, what it owes, the associations it supports, what it buys, its places, and where it stands among big cities. Sources: the City, OFGL, DECP.`,
      },
      path: `/france/${slug}`,
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
      // The title is the page's own question with its number, under 60
      // characters (the old one ran to 90 and Google cut it before the
      // per-inhabitant figure). The description carries the debt and the
      // property-tax rate the page also answers.
      const evo = await loadCommuneEvolution(slim.slug).catch(() => null);
      const detteHab = evo?.series.length ? evo.series[evo.series.length - 1].dette_hab ?? null : null;
      const tfb = loadTaux(slim.insee)?.tfb ?? null;
      const rate = (x: number, l: "fr-FR" | "en-GB") => x.toLocaleString(l, { maximumFractionDigits: 2 });
      const frBits = [
        detteHab != null ? `dette ${Math.round(detteHab).toLocaleString("fr-FR")} € par habitant` : null,
        tfb != null ? `taxe foncière ${rate(tfb, "fr-FR")} %` : null,
      ].filter(Boolean).join(", ");
      const enBits = [
        detteHab != null ? `debt €${Math.round(detteHab).toLocaleString("en-GB")} per inhabitant` : null,
        tfb != null ? `property tax ${rate(tfb, "en-GB")}%` : null,
      ].filter(Boolean).join(", ");
      return buildLocaleAwareMetadata({
        title: `Budget ${deNom(slim.nom)} : ${fr(dep)} en ${y}${hab != null ? `, ${hab.toLocaleString("fr-FR")} € par habitant` : ""}`,
        description: `${slim.nom} (${slim.dep_name}) a dépensé ${fr(dep)} en ${y}${hab != null ? `, ${hab.toLocaleString("fr-FR")} € par habitant` : ""}, pour ${fr(rec)} de recettes${frBits ? ` ; ${frBits}` : ""}. Ce qu'elle construit et achète, face aux communes de sa taille. Sources : DGFiP, OFGL, DECP, comptes ${y}.`,
        en: {
          title: `${slim.nom} budget: ${en(dep)} in ${y}${hab != null ? `, €${hab.toLocaleString("en-GB")} per inhabitant` : ""}`,
          description: `${slim.nom} (${slim.dep_name}) spent ${en(dep)} in ${y}${hab != null ? `, €${hab.toLocaleString("en-GB")} per inhabitant` : ""}, against ${en(rec)} in revenue${enBits ? `; ${enBits}` : ""}. What it builds and buys, compared with towns of its size. Sources: DGFiP, OFGL, DECP, ${y} accounts.`,
        },
        path: `/france/${slug}`,
      });
    }
    return buildLocaleAwareMetadata({
      title: `Budget ${deNom(slim.nom)} : combien dépense la commune ? Dépenses, dette, marchés (${slim.dep_name})`,
      description: `Ce que ${slim.nom} (${slim.dep_name}, ${slim.reg_name}) dépense et encaisse, ce qu'elle construit, ce qu'elle doit, ce qu'elle achète, et sa position face aux communes de même taille. Sources : DGFiP, OFGL, DECP.`,
      en: {
        title: `${slim.nom} budget: how much does the town spend? Spending, debt, contracts (${slim.dep_name})`,
        description: `What ${slim.nom} (${slim.dep_name}, ${slim.reg_name}) spends and collects, what it builds, what it owes, what it buys, and where it stands among towns of the same size. Sources: DGFiP, OFGL, DECP.`,
      },
      path: `/france/${slug}`,
    });
  }
  // Nom partagé par plusieurs communes : la page du choix, hors index. (Les
  // noms à commune dominante sont redirigés par proxy.ts ; filet ici.)
  const alias = communeAlias(slug);
  if (alias?.kind === "redirect") await permanentRedirectLocalized(`/france/${alias.to}`);
  if (alias?.kind === "choose") {
    const cs = homonymesOf(alias.slugs);
    const nom = cs[0]?.nom ?? slug;
    const liste = cs.map((c) => `${c.nom} (${c.dep_name})`).join(", ");
    const meta = await buildLocaleAwareMetadata({
      title: `${nom} : ${cs.length} communes portent ce nom`,
      description: `Plusieurs communes françaises s'appellent ${nom} : ${liste}. Choisissez la vôtre pour voir son budget.`,
      en: {
        title: `${nom}: ${cs.length} French towns share this name`,
        description: `Several French towns are called ${nom}: ${liste}. Pick yours to see its budget.`,
      },
      path: `/france/${slug}`,
    });
    return { ...meta, robots: { index: false, follow: true } };
  }
  // A real 404 (thrown before streaming), not a page titled "not found".
  notFound();
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string; vs?: string }>;
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
      const pv = await loadPageVille(slim.slug, sp.year ? Number(sp.year) : undefined, locale === "en", sp.vs);
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

  const alias = communeAlias(slug);
  if (alias?.kind === "redirect") await permanentRedirectLocalized(`/france/${alias.to}`);
  if (alias?.kind === "choose") {
    const cs = homonymesOf(alias.slugs);
    if (cs.length > 1) return <CommuneHomonymes communes={cs} locale={(await readLocale()) === "en" ? "en" : "fr"} />;
  }

  notFound();
}
