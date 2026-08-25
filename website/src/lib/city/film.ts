/* ═══════════════════════════════════════════════════════════════════════
   src/lib/city/film.ts — THE FILM.

   The map is a browsable city and it directs the eye nowhere. This makes it a
   film: ten moments, 2 minutes 14 seconds, the camera on rails, one subject at
   a time, and the explorer as what you get when you stop.

   Ported from `scratchpad/sf-city-anim/film/film.js` §1–6 and §"THE MOVES GO
   THROUGH nav's RASTER-AND-BLIT". Like `projection.ts` and `camera.ts` this
   file is PURE: no DOM, no canvas, no React, no clock of its own. It answers
   one question — *what is true at film millisecond t* — and the shell in
   `components/us/city/` paints the answer. That split is what makes a scrub
   land on exactly the frame playback would have produced, and it is what makes
   the timeline testable without a browser.

   FOUR RULES, carried over whole:

   1. THE CAMERA SETTLES, HOLDS, AND MOVES. It never drifts. A move is 1.6 to
      2.6 seconds on a named curve and it ends in a full stop; a hold is five to
      eight seconds of nothing, which is the only time in the piece a reader can
      actually read.
   2. THE STREETS LAY THEMSELVES DOWN UNDERNEATH. 2,051 published centrelines,
      each lit on the year the Board voted to accept it, each carrying the leaf
      of that vote. It runs continuously from the first frame to the last and it
      costs the film no time, which is why it is allowed to be the one thing
      that is always moving.
   3. ONE THING RISES AT A TIME. While a landmark is going up, nothing else on
      the frame moves and NO OTHER LANDMARK IS DRAWN AT ALL — not dimmed, not
      desaturated, not drawn. The three fabric runs are the exception, and only
      because "the whole city at once" is their subject.
   4. THE CHROME IS A YEAR, A LINE AND A SCAN. Everything else is hidden for the
      duration. Pausing is the only thing that ADDS to the screen.

   IT NEVER INVENTS A COORDINATE, A DATE OR AN ATTRIBUTION. Every framing is
   lon/lat out of `film/camera.json`; every line on screen was checked against
   `film/entries/` by `film/build_film.py` at build time and will not ship if
   the corpus does not hold it; every accepted centreline carries the volume and
   the leaf of its own vote. `build_film_payload.py` is downstream of all of it
   and adds arithmetic only.
   ═══════════════════════════════════════════════════════════════════════ */

import { ZEX_BY_STEP, type Projection } from "./projection";

// ── 0 · the curves ──────────────────────────────────────────────────────────

/**
 * The named easing curves, ported from `gen/motion.js`.
 *
 * Two of them already exist on Qipu and are the anchor — `cubic-bezier(.22,.61,
 * .36,1)`, the drawer slide, and `(.4,0,.2,1)`, the reveals — so the canvas
 * feels like the same product as the DOM around it. The third, `travel`, is the
 * only curve in the set with no precedent on the site to inherit, and it is
 * stated rather than smuggled in: **a camera moves the reader's own frame of
 * reference, so it has to leave and arrive at zero velocity and spend its time
 * in the middle.** `(.4,0,.2,1)` is 78 % done at the halfway point, which on a
 * 7.2× zoom shows as a lurch followed by a 150 ms crawl.
 *
 * Solved on a 1/512 grid the way the browsers do it, because canvas has no CSS
 * transitions: a building's rise is a number we compute, not a property we hand
 * to the compositor, and a bezier solve is ~200 ns paid thousands of times a
 * frame.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const A = (a: number, b: number): number => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number): number => 3 * b - 6 * a;
  const C = (a: number): number => 3 * a;
  const calc = (t: number, a: number, b: number): number =>
    ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number): number =>
    3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  const LUT = new Float32Array(513);
  for (let i = 0; i <= 512; i++) {
    const x = i / 512;
    let t = x;
    for (let k = 0; k < 8; k++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    LUT[i] = calc(t, y1, y2);
  }
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const p = x * 512;
    const i = p | 0;
    return LUT[i] + (LUT[i + 1] - LUT[i]) * (p - i);
  };
}

/**
 * Overshoot is NOT a bezier — a bezier is confined to [0,1] in y and an
 * overshoot has to exceed 1. easeOutBack, with the amplitude expressed as the
 * peak fraction it reaches rather than as the opaque `c1` constant: 1.055 is a
 * 5.5 % overshoot, which at a 40 m building is 2.2 m — a settle, not a bounce.
 * Used on exactly one object at a time.
 */
export function outBack(over: number): (x: number) => number {
  let lo = 0;
  let hi = 6;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    let mx = 0;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200 - 1;
      const v = 1 + (m + 1) * t * t * t + m * t * t;
      if (v > mx) mx = v;
    }
    if (mx > over) hi = m;
    else lo = m;
  }
  const c = (lo + hi) / 2;
  const c3 = c + 1;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const t = x - 1;
    return 1 + c3 * t * t * t + c * t * t;
  };
}

export const CURVE: Readonly<Record<string, (x: number) => number>> = {
  enter: bezier(0.22, 0.61, 0.36, 1),
  move: bezier(0.4, 0, 0.2, 1),
  exit: bezier(0.4, 0, 1, 1),
  travel: bezier(0.45, 0.05, 0.55, 0.95),
  fade: bezier(0, 0, 0.58, 1),
  settle: outBack(1.055),
  /* NO EASE AT ALL. It is here for the fire, and it is now also every YEAR.

     ── WHICH OF THESE IS A CAMERA CURVE, AUDITED ────────────────────────────
     `curveOf` is read from exactly three places and they are not one kind of
     motion, which is what let a camera curve end up on a fire:

       · §1106 and §1342 — `curveOf(s.curve)`, the SHOT's curve. THE CAMERA.
         No shot carries one, so both fall through to `move`, and `move`
         — eased at both ends because a camera has to start and stop — is
         exactly right there.
       · §873 — `curveOf(a.curve)(u)`, an object's RISE on a `build` act:
         `enter` for the burn line and the 1942 outline, `settle` (outBack,
         which overshoots and is not a bezier at all) for the three placemarks,
         `travel` for the Bay Bridge deck. Those are OBJECT curves, not camera
         curves — §23.6 called the whole table cameras and that was too strong
         — and an object arriving is allowed to ease and to overshoot.
       · §1150 — `year = yFrom + (yTo − yFrom) * curveOf(a.curve)(u0)`,
         **THE YEAR ON A `run` ACT, AND IT IS NOT A CAMERA.** Every run in
         SCRIPT carried `move`. A run advances the year with the camera
         standing still; it is a counter, and the record does not say 1910 took
         longer than 1911.

     MEASURED, the ms each displayed integer year is on screen (`/tmp` script
     in §25.4, dwell between the solves of `f(u) = y/n`):

       rebuild, 9 years over 5,600 ms
         move  1040 326 244 229 250 306 414 646 2144   ← 9.4:1
         even   622 622 622 622 622 622 622 622 622
       mission-bay, 27 years over 3,600 ms
         move   422 145 102 81 … 49 … 303 864          ← 17.6:1
         even   133 × 27

     Shot 2's own comment claims its run is *"well over STAGGER_TOTAL, so the
     arrival wave actually runs"*. It was computing the NOMINAL rate. Under
     `move`, five of its nine years land in under 260 ms — **below the 520 ms
     stagger, so those five years had no wave at all** — while 1915 sits on
     screen for 2.1 s, 38 % of the run. That was true at 12,000 ms too
     (229 × 12000/5600 = 491, still under 520). Under `even` all nine clear it.

     `move` — `bezier(0.4, 0, 0.2, 1)` — is the strongest ease-out in the
     table, and the fire act was reading its ignition sweep off it. Measured on the shipped cut, the act's own phase against the
     film clock: 0.083 at 5.9 s, 0.386 at 7.2 s, 0.707 at 8.5 s, 0.869 at
     9.7 s, 0.953 at 11.0 s, 0.992 at 12.3 s. **Three quarters of the act's
     phase is spent in the first 45 % of its nine seconds**, and the last four
     seconds move it 0.87 to 1.00 — which is a frame of embers held for four
     seconds and is exactly the note this whole pass exists to answer.
     Thirty-five structures lighting one after another is not a camera arriving
     somewhere. Nothing accelerates and nothing decelerates: the record gives
     no ignition time for any of them, so the only honest sweep is an even one. */
  even: (x: number) => x,
};

const curveOf = (n: string | null | undefined): ((x: number) => number) =>
  (n && CURVE[n]) || CURVE.move;

/* ── the fabric's own arrival wave ────────────────────────────────────
   `gen/motion.js` §STAGGER and `gen/part4.html` §riseOf. 520 ms across the
   depth axis: two full cohorts overlap at travel speed, which is what makes a
   year's building read as a wave and not as a flash. `dn` is normalised on the
   SCREEN and not on the whole city — a cohort seen at district zoom occupies a
   narrow slice of world depth, so a world-normalised stagger collapses it into
   a flash at exactly the zoom where the reader is closest to it.
   FAR FIRST, because that agrees with painter's order: a building that arrives
   later always paints OVER one that arrived earlier, never under. */
export const STAGGER_TOTAL = 520;

