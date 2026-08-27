/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/film.ts — THE SCRIPTED CAMERA.

   The map is a browsable city and it directs the eye nowhere. A film is what
   fixes that: a fixed sequence of framings, one subject at a time, with the
   century running underneath. This is the PLAYER — the clock, the
   interpolation and the interrupt. It is not the film.

   ── IT CARRIES NO CITY, WHICH IS THE POINT ────────────────────────────────
   A shot list is a set of coordinates in one city's own world metres and a
   set of years out of one city's own record, so it is DATA and it arrives as
   a parameter. `FilmScript` is the shape; the values live in the city's
   descriptor or in the mount that builds it. `engine-is-city-free.test.ts`
   greps this directory and would fail if a single one of them appeared here.

   ── PORTED, NOT INVENTED ──────────────────────────────────────────────────
   Every rule below is read out of the Canvas film that is already published —
   `src/lib/city/film.ts` and the payload it plays, `public/data/us/sf/city/
   film/film.json`. Nothing here is a new piece of motion design. What is NOT
   ported is stated at the bottom of this comment rather than left to be
   discovered.

   The four rules that survived the port whole:

   1. THE CAMERA SETTLES, HOLDS, AND MOVES — it never drifts. A move is a
      named curve between two framings and it ends in a full stop; everything
      that is not a move is a locked camera.
   2. SCALE IS INTERPOLATED IN LOG SPACE and the centre is interpolated
      linearly. `A.scale * (B.scale/A.scale)^u` is a constant PERCEIVED zoom
      rate, which is the only kind the eye has; a linear lerp of a 3.0 -> 60.0
      zoom reads as a lurch and then a crawl.
   3. THE YEAR IS MONOTONE. A shot opens on the year the previous shot closed
      on, only a `run` act moves it, and `buildFilm` asserts the whole segment
      list is non-decreasing before it returns it. The published film shipped
      with nine backward samples inside one 900 ms run before this assertion
      existed; it is ported for that reason.
   4. A SHOT'S ACTS MUST SUM TO THE SHOT'S OWN RUNNING TIME. Optional here
      (`shotMs`), because a script that does not state a running time cannot
      contradict one — but where it is stated it is checked, so a re-timed act
      cannot quietly lengthen the film. That assertion has fired twice on the
      published film, correctly, per its own note.

   ── WHAT THIS PORT DOES NOT DO, AND WHY ───────────────────────────────────
   · IT DRIVES THE CAMERA AND THE YEAR, AND NOTHING ELSE. The published film
     also raises one object per `build` act (a burn hairline, three
     placemarks, a bridge deck, a district outline), lights a 35-row schedule
     of losses on its one `fire` act, and paints a plate of copy and
     citations. Every one of those is a LAYER this engine does not have yet.
     So the acts are kept in the script with their real kinds and durations —
     they are load-bearing for the timing either way — and the live act is
     reported on `FilmState` with its own progress and curve, which is exactly
     what such a layer would need to be told. Until one exists, a `build` and
     a `fire` are a locked camera, which is what they already are.
   · NO BAND-CROSSING BIAS. The published `filmStateAt` accepts a `cyBias`
     that decays over 250 ms to absorb the ~16 px jump a ZEX change puts under
     a fixed ground point. MEASURED in the shipped shell: `biasRef` is
     assigned in five places in `CityFilm.tsx` and every one of them assigns
     ZERO — nothing ever charges it. It is an affordance that never fires, so
     there was nothing to port. The jump itself is real and is handled the
     same way the published film actually handles it: `cy` is recomputed every
     frame from the exaggeration of the step the camera is currently on.
   · NO REDUCED-MOTION VARIANT. The published one cuts instead of travelling
     and quantises the year to whole years under `prefers-reduced-motion`.
     That belongs in the mount, which is where the media query is read; the
     hooks it needs are `seek()` and `stateAt()`, both public here.
   ═══════════════════════════════════════════════════════════════════════ */

import { stepForZ } from "./controls";
import type { PlaneCamera } from "./camera";

// ── 0 · the curves ──────────────────────────────────────────────────────────

