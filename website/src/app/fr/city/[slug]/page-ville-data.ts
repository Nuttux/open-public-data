import { findCommuneByAny, listAllCommunesMeta, loadAllCommunesIndex } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneBudget } from "@/lib/commune-budget";
import { loadCommuneEvolution } from "@/lib/commune-evolution";
import { loadCommuneInvestissements } from "@/lib/commune-investissements";
import { loadCommuneMarches } from "@/lib/commune-marches";
import { loadCommunePeers } from "@/lib/commune-peers";
import { loadCommuneChantiers } from "@/lib/commune-chantiers";
import { loadMaire } from "@/lib/commune-maires";
import { loadTaux } from "@/lib/commune-taux";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
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
  return { slug: c.slug, nom: c.nom, pop: c.pop, kpis, taux: tx ? { annee: tx.annee, tfb: tx.tfb, mediane: tx.mediane } : null };
}

/**
 * Les communes qu'on propose face à celle-ci : le même département, classées
 * par proximité de population, avec un budget publié. La voisine par défaut
 * est la plus proche en taille.
 */
export function compareOptions(slug: string, limit = 60): { slug: string; nom: string; pop: number }[] {
  const me = findCommuneByAny(slug);
  if (!me) return [];
  return listAllCommunesMeta()
    .filter((c) => c.dep_name === me.dep_name && c.slug !== slug && !hasDedicatedRoutes(c.slug))
    .filter((c) => getCommuneCapabilities(c.slug).budget.nature)
    .sort((a, b) => Math.abs(a.pop - me.pop) - Math.abs(b.pop - me.pop))
    .slice(0, limit)
    .map((c) => ({ slug: c.slug, nom: c.nom, pop: c.pop }))
    .sort((a, b) => b.pop - a.pop);
}

export async function loadPageVille(slug: string, requestedYear?: number, en = false): Promise<Omit<PageVilleProps, "related"> & { related: RelatedBlock | null } | null> {
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

  const me = entry(slug);
  const options = compareOptions(slug);
  const idx = loadAllCommunesIndex();
  const defaultOther = options.length ? options.slice().sort((a, b) => Math.abs(a.pop - commune.pop) - Math.abs(b.pop - commune.pop))[0] : null;
  const compare = me && idx ? { me, other: defaultOther ? entry(defaultOther.slug) : null, options, year: idx.year } : null;

  // « Voir aussi » : les communes du même département au budget publié, les
  // plus peuplées d'abord — jamais un lien vers une page qui n'existe pas.
  const neighbours: RelatedRow[] = listAllCommunesMeta()
    .filter((c) => c.dep_name === commune.dep_name && c.slug !== slug && !hasDedicatedRoutes(c.slug))
    .sort((a, b) => b.pop - a.pop)
    .filter((c) => getCommuneCapabilities(c.slug).budget.nature)
    .slice(0, 6)
    .map((c) => ({
      href: `/fr/city/${c.slug}`,
      label: en ? `How much does ${c.nom} spend?` : `Combien dépense ${c.nom} ?`,
      sub: en ? `${c.pop.toLocaleString("en-GB")} inhabitants, ${c.dep_name}` : `${c.pop.toLocaleString("fr-FR")} habitants, ${c.dep_name}`,
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
    marchesHref: marches && marches.total.nb_marches > MARCHES_EXPLORER_MIN ? `/fr/city/${slug}/marches` : undefined,
    peers,
    compare,
    sources: SOURCES,
    related,
  };
}
