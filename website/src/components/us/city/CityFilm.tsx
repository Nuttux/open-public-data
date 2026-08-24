"use client";

/**
 * THE PROJECTIONIST.
 *
 * `film.ts` answers *what is true at millisecond t*. This is the half that has a
 * clock, a canvas and a reader: it drives the camera, paints the film's own
 * marks, and puts a year, one line and a link to the scan on the glass.
 *
 * ── THE CHROME IS A YEAR, A LINE AND A SCAN ──────────────────────────────
 * The ledger, the loading line, the readout strip, the presets and the block
 * drawer are all hidden for the duration. That density is exactly what was
 * called overwhelming, and subtracting it is most of the fix.
 *
 * ── PAUSING IS THE ONLY THING THAT ADDS TO THE SCREEN ────────────────────
 * Stop, and a panel names what is on the frame: the shot's own line and its
 * scan, plus how many of the 2,051 accepted streets are drawn by that year and
 * which volume and leaf the ones accepted *in* that year came from. That is the
 * rule the whole piece runs on — the film shows you one thing, and stopping
 * gives you the record behind it.
 *
 * ── THE WHEEL PAUSES, IT DOES NOT EXIT ───────────────────────────────────
 * It used to exit, and it was far too eager. MEASURED in the mock: a SINGLE
 * wheel tick ended a 134-second film — in either direction, so scrolling back
 * UP the page did it too — at t = 9.9 s, leaving the camera parked at shot 1's
 * z 2.05 for good. That is the whole of the report *"the camera does not move
 * from highlight to highlight, i get stuck on the initial zoom"*. The camera was
 * fine; the film was dead. And the first 23 seconds are a deliberately locked
 * camera, so a reader who scrolled early was stranded on the frame that looks
 * most like a bug.
 *
 * A press and a key are things a reader does TO something. A wheel is the one
 * input that arrives by accident. So the wheel PAUSES — which is already this
 * film's one gesture that ADDS to the screen, showing the reader both doors
 * instead of choosing one for them. A click and Escape still exit, and **the
 * film leaves a button behind it**, because an exit with no way back is a
 * trapdoor.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EXT_K_MAX } from "@/lib/city/camera";
import { projection } from "@/lib/city/projection";
import {
  acceptedThrough,
  buildTimeline,
  frameOf,
  filmStateAt,
  planFilmBuffer,
  streetSourceAt,
  volumeLabel,
  yearBands,
  type FilmFrames,
  type FilmPayload,
  type FilmState,
  type FilmTimeline,
} from "@/lib/city/film";
import { SCRUB_MAX, applyUndatedTreeGate } from "@/lib/city/time";
import { useT } from "@/lib/localeContext";
import type { CityRenderer } from "./renderer";
import {
  AcceptedStreets,
  drawAccepted,
  drawBridgeDeck,
  drawBurnLine,
  drawRisingFootprint,
  drawSubjectDot,
  drawSubjectName,
  drawSubjectRing,
  familyColour,
  projectDeck,
} from "./film-draw";
import type { Plane } from "@/lib/city/projection";

const FILM_URL = "/data/us/sf/city/film/film.json";

/* ── THE BADGE IS THE ARGUMENT, NOT AN APOLOGY ───────────────────────────
   `NOT ON THIS MAP` was a bare label in the corner of one shot: the map's most
   visible admission of a limit, saying nothing at all about the limit. The
   reach layer measures what is off the frame — the aqueduct, the watersheds,
   the reservoirs, the dam — out of published government geometry, and writes
   one sentence and its sources into this file. So the badge can now say what is
   missing, how far away it is, and who publishes its shape.

   FETCHED LAZILY, AND ONLY ONCE THE BADGE IS ON SCREEN. It is 1.5 KB and it is
   wanted for eight seconds of a 134-second film; loading it at mount would put
   a request in front of the ground. If the fetch fails the label renders alone,
   exactly as it does today — the sentence is an upgrade, never a dependency.

   Every figure in `line` is measured by
   pipeline/scripts/us_sf_reach/build_reach_geom.py from the geometry that ships
   beside it, so no number is typed here and the sentence cannot drift from the
   shapes it describes. */
const REACH_BADGE_URL = "/data/us/sf/reach/film-badge.json";

interface ReachBadge {
  readonly line: string;
  readonly sources: readonly { readonly t: string; readonly u: string }[];
}

function useReachBadge(entity: string | null): ReachBadge | null {
  const [byEntity, setByEntity] = useState<Record<string, ReachBadge> | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!entity || asked.current) return;
    asked.current = true;
    let dead = false;
    void fetch(REACH_BADGE_URL)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ byEntity?: Record<string, ReachBadge> }>) : null,
      )
      .then((d) => {
        if (!dead && d?.byEntity) setByEntity(d.byEntity);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [entity]);
  return (entity ? byEntity?.[entity] : null) ?? null;
}

/** Twelve names, the mock's own cap. A dozen or so fit a wide frame, and they
 *  carry the orientation the street names were being asked for and failing to
 *  give. See `CityScene.filmPlaceCap` for which twelve, and why it is not a
 *  choice. */
const FILM_PLACE_CAP = 12;

