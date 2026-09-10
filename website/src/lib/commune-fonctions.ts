import "server-only";
import { readCommuneJson } from "@/lib/commune-store";
import manifest from "@/data/communes-fonctions-manifest.json";

/**
 * À quoi sert l'argent : la ventilation par politique publique des dépenses de
 * fonctionnement, et ce qu'il y a dessous.
 *
 * Source : DGFiP, balances comptables « présentation croisée nature-fonction »
 * — le seul jeu national qui porte cet axe. Chaque ligne de la balance porte à
 * la fois une fonction ET un compte, donc la donnée descend à
 * fonction → domaine → nature. Elle ne couvre que les communes qui votent par
 * fonction, soit 3 248 sur 34 900 : la section est conditionnée à sa présence.
 *
 * Le détail vit dans le bucket privé (un fichier par commune, ~46 Ko), lu côté
 * serveur au rendu. Seul le manifeste — un résumé par slug, sans détail — est
 * engagé, pour que le résolveur de capacités reste local et instantané. Même
 * découpage que le budget, l'évolution, l'investissement et les marchés.
 */

type ManifestEntry = {
  insee: string;
  total: number;
  total_ventile: number;
  non_ventile: number;
  nomenclature: string;
  n_fonctions: number;
};
type Manifest = {
  source: string;
  source_url: string;
  bucket: string;
  annee: number;
  scope: string;
  n_communes: number;
  communes: Record<string, ManifestEntry>;
};
const M = manifest as Manifest;

const PREFIX = process.env.COMMUNE_FONCTIONS_PREFIX ?? "communes-fonctions";

/** Une ligne de détail : un domaine ou une nature de dépense. */
export type FonctionLigne = {
  code: string;
  libelle: string;
  libelle_en: string;
  montant: number;
  /** Ligne de reste — porte tout ce qui n'est pas dans les lignes affichées. */
  autres?: boolean;
};

export type SousFonction = FonctionLigne & {
  /** Absent sur la ligne de reste, qui n'a pas de détail à ouvrir. */
  natures?: FonctionLigne[];
};

export type FonctionPart = {
  cle: string;
  libelle: string;
  libelle_en: string;
  montant: number;
  /**
   * Part du ventilé. Négative pour les rares fonctions dont les annulations
   * d'exercices antérieurs dépassent les dépenses de l'année : à l'affichage
   * de ne pas leur dessiner de barre.
   */
  share: number | null;
  /** Sur quoi l'argent est parti : personnel, achats, subventions… */
  natures: FonctionLigne[];
  /**
   * Pour quoi : écoles maternelles, crèches, bibliothèques. Absent pour les
   * communes en M14 — la nomenclature fonctionnelle M14 n'est pas publiée dans
   * le jeu DGCL, et un libellé M57 y serait faux — et pour les communes qui
   * votent au niveau de la fonction, sans détail à montrer.
   */
  sous_fonctions?: SousFonction[];
};

export type CommuneFonctions = {
  source: string;
  source_url: string;
  source_libelles: string;
  annee: number;
  scope: string;
  commune: { insee: string; slug: string; nom: string };
  /** Toutes les dépenses de fonctionnement, ventilées ou non. */
  total: number;
  /** Ce qui est rattaché à une politique publique : le dénominateur des parts. */
  total_ventile: number;
  /** Rubrique 01 « opérations non ventilables » : dette, amortissements, fiscalité. */
  non_ventile: number;
  nomenclature: string;
  fonctions: FonctionPart[];
  /** Ce qu'il y a dans le non-ventilé, quand il y en a. */
  non_ventile_detail?: {
    libelle: string;
    libelle_en: string;
    montant: number;
    natures: FonctionLigne[];
  };
};

/** La commune a-t-elle une ventilation par fonction ? Réponse locale, instantanée. */
export function communeHasFonctions(slug: string): boolean {
  const e = M.communes[slug];
  return Boolean(e && e.n_fonctions > 0);
}

export async function loadCommuneFonctions(slug: string): Promise<CommuneFonctions | null> {
  if (!communeHasFonctions(slug)) return null;
  const d = await readCommuneJson<CommuneFonctions>(`${PREFIX}/${slug}/fonctions.json`);
  return d && d.fonctions.length > 0 ? d : null;
}

export const FONCTIONS_SOURCE = { label: M.source, url: M.source_url, annee: M.annee };
