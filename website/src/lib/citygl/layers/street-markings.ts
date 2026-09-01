/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/street-markings.ts — WHAT MAKES A GRID READ.

   `streets.ts` fills the two published polygons and `street-detail.ts` draws
   the published lines on top of them. Between the two there is still no GRID:
   at the district camera the carriageway, the footway and the ground inside
   the blocks arrive within a few points of one another, so the street network
   — the thing a reader navigates the whole picture by — is a pale wash on a
   pale field.

   This layer is the four things that turn that wash back into a street, and
   every one of them is derived from something the register publishes.

   ── 1. THE TONE, WHICH IS THE WHOLE COMPLAINT ────────────────────────────
   The right of way and the carriageway are re-laid here in tones chosen for
   SEPARATION rather than for fidelity to a single fill, and the separation is
   stated as numbers rather than as a taste. Relative luminance (the sRGB
   Y′ of the byte triple, which is what a reader's eye sorts these by):

       block interior   the terrain's own land palette   78.5 % … 94.1 %
       footway          ST_C_FOOT sunk 0.42 to ST_C_KERB      70.8 %
       carriageway      ST_C_ROAD sunk 0.50 to ST_C_KERB      59.8 %
       …unpaved         ST_C_RAW  sunk 0.50 to ST_C_KERB      61.9 %
       kerb             ST_C_KERB, drawn by `street-detail`   51.6 %
       markings         ST_C_FOOT, the palest tone published  84.9 %

   Every step is at least 7.7 points and none of the six is a colour invented
   here: each is a published palette member or a stated mix of two of them,
   and the two sink fractions are the only declared numbers in the stack.

   **The footway tone is the one real decision.** ST_C_FOOT at 84.9 % sits
   INSIDE the terrain's own range, so there is a slope at which the footway
   and the ground it runs through are the same value and the right of way
   simply dissolves. Sunk 0.42 toward its own published kerb it lands at
   70.8 % — below the DARKEST land tone the terrain palette holds — and the
   whole right of way is then darker than every block interior at every
   slope, which is what makes the grid a web rather than a wash. It lands
   within six bytes on every channel of `ST_C_MIX` — 1.6 points of luminance
   — the palette's own area-weighted street tone, which is a good sign it is
   the tone this palette already implies.
   `FOOT_SINK` is one constant: 0 restores the published fill exactly.

   ── 2. CROSSWALKS, AND WHY THEY ARE NOT WHERE TWO LINES CROSS ────────────
   NO CROSSWALK FILE IS PUBLISHED. What is published is better than a guess
   at one: `kind` is one byte per right of way — 0 a street SEGMENT, 1 an
   INTERSECTION, 14,397 and 7,794 of them — and `rdKerb` is one bit per
   roadway vertex saying whether the edge leaving it is a published kerb or
   the outer edge of the right of way. So an intersection's MOUTH is already
   in the record: it is the run of roadway edges that carry no kerb, because
   that is where the intersection polygon abuts the segment polygon next to
   it rather than turning a kerbed corner. A bar is laid along each such run,
   inside the intersection, spanning 86 % of the run's own chord.

   The brief's fallback — the point where two rank 0/1 centrelines cross —
   was deliberately not used, and the reason is worth stating: a crossing of
   two lines is a POINT. It has no width, no bearing for the bar to take and
   no mouth, so every one of those three would have to be invented, and it
   would place a crosswalk at a grade separation, where two published lines
   cross and no pedestrian ever does. The intersection polygon carries all
   three and asserts the crossing is at grade. The centreline network is
   still read here — it is what item 3 is built from.

   ── 2b. AND AT THE STREET CAMERA THE BAR BECOMES A LADDER ────────────────
   One solid bar of the palest published tone is the right mark at the two
   middle cameras — at a district's scale a crossing is a mark and not a
   drawing. At the street camera it is a slab: 3.16 m by twelve of pavement
   paint, with no internal structure, which reads as a plaza rather than as a
   crossing. What a reader recognises is the LADDER — the stripes, running the
   way the pedestrian walks.

   So the same mouth builds both, in two meshes, and the swap is on the
   STRIPE's own projected width rather than on the camera: a ladder whose
   stripes are under `MARK_PX` across is a bar drawn expensively, so the bar is
   what shows. Neither mark is more published than the other — the stripe's
   width and gap are DECLARED, as one fraction, next to the lane divider's,
   because a crossing stripe and a lane line are the same paint.

   ── AND THERE ARE NO KERB RAMPS, BECAUSE NONE ARE PUBLISHED ──────────────
   A kerb ramp is a real object with a real register in this city, and that
   register is NOT in this map's export: the shipped chunk kinds are `strt`,
   `strt-line`, `strt-misc`, `blocks`, `bldg`, `face`, `form`, `tree`,
   `canopy`, `parks`, `coast`, `water`, `terrain`, `surround`, `hero`, `cap`,
   `bridge`, `places`, `massing`, `strt-label` and `canopy-tint`, and not one
   of them carries a ramp. Placing one at every kerbed corner between two
   mouths would be a claim about 7,794 intersections that the record does not
   make, and it would be wrong at every corner that has no ramp. So the
   crossings run to the kerb and the kerb is what they meet.

   ── 3. THE LANE DIVIDER, ON THE RANKS THE RANK TABLE ITSELF SEPARATES ────
   A dashed mark down the published centreline of rank 0 and rank 1 only.
   `ST_W` — the per-class weight the Canvas strokes centrelines at — opens
   `[1.5, 1.5, 1.0, …]`: ranks 0 and 1 share a weight and 2 does not, so the
   ceiling at 1 is the rank table's own step and not a shortcut. The dash
   period and the mark's width are DECLARED, because no register publishes
   either, and both are declared as fractions of the city's own published
   median right of way (`w_p50`) so that a city of narrower streets gets a
   narrower mark without a line of code moving.

   ── 4. THE UNPAVED CARRIAGEWAY, WHICH THE GPU BUILD HAS BEEN DROPPING ────
   `periodOf` reads three published years per right of way — accepted,
   improved, kerbed — and `paved` is the second of them. 1,944 rights of way
   stand as graded earth at some point in the record before the Board orders
   them paved, and the GPU build has been drawing every one of them in the
   asphalt tone. Here the carriageway carries a VERTEX COLOUR, the century
   scrub flips the 1,944 between the two tones, and the layer is still one
   draw call. The span list is built from the two published years alone and
   comes out at exactly 1,944 on the shipped chunks — the register's own
   `unpaved` count — so a scrub touches at most that many spans, usually none.

   ── DEPTH, NOT HEIGHT ───────────────────────────────────────────────────
   `polygonOffset`, never a Y offset: in an axonometric projection a metre of
   height is also tens of pixels of SCREEN, so lifting a mark off the road to
   win a depth test slides it off the road it is a mark ON. `streets.ts`,
   `street-detail.ts` and `ground-detail.ts` all say this; it is the same
   trap and the same answer. The slots this layer takes, and they sit ABOVE
   the roadway because a mark is on top of it:

       9 8 7 5   shoreline, parks, water      ground-detail.ts
       4         right of way                 streets.ts
       3         FOOTWAY CONTRAST PASS        here   ← over the row wash
       2         carriageway                  streets.ts
       1.5       CARRIAGEWAY CONTRAST PASS    here   ← over the road wash
       1         island fill, stair band      street-detail.ts
       0         centreline spine             street-detail.ts
      -0.5       CROSSWALKS, LANE DIVIDER     here   ← over the spine
      -1         kerb, island edge, treads    street-detail.ts

   The kerb stays on top of everything, which is right: a kerb is not painted
   over. The two contrast passes are OPAQUE and sit nearer the camera than
   the surfaces they restate, so where a translucent wash is drawn underneath
   them it is hidden inside the right of way and shows only where this layer
   is gated off — which is the whole-city camera, where the wash is what the
   picture wants and this layer must not draw at all.

   ── THE WHOLE-CITY CAMERA DRAWS NOTHING OF THIS ─────────────────────────
   Gated to `step >= 1` for the reason `streets.ts` records in full: a pale
   sheet over the ground at the wide shot buries the terrain, and that has
   already happened once. The two mark meshes carry a second, tighter gate on
   their own projected width — a mark whose published width does not reach
   MARK_PX is not a mark, it is a sub-pixel shimmer, and the contrast pass is
   what carries the street at that camera.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";

import type { CityData } from "@/lib/city/data";
import {
  isKerbEdge,
  ST_C_FOOT,
  ST_C_KERB,
  ST_C_RAW,
  ST_C_ROAD,
  ST_KPROJ,
  type StreetCell,
  streetCellOf,
} from "@/lib/city/streets";
import type { PlaneCamera } from "../camera";
import type { CityLayer } from "../engine";

export interface StreetMarkingsLayerOptions {
  elevAt(x: number, y: number): number;
  /** the ground's exaggeration — every one of these lies ON the ground */
  zex: number;
}

/* ── THE TWO DECLARED TONE FRACTIONS ─────────────────────────────────────
   Each takes a published tone toward another published tone, so neither is a
   colour and both are one number a reader can move. See the header for what
   they land on and why the footway needs one at all. */
const FOOT_SINK = 0.42;
const ROAD_SINK = 0.5;

/** where a manifest publishes no street medians at all — a nominal street */
const NOMINAL_ROW_M = 20;
/** …and a nominal footway. Every city that publishes stats overrides both. */
const NOMINAL_FOOT_M = 3;

/** `kind` 1 is an INTERSECTION right of way; 0 is a segment. Published. */
const KIND_INTERSECTION = 1;

/* A mouth run shorter than this fraction of the median right of way is a
   sliver of the ring's own arithmetic and not a street; longer than the
   second, the run has crossed a plaza and the chord it spans is no longer a
   place a reader would cross. Both are fractions of the city's own published
   median so they travel to a city of narrower streets. */
const MOUTH_MIN_FRAC = 0.3;
const MOUTH_MAX_FRAC = 2.5;
/** the bar spans this much of its mouth, leaving the kerbed corners clear */
const XWALK_SPAN = 0.86;

/**
 * A CROSSING STRIPE AND A LANE LINE ARE THE SAME PAINT, SO THEY ARE ONE
 * DECLARED FRACTION.
 *
 * `LANE_FRAC` below is `1/24` of the city's own published median right of way
 * — 0.87 m on this city's 20.9 m — and it is declared there for the lane
 * divider. A crossing's stripe is reused from it rather than given a number of
 * its own, because two declared numbers where one will do is two things to
 * keep in step.
 *
 * The GAP is the stripe again, so the ladder is half paint and half road: a
 * pitch of 1.74 m on this city's median. Nothing publishes either; what makes
 * them honest is that they move with the city's own streets and that they are
 * stated here rather than written into the loop.
 */
const XWALK_GAP_K = 1;

/* DECLARED, AND DECLARED AS ONE: no register publishes the width of a lane
   marking or the length of its dash. Both are fractions of the city's own
   published median right of way — on a 20.9 m median that is a 0.87 m mark
   dashed 6.97 m on, 6.97 m off — and NEITHER IS A MEASUREMENT OF ANY STREET. */
const LANE_FRAC = 1 / 24;
const DASH_FRAC = 1 / 3;

/**
 * The projected width, in screen pixels, at which a mark is allowed to draw.
 *
 * Below it the geometry is narrower than the pixel grid it lands on, which is
 * not a faint mark but an aliased one that crawls as the camera moves. The
 * test is the FEATURE's own width against the camera, the same shape of gate
 * `streets.ts` states for its two tiers, and it is why the lane divider — a
 * mark under a metre wide — resolves only at the closest camera while the
 * crosswalk band, three metres of it, arrives a camera earlier.
 */
const MARK_PX = 0.7;

/** the depth slots, and the header's table says what each sits over */
/* the ground's own depth ladder — see `layers/streets.ts` §ONE DEPTH LADDER.
   These were +3 and +1.5, pushing two opaque surfaces BEHIND the ground they
   are laid on, which is why they came and went with the zoom. */
const OFF_FOOT = -4;
const OFF_ROAD = -4;
const OFF_MARK = -6;

// ── colour ──────────────────────────────────────────────────────────────────

/** `hexMix` in `streets.ts`, which does not export it */
function hexMix(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const m = (s: number): number =>
    Math.round((((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t));
  return "#" + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

/**
 * A published CSS tone as the renderer's own working-space triple.
 *
 * A vertex colour is NOT converted by the renderer — it is taken as already
 * being in the working space — so the sRGB→linear step has to happen here,
 * and `Color.setStyle(css, SRGBColorSpace)` is the one that does it. Handing
 * the bytes straight through would paint every carriageway in the city too
 * light by the gamma curve.
 */
function srgb(hex: string): [number, number, number] {
  const c = new Color();
  c.setStyle(hex, SRGBColorSpace);
  return [c.r, c.g, c.b];
}

// ── geometry ────────────────────────────────────────────────────────────────

/** running buffers; `col` is present only where a mesh carries vertex colour */
interface Buf {
  pos: number[];
  idx: number[];
  col: number[] | null;
}

function newBuf(vertexColour: boolean): Buf {
  return { pos: [], idx: [], col: vertexColour ? [] : null };
}

/** `ringIndex` in `streets.ts`: rings-per-feature + lengths → flat offsets */
function ringIndex(
  n: number,
  per: Uint8Array,
  len: Uint16Array,
): { off: Uint32Array; fo: Uint32Array } {
  const fo = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) fo[i + 1] = fo[i] + per[i];
  const R = fo[n];
  const off = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) off[r + 1] = off[r] + len[r];
  return { off, fo };
}

/**
 * One published ring → triangles.
 *
 * REAL `Vector2`s, not plain objects: `triangulateShape` strips a duplicated
 * end point with `points[l - 1].equals(...)`, so a `{ x, y }` cast compiles
 * and then throws at runtime on a method the value does not have. Both street
 * layers carry the same note for the same reason.
 */
function ringTris(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  b: Buf,
  rgb: readonly number[] | null,
): void {
  const m = to - from;
  if (m < 3) return;
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(x[from + k], y[from + k]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return;
  const base = b.pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = x[from + k];
    const wy = y[from + k];
    b.pos.push(wx, elevAt(wx, wy) * zex, wy);
    if (b.col && rgb) b.col.push(rgb[0], rgb[1], rgb[2]);
  }
  for (const t of faces) b.idx.push(base + t[0], base + t[1], base + t[2]);
}

/**
 * ONE MARK, AS FOUR CORNERS ON THE GROUND — a width in WORLD METRES.
 *
 * Not `THREE.Line`: its `linewidth` is IGNORED by the core profile of every
 * desktop driver, so a mark asked for at two pixels arrives at one, on every
 * machine, for ever. A width in metres is also the honest form — a painted
 * mark is a thing of a certain width standing in a certain place, and drawing
 * it that way means it thickens as a reader zooms in, which is what paint
 * does.
 */
function quad(
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  halfLen: number,
  halfW: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  b: Buf,
): void {
  const nx = -uy * halfW;
  const ny = ux * halfW;
  const lx = ux * halfLen;
  const ly = uy * halfLen;
  const base = b.pos.length / 3;
  const c: [number, number][] = [
    [cx - lx + nx, cy - ly + ny],
    [cx + lx + nx, cy + ly + ny],
    [cx + lx - nx, cy + ly - ny],
    [cx - lx - nx, cy - ly - ny],
  ];
  for (const [wx, wy] of c) b.pos.push(wx, elevAt(wx, wy) * zex, wy);
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * THE CROSSWALKS OF ONE PUBLISHED ROADWAY RING.
 *
 * A MOUTH is a maximal run of consecutive roadway edges that carry NO kerb
 * bit — the intersection's boundary with the segment beside it, as against
 * the kerbed corner between two mouths. The walk starts at a kerb edge so no
 * run can wrap the ring's own seam and be counted twice; a ring on which no
 * kerb at all is published defines no mouth and gets nothing, which is the
 * right answer rather than a fallback.
 */
function mouthBars(
  cell: StreetCell,
  a: number,
  b: number,
  cx: number,
  cy: number,
  band: number,
  minL: number,
  maxL: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  out: Buf,
  /** the same mouths as a ladder of stripes — see the header §2b */
  rungs: Buf,
  stripeW: number,
): void {
  const n = b - a;
  if (n < 3) return;
  let s = -1;
  for (let k = 0; k < n; k++) {
    if (isKerbEdge(cell, a + k)) {
      s = k;
      break;
    }
  }
  if (s < 0) return;

  const bar = (from: number, last: number): void => {
    const p = a + from;
    const q = a + ((last + 1) % n);
    const ax = cell.rdX[p];
    const ay = cell.rdY[p];
    const bx = cell.rdX[q];
    const by = cell.rdY[q];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L < minL || L > maxL) return;
    const ux = dx / L;
    const uy = dy / L;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    // the bar lies INSIDE the intersection, so the mouth's normal is taken
    // toward the ring's own centroid rather than guessed from the winding
    let nx = -uy;
    let ny = ux;
    if (nx * (cx - mx) + ny * (cy - my) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const ccx = mx + nx * band * 0.5;
    const ccy = my + ny * band * 0.5;
    const halfSpan = (L * XWALK_SPAN) / 2;
    quad(ccx, ccy, ux, uy, halfSpan, band / 2, elevAt, zex, out);

    /* ── AND THE SAME BAR AS A LADDER ─────────────────────────────────────
       The stripes run the way the pedestrian does — ALONG the mouth's inward
       normal, `band` deep, exactly the depth the bar has — and they are spaced
       across the chord. The count is the span over the pitch, and the whole
       run is re-centred on `ccx, ccy` so a ladder of four stripes is not
       shoved against one kerb by the remainder.
       Under two stripes there is no ladder to draw: one stripe on a mouth is
       not a crossing, it is a mark in the middle of the road, and the bar is
       the honest form at that width. The camera gate then never shows this
       mesh for that mouth because the bar is what is left. */
    const pitch = stripeW * (1 + XWALK_GAP_K);
    const rungCount = Math.floor((halfSpan * 2) / pitch);
    if (rungCount >= 2) {
      const first = -((rungCount - 1) * pitch) / 2;
      for (let i = 0; i < rungCount; i++) {
        const t = first + i * pitch;
        quad(
          ccx + ux * t, ccy + uy * t,
          nx, ny, band / 2, stripeW / 2,
          elevAt, zex, rungs,
        );
      }
    }
  };

  let from = -1;
  let last = -1;
  // j runs to n inclusive so the last edge visited is the kerb edge the walk
  // began at, which closes any run still open
  for (let j = 1; j <= n; j++) {
    const k = (s + j) % n;
    if (!isKerbEdge(cell, a + k)) {
      if (from < 0) from = k;
      last = k;
      continue;
    }
    if (from >= 0) {
      bar(from, last);
      from = -1;
    }
  }
}

/**
 * A surface or a mark, out of the running buffers.
 *
 * FLAT UP, like the ground and like the street surfaces: the slope is already
 * in the vertices, and a Lambert term taken off an ear-clipped triangulation
 * shades each ear differently — a road that flickers facet to facet down a
 * hill.
 */
function mesh(b: Buf, colour: string | null, offset: number): Mesh | null {
  if (!b.idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(b.pos), 3));
  if (b.col) g.setAttribute("color", new BufferAttribute(new Float32Array(b.col), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(b.idx), 1));
  const n = new Float32Array(b.pos.length);
  for (let v = 0; v < b.pos.length / 3; v++) n[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(n, 3));
  g.computeBoundingSphere();

  const c = new Color();
  if (colour) c.setStyle(colour, SRGBColorSpace);
  const m = new MeshLambertMaterial({
    color: colour ? c : 0xffffff,
    vertexColors: !!b.col,
    side: DoubleSide,
    polygonOffset: true,
    /* ── BOTH HALVES OF THE BIAS, AND THE SLOPE HALF IS THE ONE THAT
       KEEPS A ROAD OUT OF A HILL ────────────────────────────────────────
       `polygonOffsetUnits` is the CONSTANT half: a fixed nudge in depth,
       the same everywhere, which is all a flat street needs to sit on top
       of flat ground.

       `polygonOffsetFactor` scales the bias by the polygon's DEPTH SLOPE in
       screen space — how fast its depth changes from pixel to pixel. That is
       exactly the error a constant cannot cover: two near-coplanar surfaces
       drift apart in depth in proportion to how steeply they are turned away
       from the viewer, so on a hill the constant runs out and the ground wins
       pixels it should not. Daniel, on the Sunset and Twin Peaks slopes:
       *"its that the terrain 'gobbles' it sometimes, like i feel when theres
       height chnages its like swallowed by the ground."*

       ── THIS WAS ZEROED ONCE, ON A WRONG DIAGNOSIS ──────────────────────
       The slope term was set to 0 here on the theory that a view-dependent
       bias was what made the ground shimmer when the map moved. It was not.
       The shimmer was the camera: the frame was rasterised from a continuous
       centre, so every thin thing in the city landed on a new sub-pixel phase
       each frame — `camera.ts` §THE CAMERA THE FRAME IS DRAWN FROM has the
       measurements and the fix. With the camera on the pixel grid the eighth-
       of-a-pixel reversal count is 0%, WITH this term restored. Zeroing it
       bought nothing and cost every sloped street in the city. */
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const out = new Mesh(g, m);
  /* ── AND THE ORDER IS EXPLICIT, WHICH IS THE REST OF THE FIX ──────────
     three sorts TRANSPARENT objects by `renderOrder` first and by distance
     from the camera second. 143 of these ground washes were all sitting at the
     default order 0, so their order was being decided by the distance tie-break
     — and coplanar surfaces have no meaningful distance between them, so the
     tie-break's answer changed every time the camera moved. That is the
     shimmer, and it is why zeroing the depth-slope term above did not fix it on
     its own: `polygonOffset` never got to decide, the SORT did.

     So every rung of the ladder in `layers/streets.ts` §ONE DEPTH LADDER now
     carries its own order and nothing has to be guessed. The offset already
     encodes the rung, so the order is read straight off it. */
  out.renderOrder = -offset;
  /* seated on its rung by `engine.ts` §THE DEPTH LADDER HAD TO BECOME
     GEOMETRY — the bias this material asks for never arrives here */
  out.userData.wash = true;
  out.receiveShadow = true;
  out.castShadow = false;
  return out;
}

// ── the year ────────────────────────────────────────────────────────────────

/** a geometry whose draw range is a year, and the sorted years to find it by */
interface Gate {
  g: BufferGeometry;
  /** `idx.length` after the feature at this position was emitted */
  marks: number[];
  /** that feature's year, ascending; -1 where the record is silent */
  years: number[];
}

/** how many of `years` are drawn in `year` — they are sorted, so bisect */
function upTo(years: number[], year: number | undefined): number {
  if (year === undefined) return years.length;
  let lo = 0;
  let hi = years.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (years[mid] <= year) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** one span of the carriageway buffer, and the two published years that tone it */
interface RawSpan {
  /** vertex index, not float index */
  from: number;
  to: number;
  /** the year the Board is recorded ordering it paved; never 0 in this list */
  imp: number;
  /** the acceptance year; 0 means the record is silent and it exists always */
  yr: number;
  /** what is currently written into the colour attribute */
  raw: boolean;
}

// ── the layer ───────────────────────────────────────────────────────────────

export function streetMarkingsLayer(
  data: CityData,
  o: StreetMarkingsLayerOptions,
): (CityLayer & { meshes: Mesh[] }) | null {
  /** the exaggeration the vertices were BAKED at — see `layers/streets.ts`
   *  §THE EXAGGERATION IS A TRANSFORM, NOT A REWRITE */
  const bakedZex = o.zex;
  /* THE WIDTHS COME OUT OF THE CITY'S OWN MANIFEST, which is what lets this
     file sit in a city-free engine and still lay a believable bar: a city of
     12 m streets gets a narrower one without a line of code moving. */
  const stats = (data.manifest.streets as
    { stats?: { w_p50?: number; fw_p50?: number } } | undefined)?.stats;
  const rowP50 = stats?.w_p50 && stats.w_p50 > 0 ? stats.w_p50 : NOMINAL_ROW_M;
  const fwP50 = stats?.fw_p50 && stats.fw_p50 > 0 ? stats.fw_p50 : NOMINAL_FOOT_M;

  const footTone = hexMix(ST_C_FOOT, ST_C_KERB, FOOT_SINK);
  const roadRGB = srgb(hexMix(ST_C_ROAD, ST_C_KERB, ROAD_SINK));
  const rawRGB = srgb(hexMix(ST_C_RAW, ST_C_KERB, ROAD_SINK));

  /* A CROSSWALK IS AS WIDE AS THE FOOTWAY IT CONTINUES, which is the one
     width in this file that is published rather than declared: `fw_p50` is
     the city's own median footway band. */
  const bandW = fwP50;
  const laneW = rowP50 * LANE_FRAC;
  const dashLen = rowP50 * DASH_FRAC;
  const mouthMin = rowP50 * MOUTH_MIN_FRAC;
  const mouthMax = rowP50 * MOUTH_MAX_FRAC;

  interface Pack {
    cell: StreetCell;
    rw: { off: Uint32Array; fo: Uint32Array };
    rd: { off: Uint32Array; fo: Uint32Array };
  }
  const packs: Pack[] = [];
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const cell = streetCellOf(chunk);
    const n = cell.cls.length;
    if (!n) continue;
    packs.push({
      cell,
      rw: ringIndex(n, cell.rwN, cell.rwLen),
      rd: ringIndex(n, cell.rdN, cell.rdLen),
    });
  }

  const meshes: Mesh[] = [];
  const gates: Gate[] = [];
  /* the two contrast passes, gated on the camera STEP alone, and the marks,
     which carry a second gate on their own projected width */
  const surfaces: Mesh[] = [];
  const marks: { m: Mesh; w: number }[] = [];
  /** the crossing's two forms, and the width that decides between them */
  let xwPair: { bar: Mesh; ladder: Mesh; stripeW: number } | null = null;
  const rawSpans: RawSpan[] = [];
  let roadGeom: BufferGeometry | null = null;

  // ── the contrast pass ─────────────────────────────────────────────────────
  /* ONE MESH EACH, ACROSS EVERY CHUNK, because a draw call is the budget this
     layer is allowed to spend: the surfaces are two calls whatever the tiling
     of the city is, and the year order that makes the century scrub a draw
     range has to be global for that to hold. */
  const footB = newBuf(false);
  const roadB = newBuf(true);
  const footMarks: number[] = [];
  const roadMarks: number[] = [];
  const surfYears: number[] = [];
  {
    const ord: { p: number; i: number; y: number }[] = [];
    for (let p = 0; p < packs.length; p++) {
      const cell = packs[p].cell;
      for (let i = 0; i < cell.cls.length; i++) {
        // `periodOf`'s own rule: an undated right of way is drawn in every
        // year, and the count of those is on the page rather than hidden
        ord.push({ p, i, y: cell.yr[i] !== 0 ? cell.yr[i] : -1 });
      }
    }
    ord.sort((a, b) => a.y - b.y || a.p - b.p || a.i - b.i);

    for (const f of ord) {
      const { cell, rw, rd } = packs[f.p];
      const i = f.i;
      for (let r = rw.fo[i]; r < rw.fo[i + 1]; r++) {
        ringTris(cell.rwX, cell.rwY, rw.off[r], rw.off[r + 1], o.elevAt, o.zex, footB, null);
      }
      const v0 = roadB.pos.length / 3;
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        ringTris(cell.rdX, cell.rdY, rd.off[r], rd.off[r + 1], o.elevAt, o.zex, roadB, roadRGB);
      }
      const v1 = roadB.pos.length / 3;
      /* WHAT CAN EVER BE GRADED EARTH, AND IT IS COUNTABLE.
         `periodOf` reads a silent `imp` as "paved from the year it exists",
         so a right of way the record never says was improved is never
         unpaved; and where the Board's improvement year is not LATER than
         its acceptance year the unpaved window is empty. Both clauses, over
         the shipped chunks, select exactly 1,944 spans — which is
         `manifest.streets.stats.unpaved`, the register's own count of the
         rights of way drawn unpaved before the Board orders them paved. The
         other 566 that carry an `imp` never flip and are never listed. */
      const impY = cell.imp[i];
      if (impY !== 0 && (cell.yr[i] === 0 || impY > cell.yr[i]) && v1 > v0) {
        rawSpans.push({ from: v0, to: v1, imp: impY, yr: cell.yr[i], raw: false });
      }
      footMarks.push(footB.idx.length);
      roadMarks.push(roadB.idx.length);
      surfYears.push(f.y);
    }
  }

  const footMesh = mesh(footB, footTone, OFF_FOOT);
  if (footMesh) {
    meshes.push(footMesh);
    surfaces.push(footMesh);
    gates.push({ g: footMesh.geometry, marks: footMarks, years: surfYears });
  }
  const roadMesh = mesh(roadB, null, OFF_ROAD);
  if (roadMesh) {
    meshes.push(roadMesh);
    surfaces.push(roadMesh);
    gates.push({ g: roadMesh.geometry, marks: roadMarks, years: surfYears });
    roadGeom = roadMesh.geometry;
  }

  // ── the crosswalks ────────────────────────────────────────────────────────
  {
    const xwB = newBuf(false);
    const xwL = newBuf(false);
    const xwMarks: number[] = [];
    const xwLMarks: number[] = [];
    const xwYears: number[] = [];
    const ord: { p: number; i: number; y: number }[] = [];
    for (let p = 0; p < packs.length; p++) {
      const cell = packs[p].cell;
      for (let i = 0; i < cell.cls.length; i++) {
        if (cell.kind[i] !== KIND_INTERSECTION) continue;
        /* PAINT ARRIVES WITH THE PAVING. A crosswalk on a graded-earth
           crossing would be a claim the record does not make, so the bar
           takes the improvement year where the Board voted one and the
           acceptance year where it did not — `periodOf`'s `paved`, as a
           year rather than as a flag. */
        ord.push({
          p, i,
          y: cell.imp[i] !== 0 ? cell.imp[i] : cell.yr[i] !== 0 ? cell.yr[i] : -1,
        });
      }
    }
    ord.sort((a, b) => a.y - b.y || a.p - b.p || a.i - b.i);

    for (const f of ord) {
      const { cell, rd } = packs[f.p];
      const i = f.i;
      let cx = 0;
      let cy = 0;
      let cn = 0;
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        for (let v = rd.off[r]; v < rd.off[r + 1]; v++) {
          cx += cell.rdX[v];
          cy += cell.rdY[v];
          cn++;
        }
      }
      if (cn > 0) {
        cx /= cn;
        cy /= cn;
        for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
          mouthBars(
            cell, rd.off[r], rd.off[r + 1], cx, cy,
            bandW, mouthMin, mouthMax, o.elevAt, o.zex, xwB, xwL, laneW,
          );
        }
      }
      xwMarks.push(xwB.idx.length);
      xwLMarks.push(xwL.idx.length);
      xwYears.push(f.y);
    }

    /* THE TWO FORMS OF ONE CROSSING, and the gate that swaps them is on their
       own widths: `bandW` for the bar, the STRIPE's width for the ladder. So
       the bar carries the crossing from the district camera in, the ladder
       takes over the moment a stripe is wider than `MARK_PX`, and `xwPair`
       below makes them exclusive so a reader never sees a ladder printed on a
       slab of its own paint. */
    const m = mesh(xwB, ST_C_FOOT, OFF_MARK);
    const ml = mesh(xwL, ST_C_FOOT, OFF_MARK);
    if (m) {
      meshes.push(m);
      gates.push({ g: m.geometry, marks: xwMarks, years: xwYears });
    }
    if (ml) {
      meshes.push(ml);
      gates.push({ g: ml.geometry, marks: xwLMarks, years: xwYears });
    }
    if (m && ml) xwPair = { bar: m, ladder: ml, stripeW: laneW };
    else if (m) marks.push({ m, w: bandW });
  }

  // ── the lane divider ──────────────────────────────────────────────────────
  {
    const laneB = newBuf(false);
    const laneMarks: number[] = [];
    const laneYears: number[] = [];
    const lines = data.streetLines();
    /* the vertex runs are packed feature after feature, so the offsets are
       walked in FILE order even though the emission is in year order */
    const bases: Uint32Array[] = [];
    const ord: { c: number; i: number; y: number }[] = [];
    for (let c = 0; c < lines.length; c++) {
      const cell = lines[c];
      const nF = cell.cls.length;
      const base = new Uint32Array(nF);
      let off = 0;
      for (let i = 0; i < nF; i++) {
        base[i] = off;
        off += cell.len[i];
      }
      bases.push(base);
      for (let i = 0; i < nF; i++) {
        // rank 0 and rank 1 only — `ST_W`'s own step. `street-unimplied` is
        // classes 5 to 7 by construction and falls out of this test for free.
        if (cell.cls[i] > 1) continue;
        ord.push({ c, i, y: cell.yr[i] !== 0 ? cell.yr[i] : -1 });
      }
    }
    ord.sort((a, b) => a.y - b.y || a.c - b.c || a.i - b.i);

    const period = dashLen * 2;
    for (const f of ord) {
      const cell = lines[f.c];
      const b0 = bases[f.c][f.i];
      const m = cell.len[f.i];
      /* the phase carries ACROSS the vertices of one centreline, so a dash
         does not restart at every bend and the run reads as one rhythm */
      let ph = 0;
      for (let k = 0; k + 1 < m; k++) {
        const ax = cell.x[b0 + k];
        const ay = cell.y[b0 + k];
        const bx = cell.x[b0 + k + 1];
        const by = cell.y[b0 + k + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        // the published lines do carry repeated vertices, and a zero-length
        // edge has no direction to lay a mark along
        if (L < 1e-6) continue;
        const ux = dx / L;
        const uy = dy / L;
        let t = 0;
        while (t < L) {
          const rem = ph < dashLen ? dashLen - ph : period - ph;
          const seg = Math.min(rem, L - t);
          if (seg < 1e-4) break;
          if (ph < dashLen) {
            quad(
              ax + ux * (t + seg / 2), ay + uy * (t + seg / 2),
              ux, uy, seg / 2, laneW / 2, o.elevAt, o.zex, laneB,
            );
          }
          t += seg;
          ph += seg;
          if (ph >= period - 1e-9) ph -= period;
        }
      }
      laneMarks.push(laneB.idx.length);
      laneYears.push(f.y);
    }

    const m = mesh(laneB, ST_C_FOOT, OFF_MARK);
    if (m) {
      meshes.push(m);
      marks.push({ m, w: laneW });
      gates.push({ g: m.geometry, marks: laneMarks, years: laneYears });
    }
  }

  if (!meshes.length) return null;

  /** the draw range of every gate, and the tone of the spans that can be raw */
  const applyYear = (year: number | undefined): void => {
    for (const gt of gates) {
      const k = upTo(gt.years, year);
      gt.g.setDrawRange(0, k ? gt.marks[k - 1] : 0);
    }
    if (!roadGeom || !rawSpans.length) return;
    const attr = roadGeom.getAttribute("color") as BufferAttribute;
    const arr = attr.array as Float32Array;
    let touched = false;
    for (const s of rawSpans) {
      // `periodOf`: exists from `yr` (or always, where the record is silent),
      // paved from `imp`. Between the two it is graded earth. `undefined` is
      // "every year", where nothing is unpaved.
      const raw =
        year !== undefined && (s.yr === 0 || year >= s.yr) && year < s.imp;
      if (raw === s.raw) continue;
      const rgb = raw ? rawRGB : roadRGB;
      for (let v = s.from; v < s.to; v++) {
        arr[v * 3] = rgb[0];
        arr[v * 3 + 1] = rgb[1];
        arr[v * 3 + 2] = rgb[2];
      }
      s.raw = raw;
      touched = true;
    }
    if (touched) attr.needsUpdate = true;
  };

  return {
    name: "street-markings",
    meshes,
    onYear(year: number | undefined) {
      applyYear(year);
    },
    onStep(step: number, zex: number) {
      /* NOTHING OF THIS DRAWS AT THE WHOLE-CITY CAMERA. `streets.ts` records
         what happened the once: a pale sheet over the ground at the wide shot
         buried the terrain, and Daniel was looking at it. */
      const on = step >= 1;
      for (const m of meshes) m.visible = on;

      /* the ground's exaggeration moved, so every vertex moves with it — as a
         scale on the model matrix, not as a pass over 829,029 vertices and
         five re-uploads. `layers/streets.ts` §THE EXAGGERATION IS A TRANSFORM
         carries the reasoning, including why the Lambert term is unchanged:
         every normal on this layer is exactly (0, 1, 0). */
      const k = zex / bakedZex;
      for (const m of meshes) m.scale.y = k;
    },
    onFrame(cam: PlaneCamera, step: number) {
      /* THE MARK'S OWN WIDTH AGAINST THE CAMERA, never the camera alone: a
         width in metres reaches the screen at `ST_KPROJ * scale`, the
         geometric mean of the projection's two axes, which is what a width at
         an unknown bearing actually projects at. */
      const on = step >= 1;
      for (const m of surfaces) m.visible = on;
      for (const k of marks) {
        k.m.visible = on && k.w * ST_KPROJ * cam.scale >= MARK_PX;
      }
      if (xwPair) {
        /* the ladder the moment its own stripes resolve, the bar until then,
           and never both: two coplanar meshes of the same tone at the same
           depth rung would z-fight across every crossing in the city */
        const laddered = xwPair.stripeW * ST_KPROJ * cam.scale >= MARK_PX;
        xwPair.ladder.visible = on && laddered;
        xwPair.bar.visible = on && !laddered && bandW * ST_KPROJ * cam.scale >= MARK_PX;
      }
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
      }
      meshes.length = 0;
      gates.length = 0;
      surfaces.length = 0;
      marks.length = 0;
      xwPair = null;
      rawSpans.length = 0;
      roadGeom = null;
    },
  };
}
