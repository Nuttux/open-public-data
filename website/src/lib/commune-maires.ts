import maires from "@/data/communes-maires.json";

/**
 * Qui décide (bloc 4) : le maire et la taille du conseil, depuis le
 * Répertoire national des élus. Fichier commité, une entrée par commune.
 * Publié : nom, prénom, date de début de fonction, effectifs — rien d'autre
 * du répertoire (règle vie privée du site).
 */
export type Maire = { nom: string | null; prenom: string | null; depuis: string | null; conseillers: number; adjoints: number };
type File = { source: string; source_url: string; n_communes: number; communes: Record<string, Maire> };
const F = maires as File;

export function loadMaire(insee: string): Maire | null {
  return F.communes[insee] ?? null;
}
export const MAIRES_SOURCE = { label: F.source, url: F.source_url };

/** « KERN » → « Kern », « DE LA FONTAINE-MARTIN » → « de la Fontaine-Martin ». */
export function displayNomElu(nom: string | null): string {
  if (!nom) return "";
  const parts = nom.toLowerCase().split(/(\s+|-)/);
  return parts
    .map((w, i) => (/^(de|du|des|la|le|d'|l')$/.test(w) && i > 0 ? w : w.replace(/^([a-zà-ÿ])/, (c) => c.toUpperCase()).replace(/(['’])([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase())))
    .join("");
}
