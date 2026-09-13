/**
 * Une fiche contrat de commune mérite-t-elle d'être indexée ?
 *
 * La DECP publie aussi des lots de quelques milliers d'euros et des objets
 * réduits à un code (« Pantin- - | 2019088 | 1-Lot 8 Plomberie »). Ces pages
 * restent en ligne pour qui les cherche, mais ne sont pas proposées aux
 * moteurs : ~111 000 fiches sur ~480 000, qui feraient passer tout le site
 * pour un générateur de pages vides.
 *
 * Règle jumelle, à garder identique : objet_lisible() et indexable() dans
 * pipeline/scripts/export/build_contrats_sitemap.py.
 */
export const CONTRAT_MONTANT_MIN = 40_000;
const LETTRES_MIN = 15;

export function objetLisible(objet: string | null | undefined): boolean {
  const o = objet ?? "";
  if (o.replace(/[^A-Za-zÀ-ÖØ-öø-ÿŒœ]/g, "").length < LETTRES_MIN) return false;
  return !/\|\s*\d{5,}\s*\|/.test(o);
}

export function contratIndexable(c: { montant: number | string | null; objet: string | null }): boolean {
  return Number(c.montant ?? 0) >= CONTRAT_MONTANT_MIN && objetLisible(c.objet);
}
