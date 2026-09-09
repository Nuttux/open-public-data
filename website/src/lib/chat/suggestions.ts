import type { Locale } from "@/lib/localeContext";
import type { ChatScopeId } from "./scopes";

// Questions suggérées par section et par langue — la vitrine du chat.
// Règles éditoriales :
//  - viser d'abord la vie quotidienne (ordures, piscines…) puis les
//    croisements que les graphes ne peuvent pas faire (par habitant,
//    entité à travers plusieurs datasets) ;
//  - uniquement des questions VALIDÉES par l'éval (scripts/chat-eval.mjs) —
//    ne jamais suggérer une question dont la réponse est « pas dans mes données » ;
//  - teaser ≠ stat du hero de la page (la 1re question sert de teaser flottant).
// Le modèle répond dans la langue de la question — les questions EN suffisent
// à obtenir des réponses EN.

/** Pages sans teaser flottant : la page budget montre déjà ses deux lectures
 *  (postes et natures, chacune cliquable) ; on n'y pousse pas une question de
 *  plus tant que l'usage réel du chat n'a pas été lu dans les métriques.
 *  Décidé le 2026-09-09. Les suggestions restent dans le panneau ouvert. */
export const TEASER_OFF: ReadonlySet<string> = new Set(["budget"]);

export type SectionKey =
  | "default"
  | "budget"
  | "dette"
  | "subventions"
  | "marches"
  | "logement"
  | "investissements"
  // Rubrique propre à SF (Paris n'a pas de page paie).
  | "payroll";

const FR: Record<SectionKey, string[]> = {
  // 1res suggestions = vie quotidienne, neutres et impossibles à charter.
  // Règles (itérées avec Daniel) : jamais une question déjà affichée par une
  // page/carte ("bateau"), jamais une question éditorialement chargée en
  // vitrine (ex. cabinets de conseil — le bot y répond si on lui pose,
  // mais le site ne la met pas en avant : neutralité).
  default: [
    "Combien coûte le ramassage des ordures à Paris ?",
    "Combien Paris dépense-t-elle pour ses piscines ?",
    "Ça fait combien de dette par Parisien ?",
    "Paris est-elle en bonne santé financière ?",
  ],
  dette: [
    "Combien la Ville soutient-elle Paris Habitat au total ?",
    "Qui prête de l'argent à Paris ?",
    "Qui reçoit des garanties d'emprunt de la Ville ?",
    "La dette a-t-elle augmenté depuis 2019 ?",
  ],
  // « Quelle part du budget part dans les salaires ? » retirée le 2026-09-09 :
  // le ruban « sous quelle forme » l'affiche et la fiche Salaires y répond.
  // Le teaser doit rester une question que la page ne montre pas — le voté
  // contre l'exécuté n'est plus sur la page v3, il l'est.
  budget: [
    "Paris dépense-t-elle plus que ce qu'elle vote ?",
    "Combien la Ville verse-t-elle au CASVP ?",
    "Combien coûte le ramassage des ordures ?",
    "Combien Paris dépense-t-elle pour ses piscines ?",
  ],
  subventions: [
    "Combien la Ville soutient-elle Paris Habitat au total ?",
    "Qui sont les 5 plus gros bénéficiaires en 2024 ?",
    "Combien la Ville verse-t-elle à Emmaüs ?",
    "Quels secteurs captent le plus de subventions ?",
  ],
  marches: [
    "Combien coûte le ramassage des ordures ?",
    "Combien Paris dépense-t-elle pour ses piscines ?",
    "Combien en cabinets de conseil ?",
    "Quel est le plus gros marché notifié en 2024 ?",
  ],
  logement: [
    "La Ville garantit combien d'emprunts aux bailleurs sociaux ?",
    "Combien la Ville soutient-elle Paris Habitat au total ?",
    "Quel arrondissement est le plus tendu pour obtenir un logement ?",
    "Combien de demandes pour une attribution ?",
  ],
  investissements: [
    "Combien Paris dépense-t-elle pour ses piscines ?",
    "Dans quoi Paris investit-elle le plus ?",
    "L'investissement voté est-il vraiment dépensé ?",
    "Quel est le plus gros marché de travaux en 2024 ?",
  ],
  // Pas de page paie côté Paris : jamais atteint, gardé pour le typage.
  payroll: [],
};

const EN: Record<SectionKey, string[]> = {
  default: [
    "How much does garbage collection cost in Paris?",
    "How much does Paris spend on its swimming pools?",
    "How much city debt is that per Parisian?",
    "Is Paris financially healthy?",
  ],
  dette: [
    "How much does the City support Paris Habitat in total?",
    "Who lends money to Paris?",
    "Who gets loan guarantees from the City?",
    "Has the debt grown since 2019?",
  ],
  budget: [
    "Does Paris spend more than it votes?",
    "How much does the City pay the CASVP?",
    "How much does garbage collection cost?",
    "How much does Paris spend on its swimming pools?",
  ],
  subventions: [
    "How much does the City support Paris Habitat in total?",
    "Who are the 5 biggest recipients in 2024?",
    "How much does the City give Emmaüs?",
    "Which sectors capture the most subsidies?",
  ],
  marches: [
    "How much does garbage collection cost?",
    "How much does Paris spend on its swimming pools?",
    "How much goes to consulting firms?",
    "What is the biggest contract awarded in 2024?",
  ],
  logement: [
    "How much in social-housing loans does the City guarantee?",
    "How much does the City support Paris Habitat in total?",
    "Which arrondissement is the hardest to get social housing in?",
    "How many applications per allocation?",
  ],
  investissements: [
    "How much does Paris spend on its swimming pools?",
    "What does Paris invest in the most?",
    "Is the voted investment actually spent?",
    "What is the biggest works contract in 2024?",
  ],
  payroll: [],
};