/**
 * A cubic bezier easing, solved on a 1/512 grid the way the browsers do it.
 *
 * Canvas and WebGL have no CSS transitions: a camera position is a number we
 * compute, not a property handed to the compositor. Ported verbatim from
 * `lib/city/film.ts` §0, including the grid size, so the GPU film and the
 * Canvas film ease identically and a side-by-side is a comparison of
 * renderers rather than of easings.
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
 * overshoot has to exceed 1. easeOutBack with the amplitude expressed as the
 * PEAK FRACTION it reaches rather than as the opaque `c1` constant, so 1.055
 * reads as "5.5 % over". Ported from `lib/city/film.ts` §outBack.
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

/**
 * THE FOUR CURVES THE PUBLISHED SCRIPT ACTUALLY NAMES, and no others.
 *
 * `lib/city/film.ts` declares seven. MEASURED against the shipped payload and
 * `SCRIPT`: the shot curve is `travel` on all eleven shots; the act curves in
 * use are `even` (every `run`, and the one `fire`), `enter` (two builds),
 * `settle` (four builds) and `travel` (one build). `move`, `exit` and `fade`
 * are named by nothing in the film, so porting them would be shipping three
 * curves no shot can reach.
 *
 * · `travel` — THE CAMERA. The one curve in the set with no precedent
 *   elsewhere on the site to inherit, and it is stated rather than smuggled:
 *   a camera moves the reader's own frame of reference, so it has to leave
 *   and arrive at zero velocity and spend its time in the middle.
 *   `(.4,0,.2,1)` — the site's own reveal curve — is 78 % done at the halfway
 *   point, which on this film's 3.0 -> 60.0 zoom shows as a lurch followed by
 *   a crawl.
 * · `enter` — `cubic-bezier(.22,.61,.36,1)`, the drawer slide already on the
 *   site, so an object arriving on the canvas feels like the same product as
 *   the DOM around it.
 * · `settle` — an overshoot, used on one object at a time.
 * · `even` — NO EASE AT ALL, and it is every `run` in the film. A run advances
 *   the year with the camera standing still; it is a counter, and the record
 *   does not say one year took longer than the next.
 */
export type FilmCurve = "travel" | "enter" | "settle" | "even";

export const CURVE: Readonly<Record<FilmCurve, (x: number) => number>> = {
  travel: bezier(0.45, 0.05, 0.55, 0.95),
  enter: bezier(0.22, 0.61, 0.36, 1),
  settle: outBack(1.055),
  even: (x: number) => x,
};

/* THE FALLBACK IS `even`, WHICH IS NO EASE AT ALL, and that is deliberate.
   The camera never comes through here — a move reads `CURVE.travel` by name,
   because `travel` IS the camera curve and there is nothing for a shot to
   choose. What is left is objects and counters, and an object whose script
   does not state a curve should not be given one this file invented. */
const curveOf = (n: FilmCurve | undefined): ((x: number) => number) =>
  (n && CURVE[n]) || CURVE.even;

/* ── the year is only handed out fractionally while something reads it ──────
   `lib/city/film.ts` §RISE_WIN / §ST_ENTER_WIN / §YEAR_LIVE. The arrival wave
   is finished at 0.385 of a year and a year's own street acceptances are
   drawn in by 0.55; past the later of the two the frame does not change again
   until the next integer. Handing out the raw fraction anyway moves the
   year every frame for no visible difference — here that is eleven layers
   re-running their draw-range search per frame, on the Canvas side it was
   seven extra rasterisations a year.

   Kept as the max of the two published constants rather than typed as 0.55,
   so moving either one cannot silently start pinning the year while something
   is still animating on it. */
export const RISE_WIN = 0.385;
export const ST_ENTER_WIN = 0.55;
export const YEAR_LIVE = Math.max(RISE_WIN, ST_ENTER_WIN);

/** the depth stagger a cohort's arrival wave spreads over, ms.
 *  `lib/city/film.ts` §STAGGER_TOTAL: two full cohorts overlap at travel
 *  speed, which is what makes a year's buildings read as a wave and not as a
 *  flash. */
export const STAGGER_TOTAL = 520;

/** A year shorter than the stagger has no wave in it, so the year lands whole
 *  rather than fractionally. Ported from `lib/city/film.ts` §waveFits. */
export function waveFits(years: number, ms: number): boolean {
  return years > 0 && ms / years >= STAGGER_TOTAL;
}

// ── 1 · the script ──────────────────────────────────────────────────────────

/**
 * ONE FRAMING. The five numbers a camera stop is, and they are the published
 * film's own five (`lib/city/film.ts` §FilmCam).
 *
 * `z` is a MULTIPLE OF THE FIT SCALE and not a scale, so a framing survives a
 * viewport it was not measured in: 1.0 is the whole city across the frame,
 * 60.0 is one building. `ox`/`oy` push the target off centre by that fraction
 * of the viewport's own width and height, which is how a subject is put in a
 * third of the frame with room for a plate beside it.
 */
export interface FilmCam {
  /** multiples of the whole-city fit scale */
  readonly z: number;
  /** target offset, as a fraction of viewport width / height */
  readonly ox: number;
  readonly oy: number;
  /** what it looks at, in the city's own world metres. Omitted = the fitted
   *  centre, which is what the two widest shots in the published film use. */
  readonly at?: readonly [number, number];
}

