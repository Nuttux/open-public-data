/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/roof-form.ts — THE THREE ROOF TREATMENTS, AS GEOMETRY.

   `lib/city/roofs.ts` puts three things on top of a footprint, and this is
   all three as vertices and triangles instead of as fills:

     the TRAY   a flat roof is a coping ring at the published height, with
                the deck inset by the declared parapet's thickness and
                dropped by its height (`drawTray`, `DE`).
     the HIP    the pitched cap of the pre-ordinance dwelling: the plan's own
                mitered inward offset, lifted (`drawHip`, `PITCH_RUN`).
     the CAP    the published second solid — a step, a mast, a spire: the
                octagon of the derived area swept by its class's profile,
                with a tray on its own top plate (`drawStep`).

   Nothing here is a three.js object. Each builder appends into a `FormSink`
   the caller owns, so the buffers, the materials and the meshes stay in
   `layers/buildings.ts` and this file can be tested with an array.

   ── WHAT A 2D RENDERER DOES THAT A MESH MUST NOT ────────────────────────
   Three of the Canvas versions' decisions are about PAINTING, and naming
   which of them do not cross is the point of this comment:

   · **the visible-edge test.** `drawTray` draws the parapet's inner face on
     exactly the edges whose outer face is turned away — true in 2D, where a
     fill lands on top of whatever is under it and a hidden face is wasted
     ink. Here the depth buffer answers that per pixel, so the inner face is
     built ALL THE WAY ROUND. Building half a ring would leave a hole the
     first time the bearing moved.
   · **the parapet's cast shadow** (`DE.castv`). One declared parapet under
     one declared light, painted as a polygon. The engine has a real sun and
     a real shadow map, and the meshes it makes both cast and receive, so
     painting the crescent again would darken the deck twice. NOT PORTED.
   · **the lambert buckets.** `PITCH_V` and the cap's `planeQuartile` fills
     ARE the sun, computed per facet on the CPU because a 2D fill has no
     normal. Flat shading under the real directional light is that same
     computation at the real bearing, so a slope here carries its roof's own
     colour and lets the light do it.

   `DE.deckv` and `DE.innerv` are kept, and the distinction is worth stating:
   they are not the sun. They are how much sky a surface at the bottom of a
   0.85 m tray can see, and no light in the rig — and no shadow map at this
   texel size — resolves 0.85 m of relief across a 10 m deck. They are the
   declared parapet's own occlusion and they belong in the vertex colour.

   ── EVERY NUMBER IS IN WORLD METRES ─────────────────────────────────────
   `trayW(px)`, `PITCH_MIN_RISE_PX`, `FSTEP_LIFT_PX`, `FSTEP_W_PX` and the
   `LR_FORM_PX` ramp are cut-offs on the DRAWN size, and a mesh is built once
   for every camera it will ever be seen from — it has no drawn size. So no
   builder here takes a camera, a scale or a pixel. Each exposes the
   world-metre quantity its caller's gate is actually about — `hipPlan()`
   returns the half-rise in metres, a cap's lift is `topM - baseM` and its
   width `2 * rad` — and accepts the gate's verdict as a 0..1 weight or as a
   metre floor in `opts`. The pixel arithmetic stays where the camera is.

   ── A REFUSAL IS DECIDED BEFORE THE FIRST VERTEX ────────────────────────
   A sink is append-only: half a tray cannot be taken back. So each builder
   settles its whole plan before it appends anything, and `false` means the
   sink was never touched and the flat roof the caller already built still
   stands. That is asserted, not intended — see `roof-form.test.ts`.

   ── AND NO PLAIN OBJECT WHERE A CLASS WAS WANTED ────────────────────────
   This file imports no three.js, which is the cheapest possible defence
   against the mistake that has cost this codebase a runtime failure more
   than once — a `Quaternion`, a `Vector2` — where a literal compiled and
   then failed on a method the literal did not have. There is nothing here to
   hand three.js at all.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  DE,
  PITCH_MAX_HALFRISE_M,
  PITCH_RUN,
  insetRing,
  ngonInsetScale,
} from "@/lib/city/roofs";

// ── what a builder writes into, and what it reads ───────────────────────────

/**
 * The caller's own buffers, seen through two calls.
 *
 * `vertex` takes the plan position and the two heights SEPARATELY —
 * `elevM` is ground elevation and `hM` is height above that ground — because
 * `layers/buildings.ts` bakes `elev * zex + h * zexb` with two different
 * exaggerations and rewrites that Y when the camera's band moves. A builder
 * that returned one combined height would silently break the step rewrite.
 *
 * Every vertical quantity a roof form has — a parapet's drop, a hip's rise, a
 * cap's lift — is BUILT height, so it belongs in `hM` and takes `zexb`.
 */
export interface FormSink {
  /** append one vertex; returns its index */
  vertex(
    x: number, y: number, elevM: number, hM: number,
    r: number, g: number, b: number,
  ): number;
  /** append one triangle over indices already returned by `vertex` */
  tri(a: number, b: number, c: number): void;
}

/** a footprint's ring inside a shared vertex array — `BldgTable.vx/vy/off` */
export interface FormRing {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly off: number;
  readonly n: number;
}

/** a colour in the renderer's WORKING space — `Color.setStyle(hex, SRGBColorSpace)` */
export type RGB = readonly [number, number, number];

/**
 * The scratch bound, and it is `drawTray`'s own: 64 vertices, above the 99.9th
 * percentile of the published footprints and below the block rings, which are
 * not roofs. A ring longer than this is refused rather than clipped.
 */
export const FORM_MAX_VERTS = 64;

/** `drawHip`'s bound. 12, not 64 — see `hipPlan`. */
export const HIP_MAX_VERTS = 12;

/** `drawTray`'s own dead band: under this the tray is not built at all */
export const TRAY_MIN_W = 0.002;

/**
 * THE PARAPET'S OUTER FACE — THE FASCIA — AND IT IS BUILT HERE NOW.
 *
 * `drawTray` paints a band at `DE.outerv` under the coping, and `DE.outerv`'s
 * own note is the measurement behind it: *"at 0.90 the roof edge resolves into
 * three legible steps — coping, fascia, wall — and a building stops ending in
 * one hard line."* It is the same 0.85 m of solid the parapet's inner face is,
 * seen from the other side.
 *
 * This file used to decline to build it, on the argument that the band IS the
 * top 0.85 m of the wall and a second quad in the same plane is z-fighting
 * rather than a fascia. The argument is right and the conclusion was wrong:
 * the answer is not to leave the band out, it is to put it OUTSIDE the wall.
 * `FASCIA_PROUD_M` is a hair of mitered outward offset — 1 cm, which is 0.03
 * of a pixel at the closest camera this project has a stop for and therefore
 * cannot be seen — and at that offset the two surfaces are not coplanar, the
 * depth buffer separates them cleanly, and the caller's wall needs no change
 * at all. A caller that lowered its wall instead would owe the tray a promise
 * it cannot keep: every refusal below would leave a 0.85 m hole.
 *
 * The value is still exported, because a caller that would rather grade its
 * own wall's top ring into the roof can have it without the geometry.
 */
export const TRAY_FASCIA_V = DE.outerv;

/** the parapet's own declared height, metres — what the fascia band spans */
export const TRAY_FASCIA_M = DE.parapet;

/**
 * How far outside the wall the fascia stands, world metres.
 *
 * MEASURED against this project's own four stops, whose scales it publishes:
 * 10.34 m per pixel at the city stop, 3.10 at the district, 1.03 at the block
 * and 0.3103 at the street. At 0.01 m the band is 0.032 of a pixel proud at
 * the closest of them — a thirtieth of a pixel, which no rasteriser resolves —
 * and 0.01 m is four orders of magnitude above the depth buffer's own
 * resolution over this scene's 400 km linear span.
 */
export const FASCIA_PROUD_M = 0.01;

/**
 * HOW FAR THE CORNICE OVERSAILS THE WALL, WORLD METRES — A DECLARED
 * CONVENTION, AND IT IS AN EXAGGERATION ON PURPOSE.
 *
 * `FASCIA_PROUD_M` above is 1 cm and its own note says why: a hair, enough to
 * separate two surfaces in the depth buffer and *"a thirtieth of a pixel,
 * which no rasteriser resolves"*. That is the correct number for a band whose
 * only job is not to z-fight. It is the wrong number for the thing this city's
 * buildings actually have at the top of the wall.
 *
 * A San Francisco cornice projects roughly 0.3 to 0.6 m. Drawn at 0.4 m it is
 * ONE PIXEL at the closest camera this project allows (`controls.ts` clamps
 * zoom at 26, which is 0.41 m per pixel), and one pixel is not a cornice — it
 * is the same hard line the building already ended in. The complaint this
 * answers, from the page: *"buildings look like colored cardboard boxes not
 * like real buildings"*, and *"even normal houses all flat?"*.
 *
 * So it is drawn at 1.0 m, about twice what it is, and that is a DRAWING
 * CONVENTION exactly as `heroes.ts` §CABLE_M is — that constant carries the
 * same argument in the same words: *"drawn honestly it would not exist. So it
 * is drawn at a size that reads"*. Same licence, same obligation to declare
 * it, and it is declared here.
 *
 * WHY IT IS WORTH THE EXAGGERATION AND A FACADE TILE IS NOT. A cornice is not
 * decoration on a wall, it is a change in the SILHOUETTE: it puts a horizontal
 * shadow across the top of every wall in the city, so the building's top edge
 * reads as an EDGE with something under it rather than as the place the colour
 * stops. That is a lighting event, and a lighting event survives being small
 * in a way that a texture mark does not.
 *
 * It costs one ring and two triangles an edge, because the coping ring is
 * moved outward rather than a slab being added outside it — see `trayForm`.
 *
 * ── AND IT IS A FRACTION OF THE HEIGHT, NOT ONE NUMBER ──────────────────
 * Shipped flat at 1.0 m first and photographed, and the picture said no. On
 * the Financial District towers it was right — they came out capped, with a
 * hard line under the crown, which is what this is for. On a Richmond row
 * house 7.6 m wide it was a PALE LID: 1 m proud on each side of a 10 m
 * building is a seventh of the plan turned into bright roof colour, and the
 * street read as a row of mushrooms.
 *
 * That is not a defect of the exaggeration, it is a defect of applying one
 * number to a population whose heights span two orders of magnitude — and the
 * buildings themselves do not do that either. A cornice is sized against its
 * own facade: a three-storey dwelling carries a small one and a twelve-storey
 * block carries a deep one. So the projection is a fraction of the wall it
 * crowns, floored so it never falls back under a pixel and capped so a tower
 * does not grow a hat.
 *
 * At the closest camera this project allows the floor should be about 1.3 px
 * and the ceiling about 4 px, which is the band this has to land in: under a
 * pixel it is the hard line it replaced, over about four it stops being a
 * cornice and starts being a canopy.
 *
 * ── AND THE CAMERA IT WAS DERIVED AT NO LONGER EXISTS ────────────────────
 * That band was solved for 0.41 m per pixel. The zoom clamp has since been
 * raised — `controls.ts` now allows 0.18 m per pixel — and these three numbers
 * were never re-derived against it. At the camera the reader can actually
 * reach today the old floor is 3.1 px and the old ceiling 7.8 px, which is
 * over the file's OWN stated limit by a factor of two: by the rule written
 * three paragraphs up, every building in the city had stopped wearing a
 * cornice and started wearing a canopy.
 *
 * Reported from the page, looking at Burnett Ave: *"roofs protude cause you
 * didnt give any form to facades or anything its all flat"*. The protrusion is
 * this, and the floor is the worst of it — it is a FLOOR, so the smallest
 * buildings get proportionally the most. A 7.6 m row house was carrying 0.55 m
 * on each side, which is fourteen per cent wider than the house.
 *
 * Re-derived at 0.18 m/px against the same 1.3–4 px band, and the fraction
 * halved so a three-storey dwelling reads as trimmed rather than capped.
 */
