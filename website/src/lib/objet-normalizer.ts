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

// Articles/prépositions/conjonctions fr. à forcer en minuscules quand on
// re-casse un libellé tout-MAJ. Sans ça, "DES MARCHES A LA SAUVETTE" se
// retrouve "DES Marches A LA Sauvette" (la règle "≤3 chars" garde MAJ).
// Le mapping restaure aussi les accents perdus (A → à, DES reste "des").
const FR_STOPWORDS_LOWER = new Map<string, string>([
  ["le", "le"], ["la", "la"], ["les", "les"], ["l'", "l'"],
  ["un", "un"], ["une", "une"], ["des", "des"], ["du", "du"], ["de", "de"], ["d'", "d'"],
  ["à", "à"], ["a", "à"], ["au", "au"], ["aux", "aux"],
  ["en", "en"], ["par", "par"], ["sur", "sur"], ["sous", "sous"], ["dans", "dans"], ["pour", "pour"],
  ["chez", "chez"], ["vers", "vers"], ["dès", "dès"], ["sans", "sans"], ["avec", "avec"],
  ["et", "et"], ["ou", "ou"], ["ni", "ni"], ["mais", "mais"], ["car", "car"], ["donc", "donc"],
]);

// Codes de section internes en tête de libellé ("CSP5 ", "SA4.", "CSP4: ",
// "CSP3-") : identifiants de gestion Ville, sans valeur pour un lecteur. Ils
// ouvrent 42 % des libellés du corpus. On ne les retire qu'en position
// initiale, seule position où ils sont sans ambiguïté un préfixe — et le motif
// exclut "LOT1…" (numéro de lot : information utile, à conserver).
const SECTION_PREFIX = /^(?:SA|CSP)\s?\d+\s*[.:\-_]*\s*/i;

// Restauration d'accents. Les libellés arrivent en MAJUSCULES non accentuées
// ("RENOVATION MUSEE") ; la remise en casse lisible produit "Renovation Musee".
// Ces règles réaccentuent le vocabulaire métier récurrent en préservant la
// casse du mot d'origine (cf. `applyAccents`).
const ACCENTS: Rule[] = [
  [/\brenovation\b/gi, "rénovation"],
  [/\brefection\b/gi, "réfection"],
  [/\brehabilitation\b/gi, "réhabilitation"],
  [/\bamenagement\b/gi, "aménagement"],
  [/\becole(s)?\b/gi, "école$1"],
  [/\bcreche(s)?\b/gi, "crèche$1"],
  [/\bmusee(s)?\b/gi, "musée$1"],
  [/\bbibliotheque(s)?\b/gi, "bibliothèque$1"],
  [/\bbatiment(s)?\b/gi, "bâtiment$1"],
  [/\bequipement(s)?\b/gi, "équipement$1"],
  [/\bsecurite\b/gi, "sécurité"],
  [/\bproprete\b/gi, "propreté"],
  [/\belectricite\b/gi, "électricité"],
  [/\benergie\b/gi, "énergie"],
  [/\breseau(x)?\b/gi, "réseau$1"],
  [/\betablissement(s)?\b/gi, "établissement$1"],
  [/\bcimetiere(s)?\b/gi, "cimetière$1"],
  [/\btheatre(s)?\b/gi, "théâtre$1"],
  [/\bsysteme(s)?\b/gi, "système$1"],
  [/\brealisation(s)?\b/gi, "réalisation$1"],
  [/\beclairage\b/gi, "éclairage"],
  [/\bdechet(s)?\b/gi, "déchet$1"],
  [/\bmateriel(s)?\b/gi, "matériel$1"],
  [/\bvehicule(s)?\b/gi, "véhicule$1"],
  [/\belectrique(s)?\b/gi, "électrique$1"],
  [/\bcollectivite(s)?\b/gi, "collectivité$1"],
  [/\bmaitrise\b/gi, "maîtrise"],
  [/\bqualite\b/gi, "qualité"],
  [/\bsante\b/gi, "santé"],
  [/\bprevention\b/gi, "prévention"],
  [/\baccessibilite\b/gi, "accessibilité"],
  [/\bcollege(s)?\b/gi, "collège$1"],
];

