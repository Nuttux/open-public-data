/**
 * Expansion de requête par dictionnaire de synonymes.
 *
 * Pas de recherche sémantique : un terme matche ou ne matche pas, et chaque
 * résultat reste explicable (« correspond : queer »). Le dictionnaire est
 * partagé par toutes les recherches du site (subventions, marchés) et
 * s'enrichit à la main — idéalement à partir des recherches sans résultat
 * remontées par l'analytics (search_submit / q_hash).
 *
 * Règles d'écriture des groupes :
 *  - chaque groupe est bidirectionnel : taper n'importe quel terme du groupe
 *    retrouve les entités contenant n'importe quel autre terme ;
 *  - groupes = vrais synonymes / équivalences d'intention, PAS des paniers
 *    thématiques (« foot » ne doit pas remonter les clubs de judo) ;
 *  - termes en minuscules, sans accents ni ponctuation (cf. normSearch) ;
 *  - un terme matche en MOT ENTIER ; le suffixe `*` autorise le préfixe de
 *    mot (`femin*` → féminin, féministe) ;
 *  - éviter les préfixes trop courts : `trans` seul matcherait « KM TRANS
 *    EXPRESS » (transport) — d'où `transgenre*` / `transidentit*` ;
 *  - gare aux homonymes administratifs (audit 2026-07 : `opera*` matchait
 *    OPÉRATIONS, `concert*` CONCERTATION, `hebergement` l'hébergement web,
 *    `climat*` le génie climatique, `ferme` la charpente) — en cas de doute,
 *    préférer le mot exact au préfixe ;
 *  - un terme peut appartenir à plusieurs groupes (ex. `precarite*`) ;
 *  - les groupes « entreprises » relient un groupe industriel à ses filiales
 *    présentes dans les données DECP (ex. Vinci → Sogea, GTM, Eurovia).
 *
 * Vérification : `node scripts/audit-search-synonyms.mjs` (cas de régression
 * must-match / must-not-match + scan des termes trop génériques).
 */

