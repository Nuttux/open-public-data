"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LMap, Marker as LMarker, LatLng } from "leaflet";
import type { PlaceEntry, PlacesConfig } from "./types";
import "leaflet/dist/leaflet.css";

// Internal Leaflet APIs used for the smooth fractional-zoom (move the pane at a
// fractional zoom, frame by frame, without the stepped animation). Stable
// across the whole 1.x line (we're pinned to ^1.9.4).
type LMapPrivate = {
  _move: (center: LatLng, zoom: number) => void;
  _moveStart: (zoomChanged: boolean, noMoveStart: boolean) => void;
  _moveEnd: (zoomChanged: boolean) => void;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Marker radius carried by the numeric metric (money for Paris), on a tight
 *  range (4.5→7.5px). sqrt so area ∝ amount; metric-less places keep the base. */
function radiusFor(v: number, max: number): number {
  return Math.round((4.5 + Math.sqrt(Math.max(v, 0) / Math.max(max, 1)) * 3) * 10) / 10;
}

/** Haversine distance in km. */
function dist(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Shared Leaflet/CARTO map for the places explorer. Colour = family (adapter),
 * size = metric (opt-in), click → fiche. Markers are built ONCE from every
 * entry; the `visibleSlugs` set toggles their DOM display so filtering never
 * rebuilds the map. `hovered` is shared with the list: the hovered marker rises
 * and the rest dim — that's what makes list and map two views of one state.
 */
export default function PlacesMap({
  entries,
  config,
  visibleSlugs,
  hovered,
  onHover,
}: {
  entries: PlaceEntry[];
  config: PlacesConfig;
  visibleSlugs: Set<string>;
  hovered: string | null;
  onHover: (slug: string | null) => void;
}) {
  const router = useRouter();
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, LMarker>>({});
  // The map is imperative: build it ONCE. Keep mutable inputs in refs so a
  // parent re-render (a hover is enough) never tears the map down and replays
  // fitBounds — that flickers and yanks the view back.
  const onHoverRef = useRef(onHover);
  const routerRef = useRef(router);
  const configRef = useRef(config);
  useEffect(() => { onHoverRef.current = onHover; routerRef.current = router; configRef.current = config; });

  const [geo, setGeo] = useState<{ state: "idle" | "loading" | "error" | "ok"; msg?: string }>({ state: "idle" });
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => { setIsTouch(window.matchMedia("(pointer: coarse)").matches); }, []);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of config.families) m[f.key] = f.color;
    return (key: string) => m[key] ?? config.families[0]?.color ?? "#4a3aa7";
  }, [config.families]);

  const maxMetric = useMemo(() => Math.max(...entries.map((e) => e.metric ?? 0), 1), [entries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!divRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current) return;
      const cfg = configRef.current;

      const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(divRef.current, {
        scrollWheelZoom: false, // native wheel would eat page scroll; handled below (⌘/pinch only)
        dragging: !touch,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: cfg.minZoom,
        maxZoom: cfg.maxZoom,
        // Leaflet cross-fades freshly-loaded tiles → reads as flicker on zoom. Off.
        fadeAnimation: false,
        // Paris stays a map OF Paris: clamp panning with a firm edge. SF pans
        // freely so its handful of out-of-city assets stay reachable.
        ...(cfg.clampToBounds
          ? { maxBounds: L.latLngBounds(cfg.bounds).pad(0.5), maxBoundsViscosity: 1.0 }
          : {}),
      });
      mapRef.current = map;

      // Smooth wheel/trackpad zoom (Leaflet.SmoothWheelZoom technique). Only on
      // ⌘/Ctrl+wheel and trackpad pinch (browser sends it with ctrlKey); a bare
      // wheel stays page scroll. We follow the gesture frame by frame via
      // `map._move()` at fractional zoom, and only commit (reload tiles) on end.
      const mp = map as unknown as LMap & LMapPrivate;
      const SENS = 0.0022; // zoom levels per wheel pixel
      const EASE = 0.3; // fraction of the gap closed per frame (soft inertia)
      let wheeling = false;
      let goalZoom = 0;
      let rafId = 0;
      let endTimer: ReturnType<typeof setTimeout> | null = null;
      let centerPt = map.getSize().divideBy(2);
      let wheelPt = centerPt;
      let startLatLng: LatLng = null as unknown as LatLng;
      let wheelStartLatLng: LatLng = null as unknown as LatLng;
      let moved = false;
      let prevZoom = 0;
      let prevCenter: LatLng = null as unknown as LatLng;

      const stepWheelZoom = () => {
        if (!mapRef.current) return;
        if (map.getZoom() !== prevZoom || !map.getCenter().equals(prevCenter)) { wheeling = false; return; }
        const z = Math.round((map.getZoom() + (goalZoom - map.getZoom()) * EASE) * 100) / 100;
        const delta = wheelPt.subtract(centerPt);
        const center =
          delta.x === 0 && delta.y === 0
            ? startLatLng
            : map.unproject(map.project(wheelStartLatLng, z).subtract(delta), z);
        if (!moved) { mp._moveStart(true, false); moved = true; }
        mp._move(center, z);
        prevZoom = map.getZoom();
        prevCenter = map.getCenter();
        rafId = requestAnimationFrame(stepWheelZoom);
      };

      const endWheelZoom = () => {
        wheeling = false;
        cancelAnimationFrame(rafId);
        if (moved && mapRef.current) mp._moveEnd(true);
      };

      divRef.current.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          if (!wheeling) {
            wheeling = true;
            moved = false;
            centerPt = map.getSize().divideBy(2);
            startLatLng = map.containerPointToLatLng(centerPt);
            wheelPt = map.mouseEventToContainerPoint(e);
            wheelStartLatLng = map.containerPointToLatLng(wheelPt);
            goalZoom = map.getZoom();
            map.stop();
            prevZoom = map.getZoom();
            prevCenter = map.getCenter();
            rafId = requestAnimationFrame(stepWheelZoom);
          }
          goalZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), goalZoom + L.DomEvent.getWheelDelta(e) * SENS));
          wheelPt = map.mouseEventToContainerPoint(e);
          if (endTimer) clearTimeout(endTimer);
          endTimer = setTimeout(endWheelZoom, 180);
        },
        { passive: false },
      );

      map.fitBounds(cfg.bounds, { padding: [2, 2] });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · © CARTO',
        maxZoom: 19,
        keepBuffer: 4,
        updateWhenZooming: false,
      }).addTo(map);

      const BOX = 26; // ≥24px hit target (WCAG 2.5.8); the visual dot stays fine
      for (const e of entries) {
        const r = cfg.radiusByMetric ? radiusFor(e.metric ?? 0, maxMetric) : 6;
        const icon = L.divIcon({
          className: "fx-lieu-pin",
          html: `<span style="display:block;width:${r * 2}px;height:${r * 2}px;margin:${BOX / 2 - r}px;
                 border-radius:50%;background:${colorOf(e.familyKey)};
                 border:2px solid #fafaf7;box-shadow:0 0 0 1px #0a0a0a"></span>`,
          iconSize: [BOX, BOX],
          iconAnchor: [BOX / 2, BOX / 2],
        });
        const m = L.marker([e.lat, e.lon], {
          icon,
          title: e.name, // accessible name; without it a role=button is anonymous (WCAG 4.1.2)
          keyboard: false,
          riseOnHover: true,
        }).addTo(map);
        const areaTip = e.areaLabel ? ` · ${esc(e.areaLabel)}` : "";
        const statTip = e.tooltipStat ? esc(e.tooltipStat) : "";
        m.bindTooltip(
          `<div style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.03em">
             <b>${esc(e.name)}</b><br/>${esc(e.kind)}${areaTip}${statTip}
             <br/><span style="opacity:.7">${esc(cfg.strings.tooltipCta)}</span>
           </div>`,
          { direction: "top", offset: [0, -8] },
        );
        m.on("click", () => routerRef.current.push(configRef.current.hrefFor(e.slug), { scroll: false }));
        m.on("mouseover", () => onHoverRef.current(e.slug));
        m.on("mouseout", () => onHoverRef.current(null));
        markersRef.current[e.slug] = m;
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [entries, maxMetric, colorOf]);

  // Filters (family / area / search) resolve to a single visible-slug set here;
  // we hide the marker's DOM element (click + tooltip stay wired for the return).
  useEffect(() => {
    for (const e of entries) {
      const el = markersRef.current[e.slug]?.getElement();
      if (el) el.style.display = visibleSlugs.has(e.slug) ? "" : "none";
    }
  }, [visibleSlugs, entries]);

  // Hover shared with the list: the hovered marker rises, the others fade.
  useEffect(() => {
    for (const e of entries) {
      const el = markersRef.current[e.slug]?.getElement();
      if (!el) continue;
      const dim = hovered !== null && hovered !== e.slug;
      el.style.opacity = dim ? "0.25" : "1";
      el.style.zIndex = hovered === e.slug ? "1000" : "";
      el.style.transition = "opacity .15s";
    }
  }, [hovered, entries]);

  /** "Near me" must ANSWER (how many, which, how far), not just move the camera
   *  — and say what happened on refusal or when out of the covered zone. */
  const locateMe = () => {
    const s = config.strings;
    if (!navigator.geolocation) { setGeo({ state: "error", msg: s.geoUnavailable ?? "" }); return; }
    setGeo({ state: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const me: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const near = entries.map((e) => ({ e, d: dist(me, [e.lat, e.lon]) })).sort((a, b) => a.d - b.d);
        if (!near.length) return;
        const [[south, west], [north, east]] = config.bounds;
        const inZone = me[0] >= south && me[0] <= north && me[1] >= west && me[1] <= east;
        if (!inZone) {
          setGeo({ state: "ok", msg: s.geoOutOfZone?.(Math.round(near[0].d).toLocaleString(config.locale)) ?? "" });
          return;
        }
        const proches = near.filter((n) => n.d <= 1);
        setGeo({
          state: "ok",
          msg: proches.length
            ? s.geoNear?.(proches.length, near[0].e.name) ?? ""
            : s.geoNone?.(near[0].e.name, near[0].d.toLocaleString(config.locale, { maximumFractionDigits: 1 })) ?? "",
        });
        const map = mapRef.current;
        if (!map) return;
        import("leaflet").then(({ default: L }) => {
          L.circleMarker(me, { radius: 6, color: "#0a0a0a", fillColor: "#fafaf7", fillOpacity: 1, weight: 2 }).addTo(map);
          map.setView(me, 14);
        });
      },
      () => setGeo({ state: "error", msg: s.geoRefused ?? "" }),
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <div>
      {config.nearMe && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button
            onClick={locateMe}
            disabled={geo.state === "loading"}
            style={{ border: "1px solid var(--ink)", background: "var(--bg)", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}
          >
            ◎ {geo.state === "loading" ? config.strings.nearMeLoading : config.strings.nearMe}
          </button>
        </div>
      )}

      {geo.msg && (
        <p aria-live="polite" style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, margin: "0 0 8px", color: geo.state === "error" ? "var(--rouge)" : "var(--ink-2)" }}>
          {geo.msg}
        </p>
      )}

      <section aria-label={config.strings.mapAria} ref={divRef} className="fx-lieux-map fx-places-map" style={{ border: "1px solid var(--ink)" }} />
      <p className="fx-chart-source" style={{ marginTop: 10 }}>
        <b>{isTouch ? config.strings.mapNoteTouch : config.strings.mapNote}</b>
      </p>
    </div>
  );
}