/**
 * ── AND A YEAR THAT IS SHORTER THAN THE STAGGER HAS NO WAVE IN IT ─────────
 *
 * `STAGGER_TOTAL` shipped declared and **read by nothing** — the same pattern
 * as `roofF`/`wallF`, `GGB.suspenderM` and the four uncalled passes. This is
 * what it means.
 *
 * The wave is `RISE_WIN` of a year long, so how much of it a reader sees
 * depends entirely on how long a year lasts, and the film's runs differ by a
 * factor of sixteen:
 *
 *     shot 2  rebuild        6 yr / 12,000 ms = 0.50 yr/s   year 2,000 ms
 *     shot 5  tunnel         1 / 1,600        = 0.63        1,600
 *     shot 8  treasure isl.  1 / 1,500        = 0.67        1,500
 *     shot 6  west-fills    17 / 16,000       = 1.06          941   <- the showcase
 *     shot 7  the bridge     2 / 1,600        = 1.25          800
 *     shot 10 to-now        52 / 18,000       = 2.89          346
 *     shot 4  city-hall      3 / 900          = 3.33          270
 *     shot 9  yerba-buena   27 / 3,400        = 7.94          126
 *
 * At shot 9's rate a year is 126 ms and its rise window is 49 ms — three frames
 * at 60 Hz. There is no wave there to see, and asking for one costs the same
 * rasterisation per `YEAR_Q` step as a wave that reads: **71 rasterisations a
 * second, which no machine draws.**
 *
 * MEASURED, `.parity/m1keep.py`: judged apart, the wave's verdict was decided
 * by **shot 4's 900 ms run at z 28** — the film's shortest, fastest run at its
 * deepest zoom — and shot 9's run measures `keepUp` 0.26–0.34 *with the wave
 * already off*, so it is the year RATE and not the wave that is unaffordable
 * there. Condemning the wave on those frames threw it away on shot 6, where
 * the same trace measures 0.80–0.93.
 *
 * So the wave runs where there is room for it: **a year must last at least
 * `STAGGER_TOTAL` for the depth stagger to have any.** Above that rate the year
 * lands whole, which is what it already looks like, and costs one rasterisation
 * a year instead of nine. Shot 9 goes from 243 to 27.
 */
export function waveFits(years: number, ms: number): boolean {
  return years > 0 && ms / years >= STAGGER_TOTAL;
}
export const STAGGER_JITTER = 0.18;
/** the fraction of a year the cohort rises over */
export const RISE_WIN = 0.385;
/** how much of that window is spent staggering */
export const RISE_LEAD = 0.55;

/** how much of a year the year's own street acceptances draw over */
export const ST_ENTER_WIN = 0.55;

/**
 * The largest fraction of a year anything downstream actually reads.
 *
 * The arrival wave is finished at `RISE_WIN` and the accepted streets at
 * `ST_ENTER_WIN`; past the later of the two the frame does not change again
 * until the next integer year. Derived from both rather than typed, so moving
 * either constant cannot silently start pinning the year while something is
 * still animating on it.
 */
export const YEAR_LIVE = Math.max(RISE_WIN, ST_ENTER_WIN);

/**
 * How long a title or end card takes to wash in or out, ms.
 *
 * 700 of the title's 3,000, so two thirds of the card's life is a still page to
 * read and the last third is the 1906 city arriving under it. It is a declared
 * motion constant in the same class as `STAGGER_TOTAL`, not a figure out of a
 * file, and nothing on screen depends on its value being any particular number.
 */
export const CARD_WASH = 700;

/** The per-building entrance curve. `dn` is 0 at the far edge of the frame and
 *  1 at the near edge; `hash` is the building's own deterministic jitter. */
export function riseOf(phase: number, dn: number, hash: number): number {
  if (phase >= 1) return 1;
  const j = (hash - 0.5) * 2 * STAGGER_JITTER;
  const d = Math.max(0, Math.min(1, dn + j)) * RISE_LEAD;
  return CURVE.enter(Math.max(0, Math.min(1, (phase - d) / (1 - RISE_LEAD))));
}

/** How far through the current integer year's cohort the clock is. */
export function risePhase(year: number, playing: boolean): number {
  if (!playing) return 1;
  const f = year - Math.floor(year);
  return f <= 0.0005 ? 1 : f >= RISE_WIN ? 1 : f / RISE_WIN;
}

// ── 1 · the payload ─────────────────────────────────────────────────────────

export interface FilmCite {
  readonly item: string;
  readonly leaf: number;
  readonly url: string;
  readonly entity?: string;
}

export interface FilmLink {
  readonly t: string;
  readonly u: string;
  /** which chip the row wears. A scanned annual report is a SCAN even when it
   *  is not the shot's gated citation — shot 2 rests on the Chief Building
   *  Inspector's own permit tables, which are scans, and labelling them DATA
   *  would tell a reader they came out of a modern register. Absent = data. */
  readonly k?: "scan" | "data";
}

export type BuildWhat =
  | "burnLine"
  | "ring"
  | "footprint"
  | "placemark"
  | "bridge"
  /** the four streets a resolution names as its own subject, stroked as one
   *  gesture — `build_film_twelve.py` §district_outline. NOT a polygon: the
   *  Board named four streets and the film draws four streets. */
  | "outline";

export interface FilmBuildData {
  /** absent where the entry is a SECOND LINE and nothing is raised with it —
   *  shot 5 says two things about 1942 and raises one boundary */
  readonly what?: BuildWhat;
  readonly entity?: string | null;
  readonly ms?: number;
  readonly curve?: string;
  readonly gate?: number;
  readonly copy?: string;
  readonly cite?: FilmCite;
  /** world decimetres: the Bay Bridge west span, or the streets an `outline`
   *  names */
  readonly w?: readonly (readonly (readonly number[])[])[];
  /** the record's own words for the ground an `outline` covers */
  readonly said?: string;
}

export interface FilmShotData {
  readonly n: number;
  readonly id: string;
  readonly title: string;
  readonly z: number;
  readonly ox: number;
  readonly oy: number;
  readonly y0: number;
  readonly y1: number;
  readonly run: number;
  readonly move: number;
  readonly hold: number;
  readonly shot: number;
  readonly curve: string;
  readonly copy?: string;
  readonly kind: "scan" | "data";
  readonly lon?: number;
  readonly lat?: number;
  /** the target in world metres — `build_film_payload.py`'s only addition */
  readonly wx?: number;
  readonly wy?: number;
  readonly cite?: FilmCite;
  readonly links?: readonly FilmLink[];
  /** published sources beside the gated leaf, where the sentence rests on a
   *  figure the minute book does not hold — shot 1's three days and 28,000,
   *  shot 2's permit tables and the count they pass. A LIST: shot 2's sentence
   *  is a comparison and a comparison needs both of its sides on the plate. */
  readonly also?: readonly FilmLink[];
  /** the caveat a derived figure has to carry. NOT narration and never in the
   *  narration's type: shot 2's number is a sum of eight printed tables and
   *  the sum is not in any of them, so the plate says so under the sources
   *  rather than in the sentence. */
  readonly note?: string;
  readonly build?: FilmBuildData;
  readonly build2?: FilmBuildData;
  /** the plate's year FOLLOWS the run rather than being pinned to the year the
   *  shot settles on. Three shots: the match cut and its rhyme, where the
   *  moving year is the subject, and the bridges, whose sentence names two
   *  dated openings. `build_film_twelve.py` §THE YEAR ON THE PLATE. */
  readonly yrun?: boolean;
  /** THE PLATE'S YEAR, STATED. Beats `yrun` and beats the settle year, for the
   *  whole shot, whatever the counter under it is doing.
   *
   *  MEASURED, `.parity/r1plate.py`, on the shipped build: shot 9's earthquake
   *  line is up for 13 half-second samples and the plate reads **1991 on eleven
   *  of them** — 85 % of the seconds that sentence is on screen. `say: 1` lands
   *  the copy on 1989 and the second run then carries the number off it while
   *  the reader is still reading, which is why §33's first-and-last instrument
   *  reported a pass and Daniel still saw 1991 over the word "earthquake".
   *
   *  A span on the plate can only be right where the SENTENCE is a span —
   *  shots 2, 4 and 10, which is what `yrun` is for. Everywhere else the plate
   *  is a CAPTION on the shot's subject and one number is the whole of its job.
   *  `build_film_twelve.py` §THE YEAR ON THE PLATE. */
  readonly pin?: number;
  /** the copy waits until this act index — the year equivalent of the move
   *  guard in `pickLine`. */
  readonly say?: number;
  readonly stFrom: number | null;
  readonly stTo: number | null;
  readonly burn?: { from: number; to: number; start_ms: number; ms: number };
}

export interface FilmEnt {
  readonly n: string;
  readonly f: string;
  readonly y: number;
  readonly wx?: number;
  readonly wy?: number;
  readonly lon?: number;
  readonly lat?: number;
  readonly radM?: number;
  readonly prec?: string;
  /** the published footprint index, where a published join reached one */
  readonly bi?: number;
  readonly biBy?: string;
  readonly biCite?: string;
}

export interface FilmStreets {
  readonly vols: readonly string[];
  readonly y: readonly number[];
  readonly vi: readonly number[];
  readonly leaf: readonly number[];
  readonly off: readonly number[];
  /** world decimetres */
  readonly x: readonly number[];
  readonly yv: readonly number[];
  readonly n: number;
}