/** Applique ACCENTS en conservant la casse initiale du mot remplacé, pour ne
 *  pas capitaliser un mot en milieu de phrase (« travaux de Rénovation »). */
function applyAccents(s: string): string {
  return ACCENTS.reduce(
    (acc, [re, rep]) =>
      acc.replace(re, (...args) => {
        const m = args[0] as string;
        // `rep` peut contenir $1 (pluriel) — on laisse replace le résoudre en
        // rejouant la regex sur le seul mot matché.
        const out = m.replace(new RegExp(re.source, "i"), rep);
        return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
      }),
    s,
  );
}

// Abréviations métier → forme longue. Ordre important : on va du plus
// spécifique au plus générique.
const ABBREVIATIONS: Rule[] = [
  // Paires — à traiter avant les règles unitaires, sinon "TRVX CSTRUCT"
  // ressortirait en "Travaux Construction".
  [/\bTRVX\s+CSTRUCT\b/gi, "Travaux de construction"],
  [/\bTVX\s+CSTRUCT\b/gi, "Travaux de construction"],
  [/\bTRVX\s+RENOV\b/gi, "Travaux de rénovation"],
  [/\bTVX\s+RENOV\b/gi, "Travaux de rénovation"],

  // Types de travaux / prestations
  [/\bTRVX\b/gi, "Travaux"],
  [/\bCSTRUCT\b/gi, "Construction"],
  [/\bCONCEPT\b/gi, "conception"],
  [/\bREALISAT\b/gi, "réalisation"],
  [/\bEXPLOIT\b/gi, "exploitation"],
  [/\bTECHN\b/gi, "technique"],
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

  // "TCE" = tous corps d'état : un chantier confié à une entreprise unique
  // qui couvre tous les métiers du bâtiment (172 libellés du corpus).
  // Insensible à la casse : la remise en casse minuscule un "TCE" collé dans
  // un token composé ("ST MERRI-TCE-LOT 01" → "Merri-tce-lot").
  [/\bTCE\b/gi, "tous corps d'état"],
  // "PTE" = porte (porte de Bagnolet, de la Chapelle…) — sans autre sens dans
  // le corpus, vérifié sur les 39 libellés qui le portent.
  [/\bPTE\b/gi, "porte"],

  // Entités Ville / secteurs
  [/\bMGP\b/g, "Métropole du Grand Paris"],
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
  // Ordinaux d'arrondissement : "19EME" → "19e", "1ERE" → "1re" (~1 100
  // libellés). Les ordinaux en chiffres romains ("XIVEME") sont laissés tels
  // quels : trop rares pour justifier une règle.
  [/\b(\d{1,2})EME\b/gi, "$1e"],
  [/\b(\d{1,2})ERE\b/gi, "$1re"],
  // Adresses : "133 BIS R BELLIARD" → "133 bis rue Belliard". On n'étend "R"
  // en "rue" que collé à un numéro de voirie, seul contexte non ambigu.
  [/\b(\d+)\s+BIS\s+R\s+/gi, "$1 bis rue "],
  [/\b(\d+)\s+TER\s+R\s+/gi, "$1 ter rue "],
  [/\b(\d+)\s+R\s+/g, "$1 rue "],
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

  // Retire le code de section en tête avant tout le reste : il fausserait la
  // remise en casse ("SA4.TRVX" est un seul token → "Sa4.trvx").
  s = s.replace(SECTION_PREFIX, "").trim();

  // Si tout est en MAJUSCULES, passe en casse plus lisible avant substitutions.
  // Les mots courts (≤3 car.) restent MAJ par défaut (acronymes : SA3, CPV,
  // UTB, MOE…), sauf articles/prépositions fr. qui passent en minuscules.
  if (s === s.toUpperCase() && s.length > 8) {
    s = s
      .split(/(\s+|[_])/)
      .map((w) => {
        if (!w.trim()) return w;
        if (/^\d/.test(w)) return w; // préfixes numériques
        const lower = w.toLowerCase();
        const stop = FR_STOPWORDS_LOWER.get(lower);
        if (stop) return stop;
        if (w.length <= 3) return w; // garde acronymes courts
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
  // Après les abréviations : celles-ci produisent du texte déjà accentué, et
  // certaines sorties ("Rénovation") ne doivent pas être re-traitées.
  s = applyAccents(s);

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
