import type { Locale } from "@/lib/localeContext";

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

export type SectionKey =
  | "default"
  | "budget"
  | "dette"
  | "subventions"
  | "marches"
  | "logement"
  | "investissements";

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
  budget: [
    "Quelle part du budget part dans les salaires ?",
    "Paris dépense-t-elle plus que ce qu'elle vote ?",
    "Combien la Ville verse-t-elle au CASVP ?",
    "Combien coûte le ramassage des ordures ?",
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
    "What share of the budget goes to salaries?",
    "Does Paris spend more than it votes?",
    "How much does the City pay the CASVP?",
    "How much does garbage collection cost?",
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
};

export function getChatSuggestions(section: SectionKey, locale: Locale): string[] {
  return (locale === "en" ? EN : FR)[section];
}

export function sectionForPath(pathname: string): SectionKey {
  const m = pathname.match(/^\/ville\/[^/]+\/(budget|dette|subventions|marches|logement|investissements)(\/|$)/);
  return (m?.[1] as SectionKey) ?? "default";
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
