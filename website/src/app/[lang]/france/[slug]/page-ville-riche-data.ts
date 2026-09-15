import { getCity } from "@/lib/cities";
import { cityPopulation } from "@/lib/methodology";
import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadFournisseursRanking,
  loadInvestissementsData,
  loadPatrimoineData,
  loadQuiRecoitData,
  type BudgetPageData,
} from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { assocSlug } from "@/lib/assoc-slug";
import { slugifyLabel } from "@/lib/projet-utils";
import { findCommuneByAny, listAllCommunesMeta, loadAllCommunesIndex } from "@/lib/all-communes";
import { loadCommunePeers, type PeerComparison } from "@/lib/commune-peers";
import { loadCommuneChantiers, type ChantiersData } from "@/lib/commune-chantiers";
import { loadMaire, MAIRES_HISTORY, type Maire, type MaireHistory } from "@/lib/commune-maires";
import { loadTaux } from "@/lib/commune-taux";
import type { RelatedBlock } from "@/components/fiche/RelatedLinks";
import type { CompareEntry } from "./PageVilleClient";

/**
 * La page ville d'une ville à routes dédiées (Paris, Marseille) — bloc 5 de
 * l'architecture multi-villes (2026-09-10). Même squelette que les 35 000
 * communes, mais les sections s'alimentent des données propres de la ville
 * (budget par politique publique, subventions, marchés, chantiers, lieux),
 * chacune résumée en quelques lignes qui ouvrent les fiches et les
 * explorateurs existants. Les données nationales (maire, taux, Fonds vert,
 * comparateur) s'ajoutent comme pour toute commune.
 */

export type LinkRow = { href: string | null; label: string; sub?: string | null; value: number };

export type PageVilleRicheProps = {
  city: string;
  commune: { slug: string; insee: string; nom: string; dep_name: string; reg_name: string; pop: number };
  budget: { data: BudgetPageData; availableYears: number[]; year: number; posteHref: Record<string, string>; explorerHref: string };
  subventions: { year: number; total: number; nb: number; rows: LinkRow[]; explorerHref: string } | null;
  achats: { years: number[]; total: number; rows: LinkRow[]; explorerHref: string } | null;
  construit: { year: number; total: number; rows: LinkRow[]; explorerHref: string } | null;
  dette: { year: number; total: number; capacite: number; epargne: number; series: { year: number; value: number }[]; explorerHref: string } | null;
  lieux: { rows: LinkRow[]; explorerHref: string; n: number } | null;
  chantiers: ChantiersData | null;
  maire: Maire | null;
  /** Bornes d'années des versions archivées du répertoire des élus, pour la ligne Source. */
  maireHistory: MaireHistory | null;
  peers: PeerComparison | null;
  compare: { me: CompareEntry; other: CompareEntry | null; options: { slug: string; nom: string; pop: number }[]; year: number } | null;
  related: RelatedBlock | null;
};

const COMPARE_KEYS = ["impots_locaux", "encours_dette", "epargne_brute", "depenses_totales", "recettes_totales", "frais_personnel"];

