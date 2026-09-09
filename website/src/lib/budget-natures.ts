/**
 * Les natures de dépense en mots de tous les jours — la seconde lecture du
 * budget (« sous quelle forme l'argent sort »), à côté des postes (« à quoi il
 * sert »). Neuf groupes, définis une fois ici pour le ruban de la page budget,
 * le ruban de chaque fiche de poste et la fiche de nature.
 *
 * Chaque ligne du drilldown porte sa `flow_category` (Personnel, Subventions
 * (fonctionnement), Immobilisations en cours…) depuis le pipeline 2026-05-20 ;
 * un groupe est une liste de ces catégories. Ce qui n'est dans aucune liste
 * tombe dans « autres ».
 */

export type NatureKey =
  | "salaires"
  | "reverses"
  | "allocations"
  | "chantiers"
  | "contributions"
  | "subventions"
  | "achats"
  | "dette"
  | "autres";

export type NatureGroup = { key: NatureKey; flows: string[]; color: string };

export const NATURE_GROUPS: NatureGroup[] = [
  { key: "salaires", flows: ["Personnel"], color: "#2a3680" },
  { key: "reverses", flows: ["Reversements péréquation"], color: "#4a3aa7" },
  { key: "allocations", flows: ["Transferts sociaux"], color: "#6b5fc7" },
  { key: "chantiers", flows: ["Immobilisations en cours", "Immobilisations corporelles", "Études"], color: "#8c5e2a" },
  { key: "contributions", flows: ["Contributions obligatoires"], color: "#a67638" },
  { key: "subventions", flows: ["Subventions (fonctionnement)", "Subventions (investissement)"], color: "#c19a5b" },
  { key: "achats", flows: ["Achats", "Services extérieurs", "Autres services"], color: "#9099a6" },
  { key: "dette", flows: ["Remboursement dette", "Charges financières"], color: "#c12323" },
  { key: "autres", flows: [], color: "#c8ccd3" },
];

/** Le libellé de la fiche (majuscule initiale) ; le ruban utilise les clés
 *  i18n `fx.bud.v3.flow.*`, en minuscules, pour la légende. */
export const NATURE_LABELS: Record<NatureKey, { fr: string; en: string }> = {
  salaires: { fr: "Salaires", en: "Salaries" },
  reverses: { fr: "Reversements à l'État et aux communes", en: "Transfers to the State and other councils" },
  allocations: { fr: "Allocations aux personnes", en: "Benefits paid to people" },
  chantiers: { fr: "Chantiers et équipements", en: "Building and equipment" },
  contributions: { fr: "Contributions obligatoires", en: "Mandatory contributions" },
  subventions: { fr: "Subventions", en: "Grants" },
  achats: { fr: "Achats et prestations", en: "Purchases and services" },
  dette: { fr: "Dette", en: "Debt" },
  autres: { fr: "Autres dépenses", en: "Other spending" },
};

const FLOW_TO_KEY: Map<string, NatureKey> = new Map(
  NATURE_GROUPS.flatMap((g) => g.flows.map((f) => [f, g.key] as [string, NatureKey])),
);

/** Le groupe d'une catégorie de flux du pipeline ; « autres » par défaut. */
export function natureOfFlow(flow: string | undefined | null): NatureKey {
  return (flow && FLOW_TO_KEY.get(flow)) || "autres";
}

export function isNatureKey(s: string): s is NatureKey {
  return NATURE_GROUPS.some((g) => g.key === s);
}

export function natureColor(key: NatureKey): string {
  return NATURE_GROUPS.find((g) => g.key === key)?.color ?? "#c8ccd3";
}
