/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/rise.ts — THE CENTURY IS AN EVENT, NOT A SLIDER.

   A year is not a switch. `layers/buildings.ts` gates the century with a draw
   range over geometry emitted in year order, which is the right answer to
   *which buildings exist yet* and the wrong answer to *what does a year look
   like*: dragging the rail made 6,635 buildings appear between two frames.

   The published Canvas page has the answer and this port threw it away.
   `components/us/city/scene.ts` §THE ARRIVAL WAVE: *"a building of THIS
   year's cohort GROWS out of the ground and lands pale, settling into its own
   colour — so a cohort reads as construction rather than as a switch being
   thrown."* Two halves, and this file is both of them.

   ── ONE · THE WAVE ────────────────────────────────────────────────────────
   `lib/city/film.ts` §riseOf, unchanged in its arithmetic: the cohort rises
   FAR EDGE OF THE FRAME FIRST with a per-building jitter, over the first
   `RISE_WIN` (38.5 %) of the year's passage. Far first because that is what
   painter's order does on the Canvas side, and keeping it means the two pages
   read the same even though this one has a depth buffer and needs no order at
   all.

   `dn` is normalised ON THE SCREEN and not over the city, and that is the one
   line of it worth restating: a cohort seen at district zoom occupies a
   narrow slice of world depth, so a world-normalised stagger collapses into a
   flash at exactly the zoom where the reader is closest to it. Here that is a
   clip-space read of the building's own GROUND point — the point it is rising
   from, so the wave does not chase its own rise up the screen.

   ── TWO · THE OCHRE ───────────────────────────────────────────────────────
   `lib/city/buildings.ts` §freshLUT. A building keeps a fresh tint for
   `FRESH_YEARS`, decaying over six years, *"so a run of empty years still
   shows a wave of construction moving across the map"*; and a building that
   is mid-rise lands PALE on top of that, which is what makes a rebuilding
   block read as NEW rather than as more fabric.

   The Canvas quantises the pale ramp to five steps and says why — *"a table
   index is a batch key"*, and a per-building `lerpHex` would have forced every
   rising building onto its own `fill()`. **A GPU has no batch key**, so the
   ramp is the continuous function the quantisation was standing in for. That
   is the only intended difference between the two, and the five steps are
   what it is a continuous version OF.

   ── HOW IT REACHES THE FABRIC, AND WHAT IT COSTS ─────────────────────────
   `layers/buildings.ts` §THE YEAR IS A DRAW RANGE keeps the prefix gate
   exactly as it is — the scrub must stay one number and no upload. What this
   adds is a per-vertex `aBorn` (the roll's own year byte, with the building's
   jitter in its fraction) and four uniforms, so a vertex can be asked how far
   through its own arrival it is without the year ever becoming a rebuild.

   MEASURED, and the reason it is a shader and not a buffer rewrite: the
   biggest cohort in the century is 1907, 6,635 footprints carrying 356,748
   vertices, scattered through all 139 chunks in Hilbert order rather than in
   year order. Rewriting their Y and their colour on the CPU is 8.6 MB of
   partial upload per frame, sixty times a second, for a wave that lasts
   0.385 of a year. The shader reads two attributes and costs nothing when
   the year is settled, because the deficit it subtracts is then multiplied
   by a uniform zero.

   ── AND WHAT THE TWO ATTRIBUTES COST, MEASURED ───────────────────────────
   8,626,306 vertices carry the fabric. `aBorn` is a float and `aOff` a
   signed short pair, so the wave costs **8 bytes a vertex, 69 MB**, against
   the 443 MB of vertex attributes the scene held before it. Both are the
   smallest legal stride WebGPU has (4 bytes), so neither can be made
   narrower without also being made fewer.

   FRAME COST, one session, the nodes on and off, GPU pipeline time per frame
   with the vsync taken out of it (burst-and-flush, nine repeats, median):

                        settled            a 1908 cohort mid-rise
     city stop      2.42 -> 2.56 ms          2.63 -> 2.59 ms
     district       3.33 -> 3.37             3.26 -> 3.30
     block          3.74 -> 3.80             3.58 -> 3.69
     street         3.45 -> 3.44             3.53 -> 3.64
     CPU submit     +0.01 to +0.03 ms at every stop

   And the scrub, at the district stop: +0.07 ms a frame stepping integer
   years, +0.05 ms stepping sixths of a year, which is the rate the film's
   own densest run hands out. A MID-RISE FRAME COSTS NO MORE THAN A SETTLED
   ONE — the wave is not what the shader spends its time on, the shader being
   there at all is, and that is a tenth of a millisecond.

   DEAD END, recorded: the first instrument paced these with
   `requestAnimationFrame` and read +1.6 ms at the city stop. It was measuring
   the 16.7 ms vsync clock — every stop came back at 8.3 ms, which is half a
   frame — and the difference did not survive being measured a second way.

   Nothing here knows a city, a date or a data path: the year arrives as a
   BYTE OFFSET from whatever epoch the city's own material config declares,
   and a footprint the roll does not date carries `BORN_UNDATED` and is never
   given one.

   ── AND THE OCHRE WAS CHECKED AGAINST THE TABLE THAT PUBLISHES IT ────────
   Roof by roof, not frame by frame: the same camera at two years, so
   everything that multiplies a roof's albedo — the sun, the sky, the
   occlusion pass, the haze — is identical and the screen value's linear ratio
   between the two frames IS the albedo ratio.

     2,527 roofs, at a year where the drawn set does not change and nothing
     is fresh:  residual **0.00 of 255, max 0.** The tint node is an exact
     identity where no building is inside its six years, so no settled frame
     in the century moved by a bit.

     99 roofs inside their fresh years, same instrument: median 3 of 255
     against a mean move of 15.4, bias -1.0. The tail is the scene itself —
     the control population at that year carries a max of 113 for the same
     reason, because a neighbour that is not there yet casts no shadow.

   And over a whole frame at 1908 against the published page's own: the ochre
   moves the frame's warmth (mean R-B) by +18.2 here and +15.7 there.

   ── WHICH BACKEND ALL OF THAT WAS MEASURED ON ────────────────────────────
   WebGL 2, which is what the page serves: `CityGLMap` passes `forceWebGL`
   unless the URL asks for `gpu=1`. On the WebGPU backend the page comes up
   with **zero validation errors** and the same draw calls and triangle
   counts, which is the part that can be checked — a vertex format the device
   will not take, or a node graph it cannot compile, fails loudly at pipeline
   creation and nothing here does. What could NOT be checked there is pixels:
   that backend's canvas returns a stale frame to `toDataURL` AND to the page
   compositor, so three captures a year apart come back byte-identical while
   `getStats()` correctly reports 7.5 M triangles against 12.4 M. That is a
   readback limitation of the harness and it predates this file.

   Both attributes are formats WebGPU has: a `float32` and, at itemSize 2
   normalized, a `snorm16x2` — each a legal 4-byte stride, which is the
   minimum that backend accepts and the reason neither is a pair of bytes.
   ═══════════════════════════════════════════════════════════════════════ */

