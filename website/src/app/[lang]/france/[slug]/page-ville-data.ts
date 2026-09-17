import { findCommuneByAny, listAllCommunesMeta, loadAllCommunesIndex } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneBudget } from "@/lib/commune-budget";
import { loadCommuneEvolution } from "@/lib/commune-evolution";
import { loadCommuneInvestissements } from "@/lib/commune-investissements";
import { loadCommuneMarches } from "@/lib/commune-marches";
import { loadCommunePeers } from "@/lib/commune-peers";
import { loadCommuneChantiers } from "@/lib/commune-chantiers";
import { loadMaire, MAIRES_HISTORY } from "@/lib/commune-maires";
import { loadTaux, TAUX_SOURCE, type TauxCommune } from "@/lib/commune-taux";
import { loadCommuneFonctions, FONCTIONS_SOURCE } from "@/lib/commune-fonctions";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { compareOptions, defaultOption } from "@/lib/compare-pairs";
import type { CompareEntry, PageVilleProps } from "./PageVilleClient";

export const SOURCES = {
  dgfip: "https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-communes-en-2024/",
  ofgl: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
  decp: "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/",
};

/** Au-dessus de ce nombre de marchés, la section déborde : l'explorateur reste. */
export const MARCHES_EXPLORER_MIN = 50;



const COMPARE_KEYS = ["impots_locaux", "encours_dette", "epargne_brute", "depenses_totales", "recettes_totales", "frais_personnel"];

function entry(slug: string): CompareEntry | null {
  const c = findCommuneByAny(slug);
  if (!c) return null;
  const kpis: Record<string, number | null> = {};
  for (const k of COMPARE_KEYS) kpis[k] = c.kpis?.[k]?.eur_hab ?? null;
  const tx = loadTaux(c.insee);
  return { slug: c.slug, nom: c.nom, dep_name: c.dep_name, pop: c.pop, kpis, taux: tx ? { annee: tx.annee, tfb: tx.tfb, mediane: tx.mediane } : null };
}

export async function loadPageVille(slug: string, requestedYear?: number, en = false, vs?: string): Promise<Omit<PageVilleProps, "related"> & { related: RelatedBlock | null } | null> {
  const commune = findCommuneByAny(slug);
  if (!commune) return null;
  const caps = getCommuneCapabilities(slug);
  if (!caps.budget.nature) return null;
  const budget = await loadCommuneBudget(slug, requestedYear);
  if (!budget) return null;
  const [evolution, invest, marches, chantiers] = await Promise.all([
    caps.evolution ? loadCommuneEvolution(slug) : Promise.resolve(null),
    caps.investissements ? loadCommuneInvestissements(slug) : Promise.resolve(null),
    caps.marches ? loadCommuneMarches(slug) : Promise.resolve(null),
    loadCommuneChantiers(slug),
  ]);
  const maire = loadMaire(commune.insee);
  const peers = caps.comparaison ? loadCommunePeers(slug) : null;

  // La taxe foncière : taux communal, médiane de la strate, historique.
  const tauxFull: TauxCommune | null = loadTaux(commune.insee);
  // Pas de seuil de population : le niveau 0 est la MÊME page pour les 35 000
  // communes. Le taux et la médiane de strate existent pour toutes, la section
  // s'allume donc sur la donnée comme toutes les autres.
  const taxeFonciere = tauxFull && tauxFull.tfb != null
    ? { ...tauxFull, source: TAUX_SOURCE.label, source_url: TAUX_SOURCE.url }
    : null;
  // Ventilation par fonction : présente pour les 3 248 communes qui votent leur
  // budget par fonction (DGFiP, présentation croisée nature-fonction). Le détail
  // (domaines, natures) vient du bucket privé, comme les marchés et l'investissement.
  const fonctions = await loadCommuneFonctions(slug);
  // Le chapitre de la liste par nature → le segment d'URL de sa fiche nature,
  // quand la commune en a (celles à axe fonction). Correspondance par libellé
  // de chapitre M57, stable d'une commune à l'autre.
  const CHAPITRE_VERS_NATURE: Record<string, string> = {
    "Charges de personnel": "salaires",
    "Achats et charges externes": "achats",
    "Charges de gestion courante": "gestion",
    "Charges financières": "dette",
    "Impôts et taxes (charges)": "impots",
    "Charges exceptionnelles": "exceptionnel",
  };
  const natureFiches: Record<string, string> = {};
  if (fonctions) {
    const parKey = Object.fromEntries((fonctions.natures ?? []).map((n) => [n.key, n.slug]));
    for (const [chap, key] of Object.entries(CHAPITRE_VERS_NATURE)) if (parKey[key]) natureFiches[chap] = parKey[key];
  }

  const me = entry(slug);
  const options = compareOptions(slug);
  const idx = loadAllCommunesIndex();
  // La voisine par défaut, la plus proche en taille — la même que le pilote du
  // sitemap déclare (lib/compare-pairs.ts).
  const defaultOther = defaultOption(options, commune.pop);
  // `?vs=` : la commune que le lecteur a choisie, n'importe laquelle des
  // 34 900 — la liste du département n'est plus qu'une suggestion.
  const chosen = vs ? findCommuneByAny(vs) : null;
  const otherSlug = chosen && chosen.slug !== commune.slug ? chosen.slug : defaultOther?.slug;
  const compare = me && idx ? { me, other: otherSlug ? entry(otherSlug) : null, options, year: idx.year } : null;

  // « Voir aussi » : les communes du même département au budget publié, les
  // plus peuplées d'abord — jamais un lien vers une page qui n'existe pas.
  const neighbours: RelatedRow[] = listAllCommunesMeta()
    .filter((c) => c.dep_name === commune.dep_name && c.slug !== slug && !hasDedicatedRoutes(c.slug))
    .sort((a, b) => b.pop - a.pop)
    .filter((c) => getCommuneCapabilities(c.slug).budget.nature)
    .slice(0, 6)
    .map((c) => ({
      href: `/france/${c.slug}`,
      label: en ? `How much does ${c.nom} spend?` : `Combien dépense ${c.nom} ?`,
      sub: en ? `${c.pop.toLocaleString("en-GB")} residents, ${c.dep_name}` : `${c.pop.toLocaleString("fr-FR")} habitants, ${c.dep_name}`,
    }));
  const related: RelatedBlock | null = neighbours.length
    ? {
        title: en ? "See also" : "Voir aussi",
        sub: en ? `The other towns of ${commune.dep_name} with a published budget.` : `Les autres communes de ${commune.dep_name} au budget publié.`,
        rows: neighbours,
      }
    : null;

  return {
    commune: { slug, insee: commune.insee, nom: commune.nom, dep_name: commune.dep_name, reg_name: commune.reg_name, pop: commune.pop },
    budget,
    evolution,
    invest,
    marches,
    chantiers,
    maire,
    taxeFonciere,
    fonctions,
    fonctionsSource: FONCTIONS_SOURCE,
    natureFiches,
    marchesHref: marches && marches.total.nb_marches > MARCHES_EXPLORER_MIN ? `/france/${slug}/marches` : undefined,
    peers,
    compare,
    sources: { ...SOURCES, rne_hist: MAIRES_HISTORY },
    related,
  };
}
