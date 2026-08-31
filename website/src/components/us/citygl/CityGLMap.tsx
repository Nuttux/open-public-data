"use client";

/**
 * The GL map's React mount.
 *
 * The same job `components/us/city/CityMap.tsx` does for the Canvas renderer,
 * and deliberately the same shape: a stage, a canvas that fills it, a record
 * margin beside it, and a handle handed back once so a page can drive the
 * camera. What is different is everything under the canvas.
 *
 * `ssr: false` at the call site — a WebGL context cannot be server-rendered,
 * and the page's `<h1>` lives in the page, not here, so the server still
 * sends a document with the title in it.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import { CityEngine } from "@/lib/citygl/engine";
import { CITY_SYSTEMS } from "@/lib/citygl/systems";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import { loadFineDem, meshElevAt, terrainLayer } from "@/lib/citygl/layers/terrain";
import { decodeParks } from "@/lib/city/trees";
import { markTerrainCells } from "@/lib/citygl/mark-cells";
import { fireLayer, type FireLayer } from "@/lib/citygl/fire";
import { decodeCoast } from "@/lib/city/water";
import { loadLandMask } from "@/lib/citygl/coast-mask";
import { loadBathy, waterLayer } from "@/lib/citygl/layers/water";
import { loadSurroundLandcover, surroundLayer } from "@/lib/citygl/layers/surround";
import { buildingsLayer } from "@/lib/citygl/layers/buildings";
import { heroesLayer } from "@/lib/citygl/layers/heroes";
import { capsLayer } from "@/lib/citygl/layers/caps";
import { railLayer } from "@/lib/citygl/layers/rail";
import { bikewayLayer } from "@/lib/citygl/layers/bikeways";
import { railHistoryLayer } from "@/lib/citygl/layers/rail-history";
import { streetsLayer } from "@/lib/citygl/layers/streets";
import { streetDetailLayer } from "@/lib/citygl/layers/street-detail";
import { streetMarkingsLayer } from "@/lib/citygl/layers/street-markings";
import { blockTintLayer } from "@/lib/citygl/layers/block-tint";
import { streetUncoveredLayer } from "@/lib/citygl/layers/street-uncovered";
import { attachSky } from "@/lib/citygl/sky";
import { saveView } from "@/lib/citygl/export";
import { groundDetailLayer } from "@/lib/citygl/layers/ground-detail";
import { treesLayer } from "@/lib/citygl/layers/trees";
import {
  themeMarksLayer,
  MARK_SHAPES,
  THEME_INK,
  WINDOW_YEARS,
  type MarkHit,
  type MarkShape,
  type ThemeMarksLayer,
} from "@/lib/citygl/layers/theme-marks";

/**
 * One row of `themes.json` — what the filter offers, and what it is allowed to
 * say about each subject.
 *
 * `kind` is `place` or `era`, and the split is measured rather than stylistic.
 * A `place` subject is sharp in space and is answered by clicking a dot; an
 * `era` subject is sharp in time and is answered by driving the year rail. The
 * seed records the spatial and temporal concentration each one was judged on.
 */
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

/**
 * A subject chip, selected or not.
 *
 * The selected state is carried by the BORDER and the weight, not by filling
 * the chip with the subject's colour: at these sizes a filled chip puts white
 * text on eight different grounds, four of which were stepped for a cream map
 * and not for type. The dot beside the label carries the colour, the label
 * carries the identity, and neither depends on the other.
 */
