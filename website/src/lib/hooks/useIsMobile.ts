/**
 * Hook useIsMobile - Détection de la taille d'écran
 * 
 * Retourne true si l'écran est < breakpoint (default 768px)
 * Utilisé pour adapter les visualisations au mobile.
 */

import { useState, useEffect } from 'react';

/**
 * Breakpoints standard (Tailwind)
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

/**
 * Hook pour détecter si on est sur mobile
 * @param breakpoint - Seuil en pixels (default: md = 768px)
 * @returns true si window.innerWidth < breakpoint
 */
export function useIsMobile(breakpoint: number = BREAKPOINTS.md): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check initial
    const checkMobile = () => {
      const newIsMobile = window.innerWidth < breakpoint;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/1f8e710b-4d17-470f-93f7-199824cb8279',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useIsMobile.ts:32',message:'checkMobile called',data:{windowWidth:window.innerWidth,breakpoint,newIsMobile,currentIsMobile:isMobile},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      setIsMobile(newIsMobile);
    };

    // Initial check
    checkMobile();

    // Listen for resize
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Hook pour obtenir la largeur de l'écran
 * @returns width en pixels
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return width;
}

export default useIsMobile;
