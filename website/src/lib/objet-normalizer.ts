/**
 * Normalise les libellés d'objet de marchés publics parisiens.
 *
 * Les sources open data publient des libellés comme :
 *   "SA3_ACMS_TRVX_AMENAGT_COURS ETS PARIS CTR 9-10-11-12 ARRT L3"
 *
 * Ce module applique un ensemble de règles regex pour produire une version
 * lisible par un humain :
 *   "Travaux d'aménagement des cours d'écoles à Paris · centres 9-10-11-12 · arr. 3 · lot 3"
 *
 * C'est une étape rapide, 100 % locale, à appliquer AVANT l'appel LLM (qui
 * raffine encore le texte dans `vulgarize_marches_llm.py`). Quand la
 * vulgarisation LLM est disponible, on l'utilise en priorité et on retombe
 * sur le résultat regex sinon.
 */

type Rule = [RegExp, string];

// Abréviations métier → forme longue. Ordre important : on va du plus
// spécifique au plus générique.
const ABBREVIATIONS: Rule[] = [
  // Types de travaux / prestations
  [/\bTRVX\b/gi, "Travaux"],
  [/\bTVX\b/gi, "Travaux"],
  [/\bFOURN\b/gi, "Fournitures"],
  [/\bMAINT\b/gi, "Maintenance"],
  [/\bGEST\b/gi, "Gestion"],
  [/\bAMENAGT\b/gi, "Aménagement"],
  [/\bAMENGT\b/gi, "Aménagement"],
  [/\bEQPT\b/gi, "Équipement"],
  [/\bRENOV\b/gi, "Rénovation"],
  [/\bREHAB\b/gi, "Réhabilitation"],
  [/\bINSTALL\b/gi, "Installation"],
  [/\bCONST\b/gi, "Construction"],
  [/\bMODERNIS\b/gi, "Modernisation"],
  [/\bAUGMENTAT°\b/gi, "Augmentation"],
  [/\bPRESTAT°\b/gi, "Prestations"],
  [/\bINTERV°\b/gi, "Intervention"],

  // Objets / lieux
  [/\bETS\b/gi, "établissement(s)"],
  [/\bCTR\b/gi, "centre(s)"],
  [/\bARRT\b/gi, "arrondissement"],
  [/\bARR\b\.?/gi, "arr."],
  [/\bQRT\b/gi, "quartier"],
  [/\bHEBERG\b/gi, "hébergement"],
  [/\bBAT\b\.?/gi, "bâtiment"],
  [/\bECL\b\.?/gi, "éclairage"],
  [/\bCHAUF\b\.?/gi, "chauffage"],
  [/\bELEC\b\.?/gi, "électricité"],
  [/\bCLIM\b\.?/gi, "climatisation"],
  [/\bINFORMAT°\b/gi, "informatique"],
  [/\bINFO\b/gi, "informatique"],
  [/\bMATRL\b/gi, "matériel"],

  // Entités Ville / secteurs
  [/\bCASVP\b/g, "Centre d'action sociale (CASVP)"],
  [/\bACMS\b/g, "ACMS"], // Acronyme interne Ville — laissé tel quel
  [/\bOPH\b/g, "Office Public Habitat"],
  [/\bPH\b/g, "Paris Habitat"],
  [/\bRIVP\b/g, "RIVP"],
  [/\bSEMAPA\b/g, "Semapa"],
  [/\bSEMA\b/g, "SEM aménagement"],
  [/\bBTP\b/g, "BTP"],

  // Volets administratifs
  [/\bOPER\b/gi, "opérations"],
  [/\bOP\b\.?/g, "opération"],
  [/\bLOT\b/gi, "lot"],
  [/\bPRGM\b/gi, "programme"],
  [/\bCVTN\b/gi, "convention"],
  [/\bACCORD\b/gi, "accord"],

  // Temporalité
  [/\b2A\b/g, "2 ans"],
  [/\b3A\b/g, "3 ans"],
  [/\b4A\b/g, "4 ans"],

  // Sections / périmètres
  [/\bFCT\b\.?/gi, "fonctionnement"],
  [/\bINV\b\.?/gi, "investissement"],
  [/\bCPT\b\.?/gi, "compte"],
];

// Cosmétique / ponctuation
const COSMETIC: Rule[] = [
  // "LOT2", "Lot2", "lot 2", "L2" → "lot 2"
  [/\b(?:lot|Lot|LOT)\s*(\d+)\b/g, "lot $1"],
  [/\bL(\d+)\b/g, "lot $1"],
  // "2M", "3M" (millions ?) hors contexte — souvent utilisé pour des
  // grandes/moyennes opérations ; on laisse tel quel.
  // Qualificatifs d'opérations
  [/\bMOY\b\.?/g, "moyennes"],
  [/\bGD\b\.?/g, "grandes"],
  [/\bPT\b\.?/g, "petites"],
  // Underscores → espaces
  [/_+/g, " "],
  // "PARIS CTR 9 - 10 - 11 - 12" — reserre les tirets accolés aux chiffres
  [/\s+-\s+/g, "-"],
  // Supprime les qualificatifs "moyennes et grandes" répétés
  [/moyennes\s+et\s+grandes/gi, "moyennes et grandes"],
  // Multiples espaces
  [/\s{2,}/g, " "],
];

/**
 * Applique les règles d'abbréviation puis cosmétiques, renvoie une chaîne
 * lisible. Si l'entrée est déjà lisible (aucune abbr détectée), renvoie
 * tel quel (juste trim + single-space normalisation).
 */
export function normalizeObjet(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();

  // Si tout est en MAJUSCULES, passe en casse plus lisible avant substitutions.
  // On garde les mots < 4 caractères en majuscules (acronymes SA3, etc.)
  if (s === s.toUpperCase() && s.length > 8) {
    s = s
      .split(/(\s+|[_])/)
      .map((w) => {
        if (!w.trim()) return w;
        if (w.length <= 3) return w; // garde acronymes courts
        if (/^\d/.test(w)) return w; // préfixes numériques
        return w[0] + w.slice(1).toLowerCase();
      })
      .join("");
  }

  // Les underscores DOIVENT être remplacés AVANT les règles d'abbréviation,
  // sinon les motifs `\bTVX\b` ne matchent pas quand le libellé est
  // "SA3_ACMS_TVX" (l'underscore est un "word char" pour regex).
  s = s.replace(/_+/g, " ");

  for (const [re, rep] of ABBREVIATIONS) s = s.replace(re, rep);
  for (const [re, rep] of COSMETIC) s = s.replace(re, rep);

  // Capitalise la première lettre (après nettoyage)
  s = s.trim();
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/**
 * Indicateur heuristique : l'objet brut est-il vraiment illisible (plein
 * d'abréviations et de majuscules) ? Si oui, on afficherait la version
 * normalisée en priorité. Sinon, on peut afficher le brut et le normalisé
 * uniquement comme complément.
 */
export function isObjetCryptic(raw: string): boolean {
  if (!raw) return false;
  const up = raw.replace(/[^A-Z\s\d]/g, "");
  const upRatio = up.length / raw.length;
  const hasUnderscore = /_/.test(raw);
  const hasAbbrev = /\b(TRVX|TVX|AMENAGT|GEST|PRESTAT°|HEBERG|ETS|CTR|ARRT|ACMS|CASVP)\b/.test(raw);
  return hasAbbrev || hasUnderscore || upRatio > 0.6;
}