function chipStyle(on: boolean, ink: string | null): React.CSSProperties {
  return {
    font: `${on ? 600 : 400} 12px/1 var(--f-sans, system-ui)`,
    padding: "7px 10px",
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${on ? (ink ?? "var(--ink, #1a1a19)") : "var(--rule, #e4e6ea)"}`,
    boxShadow: on ? `inset 0 0 0 1px ${ink ?? "var(--ink, #1a1a19)"}` : "none",
    background: "var(--surface, #fff)",
    color: "var(--ink, #1a1a19)",
  };
}
import { CityOverlay } from "@/lib/citygl/overlay";
import { CityHelpRow } from "@/lib/citygl/help-row";
import { useT } from "@/lib/localeContext";
import { attachControls, bandCuts, stepForZ } from "@/lib/citygl/controls";
import { createFilm, resolveFrames, type FilmPlayer } from "@/lib/citygl/film";
import { detectQuality } from "@/lib/citygl/quality";
import { blockPicker } from "@/lib/citygl/pick";
import CityBlockPanel, {
  type BlockContext,
  type UnitRequest,
} from "@/components/us/city/CityBlockPanel";
import CitySearch from "@/components/us/city/CitySearch";
import type { SearchHit } from "@/lib/us/city-search";
import {
  blockPlaceName,
  ficheParams,
  sourceHref,
  stripFileNumber,
  usdShort,
  loadBlockIndex,
  loadBlockRecord,
  readFicheParams,
  type BlockDecision,
  type BlockIndex,
  type BlockRecord,
  type FicheLink,
} from "@/components/us/city/block-records";
import { roofPalette, wallPalette } from "@/components/us/city/palette";

/**
 * THE RAIL'S OWN SPAN.
 *
 * ── IT OPENS IN 1906, NOT 1849 ───────────────────────────────────────────
 * 1849 is where the assessor's YEAR BYTE counts from, which is a fact about
 * the encoding and not about the map. The map's own first year is 1906: it is
 * where the burn is full, where the film opens, and where the record this page
 * draws actually begins. Fifty-seven years of rail that change nothing are
 * fifty-seven years of a reader dragging through an empty city wondering what
 * is broken. The year BYTE still counts from 1849 — see the `year0: 1849` the
 * material tables are given — and nothing about that changes.
 *
 * ── AND THE RIGHT-HAND END IS A YEAR, NOT "TODAY" ────────────────────────
 * It used to read "today", which is a claim about the day you are reading on
 * and not about the record. The record runs to 2026 — the Clerk's own volumes
 * carry 109 decisions in 2026 so far — so the rail says 2026 and means it.
 * Internally the far right is still `undefined` rather than a number, because
 * that is what draws a footprint the roll cannot date; the difference is only
 * in what the reader is told.
 */
const YEAR_MIN = 1906;
const YEAR_MAX = 2026;

/** the key's own English when the catalogue has not been filled in yet */
function tOr(t: (k: string) => string, k: string, en: string): string {
  const v = t(k);
  return v === k ? en : v;
}
/** years a second at 1x: the century in forty seconds */
const SPEED_1X_YPS = (YEAR_MAX - YEAR_MIN) / 40;
/** what the speed button steps through */
const SPEEDS = [1, 2, 4] as const;

export interface CityGLMapProps {
  descriptor: CityDescriptor;
  /** rendered in the record margin beside the stage */
  ledger?: React.ReactNode;
  /**
   * THE HANDOVER, and it carries TWO things now.
   *
   * The film is built in here — the engine, the framings and the interrupt
   * binding are all in this file — but the two surfaces that DRIVE it belong
   * to the page: the entry plate, whose primary door is the film, and the
   * film's own chrome, which is prose and has to be in the document rather
   * than painted on a canvas. Both are rendered outside this component
   * because the page is server-rendered and this is not, so the player has to
   * come back out. `null` where the city's descriptor carries no film.
   */
  onReady?: (engine: CityEngine, film: FilmPlayer | null) => void;
}

export default function CityGLMap({ descriptor, ledger, onReady }: CityGLMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setNonce] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [record, setRecord] = useState<BlockRecord | null>(null);
  const [ctx, setCtx] = useState<BlockContext | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const blockCols = useRef<{
    hood: Uint8Array; hoodNames: readonly string[]; area: Float32Array;
  } | null>(null);
  const idxRef = useRef<BlockIndex | null>(null);
  const pickerRef = useRef<ReturnType<typeof blockPicker> | null>(null);
  /* block id → position in the index arrays. Built once on first use: the
     search hands over an id and everything else here counts in positions. */
  const posRef = useRef<Map<string, number> | null>(null);
  const [request, setRequest] = useState<
    { req: UnitRequest; nonce: number; block: string } | undefined
  >(undefined);
  const nonceRef = useRef(0);
  const [at, setAt] = useState<{ street?: string; address?: string; hood?: boolean }>({});
  /**
   * THE URL AS IT ARRIVED, captured during the first render.
   *
   * Not read from `window.location` inside the restore effect, because the
   * WRITER gets there first: on mount `picked` is null, so it writes "no
   * fiche" and deletes the very params the restore was about to read. This
   * ref is filled while React is still rendering, before any effect of either
   * can run, so what a reader was sent survives the map's own bookkeeping.
   */
  /** has the restore had its turn? until then the writer stands down */
  const opened = useRef(false);
  const arrivedWith = useRef(
    typeof window === "undefined" ? "" : window.location.search,
  );
  /**
   * ── WHAT THE READER CAN SEND SOMEBODY ────────────────────────────────
   * Written with `replaceState` and never `pushState`, for the reason
   * `CityMap` already states: a reader moving around the map is not
   * navigating, and twenty picks that each cost a press of Back would make
   * the button useless for leaving the page. Back leaves; the panel's × and
   * Escape are what close a fiche.
   */
  const writeUrl = useCallback((link: FicheLink | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const k of ["block", "street", "address", "hood"]) {
      url.searchParams.delete(k);
    }
    if (link) {
      for (const [k, v] of ficheParams(link)) url.searchParams.set(k, v);
    }
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const engineRef = useRef<CityEngine | null>(null);
  const overlayRef = useRef<CityOverlay | null>(null);
  /* the subject filter: the layer, its vocabulary, and which one is lit.
     `subject` is a single bit or null — see `theme-marks.ts` §THE INK for why
     it is one at a time and not a set of checkboxes. */
  const marksRef = useRef<ThemeMarksLayer | null>(null);
  const [themes, setThemes] = useState<ThemeEntry[] | null>(null);
  const [subject, setSubject] = useState<number | null>(null);
  const [subjectLit, setSubjectLit] = useState(0);
  /* ── WHAT A PRESSED DOT PUTS ON SCREEN ──────────────────────────────────
     Its own small card, and NOT the fiche: the reader asked what one mark is,
     and a fiche answers what a whole block is. Held apart from `picked` for
     the same reason — a dot press must not select a block, or the next press
     on the city would look like it had already happened.

     `rows` is filtered to the year window the map is showing, because that is
     what the dot stands for: the same mark at 1925 and at 2026 is two
     different answers, and the card has to be the one on screen. */
  /* the listener is made once, so what it reads has to be a ref and not a
     value captured on the render that made it */
  const themesRef = useRef<ThemeEntry[] | null>(null);
  const yearRef = useRef<number | null>(null);
  const [markCard, setMarkCard] = useState<{
    hit: MarkHit;
    label: string;
    ink: string;
    place: string;
    rows: readonly {
      readonly d: BlockDecision;
      /** the plain-English subject this line matched, if any */
      readonly says: string | null;
    }[];
    year: number;
  } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  /* THE YEAR THE MARKS ARE STANDING ON, kept apart from the scrub's own
     imperative path. The rail drives the city's geometry every frame of a
     drag and must not wait on React; the marks are rebuilt from a Map and a
     matrix upload, which is cheap but not free, so they follow the SETTLED
     year rather than every intermediate one. */
  useEffect(() => { themesRef.current = themes; }, [themes]);
  useEffect(() => { yearRef.current = year; }, [year]);
  useEffect(() => {
    const layer = marksRef.current;
    if (!layer) return;
    /* `year === null` IS THE PRESENT, NOT ALL TIME. The rail clears the year
       to mean "the city as it stands", and that is what the geometry draws —
       but the marks layer reads `year: undefined` as EVERY year, so clearing
       the rail (releasing the scrub, the film reaching its end, the 2026
       button) lit all 16,468 marks at once over a present-day city. Two
       meanings for one value, and the wrong one was reaching the layer. The
       present is YEAR_MAX; `undefined` stays available for an all-time
       control that does not exist yet. */
    const lit = layer.setFilter({
      bits: subject === null ? 0 : 2 ** subject,
      year: year ?? YEAR_MAX,
    });
    setSubjectLit(lit);
    engineRef.current?.invalidate();
  }, [subject, year]);
  const filmRef = useRef<FilmPlayer | null>(null);
  const remeasureFilmRef = useRef<(() => void) | null>(null);
  const [filmOn, setFilmOn] = useState(false);
  /* ── THE TRANSPORT ─────────────────────────────────────────────────────
     The speed used to BE the rate — 3, 6, 12, 24 years a second — and the
     button printed it with a multiplication sign after it. Daniel: *"the
     speed are 3x 6x 12x 24x wtf why not 1 x 2x 4 etc?"*. He is right: "6×"
     reads as six times normal speed, and there was no normal speed for it to
     be six times of.

     So the reader picks a MULTIPLE and the rate is derived. 1× runs the
     century in forty seconds, which is a walk; 4× in ten, which is the whole
     thing at a glance. */
  /** the scrub's own DOM node — see §THE SCRUB IS NOT CONTROLLED */
  const scrubEl = useRef<HTMLInputElement | null>(null);
  /** the year readout's own node — §AND THE READOUT IS NOT CONTROLLED EITHER */
  const readoutEl = useRef<HTMLSpanElement | null>(null);
  /** put a year on the scrub without going through React */
  const syncScrub = useCallback((y: number | undefined) => {
    const el = scrubEl.current;
    if (!el) return;
    const v = y ?? YEAR_MAX;
    if (Number(el.value) !== v) el.value = String(v);
    const frac = (v - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    el.style.setProperty("--scrub", `${(frac * 100).toFixed(2)}%`);
    /* ── §AND THE READOUT IS NOT CONTROLLED EITHER ────────────────────────
       It was `{year ?? YEAR_MAX}`, which meant the play loop had to push a
       React state update every animation frame to move a four-digit number.
       That re-rendered the whole control row 60 times a second AND re-ran the
       marks filter, which this file's own §THE MARKS FOLLOW THE SETTLED YEAR
       says must not happen: *"they follow the SETTLED year rather than every
       intermediate one"*. The play loop was the one path that broke it.

       The number is written the same way the thumb is, straight to the node,
       and React state is committed once when the clock settles. */
    const r = readoutEl.current;
    if (r) r.textContent = String(v);
  }, []);
  const [playing, setPlaying] = useState(false);
  /* ── AND THE DEFAULT OF A MULTIPLIER IS ONE ────────────────────────────
     It opened on 2×, which is a control saying "twice" with nothing to be
     twice OF. Daniel: *"wy is 2x the default speed and not 1x?"* — and there
     is no answer, because 2 was never argued for anywhere in this file. The
     paragraph above defines what 1× MEANS — the century in forty seconds,
     "which is a walk" — so that is what the page should open at and what the
     other two stops are multiples of. A reader who wants it faster presses
     the button, and now the button's label is true. */
  const [speed, setSpeed] = useState(1);
  /** which system is lit — see `lib/citygl/systems.ts` */
  const [system, setSystem] = useState<string | null>(null);
  const playRate = speed * SPEED_1X_YPS;

  /* ── AND THE READOUT FOLLOWS THE CLOCK, WHICH REACT CANNOT SEE ─────────
     The clock lives in the engine and hands the year straight to the layers,
     which is the point: no React render is in the path of a frame. So the
     rail's own number and thumb are polled while it runs — one rAF, only
     while playing, and the integer year is all this needs because the
     FRACTION is for the fabric and not for the reader. */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const poll = () => {
      const e = engineRef.current;
      if (!e) return;
      if (!e.playing) {
        /* ── AND IT LANDS ON THE LAST YEAR, NOT ONE SHORT OF IT ───────────
           MEASURED at the end of a run: the thumb stopped at 2025 while the
           readout said 2026, because the final poll ran before the engine
           released the clock and nothing wrote the end. */
        syncScrub(undefined);
        setPlaying(false);
        setYear(null);
        return;
      }
      const y = e.getYear();
      /* imperative only — §AND THE READOUT IS NOT CONTROLLED EITHER */
      syncScrub(y === undefined ? undefined : Math.floor(y));
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [playing, syncScrub]);
  const [saving, setSaving] = useState(false);
  /** the year a drag is currently on, and its one coalesced frame */
  const scrubRef = useRef<number | undefined>(undefined);
  const scrubRaf = useRef(0);
  const t = useT();
  const stopsRef = useRef<{ label: string; go: () => void; i: number }[]>([]);
  /* camera scale per named zoom stop, largest view first */
  const stopScalesRef = useRef<number[]>([]);
  /* the two detail-band boundaries this city's own stop ladder implies —
     `controls.ts` §THE CUTS BELONG TO THE STOPS. Seeded with the Canvas
     page's ladder so a pick before the stops are built still classifies. */
  const stopCutsRef = useRef<readonly [number, number]>(bandCuts([1, 2.9, 7.2]));
  /* which stop the reader was nearest when they clicked — 0 whole city, up to
     the closest stop. `-1` while unknown. */
  const [zoomStop, setZoomStop] = useState(-1);
  const router = useRouter();
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let disposed = false;
    let engine: CityEngine | null = null;
    let ro: ResizeObserver | null = null;
    let detachControls: (() => void) | null = null;

    void (async () => {
      let data: CityData;
      try {
        data = await CityData.load({ baseUrl: descriptor.dataBaseUrl });
      } catch (e) {
        if (!disposed) setFailed(e instanceof Error ? e.message : String(e));
        return;
      }
      if (disposed) return;

      /* THE PROJECTION IS CONFIGURED FROM THE MANIFEST, exactly as the Canvas
         path configures it — same call, same numbers, so the two renderers
         cannot drift apart in the one place where drifting would make every
         comparison meaningless. */
      const p = data.manifest.proj as unknown as {
        X0: number; Y0: number; s: number; N: number;
      };
      projection.setBand(0);

      /* THE BASE TIER, BEFORE THE FIRST FRAME. `CityData.load` fetches the
         manifest and nothing else; the ground, the blocks and the coast are
         `loadBase()`, which is the same call the Canvas page makes and the
         same fifteen chunks. */
      await data.loadBase();
      if (disposed) return;

      /* ── WEBGL 2 BY DEFAULT, WEBGPU BEHIND `?gpu=1` — AND THE REASON IS
         THE ACCUMULATION ─────────────────────────────────────────────────
         WebGPU works now. The thing that had it pinned off for months was one
         vertex attribute: the ink outlines carried a THREE-byte colour, and
         WebGPU requires a vertex buffer's `arrayStride` to be a multiple of
         four, so `CreateRenderPipeline` failed and an invalid pipeline takes
         the whole command buffer with it — the backend drew bare terrain with
         every building, street and tree missing. `layers/buildings.ts` §FOUR
         BYTES A VERTEX pads it, and the two backends now agree to within half
         a level of 255 on every channel at three cameras.

         It is still not the default, and the reason is `temporal.ts`. That
         pass is what takes the last of the shimmer out — 0.41 % of a drag
         step not lining up against 0.00 % — and it works by copying the
         drawing buffer and mixing it into the next frame. On WebGPU that
         buffer is `rgba16float` and the mix comes back WRONG, in a way that
         is stable rather than obvious: MEASURED over ten real drags, the
         frame settles at 81.5 of 255 where it should sit at 155. Daniel saw
         it as an overcast over the whole city, twice.

         Both readings of that buffer have been tried and both are wrong —
         converted as encoded it darkens, sampled raw it blows out — so the
         format is doing something this file does not yet understand, and
         guessing again is how the veil shipped the first time.

         So the backend that ships is the one where the city does not shimmer
         AND is the right colour. `?gpu=1` opts into WebGPU for anyone working
         on it; the accumulation is the thing to fix there, and the check is a
         SOAK — ten drags with the exposure sampled throughout, because a
         feedback error compounds and a two-second capture cannot see it. */
      const q = typeof location !== "undefined" ? location.search : "";
      /* ── WEBGPU IS THE DEFAULT NOW, AND `?gl=1` PINS THE OLD ONE ────────
         What kept it off was the accumulation, and `engine.ts` no longer runs
         that pass on this backend — the gate above it had been hardcoded open.
         Verified from the page: the dark overlay is gone.

         `WebGPURenderer` falls back to a WebGL 2 backend by itself where
         WebGPU is unavailable, so this is not a support cliff; `engine.backend`
         still reports which one actually came up. */
      const forceWebGL = /(?:\?|&)gl=1/.test(q);
      const quality = detectQuality(q);
      engine = new CityEngine({ canvas, descriptor, forceWebGL, quality });
      /* the backend's device request is asynchronous — nothing may be added
         or drawn until it is up. See `CityEngine.init`. */
      await engine.init();
      if (disposed) return;

      const spanM = (p.N - 1) / p.s;

      /* ── THE REGIONAL SHORELINE, BEFORE THE GROUND IS BUILT ─────────
         `surroundCoast()` carries two things the ground cannot do without:
         `cityOffshoreBits`, the per-cell bit saying which of the CITY's own
         DEM cells are offshore, and the rings the far shore is cut at. The
         first has to be in hand before `terrainLayer` walks the mask, which
         is why it is fetched here rather than beside the surround it also
         serves. */
      const surroundCoast = await data.surroundCoast().catch(() => null);
      if (disposed) return;
      /* ── AND THE GROUND IS CUT AT THE PUBLISHED LINE, SUB-CELL ──────
         Two earlier attempts cut whole CELLS and both deleted real land — the
         second removed 2,172 of 37,754, a 3.44 km2 strip of Ocean Beach,
         1.15 km2 of Crissy Field, Treasure Island and the pier field, on the
         strength of an export note that turned out to be about a different
         grid. Neither failure was the ring's fault: the DEM's land mask
         deliberately overhangs the published shore by a 300 m pad so a finer
         register can decide it, and nothing downstream ever did.

         `layers/coast-mask.ts` now decides it. It scan-converts the rings at
         six sub-cells to the cell, keeps a wholly-inside cell whole, rebuilds
         a crossed cell as sub-quads with bilinear elevation and colour, and
         drops only what is wholly outside. Tread 53.8 m to 8.97 m — 5.1 px to
         0.85 px at the whole-city camera — and the land COUNT is unchanged at
         37,754, which the layer re-asserts through `coastStats()`.

         The rings are the UNION of both registers, and that is load-bearing:
         inside the city outline 35,627 cells, inside the regional hydrography
         35,582, inside either 35,678. Either one alone deletes a piece of the
         city. */
      const cityCoast = surroundCoast?.rings ?? null;

      /* ── THE FINE GROUND, BEFORE ANYTHING STANDS ON IT ──────────────
         Twelve layers below place their geometry against `groundAt`, so a
         ground that changed after they were built would detach every one of
         them by up to the fine field's residual — 4.66 m rms and 19.20 m at
         the 99th percentile. Awaiting it HERE, before the terrain layer that
         draws it and before the fabric that stands on it, means there is no
         rebuild and no detachment. A city without the file gets null and the
         coarse triangles, exactly as before. */
      const fineDem = await loadFineDem(data.assetBase);
      if (disposed) return;

      /* what is GROWING on the land that is not the subject. Fetched here with
         the elevation because it is read while the surround's colours are
         first composed, and a city that publishes none gets null and the
         elevation tint, exactly as before. */
      const surroundLC = await loadSurroundLandcover(data.assetBase);
      if (disposed) return;

      /* ── ONE ANSWER TO WHERE THE LAND STOPS, AND EVERY GROUND READS IT ──
         `coast-mask.ts` §AND THE SAME ANSWER CAN COME FROM A FIELD. Loaded
         BEFORE the ground, because the ground's own cut reads it now and so
         does the far shore's and so does the bay plate's — one register
         where there were four. Absence is the published rings on all three,
         unchanged, and `?lmask=0` is the same. */
      const landmask = await loadLandMask(data.assetBase);
      if (disposed) return;

      const terrain = terrainLayer(
        data,
        descriptor.look.zexByStep,
        (t) => {
          /* ── THE CITY DEM REACHES PAST THE CITY, AND SOMETHING HAS TO SAY SO ──
             The published DEM is a 13.9 km square and San Francisco is not
             square: its north-west corner takes in the Marin shore across the
             Golden Gate, and its own land bit calls those cells land, because
             they are. Drawn with the city's own ground colours — which are
             built for a photographed, tinted, park-marked city and not for a
             headland with none of that — they came out CLIPPED WHITE, and a
             bleached blocky mass sat across the Gate in every whole-city
             frame. Bisecting the scene one mesh at a time put it on this one:
             hide the city terrain and the white goes; hide the surround, the
             water, or anything else and it stays.

             `cityOffshoreBits` is the published answer and `maskAt` already
             honours it — it is simply never set. `scene.ts` §bandFor sets it
             in one line, as the first thing it does to the field. */
          t.coastFix = surroundCoast?.cityOffshoreBits ?? null;

          /* the measured ground tint, the one thing the field needs that its
             own chunk does not carry — `scene.ts` §bandFor does the same */
          const tint = data.get("base/canopy-tint");
          if (tint) t.canopyFrac = tint.fields.demFrac as Uint8Array;

          /* ── AND THE PARK CELLS, WITHOUT WHICH NOTHING IS GREEN ────────
             `terrainRGB` has TWO rows: ordinary ground, and park. Which one a
             node reads is `cellPark`, and `cellPark` is filled by walking the
             published park rings — `scene.ts` §bandFor does it in one line
             and this did not do it at all. The consequence was on screen and
             Daniel named it: Jefferson Square, Golden Gate Park and every
             other published park were the same bleached cream as the street
             beside them. The greens were never missing from the palette; the
             terrain was simply never told which cells were park. */
          const parksChunk = data.get("base/parks");
          if (parksChunk) {
            const pk = decodeParks(parksChunk);
            markTerrainCells(t, pk.parks, t.cellPark);
          }
        },
        cityCoast,
        fineDem,
        landmask,
      );
      engine.scene.add(terrain.mesh);
      engine.add(terrain);
      /* the ground every later layer asks for its elevation — declared here,
         with the layer that owns it, because three of them need it before the
         fabric is built */
      const field = terrain.fieldFor(0);

      /* ── THE BURNED DISTRICT ────────────────────────────────────────
         `base/coast` ships two registers and this port was reading one: the
         shoreline, and the boundary of the 1906 burn. `TerrainField` has a
         `cellBurn` byte and `terrainRGB` a burn row, and with nothing filling
         the first the second has never been on screen on either renderer.
         `lib/citygl/fire.ts` fills it, carries the ground to ash on that
         ramp, and strokes the boundary.

         The register ships SEVEN rings — one outer and six holes, pockets of
         82,195 m2 that did not burn — so the fill is even-odd and not a union,
         which spares 27 cells the union would have blackened.

         The two years are the CITY's: the ash is full at 1906 and the
         reference renderer's own `burnPhase` clears it by 1913, over the seven
         years the permits say the city put more back than it lost. The engine
         is told the numbers and never the date. */
      const coastForBurn = data.get("base/coast");
      let fire: FireLayer | null = null;
      if (coastForBurn) {
        const burnRings = decodeCoast(coastForBurn).burn;
        if (burnRings.length) {
          fire = fireLayer({
            ground: terrain.mesh,
            fieldFor: terrain.fieldFor,
            rings: burnRings,
            proj: (x, y, z) => projection.proj(x, y, z),
          });
          fire.setYearFade({ full: 1906, clear: 1913 });
          engine.scene.add(fire.mesh);
          engine.add(fire);
          if (process.env.NODE_ENV !== "production") {
            (globalThis as { __cityGLFire?: unknown }).__cityGLFire = fire;
          }
        }
      }

      /* the land that is not the subject, at its own coarser grid */
      /* the far shore, cut at the same published rings */
      const surround = surroundLayer(
        data,
        terrain.fieldFor(0),
        descriptor.look.zexByStep,
        surroundCoast?.rings ?? null,
        surroundLC,
        surroundCoast ? (i: number, j: number) => surroundCoast.cityOffshore(i, j) : null,
        landmask,
      );
      if (surround) {
        engine.scene.add(surround.mesh);
        engine.add(surround);
      }

      /* the bay, under the ground and under everything — the fade's centre is
         the city's own downtown, which its manifest publishes */
      const downtown = (data.manifest.proj as unknown as {
        downtown: [number, number];
      }).downtown;
      try {
        /* a finer sea floor if the city ships one — `layers/water.ts`
           §AND THE SEA FLOOR. Absence is the published chunk, unchanged. */
        const bathy = await loadBathy(data.assetBase);
        if (disposed) return;
        const water = waterLayer(data, { anchor: downtown, bathy, landmask });
        engine.scene.add(water.mesh);
        engine.add(water);
      } catch (e) {
        // a city with no bathymetry is a city with no bay layer, not a failure
        console.warn("citygl: no water layer —", e);
      }

      /* ── THE AIR THE FAR SHORE RECEDES INTO ─────────────────────────
         There is no sky under this camera — the projection is linear, so the
         ground plane's image covers the WHOLE screen at every zoom and there
         is no vanishing line to put one above. What the frame needs is not sky
         behind the city but AIR IN FRONT OF IT: the published haze ramp
         carried past the cap where it stops.

         `WA.hazecap` is 0.45, so beyond 10,150 m from the anchor the far field
         stops receding altogether — and measured, three of the four ground
         corners of the opening frame are already out there (6,793 / 10,404 /
         11,783 / 14,176 m). One world-baked quad pays the rest of the ramp out
         to the paper, converging on `HAZE` exactly, which is the renderer's own
         clear colour: the picture ends IN the sheet rather than at an edge.
         `?sky=0` for the A/B. See `lib/citygl/sky.ts`. */
      attachSky(engine, { anchor: downtown });

      /* the whole city, centred on the DEM's own middle */
      const midX = p.X0 + spanM / 2;
      const midY = p.Y0 + spanM / 2;
      const centre = projection.proj(midX, midY, 0);
      const rect = host.getBoundingClientRect();
      const across = projection.proj(p.X0 + spanM, midY, 0)[0] - projection.proj(p.X0, midY, 0)[0];
      engine.setCamera({
        cx: centre[0],
        cy: centre[1],
        scale: (rect.width * 0.92) / Math.max(1, across),
      });
      engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);

      ro = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        const d = Math.min(engine?.quality.maxDpr ?? 2, window.devicePixelRatio || 1);
        engine?.resize(r.width, r.height, d);
        overlayRef.current?.resize(r.width, r.height, d);
        /* the framings are FRACTIONS of the viewport, so a resize invalidates
           every one of them — two dot products and a terrain sample a shot */
        remeasureFilmRef.current?.();
        engine?.invalidate();
      });
      ro.observe(host);

      /* DEV-ONLY, the `__cityWA` idiom: the parity harness needs to put BOTH
         renderers on the same camera, and the camera is expressed in plane
         units that only the projection can produce. Exposing the projection
         and the city's own centre is what lets the harness compute one camera
         and hand it to both pages. */
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __cityGLField?: unknown }).__cityGLField = field;
        (globalThis as { __cityGLData?: unknown }).__cityGLData = data;
        (globalThis as { __cityGLSurround?: unknown }).__cityGLSurround = data.surround();
        (globalThis as { __cityGLProj?: unknown }).__cityGLProj = {
          proj: (x: number, y: number, z = 0) => projection.proj(x, y, z),
          centre: [p.X0 + spanM / 2, p.Y0 + spanM / 2],
          spanM,
        };
      }

      /* ── WHERE THE GROUND IS, FOR EVERYTHING THAT SITS ON IT ────────
         `field.elevM` rounds to the nearest DEM node: it is a 53.815 m
         staircase, and it used to place every one of the layers below. The
         ground mesh interpolates, so a thing on the staircase and the ground
         under it agree once a cell and nowhere else. `layers/terrain.ts`
         §WHERE THE GROUND ACTUALLY IS has the measurement — 9.54 % of street
         triangles were under the ground they lie on, all of them by more than
         a drawn metre — and `meshElevAt` samples the mesh's own triangles. */
      const groundAt = meshElevAt(
        field,
        data.manifest.proj as unknown as Parameters<typeof meshElevAt>[1],
        fineDem,
      );

      /* ── THE LANDMARKS, BEFORE THE FABRIC ───────────────────────────
         `landmarks()` is async, and the fabric has to know which footprints
         NOT to draw before it bakes its buffers — a hero and its own prism
         in the same place is one building wearing two shapes. So the table is
         awaited here and the skip set is read straight off it; the layer that
         draws them fills its meshes in `onBuilt`, which is why they are added
         to the scene from inside the callback and not from `.meshes`. */
      const lmTable = await data.landmarks().catch(() => null);
      if (disposed || !engine) return;
      const heroSkip = new Set<number>((lmTable?.heroes ?? []).map((h) => h.bi));

      const heroes = heroesLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
        zexb: descriptor.look.zexb,
        onBuilt: () => {
          const e = engineRef.current ?? engine;
          if (!e || !heroes) return;
          for (const m of heroes.meshes) e.scene.add(m);
          e.invalidate();
        },
      });
      if (heroes) engine.add(heroes);

      /* ── THE CITY ITSELF ────────────────────────────────────────────
         The whole footprint tier, up front. The Canvas path streams it by
         view because it repaints what it holds; this uploads it once and
         then every camera is free. */
      /* ── AND THE FACADE COLUMNS WITH THEM ───────────────────────────
         `face/<cell>` mirrors `bldg/<cell>` row for row: the use class, the
         supplementary storey count, the shop bit, and the ROLE of every ring
         edge — front, back or a measured party wall. It is what turns 166,166
         identical extrusions into a city with fronts and backs, and it is
         fetched in parallel with the footprints because neither blocks the
         other. */
      await Promise.all([data.loadTier("bldg"), data.loadTier("face")]);
      if (disposed || !engine) return;
      /* ── §THE BORROWED YEAR MAY NOT OUTRUN THE REGISTER ────────────────
         `layers/buildings.ts` carries the reasoning. A city that ships no
         floor file gets no floor, which is what every city did before. */
      let heightFloor: [number, number][] | null = null;
      try {
        const hf = await fetch(`${data.assetBase}/base/height-floor.json`);
        if (hf.ok) {
          heightFloor = ((await hf.json()) as { steps?: [number, number][] })
            .steps ?? null;
        }
      } catch {
        heightFloor = null;
      }
      const buildings = buildingsLayer(data, {
        zexb: descriptor.look.zexb,
        heightFloor,
        elevAt: groundAt,
        roofPalette: roofPalette(
          (data.manifest.buildings as { palette: string[] }).palette,
        ),
        wallPalette: wallPalette(),
        skipGids: heroSkip,
        materials: {
          hq: (data.manifest.buildings as { hq?: number[][] }).hq ?? [],
          noSampleBit:
            (data.manifest.buildings as { paintFlagBits?: { nosample?: number } })
              .paintFlagBits?.nosample ?? 4,
          year0: 1849,
          fallbackRoof: 1,
          fallbackWall: 1,
        },
      });
      for (const m of buildings.meshes) engine.scene.add(m);
      engine.add(buildings);

      /* ── AND THE SECOND SOLID ON TOP OF THEM ────────────────────────
         512 published slots — a step, a mast, a spire — standing on the roof
         plane the fabric just drew. Without these, downtown is the median
         height of every tower and reads as a field of boxes. Same palettes,
         same material config and the same hero skip as the fabric: a cap must
         be the same colour as the roof it stands on, and a hero that models
         its own drum must not get a second one. */
      const caps = capsLayer(data, {
        zexb: descriptor.look.zexb,
        elevAt: groundAt,
        roofPalette: roofPalette(
          (data.manifest.buildings as { palette: string[] }).palette,
        ),
        wallPalette: wallPalette(),
        skipGids: heroSkip,
        materials: {
          hq: (data.manifest.buildings as { hq?: number[][] }).hq ?? [],
          noSampleBit:
            (data.manifest.buildings as { paintFlagBits?: { nosample?: number } })
              .paintFlagBits?.nosample ?? 4,
          year0: 1849,
          fallbackRoof: 1,
          fallbackWall: 1,
        },
      });
      if (caps) {
        for (const m of caps.meshes) engine.scene.add(m);
        engine.add(caps);
      }

      /* ── THE GROUND'S OWN DETAIL ────────────────────────────────────
         The published park rings, the inland water bodies, the coastline as a
         drawn edge with a pale rim under it, and the canopy masses. The coast
         especially: without it the shore is the DEM mask's own staircase, and
         at the whole-city camera that blocky edge is the first thing a reader
         sees. The canopy chunk is its own tier. */
      await data.loadTier("canopy");
      if (disposed || !engine) return;
      const ground = groundDetailLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
        landmask,
      });
      if (ground) {
        for (const m of ground.meshes) engine.scene.add(m);
        engine.add(ground);
      }

      /* ── AND THE TRACK ──────────────────────────────────────────────
         Nothing in the shipped fabric carried a rail until now. It is an
         optional asset — a city without `base/rail.json` simply has none —
         and it draws only from the year its own dataset speaks for. See
         `layers/rail.ts`. */
      const rail = await railLayer(data, {
        scene: engine.scene,
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (disposed) return;
      if (rail) engine.add(rail);

      /* ── AND WHERE THE CITY PAINTED A BICYCLE ────────────────────────
         720 km of it, and the register dates 81 % of its own rows without
         any inference at all — one of the very few clocks on this map that
         needs no argument. `layers/bikeways.ts` holds the four classes
         apart, because a shared lane is a road with a picture of a bicycle
         on it and drawing it as a lane would overstate the city. */
      /* ── AND THE TRACK THAT IS NO LONGER THERE ──────────────────────
         The first layer on this map that can TAKE SOMETHING AWAY: a route
         carries the year the Board authorised its tracks to be lifted, so a
         line appears and later goes. See `layers/rail-history.ts`. */
      const histRail = await railHistoryLayer(data, {
        scene: engine.scene,
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (disposed) return;
      if (histRail) engine.add(histRail);

      const bikes = await bikewayLayer(data, {
        scene: engine.scene,
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (disposed) return;
      if (bikes) engine.add(bikes);

      /* ── THE GROUND HAS A GRID ──────────────────────────────────────
         The published assessor block rings, filled warm and translucent under
         the streets. It is the layer this port was missing, and it is why the
         ground read sandy and the streets stopped reading: without a value
         step between a block's interior and the street outside it, the only
         thing saying "block" is the buildings standing on it. See
         `layers/block-tint.ts` for the measurement. */
      const blockTint = blockTintLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (blockTint) {
        engine.scene.add(blockTint.mesh);
        engine.add(blockTint);
      }

      /* ── THE STREETS ────────────────────────────────────────────────
         The published right of way and the carriageway inside it, as two
         filled surfaces on the ground. What shows between them is the
         footway. */
      await data.loadTier("strt");
      if (disposed || !engine) return;
      const streets = streetsLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of streets.meshes) engine.scene.add(m);
      engine.add(streets);

      /* ── AND THE 534 ROADS THE RIGHT-OF-WAY FILE DOES NOT SURVEY ────
         The park roads, the Great Highway, Sloat and the freeways have a
         published centreline and no published polygon, so they came out as a
         name and a faint line over bare ground. Drawn here at the median
         width of the city's own surveyed roads of the same class. */
      const uncovered = streetUncoveredLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (uncovered) {
        engine.scene.add(uncovered.mesh);
        engine.add(uncovered);
      }

      /* the kerbs, the traffic islands, the stairs and the spine centrelines
         — everything the surface layer leaves out, and all of it published */
      const detail = streetDetailLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      for (const m of detail.meshes) engine.scene.add(m);
      engine.add(detail);

      /* the crossings, the centre lines, the 1,944 spans the Board had not
         paved yet, and the tonal pass that sinks the whole right of way below
         every land tone so a street reads as a street at every slope */
      const marks = streetMarkingsLayer(data, {
        elevAt: groundAt,
        zex: descriptor.look.zexByStep[0],
      });
      if (marks) {
        for (const m of marks.meshes) engine.scene.add(m);
        engine.add(marks);
      }

      /* ── THE CANOPY ─────────────────────────────────────────────────
         125,234 published street trees, instanced. Fetched whole like the
         footprints: the cost is the upload, not the draw. */
      await data.loadTier("tree");
      if (disposed || !engine) return;
      const trees = treesLayer(data, {
        elevAt: groundAt,
        zexb: descriptor.look.zexb,
        fromStep: engine.quality.canopyFromStep,
        /* the crowns cast again. The 991 ms that switched this off was the
           shadow BOX, not the trees — it was 3,484 m across at a 1,400 m
           camera and caught nearly every chunk. Re-measured on the fitted
           box, 195,310 crowns casting against not casting is no signal at
           all: 16.5/16.7, 16.7/16.6, 16.8/17.5 ms over three paired runs. */
        castShadow: engine.quality.treeShadow,
      });
      for (const m of trees.meshes) engine.scene.add(m);
      engine.add(trees);

      /* ── WHAT THE RECORD IS ABOUT, WHERE IT HAPPENED ────────────────
         Off until a reader turns a subject on, and that is the coverage
         rule made visual rather than a default nobody chose: the eight
         subjects carry a fifth of the record between them, so a map that
         opened with them lit would be showing a fifth of the city while
         looking like all of it. All decisions is the view; these light on
         top of it.

         Two files, both small, both fetched after the city is standing —
         nothing here is on the first-paint path. */
      void (async () => {
        try {
          const base = descriptor.dataBaseUrl.replace(/\/$/, "");
          const [mk, vocab] = await Promise.all([
            fetch(`${base}/blocks/theme-marks.json`).then((r) =>
              r.ok ? r.json() : null,
            ),
            fetch(`${base}/blocks/themes.json`).then((r) =>
              r.ok ? r.json() : null,
            ),
          ]);
          if (disposed || !engine || !mk || !vocab) return;
          /* the chip prints what the MAP lights, which is every source, not
             the Board's half that themes.json can see */
          const across = mk?.meta?.per_theme ?? {};
          /* THE THREE KNOBS theme-marks.ts SAYS EXIST. It documents `?mark=`,
             `?carpet=N` and `?win=N` as the way to judge a shape, a crowding
             threshold and a window at several zooms without a rebuild — and
             none of the three was read here, so the documentation described a
             feature nobody could use. Read once, at construction, because all
             three change what geometry is built. */
          const q = new URLSearchParams(window.location.search);
          const shape = q.get("mark");
          const carpetQ = Number(q.get("carpet"));
          const winQ = Number(q.get("win"));
          const layer = themeMarksLayer(mk, {
            elevAt: groundAt,
            zex: descriptor.look.zexByStep[0],
            bits: vocab.t.length,
            colours: vocab.t.map(
              (t: { bit: number }) => THEME_INK[t.bit % THEME_INK.length],
            ),
            ...(MARK_SHAPES.includes(shape as MarkShape)
              ? { shape: shape as MarkShape }
              : {}),
            ...(Number.isFinite(carpetQ) && carpetQ > 0
              ? { carpetBlocks: carpetQ }
              : {}),
            ...(Number.isFinite(winQ) && winQ > 0 ? { windowYears: winQ } : {}),
            /* so a flat mark can be turned to face the reader instead of
               lying in the ground, where the camera's tilt smears it */
            faceCamera: () => engineRef.current!.camera.quaternion,
            /* the camera that actually drew the frame, so the hit test and the
               picture cannot drift apart */
            screen: () => {
              const e2 = engineRef.current;
              if (!e2) return null;
              return { camera: e2.camera, W: e2.viewport.W, H: e2.viewport.H };
            },
          });
          if (!layer) return;
          for (const m of layer.meshes) engine.scene.add(m);
          engine.add(layer);
          marksRef.current = layer;
          setThemes(
            vocab.t.map((t: ThemeEntry) => ({
              ...t,
              n: across[String(t.bit)] ?? t.n,
            })),
          );
          engine.invalidate();
        } catch {
          /* the map is the feature; the filter is an addition to it, and a
             filter that fails to load must cost the filter and not the city */
        }
      })();

      /* ── THE WRITING, AND THE CONTROLS ──────────────────────────────
         A second canvas over the first for the type, and a pointer/keyboard
         controller on the stage. Both read the same camera the GPU does. */
      const overlay = new CityOverlay({
        data,
        field: terrain.fieldFor(0),
        dataBaseUrl: descriptor.dataBaseUrl,
      });
      host.appendChild(overlay.canvas);
      overlayRef.current = overlay;
      overlay.resize(
        rect.width,
        rect.height,
        Math.min(engine.quality.maxDpr, window.devicePixelRatio || 1),
      );
      engine.onAfterFrame = (c, s) => overlay.draw(c, s);
      void overlay.load().then(() => engine?.invalidate());

      /* ── CLICKING A BLOCK ───────────────────────────────────────────
         A click is a pointerup that did not travel: a drag ends on a
         pointerup too, and treating that as a pick means every pan selects
         whatever it happens to stop over. Four pixels is the threshold. */
      /* the two columns the record panel needs beside the record itself: the
         published neighbourhood a block sits in, and its published area. The
         hood is joined on the INDEX and never on the name — `build_hood_facts`
         rolls up over the same u8 field, and a string comparison would be a
         second membership able to disagree with the first. */
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

      const picker = blockPicker(data, { elevAt: groundAt });
      /* the search needs to ring and centre a block nobody pointed at, and
         the picker is the only thing that knows where a block IS */
      pickerRef.current = picker;
      if (picker) {
        let downX = 0;
        let downY = 0;
        canvas.addEventListener("pointerdown", (e) => {
          downX = e.clientX;
          downY = e.clientY;
        });
        /* ── A DOT HAS TO LOOK PRESSABLE ─────────────────────────────────
           Everything on this map answers a click, so nothing about a mark
           said it answered a DIFFERENT one — a reader pressing a dot and
           getting the same fiche they get anywhere has no way to tell whether
           they hit it. The cursor is the cheapest thing that can say so, and
           it doubles as the aim: the pointer changes the moment it is inside
           the target, which is how you learn where the target is. */
        canvas.addEventListener("pointermove", (e) => {
          const eng2 = engineRef.current;
          const layer = marksRef.current;
          if (!eng2 || !layer) return;
          const rc = canvas.getBoundingClientRect();
          const over = layer.markAt(e.clientX - rc.left, e.clientY - rc.top);
          const want = over && over.block >= 0 ? "pointer" : "";
          if (canvas.style.cursor !== want) canvas.style.cursor = want;
        });
        canvas.addEventListener("pointerup", (e) => {
          if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return;
          const r = canvas.getBoundingClientRect();
          const eng = engineRef.current;
          if (!eng) return;
          const v = eng.viewport;
          /* ── THE MARK IS ASKED FIRST, AND IT IS A DIFFERENT QUESTION ─────
             `picker.at` answers "which block is under the cursor", which is
             the right answer to a press on the city and the wrong one to a
             press on a dot: it opens the ground the dot stands on and leaves
             the reader to find the record among everything else the block
             holds. A mark knows which record it is, so it is asked first, and
             the block pick stays exactly as it was for every other press.

             It still resolves to the same block — the fiche is the context the
             record needs — but it carries the record with it. */
          const cam = eng.getCamera();
          /* ── A DOT IS NOT THE CITY, AND IT ENDS HERE ─────────────────────
             Two different things can be under the cursor and they answer two
             different questions. A press on a DOT asks "what is this mark",
             and the answer is that subject's records at that place, in the
             window on screen — nothing more, and none of the fiche. A press on
             the CITY asks "what happened here", and that is the fiche, exactly
             as it always was, whether or not dots happen to be lit nearby.

             The first version put the mark's answer INSIDE the fiche, so it
             rode along on every press in the neighbourhood. It keys on the
             press now, and a mark press returns before the block pick runs. */
          const hit = marksRef.current?.markAt(
            e.clientX - r.left, e.clientY - r.top) ?? null;
          if (hit && hit.block >= 0) {
            void openMarkRef.current(hit);
            return;
          }
          setMarkCard(null);
          const b = picker.at(e.clientX - r.left, e.clientY - r.top,
                              cam, v.W, v.H);
          const ov = overlayRef.current;
          if (ov) {
            ov.highlight = b === null ? null : picker.ringOf(b);
            /* the division scrim and the pin both key on the PICKED block, not
               on the ring: the scrim punches the division that block belongs
               to, and the pin writes the name handed to it */
            ov.pick = b;
            /* cleared here and refilled by the record effect. Otherwise the
               new ring wears the previous block's name for a frame, which is
               the one thing a pin must never do. */
            ov.pickLabel = null;
            eng.invalidate();
          }
          /* Classify the click against the named stops: the reader who is on
             top of one street means something different by a click than the
             reader looking at the whole city. */
          const sc = eng.getCamera().scale;
          const scales = stopScalesRef.current;
          if (scales.length) {
            let best = 0;
            for (let i = 1; i < scales.length; i += 1) {
              if (Math.abs(Math.log(sc / scales[i])) <
                  Math.abs(Math.log(sc / scales[best]))) best = i;
            }
            setZoomStop(best);
          }
          setPicked(b);
        });
      }

      const base = engine.getCamera().scale;
      /* ── WHICH DETAIL BAND EACH ZOOM STOP IS IN ──────────────────────
         The cuts are the geometric midpoints of THIS city's own stop ladder —
         `controls.ts` §THE CUTS BELONG TO THE STOPS. They used to be two typed
         constants, and the second fell 4 % SHORT of the DISTRICT stop, so the
         button labelled DISTRICT landed in the closest band and three of the
         four stops shared one rung of a three-rung ladder.

         Taken off `spanM` rather than off the projected scales: the ratio of
         two spans IS the zoom multiple, and it does not depend on the viewport,
         so the wheel and the buttons cannot disagree on a narrow window. */
      const zStops = descriptor.stops.map(
        (s) => descriptor.stops[0].spanM / Math.max(1e-6, s.spanM),
      );
      const stopCuts = bandCuts(zStops);
      stopCutsRef.current = stopCuts;
      detachControls = attachControls(canvas, engine, {
        base,
        zStops,
        onChange: () => setNonce((n) => n + 1),
      });
      canvas.tabIndex = 0;

      /* ── THE FILM ────────────────────────────────────────────────────
         The shot list is the CITY's — eleven framings in its own world metres
         and eleven years out of its own record — so it arrives on the
         descriptor and `lib/citygl/film.ts` never learns where any of it
         points. */
      if (descriptor.film) {
        const eng = engine;
        const script = descriptor.film;
        const measure = () =>
          resolveFrames(script, {
            fit: { base, bx: centre[0], by: centre[1] },
            W: eng.viewport.W,
            H: eng.viewport.H,
            /* AT ZERO ELEVATION, on purpose: `frameOf` carries the elevation
               term apart from the plane centre, because the exaggeration is a
               property of the camera STEP and a framing baked at one step
               would be wrong at the next. */
            proj: (x, y) => projection.proj(x, y, 0),
            elev: groundAt,
          });

        const film = createFilm(eng, script, {
          frames: measure(),
          /* the canvas is where `attachControls` binds, so this is the same
             element the reader reaches for when they want the map back */
          interruptOn: canvas,
          onState: (st) => {
            /* THE WRITING IS ON THE CLOCK TOO. The overlay gates its labels on
               its own year, and without this the city un-builds to 1906 with
               1970's street names still standing on it. */
            const iy = Math.floor(st.yearOut);
            const ov = overlayRef.current;
            if (ov && ov.year !== iy) ov.year = iy;
            /* ── AND THE FIRE IS ON THE CLOCK TOO ────────────────────
               The opening shot is the burned district and its two acts are the
               two halves of it: `build/burnLine` is the boundary drawing
               itself, `fire` is the ground going to ash inside it. Every other
               frame of the film hands both back to the year, which is what
               carries the ash across the match cut and lets it fade out under
               the rebuild. */
            if (fire) {
              const a = st.act;
              if (a?.k === "build" && a.what === "burnLine") {
                fire.setLine(st.u);
                fire.setProgress(0);
              } else if (st.kind === "fire") {
                fire.setLine(1);
                fire.setProgress(st.u);
              } else if (st.shot === "burn") {
                fire.setLine(1);
                fire.setProgress(1);
              } else {
                fire.setLine(null);
                fire.setProgress(null);
              }
            }
          },
          onStop: (reason, st) => {
            setFilmOn(false);
            /* THE RAIL HAS TO AGREE WITH THE SCREEN. An interrupt leaves the
               city standing on the year it stopped on, so the rail says that
               year; the end card releases it back to the settled present,
               which is the map the reader came for. */
            const y = reason === "end" ? null : Math.floor(st.yearOut);
            setYear(y);
            eng.setYear(y ?? undefined);
            if (overlayRef.current) overlayRef.current.year = y ?? undefined;
            eng.invalidate();
          },
        });
        filmRef.current = film;
        remeasureFilmRef.current = () => film.setFrames(measure());
        /* DEV ONLY, the `__cityGL*` idiom: a harness cannot ask the film what
           it thinks it is doing without a handle on it. */
        if (process.env.NODE_ENV !== "production") {
          (globalThis as { __cityGLFilm?: unknown }).__cityGLFilm = film;
        }
      }

      /* ── HOW CLOSE THE READER IS, IN THE MAP'S OWN WORDS ─────────────────
         The panel decides what a click means — the neighbourhood, a street,
         a building — and it needs to know how far in the reader is. The stops
         already convert metres-across into a camera scale; keeping those
         scales lets a pick be classified against them without the panel
         knowing anything about projections. */
      const stopScales: number[] = [];
      stopsRef.current = descriptor.stops.map((s, i) => {
        const at0 = s.at ?? [p.X0 + spanM / 2, p.Y0 + spanM / 2];
        const across0 =
          projection.proj(at0[0] + s.spanM, at0[1], 0)[0] -
          projection.proj(at0[0], at0[1], 0)[0];
        stopScales[i] = (engine!.viewport.W * 0.94) / Math.max(1e-6, Math.abs(across0));
        return {
        label: s.label,
        go: () => {
          const e = engine;
          if (!e) return;
          const at = s.at ?? [p.X0 + spanM / 2, p.Y0 + spanM / 2];
          const c = projection.proj(at[0], at[1], 0);
          const across =
            projection.proj(at[0] + s.spanM, at[1], 0)[0] - projection.proj(at[0], at[1], 0)[0];
          const scale = (e.viewport.W * 0.94) / Math.max(1e-6, Math.abs(across));
          e.setStep(stepForZ(scale / base, stopCuts));
          e.setCamera({ cx: c[0], cy: c[1], scale });
          setNonce((n) => n + 1);
        },
        i,
        };
      });
      stopScalesRef.current = stopScales;

      engineRef.current = engine;
      setLoading(false);
      readyRef.current?.(engine, filmRef.current);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      detachControls?.();
      filmRef.current?.dispose();
      filmRef.current = null;
      remeasureFilmRef.current = null;
      overlayRef.current?.dispose();
      overlayRef.current = null;
      engine?.dispose();
    };
  }, [descriptor]);

  /* ── THE RECORD BEHIND THE PICK ────────────────────────────────────────
     `block-records` memoises the index and every shard for the session, so a
     second pick on the same shard is free and a reader clicking around the
     Mission fetches one file. The panel is the PUBLISHED page's own
     `CityBlockPanel`, unchanged — the port has no business rewriting the
     surface a reader actually reads the record on. */
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
        /* ── WHAT THE PIN SAYS, IN TWO STEPS ──────────────────────────
           The badge beside the ring used to write `3538`. It writes where you
           are instead, and the two halves of that arrive at different times:
           the neighbourhood is a column already in memory, so it can be on
           screen in the same frame as the ring; the streets need the shard.
           Setting the coarse answer first and refining it is what stops the
           pin appearing empty and then filling — the reader watches
           "Castro/Upper Market" become "Church · 16th St · Market", never
           nothing become something. */
        const ov = overlayRef.current;
        if (ov) {
          ov.pickLabel = hoodName || null;
          engineRef.current?.invalidate();
        }
        const r = await loadBlockRecord(index, picked);
        if (!dead) {
          setRecord(r);
          const ov2 = overlayRef.current;
          if (ov2) {
            ov2.pickLabel =
              (r ? blockPlaceName(r.streets) : null) || hoodName || null;
            engineRef.current?.invalidate();
          }
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
  }, [picked, zoomStop]);

  /**
   * A RESULT THE READER TYPED, LANDED ON THE MAP.
   *
   * Three things have to happen together and in this order, or the reader
   * watches the map arrive somewhere before the fiche agrees with it:
   *
   *   1. the camera moves to the block and the ring goes round it — the same
   *      ring and pin a click draws, because it IS a pick;
   *   2. the panel is told which unit the reader meant, which a click could
   *      only infer from how far in they were standing;
   *   3. the zoom stop is set to match where the camera now is, so the NEXT
   *      click on the map is classified against where the reader ended up
   *      rather than where they were before they typed.
   *
   * A hood and a street travel on a representative block — the one holding
   * the most of their records — so the camera has somewhere to go. That is
   * not a claim that the block is the street; the panel opens the street.
   */
  const openAt = useCallback(async (
    blockId: string,
    req: UnitRequest,
    stop: number,
  ) => {
    const eng = engineRef.current;
    const picker = pickerRef.current;
    if (!eng) return;
    /* ── THE INDEX MAY NOT BE HERE YET, AND THAT WAS THE BUG ──────────────
       `idxRef` is filled by the effect behind a PICK, so on a page where
       nobody has clicked anything it is still null — which is exactly the
       page somebody uses the search box on. The first search silently did
       nothing. It is fetched here instead when it is missing; `loadBlockIndex`
       memoises for the session, so this costs one request the first time and
       nothing after. */
    const index = idxRef.current ?? (await loadBlockIndex().catch(() => null));
    if (!index) return;
    idxRef.current = index;
    if (!posRef.current) {
      posRef.current = new Map(index.b.map((b, i) => [b, i]));
    }
    const i = blockId ? posRef.current.get(blockId) : undefined;
    const scales = stopScalesRef.current;

    if (i !== undefined && picker) {
      const ring = picker.ringOf(i);
      if (ring?.length) {
        let sx = 0;
        let sy = 0;
        for (const [wx, wy] of ring) {
          sx += wx;
          sy += wy;
        }
        const c = projection.proj(sx / ring.length, sy / ring.length, 0);
        const scale = scales[stop] ?? eng.getCamera().scale;
        eng.setStep(stepForZ(scale / (scales[0] || scale), stopCutsRef.current));
        eng.setCamera({ cx: c[0], cy: c[1], scale });
      }
      const ov = overlayRef.current;
      if (ov) {
        ov.highlight = picker.ringOf(i);
        ov.pick = i;
        ov.pickLabel = null;
      }
      setZoomStop(stop);
      setPicked(i);
      eng.invalidate();
      setNonce((n) => n + 1);
    }

    nonceRef.current += 1;
    setRequest({ nonce: nonceRef.current, block: blockId, req });
  }, []);

  /**
   * A PRESSED DOT, ANSWERED.
   *
   * Loads the block the mark sits on, keeps the rows that carry the lit
   * subject AND fall in the window the map is showing, and puts them on a card
   * of their own. It deliberately does NOT touch `picked`, the zoom stop, the
   * overlay highlight or the URL: none of those belong to the question the
   * reader asked, and every one of them was in the first version, which is why
   * a dot press used to open a whole fiche.
   *
   * Coincident dots are why this shows the BLOCK's matching rows rather than
   * the single row `hit.record` names: every mark on a block is drawn at the
   * same point, so three records of one subject there are three dots on top of
   * each other and no reader can be said to have pressed a particular one.
   */
  const openMark = useCallback(async (hit: MarkHit) => {
    /* THE INDEX MAY NOT BE HERE YET, AND THAT IS THE COMMON CASE. It is
       fetched when a fiche opens, and a reader who presses a dot first has
       never opened one — the card came up blank on exactly that press and
       worked on every one after it, which is how it hid. `loadBlockIndex`
       memoises for the session, so this costs one request once. */
    const index = idxRef.current ?? (await loadBlockIndex().catch(() => null));
    const ths = themesRef.current;
    if (!index || !ths) return;
    idxRef.current = index;
    const th = ths.find((x) => x.bit === hit.bit);
    const rec = await loadBlockRecord(index, hit.block);
    if (!rec) return;
    const y = yearRef.current ?? YEAR_MAX;
    const half = WINDOW_YEARS / 2;
    const rows = rec.decisions.filter(
      (d) =>
        Math.floor((d.m ?? 0) / 2 ** hit.bit) % 2 === 1 &&
        d.y >= y - half && d.y <= y + half,
    );
    if (!rows.length) return;
    /* ── THE SUBJECT LABEL IS PULLED, AND THE MEASUREMENT IS WHY ────────
       The card printed the rarest fiche subject from `sm` above each line.
       `sm` is matched in the pipeline against the item's FULL text; the shard
       carries a FRAGMENT of that item — median 154 characters, often mid
       sentence. The two describe different things, so they routinely
       disagree, and the disagreement is visible to the reader.

       MEASURED over all 16,468 themed decisions: a label was printed on
       11,671 of them, and on 7,127 — 61% — no part of the line beneath it
       supports the label. "Street Lights — Van Dyke avenue and Keith street"
       came up under the heading "Libraries". That is not a rough summary, it
       is the card asserting something the reader can see is wrong, and it is
       worse than saying nothing.

       Guarding it — printing the label only where the line does support it —
       was tried on paper and is backwards: it would keep the label on the 39%
       where the line already says it and drop it on the 61% where a reader
       actually needs one.

       The label comes back when the shard carries the CLASSIFICATION, which
       is one statement about the record rather than a pattern to be hunted
       for in a fragment: `sf_bos_classification.csv` has a topic, subtopic
       and action for all 124,284 records, 99.3% of decisions, computed
       against the full text. Checked on the two lines above: the street-work
       line classifies as `the-street / street-works / appropriated`, which is
       exactly what it is. That is a `build_index.py` join and a shard
       rebuild. */
    setMarkCard({
      hit,
      label: th?.label ?? "",
      ink: THEME_INK[hit.bit % THEME_INK.length],
      place: blockPlaceName(rec.streets) ?? index.b[hit.block] ?? "",
      rows: rows.map((d) => ({ d, says: null })),
      year: y,
    });
  }, []);
  const openMarkRef = useRef(openMark);
  useEffect(() => { openMarkRef.current = openMark; }, [openMark]);

  /**
   * A SEARCH RESULT, LANDED. Everything specific to a search happens here —
   * a curated place leaves the map entirely, and the rest is a block, a level
   * and how close to stand, which is `openAt`'s job and also a shared link's.
   */
  const goToHit = useCallback(async (hit: SearchHit) => {
    /* ── A CURATED PLACE HAS ITS OWN FICHE, AND THIS IS NOT IT ────────────
       Coit Tower is not a block. It has a page with its photograph, the
       documents behind it and whatever the city ledgers actually attach to
       it, and sending a reader who typed `coit` to the piece of ground under
       it — where the fiche would open on "Filbert St · Greenwich St ·
       Montgomery St" — answers a question they did not ask. */
    if (hit.kind === "place") {
      router.push(`/us/city/sf/places/place/${hit.to}`);
      return;
    }
    await openAt(
      hit.block,
      /* an address resolved through the assessor's parcels is NOT a door the
         Board named — there is no door to open, only the block it stands on,
         and asking for one would send the panel hunting for a label that is
         not in the record */
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

  /* block + level → the address bar. Both halves change independently: the
     block when the reader picks, the level when they move up or down inside
     the fiche, so this watches both rather than living in either handler. */
  useEffect(() => {
    /* until the restore has run, the URL belongs to whoever sent the link */
    if (!opened.current) return;
    if (picked === null) {
      writeUrl(null);
      return;
    }
    const id = idxRef.current?.b[picked];
    if (id) writeUrl({ block: id, ...at });
  }, [picked, at, writeUrl]);

  /**
   * ── AND A LINK SOMEBODY SENDS HAS TO OPEN WHERE IT POINTS ────────────
   * Once, on the first frame the map can pick with. It reuses `goToHit` —
   * the very path a search result takes — so a shared link and a typed search
   * land identically, ring the same block and open the same level. A block id
   * the index does not carry is ignored rather than guessed at.
   */
  useEffect(() => {
    if (opened.current || loading || !engineRef.current) return;
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

  return (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" ref={hostRef}>
          <canvas ref={canvasRef} className="fx-city-canvas" />
          {!loading && stopsRef.current.length ? (
            <div
              role="group"
              aria-label={t("us.sf.thecity.map.view")}
              className="fx-city-controls"
            >
              {/* ── THE CAP IS `fx-city-controls-cap`, NOT AN INVENTED CLASS ──
                  This said `fx-city-zoom-label`, which is not in the
                  stylesheet — so the word took no padding, no size and no
                  colour from the sheet, and sat clipped against the group's
                  own border. The published page's cap class is the one the
                  sheet actually styles, and its copy is an existing key rather
                  than the literal "ZOOM" typed here.

                  `aria-pressed` and `data-near` come with it: the four stops
                  read as four labels floating over the map until something
                  says which one you are at, and `data-near` is how the sheet
                  marks the stop you are nearest when you are between two. */}
              <span className="fx-city-controls-cap" aria-hidden="true">
                {t("us.sf.thecity.map.view_cap")}
              </span>
              {stopsRef.current.map((s, i) => (
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
        {/* ── WHAT THE RECORD IS ABOUT ────────────────────────────────────
            A button that opens the eight, one lit at a time. `theme-marks.ts`
            §THE INK has the measurement that makes it one at a time rather
            than a set of checkboxes.

            THE PANEL SAYS WHAT THE FILTER DOES NOT COVER. Eight subjects over
            a fifth of the record is a true thing that eight buttons imply the
            opposite of, so the coverage line is not a footnote to be trimmed —
            it is the difference between a filter and a claim about the city. */}
        {!loading && themes ? (
          <div
            className="fx-city-subjects"
            /* OVER THE MAP, NOT ABOVE IT. Written first as a block between the
               map and the century rail, opening it pushed the rail off the
               bottom of the window and clipped its own coverage line. A filter
               is a control on the view, so it floats on the view. */
            style={{
              position: "absolute",
              left: 14,
              bottom: 72,
              zIndex: 6,
              maxWidth: "min(720px, calc(100% - 380px))",
            }}
          >
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              style={{
                font: "600 11px/1 var(--f-mono, ui-monospace, monospace)",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                padding: "8px 12px",
                border: "1px solid var(--rule, #e4e6ea)",
                borderRadius: 6,
                background: "var(--surface, #fff)",
                cursor: "pointer",
              }}
            >
              {subject === null
                ? "Subjects"
                : (themes.find((x) => x.bit === subject)?.label ?? "Subjects")}
            </button>
            {filterOpen ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  /* A SURFACE, because this floats over the drawn city and
                     12 px type on a painted map is not type. */
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--rule, #e4e6ea)",
                  background: "var(--surface, #fff)",
                  boxShadow: "0 6px 20px rgba(0,0,0,.10)",
                }}
              >
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
                    onClick={() =>
                      setSubject((cur) => (cur === th.bit ? null : th.bit))
                    }
                    aria-pressed={subject === th.bit}
                    title={`${th.n.toLocaleString()} marks over ${th.n_blocks.toLocaleString()} blocks, ${th.y0}–${th.y1}`}
                    style={chipStyle(
                      subject === th.bit,
                      THEME_INK[th.bit % THEME_INK.length],
                    )}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 8,
                        marginRight: 6,
                        background: THEME_INK[th.bit % THEME_INK.length],
                      }}
                    />
                    {th.label}
                    <span style={{ opacity: 0.55, marginLeft: 6 }}>
                      {th.n.toLocaleString()}
                    </span>
                  </button>
                ))}
                <p
                  style={{
                    font: "12px/1.5 var(--f-sans, system-ui)",
                    color: "var(--muted, #6b6355)",
                    margin: "8px 0 0",
                    flexBasis: "100%",
                  }}
                >
                  {subject === null
                    ? "The map is showing every decision. These eight are what the record keeps coming back to — together they carry about a fifth of it, and they overlap each other, so they filter the map rather than dividing it up."
                    : /* THE SAME WINDOW THE LAYER USED, INCLUDING AT THE
                         PRESENT. This read "across the whole century" whenever
                         the rail was cleared, which was true only because
                         clearing it lit every year — the bug above. Now the
                         present is a year like any other and the caption has to
                         say so, or it claims a century of marks over ten years
                         of them. */
                      `${subjectLit.toLocaleString()} on the map within ${
                        WINDOW_YEARS
                      } years of ${year ?? YEAR_MAX}. ${
                        themes.find((x) => x.bit === subject)?.kind === "era"
                          ? "This one changes most over time — drag the year bar."
                          : "This one is concentrated in place — click a mark to read it."
                      }`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
        <div className="fx-city-ledger">
          {/* ABOVE WHATEVER THE MARGIN IS SHOWING, idle copy or an open fiche.
              A search you can only reach by closing what you are reading is a
              search nobody uses. */}
          <CitySearch onPick={({ hit }) => void goToHit(hit)} />
          {/* ── THE DOT'S OWN ANSWER, AND IT IS NOT A FICHE ────────────────
              Ahead of the fiche because a press on a dot is a narrower
              question than a press on the city, and the reader who asked it
              should not have to find the answer inside a page about something
              else. It closes back to whatever the margin was showing. */}
          {markCard ? (
            <section className="fx-mark-card">
              <header className="fx-mark-card-h">
                <span className="fx-mark-card-dot"
                      style={{ background: markCard.ink }} aria-hidden />
                <h3>{markCard.label}</h3>
                <button
                  type="button"
                  className="fx-mark-card-x"
                  onClick={() => setMarkCard(null)}
                  aria-label={tOr(t, "us.sf.thecity.mark.close", "Close")}
                >
                  ×
                </button>
              </header>
              <p className="fx-mark-card-where">
                {markCard.place}
                <span className="fx-mark-card-when">
                  {" · "}
                  {tOr(t, "us.sf.thecity.mark.window", "{a}–{b}")
                    .replace("{a}", String(markCard.year - WINDOW_YEARS / 2))
                    .replace("{b}", String(markCard.year + WINDOW_YEARS / 2))}
                </span>
              </p>
              <ul className="fx-mark-card-rows">
                {/* ── THE GLANCE, THEN THE RECORD ────────────────────────
                    A reader who presses a dot wants to know what it is
                    before deciding whether to open a scan of a minute book.
                    So the line the Clerk printed is DEMOTED — still here,
                    still verbatim, clamped to two lines — and what leads is
                    the year, the money where there is one, and the subject
                    the pipeline matched against the item's full text. */}
                {markCard.rows.map(({ d, says }) => (
                  <li key={`${d.u}-${d.y}-${d.t.slice(0, 20)}`}>
                    <p className="fx-mark-card-top">
                      <span className="fx-mark-card-y tnum">{d.y}</span>
                      {d.a > 0 ? (
                        <span className="fx-mark-card-sum tnum">
                          {usdShort(d.a)}
                        </span>
                      ) : null}
                    </p>
                    {says ? <p className="fx-mark-card-says">{says}</p> : null}
                    <p className="fx-mark-card-t">{stripFileNumber(d.t)}</p>
                    <a
                      className="fx-block-jump"
                      href={sourceHref(d)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {d.c === "b"
                        ? tOr(t, "us.sf.thecity.panel.lead_open_pdf", "Open the minutes")
                        : tOr(t, "us.sf.thecity.panel.lead_open", "Open the scanned page")}
                      {" ↗"}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : picked !== null ? (
            <CityBlockPanel
              record={record}
              context={ctx}
              request={request}
              onFiche={setAt}
              loading={recLoading}
              onClose={() => {
                setPicked(null);
                const ov = overlayRef.current;
                if (ov) {
                  ov.highlight = null;
                  ov.pickLabel = null;
                }
                engineRef.current?.invalidate();
              }}
            />
          ) : (
            ledger ?? (
              <div style={{ padding: "16px 18px" }}>
                <p
                  style={{
                    font: "600 11px/1.4 var(--f-mono, ui-monospace, monospace)",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted, #6b6355)",
                    margin: "0 0 8px",
                  }}
                >
                  The record
                </p>
                <p style={{ font: "13px/1.5 var(--f-sans, system-ui)", margin: 0 }}>
                  Click anywhere on the map to read what the city decided
                  there. Drag to pan, scroll to zoom, and drag the year bar
                  below to move through the century.
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── THE CENTURY RAIL ────────────────────────────────────────────
          Every layer is emitted in year order, so moving this is a draw
          range and an instance count — no rebuild, no upload. Dragging it
          is as cheap as standing still, which is the whole reason the
          scrub can be a slider rather than a stepper. */}
      {!loading ? (
        <div className="fx-city-transport">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 18px",
              borderTop: "1px solid var(--rule, #e4e6ea)",
            }}
          >
            {/* ── WHICH SYSTEM IS BEING WATCHED ──────────────────────────
                The century plays the whole city at once, which is the right
                default and also why no single thing can be FOLLOWED. Picking
                one quietens the rest — and for transport it also draws the
                network as a diagram over the city, because at the whole-city
                camera the real track is half a pixel wide. `systems.ts` has
                the measurements.

                One lit at a time, and clicking the lit one clears it: two
                systems lit at once is a picture of neither. */}
            <div
              style={{
                display: "flex",
                border: "1px solid var(--rule, #e4e6ea)",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {CITY_SYSTEMS.map((sys) => (
                <button
                  key={sys.key}
                  type="button"
                  className="fx-city-system"
                  aria-pressed={system === sys.key}
                  title={sys.note}
                  onClick={() => {
                    const next = system === sys.key ? null : sys.key;
                    setSystem(next);
                    engineRef.current?.setSystem(next);
                  }}
                >
                  {sys.label}
                </button>
              ))}
            </div>

            {/* ── PLAY, WHICH IS WHAT MAKES IT A CITY BEING BUILT ────────
                Dragging the rail hands out WHOLE years, and every layer that
                raises something reads the year's FRACTION — so a scrub lands
                the wave's phase on exactly 1 and nothing rises. The clock in
                `engine.ts` §THE CLOCK hands out fractions, which is the whole
                difference between watching and stepping. */}
            <button
              type="button"
              onClick={() => {
                const e = engineRef.current;
                if (!e) return;
                if (e.playing) {
                  e.pause();
                  setPlaying(false);
                } else {
                  e.play(YEAR_MIN, YEAR_MAX, playRate);
                  setPlaying(true);
                }
              }}
              aria-label={playing ? "Pause" : "Play from 1906"}
              style={{
                font: "600 13px/1 var(--f-mono, ui-monospace, monospace)",
                padding: "7px 11px",
                /* FIXED, not a minimum: the two glyphs are not the same width
                   and the row is a flex, so ▶ becoming ❚❚ moved the rail by
                   1.7 px on every press. A control that changes what it says
                   must not change how much room it takes. */
                width: 40,
                minWidth: 40,
                boxSizing: "border-box",
                border: "1px solid var(--rule, #e4e6ea)",
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => {
                const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
                const next = SPEEDS[(i + 1) % SPEEDS.length];
                setSpeed(next);
                const e = engineRef.current;
                if (e?.playing) e.play(YEAR_MIN, YEAR_MAX, next * SPEED_1X_YPS);
              }}
              aria-label={`Speed ${speed} times`}
              title={`${(YEAR_MAX - YEAR_MIN) / (speed * SPEED_1X_YPS)} seconds for the century`}
              style={{
                font: "600 12px/1 var(--f-mono, ui-monospace, monospace)",
                padding: "7px 9px",
                minWidth: 44,
                border: "1px solid var(--rule, #e4e6ea)",
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
                opacity: 0.8,
              }}
            >
              {speed}×
            </button>
            <span
              className="tnum"
              style={{
                font: "600 15px/1 var(--f-mono, ui-monospace, monospace)",
                minWidth: 74,
                letterSpacing: ".02em",
              }}
              ref={readoutEl}
            >
              {year ?? YEAR_MAX}
            </span>
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
              /* ── THE SCRUB IS NOT CONTROLLED, AND THAT IS THE FIX ─────────
                 It carried `value={year}` and committed state only on release.
                 That is the one arrangement React explicitly undoes: for a
                 controlled input it re-applies `value` after every input
                 event, so a drag that did not change state had its thumb put
                 back where it started, every frame. Daniel, twice: *"the scrub
                 is buggy i cant move thru it"*.

                 So the input owns its own value. React never writes it during
                 a gesture, and `syncScrub` puts a year on it imperatively when
                 the clock or a reset moves it from elsewhere. The filled run
                 is a CSS custom property set on the same node, so dragging
                 repaints a gradient and nothing else.

                 ── AND THE WORK IS STILL SPLIT ──────────────────────────────
                 This was a controlled input whose `onChange` did the whole job:
                 set React state, re-gate 139 chunks of geometry, move the rise
                 uniforms, re-clock the overlay. React then re-rendered and put
                 `value` back from state — and a drag that outruns a render has
                 its thumb snapped backwards under the cursor. Daniel: *"i cant
                 go back in forth with like a movement motion of my mouse only
                 with clicks."* He was fighting a render loop.

                 So the two jobs are separated. `onInput` fires on every pixel
                 of a drag and does the CHEAP, imperative half immediately —
                 the engine and the overlay, neither of which is React — and
                 the frame is coalesced to one per animation frame so a
                 trackpad flick cannot queue forty. React state is committed
                 once, on `change`, which for a range input is the release.
                 The thumb is then never contradicted mid-gesture. */
              onInput={(e) => {
                const v = Number(e.currentTarget.value);
                const next = v >= YEAR_MAX ? undefined : v;
                scrubRef.current = next;
                syncScrub(next);
                if (scrubRaf.current) return;
                scrubRaf.current = requestAnimationFrame(() => {
                  scrubRaf.current = 0;
                  const y = scrubRef.current;
                  engineRef.current?.setYear(y);
                  /* the WRITING is on the clock too — both label gates read
                     the year, so without this the map un-builds to 1906 with
                     1970's street names still on it */
                  if (overlayRef.current) overlayRef.current.year = y;
                });
              }}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                setYear(v >= YEAR_MAX ? null : v);
              }}
            />
            {/* ── THE VIEW, AT PRINT SIZE ────────────────────────────────
                A city drawn from a public record is worth showing to people
                who will never open the page, and the way a picture travels is
                that somebody saves it. At the window's own pixel count this is
                a screenshot; at four times it is something you can print and
                read the street names on. Same camera, same year, same
                everything the reader chose — only the sampling gets finer. */}
            <button
              type="button"
              className="fx-city-preset"
              disabled={saving}
              onClick={() => {
                const eng = engineRef.current;
                if (!eng || saving) return;
                setSaving(true);
                void saveView(eng, {
                  scale: 4,
                  overlay: overlayRef.current?.canvas ?? null,
                  resizeOverlay: (w, h, d) => overlayRef.current?.resize(w, h, d),
                  filename: "city.png",
                }).finally(() => setSaving(false));
              }}
            >
              {saving ? "Saving…" : "Save image"}
            </button>
            {filmRef.current ? (
              <button
                type="button"
                className="fx-city-preset"
                onClick={() => {
                  const f = filmRef.current;
                  if (!f) return;
                  if (f.running) {
                    f.stop();
                  } else {
                    setFilmOn(true);
                    f.play(0);
                  }
                }}
              >
                {filmOn ? "Stop" : "Play the film"}
              </button>
            ) : null}
            {/* THE WAY BACK, AND ONLY WHEN THERE IS ONE. It used to read
                "today", which was wrong twice over: the map is built from a
                record that ends in a stated year, not from this morning, and
                a label that means a different city each day cannot be checked
                against anything. It reads the year instead. But once it reads
                the year, it is the same number as the readout at the other
                end of the rail — so it is only offered when the reader has
                actually moved away from it, which is the only time it does
                anything. */}
            {/* ── AND IT HOLDS ITS PLACE WHEN IT IS NOT OFFERED ──────────
                This was mounted and unmounted on `year !== null`. The row is a
                flex and the scrub is the `flex: 1` in it, so the button
                arriving took 65 px straight off the rail and giving it back
                added them again. MEASURED across a run: the scrub went 583.7
                -> 518.2 px the moment PLAY was pressed and snapped back at the
                end, which is Daniel's *"the timeline get slonger and then it
                jumpts back and forward until it settles"*.

                The editorial rule is kept exactly — the way back is only
                OFFERED once the reader has moved away from the present — but
                it is hidden rather than removed, so it never moves anything.
                `visibility: hidden` still takes its box; `aria-hidden` and
                `tabIndex -1` keep it out of the reading order and off the tab
                ring while it is not offered. */}
            <button
              type="button"
              className="fx-city-preset"
              style={year !== null ? undefined : { visibility: "hidden" }}
              aria-hidden={year === null}
              tabIndex={year === null ? -1 : undefined}
              disabled={year === null}
              onClick={() => {
                setYear(null);
                engineRef.current?.setYear(undefined);
                if (overlayRef.current) overlayRef.current.year = undefined;
              }}
            >
              {YEAR_MAX}
            </button>
          </div>
          {/* ── AND THE CONTROL SAYS WHAT IS IN THE LAYER ────────────────
                Every system already carries a `note` giving what the layer
                holds and how much of it, and the note reached the reader ONLY
                as a `title` — a browser tooltip, which on a map nobody hovers
                and on a touch screen does not exist. So a reader could turn a
                network on and had no way at all to find out what was in it.
                Daniel: *"whare are you including in those maps? whats the
                data? is it supposed to be so large?"* — three questions the
                page had the answers to and never showed.

                It is written under the row, only while a system is chosen,
                because it is the answer to a question the reader has just
                asked and noise before that. */}
          {system !== null ? (
            <p className="fx-city-system-note">
              {CITY_SYSTEMS.find((x) => x.key === system)?.note}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── THE ROW THAT SAYS HOW TO MOVE ────────────────────────────────
          Prose, in the DOM, under the frame — not painted on the overlay
          canvas. It is the one piece of the page a reader may want to select
          or hear read aloud, and it sits outside the stage the two canvases
          fill, so there is no pixel of it reachable from there anyway. Same
          markup and the same three i18n keys as the published page. */}
      <CityHelpRow
        move={t("us.sf.thecity.map.help")}
        years={t("us.sf.thecity.map.help_years")}
        keys={t("us.sf.thecity.map.help_keys")}
      />
    </div>
  );
}
