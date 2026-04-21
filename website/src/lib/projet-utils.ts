/**
 * Utilitaires purs pour les projets d'investissement — n'importent PAS fs/path
 * donc utilisables depuis les composants client (contrairement à fusion-data.ts).
 */

/** Slug URL-safe depuis un libellé de chapitre. */
export function slugifyChapitre(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Alias — same algorithm, kept under a generic name for budget/other usages. */
export const slugifyLabel = slugifyChapitre;

/**
 * Devine la typologie depuis le nom du projet — fallback déterministe quand
 * la vulgarisation LLM n'est pas dispo. Matching par mots-clés, du plus
 * spécifique au plus générique.
 */
export function guessTypologieFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const rules: [RegExp, string][] = [
    [/\b(creche|halte[- ]?garderie|multi[- ]?accueil|etablissement multi[- ]?accueil)\b/, "creche"],
    [/\becole\s+(elementaire|maternelle|polyvalente|primaire)\b/, "ecole"],
    [/\becole\b/, "ecole"],
    [/\b(college|groupe scolaire)\b/, "college"],
    [/\blycee\b/, "lycee"],
    [/\b(piscine|bassin ecole)\b/, "piscine"],
    [/\b(bibliotheque|mediatheque|discotheque)\b/, "bibliotheque"],
    [/\b(stade|centre sportif|skatepark|terrain (d['a-z ]*)?education physique|\btep\b|roller park)\b/, "gymnase"],
    [/\bgymnase\b/, "gymnase"],
    [/\b(parc|jardin|square|coulee verte|petite ceinture|bois|promenade|parvis|esplanade|ile aux cygnes)\b/, "espace-vert"],
    [/\b(rue|avenue|boulevard|place|carrefour|rond[- ]?point|trottoirs?|chaussee|voirie|piste cyclable|pavage|tapis|pont|passage|quai|allee|route|velorue)\b/, "voirie"],
    [/\b(embellir votre quartier|embellir.* quartier|reamenagement|amenagement urbain|budget participatif|rue apaisee|zone 30)\b/, "voirie"],
    [/\bmairie\b/, "administration"],
    [/\b(eglise|chapelle|cathedrale|basilique|temple)\b/, "equipement-culturel"],
    [/\b(theatre|conservatoire|musee|cinema|centre culturel|atelier(s)? beaux[- ]?arts|maison des? (refugies|air|associations)|pavillon de l'arsenal|institut des? cultures?)\b/, "equipement-culturel"],
    [/\b(logement|hlm|cite|residence sociale|hbm|habitat|copropriete)\b/, "logement-social"],
    [/\b(hopital|ehpad|centre medical|centre de sante|dispensaire|aide sociale a l'enfance)\b/, "equipement-sante"],
    [/\b(conservatoire municipal|centre paris anim|espace jeune)\b/, "equipement-culturel"],
  ];

  for (const [rx, typo] of rules) {
    if (rx.test(n)) return typo;
  }
  return null;
}
