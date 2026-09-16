/**
 * Remote photos: which hosts Next may resize, and at what width.
 *
 * The City's CDN serves one size only — the original. On the worksite fiche
 * that meant 1,1 Mo per 88 px thumbnail and 5,9 Mo for the page (measured
 * 2026-09-16, 24 s to the largest paint on a slow 4G phone). Next's optimizer
 * resizes and re-encodes, but only for hosts declared in next.config.ts, so a
 * photo from anywhere else keeps a plain <img> rather than failing to render.
 */
export const OPTIMIZABLE_PHOTO_HOSTS = [
  "cdn.paris.fr",
  "a06-v7.apps.paris.fr",
  "upload.wikimedia.org",
  "www.leparisien.fr",
  "pariseine.fr",
  "www.paris.fr",
  "parisjetaime.com",
  "cdn-s-www.leparisien.fr",
] as const;

export function isOptimizablePhoto(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return OPTIMIZABLE_PHOTO_HOSTS.includes(new URL(url).hostname as (typeof OPTIMIZABLE_PHOTO_HOSTS)[number]);
  } catch {
    return false;
  }
}
