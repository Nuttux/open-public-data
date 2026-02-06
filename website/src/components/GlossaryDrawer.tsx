/**
 * GlossaryDrawer - Panneau glossaire complet
 *
 * Affiche toutes les définitions budgétaires regroupées par thème.
 *
 * Desktop : slide-over panel depuis la droite (max-w-md)
 * Mobile  : bottom sheet plein écran avec scroll interne
 *
 * Fonctionnalités:
 * - Sections accordéon par thème
 * - Surlignage d'un terme spécifique quand ouvert via GlossaryTip
 * - Fermeture via bouton, Escape, ou clic sur le backdrop
 * - Transition animée (300ms, respecte prefers-reduced-motion)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GLOSSARY_SECTIONS, type GlossarySection } from '@/lib/glossary';
import { useGlossary } from '@/lib/glossaryContext';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

/**
 * Trouve la section contenant un terme donné
 */
function findSectionIndex(termKey: string): number {
  return GLOSSARY_SECTIONS.findIndex((s) =>
    s.terms.some((t) => t.key === termKey),
  );
}

export default function GlossaryDrawer() {
  const { isOpen, highlightedTerm, close } = useGlossary();
  const isMobile = useIsMobile();
  const drawerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sections ouvertes (par index). Par défaut toutes fermées sauf si highlightedTerm.
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  /**
   * Quand un terme est mis en surbrillance, ouvrir sa section et scroller
   */
  useEffect(() => {
    if (isOpen && highlightedTerm) {
      const idx = findSectionIndex(highlightedTerm);
      if (idx !== -1) {
        setOpenSections(new Set([idx]));
      }
      // Scroll vers le terme après le rendu
      requestAnimationFrame(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else if (isOpen && !highlightedTerm) {
      // Mode glossaire complet : ouvrir toutes les sections
      setOpenSections(new Set(GLOSSARY_SECTIONS.map((_, i) => i)));
    }
  }, [isOpen, highlightedTerm]);

  /** Toggle une section */
  const toggleSection = useCallback((idx: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  /** Fermer avec Escape */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  /** Empêcher le scroll du body quand le drawer est ouvert */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        aria-hidden="true"
        onClick={close}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Glossaire des termes budgétaires"
        className={`
          fixed z-[70] bg-slate-900 border-slate-700
          transition-transform duration-300 motion-reduce:duration-0
          flex flex-col overflow-hidden
          ${isMobile
            /* Mobile: bottom sheet plein écran */
            ? `inset-x-0 bottom-0 top-16 rounded-t-2xl border-t
               ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
            /* Desktop: slide-over droite */
            : `top-0 right-0 h-full w-full max-w-md border-l shadow-2xl
               ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 flex-shrink-0">
          {/* Poignée mobile */}
          {isMobile && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-600" />
          )}

          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Comprendre les chiffres
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Glossaire des termes budgétaires
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Fermer le glossaire"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {GLOSSARY_SECTIONS.map((section, sIdx) => (
            <SectionAccordion
              key={section.title}
              section={section}
              isOpen={openSections.has(sIdx)}
              onToggle={() => toggleSection(sIdx)}
              highlightedTerm={highlightedTerm}
              highlightRef={highlightRef}
            />
          ))}

          {/* Pied de page */}
          <p className="text-[11px] text-slate-500 pt-4 pb-2 text-center">
            Source : Compte Administratif de la Ville de Paris — Open Data Paris
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant : Section accordéon
// ---------------------------------------------------------------------------

interface SectionAccordionProps {
  section: GlossarySection;
  isOpen: boolean;
  onToggle: () => void;
  highlightedTerm: string | null;
  highlightRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Section du glossaire avec toggle accordéon
 */
function SectionAccordion({
  section,
  isOpen,
  onToggle,
  highlightedTerm,
  highlightRef,
}: SectionAccordionProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Section header (toggle) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">{section.icon}</span>
          <span className="text-sm font-semibold text-slate-200">
            {section.title}
          </span>
          <span className="text-xs text-slate-500">
            ({section.terms.length})
          </span>
        </span>

        {/* Chevron animé */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Terms list */}
      {isOpen && (
        <div className="divide-y divide-slate-700/30">
          {section.terms.map((term) => {
            const isHighlighted = highlightedTerm === term.key;
            return (
              <div
                key={term.key}
                ref={isHighlighted ? highlightRef : undefined}
                className={`
                  px-4 py-3 transition-colors duration-300
                  ${isHighlighted
                    ? 'bg-purple-500/10 border-l-2 border-purple-500'
                    : 'bg-slate-900/30'
                  }
                `}
              >
                <h4 className="text-sm font-medium text-slate-100">
                  {term.label}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {term.plain}
                </p>
                {term.analogy && (
                  <p className="text-[11px] text-slate-500 italic mt-1.5">
                    {term.analogy}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
