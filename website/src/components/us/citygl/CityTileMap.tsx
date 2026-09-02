"use client";
/* ═══════════════════════════════════════════════════════════════════════
   CityTileMap — THE SAME CITY, DRAWN ONCE, FOR A PHONE.

   `CityGLMap` builds the city on the GPU from 166,166 footprints, and a phone
   cannot hold that: measured on an iPhone-class device the fabric alone is
   most of the memory the browser will give a tab, and every zoom band is a
   rebuild. So the phone does not build it. `scripts/render-city-tiles.mjs`
   drives the very same engine on a desktop and cuts what it draws into a
   tile pyramid, and this component shows THOSE — a map of pictures, which
   is the oldest trick in web mapping and the one that made maps usable on
   phones in the first place.

   WHAT IS STILL LIVE. The pictures are the city's fabric; everything WRITTEN
   on it is not baked in. `CityOverlay` — the same class the GPU page uses —
   draws the names, the marks and the chrome over the tiles every frame,
   from the same registers, at whatever size this screen is. The tile view is
   turned back into the `ViewCamera` it stands for (`tile-plane.ts`) and the
   overlay does not know it is over tiles.

   WHAT IS NOT HERE YET, deliberately: the record panel, tap-to-block, the
   year rail and the film. This is the first block — the city, readable and
   panning smoothly on a phone — and those are the next.

   ── LEAFLET, AND WHY NOT A HAND-ROLLED VIEWER ──────────────────────────
   The page already ships Leaflet for the places map; it gives pinch, inertia
   and tile scheduling for nothing, and `CRS.Simple` is exactly "a pixel
   pyramid with no geography", which is what this is. Zoom is continuous
   (`zoomSnap: 0`) so a pinch does not step.

   THE ZOOM ANIMATION STAYS ON, AND THIS WAS MEASURED THE HARD WAY. The first
   draft turned it off so `getZoom()` was always the zoom on screen. But with
   the animation off every wheel tick and every pinch end goes through
   Leaflet's `_resetView`, which fires `viewprereset`, and the tile layer
   answers that by throwing away EVERY tile before the new level has loaded
   one: measured with a wheel-zoom sequence, 18–77 % of the frame was paper
   for a frame at every level change — Daniel: *"flashing lights when i zoom
   in and out"*. Animated, a level change scales the tiles it has and keeps
   them until the new ones land, which is the ordinary Leaflet experience.
   The type follows the animation's TARGET camera (`zoomanim` carries it), so
   for the 250 ms of a zoom the names are where they are about to be, and the
   tiles catch up.
   ═══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import type { Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";

import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { TerrainField, type TerrainProj } from "@/lib/city/terrain";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import { CityOverlay } from "@/lib/citygl/overlay";
import { TILE_CSS, tilePlane, type TileIndex } from "@/lib/citygl/tile-plane";
import { useT } from "@/lib/localeContext";

export interface CityTileMapProps {
  descriptor: CityDescriptor;
  /** which pyramid — a year the renderer wrote, or `now` */
  year?: string;
}

interface Stop {
  label: string;
  go: () => void;
}