// San Francisco — mêmes règles qu'en FR : rien qui tombe sur « pas dans mes
// données », rien qui double une stat déjà affichée par la page, rien
// d'éditorialement chargé en vitrine. Anglais uniquement : le scope SF répond
// en anglais par défaut.
// Reconstruit depuis la batterie d'éval du 2026-07-27 (31 questions, chaque
// chiffre reconfronté aux sorties d'outils). Retenu : les questions dont la
// réponse APPREND quelque chose qui n'est pas déjà sur la page. Écarté :
//  - « How much per resident ? » et « What is the total budget ? » → déjà dans
//    le hero de /budget ($15.9B, $19,269) ;
//  - « What does a typical employee earn ? » et « How many people does the
//    City employ ? » → déjà dans le hero de /payroll (médiane, effectif) ;
//  - tout ce dont la réponse est noyée sous les mises en garde de périmètre
//    (le per-habitant SF, à cause des fonds d'entreprise).
const SF: Record<SectionKey, string[]> = {
  // Vitrine = matérialité d'abord (comme les ordures et les piscines côté
  // Paris), mais les 4 slots visent QUATRE motifs d'arrivée différents, pas
  // les 4 meilleures réponses dans l'absolu :
  //   1. le service qui passe chez moi                 → poubelles
  //   2. le service que j'utilise tous les jours        → Muni
  //   3. qui touche l'argent (presse, veille citoyenne) → fournisseurs
  //   4. comment une ville marche / est-ce bien géré    → aéroport
  // Chacune corrige au passage une idée fausse (les poubelles ne sont pas
  // payées par le budget, la SFMTA est plus large que Muni, les plus gros
  // « fournisseurs » sont des banques, l'aéroport s'autofinance) et elles
  // couvrent quatre ordres de grandeur, de 119 M$ à 16,7 Md$.
  default: [
    "How much does it cost to collect the trash?",
    "How much does Muni cost to run?",
    "Which vendors were paid the most last fiscal year?",
    "Does the airport make money for the City?",
  ],
  budget: [
    "How much do San Francisco's public libraries cost?",
    "What does the fire department cost?",
    "Does the City spend what it budgets?",
    "Which departments get the biggest share of the budget?",
  ],
  marches: [
    "How much does it cost to collect the trash?",
    "How much does the City spend fixing streets and potholes?",
    "How many contracts are awarded without competition?",
    "How much of the City's contract money goes out as grants?",
  ],
  subventions: [
    "Which non-profits get the most money from the City?",
    "Which vendors were paid the most last fiscal year?",
    "How much does the City spend on the zoo?",
    "Which departments pay out the most?",
  ],
  payroll: [
    "Which jobs earn the most overtime?",
    "Which departments have the biggest payrolls?",
    "How does pay vary across the City workforce?",
    "How much of the budget goes to salaries and benefits?",
  ],
  // Sections sans équivalent SF : on retombe sur les questions générales.
  dette: [],
  logement: [],
  investissements: [],
};

/** The editorial tables, for lib/chat/chips.ts (ids, families, exploration pool). */
export const SUGGESTION_TABLES = { fr: FR, en: EN, sf: SF } as const;

export function getChatSuggestions(section: SectionKey, locale: Locale, scope: ChatScopeId = "paris"): string[] {
  // Une rubrique sans jeu propre retombe sur les questions générales du scope,
  // jamais sur un tableau vide (le panneau afficherait une liste morte).
  const table = scope === "sf" ? SF : locale === "en" ? EN : FR;
  return table[section].length ? table[section] : table.default;
}

/** Rubrique de la page courante — pilote seulement les questions suggérées. */
export function sectionForPath(pathname: string): SectionKey {
  const fr = pathname.match(/^\/fr\/city\/[^/]+\/(budget|dette|subventions|marches|logement|investissements)(\/|$)/);
  if (fr) return fr[1] as SectionKey;
  // SF : on mappe les rubriques US sur les mêmes clés pour garder un seul
  // jeu de sections (marches = contrats, subventions = paiements aux tiers).
  const sf = pathname.match(/^\/us\/city\/sf\/(budget|contracts|who-gets-paid|payroll)(\/|$)/);
  if (sf) {
    const key = { budget: "budget", contracts: "marches", "who-gets-paid": "subventions", payroll: "payroll" } as const;
    return key[sf[1] as keyof typeof key];
  }
  return "default";
}

// Événement interne « pose cette question » — écouté par ChatPanel.
// Préférer ceci aux liens ?q= pour les navigations client (le deep-link ?q=
// n'est lu qu'au premier montage du panneau).
export const CHAT_ASK_EVENT = "fod:chat:ask";

export function askChat(question: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHAT_ASK_EVENT, { detail: question }));
  }
}