/** the two cards. `note` is the title card's third line and only the title
 *  card has one — see the field's comment above `FilmPayload.title`. */
export interface FilmCard {
  readonly head: string;
  readonly sub: string;
  readonly note?: string;
}

export interface FilmPayload {
  readonly meta: Record<string, string>;
  readonly runtime: {
    readonly titleMs: number;
    readonly endMs: number;
    readonly shotsMs: number;
    readonly totalMs: number;
  };
  /** `note` is the title card's third line — the one sentence that says where
   *  every building, street and decision in the film comes from. See
   *  `build_film_twelve.py` §TITLE. The END card has no `note`, which is why
   *  the field is optional and why the chrome tests for it. */
  readonly title: FilmCard;
  readonly end: FilmCard;
  readonly shots: readonly FilmShotData[];
  readonly ents: Readonly<Record<string, FilmEnt>>;
  readonly st: FilmStreets;
}

// ── 2 · the script ──────────────────────────────────────────────────────────

/**
 * THE ACT ORDER.
 *
 * `camera.json` states each shot's move, hold and run as three numbers and
 * leaves the ORDER of them to prose. That ambiguity is where a film goes wrong,
 * so the order is written out act by act — and **the acts of a shot must sum to
 * its own `shot` ms**, asserted in `buildTimeline`, so a re-timed shot cannot
 * quietly change the running time. That assertion has fired once, correctly.
 *
 * This is the film's editorial order rather than its data, which is why it is
 * code and not payload: it is the same distinction `film.js` draws.
 *
 *   run    the YEAR moves and the camera does not. The fabric's own arrival
 *          wave draws it, because that wave is already keyed to the fractional
 *          year and already staggers far-to-near.
 *   build  ONE object rises. Nothing else moves.
 *   hold   nothing moves. This is the act that does the reading.
 */
export type FilmAct =
  | { readonly k: "run"; readonly ms: number; readonly to: number; readonly curve: string;
      readonly burn?: readonly [number, number, number, number];
      readonly line?: 1 | 2 }
  | { readonly k: "build"; readonly ms: number; readonly what: BuildWhat;
      readonly ent?: string; readonly curve: string; readonly line?: 1 | 2 }
  /* the 1906 schedule of losses being READ — `film/fire.json`, 35 placed
     structures, lighting in the order the page prints them. It is an act and
     not a build because nothing rises: the year does not move, the camera does
     not move, and what changes is how much of one table has been read. */
  | { readonly k: "fire"; readonly ms: number; readonly curve: string;
      readonly line?: 1 | 2 }
  | { readonly k: "hold"; readonly ms: number; readonly line?: 1 | 2 };

/**
 * THE ELEVEN, AND HOW EACH ONE MOVES.
 *
 * `build_film_twelve.py` holds the framings, the copy and the citations; this
 * holds the ORDER and the LENGTH of what happens inside each shot, because
 * `camera.json` used to state move/hold/run as three numbers and leave the
 * order to prose, and that ambiguity is where a film goes wrong. The acts of a
 * shot must sum to `shot_ms` minus its move, asserted in `buildTimeline`, so a
 * re-timed shot cannot quietly change the running time. That assertion has
 * fired twice, correctly.
 *
 *   run    the YEAR moves and the camera does not. The fabric's own arrival
 *          wave draws it, because that wave is already keyed to the fractional
 *          year and already staggers far-to-near.
 *   build  ONE object rises. Nothing else moves.
 *   fire   the 1906 schedule of losses is read. Only shot 1 has one.
 *   hold   nothing moves. This is the act that does the reading.
 *
 * ── THE MOTION DESIGN, WHICH IS MOSTLY A DECISION NOT TO MOVE ───────────────
 *
 * Shot 1 and shot 2 share a target, a zoom and an offset and neither carries a
 * move, so the cut between them is a **match cut**: the burned city, and then
 * the same frame with nine years running under a camera that does not move.
 * That is the strongest image in the film and it is also the cheapest thing
 * this renderer can do — FILM.md §15.1 measured a travel at four to
 * thirty-two rasterisations and a locked camera at zero, and §15.2 found the
 * cost of a travel is pushing 2,880 × 1,880 pixels, not computing the city.
 * Shot 10 is the same gesture seventy years later, which closes the loop.
 *
 * Shot 5 is still after its move, on purpose. Nothing rises on it but the four
 * streets the resolution names, and there is no effect that would improve it.
 */
export const SCRIPT: Readonly<Record<string, readonly FilmAct[]>> = {
  /* 1906. The hairline draws itself round the burned city, and then the Fire
     Department's own schedule lights inside it — 35 placed structures out of
     `film/fire.json`, in the order the page prints them, because no ignition
     time is published for any of them and a spreading front would be a
     drawing rather than a record. `coverage/FIRE.md`: *"Not a fire that
     spreads. The fire can arrive; it cannot advance."* */
  burn: [
    { k: "build", ms: 1400, what: "burnLine", curve: "enter" },
    /* `even`, not `move` — see CURVE.even. On the camera's ease-out the whole
       fire was over by 9.7 s of a 15 s shot. */
    { k: "fire", ms: 6600, curve: "even" },
    /* held longer than is comfortable, which is the instruction and is right:
       the frame the fire leaves is the frame shot 2 opens on. */
    { k: "hold", ms: 3200 },
  ],
  /* THE MATCH CUT. Same camera as shot 1, no move, and the burn hairline stays
     up at half alpha for the first three years so the rebuild is watched
     happening INSIDE it. RE-TIMED 12,000 -> 5,600 ms in §25.2: nine years over
     5,600 ms is 622 ms a year, which is still over `STAGGER_TOTAL`, so the
     arrival wave still runs. The hairline's fade keeps its own fractions —
     it began at 1/3 of the run and took 1/5 of it, and it still does. */
  rebuild: [
    { k: "run", ms: 5600, to: 1915, curve: "even", burn: [1, 0, 1850, 1200] },
  ],
  /* 1915. `footprint`, not `ring`: the record names the building, and the
     published footprint IS the precision. The Exposition's other palaces
     cannot be drawn beside it and vanish at the fair's close — they were staff
     over lath, they were pulled down, and the fabric is the assessor's roll,
     which dates what is standing. The Palace rising alone on ground the map
     shows nothing else of IS that fact. */
  palace: [
    { k: "build", ms: 1200, what: "placemark", ent: "palace-of-fine-arts", curve: "settle" },
    { k: "hold", ms: 4400 },
  ],
  /* 1936 and 1937, on the widest camera in the film. The Bay Bridge deck is a
     film BUILD and not a year gate — `skipBridgeGhost` keeps the base layer's
     2025 alignment off the frame until this act finishes — and the Golden Gate
     is not drawn by the film at all: `landmarks.ts` §GGB gates the published
     deck at 1937 and the fabric puts it up on its own date while the camera
     holds. Two crossings, two mechanisms, one frame. */
  bridges: [
    { k: "run", ms: 1400, to: 1936, curve: "even" },
    { k: "build", ms: 1400, what: "bridge", curve: "travel" },
    { k: "hold", ms: 900 },
    { k: "run", ms: 1000, to: 1937, curve: "even" },
    { k: "hold", ms: 2300 },
  ],
  /* 1942, and the camera does not move once it has arrived. The only thing
     that rises is the boundary the Board itself named — ELLIS, CALIFORNIA,
     GOUGH AND FILLMORE — drawn as those four published centrelines and not as
     a polygon somebody fitted to them. Then the shot says the second thing it
     has to say and holds. */
  japantown: [
    { k: "run", ms: 2400, to: 1942, curve: "even" },
    { k: "build", ms: 1400, what: "outline", ent: "japantown-1942", curve: "enter" },
    { k: "hold", ms: 5200 },
  ],
  charter: [
    { k: "run", ms: 1000, to: 1945, curve: "even" },
    { k: "build", ms: 1200, what: "placemark", ent: "united-nations-charter-1945", curve: "settle" },
    { k: "hold", ms: 2800 },
  ],
  /* 1959, and NOTHING IS DRAWN, which is the shot. The resolution names seven
     freeways; `entries/freeway-revolt-1959.json` says in the open that their
     corridors are *"NOT IN RECORD as geometry"*. Ghosting seven alignments in
     would be inventing seven roads to show that they were never built. */
  /* the hold is 4,400 and not 2,800 because THE PAGE IS ON SCREEN. The line
     clears its own reading floor either way; the scanned resolution — ten
     freeways named, seven struck, adopted 11-0, all on one opening — does not
     read in five seconds. See `build_film_twelve.py` §9. */
  freeways: [
    { k: "run", ms: 2400, to: 1959, curve: "even" },
    { k: "hold", ms: 4400 },
  ],
  /* the run is what raises the Pyramid: `landmarks.ts` gates the hero at 1972
     and the fabric puts it up on its own published year while the camera
     holds. The film's own act is a mark and a name over it. */
  pyramid: [
    { k: "run", ms: 1400, to: 1972, curve: "even" },
    { k: "build", ms: 1200, what: "placemark", ent: "transamerica-pyramid", curve: "settle" },
    /* 2,800 -> 3,400, and the 600 ms is the LINE and not the picture. The
       approved tense fix — "went up in 1972 and stayed the tallest…" — is 110
       characters against 87, so §25.2's reading floor asks 5.7 s against the
       5.4 s the copy was visible for. The rise is untouched. */
    { k: "hold", ms: 3400 },
  ],
  /* 1991. The Embarcadero Freeway was never drawn — the fabric dates what is
     standing today, so a structure demolished in 1991 is in no year of this
     map — and the film says that rather than faking a collapse. */
  embarcadero: [
    /* SPLIT, so the counter can move from the earthquake's year to the
       vote's year UNDER a sentence that names them in that order. One run to
       1991 put 1987 in the largest type on the frame over the word
       "earthquake"; `say: 1` in the payload lands the copy on 1989 and the
       second run carries it to 1991. */
    { k: "run", ms: 1400, to: 1989, curve: "even" },
    { k: "run", ms: 1000, to: 1991, curve: "even" },
    /* 3,000 -> 4,200 -> 5,400. The floor is §25.2's: the 1989 line is 120
       characters and needs 6.2 s. With `say: 1` the copy no longer covers the
       first run, so the visible window is the second run plus this hold. */
    { k: "hold", ms: 5400 },
  ],
  /* THE RHYME with shot 2: the camera stops and a district fills in under it.
     Twenty-seven years over 3,600 ms is 133 ms a year, which is under
     `STAGGER_TOTAL`, so the years land whole rather than in a wave — stated
     rather than hidden, and it is the rate and not the wave that is the
     constraint (§14.3). It was already under it at 5,400 ms and 200 ms a
     year, so the re-time in §25.2 changed the rate and not the behaviour. */
  "mission-bay": [
    { k: "run", ms: 3600, to: 2018, curve: "even" },
    { k: "build", ms: 900, what: "ring", ent: "mission-bay", curve: "settle" },
    { k: "hold", ms: 2400 },
  ],
  /* Out to the whole city, which is the frame the film opened on. */
  face: [
    { k: "run", ms: 1000, to: 2019, curve: "even" },
    { k: "hold", ms: 4600 },
  ],
};