/**
 * WHAT HAPPENS INSIDE A SHOT, act by act.
 *
 * The published `camera.json` stated move/hold/run as three numbers and left
 * their ORDER to prose, and that ambiguity is where a film goes wrong — so the
 * order is the list. The four kinds are the published four:
 *
 *   run    the YEAR moves and the camera does not.
 *   build  ONE object rises. Nothing else moves.
 *   fire   a schedule is read: nothing rises, nothing moves, and what changes
 *          is how much of one table has been read.
 *   hold   nothing moves. This is the act that does the reading.
 *
 * To the CAMERA, `build`, `fire` and `hold` are the same thing — a locked
 * frame — and this player treats them so. They are kept apart because their
 * durations are load-bearing and because a layer that raises things needs to
 * be told which one is live and how far through it is. `FilmState.act` and
 * `FilmState.u` are that.
 */
export type FilmAct =
  | { readonly k: "run"; readonly ms: number; readonly to: number;
      readonly curve?: FilmCurve; readonly cam?: 2 }
  | { readonly k: "build"; readonly ms: number; readonly what?: string;
      readonly of?: string; readonly curve?: FilmCurve; readonly cam?: 2 }
  | { readonly k: "fire"; readonly ms: number; readonly curve?: FilmCurve;
      readonly cam?: 2 }
  | { readonly k: "hold"; readonly ms: number; readonly cam?: 2 };

export interface FilmShot {
  /** a stable id, for a caller's own chrome and for the error messages here */
  readonly id: string;
  readonly cam: FilmCam;
  /** A SECOND FRAMING, cut to by any act carrying `cam: 2`. One shot in the
   *  published film uses it, and the reason is a measurement rather than a
   *  preference: its two subjects are 9 km apart, so no single zoom shows
   *  either of them arriving. A cut, not a travel. */
  readonly cam2?: FilmCam;
  /** the travel INTO this shot, ms. 0 is a cut — the published film opens on
   *  two shots that share a framing precisely so the join between them is a
   *  match cut and costs nothing. */
  readonly moveMs: number;
  readonly acts: readonly FilmAct[];
  /** the shot's own stated running time. Optional; asserted where given, so a
   *  re-timed act cannot quietly change the length of the film. */
  readonly shotMs?: number;

  // ── what this shot SAYS. None of it moves the camera or the year ──────────

  /** the words and the citations. Absent = a shot that says nothing. */
  readonly plate?: FilmPlate;
  /**
   * THE YEAR THE PLATE PRINTS, STATED, and it beats both rules below.
   *
   * A shot whose sentence names two events a year apart and no year at all
   * cannot be captioned by any reading of the counter: whatever the counter
   * says will be a year one of the two did not happen in. So the shot states
   * the year it is ABOUT and the fabric runs on underneath it.
   */
  readonly pinYear?: number;
  /**
   * THE COUNTER IS THE SUBJECT — print it as it climbs.
   *
   * The default is the opposite (see `plateYearAt`) and it has to be: a
   * sentence about a dated event, sat over a counter still climbing toward
   * that date, prints a year in which the thing had not happened yet. So a
   * shot only gets a live counter when the climb IS what the shot is about.
   */
  readonly yearRuns?: boolean;
  /**
   * THE PLATE WAITS UNTIL THIS ACT INDEX. A move carries no act index and so
   * counts as before all of them, which holds the words through the travel
   * too. For a shot that opens by running the year a long way toward the date
   * its sentence is about.
   */
  readonly sayFromAct?: number;
}

/* ── 1b · WHAT A SHOT SAYS ──────────────────────────────────────────────────
   Shapes, and nothing else. Not one string below is written here: a title, a
   sentence and an archive leaf are one city's record, so they arrive on that
   city's descriptor exactly the way its framings and its years already do.
   The player never reads any of it — `filmStateAt` reports which shot is live
   and the chrome looks the words up — so the film runs identically whether a
   script carries copy or not.

   The field list is the published payload's own
   (`public/data/<city>/city/film/film.json`), minus the two things this port
   does not have a layer for.
   ═══════════════════════════════════════════════════════════════════════ */

/** The page a shot is drawn from, in the archive that holds it. */
export interface FilmCite {
  /** the volume as a READER would say it, not as a filename */
  readonly vol: string;
  /** which leaf of that volume */
  readonly leaf: number;
  readonly url: string;
}

/** A second source under the shot's own: what it says, and where it is. */
export interface FilmSource {
  /** the sentence the reader clicks */
  readonly t: string;
  readonly u: string;
  /** a scanned page, or a published register */
  readonly k: "scan" | "data";
}

/** WHAT THE PLATE PRINTS ON ONE SHOT. */
export interface FilmPlate {
  /** the shot's own name for what is happening */
  readonly title: string;
  /** the sentence. One sentence — this is a caption, not an essay. */
  readonly copy: string;
  /** the page the sentence is drawn from */
  readonly cite?: FilmCite;
  /** everything else it leans on */
  readonly also?: readonly FilmSource[];
  /** the caveat a DERIVED figure has to carry, deliberately not in the
   *  sentence: a sum that appears in none of the tables it is a sum of. */
  readonly note?: string;
  /**
   * WHICH NUMBERED PAGE OF THE CITY'S SCANS PAYLOAD STANDS BESIDE THIS SHOT.
   *
   * A number and not a path, because the crops are published as one payload
   * with its own numbering and this file may not hold a data path. Absent =
   * the shot cites a page nobody has cropped, which is most of them.
   */
  readonly scan?: number;
}

