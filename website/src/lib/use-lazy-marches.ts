"use client";

/**
 * Lazy client-side load of the full contract list for a marchés page.
 *
 * The full-year table used to be serialized into the RSC payload
 * (MarchesPageData.allMarches — ~700 kB of HTML for Paris). It now stays out
 * of the server props: this hook fetches the public
 * /data/<city>/marches-publics/marches_<year>.json file (plus the FR/EN
 * vulgarization caches for the clear-language labels) when the section
 * approaches the viewport or on first user interaction — the same pattern as
 * QuiRecoitExplorer's search index and SubventionsBeeswarm.
 *
 * Shaping is delegated to lib/marches-shape (pure module) so the result is
 * identical to what the server used to send.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cityDataUrl } from "@/lib/city-paths";
import {
  marchesFileRows,
  mergeMarcheVulgLabels,
  shapeAllMarches,
  type MarcheVulgLabels,
  type RawMarchesFile,
  type ShapedMarche,
} from "@/lib/marches-shape";

type VulgFile = { items?: Record<string, { objet_clair?: string }> };

export function useLazyMarches(citySlug: string, year: number) {
  const [items, setItems] = useState<ShapedMarche[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marchesUrl = cityDataUrl(citySlug, `marches-publics/marches_${year}.json`);

  // One attempt per URL (year change → new URL → refetch, no stale data).
  // A failed fetch is not retried on re-render — same guard as
  // QuiRecoitExplorer's searchFetchedRef, avoids error → re-render loops.
  const fetchedUrlRef = useRef<string | null>(null);
  // Vulgarization caches don't depend on the year — fetch them once per city
  // and share the promise across year changes.
  const vulgPromiseRef = useRef<{ city: string; promise: Promise<MarcheVulgLabels> } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const ensureFetch = useCallback(() => {
    if (fetchedUrlRef.current === marchesUrl) return;
    fetchedUrlRef.current = marchesUrl;
    setLoading(true);
    setError(null);

    if (!vulgPromiseRef.current || vulgPromiseRef.current.city !== citySlug) {
      const tolerant = (rel: string) =>
        fetch(cityDataUrl(citySlug, rel))
          .then((r) => (r.ok ? (r.json() as Promise<VulgFile>) : null))
          .catch(() => null);
      vulgPromiseRef.current = {
        city: citySlug,
        promise: Promise.all([
          // EN file may not exist for every city (e.g. Marseille) — a miss
          // only drops the clear-language labels, never fails the list.
          tolerant("enrichment/vulgarization_marches.json"),
          tolerant("enrichment/vulgarization_marches_en.json"),
        ]).then(([fr, en]) => mergeMarcheVulgLabels(fr, en)),
      };
    }
    const vulgPromise = vulgPromiseRef.current.promise;

    // Guard against out-of-order responses: if the user changes year while a
    // fetch is in flight, only the response for the *current* URL may land.
    const urlForThisFetch = marchesUrl;
    const isCurrent = () => fetchedUrlRef.current === urlForThisFetch;
    Promise.all([
      fetch(marchesUrl).then((r) =>
        r.ok ? (r.json() as Promise<RawMarchesFile>) : Promise.reject(new Error(`HTTP ${r.status}`)),
      ),
      vulgPromise,
    ])
      .then(([file, vulg]) => {
        if (!isCurrent()) return;
        setItems(shapeAllMarches(marchesFileRows(file), vulg));
      })
      .catch((err: Error) => {
        if (!isCurrent()) return;
        setError(err.message);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [marchesUrl, citySlug]);

  // Year change: drop the previous year's list so the UI shows the loading
  // state instead of stale rows while the new file arrives.
  useEffect(() => {
    if (fetchedUrlRef.current && fetchedUrlRef.current !== marchesUrl) {
      setItems(null);
      setError(null);
    }
  }, [marchesUrl]);

  // Lazy fetch when the section approaches the viewport (same rootMargin as
  // SubventionsBeeswarm). ensureFetch is also called from interaction
  // handlers (focus/typing) as a belt-and-braces trigger.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) ensureFetch();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ensureFetch]);

  return { containerRef, items, loading, error, ensureFetch };
}
