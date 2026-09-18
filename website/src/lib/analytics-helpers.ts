'use client';

/**
 * Shared analytics helpers — capture click coords (heatmaps), hash sensitive
 * query strings, and debounce helpers for search/filter tracking.
 */

import type { MouseEvent, RefObject } from 'react';

// ---------------------------------------------------------------------------
// Click coordinates — normalized for heatmap aggregation
// ---------------------------------------------------------------------------

export interface ClickCoords {
  x: number;
  y: number;
  x_pct: number; // 0-100, relative to viewport width
  y_pct: number; // 0-100, relative to viewport height
  page_y: number; // absolute, relative to page top
  page_y_pct: number; // 0-100, relative to full scroll height
  viewport_w: number;
  viewport_h: number;
}

export function getClickCoords(e: MouseEvent | globalThis.MouseEvent): ClickCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, 1);
  const pageY = e.clientY + window.scrollY;
  return {
    x: Math.round(e.clientX),
    y: Math.round(e.clientY),
    x_pct: Math.round((e.clientX / vw) * 100),
    y_pct: Math.round((e.clientY / vh) * 100),
    page_y: Math.round(pageY),
    page_y_pct: Math.round((pageY / docH) * 100),
    viewport_w: vw,
    viewport_h: vh,
  };
}

// ---------------------------------------------------------------------------
// Query text — hash + length, so we don't leak PII while still clustering
// popular searches.
// ---------------------------------------------------------------------------

export async function hashQuery(q: string): Promise<string> {
  if (!q) return '';
  const data = new TextEncoder().encode(q.toLowerCase().trim());
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Les propriétés d'une recherche, pour toutes les surfaces (fenêtre France,
 * champ Brésil). Jamais le texte tapé : une empreinte pour regrouper les
 * répétitions, la longueur, et le nombre de résultats — zéro résultat est le
 * signal qui dit ce qu'on ne sait pas trouver.
 *
 * Ne jette jamais. Tant que le hachage était attendu DANS l'appel qui envoie
 * l'événement, son échec faisait disparaître l'événement sans bruit :
 * search_modal_query n'est jamais arrivé à PostHog depuis le premier jour de
 * mesure, alors que les ouvertures et les sélections passaient (2026-09-18).
 */
export async function searchQueryProps(
  q: string,
  resultsCount: number,
  corpus: string,
): Promise<{ q_hash: string; q_len: number; results_count: number; corpus: string }> {
  const typed = q.trim();
  let q_hash = "";
  try {
    q_hash = await hashQuery(typed);
  } catch {
    q_hash = "";
  }
  return { q_hash, q_len: typed.length, results_count: resultsCount, corpus };
}

export function queryShape(q: string): {
  len: number;
  word_count: number;
  has_digit: boolean;
} {
  const trimmed = q.trim();
  return {
    len: trimmed.length,
    word_count: trimmed ? trimmed.split(/\s+/).length : 0,
    has_digit: /\d/.test(trimmed),
  };
}

// ---------------------------------------------------------------------------
// External-link auto-tracker — attach at component mount to track every
// outbound click within a ref'd container without modifying each <a>.
// ---------------------------------------------------------------------------

export function attachExternalLinkTracker(
  container: HTMLElement | null,
  track: (event: string, props: Record<string, unknown>) => void,
  source: string,
): () => void {
  if (!container) return () => {};

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handler = (ev: Event) => {
    const target = (ev.target as HTMLElement | null)?.closest?.('a');
    if (!target || !(target instanceof HTMLAnchorElement)) return;
    const href = target.href;
    if (!href) return;
    let isExternal = false;
    try {
      const u = new URL(href);
      isExternal = u.origin !== origin && u.protocol !== 'javascript:';
    } catch {
      return;
    }
    if (!isExternal) return;
    const url = new URL(href);
    track('external_link_click', {
      url: href,
      domain: url.hostname,
      text: target.textContent?.trim().slice(0, 80) || null,
      source_page: source,
      ...getClickCoords(ev as unknown as globalThis.MouseEvent),
    });
  };

  container.addEventListener('click', handler, { capture: true });
  return () => container.removeEventListener('click', handler, { capture: true } as EventListenerOptions);
}

// ---------------------------------------------------------------------------
// useExternalLinkTracker — React hook wrapper around the attach helper.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useTrack } from '@/lib/analyticsContext';

export function useExternalLinkTracker(
  ref: RefObject<HTMLElement | null>,
  source: string,
): void {
  const track = useTrack();
  useEffect(() => {
    if (!ref.current) return;
    return attachExternalLinkTracker(ref.current, track, source);
  }, [ref, track, source]);
}

// ---------------------------------------------------------------------------
// useDebouncedTrack — emits a single event once the user stops typing/changing
// filters. Useful for search_submit + filter_change.
// ---------------------------------------------------------------------------

import { useRef, useCallback } from 'react';

export function useDebouncedTrack(delayMs = 600): (
  eventName: string,
  properties: Record<string, unknown>,
) => void {
  const track = useTrack();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (eventName: string, properties: Record<string, unknown>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        track(eventName, properties);
      }, delayMs);
    },
    [track, delayMs],
  );
}
