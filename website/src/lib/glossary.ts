/**
 * Glossaire des termes budgétaires - Source unique de vérité
 *
 * Utilisé par:
 * - GlossaryTip (info icons inline)
 * - GlossaryDrawer (glossaire complet)
 *
 * Chaque terme contient:
 * - label: nom affiché
 * - plain: explication en français courant (1-2 phrases)
 * - analogy: (optionnel) comparaison avec la vie quotidienne
 */

import type { ReactNode } from 'react';
import { GLOSSARY_ICONS } from '@/lib/icons';

/** Définition d'un terme du glossaire */
export interface GlossaryTerm {
  /** Clé unique du terme */
  key: string;
  /** Nom affiché */
  label: string;
  /** Explication en français courant (1-2 phrases) */
  plain: string;
  /** Comparaison avec la vie quotidienne (optionnel) */
  analogy?: string;
}

/** Section thématique du glossaire */
export interface GlossarySection {
  /** Titre de la section */
  title: string;
  /** Icône de la section */
  icon: ReactNode;
  /** Termes de la section */
  terms: GlossaryTerm[];
}

// ---------------------------------------------------------------------------
// Données du glossaire
// ---------------------------------------------------------------------------

export const GLOSSARY_SECTIONS: GlossarySection[] = [
  {
    title: 'Le budget au quotidien',
    icon: GLOSSARY_ICONS.budget,
    terms: [
      {
        key: 'recettes_propres',
        label: 'Recettes propres',
        plain:
          "L'argent que Paris gagne réellement : impôts locaux, dotations de l'État, loyers de ses bâtiments… sans compter les emprunts.",
        analogy: 'Comme votre salaire, sans compter un prêt bancaire.',
      },
      {
        key: 'depenses',
        label: 'Dépenses totales',
        plain:
          'Tout ce que Paris dépense dans l\'année : salaires des agents, entretien, aides sociales, grands travaux…',
      },
      {
        key: 'fonctionnement',
        label: 'Fonctionnement',
        plain:
          'Les dépenses du quotidien : salaires des agents, chauffage des écoles, entretien des rues.',
        analogy: 'Comme vos charges mensuelles (loyer, courses, abonnements).',
      },
      {
        key: 'investissement',
        label: 'Investissement',
        plain:
          'Les grands projets : construire une école, rénover un musée, créer une piste cyclable.',
        analogy: 'Comme acheter un appartement ou faire de gros travaux chez vous.',
      },
      {
        key: 'nature_vs_fonction',
        label: 'Nature vs Fonction',
        plain:
          'Deux façons de regarder les dépenses. Par fonction = à quoi ça sert (éducation, social…). Par nature = comment c\'est dépensé (personnel, achats, subventions…).',
      },
    ],
  },
  {
    title: 'La santé financière',
    icon: GLOSSARY_ICONS.sante,
    terms: [
      {
        key: 'epargne_brute',
        label: 'Épargne brute',
        plain:
          "Ce qui reste des recettes du quotidien après les dépenses du quotidien. C'est la capacité de Paris à financer ses grands projets sans emprunter.",
        analogy:
          'Ce que vous mettez de côté chaque mois après avoir payé toutes vos factures.',
      },
      {
        key: 'surplus_deficit',
        label: 'Surplus / Déficit',
        plain:
          'La différence entre ce que Paris gagne réellement et ce qu\'il dépense (emprunts exclus). Négatif = il faut emprunter pour boucler le budget.',
      },
      {
        key: 'solde_comptable',
        label: 'Équilibre comptable',
        plain:
          "Recettes moins Dépenses en comptant les emprunts. Toujours proche de zéro car le budget est voté à l'équilibre. Ce n'est PAS un indicateur de bonne santé.",
        analogy:
          'Si vous empruntez 1 000 € et dépensez 1 000 €, votre solde est 0… mais vous avez une dette.',
      },
    ],
  },
  {
    title: 'La dette',
    icon: GLOSSARY_ICONS.dette,
    terms: [
      {
        key: 'emprunts',
        label: 'Emprunts',
        plain:
          "L'argent que Paris emprunte auprès des banques pour financer ses investissements.",
      },
      {
        key: 'remboursement_principal',
        label: 'Remboursement du capital',
        plain:
          'La part des remboursements qui réduit réellement la dette (hors intérêts).',
        analogy:
          'Quand vous remboursez votre crédit immobilier, c\'est la part qui diminue le capital restant dû.',
      },
      {
        key: 'interets_dette',
        label: 'Intérêts de la dette',
        plain:
          'Le coût de l\'emprunt : ce que Paris paye aux banques pour avoir emprunté.',
      },
      {
        key: 'variation_dette_nette',
        label: 'Variation de la dette',
        plain:
          'Nouveaux emprunts moins remboursements. Positif = la dette de Paris augmente, négatif = elle diminue.',
      },
    ],
  },
  {
    title: 'Le patrimoine (Bilan)',
    icon: GLOSSARY_ICONS.patrimoine,
    terms: [
      {
        key: 'actif_net',
        label: 'Actif Net',
        plain:
          "La valeur totale de ce que Paris possède : bâtiments, routes, terrains, équipements… après déduction de l'usure.",
      },
      {
        key: 'fonds_propres',
        label: 'Fonds propres',
        plain:
          'La richesse accumulée par Paris au fil des années, sans compter les dettes.',
        analogy:
          'La valeur de votre maison moins ce que vous devez encore à la banque.',
      },
      {
        key: 'dette_totale',
        label: 'Dette totale',
        plain:
          "Tout ce que Paris doit : emprunts bancaires, fournisseurs, provisions pour risques…",
      },
      {
        key: 'ratio_endettement',
        label: "Ratio d'endettement",
        plain:
          "Dette divisée par Fonds propres. En dessous de 1 = la ville possède plus qu'elle ne doit. Au-dessus de 1 = attention.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Index rapide par clé (pour les GlossaryTip inline)
// ---------------------------------------------------------------------------

/** Map clé → définition pour accès O(1) */
export const GLOSSARY: Record<string, GlossaryTerm> = Object.fromEntries(
  GLOSSARY_SECTIONS.flatMap((s) => s.terms).map((t) => [t.key, t]),
);