export const CORNICE_H_FRAC = 0.075;
/** the floor on that fraction, world metres — see `CORNICE_H_FRAC` */
export const CORNICE_MIN_M = 0.24;
/** and its ceiling */
export const CORNICE_MAX_M = 1.40;

/** the projection a wall of this height crowns itself with, world metres */
export function corniceProjM(hM: number): number {
  const p = hM * CORNICE_H_FRAC;
  return p < CORNICE_MIN_M ? CORNICE_MIN_M : p > CORNICE_MAX_M ? CORNICE_MAX_M : p;
}

// ── the value factors are written for sRGB bytes ────────────────────────────

/**
 * AND 0.905 IS NOT 0.905.
 *
 * `shade(hex, k)` in `terrain.ts` multiplies sRGB-ENCODED bytes. A vertex
 * colour is in the working (linear) space — `terrain.ts` §sRGB IN, LINEAR OUT
 * is the same trap from the other end, where the ground came out white-hot.
 * Multiplying a linear channel by 0.905 darkens by about 5 % of a step where
 * the Canvas darkens by 9.5 %, so a deck built the naive way is a deck that
 * is *nearly* there — the worst kind of wrong, because it looks plausible.
 *
 * The exact port is a round trip: encode, multiply the way `shade` does,
 * decode. The renderer has no tone mapping and writes sRGB out, so the pixel
 * that leaves is the byte the Canvas renderer would have written, and the
 * ratio between the coping and the deck is exactly the declared one.
 *
 * The clamp is `shade`'s own: it clips at 255. Nothing here lifts, so nothing
 * here clips, but a caller passing a value over 1 gets the Canvas behaviour
 * rather than an out-of-gamut vertex colour.
 */
export function shadeRGB(c: RGB, v: number): [number, number, number] {
  if (v === 1) return [c[0], c[1], c[2]];
  return [
    srgbToLinear(Math.min(1, linearToSrgb(c[0]) * v)),
    srgbToLinear(Math.min(1, linearToSrgb(c[1]) * v)),
    srgbToLinear(Math.min(1, linearToSrgb(c[2]) * v)),
  ];
}

function linearToSrgb(x: number): number {
  if (!(x > 0)) return 0;
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function srgbToLinear(x: number): number {
  if (!(x > 0)) return 0;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

// ── rings, offsets and triangles ────────────────────────────────────────────

const sMX = new Float32Array(FORM_MAX_VERTS);
const sMY = new Float32Array(FORM_MAX_VERTS);
const sMiter = { mx: sMX, my: sMY };
const sPX = new Float32Array(FORM_MAX_VERTS);
const sPY = new Float32Array(FORM_MAX_VERTS);
const rA = new Int32Array(FORM_MAX_VERTS);
const rB = new Int32Array(FORM_MAX_VERTS);
const rC = new Int32Array(FORM_MAX_VERTS);
const rD = new Int32Array(FORM_MAX_VERTS);
const rE = new Int32Array(FORM_MAX_VERTS);
/** the fascia's head and foot — see `TRAY_FASCIA_V` */
const rF = new Int32Array(FORM_MAX_VERTS);
const rG = new Int32Array(FORM_MAX_VERTS);
/** the cornice's soffit where it meets the wall — see `trayForm` */
const rH = new Int32Array(FORM_MAX_VERTS);
/** the plan pushed OUTWARD along the miter, for the cornice */
const sQX = new Float32Array(FORM_MAX_VERTS);
const sQY = new Float32Array(FORM_MAX_VERTS);
/** triples of RING indices, wound CCW in the plan */
const sTri: number[] = [];
const sTri2: number[] = [];
const sLive: number[] = [];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** twice the signed plan area of a ring — positive is counter-clockwise */
function area2(x: ArrayLike<number>, y: ArrayLike<number>, off: number, n: number): number {
  let a = 0;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    a += x[off + k] * y[off + k1] - x[off + k1] * y[off + k];
  }
  return a;
}

/**
 * DOES THE MITERED OFFSET RING SURVIVE THIS OFFSET — the two tests `drawHip`
 * makes, in the order it makes them and for the reason it gives.
 *
 * The first is the sign of the offset ring's area: past the inradius a convex
 * plan turns itself inside out. The second is the one that matters, and it is
 * why refusing concave plans outright was not an option: **a large share of
 * the pitched population is concave**, and a mitered offset of a concave plan
 * BOWTIES BEFORE ITS AREA CHANGES SIGN. A bowtie reverses an edge, so the
 * test is that every offset edge still runs the way its plan edge ran — O(n),
 * and it catches the one pale arrow standing out of a roof.
 *
 * `insetRing` returns the per-vertex miter DIRECTION at unit offset, so one
 * call serves every candidate offset and this is arithmetic.
 */
function offsetSurvives(
  ring: FormRing, mx: ArrayLike<number>, my: ArrayLike<number>, d: number, wind: number,
): boolean {
  const { x, y, off, n } = ring;
  let s2 = 0;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const x0 = x[off + k] + mx[k] * d, y0 = y[off + k] + my[k] * d;
    const x1 = x[off + k1] + mx[k1] * d, y1 = y[off + k1] + my[k1] * d;
    s2 += x0 * y1 - x1 * y0;
  }
  if (s2 * wind < 0) return false;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const ex = x[off + k1] - x[off + k], ey = y[off + k1] - y[off + k];
    const fx = ex + (mx[k1] - mx[k]) * d, fy = ey + (my[k1] - my[k]) * d;
    if (ex * fx + ey * fy < 0) return false;
  }
  return true;
}

/**
 * EAR CLIPPING, AND WHY A FAN IS NOT ENOUGH HERE.
 *
 * `layers/buildings.ts` fans its roofs and argues the case: a fan over a
 * concave ring lays triangles outside the polygon, but they are COPLANAR with
 * the roof, at the same height and in the same colour, so the depth buffer
 * resolves them into exactly the roof.
 *
 * **Not one surface in this file is coplanar with the roof.** A deck is
 * dropped 0.85 m, a ridge platform is lifted, a cap's plate stands metres
 * above its own base — so a fan's stray triangle is a membrane hanging across
 * the notch of a U-shaped plan, in mid-air, with its own silhouette. The
 * pitched population alone is over 40 % concave.
 *
 * O(n²) on at most 64 vertices, once per footprint at build time, is nothing.
 * Failure returns false and the CALLER REFUSES: a roof form that cannot be
 * closed is not drawn half-closed.
 */
function triangulate(
  x: ArrayLike<number>, y: ArrayLike<number>, n: number, out: number[],
): boolean {
  out.length = 0;
  if (n < 3) return false;
  const a2 = area2(x, y, 0, n);
  if (!(Math.abs(a2) > 1e-9)) return false;
  sLive.length = 0;
  for (let k = 0; k < n; k++) sLive.push(a2 > 0 ? k : n - 1 - k);
  while (sLive.length > 3) {
    const m = sLive.length;
    let cut = -1;
    for (let k = 0; k < m; k++) {
      const a = sLive[(k + m - 1) % m], b = sLive[k], c = sLive[(k + 1) % m];
      if (isEar(x, y, a, b, c)) {
        cut = k;
        break;
      }
    }
    if (cut < 0) return false;
    out.push(sLive[(cut + m - 1) % m], sLive[cut], sLive[(cut + 1) % m]);
    sLive.splice(cut, 1);
  }
  out.push(sLive[0], sLive[1], sLive[2]);
  return true;
}

function fanTris(n: number, out: number[]): void {
  out.length = 0;
  for (let k = 1; k + 1 < n; k++) out.push(0, k, k + 1);
}

function isEar(
  x: ArrayLike<number>, y: ArrayLike<number>, a: number, b: number, c: number,
): boolean {
  const ax = x[a], ay = y[a], bx = x[b], by = y[b], cx = x[c], cy = y[c];
  // convex at b, for a ring walked counter-clockwise
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (!(cross > 1e-12)) return false;
  for (let i = 0; i < sLive.length; i++) {
    const p = sLive[i];
    if (p === a || p === b || p === c) continue;
    const pxq = x[p], pyq = y[p];
    const d1 = (bx - ax) * (pyq - ay) - (by - ay) * (pxq - ax);
    const d2 = (cx - bx) * (pyq - by) - (cy - by) * (pxq - bx);
    const d3 = (ax - cx) * (pyq - cy) - (ay - cy) * (pxq - cx);
    if (d1 >= 0 && d2 >= 0 && d3 >= 0) return false;
  }
  return true;
}

/**
 * One quad as two triangles.
 *
 * EVERY FACE HERE IS WOUND TO FACE OUT — a horizontal one up, a vertical one
 * away from the solid, a parapet's inner face in toward its own deck. That is
 * not load-bearing for VISIBILITY, because every material in this engine is
 * `DoubleSide` (which is what lets a footprint ship two vertex rings instead
 * of four), and it is exactly why it has to be deliberate: with `DoubleSide` a
 * back-to-front face looks perfect and is silently wrong for anything that
 * reads the normal — the shadow pass, whose `shadowSide` defaults to the BACK
 * face for a double-sided material, and the ambient-occlusion pass, which the
 * engine builds from `transformedNormalView`.
 *
 * `flip` carries the ring's own plan winding, because a plan read as
 * (x, up, y) turns a counter-clockwise ring's face DOWNWARD. The sign is
 * settled here and nowhere else.
 */
