/**
 * GlossaryTip - Icône d'info contextuelle pour les termes budgétaires
 *
 * Desktop : tooltip au hover (rendu dans un portal pour éviter le clipping
 *           par les parents backdrop-blur/overflow)
 * Mobile  : tap ouvre le GlossaryDrawer sur le terme concerné
 *
 * Usage:
 *   <span>Recettes propres <GlossaryTip term="recettes_propres" /></span>
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '@/lib/glossary';
import { useGlossary } from '@/lib/glossaryContext';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

interface GlossaryTipProps {
  /** Clé du terme dans le glossaire (ex: "recettes_propres") */
  term: string;
}

/** Largeur fixe du tooltip en pixels */
const TOOLTIP_WIDTH = 260;
/** Marge par rapport aux bords de l'écran */
const VIEWPORT_PADDING = 12;

export default function GlossaryTip({ term }: GlossaryTipProps) {
  const definition = GLOSSARY[term];
  const { openTerm } = useGlossary();
  const isMobile = useIsMobile();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // Si le terme n'existe pas dans le glossaire, ne rien afficher
  if (!definition) return null;

  /**
   * Sur mobile : ouvre le drawer directement.
   * Sur desktop : le tooltip portal suffit, mais le clic ouvre aussi le drawer
   * pour les utilisateurs clavier / accessibilité.
   */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openTerm(term);
  };

  /**
   * Calcule la position fixe du tooltip au-dessus du bouton.
   * Utilise getBoundingClientRect pour échapper aux stacking contexts.
   */
  const showTooltip = useCallback(() => {
    if (isMobile || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    // Centrer horizontalement sur le bouton, clamper aux bords du viewport
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING));

    setTooltipPos({
      top: rect.top - 8, // 8px de marge au-dessus du bouton
      left,
    });
  }, [isMobile]);

  const hideTooltip = useCallback(() => {
    setTooltipPos(null);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-label={`Définition : ${definition.label}`}
        className="inline-flex items-center align-middle ml-1 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-full"
      >
        {/* Icône info (?) */}
        <span className="flex items-center justify-center w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold leading-none text-slate-500 hover:text-slate-300 hover:border-slate-400 transition-colors">
          ?
        </span>
      </button>

      {/* Tooltip rendu dans un portal — échappe à tout overflow/stacking context */}
      {tooltipPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: tooltipPos.top,
              left: tooltipPos.left,
              width: TOOLTIP_WIDTH,
              transform: 'translateY(-100%)',
            }}
            className="z-[80] p-3 rounded-lg shadow-xl bg-slate-800 border border-slate-600 text-left text-xs text-slate-300 leading-relaxed animate-[fadeIn_150ms_ease-out] pointer-events-none"
          >
            <strong className="block text-slate-100 mb-1">
              {definition.label}
            </strong>
            {definition.plain}
            {definition.analogy && (
              <span className="block mt-1.5 text-slate-400 italic text-[11px]">
                {definition.analogy}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