export default function CityTileMap({ descriptor, year = "now" }: CityTileMapProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<readonly Stop[]>([]);
  const [zoomStop, setZoomStop] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    const div = mapDivRef.current;
    const labels = labelsRef.current;
    const base = descriptor.tilesBaseUrl;
    if (!host || !div || !labels) return;
    if (!base) {
      setFailed("this city ships no tile pyramid");
      return;
    }
    let dead = false;
    let map: LMap | null = null;
    let overlay: CityOverlay | null = null;
    let ro: ResizeObserver | null = null;
    let raf = 0;

    void (async () => {
      try {
        const [L, index, data] = await Promise.all([
          import("leaflet").then((m) => m.default),
          fetch(`${base}/${year}/index.json`).then((r) => {
            if (!r.ok) throw new Error(`tiles: index ${r.status}`);
            return r.json() as Promise<TileIndex>;
          }),
          CityData.load({ baseUrl: descriptor.dataBaseUrl }),
        ]);
        if (dead) return;

        /* THE SAME PROJECTION THE RENDERER DREW WITH. The pyramid's camera is
           in plane units, and plane units are `projection`'s at band 0 — the
           band every capture was posed on. */
        projection.setBand(0);
        await data.loadBase();
        if (dead) return;
        const chunk = data.get("base/terrain");
        if (!chunk) throw new Error("terrain: base/terrain has not landed");
        const proj = data.manifest.proj as unknown as TerrainProj;
        const field = new TerrainField(chunk, proj);

        const tp = tilePlane(index);
        const ll = (X: number, Y: number) => L.latLng(-Y, X);
        const extent = L.latLngBounds(ll(0, 0), ll(tp.w0, tp.h0));

        map = L.map(div, {
          crs: L.CRS.Simple,
          attributionControl: false,
          zoomControl: false,
          minZoom: 0,
          /* one level past the pyramid: a pinch may go a little closer than
             the deepest capture and the tiles simply scale */
          maxZoom: tp.zmax + 1,
          zoomSnap: 0,
          zoomDelta: 1,
          wheelPxPerZoomLevel: 120,
          fadeAnimation: false,
          markerZoomAnimation: false,
          inertia: true,
          bounceAtZoomLimits: false,
          maxBounds: extent.pad(0.25),
          maxBoundsViscosity: 0.8,
        });
        L.tileLayer(`${base}/${year}/{z}/{x}/{y}.webp`, {
          tileSize: TILE_CSS,
          minNativeZoom: 0,
          maxNativeZoom: tp.zmax,
          noWrap: true,
          bounds: extent,
          keepBuffer: 2,
          updateWhenZooming: true,
          updateInterval: 100,
          className: "fx-city-tile",
        }).addTo(map);

        /* ── THE WRITING, OVER THE PICTURES ────────────────────────────── */
        const schedule = () => {
          if (!raf) raf = requestAnimationFrame(draw);
        };
        const camOf = () => {
          const c = map!.getCenter();
          return tp.cameraOf(c.lng, -c.lat, map!.getZoom());
        };
        const draw = () => {
          raf = 0;
          if (!overlay || !map || dead) return;
          overlay.draw(camOf(), 0);
        };
        overlay = new CityOverlay({
          data,
          field,
          dataBaseUrl: descriptor.dataBaseUrl,
          requestFrame: schedule,
        });
        labels.appendChild(overlay.canvas);
        const size = () => {
          const r = host.getBoundingClientRect();
          overlay?.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
          schedule();
        };
        ro = new ResizeObserver(() => {
          map?.invalidateSize({ animate: false });
          size();
        });
        ro.observe(host);
        size();
        map.on("move zoom viewreset resize", schedule);
        map.on("zoomanim", (e) => {
          if (!overlay || dead) return;
          const a = e as unknown as { center: { lat: number; lng: number }; zoom: number };
          overlay.draw(tp.cameraOf(a.center.lng, -a.center.lat, a.zoom), 0);
        });

        /* ── THE STOPS ARE THE DESCRIPTOR'S, AS ON THE GPU PAGE ──────────
           The same four spans, fitted to 94 % of this stage's width the way
           `CityGLMap` fits them, then turned into a zoom on the pyramid. */
        const spanM = proj.N / proj.s;
        const mid: [number, number] = [proj.X0 + spanM / 2, proj.Y0 + spanM / 2];
        const zoomOf = (s: { spanM: number; at?: readonly [number, number] }) => {
          const at = s.at ?? mid;
          const c = projection.proj(at[0], at[1], 0);
          const across = Math.abs(projection.proj(at[0] + s.spanM, at[1], 0)[0] - c[0]);
          const W = host.getBoundingClientRect().width;
          const scale = (W * 0.94) / Math.max(1e-6, across);
          const [X, Y] = tp.toFrame(c[0], c[1]);
          return { at: ll(X, Y), zoom: Math.min(tp.zmax + 1, Math.max(0, tp.zoomFor(scale))) };
        };
        const built = descriptor.stops.map((s, i) => ({
          label: s.label,
          go: () => {
            const z = zoomOf(s);
            map?.setView(z.at, z.zoom, { animate: false });
            setZoomStop(i);
          },
        }));
        setStops(built);
        /* nearest stop, so the row says where the reader is after a pinch */
        map.on("zoomend", () => {
          if (!map) return;
          const z = map.getZoom();
          let best = 0;
          let d = Infinity;
          descriptor.stops.forEach((s, i) => {
            const dz = Math.abs(zoomOf(s).zoom - z);
            if (dz < d) { d = dz; best = i; }
          });
          setZoomStop(d < 0.5 ? best : -1);
        });

        const home = zoomOf(descriptor.stops[0]);
        map.setView(home.at, home.zoom, { animate: false });
        void overlay.load().then(schedule);
        setLoading(false);
      } catch (e) {
        if (!dead) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      dead = true;
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      overlay?.dispose();
      overlay = null;
      map?.remove();
      map = null;
    };
  }, [descriptor, year]);

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <div className="fx-city-tiles" ref={mapDivRef} />
          {/* the overlay's canvas goes in here, so React never reorders it
              under the chrome it renders after */}
          <div className="fx-city-tiles-labels" ref={labelsRef} />
          {!loading && stops.length ? (
            <div
              role="group"
              aria-label={t("us.sf.thecity.map.view")}
              className="fx-city-controls"
            >
              <span className="fx-city-controls-cap" aria-hidden="true">
                {t("us.sf.thecity.map.view_cap")}
              </span>
              {stops.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  className="fx-city-preset"
                  aria-pressed={zoomStop === i}
                  data-near={zoomStop < 0 && i === 0 ? "true" : undefined}
                  onClick={s.go}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {failed ? (
            <div className="fx-city-overlay">
              <p className="fx-city-loading">The map could not be loaded. {failed}</p>
            </div>
          ) : loading ? (
            <div className="fx-city-overlay">
              <p className="fx-city-loading">Drawing the city…</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