function quad(sink: FormSink, a: number, b: number, c: number, d: number, flip: boolean): void {
  if (flip) {
    sink.tri(a, c, b);
    sink.tri(a, d, c);
  } else {
    sink.tri(a, b, c);
    sink.tri(a, c, d);
  }
}

/**
 * A ring's plan CCW order lays a face whose normal points DOWN once the plan
 * is read as (x, up, y) — so a face meant to be seen from above is emitted
 * reversed. One place, so the sign is settled once.
 */
function fillTop(sink: FormSink, idx: ArrayLike<number>, tri: readonly number[], ccw: boolean): void {
  for (let t = 0; t + 2 < tri.length; t += 3) {
    if (ccw) sink.tri(idx[tri[t]], idx[tri[t + 2]], idx[tri[t + 1]]);
    else sink.tri(idx[tri[t]], idx[tri[t + 1]], idx[tri[t + 2]]);
  }
}

function ringVerts(
  sink: FormSink, out: Int32Array,
  x: ArrayLike<number>, y: ArrayLike<number>, off: number, n: number,
  elevM: number, hM: number, col: RGB,
): void {
  for (let k = 0; k < n; k++) {
    out[k] = sink.vertex(x[off + k], y[off + k], elevM, hM, col[0], col[1], col[2]);
  }
}

// ── the tray ────────────────────────────────────────────────────────────────

export interface TrayOpts {
  /** how deep this family's cornice oversails, as a multiple of the ordinary
   *  one. A Victorian moulds; a post-war slab ends square. */
  corniceScale?: number;
  /**
   * the tray's ramp weight, 0..1. THE PIXEL GATE IS THE CALLER'S: this is
   * `trayW(the building's projected width)` in the Canvas path, and a mesh has
   * no projected width. Pass 1 for a fully open tray, which is what a GPU
   * renderer that builds one mesh for every camera normally wants; pass the
   * ramp's own value if the caller is rebuilding per band.
   *
   * At 0 the inset and the drop are both 0 and the roof is exactly the flat
   * fill it was — so the ramp is refused rather than floored, which is DE6's
   * distinction and the reason nothing here has a `Math.max` minimum.
   */
  w?: number;
  /**
   * Build the parapet's OUTER face — the fascia — as well, standing
   * `FASCIA_PROUD_M` outside the plan so it does not fight the wall behind
   * it. Off by default: it is 2 triangles an edge on every flat roof in the
   * city, and a caller that will never see a building from the side should
   * not pay for it. See `TRAY_FASCIA_V`.
   */
  fascia?: boolean;
  /**
   * THE COLOUR THE CORNICE WEARS, AND IT IS THE WALL'S AND NOT THE ROOF'S.
   *
   * Shipped taking the roof's colour, because it grew out of the parapet's
   * outer face and a parapet IS the roof turned up at its edge. Photographed
   * and measured, that cost the whole frame 3.4 points of warmth (R-B 22.0 to
   * 18.6 at the Inner Richmond's closest camera): the cornice is a lot of new
   * surface, this city's roofs are cool grey, and every pixel of it replaced a
   * warm wall or a warm street.
   *
   * The measurement pointed at something true rather than at a tuning knob. A
   * San Francisco cornice is not roof. It is the top of the FACADE — timber or
   * pressed metal, painted with the front it crowns — and painting it the
   * colour of the tar behind it was simply wrong. So the caller passes the
   * wall's colour and gets both the accurate answer and the warmth back.
   *
   * Omitted, it falls back to the roof colour, which is what the parapet's own
   * fascia was and is still right for a caller with no facade to match — the
   * cap layer sweeps second solids that have no wall of their own.
   */
  corniceRGB?: RGB;
}

/**
 * A FLAT ROOF IS A TRAY — the measured ring is the COPING, the deck is inset
 * by the parapet's declared thickness and dropped by its declared height.
 *
 * Three surfaces, all of them the caller's own roof colour at a declared
 * value: the coping annulus at the published height (RAW — this 0.4 m band is
 * the only place the palette entry survives undarkened), the parapet's inner
 * face all the way round at `DE.innerv`, and the deck at `DE.deckv`. With
 * `opts.fascia` a fourth joins them — the parapet's OUTER face at
 * `DE.outerv`, standing a hair proud of the wall. See `TRAY_FASCIA_V`.
 *
 * THE THREE COVER THE WHOLE PLAN, so a caller that gets `true` back drops its
 * own flat roof fan for that footprint: leaving it in puts a second surface in
 * the coping's exact plane, and two coplanar surfaces are z-fighting whatever
 * colour they are.
 *
 * `hM` is the PUBLISHED height and no vertex is built above it, which is
 * `roofs.ts` F2.4 made strictly stronger: the coping sits AT the measured top
 * and everything else below it.
 *
 * Refuses when the ring is shorter than a triangle or longer than the scratch,
 * when the ramp is closed, when the parapet is taller than the building, when
 * the 0.4 m inset eats the plan (a light well narrower than 0.8 m), or when
 * the deck cannot be closed. Every one of those leaves the flat roof standing.
 */
export function trayForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number, roof: RGB, opts: TrayOpts = {},
): boolean {
  const n = ring.n;
  if (n < 3 || n > FORM_MAX_VERTS) return false;
  const w = clamp01(opts.w ?? 1);
  if (!(w > TRAY_MIN_W)) return false;
  const ins = DE.thick * w;
  const drop = DE.parapet * w;
  /* a deck below the ground the building stands on is not a roof. The height
     byte is whole metres plus a quarter-metre residual, so this fires only on
     a published height under the declared parapet. */
  if (!(hM > drop)) return false;

  const a2 = area2(ring.x, ring.y, ring.off, n);
  if (!(Math.abs(a2) > 1e-9)) return false;
  const ccw = a2 > 0;

  insetRing(ring.x, ring.y, ring.off, n, sMiter);
  if (!offsetSurvives(ring, sMX, sMY, ins, ccw ? 1 : -1)) return false;
  for (let k = 0; k < n; k++) {
    sPX[k] = ring.x[ring.off + k] + sMX[k] * ins;
    sPY[k] = ring.y[ring.off + k] + sMY[k] * ins;
  }
  if (!triangulate(sPX, sPY, n, sTri)) return false;

  /* ── THE CORNICE IS THE COPING RING, MOVED OUT ─────────────────────────
     A slab hung outside the coping would be three new rings and six triangles
     an edge on every flat roof in the city. The same shape costs ONE ring and
     two triangles if the coping's own outer edge is what oversails: the band
     at the published top simply starts `CORNICE_PROJ_M` further out, its
     outer face is the fascia that was already being built there, and the only
     thing genuinely new is the SOFFIT that closes the underside.

     `sQ` is the plan pushed outward along the same miter `sP` was pushed
     inward along. With no fascia asked for, the projection is zero and `sQ`
     IS the plan — so a caller that does not want a cornice gets byte-for-byte
     the geometry it got before.

     The outward offset is tested the same way the inward one is, with the
     sign flipped. A mitered push outward cannot invert a convex corner but a
     concave one can pinch, and a pinched ring here would put the coping band
     inside out. On refusal the projection drops to zero and the roof is the
     tray it always was rather than a broken one.

     THE SIGN IS THE WHOLE OF IT, AND IT WAS WRONG TWICE. `sQ` is built at
     `-cor` along the miter, so that is the offset `offsetSurvives` has to be
     asked about — passing `+cor` asks whether the ring survives being pushed
     INWARD, which is a different question with a different answer. And the
     winding argument does not flip: an outward offset GROWS the area and
     keeps its sign, exactly as a surviving inward one does, so it is the same
     `ccw ? 1 : -1` the deck uses. Passing both wrong cancelled into a refusal
     that was silent, and the test below went on passing because it asserted
     the fascia's old position — which is what a refused cornice leaves. */
  let cor = opts.fascia && drop > 0 ? corniceProjM(hM) * (opts.corniceScale ?? 1) : 0;
  if (cor > 0 && !offsetSurvives(ring, sMX, sMY, -cor, ccw ? 1 : -1)) cor = 0;
  for (let k = 0; k < n; k++) {
    sQX[k] = ring.x[ring.off + k] - sMX[k] * cor;
    sQY[k] = ring.y[ring.off + k] - sMY[k] * cor;
  }

  /* ── decided; from here on the sink is written ────────────────────────
     FIVE RINGS AND NOT THREE, because a value has to be flat across a face.
     A vertex colour interpolates, so sharing the coping's inner edge with the
     top of the parapet's inner face would gradient the inner face from the
     raw colour down to `DE.innerv` — the gouache move this renderer is built
     on is three FLAT bands and no gradient. Rings are cheap; a gradient down
     the inside of every parapet in the city is not. */
  const raw: RGB = roof;
  const innerC = shadeRGB(roof, DE.innerv);
  const deckC = shadeRGB(roof, DE.deckv);
  /* the coping's OUTER ring is the cornice's top once the band oversails, so
     it carries the cornice's colour out there and the roof's colour stays on
     the inner edge where the roof actually starts. At `cor` = 0 the two rings
     are the same place and this is the plain coping it always was. */
  const copingOut: RGB = cor > 0 ? (opts.corniceRGB ?? roof) : raw;
  ringVerts(sink, rA, sQX, sQY, 0, n, elevM, hM, copingOut);                // coping, outer
  ringVerts(sink, rB, sPX, sPY, 0, n, elevM, hM, raw);                      // coping, inner
  ringVerts(sink, rC, sPX, sPY, 0, n, elevM, hM, innerC);                   // inner face, top
  ringVerts(sink, rD, sPX, sPY, 0, n, elevM, hM - drop, innerC);            // inner face, foot
  ringVerts(sink, rE, sPX, sPY, 0, n, elevM, hM - drop, deckC);             // the deck

  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    // the coping band, looking up
    quad(sink, rA[k], rA[k1], rB[k1], rB[k], ccw);
    /* and the parapet's inner face, the whole way round — the depth buffer
       decides which of it a reader sees, not us. Wound top-k, foot-k, foot-k1
       so it looks IN across the deck, which is the side of it that exists. */
    quad(sink, rC[k], rD[k], rD[k1], rC[k1], false);
  }
  fillTop(sink, rE, sTri, ccw);

  /* ── AND THE FASCIA, OUTSIDE THE WALL RATHER THAN IN ITS PLANE ─────────
     Two more rings on the plan pushed `FASCIA_PROUD_M` OUTWARD along the same
     miter the deck was pushed inward along — the head at the published top,
     the foot a parapet down — both at `DE.outerv` of the roof, so the band is
     one flat value and does not gradient into the wall under it. Built the
     whole way round for the same reason the inner face is: which edges a
     reader sees is the depth buffer's answer at this bearing and not ours. */
  if (opts.fascia && drop > 0) {
    /* the face stands on `sQ` — at `cor` = 0 that is `FASCIA_PROUD_M`'s old
       job done by a ring that is already there, and at `CORNICE_PROJ_M` it is
       the cornice's own face. One code path, two readings. */
    const out = cor > 0 ? 0 : FASCIA_PROUD_M;
    for (let k = 0; k < n; k++) {
      sPX[k] = sQX[k] - sMX[k] * out;
      sPY[k] = sQY[k] - sMY[k] * out;
    }
    const fasciaC = shadeRGB(opts.corniceRGB ?? roof, DE.outerv);
    ringVerts(sink, rF, sPX, sPY, 0, n, elevM, hM, fasciaC);
    ringVerts(sink, rG, sPX, sPY, 0, n, elevM, hM - drop, fasciaC);
    /* ── AND THE SOFFIT, WHICH IS THE WHOLE POINT ─────────────────────────
       The underside of the projection, from the cornice's foot back to the
       wall it grows out of. It is the only genuinely new surface here and it
       is the one that does the work: it faces DOWN, so the rig's sun never
       reaches it and its hemisphere term returns the ground colour, and the
       result is a hard horizontal shadow across the top of every wall in the
       city. That line is what a reader sees as "this building has a top"
       rather than "the colour stops here".

       It carries the fascia's own value rather than a darker one on purpose:
       the darkness is the LIGHT's answer to a downward normal, not a painted
       one. Painting it dark as well would darken it twice, which is the
       mistake §the parapet's cast shadow already refuses for the deck.

       Built only when the projection survived — at `cor` = 0 the soffit has
       no width and would be a degenerate quad in the wall's own plane. */
    if (cor > 0) {
      ringVerts(sink, rH, ring.x, ring.y, ring.off, n, elevM, hM - drop, fasciaC);
    }
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      quad(sink, rF[k], rG[k], rG[k1], rF[k1], true);
      if (cor > 0) quad(sink, rG[k], rH[k], rH[k1], rG[k1], true);
    }
  }
  return true;
}

