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

   THE LINK IS THE GPU PAGE'S LINK. `?block=…&street=…` opens the same fiche
   here that it opens there, and a pick writes the same parameters back with
   `replaceState`, never `pushState` — a reader moving around a map is not
   navigating (`CityGLMap.tsx` §WHAT THE READER CAN SEND SOMEBODY).

   PLAY, ON TILES, IS A SEQUENCE OF PICTURES: three years a second, the
   century in forty seconds as on the GPU page, each year a pyramid swap.
   It plays the whole city, because that is the only stop every year has a
   picture for, and the GPU page plays the whole city too.

   THE SUBJECTS ARE THE SAME SUBJECTS. `blocks/theme-marks.json` and
   `blocks/themes.json` are the GPU page's files; `tile-marks.ts` draws them
   in ink on a canvas under the type with the GPU layer's own filter, window
   and two modes, and a press on a mark opens that block's record.

   A press on a mark opens the mark's own card — `MarkCard.tsx`, the same
   card and the same rules as the GPU page — and closes back to whatever the
   sheet was showing. WHAT IS NOT HERE YET, deliberately: the film.

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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LatLng, Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";

import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { TerrainField, type TerrainProj } from "@/lib/city/terrain";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import { CityOverlay } from "@/lib/citygl/overlay";
import { blockPicker } from "@/lib/citygl/pick";
import { loadFineDem, meshElevAt, type FineDem } from "@/lib/citygl/layers/terrain";
import { buildFilm } from "@/lib/citygl/film";
import { TILE_CSS, tilePlane, type TileIndex } from "@/lib/citygl/tile-plane";
import { THEME_INK } from "@/lib/citygl/theme-ink";
import { tileMarks, type TileMarkFilter, type TileMarks, type TileMarksFile } from "@/lib/citygl/tile-marks";
import { useT } from "@/lib/localeContext";
import CityBlockPanel, {
  type BlockContext,
  type UnitRequest,
} from "@/components/us/city/CityBlockPanel";
import CitySearch from "@/components/us/city/CitySearch";
import MarkCard, { buildMarkCard, type MarkCardData } from "@/components/us/city/MarkCard";
import type { SearchHit } from "@/lib/us/city-search";
import {
  blockPlaceName,
  ficheParams,
  loadBlockIndex,
  loadBlockRecord,
  loadClassify,
  readFicheParams,
  type BlockIndex,
  type BlockRecord,
  type ClassifyFile,
  type FicheLink,
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

/** one row of `themes.json` — what the subject filter offers */
interface ThemeEntry {
  readonly bit: number;
  readonly slug: string;
  readonly label: string;
  readonly kind: string;
  readonly n: number;
  readonly n_blocks: number;
  readonly y0: number;
  readonly y1: number;
}

/* the GPU page's chip, `CityGLMap.tsx` §chipStyle */
/** how far past the city the map may be dragged, as a share of its extent;
 *  and the looser bound while the drawer is open, so a tapped block can be
 *  panned up above it even at the whole-city fit */
const BOUNDS_PAD = 0.25;
const BOUNDS_PAD_OPEN = 1;
/** where a tapped point is panned to, as a share of the map's height, so
 *  it stands clear of the drawer — `fusion.css` §THE DRAWER */
const TAP_KEEP = 0.3;
/** the last zoom stop at which a tap opens the NEIGHBOURHOOD rather than
 *  the block: whole city and district */
const HOOD_STOP_MAX = 1;
/** how far a thumb travels on the drawer's handle before it counts as a
 *  swipe rather than a tap */
const SWIPE_PX = 40;
const isPhone = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 819px)").matches;