// ── 3 · the timeline ────────────────────────────────────────────────────────

export type SegKind = "title" | "move" | "run" | "build" | "fire" | "hold" | "end";

export interface FilmSeg {
  readonly k: SegKind;
  readonly t0: number;
  readonly ms: number;
  readonly si?: number;
  readonly ai?: number;
  readonly a?: FilmAct;
  readonly yFrom: number;
  readonly yTo: number;
}

export interface FilmTimeline {
  readonly segs: readonly FilmSeg[];
  readonly total: number;
  /** each shot's start, so the arrow keys can step a whole shot */
  readonly shotT0: readonly number[];
  readonly shotEnd: readonly number[];
}

/**
 * One flat list of segments with absolute start times, so the state at any
 * millisecond is a LOOKUP and not a simulation. That is what makes a scrub land
 * on the same frame playback would have produced.
 *
 * ── THE YEAR LINE IS DERIVED HERE, AND IT IS MONOTONE ────────────────────────
 *
 * *"In the current film sometimes it jumps ahead in time then back again — it's
 * weird, the film has to lie linear in time."*
 *
 * It did, and it was one interval. `.parity/m1time.py` seeked the paused film
 * every 50 ms across all 134,000 of them and wrote down `(t, shot, seg, year)`:
 * 2,681 samples, **nine of them backward, all inside shot 7's 900 ms run, 1945
 * down to 1935**, after which shot 8 replayed 1935 → 1939. Nineteen thirty-six
 * to nineteen forty-five was shown forward, backward and forward again.
 *
 * The cause was structural rather than arithmetic. A shot opened on its
 * PAYLOAD's `y0` and closed on its acts, and nothing ever compared one shot's
 * closing year with the next one's opening year — so `camera.json`'s own
 * `"year": {"from": 1945, "to": 1935, "note": "hard cut back to 1935"}` went
 * through untouched. Two independent statements of the same quantity, and the
 * film believed both.
 *
 * There is now one. **A shot opens on the year the previous shot closed on**,
 * `SCRIPT`'s `run` acts are the only thing that moves it, and the whole segment
 * list is asserted non-decreasing before it is returned. The payload's `y0` and
 * `y1` are no longer read for the clock — only `shots[0].y0`, the year the film
 * opens on — so a future payload cannot reintroduce a rewind without this
 * function throwing and naming the shot.
 */
export function buildTimeline(d: FilmPayload): FilmTimeline {
  const segs: FilmSeg[] = [];
  const shotT0: number[] = [];
  const shotEnd: number[] = [];
  let t = d.runtime.titleMs;
  const y0 = d.shots[0].y0;
  segs.push({ k: "title", t0: 0, ms: d.runtime.titleMs, yFrom: y0, yTo: y0 });

  /* the year the NEXT shot opens on: the one the last one closed on */
  let open = y0;
  d.shots.forEach((s, si) => {
    const acts = SCRIPT[s.id];
    if (!acts) throw new Error(`film: no act script for shot ${s.id}`);
    const sum = (s.move || 0) + acts.reduce((a, x) => a + x.ms, 0);
    if (sum !== s.shot)
      throw new Error(
        `film: shot ${s.id} acts sum to ${sum} ms, the payload says ${s.shot}`,
      );
    shotT0.push(t);
    /* A MOVE CARRIES ITS YEAR. It did not, and `year = seg.yTo` on a segment
       that had never been given one printed **NaN** in the corner for the whole
       1.6–2.6 s of every camera move in the film — six of the ten moves, every
       run. Found by looking at a frame sequence, which is the only way it was
       ever going to be found: the film runs, nothing throws, and the year is not
       a number. The camera travels at the year the shot opens on, which is also
       the year the previous shot ended on — and now that is not two facts that
       have to agree, it is one number used twice. */
    if (s.move) {
      segs.push({ k: "move", t0: t, ms: s.move, si, yFrom: open, yTo: open });
      t += s.move;
    }
    let y = open;
    acts.forEach((a, ai) => {
      const yTo = a.k === "run" ? a.to : y;
      if (yTo < y)
        throw new Error(
          `film: shot ${s.id} act ${ai} runs the year BACKWARD, ${y} to ${yTo}`,
        );
      segs.push({ k: a.k, t0: t, ms: a.ms, si, ai, a, yFrom: y, yTo });
      y = yTo;
      t += a.ms;
    });
    open = y;
    shotEnd.push(t);
  });

  segs.push({ k: "end", t0: t, ms: d.runtime.endMs, yFrom: open, yTo: open });
  t += d.runtime.endMs;

  /* THE ASSERTION THE FILM DID NOT HAVE. `buildTimeline` already refuses a shot
     whose acts do not sum to its own running time; this is the same guarantee
     for the other axis. Every segment boundary, not only the shot boundaries,
     because a `run` act inside a shot is exactly where the rewind lived. */
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].yFrom < segs[i - 1].yTo) {
      const s = segs[i].si != null ? d.shots[segs[i].si!].id : segs[i].k;
      throw new Error(
        `film: the year goes BACKWARD at t=${segs[i].t0} (${s}): ` +
          `${segs[i - 1].yTo} then ${segs[i].yFrom}. The film has to be linear in time.`,
      );
    }
  }
  return { segs, total: t, shotT0, shotEnd };
}

