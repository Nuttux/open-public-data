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
 * Mapping axe "service" (libellé direction/mission présent dans le dump
 * investissements_complet_YYYY.json) → axe "M57 fonctionnel" (libellé
 * chapitre budgétaire présent dans investissement_tendances.json).
 *
 * Les deux classifications ne se recouvrent pas parfaitement : la barre
 * « Ce que la Ville construit » s'appuie désormais sur l'axe M57 (qui
 * couvre 100 % du budget investissement), et la fiche chapitre résout
 * les projets via cette table.
 */
export const SERVICE_TO_M57: Record<string, string> = {
  "Voirie": "Transports",
  "Affaires Scolaires": "Enseignement",
  "Affaires Culturelles": "Culture & Sport",
  "Jeunesse et Sports": "Culture & Sport",
  "Environnement": "Environnement",
  "Famille": "Santé & Social",
  "Décentralisation": "Services Généraux",
};

export function serviceToM57(serviceLabel: string | null | undefined): string | null {
  if (!serviceLabel) return null;
  return SERVICE_TO_M57[serviceLabel] ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Types partagés pour la résolution de photo — le loader vit côté serveur
// (fusion-data.ts), ces types sont ré-exportés ici pour que les composants
// client puissent les typer sans importer fs/path.
// ───────────────────────────────────────────────────────────────────────────

/** Une photo générique issue de la banque curée par typologie. */
export type GenericPhotoEntry = {
  url: string | null;
  label: string;
  credit?: string | null;
  source_label?: string | null;
  source?: string | null;
};

/** Décision photo LLM pré-résolue par projet. `decision` détermine le rendu :
 *  "photo_dediee" → photo_url + credit ; "generique_typologique" → fallback
 *  sur `generic` de la typologie ; "pictogramme" → SVG. */
export type ProjetPhotoDecision = {
  decision: "photo_dediee" | "generique_typologique" | "pictogramme" | string;
  photo_url?: string | null;
  credit?: string | null;
  source_label?: string | null;
  source?: string | null;
  score?: number | null;
  rationale?: string | null;
};

/** Bundle résolu côté serveur, passé en props aux composants client. */
export type ProjetPhotoResolved = {
  photo: ProjetPhotoDecision | null;
  generic: GenericPhotoEntry | null;
  typologie: string | null;
};

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
