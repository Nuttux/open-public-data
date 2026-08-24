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
export const STAGGER_JITTER = 0.18;
/** the fraction of a year the cohort rises over */
export const RISE_WIN = 0.385;
/** how much of that window is spent staggering */
export const RISE_LEAD = 0.55;

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
}

export type BuildWhat = "burnLine" | "ring" | "footprint" | "placemark" | "bridge";

export interface FilmBuildData {
  readonly what: BuildWhat;
  readonly entity?: string | null;
  readonly ms: number;
  readonly curve: string;
  readonly gate?: number;
  readonly copy?: string;
  readonly cite?: FilmCite;
  /** the Bay Bridge west span, world decimetres */
  readonly w?: readonly (readonly (readonly number[])[])[];
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
  readonly build?: FilmBuildData;
  readonly build2?: FilmBuildData;
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

export interface FilmPayload {
  readonly meta: Record<string, string>;
  readonly runtime: {
    readonly titleMs: number;
    readonly endMs: number;
    readonly shotsMs: number;
    readonly totalMs: number;
  };
  readonly title: { readonly head: string; readonly sub: string };
  readonly end: { readonly head: string; readonly sub: string };
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
      readonly burn?: readonly [number, number, number, number] }
  | { readonly k: "build"; readonly ms: number; readonly what: BuildWhat;
      readonly ent?: string; readonly curve: string; readonly line?: 1 | 2 }
  | { readonly k: "hold"; readonly ms: number };

export const SCRIPT: Readonly<Record<string, readonly FilmAct[]>> = {
  burn: [
    { k: "build", ms: 1400, what: "burnLine", curve: "enter" },
    { k: "hold", ms: 7000 },
  ],
  rebuild: [
    /* the burn hairline stays up at half alpha for the first three years and
       then goes, so the rebuild is watched happening INSIDE it */
    { k: "run", ms: 12000, to: 1912, curve: "move", burn: [1, 0, 4000, 2500] },
  ],
  "civic-bonds": [
    { k: "build", ms: 900, what: "ring", ent: "civic-center", curve: "settle" },
    { k: "hold", ms: 5600 },
  ],
  "city-hall": [
    { k: "run", ms: 900, to: 1915, curve: "move" },
    /* `footprint`, not `ring`: a precision disc would put the geocoder's own
       507 m radius round the block, and at z 28 that disc is the whole frame —
       a ring the size of Civic Center drawn round one building is a claim about
       the wrong thing. The published footprint IS the precision here, because
       the record names the parcel. */
    { k: "build", ms: 3000, what: "footprint", ent: "new-city-hall", curve: "settle" },
    { k: "hold", ms: 2000 },
    { k: "run", ms: 700, to: 1917, curve: "move" },
    { k: "build", ms: 2400, what: "footprint", ent: "main-library-1917", curve: "settle", line: 2 },
    { k: "hold", ms: 1600 },
  ],
  tunnel: [
    { k: "run", ms: 1600, to: 1918, curve: "move" },
    { k: "build", ms: 700, what: "placemark", ent: "twin-peaks-tunnel", curve: "settle" },
    { k: "hold", ms: 4200 },
  ],
  "west-fills": [{ k: "run", ms: 16000, to: 1945, curve: "move" }],
  "hetch-hetchy": [
    /* The camera pulls back at 1945 and the year steps BACK to 1935 on the
       settled frame. The renderer is a pure function of the year, so a step back
       really does un-build the 1936–45 cohorts — and it reads as a rewind rather
       than as a fault because the year on screen is counting down while it
       happens. Pretending otherwise (a 1935 label over a 1945 city) would be the
       map saying something untrue. */
    { k: "run", ms: 900, to: 1935, curve: "move" },
    { k: "hold", ms: 7100 },
  ],
  "treasure-island": [
    { k: "run", ms: 1000, to: 1936, curve: "move" },
    { k: "build", ms: 1600, what: "bridge", curve: "travel", line: 2 },
    { k: "hold", ms: 1200 },
    { k: "run", ms: 1500, to: 1939, curve: "move" },
    { k: "build", ms: 900, what: "ring", ent: "treasure-island", curve: "settle", line: 1 },
    { k: "hold", ms: 4500 },
  ],
  "yerba-buena": [
    { k: "run", ms: 3400, to: 1966, curve: "move" },
    { k: "build", ms: 900, what: "ring", ent: "yerba-buena", curve: "settle" },
    { k: "hold", ms: 2200 },
  ],
  "to-now": [
    { k: "run", ms: 18000, to: 2018, curve: "move" },
    { k: "hold", ms: 6000 },
  ],
};

// ── 3 · the timeline ────────────────────────────────────────────────────────

export type SegKind = "title" | "move" | "run" | "build" | "hold" | "end";

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
 */
export function buildTimeline(d: FilmPayload): FilmTimeline {
  const segs: FilmSeg[] = [];
  const shotT0: number[] = [];
  const shotEnd: number[] = [];
  let t = d.runtime.titleMs;
  segs.push({ k: "title", t0: 0, ms: d.runtime.titleMs, yFrom: d.shots[0].y0, yTo: d.shots[0].y0 });

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
       the year the previous shot ended on. */
    if (s.move) {
      segs.push({ k: "move", t0: t, ms: s.move, si, yFrom: s.y0, yTo: s.y0 });
      t += s.move;
    }
    let y = s.y0;
    acts.forEach((a, ai) => {
      const yTo = a.k === "run" ? a.to : y;
      segs.push({ k: a.k, t0: t, ms: a.ms, si, ai, a, yFrom: y, yTo });
      y = yTo;
      t += a.ms;
    });
    shotEnd.push(t);
  });

  const last = d.shots[d.shots.length - 1];
  segs.push({ k: "end", t0: t, ms: d.runtime.endMs, yFrom: last.y1, yTo: last.y1 });
  t += d.runtime.endMs;
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
  readonly kind?: "scan" | "data";
}

