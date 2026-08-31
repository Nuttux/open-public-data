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
export const CORNICE_H_FRAC = 0.035;
/** the floor on that fraction, world metres — see `CORNICE_H_FRAC` */
export const CORNICE_MIN_M = 0.24;
/** and its ceiling */
export const CORNICE_MAX_M = 0.72;

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
  let cor = opts.fascia && drop > 0 ? corniceProjM(hM) : 0;
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
export function hipPlan(ring: FormRing): HipPlan | null {
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
  let half = (run / PITCH_RUN) * 0.5;
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
  const plan = hipPlan(ring);
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