import type { TextureNode } from "three/webgpu";
import {
  Fn,
  attribute,
  cameraProjectionMatrix,
  clamp,
  dot,
  float,
  floor,
  max,
  min,
  mix,
  materialColor,
  modelViewMatrix,
  positionLocal,
  pow,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  step,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";

import {
  EDGE_SHADE,
  FRESH,
  FRESH_YEARS,
  INK_HI,
  INK_LO,
} from "@/lib/city/buildings";
import { CURVE } from "./film";

/** whatever TSL hands back — named once, as `air.ts` and `ao.ts` name it */
type AnyNode = ReturnType<TextureNode["sample"]>;
type Uni = ReturnType<typeof uniform>;

// ── 1 · the wave, as arithmetic ─────────────────────────────────────────────

/** the fraction of a year the cohort rises over — `lib/city/film.ts` §RISE_WIN */
export const RISE_WIN = 0.385;
/** how much of that window is spent staggering — §RISE_LEAD */
export const RISE_LEAD = 0.55;
/** the per-building shuffle on top of the depth order — §STAGGER_JITTER */
export const STAGGER_JITTER = 0.18;
/** below this a building has not started and is not drawn at all —
 *  `scene.ts`'s own `if (rise <= 0.001) continue` */
export const RISE_MIN = 0.001;
/** how far under the city a building that has not started is parked, scene
 *  units. `engine.ts` §DEPTH_SPAN_M spans 200,000 of them, so this is five
 *  depth spans clear of anything the camera can see, and orthographic depth
 *  is linear so there is no precision to spend. */
export const HIDE_M = 1_000_000;

/**
 * How far through the current integer year's cohort the clock is.
 *
 * `lib/city/film.ts` §risePhase takes a second argument, `playing`, because
 * that renderer is handed the raw year and has to be told whether a clock is
 * running. **This one does not need telling.** `film.ts` §yearOut already
 * pins the year at `iy + 0.999` whenever the wave does not fit the run
 * (`waveFits`), and 0.999 is past `RISE_WIN`, so an unrunning film and a
 * reader dragging the rail both arrive here as a phase of exactly 1. One
 * fewer piece of state to keep in agreement, and the same three branches.
 */
export function risePhase(year: number | undefined): number {
  if (year === undefined) return 1;
  const f = year - Math.floor(year);
  return f <= 0.0005 || f >= RISE_WIN ? 1 : f / RISE_WIN;
}

/**
 * The per-building entrance curve, on the CPU.
 *
 * `dn` is 0 at the far edge of the frame and 1 at the near edge; `hash` is the
 * building's own deterministic draw. Ported from `lib/city/film.ts` §riseOf
 * line for line, and kept here rather than only in the shader so the shader
 * has something to be checked AGAINST — see `rise.test.ts`, which walks both
 * over the same grid.
 */
export function riseOf(phase: number, dn: number, hash: number): number {
  if (phase >= 1) return 1;
  const j = (hash - 0.5) * 2 * STAGGER_JITTER;
  const d = Math.max(0, Math.min(1, dn + j)) * RISE_LEAD;
  return CURVE.enter(Math.max(0, Math.min(1, (phase - d) / (1 - RISE_LEAD))));
}

// ── 2 · what a vertex carries ───────────────────────────────────────────────

/**
 * THE YEAR AND THE JITTER IN ONE FLOAT, AND WHY IT IS ONE FLOAT.
 *
 * A vertex needs two things the draw range cannot tell it: which year its
 * building belongs to (so the cohort can be found and the ochre aged) and its
 * building's own shuffle (so the cohort is a wave and not a rank of dominoes).
 *
 * Both fit in one `Float32` attribute: the year BYTE as the integer part, the
 * draw as the fraction. That is not a saving of one attribute out of two, it
 * is the only encoding that fits — **WebGPU requires a vertex buffer's stride
 * to be a multiple of four bytes**, so a `Uint8` pair (2 bytes) is not a legal
 * layout and the honest alternatives are all four bytes wide anyway. One
 * float, 4 bytes a vertex.
 *
 * The fraction is scaled by `JIT_SPAN` rather than used raw so that a draw of
 * exactly 1 cannot round the integer part up into the next year. Float32
 * carries a 24-bit mantissa and the year byte spends at most 8 of it, so the
 * draw keeps ~16 bits — four orders of magnitude more than a shuffle needs.
 */
export const JIT_SPAN = 0.99;
/**
 * The year byte of a footprint the roll dates to its own "not known".
 *
 * Those are drawn in EVERY year, so they must never join a cohort and must
 * never be aged: 250 is past any year byte a century-and-a-half epoch can
 * produce, so `|born - year|` is never under a half and `year - born` is
 * never inside the fresh window. **Nothing here invents a date** — see
 * `layers/buildings.ts` §THE YEAR IS A DRAW RANGE, which already refuses to
 * give one.
 */
export const BORN_UNDATED = 250;

/** the value `aBorn` carries for a footprint the roll dates */
export function packBorn(yearByte: number, draw: number): number {
  return yearByte + Math.max(0, Math.min(1, draw)) * JIT_SPAN;
}

// ── 3 · the ochre, as a table of two surfaces ───────────────────────────────

/**
 * WHAT THE FRESH TINT DOES TO A ROOF AND TO A WALL, AND THEY ARE NOT THE SAME.
 *
 * `lib/city/buildings.ts` §freshLUT, transcribed: a roof goes 0.55 of the way
 * to the ochre at its freshest and a wall 0.42, and a building still rising
 * lands pale first — a roof toward `#c9bda9` by 0.6 of its remaining rise, a
 * wall toward `#f3ecdd` by 0.55. The four numbers and the two pale tones are
 * that function's; `FRESH` itself is exported and imported rather than
 * retyped.
 */
export interface FreshRule {
  /** how far toward `FRESH` the surface goes at age 0 */
  readonly freshK: number;
  /** the pale a mid-rise surface lands on */
  readonly pale: string;
  /** how far toward that pale a surface at rise 0 goes */
  readonly paleK: number;
}
export const FRESH_ROOF: FreshRule = { freshK: 0.55, pale: "#c9bda9", paleK: 0.6 };
export const FRESH_WALL: FreshRule = { freshK: 0.42, pale: "#f3ecdd", paleK: 0.55 };

/**
 * How much of the ochre a building of this age still carries, 0..1.
 *
 * `freshLUT`'s own `fr = pow(1 - (f - 1) / FRESH_YEARS, 1.4)` with `f = age +
 * 1`, which is `pow(1 - age / FRESH_YEARS, 1.4)` — 1 in the year the roll
 * dates it, 0.08 five years later, and nothing at six.
 */
export function freshness(age: number): number {
  if (!(age >= 0) || age >= FRESH_YEARS) return 0;
  return Math.pow(1 - age / FRESH_YEARS, 1.4);
}
/** the exponent above, named because the shader has to say it too */
export const FRESH_GAMMA = 1.4;

// ── 4 · the shader ──────────────────────────────────────────────────────────

/**
 * A PUBLISHED HEX IS ALREADY AN sRGB TRIPLE, and the whole tint happens there.
 *
 * `lerpHex` interpolates sRGB BYTES, so the mix below is done in sRGB and the
 * only transfers the shader pays for are the two at its ends — the vertex
 * colour in, the result back out. Converting `FRESH` and the two pales to
 * linear and back would be four more `pow`s a fragment for a value that is a
 * constant: the byte over 255 IS the sRGB coordinate the mix wants.
 *
 * `Color.setStyle(hex, SRGBColorSpace)` is still what reads a hex on the
 * linear side of this file; it is not needed on the sRGB side, and calling it
 * and inverting it would only re-introduce the rounding it does.
 */
function toSRGB(hex: string): [number, number, number] {
  const v = (i: number): number => parseInt(hex.slice(i, i + 2), 16) / 255;
  return [v(1), v(3), v(5)];
}

/**
 * THE ENTRANCE CURVE IN A SHADER, AND WHY IT IS SOLVED RATHER THAN SAMPLED.
 *
 * `CURVE.enter` is `bezier(0.22, 0.61, 0.36, 1)` and the CPU builds it as a
 * 513-entry lookup table, because on the CPU a table is cheaper than a solve.
 * On a GPU it is the other way round: a 513-texel texture is a sampler, a
 * binding and a filter mode, and the solve is a dozen multiply-adds.
 *
 * Newton from `s = x`, and the iteration count is MEASURED against the CPU
 * curve over 1,001 samples: 1 step 1.8e-2, 2 steps 3.2e-4, **3 steps 1.0e-7**,
 * 4 steps 1.2e-14. Three. The x-derivative of this curve runs 0.627 to 1.92
 * over [0,1] and never approaches zero, so the divide needs no guard —
 * checked, not assumed.
 */
const CB = (a: number, b: number): [number, number, number] => [
  1 - 3 * b + 3 * a,
  3 * b - 6 * a,
  3 * a,
];
const [AX, BX, CX] = CB(0.22, 0.36);
const [AY, BY, CY] = CB(0.61, 1);

const enterCurve = Fn(([x]: [AnyNode]): AnyNode => {
  const s = x.toVar();
  for (let k = 0; k < 3; k++) {
    const bx = s.mul(AX).add(BX).mul(s).add(CX).mul(s);
    const dbx = s.mul(3 * AX).add(2 * BX).mul(s).add(CX);
    s.subAssign(bx.sub(x).div(dbx));
  }
  const t = clamp(s, 0, 1);
  return t.mul(AY).add(BY).mul(t).add(CY).mul(t);
});

/**
 * THE INK IS A STEP UNDER ITS OWN ROOF, so it moves when the roof does.
 *
 * `lib/city/buildings.ts` §inkFor is not a fraction of the roof — it is a
 * Rec.601 luminance STEP below it, clamped into [32, 52] of 255, *"so the
 * outline disappears at one end and turns into a poster outline at the other"*
 * over the measured 32-entry palette. Lift a dark roof 0.55 of the way to the
 * ochre and that clamp lands somewhere else entirely.
 *
 * MEASURED over eight tones spanning the aerial palette, worst channel against
 * `inkFor(tinted roof)`:
 *
 *     leave the ink alone           66 of 255   (46 on the page at INK_W0)
 *     mix the ink toward the ochre  45 of 255
 *     evaluate `inkFor` on the tinted roof   — exact
 *
 * So it is evaluated. What is applied is the **DIFFERENCE** between `inkFor`
 * of the tinted roof and `inkFor` of the untinted one, added to the ink the
 * CPU already baked — so a settled frame subtracts a provable zero and the
 * outline every other camera draws is byte for byte what it was, while a
 * fresh roof's outline moves by exactly what the published rule says.
 */
const inkOf = Fn(([srgbRoof]: [AnyNode]): AnyNode => {
  const L = dot(srgbRoof, vec3(0.299, 0.587, 0.114)).mul(255);
  /* `inkFor` scales its [32, 52] band by `s = (1 - k) / (1 - EDGE_SHADE)`,
     which OPENS the band for the two darker size rungs — and `EDGE_MPP`
     records that those rungs are NOT ported: this layer strokes at
     `EDGE_SHADE` and only there, where `s` is 1 by construction. So the band
     is the shipped [32, 52] and the scale is stated here rather than carried
     as a term that can only ever be one. */
  const d = min(float(INK_HI), max(float(INK_LO), L.mul(1 - EDGE_SHADE)));
  /* `inkFor` falls back to a flat shade where the roof has no luminance to
     step under; `max(L, 1)` is that same guard without a branch. */
  return srgbRoof.mul(max(float(0), float(1).sub(d.div(max(L, float(1))))));
});

/**
 * THE ATTRIBUTES A GEOMETRY HAS TO CARRY FOR ANY OF THIS TO WORK.
 *
 * Named here rather than spelled twice, because a typo in one of the two
 * places renders a city standing perfectly still and throws nothing.
 * `COLOUR` and `HEIGHT` are attributes the layer already had; `BORN` is the
 * one this file adds, and `ROOF_COLOUR` is the mesh's own `COLOUR` buffer
 * bound a second time onto the OUTLINE geometry, which costs no memory at all
 * — the line's vertices ARE roof-ring vertices.
 */
export const RISE_ATTR = {
  BORN: "aBorn",
  /** the vector from this vertex to its building's own centroid, world
   *  metres, over `OFF_RANGE` — see `THE WAVE IS PER BUILDING` */
  OFFSET: "aOff",
  HEIGHT: "aH",
  COLOUR: "color",
  ROOF_COLOUR: "aRoofCol",
} as const;

/**
 * ── THE WAVE IS PER BUILDING, AND THE FIRST CUT MADE IT PER VERTEX ────────
 *
 * `scene.ts` reads `dn` ONCE per footprint, off `tb.cx[i], tb.cy[i]` — the
 * CENTROID. The first version of this shader read it off each vertex's own
 * ground point, which is the same quantity everywhere except that a building
 * is not a point: two corners of one footprint land at different depths, get
 * different phases, and the building SHEARS as it rises.
 *
 * MEASURED, at the street stop (420 m across): a 60 m footprint spans 14 % of
 * the frame, so `dn` varies 0.14 across it, `d` by 0.077 and the eased rise by
 * about 0.28 — **17 m of tilt on a 60 m tower**, and the roof visibly leans.
 * At the block stop it is ~5 m and at the two wide stops it is under a pixel,
 * which is why the first captures did not show it.
 *
 * So each vertex carries the vector to its own building's centroid and the
 * projection is done THERE. It is a SIGNED 16-BIT PAIR — 4 bytes, the same
 * stride a float pair would need eight for — because the quantity is a
 * footprint's own half-extent, which nothing in a city approaches:
 * `OFF_RANGE` at 15 bits is 0.0625 m a step, and 0.0625 m of ground moves
 * `dn` by 0.00004 at the closest camera the renderer has.
 */
export const OFF_RANGE = 2048;

export interface RiseNodes {
  /** what every building material takes as its `positionNode` */
  readonly position: AnyNode;
  /** a mesh material's `colorNode`, for a surface that ages like a roof or
   *  like a wall. The material must then take `vertexColors: false` — this
   *  node reads the same attribute the default path would have. */
  colour(rule: FreshRule): AnyNode;
  /** the outline's `colorNode`: the baked ink, moved by exactly what the
   *  published `inkFor` says the tinted roof over it moves it */
  readonly inkColour: AnyNode;
  /** the frame's year as a byte offset; `undefined` is the settled present */
  setYear(yearByte: number | undefined): void;
  /** how far through the cohort's rise window, 0..1 — 1 is settled */
  setPhase(phase: number): void;
  /** the built-height exaggeration, so the shader can find the ground */
  setZexb(zexb: number): void;
  /** dev only: what the uniforms currently say */
  readonly state: () => { year: number; phase: number; wave: number; zexb: number };
}

/**
 * ONE SET OF NODES FOR THE WHOLE CITY.
 *
 * The uniforms are shared by all 139 chunks and every material on them, which
 * is the whole reason this is a factory and not a function called per mesh:
 * a year change then writes four numbers, not 139 x 10 of them, and the
 * materials that read them are not touched at all.
 */
export function riseNodes(): RiseNodes {
  /** the integer year, as a byte offset from the city's own epoch */
  const uYear = uniform(-1000);
  /** how far through the cohort's window, 0..1 */
  const uPhase = uniform(1);
  /**
   * 1 while a cohort is mid-rise, 0 otherwise — AND IT IS NOT A DUPLICATE OF
   * `uPhase`. The rise deficit is multiplied by it, so a settled frame
   * subtracts an exact zero from the baked position rather than a value that
   * happens to round to one. Nothing in the century then moves by a nanometre
   * because a bezier solved to 0.99999998.
   */
  const uWave = uniform(0);
  const uZexb = uniform(1);

  const born = attribute(RISE_ATTR.BORN, "float") as unknown as AnyNode;
  const aOff = attribute(RISE_ATTR.OFFSET, "vec2") as unknown as AnyNode;
  const aH = attribute(RISE_ATTR.HEIGHT, "float") as unknown as AnyNode;

  const bornYear = floor(born);
  /** the building's own draw, back out of the fraction — see `JIT_SPAN` */
  const draw = born.sub(bornYear).div(JIT_SPAN);
  /** 1 for a building of the frame's own year's cohort, 0 for every other */
  const inCohort = float(1).sub(step(0.5, bornYear.sub(uYear).abs()));

  /* ── THE WAVE, READ AT THE FOOTPRINT'S OWN CENTRE ────────────────────
     `lift` is what the bake added for this vertex's built height, so
     `positionLocal.y - lift` is the GROUND the building stands on and the
     projection below is of the point it is rising FROM. Reading the depth off
     the risen vertex instead would make the wave chase itself up the screen —
     a building half up would report itself nearer than it is and finish
     early, and the far-to-near order would come apart in the towers. */
  const lift = aH.mul(uZexb);
  const ground = vec4(
    positionLocal.x.add(aOff.x.mul(OFF_RANGE)),
    positionLocal.y.sub(lift),
    positionLocal.z.add(aOff.y.mul(OFF_RANGE)),
    1,
  );
  const clip = cameraProjectionMatrix.mul(modelViewMatrix.mul(ground));
  /** 0 at the FAR edge of the frame (the top of an axonometric screen), 1 at
   *  the near one — `scene.ts`'s `(H/2 - y) / H`, in clip space */
  const dn = float(0.5).sub(clip.y.div(clip.w).mul(0.5));
  const j = draw.sub(0.5).mul(2 * STAGGER_JITTER);
  const d = clamp(dn.add(j), 0, 1).mul(RISE_LEAD);
  const t = clamp(uPhase.sub(d).div(1 - RISE_LEAD), 0, 1);
  /** 0 at the moment a building starts arriving, 1 when it is standing */
  const rise = clamp(enterCurve(t), 0, 1);

  /* THE DEFICIT, and it is subtracted rather than the height rebuilt: at
     `uWave = 0` this is an exact zero and the position is the baked one, byte
     for byte, so every camera that is not inside a cohort's window renders
     exactly what it rendered before this file existed. */
  const deficit = lift.mul(float(1).sub(rise)).mul(inCohort).mul(uWave);

  /* ── AND A BUILDING THAT HAS NOT STARTED IS NOT A FLAT ROOF ────────────
     `scene.ts` says `if (rise <= 0.001) continue;` and on a CPU painter that
     is the end of it. A GPU prism of zero height is not nothing: it is the
     footprint's own roof polygon lying ON the terrain, in the ochre of new
     construction, and at the block camera the frame comes back with tan
     patches stamped across the burnt ground — measured, and the capture is
     the reason this exists.

     The GPU's own `continue` is the frustum: pushed `HIDE_M` scene units
     under the city, every triangle of the building is clipped and none of it
     rasterises. It is per BUILDING, not per vertex — `rise` is now read at
     the centroid — so a footprint leaves whole rather than stretching into a
     sliver on its way out. Same threshold as the page's, so the two agree on
     which buildings have not started. */
  const started = step(RISE_MIN, rise);
  const gone = float(1).sub(started).mul(inCohort).mul(uWave).mul(HIDE_M);
  const position = vec3(
    positionLocal.x,
    positionLocal.y.sub(deficit).sub(gone),
    positionLocal.z,
  ) as unknown as AnyNode;

  /** the rise, carried into the fragment stage for the pale ramp */
  const riseV = varying(rise.mul(inCohort).add(float(1).sub(inCohort)), "vRise");
  /** and the wave switch with it, so a settled frame's ramp is exactly none */
  const riseF = mix(float(1), riseV, uWave);

  /* ── THE AGE, AND THE OCHRE THAT DECAYS OVER IT ───────────────────────
     `uYear` sits at -1000 for the settled present, which puts every footprint
     in the city thousands of years the wrong side of the fresh window — the
     same "every year" the draw range answers with its full length. */
  const age = uYear.sub(bornYear);
  const inFresh = step(-0.5, age).mul(float(1).sub(step(FRESH_YEARS - 0.5, age)));
  const fr = pow(max(float(0), float(1).sub(age.div(FRESH_YEARS))), FRESH_GAMMA)
    .mul(inFresh);

  const FRESH_S = toSRGB(FRESH);
  const freshS = vec3(FRESH_S[0], FRESH_S[1], FRESH_S[2]);

  /* ── AND THE MIX IS DONE WHERE THE PUBLISHED ONE IS DONE ──────────────
     `lerpHex` interpolates sRGB BYTES; three.js works in linear light, and
     the same 0.55 in the two spaces is not the same colour. `sRGBTransfer
     OETF`/`EOTF` are three's own exact transfer — the toe included, the same
     pair `Color.setStyle(hex, SRGBColorSpace)` inverts — so this is the
     published mix and not a gamma-2.2 approximation of it.

     In the FRAGMENT stage on purpose. The tint is constant per building, so
     it could ride the vertex stage for free interpolation; the fabric has
     8,626,306 vertices and the frame has 959,040 pixels, so per fragment is
     the cheaper of the two by nine times AND is the one that tints the
     interpolated wall gradient rather than interpolating two tinted ends of
     it. */
  /** the two mixes, IN sRGB, over a colour that is already there */
  const tintS = (rule: FreshRule, srgb: AnyNode): AnyNode => {
    const p = toSRGB(rule.pale);
    return mix(
      mix(srgb, vec3(p[0], p[1], p[2]), float(1).sub(riseF).mul(rule.paleK)),
      freshS,
      fr.mul(rule.freshK),
    ) as unknown as AnyNode;
  };

  /* ── WHAT A MATERIAL IS ACTUALLY HANDED ─────────────────────────────
     `NodeMaterial.setupDiffuseColor` reads `colorNode` and then multiplies
     the vertex colour in AGAIN if the material declares `vertexColors`. The
     tint is not a multiply — it is a mix toward a fixed colour — so it cannot
     be expressed as a factor and has to consume the attribute itself. Hence
     `vertexColors: false` at the call site and the attribute read here: this
     is the same `attribute('color')` the default path would have bound, in
     the same order, with the material's own colour and map still supplied by
     `materialColor` (which is `material.color * map`, so the step gain
     `applyGain` writes and the roof grain both survive untouched). */
  const colour = (rule: FreshRule): AnyNode =>
    materialColor.mul(
      sRGBTransferEOTF(
        tintS(
          rule,
          sRGBTransferOETF(attribute(RISE_ATTR.COLOUR, "vec3")) as unknown as AnyNode,
        ),
      ),
    ) as unknown as AnyNode;

  const baked = attribute(RISE_ATTR.COLOUR, "vec3") as unknown as AnyNode;
  const roofColour = attribute(RISE_ATTR.ROOF_COLOUR, "vec3") as unknown as AnyNode;
  /* the roof over this segment of outline, in sRGB — read ONCE, because
     `inkFor` and the tint both want it there and a transfer is three `pow`s */
  const srgbRoof = sRGBTransferOETF(roofColour) as unknown as AnyNode;
  const inkColour = materialColor.mul(
    max(
      float(0),
      baked.add(
        sRGBTransferEOTF(inkOf(tintS(FRESH_ROOF, srgbRoof))).sub(
          sRGBTransferEOTF(inkOf(srgbRoof)),
        ),
      ),
    ),
  ) as unknown as AnyNode;

  return {
    position,
    colour,
    inkColour,
    setYear(yearByte: number | undefined): void {
      (uYear as Uni).value = yearByte === undefined ? -1000 : yearByte;
    },
    setPhase(phase: number): void {
      (uPhase as Uni).value = phase;
      (uWave as Uni).value = phase < 1 ? 1 : 0;
    },
    setZexb(zexb: number): void {
      (uZexb as Uni).value = zexb;
    },
    state: () => ({
      year: (uYear as Uni).value as number,
      phase: (uPhase as Uni).value as number,
      wave: (uWave as Uni).value as number,
      zexb: (uZexb as Uni).value as number,
    }),
  };
}