function entry(slug: string): CompareEntry | null {
  const c = findCommuneByAny(slug);
  if (!c) return null;
  const kpis: Record<string, number | null> = {};
  for (const k of COMPARE_KEYS) kpis[k] = c.kpis?.[k]?.eur_hab ?? null;
  const tx = loadTaux(c.insee);
  return { slug: c.slug, nom: c.nom, dep_name: c.dep_name, pop: c.pop, kpis, taux: tx ? { annee: tx.annee, tfb: tx.tfb, mediane: tx.mediane } : null };
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export async function loadPageVilleRiche(city: string, requestedYear?: number, en = false): Promise<PageVilleRicheProps | null> {
  const reg = getCity(city);
  if (!reg) return null;
  const base = `/france/${city}`;
  const pop = cityPopulation(city) || reg.population;

  // 1. Budget par politique publique : mêmes colonnes que la page budget de
  //    la ville, chaque poste ouvre sa fiche.
  const index = loadBudgetIndex(city);
  const year = requestedYear && index.availableYears.includes(requestedYear) ? requestedYear : index.latestYear;
  const data = loadBudgetPageData(year, city);
  const posteHref: Record<string, string> = {};
  for (const p of data.topDepenses) posteHref[p.label] = `${base}/budget/poste/${slugifyLabel(p.label)}?year=${year}`;

  // 2. Les associations soutenues.
  const qr = safe(() => loadQuiRecoitData(undefined, city));
  const subventions = qr
    ? {
        year: qr.year,
        total: qr.total,
        nb: qr.nbBeneficiaires,
        rows: qr.top10.slice(0, 6).map((b) => ({ href: `${base}/subventions/association/${assocSlug(b.name)}`, label: b.name, sub: b.theme, value: b.amount })),
        explorerHref: `${base}/subventions`,
      }
    : null;

  // 3. Ce que la Ville achète : le classement des fournisseurs.
  const rk = safe(() => loadFournisseursRanking(city, 8));
  const achats = rk
    ? {
        years: rk.years,
        total: rk.totalAll,
        rows: rk.rows.slice(0, 6).map((r) => ({ href: r.siren ? `${base}/marches/fournisseur/${r.siren}` : null, label: r.name, sub: r.categorie, value: r.totalAmount })),
        explorerHref: `${base}/marches`,
      }
    : null;

  // 4. Ce que la Ville construit : les plus gros projets de l'année.
  const inv = safe(() => loadInvestissementsData(undefined, city));
  const construit = inv
    ? {
        year: inv.year,
        total: inv.total,
        rows: inv.topProjets.slice(0, 5).map((p) => ({ href: `${base}/investissements/projet/${encodeURIComponent(p.id)}`, label: en && p.name_en ? p.name_en : p.name, sub: p.chapitre, value: p.amount })),
        explorerHref: `${base}/investissements`,
      }
    : null;

  // 5. La dette.
  const pat = safe(() => loadPatrimoineData(undefined, city));
  const dette = pat
    ? {
        year: pat.year,
        total: pat.detteTotale,
        capacite: pat.capaciteDesendettement,
        epargne: pat.epargneBrute,
        series: pat.yearsSummary.map((y) => ({ year: y.year, value: y.dette })).sort((a, b) => a.year - b.year),
        explorerHref: `${base}/dette`,
      }
    : null;

  // 6. Les lieux (Paris seulement : l'index des lieux est parisien).
  const lieux =
    city === "paris"
      ? safe(() => {
          const all = loadLieuxIndex().filter((l) => (l.argent_total_eur ?? 0) > 0);
          const top = all.slice().sort((a, b) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0)).slice(0, 5);
          return { rows: top.map((l) => ({ href: `${base}/lieu/${l.slug}`, label: l.name, sub: l.kind_fr, value: l.argent_total_eur ?? 0 })), explorerHref: `${base}/lieux`, n: all.length };
        })
      : null;

  // Données nationales, comme pour toute commune.
  const insee = reg.code_insee;
  const [chantiers] = await Promise.all([loadCommuneChantiers(city)]);
  const maire = loadMaire(insee);
  const peers = loadCommunePeers(city);
  const me = entry(city);
  const idx = loadAllCommunesIndex();
  const options = listAllCommunesMeta()
    .filter((c) => c.pop >= 100000 && c.slug !== city)
    .sort((a, b) => b.pop - a.pop)
    .map((c) => ({ slug: c.slug, nom: c.nom, pop: c.pop }));
  const compare = me && idx ? { me, other: options[0] ? entry(options[0].slug) : null, options, year: idx.year } : null;

  const related: RelatedBlock = {
    title: en ? "Go further" : "Aller plus loin",
    sub: en ? `Every page of ${reg.nom}, each with its own explorer.` : `Toutes les pages de ${reg.nom}, chacune avec son explorateur.`,
    rows: [
      { href: `${base}/budget`, label: en ? "The full budget, item by item" : "Le budget complet, poste par poste" },
      ...(subventions ? [{ href: `${base}/subventions`, label: en ? "Every grant, every beneficiary" : "Toutes les subventions, tous les bénéficiaires" }] : []),
      ...(achats ? [{ href: `${base}/marches`, label: en ? "Every public contract" : "Tous les marchés publics" }] : []),
      ...(construit ? [{ href: `${base}/investissements`, label: en ? "Every investment project" : "Tous les projets d'investissement" }] : []),
      ...(lieux ? [{ href: `${base}/lieux`, label: en ? "The places, on a map" : "Les lieux, sur une carte" }] : []),
      ...(dette ? [{ href: `${base}/dette`, label: en ? "Balance sheet and debt" : "Bilan et dette" }] : []),
    ],
  };

  return {
    city,
    commune: { slug: city, insee, nom: reg.nom, dep_name: reg.dep_name, reg_name: reg.reg_name, pop },
    budget: { data, availableYears: index.availableYears, year, posteHref, explorerHref: `${base}/budget` },
    subventions,
    achats,
    construit,
    dette,
    lieux,
    chantiers,
    maire,
    maireHistory: MAIRES_HISTORY,
    peers,
    compare,
    related,
  };
}
