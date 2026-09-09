/**
 * Module SANS import serveur : utilisable dans les composants client (les
 * loaders de communes tirent le client GCS, qui ne se bundle pas côté navigateur).
 */

const SIGLES = new Set(["SA", "SAS", "SASU", "SARL", "SNC", "SCI", "SCOP", "SEM", "SPL", "EURL", "EPIC", "EDF", "GDF", "RATP", "SNCF", "CCAS", "OPH", "BTP", "TP", "IDF", "GIE", "OPAC", "OPHLM", "HLM", "UGAP", "ONF", "APAVE", "AFPA", "CNRS", "INRAE", "PACA", "AURA", "BFC", "CVL"]);
const MINUSCULES = new Set(["de", "du", "des", "et", "la", "le", "les", "en", "sur", "sous", "au", "aux", "d", "l", "pour", "par"]);

/** Affichage d'une raison sociale DECP (souvent en capitales) : casse de
 *  titre, sigles gardés en capitales (sans voyelle, avec chiffre, ou liste
 *  connue), petits mots en minuscules. Une raison sociale déjà en casse
 *  mixte est laissée telle quelle. */
export function displayFournisseur(nom: string): string {
  const s = nom.trim();
  if (s !== s.toUpperCase()) return s;
  return s
    .split(/(\s+|[-/()'’])/)
    .map((tok, i) => {
      if (!/[A-Za-zÀ-ÿ0-9]/.test(tok)) return tok;
      const up = tok.toUpperCase();
      if (SIGLES.has(up) || /[\d.]/.test(up) || (up.length <= 4 && !/[AEIOUYÀÂÉÈÊËÎÏÔÙÛÜ]/.test(up))) return up;
      const low = tok.toLowerCase();
      if (i > 0 && MINUSCULES.has(low)) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join("");
}