/** A still card: the one the film opens on and the one it closes on. */
export interface FilmCard {
  readonly head: string;
  readonly sub: string;
  /** the opening card's third line — where everything after it came from */
  readonly note?: string;
}

export interface FilmScript {
  /** the still card the film opens on, ms */
  readonly titleMs: number;
  /** the still card it closes on, ms */
  readonly endMs: number;
  /** the year the film opens on. The ONLY year read from outside the acts —
   *  everything after it is derived, which is what makes the line monotone by
   *  construction rather than by agreement between two statements of it. */
  readonly openYear: number;
  readonly shots: readonly FilmShot[];

  // ── what the film says. Optional: a film may be wordless ──────────────────

  /** the still card the opening `titleMs` carries */
  readonly titleCard?: FilmCard;
  /** the still card the closing `endMs` carries */
  readonly endCard?: FilmCard;
  /**
   * WHERE THIS CITY PUBLISHES THE PAGES ITS SHOTS CITE.
   *
   * A URL and not a directory: the payload numbers its own crops and carries
   * their sizes, their highlight boxes and their captions, so a shot names a
   * number (`FilmPlate.scan`) and nothing here has to know a file naming
   * convention. This is the ONE data path on the script, and it is on the
   * script for the same reason the framings are — it is the city's, not the
   * engine's.
   */
  readonly scansUrl?: string;
}

// ── 2 · the timeline ────────────────────────────────────────────────────────

export type FilmSegKind = "title" | "move" | "run" | "build" | "fire" | "hold" | "end";

export interface FilmSeg {
  readonly k: FilmSegKind;
  readonly t0: number;
  readonly ms: number;
  /** which shot, absent on the two cards */
  readonly si?: number;
  /** which act inside that shot, absent on a move and on the two cards */
  readonly ai?: number;
  readonly a?: FilmAct;
  readonly yFrom: number;
  readonly yTo: number;
}

export interface FilmTimeline {
  readonly segs: readonly FilmSeg[];
  readonly total: number;
  /** each shot's start and end, so a caller can step a whole shot */
  readonly shotT0: readonly number[];
  readonly shotEnd: readonly number[];
}

/**
 * One flat list of segments with absolute start times, so the state at any
 * millisecond is a LOOKUP and not a simulation. That is what makes a seek land
 * on exactly the frame playback would have produced, and it is what makes this
 * testable without a browser or a GPU.
 */