const GROUPS: string[][] = [
  // --- Identités, publics ---
  // « gay » exact : `gay*` matchait les patronymes GAYE, GAYET, GAYNO…
  ["lgbt*", "queer*", "gay", "gays", "gai", "gais", "gaie", "gaies", "lesb*", "bisexuel*", "transgenre*", "transidentit*", "homosexuel*", "fierte", "fiertes", "pride"],
  ["femme", "femmes", "femin*", "women", "matrimoine"],
  ["migrant*", "refugie*", "exil*", "asile", "immigr*", "refugee*", "sans papiers", "mna", "mineurs isoles"],
  ["handicap*", "malvoyant*", "malentendant*", "sourd", "sourds", "sourde*", "aveugle*", "autis*", "trisomi*", "disabilit*", "disabled", "psh"],
  // « hebergement » seul matchait l'hébergement web (audit) — phrase complète.
  ["sans abri", "sdf", "sans domicile", "hebergement d urgence", "homeless*", "maraude*", "grande exclusion", "precarite*", "shelter*"],
  ["pauvrete*", "precarite*", "exclusion", "poverty"],
  ["senior*", "aines", "ainees", "personnes agees", "agees", "retraite*", "ehpad", "vieillesse", "gerontolog*", "alzheimer", "elderly"],
  ["enfant*", "enfance", "creche*", "garderie*", "halte garderie", "assistante maternelle", "assistantes maternelles", "pmi", "nourrice*", "children", "kids", "childcare", "nursery*", "petite enfance", "parentalite"],
  ["jeune", "jeunes", "jeunesse", "adolescent*", "youth"],
  ["etudiant*", "universite*", "student*", "campus"],
  ["detenu*", "prison*", "carceral*", "incarcer*"],
  ["gens du voyage", "roms", "tsigane*"],
  // --- Thèmes ---
  // « parks » retiré : matchait ROSA PARKS (audit).
  ["parc", "parcs", "park", "jardin*", "square*", "espace vert", "espaces verts", "vegetalisation", "potager*", "horticult*"],
  ["arbre*", "elagage*", "plantation*", "canopee"],
  ["velo*", "cyclable*", "cycliste*", "cyclisme", "vtt", "bicyclette*", "bike*", "cycling"],
  ["tramway*", "metro", "bus", "rer"],
  ["stationnement*", "parking*"],
  // « climat » exact : `climat*` matchait le génie climatique / la clim (audit).
  ["environnement*", "ecolog*", "climat", "biodiversite", "environment*", "transition ecologique"],
  ["dechet*", "recycl*", "compost*", "tri selectif", "ressourcerie*", "waste", "ordures", "poubelle*", "encombrants"],
  // Solaire ≠ synonyme d'énergie : groupes séparés, sinon « solaire »
  // remontait tous les contrats EIFFAGE ENERGIE (audit).
  ["energie*", "energet*", "energy"],
  ["solaire*", "photovolta*", "renouvelable*"],
  ["chauffage*", "chaufferie*", "thermique*", "climatisation*", "genie climatique", "heating"],
  ["eau", "eaux", "assainissement", "water"],
  ["logement*", "habitat*", "housing", "hlm", "bailleur*", "foyer*", "residence sociale"],
  ["emploi*", "insertion", "chomage", "chomeur*", "employment", "job", "jobs"],
  ["formation*", "apprentissage", "apprenti*", "alternance", "training"],
  ["numerique*", "informatique*", "digital*", "internet", "logiciel*", "cyber*", "intelligence artificielle"],
  // « soin » singulier retiré : matchait le soin des arbres (audit).
  ["sante", "soins", "medical*", "medecin*", "health", "hopital*", "hospitalier*", "clinique*"],
  ["psychiatri*", "psycholog*", "sante mentale", "mental health", "psychique*"],
  // « alcool » exact : `alcool*` matchait « boissons non alcoolisées » (audit).
  ["addicti*", "toxicoman*", "drogue*", "alcool", "alcoolisme", "tabac", "stupefiant*"],
  ["alimentation", "alimentaire*", "cantine*", "repas", "food", "cuisine*", "epicerie*"],
  // « ferme(s) » retiré : charpente ferme, parkings fermés (audit).
  ["agricult*", "maraich*", "agriculture urbaine", "farming", "agroecolog*"],
  ["education*", "scolaire*", "ecole*", "school*", "enseignement*", "pedagog*", "soutien scolaire", "aide aux devoirs"],
  ["culture", "cultures", "culturel*", "artistique*", "art", "arts"],
  ["theatre*", "theater", "scene*", "spectacle*", "dramatique*"],
  // « concert »/« opera » exacts : les préfixes matchaient CONCERTATION et
  // OPÉRATIONS/OPÉRATEUR (audit).
  ["musique*", "musical*", "music", "concert", "concerts", "orchestre*", "chorale*", "opera", "operas", "conservatoire*"],
  ["danse*", "choregraph*", "dance", "ballet*"],
  ["cinema*", "film*", "audiovisuel*", "documentaire*"],
  ["livre*", "lecture*", "bibliotheque*", "librairie*", "library*", "book*", "litteraire*", "litterature"],
  ["musee*", "museum*", "patrimoine*", "patrimonial*", "heritage", "monument*", "archeolog*"],
  ["foot", "football*", "soccer", "futsal"],
  ["natation", "piscine*", "aquatique*", "baignade*", "swimming"],
  ["juridique*", "justice", "droit", "droits", "avocat*", "legal", "acces au droit"],
  ["violence*", "victime*"],
  ["commemoration*", "anciens combattants", "shoah", "deporte*"],
  ["humanitaire*", "ong", "solidarite internationale", "cooperation internationale"],
  // « charite* » retiré : matchait le Moulin de la Charité (audit).
  ["solidarite*", "entraide*", "caritatif*", "charity", "benevol*", "volunteer*"],
  ["discrimination*", "racisme", "antiracis*", "antisemit*", "egalite"],
  ["politique de la ville", "qpv", "quartiers populaires", "quartier populaire", "quartiers prioritaires"],
  ["animal", "animaux", "animalier*", "protection animale", "veterinaire*", "spa"],
  ["tourisme*", "touristique*", "tourism"],
  // --- Marchés publics (vocabulaire administratif ↔ courant) ---
  ["proprete", "nettoiement", "nettoyage*", "cleaning", "graffiti*"],
  ["punaise*", "nuisible*", "deratisation*", "desinsectisation*"],
  ["voirie*", "chaussee*", "trottoir*", "asphalte", "enrobe*", "road", "roads", "voie publique"],
  ["eclairage*", "lampadaire*", "luminaire*", "lighting", "illumination*"],
  ["ravalement*", "facade*"],
  ["incendie*", "pompier*"],
  ["funeraire*", "cimetiere*", "crematorium*", "obseques"],
  // --- Groupes d'entreprises (filiales sans le nom du groupe) ---
  ["vinci", "sogea*", "gtm batiment", "eurovia*", "entreprise jean lefebvre"],
  ["bouygues*", "byes"],
];

