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
import frDict from '@/i18n/fr';

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
// Structure du glossaire (clés uniquement — pas de texte hardcodé)
// ---------------------------------------------------------------------------

interface TermDef {
  key: string;
  hasAnalogy: boolean;
}

interface SectionDef {
  titleKey: string;
  icon: ReactNode;
  terms: TermDef[];
}

const SECTION_DEFS: SectionDef[] = [
  {
    titleKey: 'glossary.section.budget',
    icon: GLOSSARY_ICONS.budget,
    terms: [
      { key: 'recettes_propres', hasAnalogy: true },
      { key: 'depenses', hasAnalogy: false },
      { key: 'fonctionnement', hasAnalogy: true },
      { key: 'investissement', hasAnalogy: true },
      { key: 'nature_vs_fonction', hasAnalogy: false },
      { key: 'budget_vote', hasAnalogy: true },
      { key: 'budget_execute', hasAnalogy: true },
      { key: 'enveloppe_marche', hasAnalogy: true },
    ],
  },
  {
    titleKey: 'glossary.section.sante',
    icon: GLOSSARY_ICONS.sante,
    terms: [
      { key: 'epargne_brute', hasAnalogy: true },
      { key: 'surplus_deficit', hasAnalogy: false },
      { key: 'solde_comptable', hasAnalogy: true },
    ],
  },
  {
    titleKey: 'glossary.section.dette',
    icon: GLOSSARY_ICONS.dette,
    terms: [
      { key: 'emprunts', hasAnalogy: false },
      { key: 'remboursement_principal', hasAnalogy: true },
      { key: 'interets_dette', hasAnalogy: false },
      { key: 'variation_dette_nette', hasAnalogy: false },
    ],
  },
  {
    titleKey: 'glossary.section.patrimoine',
    icon: GLOSSARY_ICONS.patrimoine,
    terms: [
      { key: 'actif_net', hasAnalogy: false },
      { key: 'fonds_propres', hasAnalogy: true },
      { key: 'dette_totale', hasAnalogy: false },
      { key: 'ratio_endettement', hasAnalogy: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build translated glossary from a t() function
// ---------------------------------------------------------------------------

type TFn = (key: string) => string;

/** Build GLOSSARY_SECTIONS using a translation function */
export function getGlossarySections(t: TFn): GlossarySection[] {
  return SECTION_DEFS.map((def) => ({
    title: t(def.titleKey),
    icon: def.icon,
    terms: def.terms.map((td) => ({
      key: td.key,
      label: t(`glossary.${td.key}.label`),
      plain: t(`glossary.${td.key}.plain`),
      analogy: td.hasAnalogy ? t(`glossary.${td.key}.analogy`) : undefined,
    })),
  }));
}

/** Build GLOSSARY map using a translation function */
export function getGlossaryMap(t: TFn): Record<string, GlossaryTerm> {
  return Object.fromEntries(
    getGlossarySections(t).flatMap((s) => s.terms).map((term) => [term.key, term]),
  );
}

// ---------------------------------------------------------------------------
// Static exports (French defaults, used by non-translated consumers)
// ---------------------------------------------------------------------------

const frT = (key: string) => frDict[key] ?? key;

export const GLOSSARY_SECTIONS: GlossarySection[] = getGlossarySections(frT);

/** Map clé → définition pour accès O(1) */
export const GLOSSARY: Record<string, GlossaryTerm> = Object.fromEntries(
  GLOSSARY_SECTIONS.flatMap((s) => s.terms).map((t) => [t.key, t]),
);
