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

   AND THE RECORD IS THE SAME RECORD. A tap asks the same `blockPicker` the
   GPU page asks, with the same camera, and the answer opens the same
   `CityBlockPanel` on the same shards (`block-records`); the search box is
   the same `CitySearch` and lands the same way. None of that is copied from
   the GPU map — it is imported from where that map imports it.

   AND THE YEAR IS A PYRAMID. On the GPU page the rail gates geometry by
   year, which is free; here a year is a picture that was rendered, so
   `render-city-years.mjs` renders one pyramid per year and `years.json`
   says which exist and how deep each goes. The rail shows the nearest year
   there is a picture for, at the deepest level it has, and the tiles scale
   past that; the type is gated by the exact year the reader asked for. A
   swap adds the new year's layer OVER the old one and takes the old one
   away when the new has loaded, so the city never shows paper between two
   years.

   WHAT IS NOT HERE YET, deliberately: the subject dots, the film and the
   URL state. This is the third block; those are the next.

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

   AND THE WHEEL IS NOT LEAFLET'S. With the animation on, a trackpad — which
   sends dozens of tiny deltas a second — became dozens of tiny 250 ms
   animations queued behind each other: Daniel, on the desktop, *"i can now
   only zoom in tiny increment"*. `PlacesMap.tsx` already solved this for the
   places map with the Leaflet.SmoothWheelZoom technique, and it is the same
   here: follow the gesture frame by frame through `map._move` at fractional
   zoom, which is exactly what a pinch does and keeps every tile it has, and
   commit — reload tiles — once, when the wheel has been quiet for 180 ms.
   A phone never reaches this code; it pinches.
   ═══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LatLng, Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";

import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { TerrainField, type TerrainProj } from "@/lib/city/terrain";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import { CityOverlay } from "@/lib/citygl/overlay";
import { blockPicker } from "@/lib/citygl/pick";
import { loadFineDem, meshElevAt } from "@/lib/citygl/layers/terrain";
import { TILE_CSS, tilePlane, type TileIndex } from "@/lib/citygl/tile-plane";
import { useT } from "@/lib/localeContext";
import CityBlockPanel, {
  type BlockContext,
  type UnitRequest,
} from "@/components/us/city/CityBlockPanel";
import CitySearch from "@/components/us/city/CitySearch";
import type { SearchHit } from "@/lib/us/city-search";
import {
  blockPlaceName,
  loadBlockIndex,
  loadBlockRecord,
  type BlockIndex,
  type BlockRecord,
} from "@/components/us/city/block-records";

export interface CityTileMapProps {
  descriptor: CityDescriptor;
  /** which pyramid to open on — a year the renderer wrote, or `now` */
  pyramid?: string;
}

interface Stop {
  label: string;
  go: () => void;
}

/* the rail's span — `CityGLMap.tsx` §THE RAIL'S OWN SPAN, the same numbers:
   the map's first year is 1906 and the settled present is `YEAR_MAX` */
const YEAR_MIN = 1906;
const YEAR_MAX = 2026;

/** what `render-city-years.mjs` writes beside the pyramids */
interface YearsFile {
  now: { zmax: number } | null;
  years: Record<string, { zmax: number }>;
}

/** the three private moves a pinch is made of — `PlacesMap.tsx` uses the same */
interface MapPrivate {
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): unknown;
  _move(center: unknown, zoom: number): unknown;
  _moveEnd(zoomChanged: boolean): unknown;
}

/**
 * What the mounted map can do for the React side — built inside the boot
 * effect, where the map, the picker and the overlay live, and reached from
 * the handlers through a ref so none of them has to be rebuilt when it does.
 */
interface MapApi {
  /** frame a block at a stop and light its ring; the index position */
  showBlock(pos: number, stop: number): void;
  /** clear the ring and the pin */
  clear(): void;
  /** which stop the view is nearest, or -1 between two */
  nearestStop(): number;
  /** the name under the pin, once the record says what it is */
  label(s: string | null): void;
  /** show a year — the nearest rendered pyramid, the exact year for the type */
  setYear(y: number | null): void;
}