// ── the hip ─────────────────────────────────────────────────────────────────

/** what a plan supports, in world metres — the pixel gate is the caller's */
export interface HipPlan {
  /** the inward offset that survived: the ridge is the plan offset by this */
  readonly runM: number;
  /** the eave sits this far BELOW the published plane and the apex above it */
  readonly halfRiseM: number;
}

/**
 * THE RUN IS THE PLAN'S OWN INSCRIBED OFFSET, FOUND BY TRYING.
 *
 * A hip roof IS the straight skeleton of its plan, and a mitered inward offset
 * is that skeleton's construction: offset every edge inward by the run and the
 * offset ring IS the ridge. A long plan's ring collapses onto its centreline
 * and the cap comes out a gable with hipped ends; a squarer one keeps a ridge
 * platform. **Nothing chooses between those two — the plan does.**
 *
 * `area / perimeter` is a safe lower bound on the inradius but it is HALF the
 * answer for a square, which drew two thirds of the roof and made every ridge
 * a wide plateau. So the multipliers are walked downward and the first one
 * whose mitered ring survives is taken — see `offsetSurvives` for the two
 * tests and for why the second one is the one that matters.
 *
 * Returns null on the refusals `drawHip` makes: under 3 vertices, over 12
 * (above that a plan is not a house, and the edge-reversal test is the only
 * thing standing between a complicated ring and a bowtie on the roof), a
 * degenerate plan, or no surviving offset.
 *
 * ── THE CALLER'S TWO JOBS, AND THEY ARE NOT OPTIONAL ────────────────────
 * `halfRiseM` is exported rather than gated on because the Canvas path's
 * `PITCH_MIN_RISE_PX` is a cut-off on the DRAWN rise; the caller applies it as
 * `2 * halfRiseM * pxPerMetreOfBuiltHeight >= PITCH_MIN_RISE_PX`, or passes
 * the same floor in metres as `opts.minRiseM`.
 *
 * And a pitched building's WALL is the caller's too: in 2D the hip is painted
 * over the flat roof, so an eave half a rise below the published plane simply
 * covers it. On a mesh it does not — the flat roof fan would cut through the
 * slopes and stand out as a horizontal band. So a caller that pitches a
 * footprint asks for the plan FIRST, builds that footprint's wall to
 * `hM - halfRiseM`, skips its roof fan, and then calls `hipForm`.
 */
export function hipPlan(ring: FormRing, slopeDeg?: number): HipPlan | null {
  const { x, y, off, n } = ring;
  if (n < 3 || n > HIP_MAX_VERTS) return null;
  let a2 = 0;
  let per = 0;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const x0 = x[off + k], y0 = y[off + k], x1 = x[off + k1], y1 = y[off + k1];
    a2 += x0 * y1 - x1 * y0;
    per += Math.hypot(x1 - x0, y1 - y0);
  }
  const area = Math.abs(a2) * 0.5;
  if (!(per > 0) || !(area > 0)) return null;
  const wind = a2 >= 0 ? 1 : -1;
  insetRing(x, y, off, n, sMiter);
  const d0 = area / per;
  let run = 0;
  for (let c = 0; c < PITCH_RUN_MULT.length; c++) {
    const d = d0 * PITCH_RUN_MULT[c];
    if (offsetSurvives(ring, sMX, sMY, d, wind)) {
      run = d;
      break;
    }
  }
  if (!(run > 0)) return null;
  /* ── THE PLAN GIVES THE RUN; THE SCAN, WHERE IT HAS ONE, GIVES THE ANGLE ──
     `PITCH_RUN` is one declared run-over-rise for the whole population, which
     is the right shape for a rule derived from a matched-era measurement and
     the wrong one for a building that was actually measured. Handed a slope
     off `roofscan`, the rise is this plan's own run against that angle —
     `rise = run * tan(theta)` — and the plan still decides the horizontal
     geometry, the ridge and whether there is a ridge at all.

     F2.4 is untouched either way: the eave drops `half` below the published
     plane and the apex rises `half` above it, so the drawn surface's median
     is still the published median. A measured angle moves both ends of that
     symmetry together. */
  let half = slopeDeg !== undefined && slopeDeg > 0
    ? run * Math.tan(Math.min(60, slopeDeg) * Math.PI / 180) * 0.5
    : (run / PITCH_RUN) * 0.5;
  if (half > PITCH_MAX_HALFRISE_M) half = PITCH_MAX_HALFRISE_M;
  return { runM: run, halfRiseM: half };
}

/**
 * The multipliers `drawHip` walks. Private there and private here: a caller
 * has no use for them, and the offset they produce comes back as `runM`.
 */
const PITCH_RUN_MULT: readonly number[] = [1.95, 1.6, 1.3, 1.0];

export interface HipOpts {
  /**
   * a world-metre floor on the TOTAL rise. The Canvas path's cut-off is
   * `PITCH_MIN_RISE_PX` on the drawn rise; convert it at the call site with
   * the camera's own metres-to-pixels and pass it here, or leave it 0 and gate
   * on `hipPlan().halfRiseM` before calling.
   */
  minRiseM?: number;
  /**
   * the roof's MEASURED slope in degrees, where the survey has one.
   *
   * It has to be handed in as well as to `hipPlan`, because this function
   * rebuilds the plan for itself rather than trusting scratch left by an
   * earlier call — see the note on the miter below. Pass the same value to
   * both or the wall is built to one pitch and the roof drawn at another.
   */
  slopeDeg?: number;
}

/**
 * ONE HIPPED CAP — the mitered inward offset of the published ring, lifted.
 *
 * The eave sits `halfRiseM` BELOW the published plane and the apex ring the
 * same distance above it, so **the drawn surface's own median is the published
 * median to the centimetre**. That is `roofs.ts` F2.4 in its general form —
 * the drawn roof must not change the statistic it is drawn from — and it is
 * the whole reason a pitched cap is allowed on a population whose published
 * height statistic was measured over a pitched surface.
 *
 * WHO IS PITCHED IS NOT DECIDED HERE. `isPitched` in the material table owns
 * the population — the pre-ordinance single and multi-family dwelling — and
 * this function only draws. Nothing in this file widens it.
 *
 * The ridge platform is FILLED, which the Canvas version does not do and does
 * not need to: in 2D the flat roof it is painted over shows through the offset
 * ring at the published colour. On a mesh that hole is a hole into the
 * building. When the offset ring has collapsed onto its own centreline there
 * is no platform to fill and none is built — **that is a gable, and it is the
 * plan's answer rather than a special case.**
 */
export function hipForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number, roof: RGB, opts: HipOpts = {},
): boolean {
  const plan = hipPlan(ring, opts.slopeDeg);
  if (!plan) return false;
  const half = plan.halfRiseM;
  if (!(2 * half >= (opts.minRiseM ?? 0))) return false;
  // an eave below the ground the walls stand on
  if (!(hM - half > 0)) return false;

  const { x, y, off, n } = ring;
  /* `hipPlan` left the unit miter in the shared scratch and nothing has run
     since — but that is exactly the assumption that turns into a bug the day
     something is inserted between the two, so the miter is rebuilt here and
     the two calls stay independent. */
  insetRing(x, y, off, n, sMiter);
  for (let k = 0; k < n; k++) {
    sPX[k] = x[off + k] + sMX[k] * plan.runM;
    sPY[k] = y[off + k] + sMY[k] * plan.runM;
  }
  const apex2 = area2(sPX, sPY, 0, n);
  const ridge = Math.abs(apex2) > RIDGE_MIN_AREA2;
  if (ridge && !triangulate(sPX, sPY, n, sTri)) return false;

  // ── decided ──────────────────────────────────────────────────────────
  ringVerts(sink, rA, x, y, off, n, elevM, hM - half, roof);   // the eave
  ringVerts(sink, rB, sPX, sPY, 0, n, elevM, hM + half, roof); // the apex
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    // eave-k, apex-k, apex-k1, eave-k1: up the slope first, so the face looks
    // up and away from the building rather than down into it
    quad(sink, rA[k], rB[k], rB[k1], rA[k1], false);
  }
  if (ridge) fillTop(sink, rB, sTri, apex2 > 0);
  return true;
}

/**
 * When the offset ring's area falls under this it has collapsed onto its own
 * centreline and there is no ridge platform to fill: the two slopes already
 * meet and a triangulation of it would be numerically meaningless. The
 * constant is TWICE the signed area, as `area2` returns it, so the threshold
 * is 0.01 m² of plan.
 */
const RIDGE_MIN_AREA2 = 0.02;

// ── the published second solid ──────────────────────────────────────────────