/* ── WHETHER THE FILM IS KEEPING UP WITH ITSELF ────────────────────────
   One number, and it is the film's own: **how much film time a second of wall
   clock buys.** The clock below clamps `dt` at 50 ms, so a frame that takes
   900 ms advances the film by 50 — a ratio of 0.055 — and a frame that takes 16
   advances it by 16, a ratio of 1. Averaged over wall time, that ratio IS the
   film's playback speed, so it needs no threshold per segment kind and no
   separate rule for a travel and for a run: both fail the same way and both are
   caught by the same measurement.

   0.6 — the film may lose two fifths of its speed before it changes what it is
   playing. Below that the piece is no longer 2 m 14 s long and the reader is
   watching a camera creep.

   `W_MAX` is what stops ONE frame deciding. Weighting by `raw / TAU` alone
   means a single 900 ms frame sets the average to that frame's own ratio, so a
   garbage collection or a tab coming back would rewrite the film. Capped at
   0.35, one 900 ms frame leaves the average at 0.67 and two consecutive ones
   take it to 0.45 — one slow frame is a compile, a fetch or another tab, and
   two is the machine.

   `SUSTAIN_MS` is what stops a dip deciding. The average has to stay under the
   threshold for long enough, and any frame that brings it back over resets the
   count — so two 300 ms frames while a tier lands do not change the film, and a
   camera move that is genuinely spending a second a frame does.

   ── THE VERDICT WAS BEING TAKEN ON THE WRONG SECONDS, AND IT COST THE FILM
      ITS WHOLE MOTION DESIGN ──────────────────────────────────────────────

   *"The camera moves and the year advances; what is missing is the sense that
   something is happening."* On this machine, after the ground plate landed
   (09962711), it was missing because it had been switched off.

   `MIN_MS` used to be 20,000 ms of WALL clock, on the reasoning that "the first
   camera move is at 23,400, so 20,000 leaves the tail of shot 2's run as
   evidence and still decides before the first travel." Both halves of that are
   the mistake. **The tail of shot 2's run IS the startup cost** — the same
   paragraph says so, `.parity/b3seg.py` measured the first run segment at x56 —
   and **deciding before the first travel means deciding without one frame of
   the thing being judged**, since travels and the arrival wave are the only two
   things `spare` changes.

   MEASURED, `.parity/m1keep.py`, this machine, a real playthrough with nothing
   seeked and nothing paused:

     wall   film  keepUp  spare  rasters  seg
     11.6   10.7   1.000  false      20   shot 1 hold      <- the locked camera
     12.4   11.4   1.000  false      21   shot 2 run       <- the first cohort
     14.6   13.1   0.748  false      27
     16.0   13.9   0.562  false      35
     16.9   14.4   0.612   TRUE      39   <- LATCHED
     17.3   14.8   0.752   true      39
     18.9   16.4   0.922   true      40

   Twelve seconds at 1.000, then **1.4 seconds** of shot 2's first year cohort
   warming caches — 17 rasterisations in four seconds — and the film threw away
   all eight travels and the entire arrival wave for the remaining 117 seconds.
   Over the whole run this machine's median `keepUp` past 20 s is **0.907**,
   half again over the threshold. It can play the film. It was not being asked
   to.

   So the gate is no longer a stopwatch. **Nothing is decided until the camera
   has actually tried to travel** — `firstMoveT0`, the film's own first `move`
   segment, which is where the thing being judged begins — and `SUSTAIN_MS` is
   the length of the film's SHORTEST move (1,800 ms), so what decides is a
   travel and not a hiccup inside one. A machine that genuinely cannot draw a
   travel still latches inside the first one and loses only that one, which is
   the trade B3 already measured and accepted.

   The latch stays one-way. Not for the reason it was: it is meaningless to
   re-examine, because once `spare` is on the film is cheap and `keepUp` climbs
   for that reason alone — 0.562 to 0.922 in two seconds above. The answer is to
   make the first look correct, not to add a second one. */
const KEEP_UP = 0.6;
const KEEP_UP_TAU = 900;
const KEEP_UP_W_MAX = 0.35;
/** the shortest move in the film, so a travel decides and a hiccup does not */
const KEEP_UP_SUSTAIN_MS = 1800;

/* `?filmoff=accepted,subjects` — the film's own ablation switches, the same
   idiom `SceneLayers` uses and for the same reason: turning one pass off is how
   the next person tells what a frame is actually costing. Read once per frame
   off the URL and nothing else reads them. */
function ablate(name: string): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("filmoff");
  return !!q && q.split(",").includes(name);
}

export interface CityFilmApi {
  /** ready to play — the payload and the ground are both in */
  readonly ready: boolean;
  readonly on: boolean;
  readonly paused: boolean;
  /** the film's own payload, so the year rail can mark the record's years
   *  without fetching the same file a second time */
  readonly payload: FilmPayload | null;
  /**
   * THE HANDOVER. The year the film stopped on, and null while it has not
   * stopped. The film's own contract is that **the frame it stopped on IS the
   * explorer**, so the year rail picks the reader up there rather than
   * throwing them back to the present. Set on `exit`, cleared on `play`, so a
   * second exit on the same year hands over again.
   */
  readonly exitYear: number | null;
  /** the label the entry plate's own button should carry */
  readonly resumeLabel: "watch" | "resume";
  readonly runtimeLabel: string;
  play(): void;
  replay(): void;
  toggle(): void;
  exit(): void;
  /** the film's own chrome, for `CityMap`'s `hud` slot */
  readonly hud: ReactNode;
}

interface Live {
  payload: FilmPayload;
  timeline: FilmTimeline;
  /** the film's own first `move` segment — where the thing `spare` replaces
   *  begins, and therefore the earliest millisecond that is evidence about
   *  whether this machine can play it */
  firstMoveT0: number;
  frames: FilmFrames;
  streets: AcceptedStreets;
  deck: Plane[][];
  W: number;
  H: number;
}

