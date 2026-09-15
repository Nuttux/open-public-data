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
// Mesuré sur 19 394 lignes 2013-2025 (2026-09-14) : CSP1-5 et SA1-4 ouvrent
// 3 800 libellés, puis A4 (97), MGP (78), M. (55), MS_ (49), MA13 (14), MSAC
// (10), ACBC (5) — tous des codes de gestion, jamais un mot du titre. Les
// codes sans chiffre exigent un séparateur, pour ne pas mordre un mot
// (« MAINTENANCE », « MSAC - » oui, « MS » suivi d'un espace non).
// Depuis le 2026-09-15 : les codes de procédure aussi (« AC_BC », « AC/BC »,
// « ACMS », « MULTI-ATT. », « MULTIATTRIB ») et les couches empilées
// (« SA4 _ACBC/MULTI-ATTRIBUTAIRES_DÉCONTAMINATION ») — la liste 2013-2023
// en ouvre 21 % de ses 100 plus gros libellés.
const SECTION_PREFIX = /^(?:(?:SA|CSP|A|MA)\s?\d{1,2}\s*[.:\-_/]*\s*|(?:MGP|MSAC|ACBC|AC[\s_/-]?(?:BC|MS)|MULTI[\s-]?ATT(?:RIB(?:UTAIRES?)?)?\.?|MS|M)\s*[.:\-_/]+\s*)/i;
/** Enlève les codes en tête, couche après couche (quatre au plus). */
function stripSectionPrefix(s: string): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(SECTION_PREFIX, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

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
  // Vocabulaire de la commande publique : fréquent en tête d'objet et opaque
  // pour un lecteur non initié — « CSP4:MA SUB_AC:MISSION MOE … » restait tel
  // quel sur la fiche. À traiter avant les règles unitaires (MA, AC).
  [/\bMA\s+SUB[_\s]?AC\b\s*:?\s*/gi, "Marché subséquent — "],
  [/\bSUB[_\s]?AC\b\s*:?\s*/gi, "marché subséquent — "],
  // « AC travaux de … » en tête d'objet : AC = accord-cadre, sigle opaque pour
  // un lecteur non initié. Seulement en tête et devant un type de prestation,
  // pour ne pas toucher un « AC » qui voudrait dire autre chose.
  [/^AC\s+(?=(?:travaux|prestations?|fournitures?|services?|maintenance|missions?)\b)/i, "Accord-cadre de "],
  [/^AC\s+(?=entretien\b)/i, "Accord-cadre d’"],
  [/\bMISSION\s+MOE\b/gi, "Mission de maîtrise d’œuvre"],
  [/\bMOE\b/gi, "maîtrise d’œuvre"],
  [/\bMOA\b/gi, "maîtrise d’ouvrage"],
  [/\bAMO\b/gi, "assistance à maîtrise d’ouvrage"],
  [/\bOPC\b/gi, "ordonnancement, pilotage et coordination"],
  [/\bSPS\b/gi, "sécurité et protection de la santé"],
  [/\bCT\b(?=\s|$)/g, "contrôle technique"],
  // « PARIS 8ÈME » / « 11EME » → forme ordinale lisible.
  [/\b(\d{1,2})\s*[ÈE]ME\b\.?/gi, "$1e"],

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
  s = stripSectionPrefix(s);

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

/** Coupe un texte déjà lisible à `max` caractères, avec une ellipse. */
export function cutObjet(text: string, max = 110): string {
  const s = (text || "").trim();
  return s.length <= max ? s : s.slice(0, max).trimEnd() + "…";
}

/**
 * Intitulé de contrat pour une rangée, lisible et sans perdre ce qui le
 * distingue. Les accords-cadres s'écrivent « Nom de l'accord-cadre - Lot » ; le
 * nettoyage recolle ce tiret, et couper à la fin effaçait le lot, souvent la
 * seule partie qui change d'une ligne à l'autre. On sépare donc AVANT de
 * nettoyer, au premier tiret entouré d'espaces entre deux mots (« 9 - 10 - 11 »
 * reste une liste), puis :
 *   - tout tient : « Nom · Lot » ;
 *   - lot court : début du nom coupé, lot entier ;
 *   - lot long : il se suffit à lui-même, on le montre seul.
 */
export function shortObjet(raw: string, max = 110): string {
  const text = (raw || "").trim();
  const m = text.match(/^(.*?[^\d\s])\s+[-–]\s+([^\d\s].*)$/);
  if (!m) return cutObjet(normalizeObjet(text), max);
  const head = normalizeObjet(m[1]);
  // « (1-2-3-4-6-7) » en fin de lot : la liste des arrondissements, trop longue
  // pour une ligne ; la fiche du contrat la garde.
  const lot = m[2]
    .replace(/\s*\((?:\d+\s*[-,]\s*)+\d+\)\s*$/, "")
    .split(/(?<=[^\d\s])\s+[-–]\s+(?=[^\d\s])/)
    .map((part) => normalizeObjet(part))
    .filter(Boolean)
    .join(" · ");
  if (!head || lot.length < 3) return cutObjet(normalizeObjet(text), max);
  const joined = `${head} · ${lot}`;
  if (joined.length <= max) return joined;
  if (lot.length > 80) return cutObjet(lot, max);
  return `${cutObjet(head, max - lot.length - 4)} · ${lot}`;
}

// ── Une ligne de contrat : un titre court, un détail ─────────────────────────

// Formules d'appel d'offres en tête d'objet, sans information pour un lecteur.
const BOILERPLATE: RegExp[] = [
  /^la pr[ée]sente consultation .*?ayant pour objet\s+(?:la |le |les |l’|l'|d’|d'|de |du |des |une |un )?/i,
  /^(?:accords?[- ]cadres?|march[ée]s?(?: publics?)?)(?:\s+(?:mono|multi)[- ]attributaires?)?(?:\s+(?:à|a)\s+march[ée]s?\s+subs[ée]quents?)?\s+(?:relatifs?|relative|ayant pour objet|portant sur|concernant|pour|de|d’|d')\s*(?:à |a |aux |au )?(?:des |de la |de l’|de l'|du |de |le |la |les |l’|l')?/i,
  /^(?:prestations? de|fourniture et|mission de)\s+(?=\S)/i,
];

/** Drops parentheticals except a short acronym like « (Trilib) » or « (EPPM) ». */
function dropParentheticals(s: string): string {
  return s
    .replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (/^[\p{L}]{2,14}$/u.test(inner.trim()) ? ` (${inner.trim()})` : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Cuts at the last clause boundary in the second half of the window, never mid-word. */
function clauseCut(s: string, max: number): string {
  const t = s.replace(/[\s,;:]+$/, "");
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  // A clause boundary late in the window keeps the subject; an early one
  // (« Fourniture, pose, collecte, maintenance et… ») loses it, so a plain
  // word boundary near the end is better then.
  const marks = [", ", " ; ", " : ", " – ", " — ", " et ", " pour ", " dans ", " sur ", " avec ", " ainsi que "];
  let best = -1;
  for (const mk of marks) {
    const i = head.lastIndexOf(mk);
    if (i >= max * 0.6 && i > best) best = i;
  }
  if (best < 0) {
    const sp = head.lastIndexOf(" ");
    best = sp > max * 0.5 ? sp : max;
  }
  return head.slice(0, best).replace(/[\s,;:(]+$/, "") + "…";
}

// Procedure labels that the source writes as a lot part; they name nothing.
const LOT_NOISE: RegExp[] = [/^accords?[- ]cadres?\s+(?:à|a)\s+march[ée]s?\s+subs[ée]quents?\.?$/i, /^march[ée]s?\s+subs[ée]quents?\.?$/i, /^lot\s*\d+\s*$/i, /^titulaires?\s*\d+\s*$/i, /^attributaires?\s*\d+\s*$/i];

/**
 * A contract row on the fiche grammar: a short title (what is bought) and a
 * detail (the lot, when the source names one). Built from the raw object:
 * « Nom de l'accord-cadre - Lot » is split first, the tender boilerplate is
 * dropped, long parentheticals too, and each part is cut at a clause, never
 * mid-word. A trailing token with no space (« SIPPEREC », a purchasing group)
 * is not a lot and is dropped.
 */
export function rowObjet(raw: string, max = 72, detailMax = 64): { title: string; detail: string | null } {
  const text = (raw || "").trim();
  const m = text.match(/^(.*?[^\d\s])\s+[-–]\s+([^\d\s].*)$/);
  const clean = (part: string) => {
    // « LOT 1 : Travaux… » once the codes are gone: the lot is the row's sub-line.
    let s = normalizeObjet(part).replace(/^lot\s*\d+\s*[:.\-–]?\s*/i, "");
    for (const re of BOILERPLATE) s = s.replace(re, "");
    s = dropParentheticals(s.replace(/,?\s*en \d+ lots?,?/i, ","));
    s = s.replace(/\s*,\s*,/g, ",").replace(/^[,\s]+/, "").trim();
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  };
  if (!m) return { title: clauseCut(clean(text), max), detail: null };
  // « CSP4: AC_BC - LOT 1 : Travaux… » : what is left of the head is a bare
  // code, not a title; the lot part takes its place.
  const head = clauseCut(clean(m[1]), max);
  const title = /[a-zà-ÿ]{4,}/i.test(head) ? head : "";
  const lotRaw = m[2].replace(/\s*\((?:\d+\s*[-,]\s*)+\d+\)\s*$/, "").trim();
  if (!/\s/.test(lotRaw) && lotRaw.length <= 12) return { title, detail: null };
  // « Accord-cadre à marchés subséquents - Travaux de … » : the inner parts,
  // minus the procedure labels, each cleaned, joined with a middle dot.
  const lotParts = lotRaw
    .split(/(?<=[^\d\s])\s+[-–]\s+(?=[^\d\s])/)
    .map((p) => p.trim())
    .filter((p) => p && !LOT_NOISE.some((re) => re.test(p)))
    .map((p) => clean(p))
    .filter(Boolean);
  if (lotParts.length === 0) return { title, detail: null };
  const detail = clauseCut(lotParts.join(" · "), detailMax);
  return { title: title || detail, detail: title ? detail : null };
}