/** Binary search: which segment is live at t. */
export function segAt(tl: FilmTimeline, t: number): number {
  let lo = 0;
  let hi = tl.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.segs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ── 4 · the camera ──────────────────────────────────────────────────────────

/** The LOD band a film zoom sits in. The thresholds are `camera.ts`'s BANDS
 *  read as z rather than as scale, which is what a keyframe is written in. */
export function bandOfZ(z: number): number {
  return z < 1.703 ? 0 : z < 4.569 ? 1 : 2;
}

export interface FilmFrame {
  readonly step: number;
  readonly scale: number;
  readonly cx: number;
  /** the ZEX-FREE half of the plane centre */
  readonly py: number;
  /** the ground elevation under the target, in metres */
  readonly gz: number;
}

export interface FitState {
  /** the scale at which the whole city fits the frame */
  readonly base: number;
  readonly bx: number;
  readonly by: number;
}

/**
 * THE ELEVATION TERM IS CARRIED SEPARATELY, and this is the one piece of
 * arithmetic in the file that is not obvious.
 *
 *     proj(x,y,z) = [ (x cosR − y sinR)·cA , (x sinR + y cosR)·sA + z·ZEX ]
 *
 * and ZEX is 3.3 at the whole city, 2.6 at district and 2.0 at block. So the
 * plane position of a fixed point ON THE GROUND MOVES when the LOD band
 * changes. A camera keyframe baked at one band is therefore wrong at the next,
 * and a move that crosses a band boundary — four of them do — would jump by
 * ΔZEX × elevation × scale at the crossing. Measured at the Twin Peaks portal
 * that is about 16 px.
 *
 * So a frame keeps `py` (the ZEX-free half) and `gz` (the ground elevation)
 * APART, the band's ZEX is applied per frame, and the residual at a crossing is
 * taken up as a bias that decays to zero over 250 ms. Nothing jumps, and nothing
 * drifts afterwards either, because the bias is DRIVEN to zero rather than
 * merely damped.
 */
export interface FilmFrames {
  /** the scale at which the whole city fits the frame; `z` is a multiple of it */
  readonly base: number;
  readonly frames: readonly FilmFrame[];
}

export function frameOf(
  s: FilmShotData,
  fit: FitState,
  proj: Projection,
  elev: (x: number, y: number) => number,
  W: number,
  H: number,
): FilmFrame {
  const step = bandOfZ(s.z);
  const scale = fit.base * s.z;
  let px: number;
  let py: number;
  let gz: number;
  if (s.wx !== undefined && s.wy !== undefined) {
    gz = elev(s.wx, s.wy);
    const c = proj.coeffs();
    px = c.ax * s.wx + c.ay * s.wy;
    py = c.bx * s.wx + c.by * s.wy;
  } else {
    /* the fitted frame. `fit.by` already carries its elevation term at
       ZEX_BY_STEP[0], and its band is 0, so the two are consistent by
       construction. */
    px = fit.bx;
    py = fit.by;
    gz = 0;
  }
  return {
    step,
    scale,
    cx: px - (s.ox * W) / scale,
    py: py - (s.oy * H) / scale,
    gz,
  };
}

// ── 5 · the state at t ──────────────────────────────────────────────────────

export interface RisenItem {
  readonly ent: string;
  readonly mode: BuildWhat;
  readonly rise: number;
}

export interface FilmLine {
  readonly copy?: string;
  readonly cite?: FilmCite;
  readonly links?: readonly FilmLink[];
  readonly also?: readonly FilmLink[];
  readonly note?: string;
  readonly kind?: "scan" | "data";
}

export interface FilmState {
  readonly t: number;
  readonly segIx: number;
  readonly seg: FilmSeg;
  readonly shot: number;
  readonly card: "title" | "end" | null;
  /**
   * How opaque that card is, 0..1 — **on the film's clock, not on a CSS
   * transition.**
   *
   * `CityFilm`'s card is mounted by `card ? … : null` and carries
   * `transition: opacity 420ms`, which never runs: an element removed from the
   * DOM does not transition out. B3's own frame sheet caught the symptom and
   * named the cause — *"the title card's wash is a step, not a fade. `CURVE.fade`
   * exists and this is not using it"* — three frames of a near-white city and
   * then the full-contrast 1906 frame with nothing in between at a 257 ms
   * shutter. It is the film's first gesture and it was a cut.
   *
   * A CSS transition could not have been right anyway: it runs on wall time, so
   * a scrub to the middle of the wash would land on whatever the browser
   * happened to be doing rather than on the frame playback produces. This is a
   * lookup like everything else in this file.
   *
   * Kept under `reduced` and under `spare`. A cross-fade is not vestibular —
   * `camera.json` §reduced_motion makes the same call for the year — and it
   * costs no rasterisation, because it is one DOM opacity.
   */
  readonly cardAlpha: number;
  /** the camera, already resolved: what the renderer is told to be */
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly step: number;
  readonly zex: number;
  /** the year the fabric is drawn at. Fractional only inside a run. */
  readonly year: number;
  /** THE YEAR THE PLATE PRINTS, which is not always the year the fabric is at.
   *  The fabric reads `year` and is untouched; this is a caption for the LINE.
   *  Pinned to the year the shot settles on unless the shot sets `yrun`.
   *  `build_film_twelve.py` §THE YEAR ON THE PLATE. */
  readonly plateYear: number;
  /** true while the year is moving — what drives the fabric's arrival wave */
  readonly running: boolean;
  /** how far through the current year's street cohort, 0..1 */
  readonly stEnter: number;
  readonly risen: readonly RisenItem[];
  /** 0..1, the 1906 burn hairline */
  readonly burn: number;
  /** 0..1, the Bay Bridge deck striking out from Rincon Hill */
  readonly bridge: number;
  /** 0..1, how much of the 1906 schedule of losses has been read */
  readonly fire: number;
  /**
   * 0..1, the burned GROUND — hot while the fire is running and then ash.
   *
   * It outlives its own shot, which is the point: shot 1 leaves the city
   * scorched and shot 2 opens on the identical frame, so the ash is what the
   * match cut is cut ON, and it fades out over the same 2,500 ms the burn
   * hairline does while the fabric fills back in underneath it.
   */
  readonly scorch: number;
  /** 0..1, the four streets a resolution names, stroking out */
  readonly outline: number;
  readonly line: FilmLine | null;
  readonly badge: string | null;
  /** footprint indices the FABRIC must not draw, because the film is raising
   *  them — see `hideFor` */
  readonly hide: readonly number[];
  /** the 2025 alignment of the one crossing this film dates */
  readonly skipBridgeGhost: boolean;
  /** 0..1 through the whole film, for the hairline */
  readonly progress: number;
}

/** Which objects are up, and how far, at t inside a shot. Walked from the
 *  shot's first act every time rather than accumulated, so a scrub is exact. */
function risenAt(
  tl: FilmTimeline,
  d: FilmPayload,
  si: number,
  segIx: number,
  u: number,
  reduced: boolean,
): { risen: RisenItem[]; burn: number; bridge: number; fire: number; outline: number } {
  const acts = SCRIPT[d.shots[si].id];
  const risen: RisenItem[] = [];
  let burn = 0;
  let bridge = 0;
  let fire = 0;
  let outline = 0;
  const here = tl.segs[segIx];
  for (let ai = 0; ai < acts.length; ai++) {
    const a = acts[ai];
    if (a.k !== "build" && a.k !== "fire") continue;
    const seg = tl.segs.find((x) => x.si === si && x.ai === ai);
    if (!seg) continue;
    let rise: number;
    if (here.t0 > seg.t0) rise = 1;
    else if (here.t0 < seg.t0) rise = 0;
    else rise = reduced ? 1 : curveOf(a.curve)(u);
    if (rise <= 0) continue;
    if (a.k === "fire") { fire = rise; continue; }
    if (a.what === "burnLine") { burn = rise; continue; }
    if (a.what === "bridge") { bridge = rise; continue; }
    if (a.what === "outline") { outline = rise; continue; }
    if (a.ent) risen.push({ ent: a.ent, mode: a.what, rise });
  }
  return { risen, burn, bridge, fire, outline };
}

/**
 * Which of a shot's lines is up. A shot has one by default; an act may swap to
 * the second, and the swap holds for the rest of the shot. Shot 4 goes City Hall
 * then the library; shot 8 goes the bridge then the island.
 *
 * A MOVE ARRIVES BEFORE ITS LINE DOES: the plate comes up as the camera stops,
 * not while it is still travelling.
 */
const NOT_ON_MAP: ReadonlySet<string> = new Set([
  "freeway-revolt-1959",
  "embarcadero-freeway-demolition",
]);

function pickLine(tl: FilmTimeline, d: FilmPayload, si: number, segIx: number): FilmLine | null {
  if (tl.segs[segIx].k === "move") return null;
  const s = d.shots[si];
  /* ── AND A LINE ABOUT A DATED EVENT WAITS FOR THE YEAR TO ARRIVE ──────
     The same idea as the move guard one line up. On a shot whose counter is
     still running toward the date the line is about, the plate would otherwise
     print a year in which the thing did not happen: MEASURED over the whole
     film, nine of the eleven lines were on screen while the counter crossed a
     span, and Daniel's own frame read 1987 over the 1989 earthquake.
     `build_film_twelve.py` §THE YEAR ON THE PLATE decides which shots set it. */
  if (s.say != null && (tl.segs[segIx].ai ?? -1) < s.say) return null;
  const acts = SCRIPT[s.id];
  const base: FilmLine = {
    copy: s.copy, cite: s.cite, links: s.links, also: s.also, note: s.note,
    kind: s.kind,
  };
  /* THE SECOND LINE IS THE PAYLOAD'S OWN, ALWAYS. It used to be able to come
     out of a `SPOKEN` table in this file — one line living a file upstream of
     where the other nineteen lived, because `camera.json` belonged to another
     block. `build_film_twelve.py` writes both lines and both citations through
     the same gate, so the table is gone and there is one place a line can come
     from again. */
  const alt: FilmLine | null =
    s.build2 && s.build2.copy
      ? { copy: s.build2.copy, cite: s.build2.cite, kind: "scan" }
      : null;
  let cur = base;
  for (let ai = 0; ai < acts.length; ai++) {
    const a = acts[ai];
    /* ANY act can turn the line over, not only a `build`. It used to be builds
       only, which meant a shot could not change what it was saying unless it
       was also raising something — and shot 7's second subject is raised by the
       FABRIC, on its own published year, not by the film. */
    if (a.line == null) continue;
    const seg = tl.segs.find((x) => x.si === si && x.ai === ai);
    if (!seg || tl.segs[segIx].t0 < seg.t0) continue;
    cur = a.line === 2 ? (alt ?? base) : base;
  }
  return cur;
}

/**
 * THE FABRIC MUST NOT ALREADY BE HOLDING WHAT THE FILM IS RAISING — and not
 * only while the rise is running, but for the WHOLE shot up to that point,
 * including the move into it.
 *
 * MEASURED: the secured roll dates City Hall's parcel **1906**, which is the
 * parcel and not the building — the dome was finished in 1915 and the record's
 * own item for it is the 1915 volume. So the fabric has been drawing that
 * footprint since the film's first frame, and without this the move into shot 4
 * arrives on a finished City Hall, deletes it, and rebuilds it. That reads as a
 * fault, not as construction. Hidden from the top of the shot instead, so the
 * block is empty when the camera stops and the building is the only thing that
 * happens on it.
 */
function hideFor(d: FilmPayload, si: number): number[] {
  const s = d.shots[si];
  const acts = SCRIPT[s.id];
  const out: number[] = [];
  for (const a of acts) {
    /* ONLY A `footprint` HIDES ANYTHING. A `placemark` is a dot and a name over
       a building the map is already drawing on its own published year, and
       hiding that building would delete the thing the mark points at — which
       is what happened to the Palace, the Opera House and the Pyramid before
       they were changed from `footprint` to `placemark`. */
    if (a.k !== "build" || !a.ent || a.what !== "footprint") continue;
    const e = d.ents[a.ent];
    if (e && e.bi !== undefined) out.push(e.bi);
  }
  return out;
}

/**
 * AND IT IS HIDDEN FOR THE WHOLE SHOT, NOT ONLY WHILE IT IS RISING.
 *
 * The mock lifted the hide the instant the rise finished, and that was right
 * there: its fabric draws the same prism the film draws, in the same place, so
 * handing the building back is invisible.
 *
 * It is NOT invisible here. Eleven of these footprints are HEROES — City Hall
 * among them, and City Hall is shot 4's subject — so the moment the hide lifted,
 * the drum, the dome, the ribs and the lantern came back UNDER the flat prism
 * the film had just finished raising, and the frame carried two drawings of one
 * building. Found by looking at `p5-13`.
 *
 * So the film's own mark is the only drawing of its subject for the length of
 * the shot, and `heroQueue` takes the same set. What that costs is stated
 * rather than hidden: at shot 4 City Hall is its published footprint extruded to
 * its measured height, and not the dome. Two drawings of one building is worse
 * than a plainer one.
 */
export function filmHidesForShot(d: FilmPayload, si: number): readonly number[] {
  return hideFor(d, si);
}

export interface FilmStateOpts {
  /** prefers-reduced-motion */
  readonly reduced?: boolean;
  /**
   * THIS MACHINE CANNOT PLAY THE FILM AT SPEED, so the film plays the version
   * it already has an authored answer for.
   *
   * MEASURED 2026-08-24 on the dev server — `.parity/b3fps.py`, `b3prof.py`,
   * `b3wall.py` and `b3seg.py`, and the tables in FILM.md §the frame rate. Two
   * separate costs, and the film is authored as though neither existed:
   *
   *   · a rasterisation taken while the CAMERA IS MOVING costs 0.6 to 1.2 s,
   *     two thirds of it `terrain.ts`'s `paintCell` and `fill`, because the
   *     ground plate keys on the camera and so misses on every frame of a move.
   *     A two-second travel gets three to seven drawn frames.
   *   · a RUN costs `YEAR_Q` = 16 rasterisations a year, which is what gives
   *     the fabric's arrival wave its steps. Measured per segment kind: runs
   *     are 56.1 s of the film and 172.2 s of the wall clock, x3.07.
   *
   * `CityFilm.tsx`'s clock clamps `dt` at 50 ms, so the film does not DROP
   * those frames, it STRETCHES. Measured end to end: 2 m 14 s of authored film
   * played in 4 m 29 s, x2.01.
   *
   * A travel drawn at four frames a second is not a travel, and a running year
   * whose sixteen steps take two seconds each is not a wave. The reduced-motion
   * path already answers exactly this — the camera cuts rather than travels and
   * the year lands in whole years on an otherwise still frame — and the answer
   * is the same when the reason is the machine rather than the reader. Reaching
   * for the version that is already authored, rather than inventing a second
   * fallback, is the whole of this flag.
   *
   * On the camera, `u` goes straight to 1: the camera lands on the incoming
   * frame at the HEAD of the move and the move's remaining milliseconds are a
   * still hold on it, so the running time and the copy timing are exactly as
   * authored and the incoming frame gets its rasterisation before any copy
   * appears on it.
   *
   * The shell decides this from frames it has actually drawn; nothing here
   * measures anything. See `CityFilm.tsx` §THE VERSION THE MACHINE CAN PLAY.
   */
  readonly spare?: boolean;
  /**
   * ── AND THE TWO COSTS ARE NOT ONE VERDICT ────────────────────────────────
   *
   * `spare` above names two separate costs and then throws away both together
   * on one number. They do not fail together. A rasterisation taken mid-travel
   * costs 0.6–1.2 s because the ground plate misses on every frame of a move; a
   * run costs a rasterisation per `YEAR_Q` step of the year on a camera that is
   * standing still and hitting the plate every time. One is the ground being
   * repainted under a moving camera, the other is the fabric changing under a
   * fixed one.
   *
   * MEASURED, `.parity/m1keep.py`, this machine: after the year is pinned once
   * nothing reads it (§filmStateAt), shot 2's run halves its rasterisation rate
   * and `keepUp` climbs back to **0.99 by the end of the run** — while the
   * first travel, on the same playthrough, sits at **0.16**. This machine can
   * draw the wave and cannot draw the travels, and one flag could only tell it
   * to give up both.
   *
   * So they are judged apart, each on its own segments. `spare` still means
   * both, which is what a caller with one verdict wants and what the tests
   * assert; `spareCamera` and `spareWave` are the halves.
   *
   * A cut camera with a running year is not a new invention: it is exactly the
   * shape `camera.json` §reduced_motion argues for — *"a year going from 1924
   * to 1925 while the camera is still is not vestibular"* — and it is the half
   * of the film Daniel named: **a build wave sweeping a district rather than
   * buildings blinking on.**
   */
  readonly spareCamera?: boolean;
  /** the years land whole and the arrival wave never starts. See `spareCamera`. */
  readonly spareWave?: boolean;
  /** carried from the previous frame; see `frameOf`'s band note */
  readonly cyBias?: number;
  /**
   * THE GROUND EXAGGERATION THE SHELL IS ACTUALLY DRAWING AT.
   *
   * `ZEX_BY_STEP` is the ladder, and the film's own arithmetic above is written
   * against it — but the film may not ASSUME the shell is on it. MEASURED in the
   * landed shell: `projection.setBand()` exists and nothing calls it, so the
   * buildings' ground term runs at `ZEX_BY_STEP[0]` = 3.3 at every band while
   * each band's `TerrainField` carries its own. A film that computed its camera
   * from the ladder and handed it to a renderer drawing at 3.3 would land the
   * target metres off the thing it is pointing at, and it would do it silently.
   *
   * So the film reads the number the renderer is using. Default is the ladder,
   * which is what a unit test wants; the shell passes `() => projection.zex`.
   * See FILM.md §what needs a different shape.
   */
  readonly zexFor?: (step: number) => number;
}

/**
 * The whole film at one millisecond. Pure: it reads the timeline and the frames
 * and returns a value. Nothing here writes a camera, a canvas or a DOM node.
 */
export function filmStateAt(
  d: FilmPayload,
  tl: FilmTimeline,
  ff: FilmFrames,
  tRaw: number,
  opts: FilmStateOpts = {},
): FilmState {
  const frames = ff.frames;
  const reduced = !!opts.reduced;
  /* `spare` is both halves; see FilmStateOpts §the two costs are not one verdict */
  const spareCam = !!(opts.spare || opts.spareCamera);
  const spareWav = !!(opts.spare || opts.spareWave);
  const t = Math.max(0, Math.min(tl.total, tRaw));
  const ix = segAt(tl, t);
  const sg = tl.segs[ix];
  const u0 = sg.ms > 0 ? Math.max(0, Math.min(1, (t - sg.t0) / sg.ms)) : 1;
  const si = sg.si ?? (sg.k === "title" ? 0 : d.shots.length - 1);
  const s = d.shots[si];

  // ── camera ────────────────────────────────────────────────────────────────
  let A: FilmFrame;
  let B: FilmFrame;
  let u: number;
  if (sg.k === "move") {
    A = si > 0 ? frames[si - 1] : frames[si];
    B = frames[si];
    u = reduced || spareCam ? 1 : curveOf(s.curve)(u0);
  } else if (sg.k === "title") {
    A = B = frames[0];
    u = 1;
  } else {
    A = B = frames[si];
    u = 1;
  }
  /* SCALE IS INTERPOLATED IN LOG SPACE. A 3.2× → 28× zoom lerped linearly
     spends most of its time near the far end and reads as fast-then-crawl;
     geometric interpolation is a constant PERCEIVED zoom rate, which is the
     only kind the eye has. It is also the most common way an automated camera
     looks wrong. */
  const scale = A.scale * Math.pow(B.scale / A.scale, u);
  const step = bandOfZ(ff.base > 0 ? scale / ff.base : 1);
  const zex = (opts.zexFor ?? ((k: number) => ZEX_BY_STEP[k]))(step);
  const gz = A.gz + (B.gz - A.gz) * u;
  const bias = opts.cyBias ?? 0;
  const cx = A.cx + (B.cx - A.cx) * u;
  const cy = A.py + (B.py - A.py) * u + zex * gz + bias;

  // ── the year ──────────────────────────────────────────────────────────────
  let year: number;
  if (sg.k === "run") {
    if (reduced || spareWav) {
      /* ── REDUCED MOTION IS NOT REDUCED HISTORY ────────────────────────
         Pinning a run at its end value put shot 2 at 1912 for its whole twelve
         seconds, shot 6 at 1945, shot 9 at 1966 and shot 10 at 2018 — four of
         the ten shots, including the strongest in the film, with the change
         they exist to show removed. That is not an accessible version of this
         piece, it is the piece with its subject taken out.
         What `prefers-reduced-motion` asks for is the removal of VESTIBULAR
         motion: large-field travel, zoom, parallax. A camera flying across the
         city is vestibular. A year going from 1924 to 1925, and forty houses
         appearing where they stand, is not. So the camera cuts rather than
         travels, the landmarks arrive whole rather than growing, the accepted
         streets land whole rather than stroking out — and the year still runs,
         quantised to whole years, with `running` false so the fabric's
         fractional arrival wave never starts. Each year appears complete, on an
         otherwise still frame. */
      const span = sg.yTo - sg.yFrom;
      year = sg.yFrom + Math.min(span, Math.floor(span * u0));
    } else {
      const a = sg.a as Extract<FilmAct, { k: "run" }>;
      year = sg.yFrom + (sg.yTo - sg.yFrom) * curveOf(a.curve)(u0);
    }
  } else if (sg.k === "title" || sg.k === "end") {
    /* off the SEGMENT and not off the payload's `y0`/`y1`, which are no longer
       the film's clock — see `buildTimeline` §the year line is derived here */
    year = sg.yTo;
  } else {
    year = sg.yTo;
  }
  const running =
    sg.k === "run" &&
    !reduced &&
    !spareWav &&
    sg.yTo > sg.yFrom &&
    waveFits(sg.yTo - sg.yFrom, sg.ms);
  const iy = Math.floor(year + (running ? 0 : 0.0001));
  /* Outside a run the year is pinned at iy + 0.999 with `running` false, which
     is what tells the renderer "everything built by this year is simply there".
     Inside a run the fractional year drives the fabric's own arrival wave — the
     one already tuned to stagger far-to-near with a per-building jitter.
     Nothing here re-implements it.

     ── AND IT IS PINNED AGAIN AS SOON AS NOTHING IS READING IT ────────────
     `renderer.ts` §contentKey quantises this year to `YEAR_Q` = 16 steps, so a
     run costs SIXTEEN rasterisations a year — FILM.md §6b measures that at
     ~2,100 rasterisations and 172 s of wall clock across the film's runs, and
     it is the single largest cost in the piece.

     Only the first `YEAR_LIVE` of a year is read by anything. The arrival wave
     is over at `RISE_WIN` (0.385) and the year's street acceptances are drawn
     in by 0.55; past that the fabric is byte-identical until the next integer.
     Handing out the raw fraction anyway moved the content key seven more times
     a year and repainted the same frame each time.

     So the year goes out pinned once the year's own motion is finished, which
     takes a run from sixteen rasterisations a year to nine. **Nothing on screen
     changes**: `scene.ts`'s `risePhase` reads `iy + 0.999` as `f >= RISE_WIN`,
     which is the cohort fully risen, exactly what it computed from the raw
     fraction at that point. `stEnter` below keeps using the true fraction,
     because it is this file's own number and never goes through the key. */
  const frac = year - iy;
  const yearOut = running && frac < YEAR_LIVE ? year : iy + 0.999;

  // ── the accepted streets ──────────────────────────────────────────────────
  let stEnter = 1;
  if (running && !reduced) {
    /* the year's acceptances draw over the first 55 % of that year's passage,
       so they are finished and settled before the next year opens */
    stEnter = Math.max(0, Math.min(1, frac / ST_ENTER_WIN));
  }

  // ── what is rising ────────────────────────────────────────────────────────
  const r = sg.si != null
    ? risenAt(tl, d, si, ix, u0, reduced)
    : { risen: [], burn: 0, bridge: 0, fire: 0, outline: 0 };
  let burn = r.burn;
  /* shot 2 holds the hairline up and then takes it down on its own clock */
  if (sg.k === "run" && (sg.a as Extract<FilmAct, { k: "run" }>).burn) {
    const [b0, b1, st, ms] = (sg.a as Extract<FilmAct, { k: "run" }>).burn!;
    const tt = t - sg.t0;
    burn =
      tt <= st ? b0
      : tt >= st + ms ? b1
      : b0 + (b1 - b0) * CURVE.fade(Math.max(0, Math.min(1, (tt - st) / ms)));
  } else if (sg.si != null && s.n >= 3) {
    burn = 0;
  } else if (sg.si != null && si === 0 && sg.k !== "build") {
    burn = 1;
  }

  const line = sg.k === "title" ? null : sg.k === "end" ? null : pickLine(tl, d, si, ix);

  /* ── THE YEAR THE PLATE PRINTS ────────────────────────────────────────
     Off the TIMELINE and not off the payload, for the same reason §buildTimeline
     stopped reading `y0`/`y1`: the year a shot settles on is the last `yTo` its
     own acts reach, so this cannot drift from the clock that produced it. */
  let plateYear = Math.floor(yearOut);
  const pshot = sg.si != null ? d.shots[sg.si] : null;
  if (pshot?.pin != null) {
    /* STATED, and it beats both branches below. See §FilmShot.pin. Shot 9's
       sentence names two EVENTS a year apart and no year at all, so no reading
       of the counter captions it; the plate carries the shot's subject — the
       earthquake — and the fabric runs on underneath. */
    plateYear = pshot.pin;
  } else if (pshot && !pshot.yrun) {
    let sy = -1;
    for (const q of tl.segs) if (q.si === sg.si && q.yTo > sy) sy = q.yTo;
    if (sy > 0) plateYear = sy;
  }

  /* the 2025 alignment of the one crossing this film dates: the base street
     layer is the 2025 map at every year, and the Bay Bridge deck is in it. So
     shot 8 — whose entire subject is the bridge ARRIVING in 1936 — was a line
     that got darker rather than a line that appeared. The ghost is skipped on
     the FILM CLOCK and not on the year, because the year reaches 1936 before the
     build act runs and the ghost would beat the film to its own subject. */
  const bridgeSeg = tl.segs.find(
    (x) => x.a && x.a.k === "build" && x.a.what === "bridge",
  );
  const brEnd = bridgeSeg ? bridgeSeg.t0 + bridgeSeg.ms : -1;

  return {
    t,
    segIx: ix,
    seg: sg,
    shot: si,
    card: sg.k === "title" ? "title" : sg.k === "end" ? "end" : null,
    /* the title washes OUT over its last `CARD_WASH` ms, so the 1906 city comes
       up under the words; the end card washes IN over its first. Both on
       `CURVE.fade`, which was already in this file and read by one call. */
    cardAlpha:
      sg.k === "title"
        ? 1 -
          CURVE.fade(
            Math.max(0, Math.min(1, (t - sg.t0 - (sg.ms - CARD_WASH)) / CARD_WASH)),
          )
        : sg.k === "end"
          ? CURVE.fade(Math.max(0, Math.min(1, (t - sg.t0) / CARD_WASH)))
          : 0,
    cx, cy, scale, step, zex,
    year: yearOut,
    plateYear,
    running,
    stEnter,
    risen: r.risen,
    burn,
    bridge: r.bridge,
    fire: r.fire,
    /* shot 1 burns it, shot 2 lets it cool on the hairline's own clock, and
       nothing after shot 2 carries it */
    scorch: sg.si == null ? 0 : si === 0 ? r.fire : si === 1 ? burn : 0,
    outline: r.outline,
    line,
    /* THE BADGE FOLLOWS THE LINE, NOT THE SHOT, so a shot with two subjects
       can carry it on one of them. It is on three of the eleven and each is a
       different KIND of absence, all three published:

         freeway-revolt-1959      the corridors are "NOT IN RECORD as
                                  geometry" — the resolution names seven routes
                                  and no alignment for any is published here
         embarcadero-freeway-…    the fabric is the assessor's roll, which
                                  dates what is standing, so a structure taken
                                  down in 1991 is in no year of this map
       Shot 11 was given it too and it was WRONG on the frame: an ordinance
       forbidding a thing has no extent, but the shot's picture is the whole
       city, and a badge reading "not on this map" over a frame that is
       entirely the map says the opposite of what it means. Taken off after
       looking at `out-m1c/watch-sweep-022.png`. */
    badge: sg.k !== "move" && NOT_ON_MAP.has(line?.cite?.entity ?? "")
      ? "notOnThisMap"
      : null,
    hide: sg.si != null ? hideFor(d, si) : [],
    skipBridgeGhost: brEnd >= 0 && t < brEnd,
    progress: tl.total > 0 ? t / tl.total : 0,
  };
}

// ── 6 · the buffer plan ─────────────────────────────────────────────────────

/** ms of trajectory a single buffer is asked to hold.
 *
 * MEASURED 2026-08-24, `.parity/b3win.py`, five camera moves at 460 / 900 /
 * 1600 / 2600 ms: **the raster count does not move.** Two to five per move at
 * every setting, because the binding constraint is not the window — it is
 * `EXT_K_MAX`, and a move that changes scale by 8.75x cannot be held in one
 * buffer at any window length. The shipped 460 is kept for that reason. */
export const EXT_WIN = 460;
/** trajectory samples per plan */
export const EXT_SAMP = 6;

/**
 * DEV-ONLY, the same idiom as `terrain.ts`'s `__cityWA` and `camera.ts`'s
 * `__cityFDIALS`. The two numbers that decide HOW MANY TIMES a camera move
 * rasterises, and a rasterisation is a frozen frame of about a second (§the
 * frame rate). They are a sharpness-against-freezes trade and the only way to
 * choose between them is to run the film at each and count rAF.
 */
export const FWIN: { win: number; k: number } = { win: EXT_WIN, k: 0 };
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityFWIN?: typeof FWIN }).__cityFWIN = FWIN;
}

