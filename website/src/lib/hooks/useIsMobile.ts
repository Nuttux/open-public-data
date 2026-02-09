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
      setIsMobile(window.innerWidth < breakpoint);
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
