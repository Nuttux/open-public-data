/**
 * Les contractions du français devant un nom de commune. « Budget de
 * Altenach » et « la taxe foncière à Le Havre » sont des fautes que 35 000
 * pages ne peuvent pas se permettre : d'Altenach, du Havre, des Vans, aux
 * Lilas. Pure, sans dépendance, utilisable côté serveur et client.
 */
const VOYELLE = /^[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŒ]/i;
// Les rares H aspirés en tête de nom de commune (pas d'élision devant).
const H_ASPIRE = /^H(a(m|g|r|y|z)|e(n|r)|o(l|u)|u)/i;

function elide(nom: string): boolean {
  if (!VOYELLE.test(nom) && !/^H/i.test(nom)) return false;
  if (/^H/i.test(nom) && H_ASPIRE.test(nom)) return false;
  return true;
}

/** « de Pantin », « d'Altenach », « du Havre », « des Vans », « de La Rochelle ». */
export function deNom(nom: string): string {
  if (/^Le\s/.test(nom)) return `du ${nom.slice(3)}`;
  if (/^Les\s/.test(nom)) return `des ${nom.slice(4)}`;
  if (/^L[’']/.test(nom)) return `de ${nom}`;
  if (/^La\s/.test(nom)) return `de ${nom}`;
  return elide(nom) ? `d’${nom}` : `de ${nom}`;
}

/** « à Pantin », « à Altenach », « au Havre », « aux Vans », « à La Rochelle ». */
export function aNom(nom: string): string {
  if (/^Le\s/.test(nom)) return `au ${nom.slice(3)}`;
  if (/^Les\s/.test(nom)) return `aux ${nom.slice(4)}`;
  return `à ${nom}`;
}