function chipStyle(on: boolean, ink: string | null): React.CSSProperties {
  return {
    font: `${on ? 600 : 400} 12px/1 var(--f-sans, system-ui)`,
    /* 40 px tall: a thumb's target, WCAG 2.5.8 and both platforms' guides */
    padding: "0 12px",
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${on ? (ink ?? "var(--ink, #1a1a19)") : "var(--rule, #e4e6ea)"}`,
    boxShadow: on ? `inset 0 0 0 1px ${ink ?? "var(--ink, #1a1a19)"}` : "none",
    background: "var(--surface, #fff)",
    color: "var(--ink, #1a1a19)",
  };
}

/* THE MANIFESTS ARE FETCHED, NOT LOADED AS IMAGES, so they are cross-origin
   requests the bucket must answer with a CORS header — and Google's front
   cache had kept copies from before the bucket had one, for the year the
   Cache-Control on them promised. The tiles themselves are `<img>` loads and
   never needed the header. A version on the manifest URLs is the cache key
   changing: bump it if a manifest ever has to be re-fetched past its cache. */
const MANIFEST_V = "3";

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
  /** light a subject's marks around a year; how many lit */
  filterMarks(bits: number, year: number): number;
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
  /* ── THE SEARCH IS A BUTTON UNTIL IT IS WANTED ───────────────────────
     A full-width search box sat over the top of the map on every phone,
     and the four zoom stops over its bottom: on a 390 x 844 screen the
     city itself had about 200 px left between them. The box is now a
     44 px button in the corner that opens into the box, and the stops
     have gone under the map into the transport, where the year rail is. */
  const [findOpen, setFindOpen] = useState(false);
  const findRef = useRef<HTMLDivElement | null>(null);
  const swipeY = useRef<number | null>(null);
  useEffect(() => {
    if (findOpen) findRef.current?.querySelector("input")?.focus();
  }, [findOpen]);
  /* ── THE FILM, AS A VIDEO ───────────────────────────────────────────
     The GPU page plays the film live; a phone cannot run the engine, so it
     gets the same film rendered frame by frame from that page
     (`scripts/render-city-film.mjs`) and served beside the tiles. The
     runtime is the script's own, so the label cannot drift from the film. */
  const [filmOpen, setFilmOpen] = useState(false);
  const filmUrl = descriptor.film && descriptor.tilesBaseUrl
    ? `${descriptor.tilesBaseUrl}/film/film-720.mp4`
    : null;
  const filmPoster = descriptor.tilesBaseUrl ? `${descriptor.tilesBaseUrl}/film/film-poster.jpg` : undefined;
  const filmLabel = useMemo(() => {
    if (!descriptor.film) return "";
    const total = buildFilm(descriptor.film).total;
    return t("us.sf.thecity.film.runtime")
      .replace("{min}", String(Math.floor(total / 60000)))
      .replace("{sec}", String(Math.round((total % 60000) / 1000)).padStart(2, "0"));
  }, [descriptor.film, t]);
  useEffect(() => {
    if (!filmOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFilmOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filmOpen]);

  /* ── THE RECORD'S STATE, THE GPU PAGE'S NAMES ─────────────────────────
     `picked` is a POSITION in the block index, as it is there; `posRef`
     turns a block id (what the search hands over) into one. */
  const [picked, setPicked] = useState<number | null>(null);
  /* ── A TAP IS NOT A SEARCH ─────────────────────────────────────────────
     A pick that came from a tap on the map, so the record effect can open
     it at the level the zoom implies: at the two wide stops a fingertip
     covers a neighbourhood, and the audit of 2026-09-09 saw a tap at whole
     city open "Duboce Ave · 3 decisions" with a card about Hayes Valley.
     A pick that came from search or a URL carries its own level already. */
  const tapPickRef = useRef(false);
  const [record, setRecord] = useState<BlockRecord | null>(null);
  const [ctx, setCtx] = useState<BlockContext | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [request, setRequest] = useState<
    { req: UnitRequest; nonce: number; block: string } | undefined
  >(undefined);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [year, setYear] = useState<number | null>(null);
  const [yearsFile, setYearsFile] = useState<YearsFile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [themes, setThemes] = useState<ThemeEntry[] | null>(null);
  const [subject, setSubject] = useState<number | null>(null);
  const [markCard, setMarkCard] = useState<MarkCardData | null>(null);
  const themesRef = useRef<ThemeEntry[] | null>(null);
  /* the page's chrome reads this: the chat launcher hides under the drawer
     on a phone rather than sitting on its handle — `fusion.css` §THE DRAWER */
  useEffect(() => {
    const on = picked !== null || markCard !== null;
    if (on) document.body.dataset.cityDrawer = sheetOpen ? "open" : "peek";
    else delete document.body.dataset.cityDrawer;
    return () => { delete document.body.dataset.cityDrawer; };
  }, [picked, markCard, sheetOpen]);
  const yearRef = useRef<number | null>(null);
  const classifyRef = useRef<ClassifyFile | null>(null);
  const openMarkRef = useRef<(hit: { bit: number; block: number }) => void>(() => {});
  useEffect(() => { themesRef.current = themes; }, [themes]);
  useEffect(() => { yearRef.current = year; }, [year]);
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [at, setAt] = useState<{ street?: string; address?: string; hood?: boolean }>({});
  const opened = useRef(false);
  const arrivedWith = useRef(typeof window === "undefined" ? "" : window.location.search);
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
          fetch(`${base}/${pyramid}/index.json?v=${MANIFEST_V}`).then((r) => {
            if (!r.ok) throw new Error(`tiles: index ${r.status}`);
            return r.json() as Promise<TileIndex>;
          }),
          CityData.load({ baseUrl: descriptor.dataBaseUrl }),
          /* a city with no rendered years has a map with no rail */
          fetch(`${base}/years.json?v=${MANIFEST_V}`)
            .then((r) => (r.ok ? (r.json() as Promise<YearsFile>) : null))
            .catch(() => null),
        ]);
        if (dead) return;
        setYearsFile(years);
        /* ── THE FINE GROUND COMES ON THE FIRST TOUCH, NOT AT BOOT ────────
           The fine DEM (2.1 MB) serves the tap only: sampled the way the
           mesh is, the pick lands on the right block where the coarse field
           alone answered at 69–86 % of a grid of points over the four stops
           (the ray meets the ground a cell early and lands in the roadway).
           MEASURED on prod over 4G: it was 2.1 of the 3.1 MB the phone
           pulled before anyone had touched anything. So it is fetched on
           the first pointer on the map — a tap is preceded by a touch, which
           is a head start — and until it lands the coarse field answers.
           When it lands, the picker and the dots are rebuilt on it (both
           bake elevations at construction); nothing else stands on it. */
        let fineDemP: Promise<FineDem | null> | null = null;
        let demReady = false;
        const wantFineDem = (): Promise<FineDem | null> => {
          if (!fineDemP) fineDemP = loadFineDem(data.assetBase).catch(() => null);
          return fineDemP;
        };

        /* THE SAME PROJECTION THE RENDERER DREW WITH. The pyramid's camera is
           in plane units, and plane units are `projection`'s at band 0 — the
           band every capture was posed on. */
        projection.setBand(0);
        /* ── THE PICTURE FIRST, THE GROUND BEHIND IT ─────────────────────
           The base tier (1.4 MB) and the fine DEM (2.1 MB) serve the tap,
           the labels and the dots — not the tiles. MEASURED on prod over a
           4G link with a 4x slower CPU: the map waited for both before it
           was even created, and the first tile showed at 4.1 s while the
           tiles themselves are 200 kB. So the map mounts on the index alone
           and the ground lands under it, below §THE GROUND, THE PICKER, THE
           WRITING; a tap before then is a tap on nothing (`picker` is null),
           which is a shorter wait than a blank stage. */
        const baseP = data.loadBase();
        const proj = data.manifest.proj as unknown as TerrainProj;
        let field: TerrainField | null = null;
        let ground: ReturnType<typeof meshElevAt> | null = null;
        let picker: ReturnType<typeof blockPicker> | null = null;

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
          /* a tile fades IN over the coarse underlay rather than snapping in
             over it — with the underlay there, what shows through the fade is
             the blurred city, never the paper, and a level's tiles arriving
             one by one read as the picture sharpening rather than flickering */
          fadeAnimation: true,
          markerZoomAnimation: false,
          inertia: true,
          bounceAtZoomLimits: false,
          maxBounds: extent.pad(BOUNDS_PAD),
          maxBoundsViscosity: 0.8,
        });
        /* ── THE SHARPER LEVEL, ALWAYS ───────────────────────────────────
           Leaflet takes the tile level NEAREST the zoom, so between two
           levels it shows the coarser one scaled UP as often as the finer
           one scaled down. On a phone the whole-city fit is zoom 1.3: level
           1 — 640 device px for the whole city — blown up on a 780 px screen,
           and the first pinch jumps to level 2 and then 3 in a few hundred
           pixels of gesture. Daniel: *"the super zoom out image and then
           whenever you do the first couple of zoom you get way more detail,
           it's a very weird jump"*. This layer rounds UP: the level shown is
           always at or above the screen's resolution and only ever scaled
           down, so detail arrives with the zoom rather than in steps. The
           slack keeps a stop that lands a hair over a level (the district
           stop is 3.06) on that level. `_setView` is GridLayer's own, with
           `Math.round` replaced — Leaflet 1.9.4 §GridLayer._setView. */
        const SharpTiles = (L.TileLayer as unknown as { extend(p: object): new (u: string, o: object) => L.TileLayer }).extend({
          _setView(this: Record<string, (...a: unknown[]) => unknown> & { options: { maxZoom?: number; minZoom?: number }; _tileZoom?: number; _noPrune?: boolean; _abortLoading?: () => void }, center: unknown, zoom: number, noPrune?: boolean, noUpdate?: boolean) {
            let tileZoom: number | undefined = Math.ceil(zoom - 0.15);
            if ((this.options.maxZoom !== undefined && tileZoom > this.options.maxZoom) ||
                (this.options.minZoom !== undefined && tileZoom < this.options.minZoom)) {
              tileZoom = undefined;
            } else {
              tileZoom = this._clampZoom(tileZoom) as number;
            }
            const changed = tileZoom !== this._tileZoom;
            if (!noUpdate || changed) {
              this._tileZoom = tileZoom;
              if (this._abortLoading) this._abortLoading();
              this._updateLevels();
              this._resetGrid();
              if (tileZoom !== undefined) this._update(center);
              if (!noPrune) this._pruneTiles();
              this._noPrune = !!noPrune;
            }
            this._setZoomTransforms(center, zoom);
          },
        });
        const layerFor = (key: string, zmax: number, zIndex = 2) =>
          new SharpTiles(`${base}/${key}/{z}/{x}/{y}.webp`, {
            tileSize: TILE_CSS,
            minNativeZoom: 0,
            maxNativeZoom: zmax,
            noWrap: true,
            bounds: extent,
            /* two tiles of margin around the view, fetched ahead, so a pan
               or a small pinch lands on tiles that are already there */
            keepBuffer: 4,
            updateWhenZooming: true,
            updateInterval: 100,
            className: "fx-city-tile",
            zIndex,
          });
        /* ── THE UNDERLAY: THE COARSE CITY, ALWAYS THERE ─────────────────
           Leaflet keeps a dropped level's tiles only two levels down and five
           up while the next level loads, so a flight from the street to the
           whole city — five levels out — showed 52 % paper for a frame
           (MEASURED), and a slow connection shows paper in every gap. The
           first three levels are nine tiles and 0.3 MB; a second layer that
           never goes past level 2 keeps them under everything at every zoom,
           scaled, so a gap is the blurred city and not the sheet. It is what
           every tile map a reader has used does. */
        const UNDER_ZMAX = 2;
        let under = layerFor(pyramid, Math.min(UNDER_ZMAX, tp.zmax), 1).addTo(map);
        let tiles = layerFor(pyramid, tp.zmax).addTo(map);
        let tilesKey = pyramid;
        /* ── THE SWAP: THE NEW YEAR OVER THE OLD, THEN THE OLD GOES ────── */
        const showKey = (key: string, zmax: number) => {
          if (!map || key === tilesKey) return;
          tilesKey = key;
          /* the underlay follows the year — REPLACED, not re-pointed:
             `setUrl` redraws, and Leaflet's `redraw` takes the map's
             unrounded zoom as the tile zoom under `zoomSnap: 0`, so it asked
             for level "1.327" and got 404s (GridLayer.js §redraw). Nobody
             sees the layer through the one above, so the swap is free. */
          map.removeLayer(under);
          under = layerFor(key, Math.min(UNDER_ZMAX, zmax), 1).addTo(map);
          const old = tiles;
          const next = layerFor(key, zmax).addTo(map);
          tiles = next;
          const done = () => { if (map && tiles === next) map.removeLayer(old); };
          /* AFTER THE FADE, NOT AFTER THE LOAD. `load` fires when the tiles are
             in, while they are still fading up from transparent (Leaflet's
             fade is 200 ms); taking the old year away then showed the blurred
             underlay through the half-faded new one for a frame — MEASURED as
             a jump of 24 on the frame-difference scale where a clean swap is
             under 2. The old year stays under the new one until the fade is
             over. */
          next.once("load", () => setTimeout(done, 300));
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
          const cam = camOf();
          if (mctx) {
            mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
            mctx.clearRect(0, 0, mW, mH);
            marks?.draw(mctx, cam, mW, mH);
          }
          overlay.draw(cam, 0);
        };
        /* the overlay itself is built once the ground has landed, below —
           its canvas goes over the marks' canvas then */
        /* the marks' own canvas, UNDER the type: a mark is the last thing said
           about a block and a name is the last thing said about a place */
        const marksCv = document.createElement("canvas");
        marksCv.className = "fx-city-marks-2d";
        marksCv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
        const mctx = marksCv.getContext("2d");
        labels.appendChild(marksCv);
        let marks: TileMarks | null = null;
        /* the last filter asked for, so a rebuild on the fine ground keeps it */
        let lastFilter: TileMarkFilter | null = null;
        let rebuildMarks: (() => void) | null = null;
        let mdpr = 1;
        let mW = 0;
        let mH = 0;
        const size = () => {
          const r = host.getBoundingClientRect();
          mdpr = Math.min(2, window.devicePixelRatio || 1);
          mW = r.width;
          mH = r.height;
          marksCv.width = Math.max(1, Math.round(mW * mdpr));
          marksCv.height = Math.max(1, Math.round(mH * mdpr));
          overlay?.resize(r.width, r.height, mdpr);
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
        /* ── EVERY JUMP IS A FLIGHT, NEVER A CUT ─────────────────────────
           `setView` without animation — and with it, past four levels, where
           Leaflet declines to animate — goes through `_resetView`, and the
           tile layer answers that by dropping every tile: MEASURED, the "a
           few streets" chip showed 72 % paper for a frame. `flyTo` moves the
           view frame by frame the way a pinch does, keeping every tile it
           has, and never resets. Short, so it reads as a cut with continuity
           rather than as a tour. */
        const fly = (at: LatLng, zoom: number) =>
          map?.flyTo(at, zoom, { duration: 0.55, easeLinearity: 0.3 });
        const built = descriptor.stops.map((s, i) => ({
          label: s.label,
          go: () => {
            const z = zoomOf(s);
            fly(z.at, z.zoom);
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
        /* the "Drawing the city…" sheet comes off HERE, with the tiles under
           it — not after the ground: MEASURED on prod, the tiles were in at
           2.8 s and the sheet stayed until 4.6 s waiting for the DEM */
        setLoading(false);

        /* ── THE GROUND, THE PICKER, THE WRITING — after the first tiles ── */
        await baseP;
        if (dead) return;
        const chunk = data.get("base/terrain");
        if (!chunk) throw new Error("terrain: base/terrain has not landed");
        field = new TerrainField(chunk, proj);
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
        /* THE PICKER IS THE GPU PAGE'S, on the GPU page's ground — the
           coarse field now, the fine one when §THE FINE GROUND arrives */
        ground = meshElevAt(field, proj, null);
        picker = blockPicker(data, { elevAt: ground });
        const groundField = field;
        let demArmed = false;
        const armFineDem = () => {
          if (demArmed) return;
          demArmed = true;
          void wantFineDem().then((fineDem) => {
            if (dead || !fineDem) return;
            ground = meshElevAt(groundField, proj, fineDem);
            const pk = blockPicker(data, { elevAt: ground });
            if (!pk) return;
            picker = pk;
            demReady = true;
            rebuildMarks?.();
            if (overlay && overlay.pick !== null) {
              overlay.highlight = pk.ringOf(overlay.pick);
              schedule();
            }
          });
        };
        div.addEventListener("pointerdown", armFineDem, { once: true, passive: true });
        div.addEventListener("touchstart", armFineDem, { once: true, passive: true });
        overlay = new CityOverlay({
          data,
          field,
          dataBaseUrl: descriptor.dataBaseUrl,
          requestFrame: schedule,
        });
        labels.appendChild(overlay.canvas);
        size();

        /* ── A TAP IS A PICK ─────────────────────────────────────────────
           Leaflet's `click` is the tap that was not a drag and not a pinch,
           which is the one distinction a touch map has to get right. The
           picker is asked with the SAME camera the overlay is drawn with, so
           the ring lands under the thumb. */
        map.on("click", (e) => {
          if (!map || !picker || dead) return;
          const pt = (e as unknown as { containerPoint: { x: number; y: number } }).containerPoint;
          const r = host.getBoundingClientRect();
          /* a press on a DOT asks "what is this mark" and gets the card; a
             press on the CITY asks "what happened here" and gets the fiche —
             the GPU page's split, kept: a mark press returns before the pick */
          const hit = marks?.markAt(pt.x, pt.y, camOf(), r.width, r.height) ?? null;
          if (hit && hit.block >= 0) {
            openMarkRef.current(hit);
            return;
          }
          setMarkCard(null);
          void (async () => {
            /* the fine ground may be in flight from the touch that preceded
               this tap: up to 600 ms for it, then the coarse answer */
            if (fineDemP && !demReady) {
              await Promise.race([fineDemP, new Promise((res) => setTimeout(res, 600))]);
            }
            const pk = picker;
            if (dead || !pk) return;
            const b = pk.at(pt.x, pt.y, camOf(), r.width, r.height);
            if (overlay) {
              overlay.highlight = b === null ? null : pk.ringOf(b);
              overlay.pick = b;
              /* never a frame of the previous block's name on a new ring */
              overlay.pickLabel = null;
              schedule();
            }
            setZoomStop(nearestStop());
            /* ── THE BLOCK STAYS IN VIEW ABOVE THE DRAWER ──────────────────
               On a phone the record is a drawer over the lower part of the
               screen (`fusion.css` §THE DRAWER), so the tapped point is
               brought up to `TAP_KEEP` of the map's height, where the drawer
               cannot reach it. Leaflet's own pan, so the labels follow. */
            if (b !== null && isPhone()) {
              /* the bounds are loosened first: at the whole-city fit the
                 view already touches them, and Leaflet slid the pan straight
                 back (MEASURED: −34 px at 100 ms, 0 at 1.5 s). `clear()`
                 tightens them again, which snaps the city back into frame. */
              map.setMaxBounds(extent.pad(BOUNDS_PAD_OPEN));
              map.panBy([0, pt.y - r.height * TAP_KEEP], { animate: true, duration: 0.3 });
            }
            tapPickRef.current = true;
            /* the last tap's request must not outlive it: the handle named
               the previous block's neighbourhood on the next block */
            setRequest(undefined);
            setSheetOpen(true);
            setPicked(b);
          })();
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
              fly(ll(X, Y), z.zoom);
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
            map?.setMaxBounds(extent.pad(BOUNDS_PAD));
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
          filterMarks(bits, y) {
            lastFilter = { bits, year: y };
            const lit = marks?.setFilter(lastFilter) ?? 0;
            schedule();
            return lit;
          },
        };

        /* ── THE SUBJECTS, AFTER THE CITY — a filter that fails to load must
           cost the filter and not the city */
        void (async () => {
          try {
            const dbase = descriptor.dataBaseUrl;
            const [mk, vocab] = await Promise.all([
              fetch(`${dbase}/blocks/theme-marks.json`).then((r) => (r.ok ? (r.json() as Promise<TileMarksFile>) : null)),
              fetch(`${dbase}/blocks/themes.json`).then((r) => (r.ok ? (r.json() as Promise<{ t: ThemeEntry[] }>) : null)),
            ]);
            if (dead || !mk || !vocab?.t?.length) return;
            const build = () => {
              const g = ground;
              if (!g) return;
              const m = tileMarks(mk, {
                elevAt: g,
                colours: vocab.t.map((t) => THEME_INK[t.bit % THEME_INK.length]),
                bits: vocab.t.length,
              });
              marks = m;
              if (m && lastFilter) m.setFilter(lastFilter);
              schedule();
            };
            build();
            rebuildMarks = build;
            setThemes(vocab.t);
          } catch {
            /* no marks, still a city */
          }
        })();

        /* DEV-ONLY, the `__cityGL*` idiom: the harness that measures this
           page needs the map and the pick it would make at a point */
        if (process.env.NODE_ENV !== "production") {
          (globalThis as { __cityTiles?: unknown }).__cityTiles = {
            map,
            pickAt: (x: number, y: number) => {
              const r = host.getBoundingClientRect();
              return picker ? picker.at(x, y, camOf(), r.width, r.height) : null;
            },
            markAt: (x: number, y: number) => {
              const r = host.getBoundingClientRect();
              return marks ? marks.markAt(x, y, camOf(), r.width, r.height) : null;
            },
          };
        }

        void overlay.load().then(schedule);
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
        let hoodLevel = false;
        if (tapPickRef.current) {
          tapPickRef.current = false;
          if (zoomStop <= HOOD_STOP_MAX) {
            hoodLevel = true;
            nonceRef.current += 1;
            setRequest({ nonce: nonceRef.current, block: id, req: { kind: "hood" } });
          }
        }
        const r = await loadBlockRecord(index, picked);
        if (!dead) {
          setRecord(r);
          /* the ring's label says what the drawer is about — the
             neighbourhood when that is what the tap opened */
          apiRef.current?.label(
            hoodLevel && hoodName ? hoodName : (r ? blockPlaceName(r.streets) : null) || hoodName || null,
          );
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

  /* ── THE DOT'S OWN ANSWER — the GPU page's `openMark`, on the shared card */
  const openMark = useCallback(async (hit: { bit: number; block: number }) => {
    const index = idxRef.current ?? (await loadBlockIndex().catch(() => null));
    const ths = themesRef.current;
    if (!index || !ths) return;
    idxRef.current = index;
    const cf = classifyRef.current
      ?? (classifyRef.current = await loadClassify().catch(() => null));
    const card = await buildMarkCard(hit, {
      index, themes: ths, year: yearRef.current ?? YEAR_MAX, classify: cf,
    });
    if (card) {
      setMarkCard(card);
      setSheetOpen(true);
    }
  }, []);
  useEffect(() => { openMarkRef.current = (hit) => void openMark(hit); }, [openMark]);

  /* ── THE LINK ────────────────────────────────────────────────────────── */
  const writeUrl = useCallback((link: FicheLink | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const k of ["block", "street", "address", "hood"]) url.searchParams.delete(k);
    if (link) for (const [k, v] of ficheParams(link)) url.searchParams.set(k, v);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    if (!opened.current) return;
    if (picked === null) {
      writeUrl(null);
      return;
    }
    const id = idxRef.current?.b[picked];
    if (id) writeUrl({ block: id, ...at });
  }, [picked, at, writeUrl]);
  useEffect(() => {
    if (opened.current || loading || !apiRef.current) return;
    opened.current = true;
    const link = readFicheParams(arrivedWith.current);
    if (!link) return;
    void openAt(
      link.block,
      link.hood
        ? { kind: "hood" }
        : link.street
          ? { kind: "streetFile", file: link.street }
          : link.address
            ? { kind: "door", label: link.address }
            : { kind: "ground" },
      link.hood ? 1 : link.street ? 2 : 3,
    );
  }, [loading, openAt]);

  /* ── WHAT IS LIT: the subject around the rail's year, the present being
     YEAR_MAX and never `undefined` — `CityGLMap.tsx` says why */
  useEffect(() => {
    if (!themes) return;
    apiRef.current?.filterMarks(subject === null ? 0 : 2 ** subject, year ?? YEAR_MAX);
  }, [subject, year, themes]);

  /* ── PLAY ────────────────────────────────────────────────────────────── */
  const YEARS_PER_SECOND = 3;
  const stopPlay = useCallback(() => {
    if (playTimer.current) clearInterval(playTimer.current);
    playTimer.current = null;
    setPlaying(false);
  }, []);
  const startPlay = () => {
    if (playTimer.current) return;
    stops[0]?.go();
    let y = year === null || year >= YEAR_MAX ? YEAR_MIN : year;
    const step = () => {
      syncScrub(y);
      apiRef.current?.setYear(y >= YEAR_MAX ? null : y);
      if (y >= YEAR_MAX) {
        setYear(null);
        stopPlay();
        return;
      }
      y += 1;
    };
    step();
    playTimer.current = setInterval(step, 1000 / YEARS_PER_SECOND);
    setPlaying(true);
  };
  useEffect(() => () => { if (playTimer.current) clearInterval(playTimer.current); }, []);

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
    if (playTimer.current) stopPlay();
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

  /* the handle names what the drawer is ABOUT: the neighbourhood when the
     tap opened one (the two wide stops), the block's streets otherwise */
  const sheetLabel = markCard
    ? markCard.place
    : request?.req.kind === "hood" && request.block === ctx?.id && ctx?.hood
      ? ctx.hood
      : (record ? blockPlaceName(record.streets) : null) || ctx?.hood || "";
  const n = markCard ? markCard.rows.length : (record?.decisions.length ?? 0);

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <div className="fx-city-tiles" ref={mapDivRef} />
          {/* the overlay's canvas goes in here, so React never reorders it
              under the chrome it renders after */}
          <div className="fx-city-tiles-labels" ref={labelsRef} />
          {!loading ? (
            findOpen ? (
              <div className="fx-city-find" ref={findRef}>
                <CitySearch
                  onPick={({ hit }) => {
                    setFindOpen(false);
                    void goToHit(hit);
                  }}
                />
                <button
                  type="button"
                  className="fx-city-find-close"
                  aria-label={t("fx.search.close")}
                  onClick={() => setFindOpen(false)}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="fx-city-find-btn"
                aria-label={t("us.sf.thecity.search.placeholder")}
                onClick={() => setFindOpen(true)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12.8 12.8 L17.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )
          ) : null}
          {!loading && filmUrl ? (
            <button
              type="button"
              className="fx-city-film-btn"
              aria-label={`${t("us.sf.thecity.film.watch_video")} · ${filmLabel}`}
              title={`${t("us.sf.thecity.film.watch_video")} · ${filmLabel}`}
              onClick={() => setFilmOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 2.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </button>
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
        {!loading ? (
          <div className="fx-city-transport">
          {stops.length ? (
            <div
              role="group"
              aria-label={t("us.sf.thecity.map.view")}
              className="fx-city-stoprow"
            >
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
          {yearsFile && Object.keys(yearsFile.years).length ? (<>
          <div className="fx-city-clockrow">
            <button
              type="button"
              onClick={() => (playing ? stopPlay() : startPlay())}
              aria-label={playing ? "Pause" : "Play from 1906"}
              style={{
                font: "600 13px/1 var(--f-mono, ui-monospace, monospace)",
                padding: 0,
                width: 44,
                minWidth: 44,
                height: 44,
                boxSizing: "border-box",
                border: "1px solid var(--rule, #e4e6ea)",
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
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
          {themes ? (
            <div className="fx-city-subjrow">
              <span className="fx-city-subjrow-cap" aria-hidden="true">Subject</span>
              <div className="fx-city-chips" role="group" aria-label="Subject">
                <button
                  type="button"
                  onClick={() => setSubject(null)}
                  aria-pressed={subject === null}
                  style={chipStyle(subject === null, null)}
                >
                  All decisions
                </button>
                {themes.map((th) => (
                  <button
                    key={th.slug}
                    type="button"
                    onClick={() => setSubject((cur) => (cur === th.bit ? null : th.bit))}
                    aria-pressed={subject === th.bit}
                    title={`${th.n.toLocaleString()} marks over ${th.n_blocks.toLocaleString()} blocks, ${th.y0}–${th.y1}`}
                    style={chipStyle(subject === th.bit, THEME_INK[th.bit % THEME_INK.length])}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginRight: 6,
                        background: THEME_INK[th.bit % THEME_INK.length],
                      }}
                    />
                    {th.label}
                    <span style={{ opacity: 0.55, marginLeft: 6 }}>{th.n.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          </>) : null}
          </div>
        ) : null}
        {filmOpen && filmUrl ? (
          <div className="fx-city-filmwrap" role="dialog" aria-label={t("us.sf.thecity.film.dialog")}>
            <video
              className="fx-city-filmvideo"
              src={filmUrl}
              poster={filmPoster}
              controls
              autoPlay
              playsInline
              onEnded={() => setFilmOpen(false)}
            />
            <button
              type="button"
              className="fx-city-film-x"
              aria-label={t("fx.search.close")}
              onClick={() => setFilmOpen(false)}
            >
              ×
            </button>
          </div>
        ) : null}
        {/* ── THE SHEET, ONLY WHEN THERE IS A RECORD TO SHOW ──────────────
            The GPU page's ledger always stands, because it carries the year
            and the subject dots too. Here, until the rail comes over, the
            record exists when a block does; with nothing picked the city has
            the whole screen, which is what a phone wants of a map. The bar
            is the same bar — a place name under the thumb, folding the sheet
            away — so the two pages fold the same way. */}
        {picked !== null || markCard ? (
          <div
            className={`fx-city-ledger${sheetOpen ? "" : " is-shut"}`}
            data-stop={zoomStop}
            role="dialog"
            aria-label={sheetLabel || t("us.sf.thecity.margin.head")}
          >
            {/* ── THE HANDLE: FOLD, OR CLOSE ───────────────────────────────
                One handle, two things a thumb does with a drawer: a tap or a
                swipe down on the bar folds it to its handle (the city takes
                the screen; swipe up or tap brings it back), and the × sends
                it away. The audit found the old bar had a handle that did
                not drag and a ▾ AND an × that did two different things. */}
            <div
              className="fx-city-sheet-grab"
              onTouchStart={(e) => { swipeY.current = e.touches[0]?.clientY ?? null; }}
              onTouchEnd={(e) => {
                const y0 = swipeY.current;
                swipeY.current = null;
                const y1 = e.changedTouches[0]?.clientY;
                if (y0 === null || y1 === undefined) return;
                const dy = y1 - y0;
                if (dy > SWIPE_PX) { if (sheetOpen) setSheetOpen(false); else close(); }
                else if (dy < -SWIPE_PX) setSheetOpen(true);
              }}
            >
              <button
                type="button"
                className="fx-city-sheet-fold"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((v) => !v)}
              >
                <span className="fx-city-sheet-bar" aria-hidden="true" />
                <span className="fx-city-sheet-yr">{sheetLabel}</span>
                <span className="fx-city-sheet-n">
                  {recLoading && !markCard ? "…" : `${n} ${n === 1 ? "decision" : "decisions"}`}
                </span>
              </button>
              <button
                type="button"
                className="fx-city-sheet-close"
                aria-label={t("fx.search.close")}
                onClick={() => (markCard ? setMarkCard(null) : close())}
              >
                ×
              </button>
            </div>
            {markCard ? (
              <MarkCard card={markCard} onClose={() => setMarkCard(null)} />
            ) : (
              <CityBlockPanel
                record={record}
                context={ctx}
                request={request}
                onFiche={setAt}
                loading={recLoading}
                onClose={close}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