/** Normalise pour la recherche : minuscules, sans accents ni ponctuation. */
export function normSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Term = { t: string; prefix: boolean };

const parseTerm = (raw: string): Term =>
  raw.endsWith("*") ? { t: raw.slice(0, -1), prefix: true } : { t: raw, prefix: false };

const PARSED_GROUPS: Term[][] = GROUPS.map((g) => g.map(parseTerm));

/** Le terme du dictionnaire matche-t-il ce mot tapé par l'utilisateur ? */
const termMatchesWord = (term: Term, word: string): boolean =>
  term.prefix ? word.startsWith(term.t) : word === term.t;

/** Le terme apparaît-il dans le haystack normalisé (en début de mot) ? */
const termInText = (term: Term, paddedHay: string): boolean =>
  paddedHay.includes(term.prefix ? ` ${term.t}` : ` ${term.t} `);

/** Synonymes d'un mot ou d'une expression tapée (hors le terme lui-même). */
function altsFor(typed: string): Term[] {
  const out: Term[] = [];
  for (const group of PARSED_GROUPS) {
    if (!group.some((term) => termMatchesWord(term, typed))) continue;
    for (const term of group) {
      if (termMatchesWord(term, typed)) continue;
      if (!out.some((o) => o.t === term.t && o.prefix === term.prefix)) out.push(term);
    }
  }
  return out;
}

export type ExpandedQuery = {
  /** Requête entière normalisée (comportement historique : substring). */
  qNorm: string;
  /** Synonymes de la requête entière (expressions multi-mots incluses). */
  queryAlts: Term[];
  /** Chaque mot tapé avec ses synonymes. */
  tokens: { token: string; alts: Term[] }[];
};

export function expandQuery(query: string): ExpandedQuery {
  const qNorm = normSearch(query);
  const tokens = qNorm.length
    ? qNorm.split(" ").map((token) => ({ token, alts: altsFor(token) }))
    : [];
  return { qNorm, queryAlts: qNorm.includes(" ") ? altsFor(qNorm) : [], tokens };
}

export type SearchMatch = {
  match: boolean;
  /** Synonymes ayant permis le match — vide si le texte tapé suffisait. */
  via: string[];
};

const NO_MATCH: SearchMatch = { match: false, via: [] };
const DIRECT_MATCH: SearchMatch = { match: true, via: [] };

/**
 * Teste un texte déjà normalisé (normSearch) contre la requête étendue.
 * Le texte tapé matche en substring (comme avant) ; les synonymes matchent
 * en mot entier / début de mot, pour ne jamais surprendre.
 */
export function matchExpanded(hayNorm: string, exp: ExpandedQuery): SearchMatch {
  if (!exp.qNorm) return DIRECT_MATCH;
  if (hayNorm.includes(exp.qNorm)) return DIRECT_MATCH;
  const padded = ` ${hayNorm} `;
  for (const alt of exp.queryAlts) {
    if (termInText(alt, padded)) return { match: true, via: [alt.t] };
  }
  // Sinon : chaque mot tapé doit matcher, directement ou via un synonyme.
  if (exp.tokens.length === 0) return NO_MATCH;
  const via: string[] = [];
  for (const { token, alts } of exp.tokens) {
    if (hayNorm.includes(token)) continue;
    const hit = alts.find((alt) => termInText(alt, padded));
    if (!hit) return NO_MATCH;
    if (!via.includes(hit.t)) via.push(hit.t);
  }
  return { match: true, via };
}
