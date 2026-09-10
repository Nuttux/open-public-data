import data from "@/data/communes-fonctions.json";

/**
 * À quoi sert l'argent : la ventilation par fonction (écoles, culture, sport,
 * action sociale…) des dépenses de fonctionnement.
 *
 * Source : DGFiP, balances comptables « présentation croisée nature-fonction »
 * — le seul jeu national qui porte cet axe. Il ne couvre que les communes qui
 * votent par fonction (obligation au-dessus de 3 500 habitants), soit environ
 * 3 400 sur 34 900 : la section est donc conditionnée à sa présence.
 */
export type FonctionPart = {
  cle: string;
  libelle: string;
  libelle_en: string;
  montant: number;
  share: number;
};
export type CommuneFonctions = {
  total: number;
  nomenclature: string;
  fonctions: FonctionPart[];
};
type File = {
  source: string;
  source_url: string;
  annee: number;
  scope: string;
  n_communes: number;
  communes: Record<string, CommuneFonctions>;
};
const F = data as File;

export function loadFonctions(insee: string): CommuneFonctions | null {
  const c = F.communes[insee];
  return c && c.fonctions.length > 0 ? c : null;
}
export const FONCTIONS_SOURCE = { label: F.source, url: F.source_url, annee: F.annee };