export default function CityTileMap({ descriptor, pyramid = "now" }: CityTileMapProps) {
  const t = useT();
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<MapApi | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<readonly Stop[]>([]);
  const [zoomStop, setZoomStop] = useState(0);

  /* ── THE RECORD'S STATE, THE GPU PAGE'S NAMES ─────────────────────────
     `picked` is a POSITION in the block index, as it is there; `posRef`
     turns a block id (what the search hands over) into one. */
  const [picked, setPicked] = useState<number | null>(null);
  const [record, setRecord] = useState<BlockRecord | null>(null);
  const [ctx, setCtx] = useState<BlockContext | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [request, setRequest] = useState<
    { req: UnitRequest; nonce: number; block: string } | undefined
  >(undefined);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [year, setYear] = useState<number | null>(null);
  const [yearsFile, setYearsFile] = useState<YearsFile | null>(null);
  const scrubEl = useRef<HTMLInputElement | null>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef<BlockIndex | null>(null);
  const posRef = useRef<Map<string, number> | null>(null);
  const nonceRef = useRef(0);
  const blockCols = useRef<{
    hood: Uint8Array; hoodNames: readonly string[]; area: Float32Array;
  } | null>(null);

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
        const [L, index, data, years] = await Promise.all([
          import("leaflet").then((m) => m.default),
          fetch(`${base}/${pyramid}/index.json`).then((r) => {
            if (!r.ok) throw new Error(`tiles: index ${r.status}`);
            return r.json() as Promise<TileIndex>;
          }),
          CityData.load({ baseUrl: descriptor.dataBaseUrl }),
          /* a city with no rendered years has a map with no rail */
          fetch(`${base}/years.json`)
            .then((r) => (r.ok ? (r.json() as Promise<YearsFile>) : null))
            .catch(() => null),
        ]);
        if (dead) return;
        setYearsFile(years);
        /* THE GROUND THE PICKER MARCHES AGAINST IS THE GPU PAGE'S: the fine
           DEM (2.1 MB), sampled the way the mesh is. MEASURED on the coarse
           field alone the pick answered at 69–86 % of a grid of points over
           the four stops; the miss is the ray meeting the ground a cell early
           and landing in the roadway. Fetched alongside the base, and a city
           without one falls back to the coarse field. */
        const fineDemP = loadFineDem(data.assetBase).catch(() => null);

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

        /* the block columns the fiche's context is read from — the hood is
           joined on the INDEX, never the name, as on the GPU page */
        {
          const bc = data.get("base/blocks");
          const be = data.manifest.chunks.find((c) => c.k === "base/blocks") as
            | { hoodNames?: string[] }
            | undefined;
          if (bc && be?.hoodNames) {
            blockCols.current = {
              hood: bc.fields.hood as Uint8Array,
              hoodNames: be.hoodNames,
              area: bc.fields.a as Float32Array,
            };
          }
        }
        /* THE PICKER IS THE GPU PAGE'S, on the GPU page's ground. */
        const fineDem = await fineDemP;
        if (dead) return;
        const picker = blockPicker(data, { elevAt: meshElevAt(field, proj, fineDem) });

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
          /* the wheel is handled below, see §AND THE WHEEL IS NOT LEAFLET'S */
          scrollWheelZoom: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
          inertia: true,
          bounceAtZoomLimits: false,
          maxBounds: extent.pad(0.25),
          maxBoundsViscosity: 0.8,
        });
        const layerFor = (key: string, zmax: number) =>
          L.tileLayer(`${base}/${key}/{z}/{x}/{y}.webp`, {
            tileSize: TILE_CSS,
            minNativeZoom: 0,
            maxNativeZoom: zmax,
            noWrap: true,
            bounds: extent,
            keepBuffer: 2,
            updateWhenZooming: true,
            updateInterval: 100,
            className: "fx-city-tile",
          });
        let tiles = layerFor(pyramid, tp.zmax).addTo(map);
        let tilesKey = pyramid;
        /* ── THE SWAP: THE NEW YEAR OVER THE OLD, THEN THE OLD GOES ────── */
        const showKey = (key: string, zmax: number) => {
          if (!map || key === tilesKey) return;
          tilesKey = key;
          const old = tiles;
          const next = layerFor(key, zmax).addTo(map);
          tiles = next;
          const done = () => { if (map && tiles === next) map.removeLayer(old); };
          next.once("load", done);
          /* a year whose tiles are all cached fires no load at all */
          setTimeout(() => { if (map && tiles === next && map.hasLayer(old)) done(); }, 1500);
        };
        /* the nearest year there is a picture for, the present when none */
        const keyFor = (y: number | null): { key: string; zmax: number } => {
          if (y === null || y >= YEAR_MAX || !years) return { key: "now", zmax: tp.zmax };
          let best: string | null = null;
          let d = Infinity;
          for (const k of Object.keys(years.years)) {
            const dk = Math.abs(Number(k) - y);
            if (dk < d || (dk === d && Number(k) < y)) { d = dk; best = k; }
          }
          return best === null ? { key: "now", zmax: tp.zmax } : { key: best, zmax: years.years[best].zmax };
        };

        /* ── THE WHEEL: FOLLOW THE GESTURE, COMMIT ONCE ──────────────── */
        {
          const mp = map as unknown as MapPrivate;
          const SENS = 0.0022; // zoom levels per wheel pixel
          const EASE = 0.3; // fraction of the gap closed per frame
          let wheeling = false;
          let goalZoom = 0;
          let wheelRaf = 0;
          let endTimer: ReturnType<typeof setTimeout> | null = null;
          /* all four are set when a gesture starts — the map has no centre
             yet here, and Leaflet throws on `getCenter()` before `setView` */
          let centerPt = map.getSize().divideBy(2);
          let wheelPt = centerPt;
          let startLatLng: LatLng | null = null;
          let wheelStartLatLng: LatLng | null = null;
          let moved = false;
          const stepWheel = () => {
            if (!map || dead || !startLatLng || !wheelStartLatLng) return;
            const z = Math.round((map.getZoom() + (goalZoom - map.getZoom()) * EASE) * 1000) / 1000;
            const d = wheelPt.subtract(centerPt);
            const center =
              d.x === 0 && d.y === 0
                ? startLatLng
                : map.unproject(map.project(wheelStartLatLng, z).subtract(d), z);
            if (!moved) { mp._moveStart(true, false); moved = true; }
            mp._move(center, z);
            wheelRaf = requestAnimationFrame(stepWheel);
          };
          const endWheel = () => {
            wheeling = false;
            cancelAnimationFrame(wheelRaf);
            if (moved && map && !dead) mp._moveEnd(true);
            moved = false;
          };
          div.addEventListener(
            "wheel",
            (e: WheelEvent) => {
              if (!map || dead) return;
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
                wheelRaf = requestAnimationFrame(stepWheel);
              }
              goalZoom = Math.max(
                map.getMinZoom(),
                Math.min(map.getMaxZoom(), goalZoom + L.DomEvent.getWheelDelta(e) * SENS),
              );
              wheelPt = map.mouseEventToContainerPoint(e);
              if (endTimer) clearTimeout(endTimer);
              endTimer = setTimeout(endWheel, 180);
            },
            { passive: false },
          );
        }

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
        const nearestStop = (): number => {
          if (!map) return -1;
          const z = map.getZoom();
          let best = 0;
          let d = Infinity;
          descriptor.stops.forEach((s, i) => {
            const dz = Math.abs(zoomOf(s).zoom - z);
            if (dz < d) { d = dz; best = i; }
          });
          return d < 0.5 ? best : -1;
        };
        map.on("zoomend", () => setZoomStop(nearestStop()));

        /* THE WHOLE CITY IS THE WIDEST STOP, as on the GPU page: past it the
           pyramid is a rectangle on the paper with the far shore cut off at
           its edge — Daniel: *"small strips ... of whats not on the map
           proper"*. Exactly the fit and no slack: a tenth of a level of slack
           showed a strip of paper down each side of the desktop frame, which
           is the same complaint in a smaller size. Refitted when the stage
           changes width. */
        const clampOut = () => {
          const h = zoomOf(descriptor.stops[0]);
          map?.setMinZoom(Math.max(0, h.zoom));
          return h;
        };
        const home = clampOut();
        map.setView(home.at, home.zoom, { animate: false });
        ro.disconnect();
        ro = new ResizeObserver(() => {
          map?.invalidateSize({ animate: false });
          clampOut();
          size();
        });
        ro.observe(host);

        /* ── A TAP IS A PICK ─────────────────────────────────────────────
           Leaflet's `click` is the tap that was not a drag and not a pinch,
           which is the one distinction a touch map has to get right. The
           picker is asked with the SAME camera the overlay is drawn with, so
           the ring lands under the thumb. */
        map.on("click", (e) => {
          if (!map || !picker || dead) return;
          const pt = (e as unknown as { containerPoint: { x: number; y: number } }).containerPoint;
          const r = host.getBoundingClientRect();
          const b = picker.at(pt.x, pt.y, camOf(), r.width, r.height);
          if (overlay) {
            overlay.highlight = b === null ? null : picker.ringOf(b);
            overlay.pick = b;
            /* never a frame of the previous block's name on a new ring */
            overlay.pickLabel = null;
            schedule();
          }
          setZoomStop(nearestStop());
          setSheetOpen(true);
          setPicked(b);
        });

        apiRef.current = {
          showBlock(pos, stop) {
            if (!map || !picker) return;
            const ring = picker.ringOf(pos);
            if (ring?.length) {
              let sx = 0;
              let sy = 0;
              for (const [wx, wy] of ring) { sx += wx; sy += wy; }
              const c = projection.proj(sx / ring.length, sy / ring.length, 0);
              const [X, Y] = tp.toFrame(c[0], c[1]);
              const z = zoomOf(descriptor.stops[stop] ?? descriptor.stops[descriptor.stops.length - 1]);
              map.setView(ll(X, Y), z.zoom, { animate: false });
            }
            if (overlay) {
              overlay.highlight = picker.ringOf(pos);
              overlay.pick = pos;
              overlay.pickLabel = null;
              schedule();
            }
            setZoomStop(stop);
            setSheetOpen(true);
            setPicked(pos);
          },
          clear() {
            if (overlay) {
              overlay.highlight = null;
              overlay.pick = null;
              overlay.pickLabel = null;
              schedule();
            }
          },
          nearestStop,
          label(s) {
            if (overlay) {
              overlay.pickLabel = s;
              schedule();
            }
          },
          setYear(y) {
            const k = keyFor(y);
            showKey(k.key, k.zmax);
            if (overlay) {
              overlay.year = y ?? undefined;
              schedule();
            }
          },
        };

        /* DEV-ONLY, the `__cityGL*` idiom: the harness that measures this
           page needs the map and the pick it would make at a point */
        if (process.env.NODE_ENV !== "production") {
          (globalThis as { __cityTiles?: unknown }).__cityTiles = {
            map,
            pickAt: (x: number, y: number) => {
              const r = host.getBoundingClientRect();
              return picker ? picker.at(x, y, camOf(), r.width, r.height) : null;
            },
          };
        }

        void overlay.load().then(schedule);
        setLoading(false);
      } catch (e) {
        if (!dead) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      dead = true;
      apiRef.current = null;
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      overlay?.dispose();
      overlay = null;
      map?.remove();
      map = null;
    };
  }, [descriptor, pyramid]);

  /* ── THE RECORD, BEHIND A PICK — the GPU page's effect, unchanged in what
     it does: the context first (a column already in memory), then the shard,
     and the pin's name as soon as each half is known. `block-records`
     memoises the index and every shard for the session. */
  useEffect(() => {
    if (picked === null) {
      setRecord(null);
      setCtx(null);
      return;
    }
    let dead = false;
    setRecLoading(true);
    void (async () => {
      try {
        const index = idxRef.current ?? (await loadBlockIndex());
        idxRef.current = index;
        if (dead) return;
        const cols = blockCols.current;
        const id = index.b[picked] ?? "—";
        const hoodName = cols ? (cols.hoodNames[cols.hood[picked]] ?? "") : "";
        setCtx({
          id,
          hood: hoodName,
          hoodIndex: cols ? (cols.hood[picked] ?? -1) : -1,
          areaM2: cols ? (cols.area[picked] ?? 0) : 0,
          streetDecisions: index.ns[picked] ?? 0,
          zoomStop,
        });
        apiRef.current?.label(hoodName || null);
        const r = await loadBlockRecord(index, picked);
        if (!dead) {
          setRecord(r);
          apiRef.current?.label((r ? blockPlaceName(r.streets) : null) || hoodName || null);
        }
      } catch {
        if (!dead) setRecord(null);
      } finally {
        if (!dead) setRecLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
    // the stop is read when the pick is made, not re-fetched when it moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  /* ── OPEN A BLOCK BY ID — what the search hands over. The index is fetched
     here when nobody has tapped yet, because the first thing many readers do
     is type a street. */
  const openAt = useCallback(async (blockId: string, req: UnitRequest, stop: number) => {
    const index = idxRef.current ?? (await loadBlockIndex().catch(() => null));
    if (!index) return;
    idxRef.current = index;
    if (!posRef.current) {
      posRef.current = new Map(index.b.map((b, i) => [b, i]));
    }
    const pos = blockId ? posRef.current.get(blockId) : undefined;
    if (pos !== undefined) apiRef.current?.showBlock(pos, stop);
    nonceRef.current += 1;
    setRequest({ nonce: nonceRef.current, block: blockId, req });
  }, []);

  /* the GPU page's own routing of a hit, kind for kind */
  const goToHit = useCallback(async (hit: SearchHit) => {
    if (hit.kind === "place") {
      router.push(`/us/city/sf/places/place/${hit.to}`);
      return;
    }
    await openAt(
      hit.block,
      hit.viaParcel
        ? { kind: "ground" }
        : hit.kind === "hood"
          ? { kind: "hood" }
          : hit.kind === "street"
            ? { kind: "street", key: hit.to }
            : hit.kind === "addr"
              ? { kind: "door", label: hit.label }
              : { kind: "ground" },
      hit.kind === "hood" ? 1 : hit.kind === "street" ? 2 : 3,
    );
  }, [openAt, router]);

  const close = () => {
    setPicked(null);
    apiRef.current?.clear();
  };

  /* ── THE RAIL, THE GPU PAGE'S WAY: the cheap half on every input event —
     the readout, the filled run, the type — and the expensive half, a
     pyramid swap that fetches tiles, once the thumb has rested 150 ms or is
     released. React state is committed on release only, so the thumb is
     never contradicted mid-gesture (`CityGLMap.tsx` §syncScrub). */
  const syncScrub = useCallback((y: number | null) => {
    const el = scrubEl.current;
    if (!el) return;
    const v = y ?? YEAR_MAX;
    if (Number(el.value) !== v) el.value = String(v);
    const frac = (v - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    el.style.setProperty("--scrub", `${(frac * 100).toFixed(2)}%`);
    const out = el.previousElementSibling;
    if (out) out.textContent = String(v);
  }, []);
  const scrubTo = (v: number, commit: boolean) => {
    const y = v >= YEAR_MAX ? null : v;
    syncScrub(y);
    if (swapTimer.current) clearTimeout(swapTimer.current);
    if (commit) {
      apiRef.current?.setYear(y);
      setYear(y);
    } else {
      swapTimer.current = setTimeout(() => apiRef.current?.setYear(y), 150);
    }
  };

  const sheetLabel =
    (record ? blockPlaceName(record.streets) : null) || ctx?.hood || "";
  const n = record?.decisions.length ?? 0;

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <div className="fx-city-tiles" ref={mapDivRef} />
          {/* the overlay's canvas goes in here, so React never reorders it
              under the chrome it renders after */}
          <div className="fx-city-tiles-labels" ref={labelsRef} />
          {!loading ? (
            <div className="fx-city-find">
              <CitySearch onPick={({ hit }) => void goToHit(hit)} />
            </div>
          ) : null}
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
        {/* ── THE RAIL, when this city has rendered years ───────────────────
            Inside `.fx-city-transport`, as on the GPU page: on a phone the
            frame is a column ordered stage, transport, ledger, and a row
            outside that box lands ABOVE the map, under the entry card. */}
        {!loading && yearsFile && Object.keys(yearsFile.years).length ? (
          <div className="fx-city-transport">
          <div className="fx-city-clockrow">
            <span className="tnum fx-city-year">{year ?? YEAR_MAX}</span>
            <input
              ref={scrubEl}
              type="range"
              className="fx-city-scrub"
              min={YEAR_MIN}
              max={YEAR_MAX}
              step={1}
              defaultValue={YEAR_MAX}
              aria-label="Year"
              style={{ flex: 1 }}
              onInput={(e) => scrubTo(Number(e.currentTarget.value), false)}
              onChange={(e) => scrubTo(Number(e.currentTarget.value), true)}
            />
          </div>
          </div>
        ) : null}
        {/* ── THE SHEET, ONLY WHEN THERE IS A RECORD TO SHOW ──────────────
            The GPU page's ledger always stands, because it carries the year
            and the subject dots too. Here, until the rail comes over, the
            record exists when a block does; with nothing picked the city has
            the whole screen, which is what a phone wants of a map. The bar
            is the same bar — a place name under the thumb, folding the sheet
            away — so the two pages fold the same way. */}
        {picked !== null ? (
          <div className={`fx-city-ledger${sheetOpen ? "" : " is-shut"}`}>
            <button
              type="button"
              className="fx-city-sheet-grab"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((v) => !v)}
            >
              <span className="fx-city-sheet-bar" aria-hidden="true" />
              <span className="fx-city-sheet-yr">{sheetLabel}</span>
              <span className="fx-city-sheet-n">
                {recLoading ? "…" : `${n} ${n === 1 ? "decision" : "decisions"}`}
              </span>
              <span className="fx-city-sheet-x" aria-hidden="true">
                {sheetOpen ? "▾" : "▴"}
              </span>
            </button>
            <CityBlockPanel
              record={record}
              context={ctx}
              request={request}
              loading={recLoading}
              onClose={close}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
