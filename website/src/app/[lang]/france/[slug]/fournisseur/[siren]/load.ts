import "server-only";
import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { loadCommuneFournisseurs, loadCommuneMarches } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";

export const SOURCE_URL = "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/";

/**
 * Tout ce que la fiche fournisseur locale affiche, chargé une fois pour la
 * page ET pour le drawer (même donnée, deux enveloppes). Une personne physique
 * n'a jamais de fiche : absente de fournisseurs.json, donc null → 404.
 */
export async function loadFournisseurLocal(slug: string, siren: string) {
  if (hasDedicatedRoutes(slug) || !/^\d{9}$/.test(siren)) return null;
  const commune = findCommuneByAny(slug);
  if (!commune) return null;
  const data = await loadCommuneFournisseurs(slug);
  const f = data?.fournisseurs.find((x) => x.siren === siren);
  if (!data || !f) return null;
  const marches = await loadCommuneMarches(slug);
  // Les autres fournisseurs de la commune (cinq plus gros, hors celui-ci) :
  // un fournisseur ouvre sur les autres, jamais une impasse.
  const others = data.fournisseurs.filter((x) => x.siren !== siren).slice(0, 5).map((x) => ({ siren: x.siren, nom: displayFournisseur(x.nom), montant: x.montant, nb: x.nb }));
  return {
    commune: { slug: commune.slug, nom: commune.nom, dep_name: commune.dep_name, pop: commune.pop },
    f: { ...f, nom: displayFournisseur(f.nom) },
    nationalComplet: data.national_complet,
    coverageNote: data.coverage_note,
    totalCommune: marches?.total.montant ?? null,
    others,
  };
}