export interface BufferPlan {
  readonly scale: number;
  readonly cx: number;
  readonly cy: number;
}

/** The camera at film time t, with NO side effects and none of the rest of the
 *  state — the same arithmetic `filmStateAt` runs, read-only, so a plan can look
 *  into the future without moving anything. */
function camAt(
  d: FilmPayload,
  tl: FilmTimeline,
  ff: FilmFrames,
  t: number,
  bias0: number,
  tNow: number,
  zexFor: (step: number) => number,
): { scale: number; step: number; cx: number; cy: number } {
  const frames = ff.frames;
  const ix = segAt(tl, t);
  const sg = tl.segs[ix];
  const u0 = sg.ms > 0 ? Math.max(0, Math.min(1, (t - sg.t0) / sg.ms)) : 1;
  const si = sg.si ?? (sg.k === "title" ? 0 : d.shots.length - 1);
  let A: FilmFrame;
  let B: FilmFrame;
  let u: number;
  if (sg.k === "move") {
    A = si > 0 ? frames[si - 1] : frames[si];
    B = frames[si];
    u = curveOf(d.shots[si].curve)(u0);
  } else if (sg.k === "title") {
    A = B = frames[0];
    u = 1;
  } else {
    A = B = frames[si];
    u = 1;
  }
  const scale = A.scale * Math.pow(B.scale / A.scale, u);
  const step = bandOfZ(ff.base > 0 ? scale / ff.base : 1);
  /* cyBias is carried through its own decay — the same pow(0.02, dt/250) the
     clock applies — because a band crossing is exactly when a prediction that
     ignored it would be wrong. */
  const bias = bias0 ? bias0 * Math.pow(0.02, Math.max(0, t - tNow) / 250) : 0;
  return {
    scale,
    step,
    cx: A.cx + (B.cx - A.cx) * u,
    cy: A.py + (B.py - A.py) * u + zexFor(step) * (A.gz + (B.gz - A.gz) * u) + bias,
  };
}