/**
 * One slot of the form table, as the geometry wants it. The caller reads it
 * out of `FormTable` — `bi` picks the building, `top`, `rad`, `ang`, `dx`,
 * `dy` and `prof` are this — and the same call serves a step, a mast and a
 * spire, exactly as one slot stream serves all three in the data.
 */
/**
 * A BOX STANDING ON A ROOF.
 *
 * The plant, the stair head, the tank and the lift overrun the 2023 survey
 * measured over each footprint — `pipeline/scripts/us_sf_city/roofscan/`. The
 * record publishes none of this and `layers/caps.ts` says so at length: its
 * own two chunks carry 512 second solids for 166,166 buildings and *"no tank,
 * no penthouse box"* anywhere in them. This is not that stream widened by
 * guesswork; it is a different, measured one.
 *
 * Five faces and no floor — the underside sits on the roof plane and is never
 * seen from a camera that cannot go below it. Eight vertices, ten triangles.
 * The sides take a value under the top so a box reads as a solid at the zoom
 * where it is four pixels across, which is most of the zooms it is drawn at.
 */
export function boxForm(
  sink: FormSink,
  cx: number, cy: number,
  w: number, d: number,
  elev: number, baseH: number, topH: number,
  c: RGB,
): boolean {
  if (!(w > 0.05) || !(d > 0.05) || !(topH > baseH)) return false;
  const hw = w / 2, hd = d / 2;
  const top = shadeRGB(c, 1.06);
  const side = shadeRGB(c, 0.78);
  const xs = [cx - hw, cx + hw, cx + hw, cx - hw];
  const ys = [cy - hd, cy - hd, cy + hd, cy + hd];
  const lo: number[] = [], hi: number[] = [];
  for (let k = 0; k < 4; k++) {
    lo.push(sink.vertex(xs[k], ys[k], elev, baseH, side[0], side[1], side[2]));
    hi.push(sink.vertex(xs[k], ys[k], elev, topH, side[0], side[1], side[2]));
  }
  /* the lid gets its own four, so its value does not bleed down the walls */
  const cap: number[] = [];
  for (let k = 0; k < 4; k++) {
    cap.push(sink.vertex(xs[k], ys[k], elev, topH, top[0], top[1], top[2]));
  }
  sink.tri(cap[0], cap[1], cap[2]);
  sink.tri(cap[0], cap[2], cap[3]);
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) & 3;
    sink.tri(lo[k], lo[n], hi[n]);
    sink.tri(lo[k], hi[n], hi[k]);
  }
  return true;
}

/**
 * ONE STEP OF A STEPPED BUILDING.
 *
 * A tower is not a slab. It steps back as it rises — wide at the pavement,
 * narrower higher up — and every footprint in this renderer was drawn as one
 * prism at one height because the published record has one height and nothing
 * else. The 2023 survey has the rest: `roofscan` reports the levels a building
 * steps through and the SHARE OF ITS FOOTPRINT still standing at each.
 *
 * The share is measured; the outline at each level is NOT. So the ring is
 * inset about its own centroid until its area matches — `k = sqrt(share)`,
 * because area goes as the square of a linear scale — rather than a plan being
 * invented that the scan never saw. A step is therefore always the building's
 * own shape, shrunk: right for the setback towers this is mostly drawn on, and
 * honestly wrong for the rare building that steps by losing a wing.
 */
export function stepForm(
  sink: FormSink,
  ring: FormRing,
  cx: number, cy: number,
  share: number,
  elevM: number, fromH: number, toH: number,
  wall: RGB, roof: RGB,
): boolean {
  const { x, y, off, n } = ring;
  if (n < 3 || n > FORM_MAX_VERTS) return false;
  if (!(toH > fromH) || !(share > 0.02) || share > 0.995) return false;
  const k = Math.sqrt(share);
  const lo: number[] = [], hi: number[] = [], cap: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = cx + (x[off + i] - cx) * k;
    const py = cy + (y[off + i] - cy) * k;
    lo.push(sink.vertex(px, py, elevM, fromH, wall[0], wall[1], wall[2]));
    hi.push(sink.vertex(px, py, elevM, toH, wall[0], wall[1], wall[2]));
    cap.push(sink.vertex(px, py, elevM, toH, roof[0], roof[1], roof[2]));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sink.tri(lo[i], lo[j], hi[j]);
    sink.tri(lo[i], hi[j], hi[i]);
  }
  /* the lid: a fan is safe here for the same reason the flat roof's is — the
     triangles are coplanar and the depth buffer resolves them into the cap */
  for (let i = 1; i + 1 < n; i++) sink.tri(cap[0], cap[i], cap[i + 1]);
  return true;
}

/**
 * A HOUSE, DRAWN AS A HOUSE.
 *
 * Everything else in this file derives a shape from a measurement: the tray is
 * the published ring, the hip is that ring's own straight skeleton, the step is
 * the share of footprint the survey found standing at a level. That is the
 * right instinct for a record-drawn map and it is the wrong one for a HOUSE,
 * because what makes a house read as a house is not the millimetres of its
 * particular roof — it is the type. A gable running the length of the plan, a
 * front that stands proud of the wall, an eave that oversails.
 *
 * So this is AUTHORED. The record decides WHICH buildings get it — the survey's
 * style where there is one, the roll's era where there is not — and how big it
 * is, from the published footprint and height. The FORM is a design, and the
 * numbers below are art direction, not findings:
 *
 *   the ridge runs the plan's LONG axis, which is how a row house sits on a
 *   25 ft lot; the pitch is a fixed 30 degrees because a house's roof reads by
 *   its silhouette and a measured 9-degree slope reads as flat; the bay stands
 *   0.9 m proud over the middle 55 % of the street frontage and carries its own
 *   little roof, because that is the one thing a San Franciscan would notice
 *   missing.
 *
 * F2.4 still holds and is not negotiable: the ridge rises `half` above the
 * published plane and the eave drops `half` below it, so the drawn surface's
 * median is the published median and no vertex stands over the measured top.
 */
/**
 * THE FASCIA'S DEPTH, WORLD METRES — DECLARED.
 *
 * A real barge board is about 25 mm of timber and 150-225 mm deep. 0.22 is
 * the deep end of that, chosen because what this band is actually standing
 * for is the board AND the shadow the overhang throws behind it, which from
 * overhead are one dark line and not two.
 */
/** the most rise a drawn house roof may have over its eave — see `gablePlan` */
export const HOUSE_MAX_HALFRISE_M = 3.2;
export const EAVE_FASCIA_M = 0.22;
/** how far a roof may oversail a PARTY wall — see `gableForm` §the overhang */
export const PARTY_EAVE_M = 0.12;
/** the ridge cap's half-width and how far it stands proud of the slopes */
export const RIDGE_HALF_M = 0.20;
export const RIDGE_LIFT_M = 0.05;
export const HOUSE_PITCH_DEG = 30;
export const HOUSE_BAY_PROUD_M = 0.9;
export const HOUSE_BAY_SHARE = 0.55;

/** the half-rise the authored gable will take on this plan, or 0 if it refuses */
/**
 * THE ONE PLACE THE HOUSE'S GEOMETRY IS DECIDED — AND IT IS ONE PLACE ON
 * PURPOSE.
 *
 * The caller needs the roof's half-rise BEFORE it builds the wall, because
 * the wall stops where the eave starts. The builder needs the same number
 * again a hundred lines later. Two functions computing it separately is
 * exactly the fault `hipForm` had — *"a caller that passes slope only to
 * `hipPlan` builds the wall to one pitch and draws the roof at another"* —
 * and it came back here in a new costume: `gableHalf` took `min(w, d)` for
 * the span while `gableForm` picked its span from `alongX`, which
 * `houseVary.cross` flips on one house in four. On those houses the gable's
 * eave landed BELOW the wall top and the building's flat deck showed all
 * round it as a pale apron.
 *
 * So there is one plan, both of them read it, and neither derives anything.
 */
export interface GablePlan {
  /** the plan's own centre, world metres */
  readonly ox: number; readonly oy: number;
  /** the unit vector along the plan's LONG axis, and its left normal */
  readonly ux: number; readonly uy: number;
  readonly nx: number; readonly ny: number;
  /** half-extents in that frame: `hu` along the long axis, `hv` across it */
  readonly hu: number; readonly hv: number;
  /** does the ridge run along the long axis? `houseVary.cross` turns it */
  readonly alongU: boolean;
  /** the roof's rise above the eave, world metres */
  readonly half: number;
}

/**
 * THE HOUSE'S PLAN, IN THE HOUSE'S OWN FRAME — AND THE FRAME IS THE WHOLE
 * POINT.
 *
 * ── WHY THERE IS ONE PLAN ────────────────────────────────────────────────
 * The caller needs the roof's half-rise BEFORE it builds the wall, because
 * the wall stops where the eave starts. The builder needs the same number
 * again a hundred lines later. Two functions computing it separately is
 * exactly the fault `hipForm` had — *"a caller that passes slope only to
 * `hipPlan` builds the wall to one pitch and draws the roof at another"* —
 * and it came back here in a new costume: `gableHalf` took `min(w, d)` for
 * the span while `gableForm` picked its span from the ridge axis, which
 * `houseVary.cross` flips on one house in four. So there is one plan, both
 * read it, and neither derives anything.
 *
 * ── AND WHY IT IS NOT AN AXIS-ALIGNED BOX ────────────────────────────────
 * Both of them used to work off `min`/`max` of x and y, which is a rectangle
 * aligned to the PROJECTION's axes and has nothing to do with the building.
 * San Francisco's street grid is not aligned to anything: the Sunset runs
 * about 25 degrees off, the Mission about 30, and only downtown's northern
 * blocks come close.
 *
 * MEASURED, on the 25 ft x 65 ft lot the west side is built out of:
 *
 *     bearing      axis-aligned box        area
 *      0 deg        7.6 x 20.0 m           1.00x
 *     10 deg       11.0 x 21.0 m           1.52x
 *     20 deg       14.0 x 21.4 m           1.97x
 *     25 deg       15.3 x 21.3 m           2.15x
 *     45 deg       19.5 x 19.5 m           2.51x
 *
 * At the Sunset's own bearing the roof was built on a plan TWICE the area of
 * the house and twice as wide, so every roof oversailed both its neighbours
 * by metres and the row interpenetrated. That is the grey shape that appeared
 * to show THROUGH a roof in every close capture — two roofs at nearly the
 * same height fighting for the depth buffer — and it is why the roofs looked
 * bloated against their own walls.
 *
 * The frame comes off the ring's LONGEST EDGE rather than from an inertia
 * tensor or a rotating-calipers minimum box. A published building footprint
 * is a rectangle or close to one, its longest edge is a real wall, and a wall
 * is the thing a roof is actually square to. The two agree on a true
 * rectangle exactly; on an L-plan the longest edge is still a wall and the
 * inertia axis is not.
 */
