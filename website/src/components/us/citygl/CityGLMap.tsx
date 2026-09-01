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
import CityRecordPanel from "./CityRecordPanel";
import { markHotLayer, type MarkHotLayer } from "@/lib/citygl/layers/mark-hot";
import { YearRecord, type YearDecision } from "@/lib/citygl/year-record";
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
import { civicIndex, type CivicForm } from "@/lib/citygl/civic";
import type { CladFamily } from "@/lib/citygl/facade";
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
  isPrintableLine,
  loadClassify,
  sourceHref,
  stripFileNumber,
  usdShort,
  loadBlockIndex,
  loadBlockRecord,
  readFicheParams,
  type BlockDecision,
  type BlockIndex,
  type BlockRecord,
  type ClassifyFile,
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

/**
 * `1 min 37 s` from the film's own length, so the button cannot claim a
 * runtime the script does not have. `CityGLFilmChrome` computes the same
 * thing for its own chrome; this is the map's copy of one division rather
 * than a prop threaded through for two numbers.
 */
function filmRuntime(f: FilmPlayer | null): string {
  const total = f?.total ?? 0;
  const m = Math.floor(total / 60000);
  const sec = Math.round((total % 60000) / 1000);
  return `${m} min ${String(sec).padStart(2, "0")} s`;
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
  /* how many marks the chosen subject lights. The floating panel used to
     print it beside a coverage sentence; the strip does not, and the record
     column says the count that matters. Kept as a ref rather than state so
     the marks effect has somewhere to put its answer without a render. */
  const subjectLitRef = useRef(0);
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
  const classifyRef = useRef<ClassifyFile | null>(null);
  /* ── §THE RECORD PANEL ────────────────────────────────────────────────
     What the Board decided in the year on the rail. `year-record.ts` fetches
     a decade at a time; `CityRecordPanel` renders it. The panel holds the
     same set of decisions the marks layer is lighting, which is why it needs
     no legend — see that file's header. */
  const yearRecRef = useRef<YearRecord | null>(null);
  const [yearRows, setYearRows] = useState<YearDecision[]>([]);
  const [yearRowsBusy, setYearRowsBusy] = useState(false);
  const [recordHover, setRecordHover] = useState<number | null>(null);
  /* the year the panel is actually showing — `year` when the reader has moved
     the rail, and the record's own latest when they have not. §THE PRESENT IS
     NOT AN EMPTY YEAR in `year-record.ts`. */
  const [recordYear, setRecordYear] = useState<number | null>(null);
  /* ── §THE SHEET, ON A PHONE ────────────────────────────────────────────
     The record sits under the map in a panel of its own height. Collapsed,
     it is the handle alone and the city has the screen; open, it is the
     list. Two states rather than a free drag: a drag needs physics,
     detents and a velocity model to feel right, and a tap that lands
     exactly where it is aimed is worth more than a drag that nearly does.

     It means nothing on a wide screen, where the record is a column beside
     the map and has always been open. `fusion.css` only reads this inside
     the phone query. */
  const [sheetOpen, setSheetOpen] = useState(true);
  /* the ring that answers "which dot is this row" — `layers/mark-hot.ts` */
  const hotRef = useRef<MarkHotLayer | null>(null);
  const [classify, setClassify] = useState<ClassifyFile | null>(null);
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
    subjectLitRef.current = lit;
    engineRef.current?.invalidate();
  }, [subject, year]);
  /* ── AND IT FOLLOWS THE SETTLED YEAR, NOT EVERY FRAME OF A DRAG ────────
     `year` is committed on release, which is the state the marks layer
     already follows — §THE MARKS FOLLOW THE SETTLED YEAR above. A decade
     arrives once and is kept, so scrubbing 1925 to 1929 fetches nothing. */
  useEffect(() => {
    let dead = false;
    const rec = yearRecRef.current
      ?? (yearRecRef.current = new YearRecord(descriptor.dataBaseUrl.replace(/\/$/, "")));
    const bits = subject === null ? 0 : 2 ** subject;
    setYearRowsBusy(true);
    void (async () => {
      /* an untouched rail is not a year. Show the record's own latest rather
         than opening on an empty list — §THE PRESENT IS NOT AN EMPTY YEAR. */
      const y = year ?? (await rec.latestYear());
      if (dead || y === null) { setYearRowsBusy(false); return; }
      await rec.load(y);
      if (dead) return;
      setRecordYear(y);
      setYearRows(rec.forYear(y, bits));
      setYearRowsBusy(false);
    })();
    return () => { dead = true; };
  }, [year, subject, descriptor.dataBaseUrl]);

  /* the card's own vocabulary, which the panel needs to build the same row */
  useEffect(() => {
    let dead = false;
    void (classifyRef.current
      ? Promise.resolve(classifyRef.current)
      : loadClassify().catch(() => null)
    ).then((cf) => {
      if (dead || !cf) return;
      classifyRef.current = cf;
      setClassify(cf);
    });
    return () => { dead = true; };
  }, []);

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

      /* ── THE NAMED BUILDINGS, READ BEFORE THE FABRIC BAKES ──────────────
         Same reason the hero skip set is read here and not later: the fabric
         has to know a footprint is a church before it builds that footprint's
         roof, and its buffers are baked once. `base/marks.json` is the file
         the overlay already fetches for the labels — this is a second read of
         it and not a second file, and a city that ships none simply has no
         named forms, which is a fact about that city. */
      let civicOf: ReadonlyMap<number, CivicForm> | null = null;
      try {
        const r = await fetch(`${data.assetBase}/base/marks.json`);
        if (r.ok) civicOf = civicIndex(await r.json());
      } catch {
        civicOf = null;
      }
      if (disposed || !engine) return;

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
      /* ── AND THE THREE LATER TIERS ARE ASKED FOR NOW, NOT LATER ─────────
         The ground detail, the streets and the canopy are awaited further
         down, each immediately before the layer that reads it. Written that
         way the REQUEST did not go out until the layer above it had finished
         BUILDING — so the network sat idle through every bake, and the bake
         sat idle through every download, in turn, all the way down.

         MEASURED on a production build over localhost, where the download
         costs nothing and every gap is the main thread: the whole boot took
         7.3 s, of which under 0.7 s was transfer. `strt` was not asked for
         until 6.1 s and `tree` until 6.6 s, though both could have been on
         the wire at 1.6 s with the footprints.

         So the fetches are started here, together, and each is awaited where
         it always was. Nothing about the ORDER the layers are built in
         changes — that order is a rendering decision and this is not about
         rendering. `loadTier` swallows a per-chunk failure, so an unawaited
         promise cannot reject. */
      /* ── §THE FOOTPRINTS FIRST, AND EVERYTHING ELSE BEHIND THEM ─────────
         The first picture needs the ground and the footprints. The roof
         shapes and the facades are for the district band and closer (the
         manifest's own `minZ` says so), the streets and the trees likewise,
         so none of them should share the connection with `bldg` during the
         second the reader is waiting. MEASURED on a production build, the
         data the first picture actually needs is ~5.5 MB compressed against
         the 11.7 MB that used to go out at once. */
      const bldgTier = data.loadTier("bldg");
      const faceRoof = Promise.all([data.loadTier("face"), data.loadTier("roof")]);
      /* and the three the reader cannot see yet BEHIND them, so they are not
         sharing the connection with the files the first picture waits on */
      const canopyTier = faceRoof.then(() => data.loadTier("canopy"));
      const strtTier = faceRoof.then(() => data.loadTier("strt"));
      const treeTier = faceRoof.then(() => data.loadTier("tree"));
      await Promise.all([bldgTier, faceRoof]);
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
      /* ── AND THE SURVEYED TOPS ──────────────────────────────────────
         Same shape as the height floor beside it and read for the same
         reason: the fabric bakes its buffers once, so a height it is going
         to use has to be in hand before it starts. A city that ships no
         file simply draws every building at its measured height, which is
         what every city did before this existed. */
      let tallTops: Map<number, number> | null = null;
      let tallClad: Map<number, CladFamily> | null = null;
      try {
        const tt = await fetch(`${data.assetBase}/base/tall-tops.json`);
        if (tt.ok) {
          const doc = (await tt.json()) as {
            tops?: { gid: number; topM: number }[];
            clad?: { rows?: { gid: number; clad: string }[] };
          };
          tallTops = new Map((doc.tops ?? []).map((r) => [r.gid, r.topM]));
          tallClad = new Map(
            (doc.clad?.rows ?? []).map((r) => [r.gid, r.clad as CladFamily]),
          );
        }
      } catch {
        tallTops = null;
        tallClad = null;
      }
      if (disposed || !engine) return;

      const buildings = buildingsLayer(data, {
        zexb: descriptor.look.zexb,
        heightFloor,
        elevAt: groundAt,
        roofPalette: roofPalette(
          (data.manifest.buildings as { palette: string[] }).palette,
        ),
        wallPalette: wallPalette(),
        skipGids: heroSkip,
        civicOf,
        tallTops,
        tallClad,
        /* the SAME field the ground is cut at, so a building and the ground
           under it cannot disagree about whether there is any — see
           `roof-form.ts` §A BUILDING OVER WATER IS STANDING ON SOMETHING */
        landAt: landmask
          ? (x: number, y: number): boolean => {
              const [mx0, my0, mx1, my1] = landmask.world;
              const sx = (landmask.w - 1) / (mx1 - mx0);
              const sy = (landmask.h - 1) / (my1 - my0);
              let u = Math.round((x - mx0) * sx);
              let v = Math.round((y - my0) * sy);
              u = u < 0 ? 0 : u > landmask.w - 1 ? landmask.w - 1 : u;
              v = v < 0 ? 0 : v > landmask.h - 1 ? landmask.h - 1 : v;
              return ((landmask.bits[v * landmask.rowBytes + (u >> 3)] >> (7 - (u & 7))) & 1) === 1;
            }
          : null,
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
      await canopyTier;
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
      await strtTier;
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
      await treeTier;
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
      /* HELD, so the band warm-up can wait for it — see §AND IT WAITS FOR THE
         BOOT'S OWN TAIL at the bottom of this effect. */
      const themeMarksDone = (async () => {
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
          /* ── §THE LIST AND THE DOTS ARE ONE SET, AND NOW IT SHOWS ───────
             The panel lists the decisions of a year and this layer draws the
             same ones. Without a wire between them they were two lists that
             happened to agree. Hovering a row rings every place its decision
             names — 2.11 of them on average, twenty-four at the extreme. */
          const hot = markHotLayer({
            scene: engine.scene,
            elevAt: groundAt,
            zex: descriptor.look.zexByStep[0],
          });
          engine.add(hot);
          hotRef.current = hot;
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
        /* The type holds its sheet while a zoom is moving and re-places it on
           the first frame that repeats a scale. On an on-demand renderer it
           has to be able to ASK for that frame, or a single-shot camera change
           — a ZOOM STOP button, a film cut — leaves the type scaled and stale.
           See `overlay.ts` §AND THE SHEET SURVIVES A ZOOM TOO. */
        requestFrame: () => (engineRef.current ?? engine)?.invalidate(),
      });
      host.appendChild(overlay.canvas);
      overlayRef.current = overlay;
      overlay.resize(
        rect.width,
        rect.height,
        Math.min(engine.quality.maxDpr, window.devicePixelRatio || 1),
      );
      engine.onAfterFrame = (c, s) => overlay.draw(c, s);
      /* HELD for the same reason `themeMarksDone` is — the type is the last
         thing the boot fetches and the warm-up must not get in front of it */
      const overlayDone = overlay.load().then(() => engine?.invalidate());

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

      /* ── AND THE OTHER TWO BANDS ARE WARMED WHILE NOBODY IS LOOKING ─────
         `engine.ts` §THE BANDS ARE WARMED carries the measurement: the first
         zoom of a session costs a second more than every zoom after it,
         because that is when the GPU creates the pipelines for everything a
         closer camera draws, and when `layers/terrain.ts` bakes its per-band
         hillshade, its normals and its ground texture.

         ── §AND IT WAITS FOR THE BOOT'S OWN TAIL, NOT FOR A TIMER ──────────
         Being scheduled after the page is told it is ready is not enough. The
         boot is not FINISHED at that point: the named places, the subject
         marks and the division rings are still being fetched and parsed behind
         it. An idle callback with a 1,500 ms timeout force-fired the warm-up
         into the middle of that, and MEASURED over three production runs the
         data stream settled at 6.4 s against 5.4 s without it — the warm-up
         was not costing the first frame, it was costing the LABELS a second.
         Raising the timeout only made it racy: 5.4, 6.3, 6.4 over three runs
         of the same build, because whether it landed in the tail was down to
         when the browser happened to call itself idle.

         So it waits on the two things it must not get in front of, and asks
         for idle after that. `allSettled`, because a tail that fails to load
         is a reason to warm the bands anyway rather than never.

         `warmBands` paints nothing and puts the step back where it found it;
         a reader who turns the wheel first wins outright — `engine.ts` §THE
         READER BEATS THE WARM-UP. */
      const warm = () => {
        if (disposed || !engine) return;
        void engine.warmBands([1, 2]);
      };
      void Promise.allSettled([themeMarksDone, overlayDone]).then(() => {
        if (disposed) return;
        const ric = (
          window as unknown as {
            requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
          }
        ).requestIdleCallback;
        if (ric) ric(warm, { timeout: 2000 });
        else window.setTimeout(warm, 200);
      });
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
    const inWindow = rec.decisions.filter(
      (d) =>
        Math.floor((d.m ?? 0) / 2 ** hit.bit) % 2 === 1 &&
        d.y >= y - half && d.y <= y + half,
    );

    /* ── A FRAGMENT IS NOT A RECORD, AND THE FICHE ALREADY KNEW THAT ─────
       The card was listing every row the filter admitted, and a good number of
       them are continuation fragments of the item above: "Fiscal Impact)
       09/05/23; RECEIVED AND ASSIGNED to…", "As defined herein; and
       authorizing the Director of MOHCD…", "With two five-year options to
       extend and an annual base rent of…". Measured over the lit rows: 10%
       are shorter than a readable line and 7% carry no classification at all.

       `isPrintableLine` is the fiche's own test for exactly this and is
       already measured and tested; the card simply was not using it. A row is
       dropped only when it fails that AND has no headline either — a poor line
       under a real subject still says something, an unreadable line under
       nothing says nothing.

       AND ONE ITEM IS ONE ROW. Four rows of the 440 Geary loan — the
       agreement, its title line, a continuation, a procedural stamp — is the
       same record four times wearing different offcuts. They share a page, so
       the page is the key, and the row kept is the one with the most readable
       line. */
    /* A LINE THAT CANNOT OPEN A RECORD, with nothing above it to say what the
       record is, is the tail of the one before it. "And ratifying and
       approving any action heretofore taken…", "As defined herein, including
       assuming certain leases.", "With an option to extend for up to an
       additional five years…". 72 rows, 0.4%.

       The list is short on purpose. `The`, `To`, `For`, `Of` and `In` were in
       it and came out: "The sum of $2000 be and the same is hereby set aside"
       opens a real appropriation. The first cut of this rule also used a
       case-insensitive `[a-z]`, which matches every capital too and flagged
       every heading in the corpus — it was measured before it shipped, which
       is the only reason that is a sentence here and not a defect. */
    const CONTINUES =
      /^[^A-Za-z0-9]*(?:[a-z]|(?:And|As|Or|But|With|Said|Which|Thence|Including|Provided|Together)\b)/;
    const best = new Map<string, BlockDecision>();
    for (const d of inWindow) {
      if (d.cs === undefined && (!isPrintableLine(d.t) || CONTINUES.test(d.t.trim())))
        continue;
      const had = best.get(d.u);
      if (!had) { best.set(d.u, d); continue; }
      const score = (x: BlockDecision) =>
        (isPrintableLine(x.t) ? 1e6 : 0) + x.t.length;
      if (score(d) > score(had)) best.set(d.u, d);
    }
    const rows = [...best.values()].sort((a, b) => b.y - a.y);
    if (!rows.length) return;
    /* ── WHAT EACH LINE IS, FROM THE RECORD'S OWN CLASSIFICATION ────────
       `cs` and `ca` are on the row now, joined in the pipeline from
       `sf_bos_classification.csv` and read against the item's FULL text. They
       are a STATEMENT about the record — "Parking · Ordered" — which is what a
       heading has to be.

       This replaced a label taken from `sm`, the fiche subjects. Those are
       PATTERNS that matched somewhere in the item, and the shard publishes a
       fragment of that item, so a reader was shown a heading with no basis in
       the words underneath: 61% of them, measured, "Street Lights — Van Dyke
       avenue and Keith street." under "Libraries". The classification says
       `the-street / street-works` for that line, which is what it is.

       The action is absent where it was `other`, so a row with no clear verb
       shows its subject alone rather than the subject plus a shrug. */
    const cf = classifyRef.current
      ?? (classifyRef.current = await loadClassify().catch(() => null));
    /* ── NOT WHEN THE SUBJECT ONLY REPEATS THE CARD'S OWN TITLE ─────────
       The card already names the subject. A row that repeats it spends its one
       strong line saying nothing, and what the reader does NOT yet know is
       what the Board did — so the verb carries the line alone there.

       SHARING A WORD IS THE TEST, and the first version was a substring
       compare, which is too literal: it caught "Schools" under "Schools" and
       missed "Housing and shelter" under "Homelessness & shelter", which is
       the one anybody would point at. Every pair this collapses, over the
       published shards — there are only seven, and none of them loses
       anything:

         499  Landmarks & old buildings -> Landmarks and old buildings
         454  Housing                   -> Housing and shelter
         439  Schools                   -> Schools
          84  Homelessness & shelter    -> Housing and shelter
          76  Fire                      -> Fire
          66  Redevelopment             -> Redevelopment
          17  Libraries                 -> Libraries

       10% of rows. `city` and `own` are stopwords because "The city buys land"
       and "Changing the city's own rules" are real answers that must survive
       under any card. */
    const STOP = new Set(["and", "the", "of", "a", "on", "in", "to", "for",
                          "its", "city", "own"]);
    const keyWords = (x: string): Set<string> =>
      new Set((x.toLowerCase().match(/[a-z]+/g) ?? [])
        .filter((w) => w.length > 2 && !STOP.has(w)));
    const same = (a2: string, b2: string): boolean => {
      const y = keyWords(b2);
      for (const w of keyWords(a2)) if (y.has(w)) return true;
      return false;
    };
    const says = (d: BlockDecision): string | null => {
      /* NOT WHEN THE LINE IS A BARE HEADING. `g` says where the published line
         came from. `s` is the sentence the matched address sits in and `p` is a
         heading composed with it — both are the item's OWN words, so the
         classification and the line describe the same record. `h` is the
         Board's printed heading, and a heading is printed once for a PAGE: the
         gloss can hand a row the heading of a different item on that page.

         Caught in the wild: "Execute Standard Agreement - Not to Exceed
         $17,291,506 - ... Homekey+ Grant" came up headed "Naming and renaming
         Ordered". The Homekey item classifies as housing-shelter, exactly
         right; the headline belonged to a street-naming item sharing page 15.

         8.3% of lit rows are `h`. They keep their line and lose the heading,
         which is the honest trade: the line is still the record's own, and a
         wrong heading is worse than none. */
      if (d.g === "h") return null;
      if (!cf || d.cs === undefined) return null;
      const sub = cf.sub[d.cs];
      if (!sub) return null;
      const act = d.ca === undefined ? null : cf.act[d.ca];
      if (same(sub, th?.label ?? "")) return act;
      return act ? `${sub} · ${act}` : sub;
    };
    setMarkCard({
      hit,
      label: th?.label ?? "",
      ink: THEME_INK[hit.bit % THEME_INK.length],
      place: blockPlaceName(rec.streets) ?? index.b[hit.block] ?? "",
      rows: rows.map((d) => ({ d, says: says(d) })),
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
          {/* ── §HOW THE CITY IS DRAWN IS A VIEW SETTING ──────────────────
              Rail, the bike network, the streets: these change how the city is
              DRAWN, not what the page is about. The page is about the record,
              so its filter is in the open on the strip and these step back
              onto the map, beside the zoom — which is the other control that
              only changes what you are looking at. */}
          {!loading ? (
            <div className="fx-city-drawnas" role="group" aria-label="Show">
              {/* ── §THE TWO MAP ROWS MUST NOT LOOK ALIKE UNLABELLED ────────
                  Stacked under the zoom row with no caption of its own, this
                  read as a second row of zoom stops — same mono capitals, same
                  box, no word saying what it was for. Daniel: *"wtf confusing
                  the network overlay buttons"*. The zoom row solved this long
                  ago with `fx-city-controls-cap`; this takes the same device
                  and the same class, so they read as two labelled groups of
                  one family rather than as two guesses. */}
              <span className="fx-city-controls-cap" aria-hidden="true">Show</span>
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

            </div>
          ) : null}
          {/* what the chosen layer holds — under the map, not a tooltip */}
          {system !== null ? (
            <p className="fx-city-system-note">
              {descriptor.systemNotes?.[system]
                ?? CITY_SYSTEMS.find((x) => x.key === system)?.note}
            </p>
          ) : null}
          {/* ── §THE FRONT DOOR IS ON THE MAP ─────────────────────────────
              Search sat at the top of the right-hand column, above whatever
              the margin was showing. That is the wrong place for it twice
              over: it is the first thing most readers want — type your street
              — and the column it lived in is now the RECORD, which is a thing
              to read rather than a place to keep controls. A map's search
              belongs on the map. */}
          {!loading ? (
            <div className="fx-city-find">
              <CitySearch onPick={({ hit }) => void goToHit(hit)} />
            </div>
          ) : null}
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
        {/* the subjects moved into the century strip — §THE STRIP IS THE
            PAGE'S ONE ROW OF STATE, below */}
        </div>
        <div className={`fx-city-ledger${sheetOpen ? "" : " is-shut"}`}>
          {/* ── THE HANDLE IS THE YEAR ───────────────────────────────────
              On a phone this is the top edge of the sheet, which is where
              the thumb already is — so the year is under the thumb while
              the city is above it and the list is below, and one gesture
              moves all three. It is a button rather than a bar so it can be
              tapped to fold the sheet away, and so a keyboard reaches it.
              Hidden on a wide screen, where the record is a column and the
              year is on the century strip. */}
          <button
            type="button"
            className="fx-city-sheet-grab"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((v) => !v)}
          >
            <span className="fx-city-sheet-bar" aria-hidden="true" />
            <span className="fx-city-sheet-yr">
              {recordYear ?? year ?? YEAR_MAX}
            </span>
            <span className="fx-city-sheet-n">
              {yearRows.length} {yearRows.length === 1 ? "decision" : "decisions"}
            </span>
            <span className="fx-city-sheet-x" aria-hidden="true">
              {sheetOpen ? "▾" : "▴"}
            </span>
          </button>
          {/* the search moved onto the map — §THE FRONT DOOR IS ON THE MAP */}
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
                      {/* one sum to a row: where the written line already
                          prints a figure it carries the money, because `d.a`
                          is read off this row's fragment and a record can be
                          one appropriation with numbered clauses stating
                          several different amounts. */}
                      {d.a > 0 && !(d.pl && /[$£€]/.test(d.pl)) ? (
                        <span className="fx-mark-card-sum tnum">
                          {usdShort(d.a)}
                        </span>
                      ) : null}
                    </p>
                    {/* ── THE WRITTEN LINE IS THE BETTER HEADLINE ─────────
                        `says` is a classification OF the record — "Parking ·
                        Ordered". `pl` is what the record actually did, written
                        out of the item's own full text. Where there is one it
                        takes the headline slot and `says` stands down rather
                        than stacking two headings on a 252 px card: the reader
                        gets one strong line, which is the whole point of the
                        card.

                        The Clerk's sentence below then wears quotation marks,
                        because once OUR sentence leads, the reader has to be
                        able to tell which words are the Board's. Same rule the
                        fiche keeps. */}
                    {d.pl ? (
                      <p className="fx-mark-card-pl">{d.pl}</p>
                    ) : says ? (
                      <p className="fx-mark-card-says">{says}</p>
                    ) : null}
                    <p className="fx-mark-card-t">
                      {d.pl ? `“${stripFileNumber(d.t)}”` : stripFileNumber(d.t)}
                    </p>
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
            /* A city may still hand in its own panel; this is the default
               when it does not. ── §THE RECORD PANEL ─────────────────────
               This was four lines of mouse instructions over six hundred
               pixels of nothing, in the column captioned "The record".
               `CityRecordPanel.tsx` carries the reasoning; the short version
               is that the panel and the lit dots are the same set. */
            ledger ?? (
            <CityRecordPanel
              year={recordYear}
              latest={year === null}
              decisions={yearRows}
              subject={
                subject === null
                  ? null
                  : (themes?.find((x) => x.bit === subject)?.label ?? null)
              }
              ink={
                subject === null
                  ? "var(--ink, #1b1a17)"
                  : THEME_INK[subject % THEME_INK.length]
              }
              classify={classify}
              loading={yearRowsBusy}
              hover={recordHover}
              onHover={(i) => {
                setRecordHover(i);
                const d = i === null ? null : yearRows[i];
                hotRef.current?.setAt(
                  d ? d.at.map(([x, z]) => [x, z] as const) : null,
                  subject === null
                    ? undefined
                    : Number(
                        THEME_INK[subject % THEME_INK.length].replace("#", "0x"),
                      ),
                );
                engineRef.current?.invalidate();
              }}
              onOpen={(i) => {
                const d = yearRows[i];
                const eng = engineRef.current;
                if (!d || !eng || !d.at.length) return;
                const [wx, wz] = d.at[0];
                /* `projection` is the module's own singleton, configured from
                   this city's manifest when the map mounted */
                const c = projection.proj(wx, wz, 0);
                eng.setCamera({
                  cx: c[0], cy: c[1],
                  scale: stopScalesRef.current[2] ?? eng.getCamera().scale,
                });
                eng.invalidate();
                setNonce((n) => n + 1);
              }}
            />
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
          {/* ── §THE STRIP IS THE PAGE'S ONE ROW OF STATE ─────────────────
              Twelve controls used to be spread over three places: the zoom on
              the map, the systems and the clock in this strip, and the
              subjects floating in a white box over the Sunset. They are not
              twelve of the same kind, so they are grouped by what they are
              FOR — where you are looking stays on the map, what you get back
              is the column on the right, and WHEN and WHAT IS LIT are these
              two rows.

              The year gets a row to itself because it is the only control
              that moves the buildings, the dots and the record together.
              Among the filters it read as one more toggle. */}
          <div className="fx-city-clockrow">
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
            {/* THE YEAR IS THE BIGGEST THING ON THE STRIP. It was 15 px
                between two buttons; the one thing this map has that no other
                map has should not be set at caption size. */}
            <span className="tnum fx-city-year" ref={readoutEl}>
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
            {/* ── AND THE TAKE-AWAYS SIT AT THE END OF THE CLOCK ROW ─────
                Save and the film are things a reader uses twice a year. They
                keep their place but stop competing with the year for the eye:
                the row's own `margin-left:auto` pushes them to the far end.
                §THE STRIP IS THE PAGE'S ONE ROW OF STATE. */}
            <span className="fx-city-clockrow-end" />
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
                {/* ── THE FILM IS NOT A GENRE, IT IS A RUNTIME ──────────
                    This said "Take the tour", and a tour is a walk through a
                    place — this moves through TIME as much as space: eleven
                    shots, each a different place and a different year out of
                    the record. "Highlights" is nearer and sounds like a
                    sports reel. So it does not name the genre at all. It says
                    what happens and how long it takes, which is the one thing
                    worth knowing before pressing something that takes the
                    page over, and it matches what the entry used to say. */}
                {filmOn
                  ? "Stop"
                  : `Watch · ${filmRuntime(filmRef.current)}`}
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

          {/* ── WHAT IS LIT, WHICH IS THE SUBJECT OF THE MAP ──────────────
              These were in a white box floating over the Sunset, behind a
              button reading "Subjects" that a reader had to find and open.
              The record is the point of this page, so its own filter belongs
              in the open, on the strip, under the year that scopes it.
              §THE STRIP IS THE PAGE'S ONE ROW OF STATE. */}
          {!loading && themes ? (
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
                        width: 8, height: 8, borderRadius: 8, marginRight: 6,
                        background: THEME_INK[th.bit % THEME_INK.length],
                      }}
                    />
                    {th.label}
                    <span style={{ opacity: 0.55, marginLeft: 6 }}>
                      {th.n.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
        </div>
      ) : null}

      {/* ── §ONE LINE, NOT SEVEN ──────────────────────────────────────────
          This was three lines of prose, and the right-hand column carried a
          fourth saying the same thing in different words: drag to pan, scroll
          to zoom, drag the year. Seven lines of instruction on a map whose
          whole appeal is that you can grab it.

          The keyboard line stays, because it is the only one saying something
          a reader cannot discover by trying — and it is the accessible path.
          The mouse lines go: the search box, the zoom row and the year are on
          screen and say what they are. */}
      <CityHelpRow keys={t("us.sf.thecity.map.help_keys")} />
    </div>
  );
}
