/**
 * GlossaryTip - Icône d'info contextuelle pour les termes budgétaires
 *
 * Desktop : tooltip au hover (rendu dans un portal pour éviter le clipping
 *           par les parents backdrop-blur/overflow). Clic ne fait rien.
 * Mobile  : tap toggle un tooltip positionné au-dessus du bouton.
 *           Tap à l'extérieur ou second tap ferme le tooltip.
 *
 * Le glossaire complet reste accessible via le bouton dans la Navbar.
 *
 * Usage:
 *   <span>Recettes propres <GlossaryTip term="recettes_propres" /></span>
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '@/lib/glossary';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

interface GlossaryTipProps {
  /** Clé du terme dans le glossaire (ex: "recettes_propres") */
  term: string;
}

/** Largeur fixe du tooltip en pixels */
const TOOLTIP_WIDTH = 260;
/** Marge par rapport aux bords de l'écran */
const VIEWPORT_PADDING = 12;

/**
 * Calcule la position fixe du tooltip au-dessus d'un élément.
 * Clampe horizontalement aux bords du viewport.
 */
function computeTooltipPos(rect: DOMRect): { top: number; left: number } {
  let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  left = Math.max(
    VIEWPORT_PADDING,
    Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING),
  );
  return { top: rect.top - 8, left };
}

export default function GlossaryTip({ term }: GlossaryTipProps) {
  const definition = GLOSSARY[term];
  const isMobile = useIsMobile();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // Si le terme n'existe pas dans le glossaire, ne rien afficher
  if (!definition) return null;

  /**
   * Mobile : toggle le tooltip au tap.
   * Desktop : ne rien faire (le hover suffit).
   */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isMobile) return; // desktop — hover handles it

    // Toggle : fermer si déjà ouvert, sinon ouvrir
    if (tooltipPos) {
      setTooltipPos(null);
    } else if (buttonRef.current) {
      setTooltipPos(computeTooltipPos(buttonRef.current.getBoundingClientRect()));
    }
  };

  /**
   * Desktop hover : affiche le tooltip au survol.
   */
  const showTooltip = useCallback(() => {
    if (isMobile || !buttonRef.current) return;
    setTooltipPos(computeTooltipPos(buttonRef.current.getBoundingClientRect()));
  }, [isMobile]);

  const hideTooltip = useCallback(() => {
    if (isMobile) return; // mobile tooltip is dismissed by tap, not mouse
    setTooltipPos(null);
  }, [isMobile]);

  /**
   * Mobile : fermer le tooltip quand on touche en dehors du bouton.
   */
  useEffect(() => {
    if (!isMobile || !tooltipPos) return;

    const handleOutsideTap = (e: TouchEvent | MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setTooltipPos(null);
      }
    };

    // Délai court pour ne pas capturer le tap qui vient d'ouvrir le tooltip
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', handleOutsideTap, { passive: true });
      document.addEventListener('mousedown', handleOutsideTap);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', handleOutsideTap);
      document.removeEventListener('mousedown', handleOutsideTap);
    };
  }, [isMobile, tooltipPos]);

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