export function gablePlan(
  ring: FormRing, hM: number, gid = 0, pitchDeg?: number,
): GablePlan | null {
  const { x, y, off, n } = ring;
  if (n < 3 || n > FORM_MAX_VERTS) return null;

  /* the longest edge, which is the wall the roof squares up to */
  let ex = 1, ey = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = x[off + j] - x[off + i], dy = y[off + j] - y[off + i];
    const L2 = dx * dx + dy * dy;
    if (L2 > best) { best = L2; ex = dx; ey = dy; }
  }
  if (!(best > 1e-6)) return null;
  const eL = Math.sqrt(best);
  let ux = ex / eL, uy = ey / eL;
  let nx = -uy, ny = ux;

  /* the extents in that frame */
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const px = x[off + i], py = y[off + i];
    const a = px * ux + py * uy, b = px * nx + py * ny;
    if (a < u0) u0 = a; if (a > u1) u1 = a;
    if (b < v0) v0 = b; if (b > v1) v1 = b;
  }
  let du = u1 - u0, dv = v1 - v0;
  if (!(du > 2 && dv > 2)) return null;
  /* the longest EDGE need not lie along the longest EXTENT — a short ring
     with one long diagonal wall — so the frame is turned a quarter if it
     does not, and `u` is the long axis by construction from here on */
  if (dv > du) {
    const tx = ux, ty = uy;
    ux = nx; uy = ny; nx = -ty; ny = tx;
    const ta = u0, tb = u1;
    u0 = v0; u1 = v1; v0 = -tb; v1 = -ta;
    const t = du; du = dv; dv = t;
  }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const vary = houseVary(gid);
  const alongU = !vary.cross;
  const span = alongU ? dv : du;               // across the ridge
  /* ── AND THE PITCH DRAWN IS THE PITCH DECLARED ──────────────────────
     `houseVary` states the range and the reason — *"24-34 degrees, because
     under 22 a roof reads flat from this camera"* — and this used to
     multiply the resulting rise by 0.5, which drew every one of them at
     12-17 and put the whole stock under its own stated floor. The rise over
     half a span at an angle is `tan` of that angle, with nothing else in it.

     The cap moves with it. `PITCH_MAX_HALFRISE_M` is 1.3 and belongs to
     `hipPlan`, where it bounds a roof MEASURED off a scan and a runaway
     reading has to be refused; a house's pitch is authored and cannot run
     away. 3.2 m of half-rise is a 6.4 m ridge over the eave, which a
     two-storey house with a full attic actually has, and it only ever binds
     on a plan wider than about 11 m. */
  const half = Math.min(
    HOUSE_MAX_HALFRISE_M,
    (span / 2) * Math.tan(((pitchDeg ?? vary.pitch) * Math.PI) / 180),
  );
  if (!(half > 0.3) || !(hM - half > 0)) return null;
  return {
    ox: cu * ux + cv * nx, oy: cu * uy + cv * ny,
    ux, uy, nx, ny, hu: du / 2, hv: dv / 2, alongU, half,
  };
}

export function gableHalf(ring: FormRing, hM: number, gid = 0, pitchDeg?: number): number {
  return gablePlan(ring, hM, gid, pitchDeg)?.half ?? 0;
}

/**
 * ONE HOUSE IS NOT EVERY HOUSE.
 *
 * A single authored form applied to 28,000 footprints is the template problem
 * again wearing a gable. What varies is the DESIGN's own freedom — how steep
 * this roof is, how wide its front stands, whether it has one at all — not the
 * record, which says nothing about any of it. Keyed on the published id, so a
 * house is the same house in every session, at every zoom, in every year.
 *
 * The ranges are art direction and are stated as such: 24-34 degrees of pitch,
 * because under 22 a roof reads flat from this camera and over 36 it reads as
 * an A-frame; a front over 40-70 % of the frontage; and one house in six
 * without one, because a blockface where every single house projects reads as
 * machined rather than built.
 */
function houseVary(gid: number) {
  const h = mix32(gid ^ 0x7f4a7c15);
  const u = (k: number) => (((h >>> k) & 1023) / 1023);
  return {
    pitch: 24 + 10 * u(0),
    share: 0.40 + 0.30 * u(10),
    proud: 0.70 + 0.45 * u(20),
    bay: ((h >>> 5) & 7) !== 0,
    /* the eave oversails the wall, which is most of what separates a roof
       from a lid at this camera — it throws a line of shadow down the front */
    eave: 0.35 + 0.35 * u(4),
    /* one house in three carries a chimney, on one side or the other */
    chimney: ((h >>> 9) & 3) !== 0,
    chimEnd: ((h >>> 11) & 1) === 1,
    /* and one in four turns its gable across the plan instead of along it,
       so a blockface is not one ridge repeated down the street */
    cross: ((h >>> 13) & 3) === 0,
    /* the draw that decides gable or hip — compared against the family's own
       share, so the DECISION belongs to the family and the DRAW to the id */
    hipRoll: (((h >>> 22) & 1023) / 1023),
  };
}

/** murmur3's finaliser — `facade.ts` keeps its own; a gid is spatially ordered
 *  and an unmixed hash lays a gradient down a blockface instead of breaking it up */
function mix32(x: number): number {
  let v = x | 0;
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b);
  v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
  v ^= v >>> 16;
  return v >>> 0;
}

/**
 * A FRONT DOOR, AND WHY IT IS GEOMETRY RATHER THAN A TILE.
 *
 * `facade.ts` §why there is no entrance tile is right and is not overruled
 * here: a facade tile REPEATS in every bay, so a door drawn into one says
 * "a door in every bay", which is not what any building has. That argument
 * rules out a door in the ATLAS. It does not rule out a door at all.
 *
 * A house has exactly one, on the street face, and this draws exactly one —
 * a recess in the wall with a step at its foot, placed at the end of the
 * frontage rather than its middle, which is where a row house puts it.
 */
function doorOn(
  sink: FormSink, elevM: number,
  ax: number, ay: number, bx: number, by: number,
  hM: number, wall: RGB, gid: number,
): void {
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy);
  if (!(L > 3) || !(hM > 2.4)) return;
  const ux = dx / L, uy = dy / L;
  const nx = uy, ny = -ux;                       // into the wall
  const h = mix32(gid ^ 0x1b873593);
  const at = 0.16 + 0.20 * (((h >>> 3) & 255) / 255);   // toward one end
  const near = ((h >>> 2) & 1) === 1 ? at : 1 - at;
  const w = Math.min(1.5, L * 0.16), hi = Math.min(2.6, hM * 0.62);
  const t0 = Math.max(0, near * L - w / 2), t1 = Math.min(L, t0 + w);
  const dp = 0.18;
  const dark = shadeRGB(wall, 0.34), jamb = shadeRGB(wall, 1.10);
  const V = (t: number, dep: number, z: number, c: RGB): number =>
    sink.vertex(ax + ux * t + nx * dep, ay + uy * t + ny * dep, elevM, z, c[0], c[1], c[2]);
  /* the opening itself, set back into the wall */
  const a0 = V(t0, dp, 0.02, dark), a1 = V(t1, dp, 0.02, dark);
  const a2 = V(t1, dp, hi, dark), a3 = V(t0, dp, hi, dark);
  sink.tri(a0, a1, a2); sink.tri(a0, a2, a3);
  /* the reveal down the sunlit jamb and across the head */
  const j0 = V(t0, 0, 0.02, jamb), j1 = V(t0, dp, 0.02, jamb);
  const j2 = V(t0, dp, hi, jamb), j3 = V(t0, 0, hi, jamb);
  sink.tri(j0, j1, j2); sink.tri(j0, j2, j3);
  const k0 = V(t0, 0, hi, jamb), k1 = V(t1, 0, hi, jamb);
  const k2 = V(t1, dp, hi, jamb), k3 = V(t0, dp, hi, jamb);
  sink.tri(k0, k1, k2); sink.tri(k0, k2, k3);
  /* and the step it stands on, which is what a stoop is at this size */
  const s0 = V(t0 - 0.1, -0.35, 0, jamb), s1 = V(t1 + 0.1, -0.35, 0, jamb);
  const s2 = V(t1 + 0.1, dp, 0.22, jamb), s3 = V(t0 - 0.1, dp, 0.22, jamb);
  sink.tri(s0, s1, s2); sink.tri(s0, s2, s3);
}