/**
 * ONE BUFFER THAT COVERS EVERY FRAME FROM NOW TO NOW + WINDOW.
 *
 * Within a LOD band the projection is a pure similarity transform, so one
 * `drawImage` of a buffer painted at camera A is EXACTLY the frame camera B
 * would have painted — not an approximation of it. `camera.ts`'s own header
 * states that fact and the whole gesture system already rests on it; nothing in
 * it cares who moved the camera.
 *
 * WHAT A FILM ADDS THAT A GESTURE CANNOT. A finger's next position is a guess,
 * so the gesture path leads the buffer off the pan velocity and re-rasterises
 * whenever that guess runs out. **A film's next position is KNOWN.** This walks
 * the actual trajectory over the next window, takes the union of the viewports
 * it will ask for, and returns one buffer that covers all of them — so a
 * rasterisation is spent only when the geometry says the last one has genuinely
 * run out, and a two-second move costs a handful instead of one per frame.
 *
 * Two bounds meet in the middle: coverage wants the scale LOW (more world in the
 * same pixels) and sharpness wants it HIGH (a buffer magnified past `EXT_K_MAX`
 * is soft). Where they cannot both be met the window is SHORTENED until they
 * can, which is what makes a fast move pay for more rasterisations than a slow
 * one instead of showing a stretched image. The window is also cut at a band
 * change: ZEX moves there, `proj()` moves with it, and no blit can cross that.
 */
