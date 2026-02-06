/**
 * GlossaryContext - État global du glossaire
 *
 * Permet à n'importe quel GlossaryTip d'ouvrir le drawer/bottom-sheet
 * et à Navbar d'ouvrir le glossaire complet. Un seul provider,
 * placé dans le layout racine.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

/** État exposé par le contexte */
interface GlossaryState {
  /** Est-ce que le drawer est ouvert ? */
  isOpen: boolean;
  /** Clé du terme à mettre en surbrillance (null = vue complète) */
  highlightedTerm: string | null;
  /** Ouvre le drawer sur un terme spécifique */
  openTerm: (key: string) => void;
  /** Ouvre le drawer en mode glossaire complet */
  openFull: () => void;
  /** Ferme le drawer */
  close: () => void;
}

const GlossaryContext = createContext<GlossaryState | null>(null);

/**
 * Hook pour accéder au contexte du glossaire
 * @throws si utilisé hors du Provider
 */
export function useGlossary(): GlossaryState {
  const ctx = useContext(GlossaryContext);
  if (!ctx) {
    throw new Error('useGlossary must be used within <GlossaryProvider>');
  }
  return ctx;
}

/** Props du provider */
interface GlossaryProviderProps {
  children: ReactNode;
}

/**
 * Provider global du glossaire
 * À placer dans le layout racine (app/layout.tsx)
 */
export function GlossaryProvider({ children }: GlossaryProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedTerm, setHighlightedTerm] = useState<string | null>(null);

  const openTerm = useCallback((key: string) => {
    setHighlightedTerm(key);
    setIsOpen(true);
  }, []);

  const openFull = useCallback(() => {
    setHighlightedTerm(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Reset après l'animation de fermeture (300ms)
    setTimeout(() => setHighlightedTerm(null), 300);
  }, []);

  return (
    <GlossaryContext.Provider
      value={{ isOpen, highlightedTerm, openTerm, openFull, close }}
    >
      {children}
    </GlossaryContext.Provider>
  );
}
