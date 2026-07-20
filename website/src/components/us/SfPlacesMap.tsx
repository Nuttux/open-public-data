"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as LMap, Marker as LMarker } from "leaflet";
import type { SfPlaceIndexEntry } from "@/lib/us/sf-places-data";
import "leaflet/dist/leaflet.css";

/**
 * SF places map — same Leaflet/CARTO base as the Paris LieuxMap, rewritten
 * EN-only with San Francisco framing. Deliberately NOT a port of LieuxMap:
 * that file hardwires a Paris bounding box and an "inParis" guard that would
 * drop every SF marker into a "hors zone" path. Here the view fits the city
 * but panning/zoom is free, so the handful of out-of-city assets a place
 * seed carries (Hetch Hetchy, Camp Mather) remain reachable.
 */

// San Francisco proper — the default view. Panning beyond is allowed.
const SF_VIEW: [[number, number], [number, number]] = [
  [37.708, -122.515],
  [37.833, -122.355],
];

// Fine seed families → 5 display groups, using the repo's palette validated
// on the #fafaf7 surface (see LieuxMap: scripts/validate_palette.js).
const GROUP_OF: Record<string, string> = {
  park: "green", water: "green",
  library: "learning", culture: "learning",
  health: "health",
  civic: "civic",
  port: "infra", transit: "infra", fire: "infra",
};
export const GROUPS: { key: string; color: string; label: string }[] = [
  { key: "green", color: "#1baf7a", label: "Parks & water" },
  { key: "civic", color: "#1e45e4", label: "Civic buildings" },
  { key: "learning", color: "#c12323", label: "Libraries & culture" },
  { key: "health", color: "#4a3aa7", label: "Health" },
  { key: "infra", color: "#eda100", label: "Port, transit & fire" },
];
const COLOR: Record<string, string> = Object.fromEntries(GROUPS.map((g) => [g.key, g.color]));
export const colorForFamily = (family: string) => COLOR[GROUP_OF[family] ?? "civic"] ?? "#1e45e4";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export default function SfPlacesMap({
  places,
  active,
  onHover,
}: {
  places: SfPlaceIndexEntry[];
  active: Set<string>;
  onHover: (slug: string | null) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, LMarker>>({});
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const key = useMemo(() => places.map((p) => p.slug).join(","), [places]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!divRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current) return;

      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(divRef.current, {
        scrollWheelZoom: false,
        dragging: !isTouch,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 10,
        maxZoom: 17,
        fadeAnimation: false,
      });
      mapRef.current = map;

      // ⌘/Ctrl + wheel (or trackpad pinch) zooms; a bare wheel scrolls the page.
      let zooming = false;
      map.on("zoomend", () => { zooming = false; });
      divRef.current.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          if (zooming) return;
          zooming = true;
          if (e.deltaY < 0) map.zoomIn(0.5);
          else map.zoomOut(0.5);
        },
        { passive: false },
      );

      map.fitBounds(SF_VIEW, { padding: [2, 2] });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · © CARTO',
        maxZoom: 19,
        keepBuffer: 4,
        updateWhenZooming: false,
      }).addTo(map);

      const BOX = 26; // ≥24px hit target (WCAG 2.5.8); visual dot stays small
      for (const p of places) {
        const r = 6;
        const icon = L.divIcon({
          className: "fx-lieu-pin",
          html: `<span style="display:block;width:${r * 2}px;height:${r * 2}px;margin:${BOX / 2 - r}px;
                 border-radius:50%;background:${colorForFamily(p.family)};
                 border:2px solid #fafaf7;box-shadow:0 0 0 1px #0a0a0a"></span>`,
          iconSize: [BOX, BOX],
          iconAnchor: [BOX / 2, BOX / 2],
        });
        const m = L.marker([p.lat, p.lon], {
          icon,
          title: p.name,
          keyboard: false,
          riseOnHover: true,
        }).addTo(map);
        m.bindTooltip(
          `<div style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.03em">
             <b>${esc(p.name)}</b><br/>${esc(p.kind)}
             <br/><span style="opacity:.7">${p.n_documents} archive docs · open →</span>
           </div>`,
          { direction: "top", offset: [0, -8] },
        );
        m.on("click", () => routerRef.current.push(`/us/city/sf/places/place/${p.slug}`, { scroll: false }));
        m.on("mouseover", () => onHoverRef.current(p.slug));
        m.on("mouseout", () => onHoverRef.current(null));
        markersRef.current[p.slug] = m;
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [key, places]);

  // Family filter: hide the marker's DOM element (keeps click/tooltip wired).
  useEffect(() => {
    for (const p of places) {
      const el = markersRef.current[p.slug]?.getElement();
      if (el) el.style.display = active.has(GROUP_OF[p.family] ?? "civic") ? "" : "none";
    }
  }, [active, places]);

  return (
    <div
      ref={divRef}
      className="fx-lieux-map"
      style={{ height: 460, width: "100%", background: "#eef0ec", borderRadius: 2 }}
      role="application"
      aria-label="Map of San Francisco places"
    />
  );
}