export function gableForm(
  sink: FormSink,
  ring: FormRing,
  elevM: number,
  hM: number,
  roof: RGB,
  wall: RGB,
  opts: {
    pitchDeg?: number; bay?: boolean; gid?: number; eave?: number;
    /** the family's share of hipped roofs — see `familyHipShare` */
    hip?: number;
  } = {},
): boolean {
  const vary = houseVary(opts.gid ?? 0);
  /* ONE PLAN, and the caller sized the wall off the same call — see
     `gablePlan`. Nothing here re-derives the span, the rise or the frame. */
  const P = gablePlan(ring, hM, opts.gid ?? 0, opts.pitchDeg);
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv, alongU, half } = P;

  const eaveH = hM - half, ridge = hM + half;

  /* ── THE OVERHANG IS NOT THE SAME ON ALL FOUR SIDES ──────────────────
     A row house has neighbours on its two long walls and touches them: it
     is built to a party line, and a roof cannot oversail a wall it shares.
     The two SHORT ends — the street and the yard — are free, and that is
     where the eave actually projects. Drawing it on all four was what put
     each roof a metre into both neighbours even after the frame was fixed.

     `ovU` is the free end, `ovV` the party side, and the party side keeps a
     hair so the fascia below still has a face to stand on. */
  const ov = vary.eave * (opts.eave ?? 1);
  const ovU = ov, ovV = Math.min(ov, PARTY_EAVE_M);

  /* plan point in the house's own frame -> world */
  const V = (a: number, b: number, h: number, c: RGB): number =>
    sink.vertex(ox + ux * a + nx * b, oy + uy * a + ny * b,
                elevM, h, c[0], c[1], c[2]);

  const rl = shadeRGB(roof, 1.04), rd = shadeRGB(roof, 0.86);

  /* ── GABLE OR HIP, AND IT IS THE SAME ROOF EITHER WAY ─────────────────
     Same pitch, same eave, same ridge height. What changes is whether the
     ridge runs wall to wall — a gable, with a triangle of WALL closing each
     end — or stops short of both, with a fourth and fifth slope of ROOF
     coming down to the eave instead. From overhead that is the most legible
     difference one house can have from the next, and until now every house
     in the city had the first one.

     The hip's ridge stops `span / 2` in from each end, which is what makes
     the end slope fall at the same angle as the sides, clamped so a nearly
     square plan gets a short ridge rather than a crossed one. */
  const hipped = vary.hipRoll < (opts.hip ?? 0);
  /* half-extents of the ROOF, which oversails the plan */
  const ru = hu + ovU, rv = hv + ovV;
  /* along the ridge, and across it */
  const rAlong = alongU ? ru : rv, rAcross = alongU ? rv : ru;
  const hipRun = Math.min(rAcross, rAlong * 0.42);
  const rEnd = hipped ? rAlong - hipRun : rAlong;
  /* the wall's own half-extent along the ridge — the gable ends close on the
     WALL, not on the overhang */
  const wAlong = alongU ? hu : hv, wAcross = alongU ? hv : hu;

  /** (along-ridge, across-ridge) -> the frame's (a, b) */
  const A = (t: number, c: number): [number, number] =>
    alongU ? [t, c] : [c, t];
  const P4 = (t: number, c: number, h: number, col: RGB): number => {
    const p = A(t, c); return V(p[0], p[1], h, col);
  };

  /* the two long slopes */
  const a0 = P4(-rAlong, -rAcross, eaveH, rd);
  const a1 = P4(rAlong, -rAcross, eaveH, rd);
  const b1 = P4(rAlong, rAcross, eaveH, rl);
  const b0 = P4(-rAlong, rAcross, eaveH, rl);
  const r0 = P4(-rEnd, 0, ridge, rl), r1 = P4(rEnd, 0, ridge, rl);
  sink.tri(a0, a1, r1); sink.tri(a0, r1, r0);
  sink.tri(b0, r0, r1); sink.tri(b0, r1, b1);

  if (hipped) {
    /* the two end slopes, which is what makes it a hip */
    const he = shadeRGB(roof, 0.94);
    const p0 = P4(-rAlong, -rAcross, eaveH, he), p1 = P4(-rAlong, rAcross, eaveH, he);
    sink.tri(p0, P4(-rEnd, 0, ridge, he), p1);
    const q0 = P4(rAlong, -rAcross, eaveH, he), q1 = P4(rAlong, rAcross, eaveH, he);
    sink.tri(q1, P4(rEnd, 0, ridge, he), q0);
  } else {
    /* the gable end, both of them, closed on the wall in wall colour */
    const g0 = P4(-wAlong, -wAcross, eaveH, wall), g1 = P4(-wAlong, wAcross, eaveH, wall);
    sink.tri(g0, g1, P4(-wAlong, 0, ridge, wall));
    const h0 = P4(wAlong, -wAcross, eaveH, wall), h1 = P4(wAlong, wAcross, eaveH, wall);
    sink.tri(h1, h0, P4(wAlong, 0, ridge, wall));
  }

  /* ── THE ROOF HAS A THICKNESS, AND THAT IS MOST OF WHY IT READS AS ONE ──
     Everything above draws the roof as two triangles per slope: a sheet of
     paper with no edge. From almost overhead the sheet's silhouette is one
     hard line against the ground, and a hard line with nothing behind it is
     the exact thing that reads as cardboard.

     A real roof ends in a board — a fascia along the eave, a barge board up
     the rake — and under that board is the shadow of the overhang. Both are
     the same dark, so both are drawn as one skirt hung off the roof's whole
     boundary, walked as a loop so neither is special-cased. It costs six
     quads and it is the difference between a lid and a roof. */
  {
    const fc = shadeRGB(roof, 0.46);
    /* a hipped roof's boundary is the four eaves and nothing else — its ends
       come DOWN to the eave, so there is no rake to board */
    const loop: [number, number, number][] = hipped
      ? [[-rAlong, -rAcross, eaveH], [rAlong, -rAcross, eaveH],
         [rAlong, rAcross, eaveH], [-rAlong, rAcross, eaveH]]
      : [[-rAlong, -rAcross, eaveH], [rAlong, -rAcross, eaveH], [rAlong, 0, ridge],
         [rAlong, rAcross, eaveH], [-rAlong, rAcross, eaveH], [-rAlong, 0, ridge]];
    for (let k = 0; k < loop.length; k++) {
      const S = loop[k], E = loop[(k + 1) % loop.length];
      const t0 = P4(S[0], S[1], S[2], fc), t1 = P4(E[0], E[1], E[2], fc);
      const c0 = P4(S[0], S[1], S[2] - EAVE_FASCIA_M, fc);
      const c1 = P4(E[0], E[1], E[2] - EAVE_FASCIA_M, fc);
      sink.tri(t0, t1, c1); sink.tri(t0, c1, c0);
    }
  }

  /* ── AND A CAP ON THE RIDGE ──────────────────────────────────────────
     Where two slopes meet they are capped, and the cap stands a little proud
     of both. Without it the ridge is a value change between two shades of
     the same colour, which at this camera is the softest line on the roof
     and should be the sharpest — it is the roof's own horizon. */
  {
    const rcp = shadeRGB(roof, 0.74);
    const z = ridge + RIDGE_LIFT_M;
    const c0 = P4(-rEnd, -RIDGE_HALF_M, z, rcp), c1 = P4(rEnd, -RIDGE_HALF_M, z, rcp);
    const c2 = P4(rEnd, RIDGE_HALF_M, z, rcp), c3 = P4(-rEnd, RIDGE_HALF_M, z, rcp);
    sink.tri(c0, c1, c2); sink.tri(c0, c2, c3);
  }

  if (vary.chimney) {
    /* a stack standing off the ridge, which is the one vertical a house has
       and the thing that most says "not a warehouse" from directly above.
       On a hip it has to stand between the two ends or it comes out of an
       end slope in mid-air — 0.34/0.66 of the run is inside `hipRun`'s 0.42.
       A chimney is masonry, not rendered wall: it wants to be darker than
       everything around it or it reads as a white box stuck on the ridge. */
    const cs = 0.34, ch = ridge + 0.75;
    const f = vary.chimEnd ? (hipped ? -0.32 : -0.56) : (hipped ? 0.32 : 0.56);
    const t = f * rAlong;
    const cw = shadeRGB(wall, 0.52), ct = shadeRGB(wall, 0.40);
    const q: number[] = [], tp: number[] = [], cap: number[] = [];
    const ds: [number, number][] = [[-cs, -cs], [cs, -cs], [cs, cs], [-cs, cs]];
    for (const [da, db] of ds) {
      q.push(P4(t + da, db, ridge - 0.6, cw));
      tp.push(P4(t + da, db, ch, cw));
      cap.push(P4(t + da, db, ch, ct));
    }
    for (let k = 0; k < 4; k++) {
      const m2 = (k + 1) & 3;
      sink.tri(q[k], q[m2], tp[m2]); sink.tri(q[k], tp[m2], tp[k]);
    }
    sink.tri(cap[0], cap[1], cap[2]); sink.tri(cap[0], cap[2], cap[3]);
  }

  /* ── THE FRONT, WHICH IS A SHORT END AND NOT A LONG WALL ─────────────
     A row house presents its narrow end to the street; the long walls are
     party walls with a neighbour against them. So the bay stands proud of
     the end at `-hu` and the door goes in the same face. */
  const fu = -hu, fv = hv;
  if (opts.bay !== false && vary.bay) {
    /* the front stands proud over the middle of the frontage, and carries its
       own flat top so it reads from above as well as from the street */
    const p = vary.proud;
    const bw = hv * vary.share;                // half-width of the projection
    const bl = shadeRGB(wall, 1.06), bt = shadeRGB(roof, 1.02);
    const top = eaveH + 0.15;
    const ds: [number, number][] = [
      [fu, -bw], [fu, bw], [fu - p, bw], [fu - p, -bw],
    ];
    const q: number[] = [], tp: number[] = [], cap: number[] = [];
    for (const [da, db] of ds) {
      q.push(V(da, db, 0, bl));
      tp.push(V(da, db, top, bl));
      cap.push(V(da, db, top, bt));
    }
    for (let k = 0; k < 4; k++) {
      const m = (k + 1) & 3;
      sink.tri(q[k], q[m], tp[m]); sink.tri(q[k], tp[m], tp[k]);
    }
    sink.tri(cap[0], cap[1], cap[2]); sink.tri(cap[0], cap[2], cap[3]);
  }

  /* the door goes on the same face the bay stands proud of */
  doorOn(sink, elevM,
    ox + ux * fu + nx * -fv, oy + uy * fu + ny * -fv,
    ox + ux * fu + nx * fv, oy + uy * fu + ny * fv,
    eaveH, wall, opts.gid ?? 0);
  return true;
}

export interface CapPlan {
  /**
   * the AREA centroid, world metres: `BldgTable.cx + FormTable.dx`. The offset
   * exists because a building's ring is drawn about its VERTEX mean and a
   * stepped tower stands over the footprint's true centroid.
   */
  readonly cx: number;
  readonly cy: number;
  /** the plane the page already drew — the published median, built metres */
  readonly baseM: number;
  /** the measured top — `hgt_maxcm` — built metres */
  readonly topM: number;
  /** the octagon's circumradius, metres */
  readonly rad: number;
  /** its plan rotation: the footprint's own dominant edge direction, radians */
  readonly ang: number;
  /** how many sides — `FormTable.octN`, which is 8 */
  readonly n?: number;
  /** the class's profile, `u` up and `s` across, both ≤ 1. Null is the prism */
  readonly profile?: { readonly u: ArrayLike<number>; readonly s: ArrayLike<number> } | null;
}

export interface CapOpts {
  /**
   * how far the profile is opened, 0..1, where 0 is the prism the volume was
   * measured as and 1 is the class's own shape. The Canvas path ramps this on
   * the cap's DRAWN size (`LR_FORM_PX`..`LR_FORM_FULL`) so a dome does not
   * change shape on a threshold; a mesh is built once, so the default is the
   * full shape and the ramp is the caller's if it wants one.
   */
  form?: number;
  /** the cap's own side colour — the wall table's entry. Defaults to the roof */
  /** the shaft's colour at its HEAD, where it is not the roof's */
  side?: RGB;
  /** the shaft's colour at its FOOT. Defaults to `side`, which is the flat
   *  shaft this file drew before the grade existed. */
  sideFoot?: RGB;
  /** the top plate's tray weight — `trayW` on the PLATE's own drawn width */
  tray?: number;
  /** world-metre floors, from the caller's `FSTEP_LIFT_PX` / `FSTEP_W_PX` */
  minLiftM?: number;
  minWidthM?: number;
}

