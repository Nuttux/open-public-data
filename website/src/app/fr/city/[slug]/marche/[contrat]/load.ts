import "server-only";
import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { loadCommuneContrats, type ContratCommune } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";

/**
 * La fiche contrat d'une commune (2026-09-13), chargée une fois pour la page
 * pleine ET pour le drawer. Le segment d'URL est « objet-lisible-<id> » : seul
 * l'identifiant de 8 caractères compte, l'objet est là pour le lecteur et les
 * moteurs — un objet réécrit à l'export ne casse pas l'adresse.
 */
export async function loadContratLocal(slug: string, segment: string) {
  if (hasDedicatedRoutes(slug)) return null;
  const id = /([0-9a-f]{8})$/.exec(segment)?.[1];
  if (!id) return null;
  const commune = findCommuneByAny(slug);
  if (!commune) return null;
  const data = await loadCommuneContrats(commune.slug);
  const raw = data?.contrats[id];
  if (!data || !raw) return null;
  const nomPublic = (c: ContratCommune) => (c.siren && c.titulaire ? displayFournisseur(c.titulaire) : c.titulaire);
  const c = { ...raw, titulaire: nomPublic(raw) };
  // Ce que le même titulaire a fait d'autre pour la commune : une fiche ouvre
  // sur la suivante, jamais une impasse.
  const autres = c.siren
    ? Object.values(data.contrats)
        .filter((x) => x.siren === c.siren && x.id !== c.id)
        .sort((a, b) => (b.annee ?? 0) - (a.annee ?? 0) || b.montant - a.montant)
        .slice(0, 5)
        .map((x) => ({ slug: x.slug, objet: x.objet, montant: x.montant, annee: x.annee }))
    : [];
  return {
    commune: { slug: commune.slug, nom: commune.nom, dep_name: commune.dep_name },
    c,
    autres,
    coverageNote: data.coverage_note,
    sourceUrl: data.source_url,
  };
}

export type ContratLocal = NonNullable<Awaited<ReturnType<typeof loadContratLocal>>>;