export interface FilmState {
  readonly t: number;
  readonly segIx: number;
  readonly seg: FilmSeg;
  readonly shot: number;
  readonly card: "title" | "end" | null;
  /** the camera, already resolved: what the renderer is told to be */
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly step: number;
  readonly zex: number;
  /** the year the fabric is drawn at. Fractional only inside a run. */
  readonly year: number;
  /** true while the year is moving — what drives the fabric's arrival wave */
  readonly running: boolean;
  /** how far through the current year's street cohort, 0..1 */
  readonly stEnter: number;
  readonly risen: readonly RisenItem[];
  /** 0..1, the 1906 burn hairline */
  readonly burn: number;
  /** 0..1, the Bay Bridge deck striking out from Rincon Hill */
  readonly bridge: number;
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
): { risen: RisenItem[]; burn: number; bridge: number } {
  const acts = SCRIPT[d.shots[si].id];
  const risen: RisenItem[] = [];
  let burn = 0;
  let bridge = 0;
  const here = tl.segs[segIx];
  for (let ai = 0; ai < acts.length; ai++) {
    const a = acts[ai];
    if (a.k !== "build") continue;
    const seg = tl.segs.find((x) => x.si === si && x.ai === ai);
    if (!seg) continue;
    let rise: number;
    if (here.t0 > seg.t0) rise = 1;
    else if (here.t0 < seg.t0) rise = 0;
    else rise = reduced ? 1 : curveOf(a.curve)(u);
    if (rise <= 0) continue;
    if (a.what === "burnLine") { burn = rise; continue; }
    if (a.what === "bridge") { bridge = rise; continue; }
    if (a.ent) risen.push({ ent: a.ent, mode: a.what, rise });
  }
  return { risen, burn, bridge };
}

/**
 * Which of a shot's lines is up. A shot has one by default; an act may swap to
 * the second, and the swap holds for the rest of the shot. Shot 4 goes City Hall
 * then the library; shot 8 goes the bridge then the island.
 *
 * A MOVE ARRIVES BEFORE ITS LINE DOES: the plate comes up as the camera stops,
 * not while it is still travelling.
 */
function pickLine(tl: FilmTimeline, d: FilmPayload, si: number, segIx: number): FilmLine | null {
  if (tl.segs[segIx].k === "move") return null;
  const s = d.shots[si];
  const acts = SCRIPT[s.id];
  const base: FilmLine = { copy: s.copy, cite: s.cite, links: s.links, kind: s.kind };
  const alt: FilmLine | null =
    s.build2 && s.build2.copy
      ? { copy: s.build2.copy, cite: s.build2.cite, kind: "scan" }
      : null;
  let cur = s.id === "treasure-island" ? (alt ?? base) : base; // the bridge opens shot 8
  for (let ai = 0; ai < acts.length; ai++) {
    const a = acts[ai];
    if (a.k !== "build" || a.line == null) continue;
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
    if (a.k !== "build" || !a.ent) continue;
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
    u = reduced || opts.spare ? 1 : curveOf(s.curve)(u0);
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
    if (reduced || opts.spare) {
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
  } else if (sg.k === "title") {
    year = d.shots[0].y0;
  } else if (sg.k === "end") {
    year = d.shots[d.shots.length - 1].y1;
  } else {
    year = sg.yTo;
  }
  const running = sg.k === "run" && !reduced && !opts.spare && sg.yTo > sg.yFrom;
  const iy = Math.floor(year + (running ? 0 : 0.0001));
  /* Outside a run the year is pinned at iy + 0.999 with `running` false, which
     is what tells the renderer "everything built by this year is simply there".
     Inside a run the fractional year drives the fabric's own arrival wave — the
     one already tuned to stagger far-to-near with a per-building jitter.
     Nothing here re-implements it. */
  const yearOut = running ? year : iy + 0.999;

  // ── the accepted streets ──────────────────────────────────────────────────
  let stEnter = 1;
  if (running && !reduced) {
    /* the year's acceptances draw over the first 55 % of that year's passage,
       so they are finished and settled before the next year opens */
    stEnter = Math.max(0, Math.min(1, (year - iy) / 0.55));
  }

  // ── what is rising ────────────────────────────────────────────────────────
  const r = sg.si != null ? risenAt(tl, d, si, ix, u0, reduced) : { risen: [], burn: 0, bridge: 0 };
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
    cx, cy, scale, step, zex,
    year: yearOut,
    running,
    stEnter,
    risen: r.risen,
    burn,
    bridge: r.bridge,
    line,
    badge: s && s.id === "hetch-hetchy" && sg.k !== "move" ? "notOnThisMap" : null,
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