export function buildFilm(script: FilmScript): FilmTimeline {
  if (!script.shots.length) throw new Error("film: a script with no shots");
  const segs: FilmSeg[] = [];
  const shotT0: number[] = [];
  const shotEnd: number[] = [];
  let t = script.titleMs;
  const y0 = script.openYear;
  segs.push({ k: "title", t0: 0, ms: script.titleMs, yFrom: y0, yTo: y0 });

  /* the year the NEXT shot opens on: the one the last one closed on */
  let open = y0;
  script.shots.forEach((s, si) => {
    if (!s.acts.length) throw new Error(`film: shot ${s.id} has no acts`);
    if (s.shotMs !== undefined) {
      const sum = s.moveMs + s.acts.reduce((a, x) => a + x.ms, 0);
      if (sum !== s.shotMs)
        throw new Error(
          `film: shot ${s.id} acts sum to ${sum} ms, the script says ${s.shotMs}`,
        );
    }
    shotT0.push(t);
    /* A MOVE CARRIES ITS YEAR. In the Canvas film it did not, and a `year`
       read off a segment that had never been given one printed NaN in the
       corner for the whole 1.2–1.8 s of every camera move. The camera travels
       at the year the shot opens on, which is also the year the previous shot
       closed on — one number used twice, not two facts that have to agree. */
    if (s.moveMs > 0) {
      segs.push({ k: "move", t0: t, ms: s.moveMs, si, yFrom: open, yTo: open });
      t += s.moveMs;
    }
    let y = open;
    s.acts.forEach((a, ai) => {
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

  segs.push({ k: "end", t0: t, ms: script.endMs, yFrom: open, yTo: open });
  t += script.endMs;

  /* EVERY segment boundary and not only the shot boundaries, because in the
     Canvas film the one rewind that shipped lived INSIDE a shot, in a `run`
     act that walked the year back to a year an earlier shot had already
     passed. `.parity/m1time.py` found it by seeking every 50 ms: nine backward
     samples out of 2,681. A film has to lie linear in time. */
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].yFrom < segs[i - 1].yTo) {
      const who = segs[i].si != null ? script.shots[segs[i].si as number].id : segs[i].k;
      throw new Error(
        `film: the year goes BACKWARD at t=${segs[i].t0} (${who}): ` +
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

// ── 3 · the framings ────────────────────────────────────────────────────────

/** The whole-city fit a `z` is measured against: the scale at which the city
 *  fills the frame, and the plane point that frame is centred on. */
export interface FilmFit {
  readonly base: number;
  readonly bx: number;
  readonly by: number;
}

/**
 * THE ELEVATION TERM IS CARRIED SEPARATELY, and it is the one piece of
 * arithmetic here that is not obvious.
 *
 *     plane = [ ax·x + ay·y , bx·x + by·y + elev·ZEX ]
 *
 * and ZEX is a property of the CAMERA STEP, not of the point — 3.3 at the
 * whole city, 2.6 at district, 2.0 at block in this engine's own descriptor.
 * So the plane position of a fixed point ON THE GROUND MOVES when the step
 * changes. A framing baked at one step is therefore wrong at the next, and a
 * move that crosses a step boundary would jump by Δzex × elevation × scale at
 * the crossing.
 *
 * So a frame keeps `py` — the exaggeration-free half — and `gz`, the ground
 * elevation, APART, and the step's own exaggeration is applied per frame by
 * whoever is reading. Nothing is baked, so nothing is stale.
 */
export interface FilmFrame {
  readonly step: number;
  readonly scale: number;
  readonly cx: number;
  /** the exaggeration-free half of the plane centre */
  readonly py: number;
  /** the ground elevation under the target, in metres */
  readonly gz: number;
}

export interface FilmFrames {
  readonly base: number;
  readonly frames: readonly FilmFrame[];
  /** one entry a shot, `null` where the shot has only one framing */
  readonly frames2: readonly (FilmFrame | null)[];
  /** the ladder the framings were measured with, carried so that the step of a
   *  scale BETWEEN two framings is read off the same function rather than
   *  guessed from the framings it is between */
  readonly stepFor: (z: number) => number;
}

/** Everything a framing needs that is not in the framing: the fit it is a
 *  multiple of, the viewport it is measured against, and the city's own
 *  projection and terrain, both as plain functions. */
export interface FilmFrameCtx {
  readonly fit: FilmFit;
  readonly W: number;
  readonly H: number;
  /** world metres to plane units AT ZERO ELEVATION. The band moves the
   *  exaggeration and nothing else, so this is band-independent and may be
   *  resolved once. */
  readonly proj: (x: number, y: number) => readonly [number, number];
  /** ground elevation in metres */
  readonly elev: (x: number, y: number) => number;
  /** which step a zoom sits in. Defaults to this engine's own ladder — see
   *  `resolveFrames`. */
  readonly stepFor?: (z: number) => number;
}

export function frameOf(c: FilmCam, ctx: FilmFrameCtx): FilmFrame {
  const stepFor = ctx.stepFor ?? stepForZ;
  const step = stepFor(c.z);
  const scale = ctx.fit.base * c.z;
  let px: number;
  let py: number;
  let gz: number;
  if (c.at) {
    const p = ctx.proj(c.at[0], c.at[1]);
    px = p[0];
    py = p[1];
    gz = ctx.elev(c.at[0], c.at[1]);
  } else {
    /* the fitted frame. Its centre already carries whatever elevation term the
       fit was computed with, and it is a whole-city framing, so the two are
       consistent by construction and `gz` is zero. */
    px = ctx.fit.bx;
    py = ctx.fit.by;
    gz = 0;
  }
  return {
    step,
    scale,
    cx: px - (c.ox * ctx.W) / scale,
    py: py - (c.oy * ctx.H) / scale,
    gz,
  };
}

/**
 * Every framing in the script, measured against ONE viewport.
 *
 * `ox`/`oy` are fractions of the viewport, so this has to be redone when the
 * window resizes. It is cheap — two dot products and one terrain sample a
 * framing — so the honest thing is to redo it rather than to try to patch the
 * frames in place.
 *
 * `stepFor` defaults to `controls.ts`'s `stepForZ`, which is THIS engine's
 * ladder, and that is a deliberate divergence from the Canvas film. MEASURED:
 * the Canvas `bandOfZ` cuts at z 1.703 and 4.569, `stepForZ` at 1.6 and 3.2,
 * and on the published eleven-shot list two shots land in different bands
 * under the two ladders (z 3.4 and z 3.6 — band 1 there, step 2 here). The
 * engine's own ladder wins, because a film that ended on a band the mouse
 * wheel does not agree with would snap the moment the reader touched it. Pass
 * your own if you want the Canvas numbers back.
 */
export function resolveFrames(script: FilmScript, ctx: FilmFrameCtx): FilmFrames {
  return {
    base: ctx.fit.base,
    frames: script.shots.map((s) => frameOf(s.cam, ctx)),
    frames2: script.shots.map((s) => (s.cam2 ? frameOf(s.cam2, ctx) : null)),
    stepFor: ctx.stepFor ?? stepForZ,
  };
}

/** The framing an act sits on. A shot with no `cam2` can only ever answer with
 *  its one frame, so this is a no-op on all but the shots that cut. */
function camOf(ff: FilmFrames, si: number, a?: FilmAct): FilmFrame {
  return (a?.cam === 2 && ff.frames2[si]) || ff.frames[si];
}

/** The framing a shot ENDS on — where the next shot's travel starts from. A
 *  shot that cuts to a second camera does not go back to its first. */
function endCam(ff: FilmFrames, si: number): FilmFrame {
  return ff.frames2[si] ?? ff.frames[si];
}

// ── 4 · the state at t ──────────────────────────────────────────────────────

export interface FilmState {
  /** film milliseconds, clamped into [0, total] */
  readonly t: number;
  readonly seg: number;
  readonly kind: FilmSegKind;
  /** which shot, and its id. The cards report the shot they sit against. */
  readonly si: number;
  readonly shot: string | null;
  readonly act: FilmAct | null;
  /** progress through THIS segment, 0..1, EASED BY THE SEGMENT'S OWN CURVE.
   *  On a move that is the camera curve; on a build or a fire it is the
   *  object's, which is what a layer that raises something would read. */
  readonly u: number;
  /** progress through this segment, 0..1, unEASED */
  readonly u0: number;
  readonly cam: PlaneCamera;
  readonly step: number;
  /** the true year, fractional inside a run */
  readonly year: number;
  /** the year to hand a year-gated layer — see `YEAR_LIVE` */
  readonly yearOut: number;
  /** whether the year is MOVING fast enough for an arrival wave to read */
  readonly running: boolean;
  readonly done: boolean;
}

/**
 * WHAT IS TRUE AT FILM MILLISECOND t. Pure: no clock, no DOM, no engine.
 *
 * `zexFor` is the vertical exaggeration of a step, which only the host knows —
 * it is a property of the city's descriptor, not of the film.
 */
export function filmStateAt(
  script: FilmScript,
  tl: FilmTimeline,
  ff: FilmFrames,
  tRaw: number,
  zexFor: (step: number) => number,
): FilmState {
  const t = Math.max(0, Math.min(tl.total, tRaw));
  const ix = segAt(tl, t);
  const sg = tl.segs[ix];
  const u0 = sg.ms > 0 ? Math.max(0, Math.min(1, (t - sg.t0) / sg.ms)) : 1;
  const si = sg.si ?? (sg.k === "title" ? 0 : script.shots.length - 1);

  // ── camera ────────────────────────────────────────────────────────────────
  let A: FilmFrame;
  let B: FilmFrame;
  /** how far along the TRAVEL the camera is. 1 on everything that is not a
   *  move, because everything that is not a move is a locked frame. */
  let uc: number;
  if (sg.k === "move") {
    /* the FIRST shot's move, if it had one, would have nowhere to come from,
       so it starts where it ends and the move is a no-op rather than a throw */
    A = si > 0 ? endCam(ff, si - 1) : ff.frames[si];
    B = ff.frames[si];
    uc = CURVE.travel(u0);
  } else if (sg.k === "title") {
    A = B = ff.frames[0];
    uc = 1;
  } else {
    A = B = camOf(ff, si, sg.a);
    uc = 1;
  }
  /* SCALE IN LOG SPACE, CENTRE LINEARLY — see this file's header, rule 2. */
  const scale = A.scale * Math.pow(B.scale / A.scale, uc);
  /* the step is READ BACK OFF THE INTERPOLATED SCALE and never lerped between
     the two framings' own steps: a ladder is a step function, and averaging
     one gives a band that exists on neither end of the move. */
  const step = ff.stepFor(ff.base > 0 ? scale / ff.base : 1);
  const cx = A.cx + (B.cx - A.cx) * uc;
  const cy = A.py + (B.py - A.py) * uc + zexFor(step) * (A.gz + (B.gz - A.gz) * uc);

  /* what a layer that RAISES something would read: this segment's own progress
     under its own object curve. Never the camera's — a locked frame has
     nothing to ease, and an object arriving is allowed to overshoot where a
     camera is not. */
  const u =
    sg.k === "move"
      ? uc
      : sg.a && "curve" in sg.a
        ? curveOf(sg.a.curve)(u0)
        : u0;

  // ── the year ──────────────────────────────────────────────────────────────
  let year: number;
  if (sg.k === "run" && sg.a && sg.a.k === "run") {
    year = sg.yFrom + (sg.yTo - sg.yFrom) * curveOf(sg.a.curve ?? "even")(u0);
  } else {
    /* off the SEGMENT and never off a shot's own stated years, which are not
       the film's clock — see `buildFilm` §the year the NEXT shot opens on */
    year = sg.yTo;
  }
  const running = sg.k === "run" && sg.yTo > sg.yFrom && waveFits(sg.yTo - sg.yFrom, sg.ms);
  /* the 0.0001 is the published film's own: outside a run the year is pinned
     at `iy + 0.999`, and flooring that back to `iy` is what the epsilon
     protects against on the frame the pin is read back */
  const iy = Math.floor(year + (running ? 0 : 0.0001));
  const frac = year - iy;
  const yearOut = running && frac < YEAR_LIVE ? year : iy + 0.999;

  return {
    t,
    seg: ix,
    kind: sg.k,
    si,
    shot: sg.si != null ? script.shots[si].id : null,
    act: sg.a ?? null,
    u,
    u0,
    cam: { cx, cy, scale },
    step,
    year,
    yearOut,
    running,
    done: t >= tl.total,
  };
}

// ── 5 · the player ──────────────────────────────────────────────────────────

/**
 * What the player needs from the engine, and nothing more. `CityEngine`
 * satisfies this structurally — the player never imports it, so a test can
 * hand it a plain object and a harness can hand it a spy.
 */
export interface FilmHost {
  getCamera(): PlaneCamera;
  setCamera(c: PlaneCamera): void;
  getStep(): number;
  setStep(step: number): void;
  setYear(year: number | undefined): void;
  invalidate(): void;
  /** the vertical exaggeration at the step the host is CURRENTLY on */
  zex(): number;
  readonly viewport: { W: number; H: number; dpr: number };
}

export type FilmStopReason = "end" | "interrupt" | "stop" | "dispose";

/**
 * A SECOND LISTENER, ATTACHED AFTER THE FACT.
 *
 * `opts.onState` and `opts.onStop` belong to whoever BUILT the player, and on
 * this page that is the mount — it is the mount that has the engine, the fire
 * layer and the writing to keep on the film's clock. Chrome is a different
 * thing with a different lifetime: it mounts later, it re-mounts on a resize
 * or a route change, and it must not require the mount to know it exists.
 *
 * So the player takes listeners as well as options. `watch` returns its own
 * detach, the set is walked in insertion order, and a watcher that throws is
 * left to throw — swallowing it here would hide a chrome bug inside the frame
 * loop, which is the hardest place in the file to find one.
 *
 * `onPlay` has no equivalent in `FilmOptions` and it is the reason this exists
 * at all: chrome that is not on screen has no way to learn that the film just
 * started, and polling for it would be a timer running for the life of the
 * page to catch an event the player already knows about.
 */
export interface FilmWatcher {
  /** the film has started or resumed, on the frame it starts from */
  onPlay?(s: FilmState): void;
  /** every frame the film paints, and once on every seek */
  onState?(s: FilmState): void;
  onStop?(reason: FilmStopReason, s: FilmState): void;
}

export interface FilmOptions {
  /** the framings, measured against the viewport the film will play in */
  frames: FilmFrames;
  /**
   * ANY INPUT STOPS THE FILM WHERE IT IS.
   *
   * A reader who reaches for the map is not asking for the film to finish
   * politely; they are asking for the map. So the three inputs `controls.ts`
   * acts on — a pointer going down, a wheel, a key — end the piece on the
   * frame they arrive on, and the camera is already exactly there, so there
   * is nothing to hand back.
   *
   * Bound in the CAPTURE phase and WITHOUT `preventDefault`, so the same
   * event still reaches the controls underneath: the drag that stopped the
   * film is also the drag that pans the city, which is what a reader means.
   */
  interruptOn?: EventTarget | null;
  /** called every frame the film paints, and once on every seek */
  onState?: (s: FilmState) => void;
  /** called once when the film stops, for any reason */
  onStop?: (reason: FilmStopReason, s: FilmState) => void;
  /** injectable clock and loop, so the tests are neither real-time nor
   *  browser-bound. Default to `performance.now` / `requestAnimationFrame`. */
  now?: () => number;
  raf?: (cb: (t: number) => void) => number;
  cancelRaf?: (h: number) => void;
}

export interface FilmPlayer {
  play(fromMs?: number): void;
  stop(reason?: FilmStopReason): void;
  /** put the film on a frame without running it */
  seek(ms: number): void;
  /** the same lookup the player runs, for a caller that wants to look ahead */
  stateAt(ms: number): FilmState;
  /** re-measure the framings — the viewport changed */
  setFrames(f: FilmFrames): void;
  /** attach a listener after construction; returns the detach */
  watch(w: FilmWatcher): () => void;
  readonly t: number;
  readonly total: number;
  readonly running: boolean;
  readonly timeline: FilmTimeline;
  dispose(): void;
}

/**
 * A LONG FRAME IS NOT A LONG TIME, ms.
 *
 * The clock is `now()` deltas and not frame counts, so a film that drops
 * frames still runs at the right speed. But a backgrounded tab hands back a
 * delta of seconds or minutes, and integrating that would skip whole shots on
 * the frame the reader comes back. Capped, which is the published shell's own
 * treatment (`CityFilm.tsx` clamps its own dt to 0.05 s).
 */
const MAX_DT = 50;

export function createFilm(
  host: FilmHost,
  script: FilmScript,
  opts: FilmOptions,
): FilmPlayer {
  const tl = buildFilm(script);
  const now = opts.now ?? (() => performance.now());
  const raf =
    opts.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((h: number) => cancelAnimationFrame(h));

  let frames = opts.frames;
  let t = 0;
  let running = false;
  let last = 0;
  let handle = 0;
  let disposed = false;
  let bound: EventTarget | null = null;
  const watchers = new Set<FilmWatcher>();

  /**
   * TWICE, AND ON PURPOSE.
   *
   * `host.zex()` answers for whatever step the host is CURRENTLY on, and the
   * elevation term in `cy` is multiplied by exactly that. So the step has to
   * be set before the centre is computed, and the step comes out of the same
   * lookup as the centre. The first pass is read for its `step` alone and its
   * camera is discarded; the second is the frame.
   *
   * It is two binary searches over ~40 segments and about forty flops. The
   * alternative — a host that can be asked for the exaggeration of a step it
   * is not on — would put the descriptor's own table in this signature, and
   * the point of `FilmHost` is that the engine satisfies it as it stands.
   */
  const apply = (): FilmState => {
    const probe = filmStateAt(script, tl, frames, t, () => host.zex());
    if (probe.step !== host.getStep()) host.setStep(probe.step);
    const s = filmStateAt(script, tl, frames, t, () => host.zex());
    host.setCamera(s.cam);
    host.setYear(s.yearOut);
    host.invalidate();
    opts.onState?.(s);
    for (const w of watchers) w.onState?.(s);
    return s;
  };

  const onInput = (): void => stop("interrupt");

  const bind = (): void => {
    const el = opts.interruptOn;
    if (!el || bound) return;
    bound = el;
    el.addEventListener("pointerdown", onInput, true);
    el.addEventListener("wheel", onInput, true);
    el.addEventListener("keydown", onInput, true);
  };

  const unbind = (): void => {
    if (!bound) return;
    bound.removeEventListener("pointerdown", onInput, true);
    bound.removeEventListener("wheel", onInput, true);
    bound.removeEventListener("keydown", onInput, true);
    bound = null;
  };

  function stop(reason: FilmStopReason = "stop"): void {
    if (!running && reason !== "dispose") return;
    running = false;
    if (handle) cancelRaf(handle);
    handle = 0;
    unbind();
    /* the camera is already where the film left it, so a stop paints nothing
       new — it only tells the caller which frame it stopped on */
    const s = filmStateAt(script, tl, frames, t, () => host.zex());
    opts.onStop?.(reason, s);
    for (const w of watchers) w.onStop?.(reason, s);
  }

  const tick = (): void => {
    handle = 0;
    if (!running || disposed) return;
    const n = now();
    const dt = Math.min(MAX_DT, Math.max(0, n - last));
    last = n;
    t = Math.min(tl.total, t + dt);
    apply();
    if (t >= tl.total) {
      stop("end");
      return;
    }
    handle = raf(tick);
  };

  return {
    play(fromMs?: number): void {
      if (disposed) return;
      /* replaying a finished film starts it again rather than sitting on its
         last frame doing nothing */
      t = fromMs ?? (t >= tl.total ? 0 : t);
      t = Math.max(0, Math.min(tl.total, t));
      if (running) return;
      running = true;
      last = now();
      bind();
      /* AFTER `apply`, so a watcher's `onPlay` and its first `onState` arrive
         in the order they happened and both describe the same millisecond */
      const s = apply();
      for (const w of watchers) w.onPlay?.(s);
      handle = raf(tick);
    },
    stop,
    seek(ms: number): void {
      t = Math.max(0, Math.min(tl.total, ms));
      apply();
    },
    stateAt(ms: number): FilmState {
      return filmStateAt(script, tl, frames, ms, () => host.zex());
    },
    setFrames(f: FilmFrames): void {
      frames = f;
      if (running || t > 0) apply();
    },
    watch(w: FilmWatcher): () => void {
      watchers.add(w);
      return () => {
        watchers.delete(w);
      };
    },
    get t(): number {
      return t;
    },
    get total(): number {
      return tl.total;
    },
    get running(): boolean {
      return running;
    },
    timeline: tl,
    dispose(): void {
      stop("dispose");
      disposed = true;
      /* a disposed player holds nothing: a chrome component that outlives it
         is a leak the mount cannot see */
      watchers.clear();
    },
  };
}