/**
 * The film, as a hook, because its two halves land in two different places on
 * the page: the chrome goes over the canvas and the play control belongs to the
 * entry plate. One clock, one state, two slots.
 */
export function useCityFilm(renderer: CityRenderer | null): CityFilmApi {
  const t = useT();
  const [payload, setPayload] = useState<FilmPayload | null>(null);
  const [on, setOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<FilmState | null>(null);
  const [exitYear, setExitYear] = useState<number | null>(null);

  const liveRef = useRef<Live | null>(null);
  const tRef = useRef(0);
  const biasRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef(0);
  const onRef = useRef(false);
  const pausedRef = useRef(false);
  const treesRef = useRef<boolean | null>(null);
  /** the year the last painted frame was on — what `exit` hands to the rail */
  const yearRef = useRef<number>(SCRUB_MAX);
  /* ── THE VERSION THE MACHINE CAN PLAY ──────────────────────────────────
     `keepRef` is the film's own playback speed, averaged over wall time;
     `spareRef` latches once it has been under `KEEP_UP` for long enough, and
     from then on the camera cuts instead of travelling and the years land whole
     instead of running. `film.ts` §spare carries the measurements and the
     reasoning; what matters here is that both are read off frames this machine
     has actually drawn, and that the fallback is the one the reduced-motion path
     already authored rather than a second one invented for this.

     IT LATCHES, and it is not cleared by a replay. A laptop does not get faster
     between two viewings, and a film that changed its own grammar back and forth
     while a reader watched would be worse than either version of it. */
  const keepRef = useRef(1);
  /* one average per thing being judged: a run's frames say nothing about
     whether this machine can draw a travel, and vice versa */
  const keepCamRef = useRef(1);
  const keepWaveRef = useRef(1);
  const belowCamRef = useRef(0);
  const belowWaveRef = useRef(0);
  const spareCamRef = useRef(false);
  const spareWaveRef = useRef(false);

  useEffect(() => {
    let dead = false;
    void fetch(FILM_URL)
      .then((r) => (r.ok ? (r.json() as Promise<FilmPayload>) : null))
      .then((p) => {
        if (!dead && p) setPayload(p);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, []);

  const timeline = useMemo(() => (payload ? buildTimeline(payload) : null), [payload]);
  const bands = useMemo(() => (payload ? yearBands(payload.st) : null), [payload]);

  /* ── THE REDUCED-MOTION READ IS LIVE ────────────────────────────────────
     Read at play, not at mount: a reader can change it while the page is open
     and the film should be the one it asks for. */
  const reduced = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  /** the keyframes, measured against the viewport the film is played in */
  const build = useCallback((): Live | null => {
    if (!renderer || !payload || !timeline || !bands) return null;
    const scene = renderer.composition;
    const { W, H } = renderer.viewport;
    if (W <= 0 || H <= 0 || !scene.ready) return null;
    const fit = { base: renderer.fitBase, bx: renderer.cam.bx, by: renderer.cam.by };
    const elev = (x: number, y: number): number => scene.elevAt(x, y);
    const frames: FilmFrames = {
      base: fit.base,
      frames: payload.shots.map((s) => frameOf(s, fit, projection, elev, W, H)),
    };
    const held = liveRef.current;
    const streets =
      held && held.streets.st === payload.st
        ? held.streets
        : new AcceptedStreets(payload.st, bands, projection, elev);
    const deckSrc = payload.shots.find((s) => s.build2?.w)?.build2?.w;
    const deck = held?.deck?.length ? held.deck : deckSrc ? projectDeck(deckSrc, projection) : [];
    const firstMoveT0 =
      timeline.segs.find((sg) => sg.k === "move")?.t0 ?? timeline.total;
    return { payload, timeline, frames, streets, deck, W, H, firstMoveT0 };
  }, [renderer, payload, timeline, bands]);

  /* ── ONE FRAME ────────────────────────────────────────────────────────────
     The film owns its clock and hands the renderer a resolved camera, a year, a
     buffer plan and two paint callbacks. Nothing here is animated by React:
     `setState` fires at most once a frame and only ever paints text. */
  const frame = useCallback(
    (now: number) => {
      const live = liveRef.current;
      if (!renderer || !live) return;
      const raw = lastRef.current ? now - lastRef.current : 16;
      const dt = lastRef.current ? Math.min(0.05, raw / 1000) : 0.016;
      lastRef.current = now;

      if (!pausedRef.current) {
        tRef.current += dt * 1000;
        if (tRef.current >= live.timeline.total) {
          tRef.current = live.timeline.total;
          pausedRef.current = true;
          setPaused(true);
        }
        /* the bias from a band crossing is DRIVEN to zero, not damped: a camera
           that ends a move a few pixels off where the keyframe says would drift
           a little further on every crossing */
        biasRef.current *= Math.pow(0.02, dt / 0.25);
        if (Math.abs(biasRef.current) < 0.02) biasRef.current = 0;
      }

      const red = reduced();
      /* Weighted by WALL time, so one 900 ms frame counts for as much as
         fifty-six 16 ms ones — which is the whole point, since it is the long
         frames that are the film not playing. */
      /* THE EVIDENCE HAS TO BE ABOUT THE THING BEING JUDGED, and there are two
         things. A travel and a run fail for different reasons and on different
         frames — a mid-move rasterisation is the ground being repainted under a
         moving camera, a run's is the fabric changing under a fixed one — so
         each is judged on its own segments and neither is judged on anything
         else. Everything before the film's first travel is a locked camera and
         the first year cohort warming caches, and it is evidence about neither.
         See §whether the film is keeping up, and `film.ts` §the two costs are
         not one verdict. */
      const s = filmStateAt(live.payload, live.timeline, live.frames, tRef.current, {
        reduced: red,
        spareCamera: spareCamRef.current,
        spareWave: spareWaveRef.current,
        cyBias: biasRef.current,
        zexFor: () => projection.zex,
      });

      /* JUDGE EACH HALF ONLY ON FRAMES WHERE THAT HALF IS ACTUALLY RUNNING.
         A travel and a wave fail for different reasons and on different frames
         — a mid-move rasterisation is the ground being repainted under a moving
         camera, a wave's is the fabric changing under a fixed one — so neither
         is judged on the other's frames, and nothing is judged before the
         film's first travel, where the camera is locked and the first year
         cohort is warming caches.

         `s.running` and not `seg === "run"`: a run whose years are too short to
         hold a stagger has no wave in it (`film.ts` §waveFits), and it used to
         be the frames that condemned the wave everywhere else. */
      const which: "cam" | "wave" | null =
        tRef.current < live.firstMoveT0 ? null
        : s.seg.k === "move" ? "cam"
        : s.running ? "wave"
        : null;
      if (!pausedRef.current && lastRef.current && which) {
        const k = which === "cam" ? keepCamRef : keepWaveRef;
        const below = which === "cam" ? belowCamRef : belowWaveRef;
        const w = Math.min(KEEP_UP_W_MAX, raw / KEEP_UP_TAU);
        k.current += ((dt * 1000) / Math.max(1, raw) - k.current) * w;
        keepRef.current = k.current;
        below.current = k.current < KEEP_UP ? below.current + raw : 0;
        if (below.current > KEEP_UP_SUSTAIN_MS) {
          if (which === "cam") spareCamRef.current = true;
          else spareWaveRef.current = true;
        }
      }

      // the fabric's undated trees are a statement about their own file
      applyUndatedTreeGate(s.year);
      yearRef.current = s.year;

      const slot = renderer.filmSlot();
      /* A cut has no trajectory to lead the buffer along — the camera is already
         standing on the incoming frame — so it takes the settled path. */
      const plan =
        s.seg.k === "move" && slot && !red && !spareCamRef.current
          ? planFilmBuffer(
              live.payload, live.timeline, live.frames, tRef.current,
              { cx: s.cx, cy: s.cy, scale: s.scale, step: s.step },
              slot.W, slot.H, live.W, live.H, EXT_K_MAX, biasRef.current,
              () => projection.zex,
            )
          : null;

      const hide = s.hide.length ? new Set(s.hide) : null;
      renderer.driveFilm({
        cx: s.cx, cy: s.cy, scale: s.scale, step: s.step,
        year: s.year, running: s.running, plan, hide,
        underlay: ablate("accepted")
          ? null
          : (f) => drawAccepted(f, live.streets, s, live.frames.base),
        overlay: ablate("subjects")
          ? null
          : (g, W, H) => paintOverlay(g, W, H, renderer, live, s),
      });
      setState(s);
      rafRef.current = requestAnimationFrame(frame);
    },
    [renderer],
  );

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastRef.current = 0;
  }, []);

  const play = useCallback(() => {
    if (!renderer) return;
    const live = build();
    if (!live) return;
    liveRef.current = live;
    if (tRef.current >= live.timeline.total) tRef.current = 0;
    biasRef.current = 0;
    if (treesRef.current === null) treesRef.current = applyUndatedTreeGate(undefined);
    setExitYear(null);
    /* the film is full-bleed: no ledger is painted over the stage, so the fit
       and the pan clamp are told the strip IS the canvas */
    renderer.setLedgerW(0);
    /* the film is not a gazetteer — see `CityScene.filmPlaceCap` */
    renderer.composition.filmPlaceCap = FILM_PLACE_CAP;
    document.documentElement.setAttribute("data-city-film", "on");
    onRef.current = true;
    pausedRef.current = false;
    setOn(true);
    setPaused(false);
    stopLoop();
    rafRef.current = requestAnimationFrame(frame);
  }, [renderer, build, frame, stopLoop]);

  const replay = useCallback(() => {
    tRef.current = 0;
    play();
  }, [play]);

  const exit = useCallback(() => {
    if (!onRef.current || !renderer) return;
    document.documentElement.removeAttribute("data-city-film");
    onRef.current = false;
    pausedRef.current = false;
    stopLoop();
    setOn(false);
    setPaused(false);
    /* THE ROLL IS THE ROLL AGAIN, and the undated trees are back to whatever the
       explorer's own switch says. The reader is left standing at the camera and
       the year the film stopped on — the frame it stopped on IS the explorer. */
    if (treesRef.current !== null) {
      applyUndatedTreeGate(treesRef.current ? 9999 : undefined);
      treesRef.current = null;
    }
    renderer.composition.filmPlaceCap = null;
    renderer.driveFilm(null);
    /* THE FRAME IT STOPPED ON IS THE EXPLORER, and it took a year rail for
       that to be true: this used to clear the year, which threw the reader
       from the 1930s city they were looking at back to the present one. The
       year goes to the rail, which owns it from here, and the rail's own
       effect is what puts it on the renderer. */
    const y = Math.floor(yearRef.current);
    setExitYear(y);
    renderer.setYear(y);
  }, [renderer, stopLoop]);

  const toggle = useCallback(() => {
    if (!onRef.current) {
      play();
      return;
    }
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) {
      lastRef.current = 0;
      stopLoop();
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [play, frame, stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  /* ── THE PROBE ─────────────────────────────────────────────────────────
     `film.js` shipped `window.FILM` and every measurement this piece has ever
     made went through it — the stills, the frame sequences through a move, the
     frame times, and the 24 control assertions that found "the wheel does not
     break out of the film". A film is a thing you have to be able to SEEK to a
     millisecond and look at; wall-clock screenshots cannot check a two-second
     camera move, and judging motion from a single still is how every earlier
     motion bug here survived.
     It reads and seeks. It cannot change a date, a framing or a line of copy. */
  useEffect(() => {
    const w = window as unknown as { __cityFilm?: unknown };
    w.__cityFilm = {
      get ready() { return !!liveRef.current; },
      get on() { return onRef.current; },
      get total() { return liveRef.current?.timeline.total ?? 0; },
      get rasters() { return renderer?.rasterCount ?? -1; },
      /* Whether this machine dropped to the spare version, and the playback
         speed it measured to decide. A film that changes its own grammar has to
         be able to say that it did. See §THE VERSION THE MACHINE CAN PLAY. */
      get spare() { return spareCamRef.current || spareWaveRef.current; },
      get spareCamera() { return spareCamRef.current; },
      get spareWave() { return spareWaveRef.current; },
      get keepUp() { return +keepRef.current.toFixed(3); },
      get why() { return renderer?.rasterWhy ?? ""; },
      get t() { return tRef.current; },
      shots: () => liveRef.current?.timeline.shotT0 ?? [],
      where: () => {
        const st = liveRef.current
          ? filmStateAt(liveRef.current.payload, liveRef.current.timeline,
              liveRef.current.frames, tRef.current,
              { cyBias: biasRef.current, zexFor: () => projection.zex })
          : null;
        return st && {
          t: Math.round(st.t), seg: st.seg.k, shot: st.shot,
          id: liveRef.current?.payload.shots[st.shot]?.id,
          year: Math.floor(st.year), z: +(st.scale / (liveRef.current?.frames.base || 1)).toFixed(3),
          step: st.step, copy: st.line?.copy ?? null, risen: st.risen.length,
          /* the badge follows the LINE and not the shot id (`film.ts` §badge),
             so a harness has to be able to read what the film is SAYING as well
             as what it is showing */
          badge: st.badge, says: st.line?.cite?.entity ?? null,
          hide: st.hide.length, burn: +st.burn.toFixed(3), bridge: +st.bridge.toFixed(3),
        };
      },
      seek: (ms: number) => {
        tRef.current = Math.max(0, Math.min(liveRef.current?.timeline.total ?? 0, ms));
        biasRef.current = 0;
      },
      pause: () => { pausedRef.current = true; setPaused(true); },
      resume: () => {
        pausedRef.current = false; lastRef.current = 0;
        stopLoop(); rafRef.current = requestAnimationFrame(frame);
        setPaused(false);
      },
    };
    return () => { delete w.__cityFilm; };
  }, [frame, stopLoop, renderer]);

  /* ── THE FOUR WAYS OUT ─────────────────────────────────────────────────
     Bound on the WINDOW and in the capture phase. On the canvas the wheel never
     fires: the renderer has its own capturing wheel listener, so a scroll aimed
     at the map is taken before the film's handler sees it. That is how the
     "wheel does not break out" defect survived — a click and Escape both worked,
     so it looked fine by hand. */
  useEffect(() => {
    if (!on) return;
    const inChrome = (e: Event): boolean =>
      e.target instanceof Element && !!e.target.closest("[data-film-chrome]");
    const onDown = (e: PointerEvent): void => {
      if (inChrome(e)) return;
      exit();
    };
    const onWheel = (e: WheelEvent): void => {
      if (inChrome(e) || pausedRef.current) return;
      pausedRef.current = true;
      setPaused(true);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); exit(); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const live = liveRef.current;
        if (!live) return;
        const cur = live.timeline.shotT0.findIndex((x, i) =>
          tRef.current >= x && (i + 1 === live.timeline.shotT0.length ||
            tRef.current < live.timeline.shotT0[i + 1]));
        const j = Math.max(0, Math.min(live.timeline.shotT0.length - 1,
          (cur < 0 ? 0 : cur) + (e.key === "ArrowRight" ? 1 : -1)));
        tRef.current = live.timeline.shotT0[j];
        biasRef.current = 0;
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [on, exit, toggle]);

  const total = timeline?.total ?? payload?.runtime.totalMs ?? 0;
  const mins = Math.floor(total / 60000);
  const secs = Math.round((total % 60000) / 1000);
  const runtimeLabel = t("us.sf.thecity.film.runtime")
    .replace("{min}", String(mins))
    .replace("{sec}", String(secs).padStart(2, "0"));

  const hud =
    on && payload && state && bands ? (
      <FilmChrome
        payload={payload}
        state={state}
        paused={paused}
        atEnd={tRef.current >= total - 1}
        streetsDone={acceptedThrough(bands, Math.floor(state.year))}
        streetsTotal={payload.st.n}
        source={streetSourceAt(payload.st, bands, Math.floor(state.year))}
        onToggle={toggle}
        onExit={exit}
        onSeek={(f) => {
          tRef.current = Math.max(0, Math.min(total, f * total));
          biasRef.current = 0;
        }}
        shotT0={timeline?.shotT0 ?? []}
        total={total}
      />
    ) : null;

  return {
    ready: !!payload && !!renderer,
    on,
    paused,
    payload,
    exitYear,
    resumeLabel: tRef.current > 1200 && tRef.current < total - 200 ? "resume" : "watch",
    runtimeLabel,
    play, replay, toggle, exit, hud,
  };
}

/* ── the film's own marks, on the glass ───────────────────────────────────── */
function paintOverlay(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  renderer: CityRenderer,
  live: Live,
  s: FilmState,
): void {
  const cam = { cx: s.cx, cy: s.cy, scale: s.scale };
  const scene0 = renderer.composition;
  if (s.burn > 0)
    drawBurnLine(g, W, H, cam, projection, scene0.burnRings(),
      (x, y) => scene0.elevAt(x, y), s.burn, s.burn);
  if (s.bridge > 0 && live.deck.length)
    drawBridgeDeck(g, W, H, cam, live.deck, s.bridge, live.frames.base);

  const scene = renderer.composition;
  const placed: number[][] = [];
  for (const r of s.risen) {
    const e = live.payload.ents[r.ent];
    if (!e || e.wx === undefined || e.wy === undefined) continue;
    const col = familyColour(e);
    const zg = scene.elevAt(e.wx, e.wy);
    let markX: number;
    let markY: number;

    if (r.mode === "footprint" && e.bi !== undefined) {
      const ring = scene.footprintOf(e.bi);
      if (ring) {
        const gz = scene.elevAt(ring.cx, ring.cy);
        drawRisingFootprint(g, W, H, cam, projection, ring, gz, r.rise, col);
        const top = projection.projb(ring.cx, ring.cy, gz, ring.h * r.rise);
        markX = (top[0] - cam.cx) * cam.scale + W / 2;
        markY = H / 2 - (top[1] - cam.cy) * cam.scale;
      } else {
        const p = projection.proj(e.wx, e.wy, zg);
        markX = (p[0] - cam.cx) * cam.scale + W / 2;
        markY = H / 2 - (p[1] - cam.cy) * cam.scale;
      }
    } else {
      if (r.mode === "ring" && e.radM)
        drawSubjectRing(g, W, H, cam, projection, e.wx, e.wy, zg, e.radM, r.rise, col);
      else drawSubjectDot(g, W, H, cam, projection, e.wx, e.wy, zg, r.rise, col);
      const p = projection.proj(e.wx, e.wy, zg);
      markX = (p[0] - cam.cx) * cam.scale + W / 2;
      markY = H / 2 - (p[1] - cam.cy) * cam.scale;
    }

    if (r.rise < 0.35) continue;
    const a = Math.max(0, Math.min(1, (r.rise - 0.35) / 0.4));
    const lift = Math.max(26, Math.min(64, (34 * s.scale) / live.frames.base * 0.4));
    drawSubjectName(g, W, H, markX, markY, e.n, col, a, placed, lift);
  }
}

/* ── the chrome ───────────────────────────────────────────────────────────── */

const CSS = `
/* ── THE CHROME IS A YEAR, A LINE AND A SCAN ─────────────────────────────
   Everything else — the record margin, the zoom presets, the loading line, the
   help row, the site nav, the footer and the chat button — is hidden for the
   duration. That density is exactly what was called overwhelming, and
   subtracting it is most of the fix. It comes back on the exit, at the camera
   and the year the film stopped on. */
html[data-city-film] .fx-city-ledger,
html[data-city-film] .fx-city-controls,
html[data-city-film] .fx-city-help,
html[data-city-film] .fx-city-transport,
html[data-city-film] .fx-city-loading,
html[data-city-film] .fx-city-entry,
html[data-city-film] header,
html[data-city-film] footer,
html[data-city-film] .fx-poc-banner{display:none!important}
html[data-city-film],html[data-city-film] body{overflow:hidden}
/* THE STAGE BECOMES THE FRAME. The shell sits above everything the page keeps
   fixed — the chat launcher is z-40 and there is no class on it to hide, so it
   goes UNDER an opaque full-bleed canvas rather than being reached into. */
html[data-city-film] .fx-city-shell{position:fixed;inset:0;z-index:300;
  --fx-city-h:100vh}
html[data-city-film] .fx-city-stage{height:100vh;min-height:0;border:0}
[data-film-chrome]{position:absolute;inset:0;pointer-events:none;z-index:6;
  font-family:var(--f-sans,system-ui);color:#161310}
[data-film-chrome] *{box-sizing:border-box}
/* THE SCRIM IS AS WIDE AS THE TEXT AND NOT AS WIDE AS THE FRAME. A radial wash
   sized to the plate has an EDGE, and against a pale city that edge reads as a
   white rectangle laid on the map. MEASURED over all ten shots, the widest line
   of copy reaches 41.2 % of the frame, so the ramp is masked to the text's own
   side and runs out over the next 46 % of the width — 660 px of falloff, and
   therefore not an edge. */
.fx-film-scrim{position:absolute;left:0;right:0;bottom:0;height:34%;
  background:linear-gradient(to top,rgba(250,250,247,.97) 0%,rgba(250,250,247,.92) 26%,
    rgba(250,250,247,.6) 60%,rgba(250,250,247,.14) 86%,rgba(250,250,247,0) 100%);
  -webkit-mask-image:linear-gradient(to right,#000 0 46%,rgba(0,0,0,.30) 74%,rgba(0,0,0,0) 92%);
          mask-image:linear-gradient(to right,#000 0 46%,rgba(0,0,0,.30) 74%,rgba(0,0,0,0) 92%)}
.fx-film-plate{position:absolute;left:44px;bottom:74px;max-width:min(58ch,52vw)}
.fx-film-year{font-family:var(--f-disp,Georgia,serif);font-weight:700;letter-spacing:-.04em;
  line-height:.9;font-size:clamp(40px,4.4vw,62px);font-variant-numeric:tabular-nums;
  margin:0 0 12px}
.fx-film-copy{margin:0;font-size:clamp(16px,1.42vw,21px);line-height:1.45;font-weight:500;
  max-width:52ch;text-wrap:balance}
.fx-film-cite{display:inline-flex;align-items:center;gap:8px;margin-top:14px;
  font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em;
  text-transform:uppercase;color:#5a5348;text-decoration:none;
  border-bottom:1px solid rgba(90,83,72,.42);padding-bottom:2px;pointer-events:auto}
.fx-film-cite:hover{color:#161310;border-bottom-color:#161310}
.fx-film-cite b{font-weight:600;letter-spacing:.06em}
.fx-film-badge{display:block;width:fit-content;padding:4px 9px;
  font-family:var(--f-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;border:1px solid #161310}
/* THE LIMIT, WITH ITS REASON UNDER IT. The label keeps its box and its place;
   what changes is that it now has a sentence and three publishers behind it.
   Narrower than .fx-film-copy on purpose — the copy is the shot, this is the
   footnote the shot earned, and it must not compete for the same read. */
.fx-film-reach{margin-top:12px;max-width:46ch;pointer-events:auto}
.fx-film-reach-line{margin:9px 0 0;font-size:13.5px;line-height:1.45;color:#3a352c}
.fx-film-reach-src{margin:6px 0 0;font-family:var(--f-mono,ui-monospace,monospace);
  font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#5a5348}
.fx-film-reach-src a{color:inherit;text-decoration:none;
  border-bottom:1px solid rgba(90,83,72,.42)}
.fx-film-reach-src a:hover{color:#161310;border-bottom-color:#161310}
.fx-film-when{position:absolute;left:44px;bottom:74px;max-width:min(62ch,54vw);
  background:rgba(250,250,247,.97);border:1px solid rgba(22,19,16,.18);padding:18px 20px;
  pointer-events:auto}
.fx-film-when h3{margin:0 0 10px;font-family:var(--f-mono,ui-monospace,monospace);
  font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5a5348;font-weight:600}
.fx-film-when p{margin:0 0 10px;font-size:14.5px;line-height:1.5}
.fx-film-when a{color:#1e45e4;text-decoration:none;border-bottom:1px solid rgba(30,69,228,.4)}
.fx-film-row{font-size:12.5px;color:#5a5348;margin:0 0 5px}
.fx-film-ctl{position:absolute;right:36px;bottom:70px;display:flex;gap:10px;
  align-items:center;pointer-events:auto;opacity:0;transition:opacity 200ms}
[data-film-chrome]:hover .fx-film-ctl,[data-film-chrome][data-paused="1"] .fx-film-ctl{opacity:1}
.fx-film-ctl button{font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;
  letter-spacing:.06em;text-transform:uppercase;padding:8px 14px;cursor:pointer;
  border:1px solid rgba(22,19,16,.34);background:rgba(250,250,247,.94);color:#161310}
.fx-film-ctl button.pri{background:#161310;color:#faf9f5;border-color:#161310}
/* a hairline, not a timeline. Ten notches, no labels and no numbers: it says
   how far through you are and nothing else. A scrub bar with labels IS the
   timeline, and the timeline is what we are hiding. */
.fx-film-bar{position:absolute;left:0;right:0;bottom:0;height:22px;pointer-events:auto;
  cursor:pointer}
.fx-film-bar i{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(22,19,16,.16)}
.fx-film-bar u{position:absolute;left:0;bottom:0;height:2px;background:#161310}
.fx-film-bar s{position:absolute;bottom:0;width:1px;height:6px;background:rgba(22,19,16,.3)}
.fx-film-bar:hover i,.fx-film-bar:hover u{height:5px}
/* .78, not .9: at .9 the title card is a white page with a ghost of a city
   behind it, which throws away the three seconds it has to say what you are
   about to look at. At .78 the 1906 city is legible under the words. */
.fx-film-card{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;gap:14px;
  background:rgba(250,250,247,.78)}
.fx-film-card h2{margin:0;font-family:var(--f-disp,Georgia,serif);font-weight:700;
  font-size:clamp(28px,3.4vw,46px);letter-spacing:-.03em;max-width:22ch}
.fx-film-card p{margin:0;font-size:15.5px;color:#5a5348;max-width:56ch;line-height:1.5}
@media (max-width:820px){
  .fx-film-plate,.fx-film-when{left:20px;right:20px;bottom:60px;max-width:none}
  .fx-film-ctl{right:20px;bottom:26px}
  /* target size, WCAG 2.2 SC 2.5.8: the hairline stays a hairline and only the
     region that takes the touch grows */
  .fx-film-bar{height:30px}
  .fx-film-cite{padding-bottom:8px;padding-top:8px}
  .fx-film-ctl button{padding:12px 16px}
  .fx-film-scrim{-webkit-mask-image:none;mask-image:none}
}
`;

function FilmChrome({
  payload, state, paused, atEnd, streetsDone, streetsTotal, source,
  onToggle, onExit, onSeek, shotT0, total,
}: {
  payload: FilmPayload;
  state: FilmState;
  paused: boolean;
  atEnd: boolean;
  streetsDone: number;
  streetsTotal: number;
  source: ReturnType<typeof streetSourceAt>;
  onToggle: () => void;
  onExit: () => void;
  onSeek: (f: number) => void;
  shotT0: readonly number[];
  total: number;
}) {
  const t = useT();
  const nf = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const iy = Math.floor(state.year);
  /* the shot's own entity, not the badge token: the reach file is keyed on the
     entry id, so the sentence belongs to whatever the shot is about */
  const reach = useReachBadge(
    state.badge ? (payload.shots[state.shot]?.cite?.entity ?? null) : null,
  );
  const card = state.card ? (state.card === "title" ? payload.title : payload.end) : null;
  const line = state.line;

  return (
    <div data-film-chrome="" data-paused={paused ? "1" : "0"}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="fx-film-scrim" />

      {card ? (
        /* THE WASH IS ON THE FILM'S CLOCK. `transition: opacity` never ran —
           an element removed from the DOM does not transition out — and a wall
           -clock transition could not be scrubbed to anyway. `film.ts`
           §cardAlpha. */
        <div className="fx-film-card" style={{ opacity: state.cardAlpha }}>
          <h2>{card.head}</h2>
          <p>{card.sub}</p>
        </div>
      ) : null}

      {!card && !paused ? (
        <div className="fx-film-plate">
          <div className="fx-film-year tnum">{iy}</div>
          {line?.copy ? <p className="fx-film-copy">{line.copy}</p> : null}
          {line?.cite ? (
            <a className="fx-film-cite" href={line.cite.url} target="_blank" rel="noopener">
              <b>{t("us.sf.thecity.film.scan")}</b>{" "}
              {volumeLabel(line.cite.item)} · {t("us.sf.thecity.film.leaf")} {line.cite.leaf}
            </a>
          ) : line?.links ? (
            <a className="fx-film-cite" href={line.links[0].u} target="_blank" rel="noopener">
              <b>{t("us.sf.thecity.film.data")}</b>{" "}
              {line.links.map((l) => l.t).join(" · ")}
            </a>
          ) : null}
          {state.badge ? (
            <div className="fx-film-reach">
              <span className="fx-film-badge">{t("us.sf.thecity.film.not_on_map")}</span>
              {reach ? (
                <>
                  <p className="fx-film-reach-line">{reach.line}</p>
                  <p className="fx-film-reach-src">
                    {reach.sources.map((s, i) => (
                      <span key={s.u}>
                        {i ? " · " : ""}
                        <a href={s.u} target="_blank" rel="noopener">
                          {s.t}
                        </a>
                      </span>
                    ))}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* PAUSING IS THE ONLY THING THAT ADDS TO THE SCREEN. */}
      {paused ? (
        <div className="fx-film-when">
          <h3>{t("us.sf.thecity.film.paused_head").replace("{year}", String(iy))}</h3>
          {line?.copy ? <p>{line.copy}</p> : null}
          {line?.cite ? (
            <p className="fx-film-row">
              <a href={line.cite.url} target="_blank" rel="noopener">
                {volumeLabel(line.cite.item)}, {t("us.sf.thecity.film.leaf")} {line.cite.leaf}
              </a>
            </p>
          ) : null}
          {line?.links ? (
            <p className="fx-film-row">
              {line.links.map((l, i) => (
                <span key={l.u}>
                  {i ? " · " : ""}
                  <a href={l.u} target="_blank" rel="noopener">{l.t}</a>
                </span>
              ))}
            </p>
          ) : null}
          <p className="fx-film-row">
            {t("us.sf.thecity.film.streets_drawn")
              .replace("{n}", nf.format(streetsDone))
              .replace("{of}", nf.format(streetsTotal))}
            {source ? (
              <>
                {" "}
                {t("us.sf.thecity.film.streets_this_year")
                  .replace("{n}", nf.format(source.n))
                  .replace("{year}", String(iy))}{" "}
                {source.rows.slice(0, 2).map((r, i) => (
                  <span key={`${r.vol}-${r.leaf}`}>
                    {i ? ` ${t("us.sf.thecity.film.and")} ` : ""}
                    <a href={r.url} target="_blank" rel="noopener">
                      {volumeLabel(r.vol)} {t("us.sf.thecity.film.leaf")} {r.leaf}
                    </a>
                  </span>
                ))}
                .
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="fx-film-ctl">
        <button type="button" onClick={onToggle}>
          {atEnd
            ? t("us.sf.thecity.film.replay")
            : paused
              ? t("us.sf.thecity.film.resume")
              : t("us.sf.thecity.film.pause")}
        </button>
        <button type="button" className="pri" onClick={onExit}>
          {t("us.sf.thecity.film.explore")}
        </button>
      </div>

      <div
        className="fx-film-bar"
        role="slider"
        tabIndex={0}
        aria-label={t("us.sf.thecity.film.scrub")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.progress * 100)}
        onPointerDown={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onSeek((e.clientX - r.left) / r.width);
        }}
      >
        <i />
        <u style={{ width: `${state.progress * 100}%` }} />
        {shotT0.map((x) => (
          <s key={x} style={{ left: `${(100 * x) / (total || 1)}%` }} />
        ))}
      </div>
    </div>
  );
}