export function planFilmBuffer(
  d: FilmPayload,
  tl: FilmTimeline,
  ff: FilmFrames,
  t: number,
  cur: { cx: number; cy: number; scale: number; step: number },
  bw: number,
  bh: number,
  W: number,
  H: number,
  kMax: number,
  cyBias = 0,
  zexFor: (step: number) => number = (k) => ZEX_BY_STEP[k],
): BufferPlan {
  const sg = tl.segs[segAt(tl, t)];
  const tEnd = sg.k === "move" ? sg.t0 + sg.ms : t;
  const step0 = cur.step;
  const kCap = FWIN.k > 0 ? FWIN.k : kMax;
  let win = Math.min(FWIN.win, Math.max(0, tEnd - t));
  for (let it = 0; it < 8; it++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, smax = 0;
    let bad = false;
    for (let k = 0; k <= EXT_SAMP; k++) {
      const c = camAt(d, tl, ff, t + (win * k) / EXT_SAMP, cyBias, t, zexFor);
      if (c.step !== step0) { bad = true; break; }
      const hw = W / 2 / c.scale;
      const hh = H / 2 / c.scale;
      if (c.cx - hw < x0) x0 = c.cx - hw;
      if (c.cx + hw > x1) x1 = c.cx + hw;
      if (c.cy - hh < y0) y0 = c.cy - hh;
      if (c.cy + hh > y1) y1 = c.cy + hh;
      if (c.scale > smax) smax = c.scale;
    }
    if (!bad) {
      const cover = Math.min(bw / (x1 - x0), bh / (y1 - y0));
      if (cover >= smax / kCap || win < 40)
        return { scale: Math.min(cover, smax), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    win *= 0.55;
  }
  return { scale: cur.scale, cx: cur.cx, cy: cur.cy };
}

// ── 7 · the accepted streets ────────────────────────────────────────────────

export interface YearBand {
  readonly y: number;
  /** [i, j) into the segment arrays */
  readonly i: number;
  readonly j: number;
}

/** year → the contiguous run of segments accepted in it. The payload is sorted
 *  by year, so "everything accepted by 1930" is one run and not a filter. */
export function yearBands(st: FilmStreets): YearBand[] {
  const out: YearBand[] = [];
  let i = 0;
  while (i < st.n) {
    const y = st.y[i];
    let j = i;
    while (j < st.n && st.y[j] === y) j++;
    out.push({ y, i, j });
    i = j;
  }
  return out;
}

/** How many of the 2,051 are drawn by this year. */
export function acceptedThrough(bands: readonly YearBand[], iy: number): number {
  let n = 0;
  for (const b of bands) {
    if (b.y > iy) break;
    n += b.j - b.i;
  }
  return n;
}

export interface StreetSourceRow {
  readonly vol: string;
  readonly leaf: number;
  readonly n: number;
  readonly url: string;
}

/**
 * What the reader is shown when they STOP on a year the record accepted
 * something in: the volume and the leaf of that vote, click-through.
 *
 * This is the rule the whole piece runs on — **the film shows you one thing,
 * and stopping gives you the record behind it.**
 */
export function streetSourceAt(
  st: FilmStreets,
  bands: readonly YearBand[],
  iy: number,
): { n: number; rows: StreetSourceRow[] } | null {
  const band = bands.find((b) => b.y === iy);
  if (!band) return null;
  const seen = new Map<string, { vol: string; leaf: number; n: number }>();
  for (let s = band.i; s < band.j; s++) {
    const key = `${st.vi[s]}:${st.leaf[s]}`;
    let row = seen.get(key);
    if (!row) {
      row = { vol: st.vols[st.vi[s]], leaf: st.leaf[s], n: 0 };
      seen.set(key, row);
    }
    row.n++;
  }
  const rows = [...seen.values()]
    .sort((a, b) => b.n - a.n || a.vol.localeCompare(b.vol) || a.leaf - b.leaf)
    .map((r) => ({
      ...r,
      url: `https://archive.org/details/${r.vol}/page/n${r.leaf}/mode/1up`,
    }));
  return { n: band.j - band.i, rows };
}

/**
 * THE VOLUME AS A READER WOULD SAY IT, NOT AS A FILENAME.
 *
 * The corpus names its volumes two ways and they mean different things:
 * `journalofproceed01sanfrich` is volume 1, `journalofproceed1912sanfrich` is
 * the 1912 volume. Reading the second as a volume number put **JOURNAL OF
 * PROCEEDINGS, VOL. 1914** on screen under a 1914 quote, which is wrong and also
 * reads as a bug. Four digits in the 19xx range is a year.
 */
export function volumeLabel(item: string): string {
  const m = /^journalofproceed(\d+)sanfrich$/.exec(item);
  if (m) {
    const n = Number(m[1]);
    return m[1].length === 4 && n >= 1900 && n <= 2000
      ? `Journal of Proceedings, ${n}`
      : `Journal of Proceedings, vol. ${n}`;
  }
  if (/^annualreportbu/.test(item)) return "Board of Public Works annual report";
  return item;
}