/** the profile scratch: the published profiles are at most 16 levels */
const CAP_MAX_LEVELS = 16;
/** and a slot's plan is an octagon; 16 is headroom, not a licence */
const CAP_MAX_SIDES = 16;
const capU = new Float32Array(CAP_MAX_LEVELS);
const capS = new Float32Array(CAP_MAX_LEVELS);
const capCos = new Float32Array(CAP_MAX_SIDES);
const capSin = new Float32Array(CAP_MAX_SIDES);
const capIdx = new Int32Array(CAP_MAX_LEVELS * CAP_MAX_SIDES);

/**
 * ONE SECOND SOLID — the octagon of the derived area, swept by the profile its
 * published class was given, standing on the plane the page already drew.
 *
 * Every building under this is ONE PRISM at the published median, which is the
 * right statistic for a building's MASS and the wrong one for its SILHOUETTE:
 * a median is by construction the height half the roof is below, so a tower, a
 * drum, a spire or a campanile — anything a MINORITY of the roof does — is
 * averaged out of the picture. This is the second plane three published
 * columns and a cell count support, and no more than that.
 *
 * ── THE MEASURED QUANTITY IS KEPT, NOT JUST NOT-EXCEEDED ────────────────
 * The cylinder is not an outline, it is a VOLUME: `A2 x (T - L)` is exactly
 * the volume the published mean measures standing above the median plane.
 * Carving a dome out of that cylinder throws a third of it away and the drawn
 * landmark would UNDER-read the file. So the radius is rescaled by
 * `1/sqrt(∫s² du)` on the BLENDED profile — the solid of revolution keeps the
 * cylinder's volume and the shape is the only thing that changed.
 *
 * THE TWO NUMBERS THAT WERE HERE PAIRED THE WRONG SHAPE WITH THE WRONG SUM.
 * They read "a hemisphere about 9 %, a cone about 73 %". The 73 % is a TRUE
 * cone (∫s²du = 1/3, so sqrt(3) = 73.2 % wider) and the 9 % is not a
 * hemisphere at all — a true hemisphere is 2/3 of its cylinder and comes out
 * 22.5 % wider. 9 % is what a published DOMED profile happens to measure,
 * because such a profile is a cylinder for the first half of its rise and only
 * then turns over. The distinction matters because these are the numbers a
 * reader would check the rescale against.
 *
 * Measured over the six curves the record this port was built against
 * publishes, the widening runs 7.8 % to 60.3 %: the domed one 9.5 %, the
 * spired one 60.3 % — not the 73.2 % of a true cone, because it too holds its
 * radius before it tapers.
 *
 * Refuses a cap with no lift, one under the caller's metre floors, a
 * degenerate plan, or a side count outside 3..16.
 */
export function capForm(
  sink: FormSink, plan: CapPlan, elevM: number, roof: RGB, opts: CapOpts = {},
): boolean {
  const N = plan.n ?? 8;
  if (N < 3 || N > CAP_MAX_SIDES) return false;
  const rad = plan.rad;
  if (!(rad > 0)) return false;
  const lift = plan.topM - plan.baseM;
  if (!(lift > 0)) return false;
  if (lift < (opts.minLiftM ?? 0)) return false;
  if (2 * rad < (opts.minWidthM ?? 0)) return false;

  /* ── the profile, opened by `form`, and the volume rescale ───────────── */
  let NR = 2;
  /* AND A SENTINEL THAT IS ALSO A LEGAL VALUE IS NOT PORTED. `drawStep` tests
     `NR === 2` to mean "no profile was taken", which is true of every profile
     the file ships — none has only two levels — and false in general: a cone
     is `u = [0, 1]`, `s = [1, 0]`, two levels, and the identity would silently
     overwrite it with the cylinder. The flag says what the test meant. */
  let shaped = false;
  const p = plan.profile;
  const w = clamp01(opts.form ?? 1);
  if (p && p.u.length > 1 && p.u.length <= CAP_MAX_LEVELS && p.u.length === p.s.length && w > 0.001) {
    NR = p.u.length;
    shaped = true;
    let vsum = 0;
    for (let r = 0; r + 1 < NR; r++) {
      const s0 = p.s[r] + (1 - p.s[r]) * (1 - w);
      const s1 = p.s[r + 1] + (1 - p.s[r + 1]) * (1 - w);
      vsum += ((p.u[r + 1] - p.u[r]) * (s0 * s0 + s0 * s1 + s1 * s1)) / 3;
    }
    const vs = vsum > 0.02 ? 1 / Math.sqrt(vsum) : 1;
    for (let r = 0; r < NR; r++) {
      capU[r] = p.u[r];
      capS[r] = (p.s[r] + (1 - p.s[r]) * (1 - w)) * vs;
    }
  }
  if (!shaped) {
    // the cylinder the volume was measured as — profile 0, the identity
    capU[0] = 0; capS[0] = 1;
    capU[1] = 1; capS[1] = 1;
  }

  // ── decided ──────────────────────────────────────────────────────────
  const TAU = Math.PI * 2;
  for (let k = 0; k < N; k++) {
    const th = plan.ang + (TAU * k) / N;
    capCos[k] = Math.cos(th);
    capSin[k] = Math.sin(th);
  }
  /* ── THE SHAFT IS A WALL AND IT IS GRADED LIKE ONE ────────────────────
     A cap took ONE flat colour up its whole shaft, and on the tall ones —
     the drums, the campaniles, the 97 m widest — that is a featureless slab
     of a single value standing over a building whose own walls are graded.
     `facades.ts` §A FACE HAS MATERIAL INSIDE IT states the rule this borrows:
     *"the top of it sees the whole sky dome and the foot of it sees the
     street... the grade from top to bottom is the only thing on the surface
     that says it is standing up"*, and it is an HONEST GLOBAL TREATMENT — the
     same grade, in the same direction, on every wall in the city.

     A shaft is a wall, so it takes that same grade rather than a second
     convention: `sideFoot` at the base, `side` at the head, interpolated on
     the profile's own `u`. The caller passes the two ends the wall under it
     was given, so a shaft and the wall it rises out of cannot come out at
     different values — which is what they were doing. */
  const side = opts.side ?? roof;
  const foot = opts.sideFoot ?? side;
  for (let r = 0; r < NR; r++) {
    const sc = rad * capS[r];
    const hh = plan.baseM + lift * capU[r];
    const t = capU[r];
    const cr = foot[0] + (side[0] - foot[0]) * t;
    const cg = foot[1] + (side[1] - foot[1]) * t;
    const cb = foot[2] + (side[2] - foot[2]) * t;
    for (let k = 0; k < N; k++) {
      capIdx[r * N + k] = sink.vertex(
        plan.cx + capCos[k] * sc, plan.cy + capSin[k] * sc,
        elevM, hh, cr, cg, cb,
      );
    }
  }
  /* THE SIDES. A band whose two rings have collapsed to the same point is
     skipped: a spire's profile closes to zero and its last band is a cone,
     but a profile with two coincident levels would emit degenerate triangles.
     No BOTTOM is built — the cap stands on the roof it was derived from, and
     the widest measured cap is well inside its own footprint, so its underside
     is interior and a face there would only ever be seen from inside. */
  for (let r = 0; r + 1 < NR; r++) {
    if (capS[r] < 1e-6 && capS[r + 1] < 1e-6) continue;
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      // low-k, high-k, high-k1, low-k1 — the sweep runs counter-clockwise, so
      // this is the band's outward face
      quad(sink, capIdx[r * N + k], capIdx[(r + 1) * N + k],
        capIdx[(r + 1) * N + k1], capIdx[r * N + k1], false);
    }
  }

  /* ── THE TOP PLATE, AND A CAP IS A ROOF ALL THE WAY DOWN ──────────────
     No roof in this renderer is drawn at its raw value: a deck is `DE.deckv`
     of the palette entry and the raw value survives only on the coping. The
     plate is a roof, so it is a tray like every other roof and takes not one
     new declared number — the octagon is regular and convex, so the inward
     offset `insetRing` has to miter on a footprint is here one scale about the
     cap's own axis (`ngonInsetScale`).

     Where the plate is too small for its own tray — the caller's `trayW` on
     the PLATE's drawn width, not the building's — it is one flat fan at the
     ramped value, which at the bottom of the ramp is exactly the flat plate
     the retired version drew. A cap and a roof the same size on screen are the
     same value by construction, and the two cannot drift apart again. */
  const tr = (NR - 1) * N;
  const ts = capS[NR - 1];
  if (!(ts > 0.02)) return true; // a spire closes to a point: no plate
  const plateR = rad * ts;
  const plateH = plan.baseM + lift * capU[NR - 1];
  const capTray = clamp01(opts.tray ?? 1);
  const drop = DE.parapet * capTray;
  const fin = ngonInsetScale(plateR, N, DE.thick * capTray);
  if (capTray > TRAY_MIN_W && fin > 0 && plateH - drop > plan.baseM) {
    const innerC = shadeRGB(roof, DE.innerv);
    const deckC = shadeRGB(roof, DE.deckv);
    const inR = plateR * fin;
    for (let k = 0; k < N; k++) {
      rA[k] = capIdx[tr + k];
      rB[k] = sink.vertex(plan.cx + capCos[k] * inR, plan.cy + capSin[k] * inR,
        elevM, plateH, roof[0], roof[1], roof[2]);
      rC[k] = sink.vertex(plan.cx + capCos[k] * inR, plan.cy + capSin[k] * inR,
        elevM, plateH, innerC[0], innerC[1], innerC[2]);
      rD[k] = sink.vertex(plan.cx + capCos[k] * inR, plan.cy + capSin[k] * inR,
        elevM, plateH - drop, innerC[0], innerC[1], innerC[2]);
      rE[k] = sink.vertex(plan.cx + capCos[k] * inR, plan.cy + capSin[k] * inR,
        elevM, plateH - drop, deckC[0], deckC[1], deckC[2]);
    }
    /* the plate's own ring is generated counter-clockwise in the plan by the
       sweep above, so the coping and the deck are wound to look up. */
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      quad(sink, rA[k], rA[k1], rB[k1], rB[k], true);
      quad(sink, rC[k], rD[k], rD[k1], rC[k1], false);
    }
    /* the deck is a fan and it is allowed to be one HERE and nowhere else in
       this file: the plate's plan is the regular convex octagon `form`
       declares, not a published ring, so a fan lays no triangle outside it. */
    fanTris(N, sTri2);
    fillTop(sink, rE, sTri2, true);
    return true;
  }
  // no tray: one flat plate, at the ramped deck value
  const flat = shadeRGB(roof, 1 - (1 - DE.deckv) * capTray);
  for (let k = 0; k < N; k++) {
    rA[k] = sink.vertex(plan.cx + capCos[k] * plateR, plan.cy + capSin[k] * plateR,
      elevM, plateH, flat[0], flat[1], flat[2]);
  }
  fanTris(N, sTri2);
  fillTop(sink, rA, sTri2, true);
  return true;
}
