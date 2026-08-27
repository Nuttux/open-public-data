/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/heroes.ts — THE HAND-MODELLED BUILDINGS, AS SOLIDS.

   The fabric layer raises 166,166 prisms. Fourteen of those footprints carry
   an authored model instead — rings at published heights, swept by a
   published profile, with columns, drums, lanterns, spires and masts as
   separate parts — and until this layer existed every one of them was an
   anonymous extruded box in the middle of downtown. `base/heroes` ships
   14 heroes, 145 parts and 3,541 ring vertices; it is the smallest chunk in
   the city and the largest single thing missing from the picture.

   ── WHAT IS READ, AND WHAT IS NOT INVENTED ──────────────────────────────
   Every ring, every profile point, every height, every tilt and every
   material index comes out of `data.landmarks()` exactly as the encoder
   moved it out of the authored payload. Nothing here chooses a shape. One
   thing the Canvas renderer does is deliberately NOT done:

   · THE EMPHASIS LAW. `drawHero` scales a hero about its own ground anchor
     so that a 7.8 px dome reads at whole-city zoom. That is a per-frame
     answer to a raster problem: the scale depends on `cam.scale`, and a
     baked mesh has no camera. So this layer draws every hero at emphasis 1
     — its PUBLISHED size, in the city, at the city's own scale. `heroZ`,
     `planScale` and `crownFactor` all reduce to the identity there, which is
     why none of them appear below.

   133 of the 145 parts are `solid`, and they are the MASS: the drums, the
   domes, the crowns, the 50 engaged columns tagged `g:"col"` — each of which
   is already its own solid with its own six-vertex ring, so a "column group"
   needs no special case — the lanterns, the finials, the masts and the
   spires.

   ── AND THE OTHER TWELVE, WHICH ARE THE FACE ────────────────────────────
   The first cut of this file skipped the 9 `arcade` parts and the 3 `rib`
   parts, on the argument that an opening is a SUBTRACTION and a rib is a
   STROKE and a ring-sweep can express neither. Both halves of that were
   true and the conclusion was wrong, because it read the reference as
   modelling and the reference is PAINTING: `drawArcade` fills a polygon
   ON a wall it has already drawn, and `drawRib` strokes a meridian ON a
   surface it has already swept. Neither cuts anything and neither adds a
   millimetre to a silhouette.

   Measured against the Canvas page at the same camera, hero by hero, that
   skip WAS the regression:

     · the Ferry Building's tower lost its two clock faces and its belfry
       arches and became a plain tan box with a red hat;
     · the Old U.S. Mint lost every window bay and became a blank cream
       block;
     · the Conservatory of Flowers lost its glazing — the one thing a
       glasshouse is — and became a smooth green blob;
     · City Hall lost the twenty gilt ribs off its dome and the openings
       between its drum columns;
     · Coit Tower lost its flutes and its observation arcade and became a
       smooth cylinder.

   So both are built, as COPLANAR PAINT on the surface that is already
   there, separated in the DEPTH BUFFER and not by a height — `layers/
   streets.ts` §ONE DEPTH LADDER makes the argument this file reuses: in an
   axonometric projection a Y offset is also a SCREEN offset, so a decal
   nudged out of its wall slides visibly off it. Nothing is given a reveal,
   a jamb or a thickness the record does not publish; an opening is a dark
   face lying exactly in its wall, which is what the reference draws.

   ONE NUMBER IS A STATED CONVENTION AND IT IS THE RIB'S WIDTH. See
   `RIB_W_FRAC`. Every other number below is the record's own.

   ── WHAT IS STILL NOT PORTED, AND IT IS ONE THING ───────────────────────
   `part.ink`. `drawSolid` strokes a band's outline, and `drawArcade` strokes
   a clock's rim, at a SCREEN width — 0.7 px on a band edge. The rim ported
   because the reference writes it as `0.10 * openW`, a world quantity; the
   band outline has no world quantity behind it and, unlike a rib, no gap to
   be a fraction of. It is what is still missing from two readings, and both
   are visible in the paired captures:

     · City Hall's dome carries a fine lattice in the reference — the ink on
       its 33 profile bands — and here it is a smooth shell with ribs;
     · City Hall's drum columns are `stone` #e4dabe standing on `granite`
       #d9d1be, a 4 % difference in value. The reference separates them with
       ink; here a real sun has to do it, and on a cylinder at this bearing
       there is barely a shadow between two columns 3 m wide, so the
       colonnade reads as a fluted cylinder rather than as columns.

   Neither is invented a width. Both are written down.

   ── AND THE RECORD'S OWN DETAIL GATE COMES WITH THEM ────────────────────
   `partAlpha` refuses a part whose own drawn size is under its published
   `min`, and the quantity differs BY KIND: an arcade is gated on the width
   of ONE OPENING, a rib on the GAP BETWEEN TWO RIBS. That gate is why the
   reference does not paint 200 sub-pixel window slots into a grey smear at
   whole-city zoom, and it is ported here as a DRAW RANGE — the parts are
   emitted in order of the camera scale each one needs, so the set that is
   allowed at a given scale is a prefix. See §THE GATE IS A PREFIX.

   The SOLIDS take the same gate, and the first draft of this file said they
   need not — on a guessed whole-city scale. MEASURED off the page's own fit
   instead, the whole-city camera sits at 0.0790 px per plane unit, and the
   scales the published solids ask for run from 0.019 (Sutro Tower's mast) to
   0.153 (the Old Mint's portico columns), with City Hall's and the Palace of
   Fine Arts' colonnades at 0.085 and 0.082. Three of those are ABOVE the
   whole-city camera and two are within a whisker of it, so the reference
   drops them there and this would have drawn them: a colonnade rendered as
   22 sub-pixel slivers, which is the grey wash the `min` column exists to
   prevent. The guess was wrong by a factor of ten and it is recorded here
   because it was nearly shipped.

   ── THE VERTICAL, AND WHY A BRIDGE IS ON THE OTHER DIAL ─────────────────
   A hero's part heights are heights ABOVE ITS OWN GROUND, so a vertex sits
   at `elevAt(anchor) * zex + partHeight * zexb` — the same two dials, in the
   same order, as `buildings.ts`. A bridge is not: every height in that
   record is above SEA LEVEL, deck clearance and tower heads alike, so the
   whole structure rides `zex` alone. Both cases are carried by one pair of
   per-vertex attributes — a ground term and a built term — so one pass over
   Y answers a camera step for either.

   ── ONE MESH A HERO, AND THE YEAR IS A BOOLEAN ──────────────────────────
   The fabric gates a century scrub with a draw range over an index buffer
   sorted by year, because it has 166,166 things to gate. There are sixteen
   things here, so the gate is `mesh.visible`, which costs nothing and needs
   no rebuild.

   ── WHY THIS BUILDS AFTER IT RETURNS ────────────────────────────────────
   `CityData.landmarks()` is async — the geometry is in the chunk, but the
   material table is a JSON companion beside it. So the layer is returned
   at once with an EMPTY `meshes` array and an EMPTY `skipGids`, both of
   which are then filled IN PLACE, and `onBuilt` fires when they hold
   something. A caller adds the meshes to the scene from inside `onBuilt`,
   and uses the same call to tell the fabric which footprints it must stop
   drawing. `null` comes back only when the chunk is not loaded at all, which
   is a city without an authored register rather than a failure.
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

import type {
  BridgeSpan,
  CityData,
  HeroData,
  HeroPartData,
  LandmarkTable,
} from "@/lib/city/data";
/* The bridge's own fallbacks and its two paints, from the shared city
   library that owns the landmark law. Read rather than restated: a record
   that carries its own deck clearance, tower heads and year uses those, and
   the constants below stand in only where it does not — which is exactly
   what `drawBridge` does. `legM` is the one number in this file that is a
   drawing convention rather than a measurement, and it is named and stated
   there. */
import {
  BRIDGE_PAINT,
  GGB,
  GGB_DECK,
  GGB_PAINT,
  GGB_PIER,
  WO_DETAIL,
  heroInk,
  heroMaterials,
} from "@/lib/city/landmarks";
/* `shade` and `lerpHex` are the reference's own two colour operators, and the
   arcade's darkness and the clock's face are expressed in them. Read rather
   than restated: `part.dark` is a MULTIPLIER on the wall's own sRGB channels,
   which is what `shade` is, and doing it in linear space instead would not be
   the record's ratio. */
import { lerpHex, shade } from "@/lib/city/terrain";
import { projection } from "@/lib/city/projection";
import type { PlaneCamera } from "../camera";
import type { CityLayer } from "../engine";

export interface HeroesLayerOptions {
  /** ground elevation at a world point — the terrain field's own */
  elevAt(x: number, y: number): number;
  /** the ground's exaggeration, and the built height's */
  zex: number;
  zexb: number;
  /** the gids the fabric layer must NOT draw, so a hero is not drawn twice */
  onBuilt?(skipGids: Set<number>): void;
}

/** the fill and the cap colour a material table without an entry falls back to */
const FILL_FALLBACK = "#b9b2a2";
const TOP_FALLBACK = "#d0c9ba";

/**
 * The cap cut-off, and it is the draw path's own: below this the top ring has
 * collapsed to a point and what would be drawn is a fan of slivers. Eight of
 * the 133 solids end that way — the spires and the finials — and they close
 * themselves.
 */
const CAP_MIN_S = 0.03;

/**
 * A RIB'S WIDTH, AS A FRACTION OF THE PUBLISHED GAP BETWEEN TWO RIBS — and
 * this is the one number in this file that the record does not publish.
 *
 * The record publishes HOW MANY meridians (`part.ribs`, and in all three
 * published ribs it equals the ring's own vertex count) and the surface they
 * lie on. It publishes no width. `drawRib`'s weight is
 * `clamp(0.9 * sqrt(plan), 0.9, 1.9)` SCREEN PIXELS, which is not a
 * measurement of the rib — it is a measurement of the raster.
 *
 * So a width is stated here, and what it was matched against is stated with
 * it. MEASURED off the reference at each dome's own block camera, as the
 * reference's 0.9 px stroke over its own gap `rw * PI / ribs` in plane units
 * times that camera's scale:
 *
 *     City Hall's dome        gap 13.43 px   0.9 px   =  6.7 %
 *     Coit Tower's flutes     gap 11.76 px   0.9 px   =  7.7 %
 *
 * 7 % is the round number between them. The Conservatory's own frame sits at
 * a much closer camera (scale 11.0), where the same fixed 0.9 px stroke falls
 * to 1.8 % of a 50.8 px gap — that is not a third measurement, it is the
 * reference restating its own note that *"a rib is a line ON a surface that
 * is now up to WO_EMAX times bigger, so its weight grows with the drawing
 * rather than sitting at 0.9 px"*. A world-metre strip is what growing with
 * the drawing means when there is no raster to measure in.
 *
 * AND THEN IT WAS RAISED TO A TENTH, WHICH IS A DEPARTURE AND IS SAID SO.
 * A stroke does not foreshorten and a strip does. At 7 % City Hall's ribs
 * are 0.94 px wide where the dome faces the camera and a tenth of that where
 * it turns away, so the rendered rib broke into dashes across both flanks
 * while the reference's stroke stayed a line — the one difference between
 * the two renderers that a matched number cannot close, because the number
 * being matched is a screen width and this one is a world width.
 *
 * A tenth is not a new invention either: `CLOCK_RIM_FRAC` below is the
 * reference's own `0.10 * part.openW`, the ONE stroke in the whole hero path
 * that is written as a world quantity. Using the same tenth means this file
 * carries one stated stroke convention rather than two, and it lands just
 * above the 6.7-7.7 % the reference's own frames measure.
 */
const RIB_W_FRAC = 0.10;

/**
 * THE ARCH'S OWN OUTLINE, in the two numbers `drawArcade` writes it with.
 *
 * The reference builds a pointed arch out of a springing height `sp` and two
 * shoulder points, and both of its constants are pure ratios of quantities
 * this file already has:
 *
 *   `sp = min(hh * 0.62, openW * 0.5 * zexb * k2)` — `hh` is the opening's
 *   height IN PIXELS, so dividing both branches by `zexb * k2` (which at
 *   emphasis 1 is the whole of the screen conversion) leaves
 *   `min((z1 - z0) * ARCH_SPRING, openW * 0.5)` in BUILT METRES. The pixels
 *   cancel exactly; nothing is refitted.
 *
 *   the shoulders sit at `0.22` of the opening's width in from each jamb and
 *   at `sp * 0.34` down from the crown.
 */
const ARCH_SPRING = 0.62;
const ARCH_SHOULDER_T = 0.22;
const ARCH_SHOULDER_Z = 0.34;

/**
 * The clock face's own two paints and its rim, `drawArcade`'s own numbers.
 *
 * `CLOCK_N` was 14 in the mock and is 40 in the reference, which says why:
 * *"the clock face was a 14-gon, which at emphasis is visibly a polygon"*.
 *
 * `CLOCK_RIM_FRAC` is the reference's own `0.10 * part.openW`, which is the
 * ONE stroke in the whole hero path expressed as a world quantity rather than
 * a screen one — so it ports without a convention. The reference then clamps
 * it to 1.6 screen px, and a mesh has no screen; at the Ferry Building's own
 * block camera that clamp brings the drawn rim to about 7 % of the disc
 * against this 10 %, and that difference is the clamp, not a disagreement.
 */
const CLOCK_N = 40;
const CLOCK_RIM_FRAC = 0.10;
const CLOCK_FACE_MIX = 0.45;
const CLOCK_RIM_SHADE = 0.70;

/** the reference's own fallback where a part publishes no darkening */
const ARCADE_DARK_FALLBACK = 0.75;

/**
 * THE DEPTH RUNG THE PAINT SITS ON.
 *
 * `layers/streets.ts` §ONE DEPTH LADDER settled the sign for this whole
 * renderer: a NEGATIVE `polygonOffsetFactor` brings a polygon FORWARD, and a
 * stack of coplanar things must be all one sign or it changes which one wins
 * with the zoom. This stack has one rung — an opening painted on the wall it
 * belongs to — so it takes the first negative rung and nothing else needs a
 * number. It is not -1 because the arch's shoulders and the rib's strips are
 * not exactly coplanar with the band under them on a tapering profile, and -2
 * covers that without ever reaching a neighbouring wall, which is metres away
 * rather than millimetres.
 */
const PAINT_DEPTH = -2;

/** the piers' own half-length along the deck, the reference's own 4.5 m */
const PIER_HALF_M = 4.5;
/** where a pier stands across the deck, as a fraction of the half-width */
const PIER_LAT_FRAC = 0.55;
/** a pier is drawn only where the DEM puts ground this far above the water */
const PIER_GROUND_M = 3;

type RGB = readonly [number, number, number];

const _c = new Color();
/** the palette entries are sRGB; three.js wants the working space */
function toRGB(style: string): RGB {
  _c.setStyle(style, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/** the vertex streams one mesh is accumulated into */
interface Buf {
  pos: number[];
  col: number[];
  /** the ground term, in metres — multiplied by `zex` */
  elev: number[];
  /** the built term, in metres — multiplied by `zexb` */
  built: number[];
  idx: number[];
}

function newBuf(): Buf {
  return { pos: [], col: [], elev: [], built: [], idx: [] };
}

function vert(
  b: Buf, x: number, y: number, elev: number, built: number, rgb: RGB,
): void {
  /* the scene's axes are (world x, up, world y) — `buildings.ts`'s own
     convention. Y is written by `setY` and left at zero here. */
  b.pos.push(x, 0, y);
  b.elev.push(elev);
  b.built.push(built);
  b.col.push(rgb[0], rgb[1], rgb[2]);
}

/** one mesh, plus what a camera step needs to rewrite its Y */
interface Piece {
  mesh: Mesh;
  material: MeshLambertMaterial;
  geometry: BufferGeometry;
  /** the year this thing starts existing */
  year: number;
  pos: Float32Array;
  attr: BufferAttribute;
  elev: Float32Array;
  built: Float32Array;
  /** the camera scale each gated part needs, ascending — empty = never gated */
  needs: number[];
  /** `idx.length` after each gated part, so the allowed set is a prefix */
  marks: number[];
}

function finish(
  b: Buf, year: number, needs: number[] = [], marks: number[] = [],
): Piece | null {
  if (!b.idx.length) return null;
  const pos = new Float32Array(b.pos);
  const attr = new BufferAttribute(pos, 3);
  const g = new BufferGeometry();
  g.setAttribute("position", attr);
  g.setAttribute("color", new BufferAttribute(new Float32Array(b.col), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(b.idx), 1));
  /* FLAT SHADING AND DOUBLE-SIDED, for the reasons `buildings.ts` states:
     the face normal is recovered per fragment, so a corner shared by two
     bands still gets two crisp faces without two copies of itself; and a
     band that tapers is seen from BOTH sides, because a face that leans back
     is tilted up and from above a cone shows its far slopes. Lambert and not
     a physically based material: this city is painted, not photographed. */
  const material = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide,
  });
  const mesh = new Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    material,
    geometry: g,
    year,
    pos,
    attr,
    elev: Float32Array.from(b.elev),
    built: Float32Array.from(b.built),
    needs,
    marks,
  };
}

function setY(p: Piece, zex: number, zexb: number): void {
  const n = p.elev.length;
  for (let v = 0; v < n; v++) p.pos[v * 3 + 1] = p.elev[v] * zex + p.built[v] * zexb;
  p.attr.needsUpdate = true;
  p.mesh.geometry.computeBoundingSphere();
}

/**
 * The ring's AREA centroid — the point the authoring scaled each profile
 * ring about. It has to be that point and not the vertex mean, or the
 * containment the build gate proved is not the containment that gets drawn.
 * Falls back to the vertex mean on a ring with no area, which is what the
 * draw path does.
 */
function ringCentroid(rx: Float32Array, ry: Float32Array): [number, number] {
  const n = rx.length;
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let t = 0; t < n; t++) {
    const u = (t + 1) % n;
    const cr = rx[t] * ry[u] - rx[u] * ry[t];
    a2 += cr;
    cx += (rx[t] + rx[u]) * cr;
    cy += (ry[t] + ry[u]) * cr;
  }
  if (Math.abs(a2) < 1e-9) {
    cx = 0;
    cy = 0;
    for (let t = 0; t < n; t++) {
      cx += rx[t];
      cy += ry[t];
    }
    return [cx / n, cy / n];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/**
 * A CAP IS EAR-CLIPPED AND NOT FANNED, and that is not fussiness.
 *
 * `buildings.ts` fans its roofs and says why it may: a fan's stray triangles
 * are coplanar with the roof, in the roof's own colour, and the depth buffer
 * resolves them into exactly the roof. A hero's rings are not roofs. They are
 * jagged published footprints and star-shaped podiums, and every vertex of
 * every one of them was gated as INSIDE the measured footprint. A fan over a
 * non-convex ring lays colour out to the convex hull — outside the footprint,
 * on the ground the neighbours stand on — which would break the one promise
 * the authored register makes about itself.
 *
 * `triangulateShape` mutates the contour it is handed (it drops a repeated
 * end point), so it is always given a fresh array; dropping a trailing
 * duplicate cannot move any surviving index.
 *
 * MEASURED, over all 125 cap rings in the shipped register: ear clipping
 * resolves 121 of them exactly, and the other four are rings the record
 * publishes NON-SIMPLE — they cross themselves, at their own published scale,
 * before anything here touches them. Ear clipping covers their nonzero region
 * with overlapping triangles, which is what the draw path's own `fill()` puts
 * on screen for the same ring under the nonzero rule. So the two agree; what
 * neither does is invent a shape the ring does not have.
 */
function triangulate(ring: Vector2[]): number[][] {
  try {
    const faces = ShapeUtils.triangulateShape(ring, []);
    if (faces.length) return faces;
  } catch {
    // a ring ear-clipping cannot resolve falls through to the fan below
  }
  const fan: number[][] = [];
  for (let k = 1; k + 1 < ring.length; k++) fan.push([0, k, k + 1]);
  return fan;
}

/**
 * ONE SOLID PART: a ring swept between two heights by a profile.
 *
 * `profile[r] = (u, s)` is a height fraction and a radius scale, so row `r`
 * is the part's own ring scaled by `s` about its area centroid, displaced by
 * the part's published tilt, standing at `z0 + (z1 - z0) * u`. A prism is the
 * two-point profile `[(0,1),(1,1)]`; a dome, a cornice, a lantern, a mast and
 * a set-back crown are the same primitive with more points.
 *
 * Bands between consecutive rows are quads. The TOP is closed, in the part's
 * own cap material. The BOTTOM is not, and that is deliberate twice over: it
 * is never seen from an axonometric camera looking down, and a part stacked
 * on the one below it would put its floor exactly on that part's ceiling —
 * two coplanar surfaces at one height, which is a z-fight rather than a
 * drawing.
 */
function emitSolid(
  b: Buf,
  part: HeroPartData,
  mat: readonly (readonly string[])[],
  elev: number,
): void {
  const n = part.rx.length;
  const NR = part.profile.length;
  if (NR < 2 || n < 3) return;
  const [cx, cy] = ringCentroid(part.rx, part.ry);
  const wall = toRGB(mat[part.mat]?.[2] ?? FILL_FALLBACK);
  const base = b.elev.length;

  for (let r = 0; r < NR; r++) {
    const s = part.profile[r].s;
    const u = part.profile[r].u;
    const h = part.z0 + (part.z1 - part.z0) * u;
    for (let t = 0; t < n; t++) {
      vert(
        b,
        cx + (part.rx[t] - cx) * s + part.tiltX * u,
        cy + (part.ry[t] - cy) * s + part.tiltY * u,
        elev,
        h,
        wall,
      );
    }
  }
  for (let r = 0; r + 1 < NR; r++) {
    const lo = base + r * n;
    const hi = base + (r + 1) * n;
    for (let t = 0; t < n; t++) {
      const t1 = (t + 1) % n;
      b.idx.push(lo + t, lo + t1, hi + t1, lo + t, hi + t1, hi + t);
    }
  }

  const sTop = part.profile[NR - 1].s;
  if (sTop <= CAP_MIN_S) return;
  /* the cap carries the part's own accent material where it has one, which is
     what `capColour` reads; the accent BLEND above it is a function of how far
     the accent's parts have opened at this camera, and at emphasis 1 it is
     zero, so the cap is the material's own top and nothing is mixed into it */
  const capMi = part.accentMat >= 0 ? part.accentMat : part.mat;
  const top = toRGB(mat[capMi]?.[1] ?? TOP_FALLBACK);
  const uTop = part.profile[NR - 1].u;
  const hTop = part.z0 + (part.z1 - part.z0) * uTop;
  const capBase = b.elev.length;
  const ring: Vector2[] = [];
  for (let t = 0; t < n; t++) {
    const x = cx + (part.rx[t] - cx) * sTop + part.tiltX * uTop;
    const y = cy + (part.ry[t] - cy) * sTop + part.tiltY * uTop;
    // a class instance, never an {x, y} literal: three.js reads Vector2 here
    ring.push(new Vector2(x, y));
    vert(b, x, y, elev, hTop, top);
  }
  for (const f of triangulate(ring)) {
    b.idx.push(capBase + f[0], capBase + f[1], capBase + f[2]);
  }
}

/**
 * ONE ARCADE: the openings, as paint lying exactly in the wall they open.
 *
 * `drawArcade` is a fill over a wall it has already drawn, and this is that
 * fill as triangles. Every quantity below is the reference's, read in the
 * reference's order:
 *
 *   · the ring is the part's OWN ring at scale 1 — an arcade publishes no
 *     profile (measured: `profile.length` is 0 on all nine), and `baseRing`
 *     at emphasis 1 reduces to the ring itself;
 *   · an edge carries `nb` openings of `openW` metres on a `pitch`, with
 *     `margin` metres kept clear at each end, and falls back to ONE opening
 *     filling the edge where the pitch is not finite or the edge is too
 *     short to hold one clear of its margins;
 *   · an edge that cannot hold `nb` openings AT ALL is skipped whole, which
 *     is the reference's `if (nb * openW > L) continue`;
 *   · the fill is the wall's own colour times the part's published `dark`.
 *     The reference computes that off the LIT wall at one fixed lambert
 *     band; here the sun does the lighting, so the ratio to the wall around
 *     it is `part.dark` exactly, on every face, which is what the record
 *     says and what a fixed band only approximates.
 *
 * WHAT IS NOT DONE. The reference culls openings on edges facing away
 * (`p.vis[t]`) because a painter's-order rasteriser has no depth buffer.
 * Every edge is emitted here and the depth buffer does that work exactly,
 * which is the whole reason this port exists.
 */
function emitArcade(
  b: Buf,
  part: HeroPartData,
  mat: readonly (readonly string[])[],
  elev: number,
): void {
  const n = part.rx.length;
  if (n < 2) return;
  const wallHex = mat[part.mat]?.[2] ?? FILL_FALLBACK;
  const dark = toRGB(shade(wallHex, part.dark || ARCADE_DARK_FALLBACK));
  const faceRGB = toRGB(lerpHex(wallHex, "#ffffff", CLOCK_FACE_MIX));
  const rimRGB = toRGB(shade(wallHex, CLOCK_RIM_SHADE));
  const hh = part.z1 - part.z0;
  /* the springing, in built metres — see `ARCH_SPRING` on why the pixels
     cancel out of the reference's own expression */
  const spM = Math.min(hh * ARCH_SPRING, part.openW * 0.5);

  for (let t = 0; t < n; t++) {
    const u = (t + 1) % n;
    const x0 = part.rx[t];
    const y0 = part.ry[t];
    const x1 = part.rx[u];
    const y1 = part.ry[u];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (!(L > 0)) continue;

    let nb: number;
    let pitch = part.pitch;
    if (!isFinite(pitch) || L - 2 * part.margin < part.openW) {
      nb = 1;
      pitch = L;
    } else {
      nb = Math.max(1, Math.floor((L - 2 * part.margin) / pitch));
    }
    if (nb * part.openW > L) continue;
    const start = (L - nb * pitch) * 0.5 + (pitch - part.openW) * 0.5;

    /** a point on this edge: `f` along it, `h` built metres up */
    const P = (f: number, h: number, rgb: RGB): number => {
      const i = b.elev.length;
      vert(b, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, elev, h, rgb);
      return i;
    };

    for (let k = 0; k < nb; k++) {
      const a = (start + k * pitch) / L;
      const c = (start + k * pitch + part.openW) / L;
      if (a < 0 || c > 1) continue;

      if (part.shape === "clock") {
        /* A CIRCLE IN A VERTICAL WALL PLANE. The two directions are the
           edge's own and straight up, so the disc is round in world metres
           and the projection makes the ellipse — the reference's own note.
           The rim is an ANNULUS and the face a smaller disc, rather than a
           disc under a ring: two coplanar fills at one depth is a z-fight,
           and two rings that meet at an edge are not. */
        const rM = part.openW * 0.5;
        const rimM = Math.min(part.openW * CLOCK_RIM_FRAC, rM * 0.5);
        const tc = (a + c) * 0.5;
        const zc = (part.z0 + part.z1) * 0.5;
        const ring = (r: number, rgb: RGB): number => {
          const base = b.elev.length;
          for (let q = 0; q < CLOCK_N; q++) {
            const th = (Math.PI * 2 * q) / CLOCK_N;
            P(tc + ((r * Math.cos(th)) / L), zc + r * Math.sin(th), rgb);
          }
          return base;
        };
        const outer = ring(rM, rimRGB);
        const inner = ring(rM - rimM, rimRGB);
        for (let q = 0; q < CLOCK_N; q++) {
          const q1 = (q + 1) % CLOCK_N;
          b.idx.push(outer + q, outer + q1, inner + q1);
          b.idx.push(outer + q, inner + q1, inner + q);
        }
        const face = ring(rM - rimM, faceRGB);
        for (let q = 1; q + 1 < CLOCK_N; q++) {
          b.idx.push(face, face + q, face + q + 1);
        }
        continue;
      }

      /* THE OPENING'S OUTLINE, in the reference's own order and its own
         two ratios. A rect is four points; an arch is seven, and the
         polygon is convex — a jamb, a springing, a shoulder, a crown — so
         a fan off the first point covers it exactly and no ear clipping is
         needed. (`emitSolid`'s cap cannot fan, and says why: those rings
         are non-convex published footprints. This outline is authored by
         the two constants above and is convex by construction.) */
      const o: number[] = [];
      o.push(P(a, part.z0, dark), P(c, part.z0, dark));
      if (part.shape === "arch") {
        o.push(P(c, part.z1 - spM, dark));
        o.push(P(c + (a - c) * ARCH_SHOULDER_T, part.z1 - spM * ARCH_SHOULDER_Z, dark));
        o.push(P((a + c) * 0.5, part.z1, dark));
        o.push(P(a + (c - a) * ARCH_SHOULDER_T, part.z1 - spM * ARCH_SHOULDER_Z, dark));
        o.push(P(a, part.z1 - spM, dark));
      } else {
        o.push(P(c, part.z1, dark), P(a, part.z1, dark));
      }
      for (let q = 1; q + 1 < o.length; q++) b.idx.push(o[0], o[q], o[q + 1]);
    }
  }
}

/**
 * ONE RIB SET: the meridians, as strips lying ON the surface they cross.
 *
 * `drawRib` sweeps the part's own ring through the part's own profile — the
 * same sweep `emitSolid` makes a solid out of — and strokes the meridian at
 * every ring vertex. So a rib is not a new shape: it is the solid's own
 * surface, re-emitted a strip at a time in the material's INK.
 *
 * THE WIDTH IS THE ONE STATED NUMBER, and it is stated in RING-PARAMETER
 * space rather than in metres: a strip half a `RIB_W_FRAC` of a segment
 * either side of the meridian stays the same fraction of the gap wherever
 * the ring is wide or narrow, which is what "one tenth of the gap" has to
 * mean on a ring that is not a circle. See `RIB_W_FRAC`.
 *
 * The ink is `heroInk`, read from the shared library rather than restated:
 * it is the material's wall lerped 0.38 toward black, and that expression is
 * the record's, not this file's.
 */
function emitRib(
  b: Buf,
  part: HeroPartData,
  mat: readonly (readonly string[])[],
  elev: number,
): void {
  const n = part.rx.length;
  const NR = part.profile.length;
  if (NR < 2 || n < 3) return;
  const [cx, cy] = ringCentroid(part.rx, part.ry);
  const ink = toRGB(heroInk(heroMaterials(mat), part.mat, 1));
  const f = RIB_W_FRAC * 0.5;

  /* ONE QUAD A BAND, AND THE THREE-QUAD VERSION IS A RECORDED DEAD END.
     A strip that runs straight from its left edge to its right edge is a
     chord across the corner at the meridian, so it sinks behind the surface
     it lies on. MEASURED on City Hall's dome — 20 meridians, radius 17.9 m,
     half-width 3.5 % of a segment — that sag is `R * (1 - cos(0.011 rad))`,
     which is 1 mm, against a depth bias two orders of magnitude larger. It
     is not a problem.
     Emitting the meridian's own vertex as a third column so each strip lies
     exactly in its two facets WAS tried, and it is worse: with
     `flatShading` the two halves then carry the 18-degree crease between
     the facets as two different normals, so every rib reads as a lit half
     and a dark half — a moulding, which a stroke is not. */
  for (let t = 0; t < n; t++) {
    const prev = (t - 1 + n) % n;
    const next = (t + 1) % n;
    const ax = part.rx[t] + (part.rx[prev] - part.rx[t]) * f;
    const ay = part.ry[t] + (part.ry[prev] - part.ry[t]) * f;
    const bx = part.rx[t] + (part.rx[next] - part.rx[t]) * f;
    const by = part.ry[t] + (part.ry[next] - part.ry[t]) * f;
    const base = b.elev.length;
    for (let r = 0; r < NR; r++) {
      const sc = part.profile[r].s;
      const uu = part.profile[r].u;
      const h = part.z0 + (part.z1 - part.z0) * uu;
      vert(b, cx + (ax - cx) * sc + part.tiltX * uu,
              cy + (ay - cy) * sc + part.tiltY * uu, elev, h, ink);
      vert(b, cx + (bx - cx) * sc + part.tiltX * uu,
              cy + (by - cy) * sc + part.tiltY * uu, elev, h, ink);
    }
    for (let r = 0; r + 1 < NR; r++) {
      const lo = base + r * 2;
      const hi = base + (r + 1) * 2;
      b.idx.push(lo, lo + 1, hi + 1, lo, hi + 1, hi);
    }
  }
}

/**
 * THE CAMERA SCALE ONE PART NEEDS BEFORE THE RECORD LETS IT BE DRAWN.
 *
 * `partAlpha` refuses a part when its own drawn size times `WO_DETAIL` is
 * under its published `min`, and the size differs BY KIND — the reference is
 * explicit that this is the point: *"an arcade is gated on the width of ONE
 * OPENING and a rib on the GAP BETWEEN TWO RIBS, not on the ring they sit
 * on"*. Inverting that for `cam.scale` gives the scale at which the part
 * becomes legal, which is a number that can be baked.
 *
 * `rwPlane` is the part's ring width in PLANE units, which is the unit
 * `cam.scale` is pixels per. `openW` is in metres and the reference
 * multiplies it by `cam.scale` anyway; that mixed unit is the record's own
 * gate and is reproduced rather than corrected, because correcting it would
 * move the camera at which the reference's own picture changes.
 *
 * Returns 0 for a part with no published `min`, which the reference reads as
 * "always".
 */
function scaleNeeded(part: HeroPartData, rwPlane: number): number {
  if (!(part.min > 0)) return 0;
  let sizePerScale: number;
  if (part.kind === "arcade") sizePerScale = part.openW;
  else if (part.kind === "rib") {
    sizePerScale = (rwPlane * Math.PI) / Math.max(1, part.ribs);
  } else sizePerScale = rwPlane;
  if (!(sizePerScale > 0)) return 0;
  return part.min / (WO_DETAIL * sizePerScale);
}

/**
 * ONE HERO, AS TWO MESHES: the mass, and the paint on it.
 *
 * They cannot be one mesh, and the reason is the depth rung: the paint lies
 * exactly IN the surface under it and needs `polygonOffset`, which is a
 * property of a MATERIAL and not of a triangle. Two meshes is the whole of
 * the cost, and the second one exists at all for only seven of the fourteen
 * heroes.
 *
 * ── THE GATE IS A PREFIX ────────────────────────────────────────────────
 * The paint mesh's parts are emitted in ASCENDING order of the camera scale
 * each one needs (`scaleNeeded`), and `marks[k]` is the index length after
 * the k-th. The set the record allows at a given `cam.scale` is then exactly
 * a prefix of the index buffer and the gate is `setDrawRange(0, marks[k-1])`
 * — one number a frame, no upload, no rebuild. That is `layers/caps.ts`'s
 * own century trick pointed at a different axis, and it works for the same
 * reason: the predicate is a threshold on a per-part constant.
 *
 * The `gid` is NOT a tie-break here the way it is in the fabric, because a
 * hero's parts are already in the register's own published order and a
 * stable sort keeps it.
 */
function heroPieces(
  h: HeroData,
  mat: readonly (readonly string[])[],
  elev: number,
  coeffs: { ax: number; ay: number },
): { solid: Piece | null; paint: Piece | null } {
  /* every part, with the camera scale the record lets it be drawn at. `rw`
     is the ring's width in PLANE units — the projection's own x coefficient
     applied to the ring, which is what `projectPart` measures `p.rw` as. A
     STABLE sort by that scale keeps the register's own order inside a tie,
     so the buffer is byte-identical run to run. */
  const ordered = h.parts
    .map((part, i) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (let t = 0; t < part.rx.length; t++) {
        const X = coeffs.ax * part.rx[t] + coeffs.ay * part.ry[t];
        if (X < mn) mn = X;
        if (X > mx) mx = X;
      }
      return { part, i, need: scaleNeeded(part, mx - mn) };
    })
    .sort((x, y) => x.need - y.need || x.i - y.i);

  const emit = (
    buf: Buf, want: (k: HeroPartData["kind"]) => boolean,
  ): { needs: number[]; marks: number[] } => {
    const needs: number[] = [];
    const marks: number[] = [];
    for (const { part, need } of ordered) {
      if (!want(part.kind)) continue;
      const before = buf.idx.length;
      if (part.kind === "solid") emitSolid(buf, part, mat, elev);
      else if (part.kind === "arcade") emitArcade(buf, part, mat, elev);
      else emitRib(buf, part, mat, elev);
      /* a part that produced no triangle leaves no mark, so the prefix stays
         a prefix of things that exist */
      if (buf.idx.length === before) continue;
      needs.push(need);
      marks.push(buf.idx.length);
    }
    return { needs, marks };
  };

  const b = newBuf();
  const solidGate = emit(b, (k) => k === "solid");
  const pb = newBuf();
  const { needs, marks } = emit(pb, (k) => k !== "solid");

  /* A HERO WHOSE PARTS CANNOT PRODUCE A SOLID IS NOT DRAWN, and the fabric
     keeps its prism. Nothing is stood in for it. */
  const solid = finish(b, h.year, solidGate.needs, solidGate.marks);
  const paint = marks.length ? finish(pb, h.year, needs, marks) : null;
  if (paint) {
    /* PAINT TAKES NO PART IN THE SHADOW MAP, IN EITHER DIRECTION, and the
       second half of that was MEASURED rather than assumed.

       Casting is obvious: a decal lying in its own host's surface would
       fight that host for the depth of every texel.

       RECEIVING is the one that showed. With `receiveShadow` on, the paint
       samples the shadow map at a depth its host wrote — the same surface,
       to the millimetre — so it comes back self-shadowed wherever the
       comparison lands on the wrong side of the bias. That is acne, and it
       appeared exactly where acne appears: on the SHADED flanks, as dashes
       broken out of City Hall's ribs and as gaps bitten out of the Ferry
       Building's clock rims, and on the sunlit flanks not at all.

       What is given up is a cast shadow crossing an opening. What is kept
       is the whole of the lambert term, which the paint shares with its
       host because it shares its orientation — so an opening on a wall
       turned away from the sun is still as dark as that wall. */
    paint.mesh.castShadow = false;
    paint.mesh.receiveShadow = false;
    paint.material.polygonOffset = true;
    paint.material.polygonOffsetFactor = PAINT_DEPTH;
    paint.material.polygonOffsetUnits = PAINT_DEPTH;
  }
  return { solid, paint };
}

// ── the bridges ─────────────────────────────────────────────────────────────

/** one vertical quad, its two corners in plan and its two heights */
function wall(
  b: Buf,
  x0: number, y0: number, x1: number, y1: number,
  h0: number, h1: number,
  rgb: RGB,
): void {
  const i = b.elev.length;
  vert(b, x0, y0, h0, 0, rgb);
  vert(b, x1, y1, h0, 0, rgb);
  vert(b, x1, y1, h1, 0, rgb);
  vert(b, x0, y0, h1, 0, rgb);
  b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

/** one horizontal quad, four corners in plan at one height */
function slab(
  b: Buf,
  p: readonly (readonly [number, number])[],
  h: number,
  rgb: RGB,
): void {
  const i = b.elev.length;
  for (const [x, y] of p) vert(b, x, y, h, 0, rgb);
  b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

/**
 * ONE SPAN — the deck, the towers and the approach piers.
 *
 * The axis is read off the published ring and off nothing else: the ring is a
 * closed quad, so the centreline runs between its two end edges' midpoints and
 * the half-width is the perpendicular distance from it to a corner.
 *
 * WHAT IS DRAWN AND WHAT IS NOT. The deck, the tower legs and the piers are
 * solids and are here. The main cables, the suspenders, the cross-braces and
 * the roadway line are STROKES in the reference — the record publishes the
 * curve a cable follows and the spacing of the suspenders, and publishes no
 * diameter for either. Giving them one is inventing structure, so they are
 * left to a later block that can carry a stated convention for it.
 *
 * THE PIER RULE IS THE RECORD'S. A pier is drawn only where the DEM the page
 * already carries puts ground above the water under the deck. Nothing is
 * drawn out over the channel, where the record says the deck hangs from the
 * cables it does not yet have.
 */
function spanPiece(
  span: BridgeSpan,
  elevAt: (x: number, y: number) => number,
): Piece | null {
  const ring = span.ring;
  if (ring.length < 4 || span.towers.length < 2) return null;
  const ax = (ring[0][0] + ring[1][0]) * 0.5;
  const ay = (ring[0][1] + ring[1][1]) * 0.5;
  const bx = (ring[2][0] + ring[3][0]) * 0.5;
  const by = (ring[2][1] + ring[3][1]) * 0.5;
  const L = Math.hypot(bx - ax, by - ay);
  if (!(L > 1)) return null;
  const ux = (bx - ax) / L;
  const uy = (by - ay) / L;
  const nx = -uy;
  const ny = ux;
  const half = Math.abs((ring[0][0] - ax) * nx + (ring[0][1] - ay) * ny);
  if (!(half > 0.5)) return null;

  const dz = span.deckZ ?? GGB.deckZ;
  /* EVERY TOWER, WITH ITS OWN HEAD, AND THE TWO TRAVEL TOGETHER. The towers
     are ordered along the centreline before they are drawn, and one span's
     four heads are not all equal — one of them is 463 ft against its
     neighbours' 520 — so a position sorted apart from its height would put
     the short tower under the wrong saddle. `towerZ` is the obstacle file's
     own AMSL figure per tower; the fallback applies only to a record that
     carries none. */
  const twr = span.towers
    .map((t, i) => ({
      t: Math.max(0, Math.min(1, ((t[0] - ax) * ux + (t[1] - ay) * uy) / L)),
      h: span.towerZ?.[i] ?? GGB.towerFt * 0.3048,
    }))
    .sort((p, q) => p.t - q.t);
  const paint = (span.k && BRIDGE_PAINT[span.k]) || GGB_PAINT;
  const deckRGB = toRGB(GGB_DECK);
  const pierRGB = toRGB(GGB_PIER);
  const legRGB = toRGB(paint.legLit);
  const legTopRGB = toRGB(paint.legTop);

  /** a point on the span: `t` along the centreline, `lat` metres across it */
  const W = (t: number, lat: number): [number, number] => [
    ax + ux * t * L + nx * lat,
    ay + uy * t * L + ny * lat,
  ];

  const b = newBuf();

  /* THE DECK, as the flat ribbon the reference draws. `P(t, lat, h)` is affine
     in both arguments, so the deck between its ends is exactly one quad and
     sampling it would add vertices and no shape. It has no thickness because
     the record publishes none: `deckZ` is the NAVIGATIONAL CLEARANCE, which is
     a height and not a slab. */
  slab(b, [W(0, -half), W(1, -half), W(1, half), W(0, half)], dz, deckRGB);

  /* THE PIERS. The reference's pier is a flat quad in the (axis, height)
     plane — 9 m along the deck, no width across it, because a stroke does not
     need one. A solid does, and the only length the record's own pier carries
     is that 9 m, so the pier is square: the same number in both directions,
     stated rather than fitted. No top face: it would sit exactly under the
     deck at the same height, and two coplanar surfaces are a z-fight. */
  const t0 = twr[0].t;
  const step = 1 / Math.max(6, Math.round(L / 70));
  const pw = PIER_HALF_M / L;
  const lat = -half * PIER_LAT_FRAC;
  for (let t = step; t < t0; t += step) {
    const g = elevAt(ax + ux * t * L, ay + uy * t * L);
    if (g < PIER_GROUND_M) continue;
    const c: [number, number][] = [
      W(t - pw, lat - PIER_HALF_M),
      W(t + pw, lat - PIER_HALF_M),
      W(t + pw, lat + PIER_HALF_M),
      W(t - pw, lat + PIER_HALF_M),
    ];
    for (let k = 0; k < 4; k++) {
      const d = c[(k + 1) % 4];
      wall(b, c[k][0], c[k][1], d[0], d[1], g, dz, pierRGB);
    }
  }

  /* THE TOWERS. A leg is a BOX whose width is ACROSS the bridge and whose
     legs stand the published deck width apart, which is the whole of why a
     tower reads as a tower and not as a longer piece of deck. `legM` is a
     drawing convention and the reference says so: at the published 11 m the
     two legs nearly touch and read as one bar; at 7 m they are two legs with
     a gap. Every published tower is drawn — two on one of these spans, four
     on the other — each at its own head height off the obstacle record.
     The Canvas paints a third value on the leg's shaded face; here the sun
     does that, so a leg is its own paint and its top is the top's. */
  const legL = GGB.legM / L;
  const legW = GGB.legM / 2;
  for (const { t, h: head } of twr) {
    for (const side of [-half, half]) {
      const c: [number, number][] = [
        W(t, side - legW),
        W(t + legL, side - legW),
        W(t + legL, side + legW),
        W(t, side + legW),
      ];
      for (let k = 0; k < 4; k++) {
        const d = c[(k + 1) % 4];
        wall(b, c[k][0], c[k][1], d[0], d[1], 0, head, legRGB);
      }
      slab(b, c, head, legTopRGB);
    }
  }

  /* the year it EXISTED — the completion year off the record, per span, so
     the two open in the order they opened */
  return finish(b, span.year ?? GGB.year);
}

// ── the layer ───────────────────────────────────────────────────────────────

/**
 * Every authored hero and every published bridge, as real geometry.
 *
 * Returns `null` for a city whose base tier carries no authored register —
 * which is a city without heroes, not an error. Otherwise the layer comes
 * back at once and fills itself: see the header on why `onBuilt` exists.
 */
export function heroesLayer(
  data: CityData,
  o: HeroesLayerOptions,
): (CityLayer & { meshes: Mesh[]; skipGids: Set<number> }) | null {
  if (!data.get("base/heroes")) return null;

  /* THE PROJECTION'S OWN X COEFFICIENTS, READ ONCE. The record's detail gate
     is expressed against a part's width in PLANE units (`projectPart`'s
     `p.rw`), which is `ax * x + ay * y` over the ring. They depend on the
     BEARING alone — the band moves `zex`, which is the y half of the
     projection and not this one — so reading them at build time is reading
     them for the life of the page. */
  const coeffs = projection.coeffs();

  const meshes: Mesh[] = [];
  const skipGids = new Set<number>();
  const pieces: Piece[] = [];
  let zex = o.zex;
  let zexb = o.zexb;
  let year: number | undefined = undefined;
  /* THE CAMERA STARTS OPEN AND NOT SHUT. `onFrame` is what narrows this,
     and a layer that somehow never gets one must fall back to DRAWING THE
     REGISTER, not to an empty scene — a missing camera is a reason to draw
     everything the record publishes, never a reason to delete a landmark. */
  let scale = Infinity;
  let disposed = false;

  const applyStep = (): void => {
    for (const p of pieces) setY(p, zex, zexb);
  };
  /* THE YEAR GATE, and it refuses the same way the draw path refuses: a hero
     is not drawn before the year its own register gives it. */
  const applyYear = (): void => {
    for (const p of pieces) {
      p.mesh.visible = year === undefined || Math.floor(year) >= p.year;
    }
  };
  /* THE DETAIL GATE — see `scaleNeeded` and §THE GATE IS A PREFIX. `needs` is
     ascending, so the count allowed at this scale is an upper bound, and 14
     heroes at most 3 gated parts each is a linear scan that never wants a
     bisection. */
  const applyScale = (): void => {
    for (const p of pieces) {
      if (!p.needs.length) continue;
      let k = 0;
      while (k < p.needs.length && p.needs[k] <= scale) k++;
      p.geometry.setDrawRange(0, k ? p.marks[k - 1] : 0);
    }
  };

  void (async () => {
    let lm: LandmarkTable | null = null;
    try {
      lm = await data.landmarks();
    } catch (e) {
      console.warn("citygl: no authored landmarks —", e);
      return;
    }
    if (!lm || disposed) return;

    for (const h of lm.heroes) {
      /* THE FOOTPRINT IS SPOKEN FOR EITHER WAY. A gid is handed over whether
         or not its parts produced a solid and whatever year is on the clock,
         because the fabric's own gate is a baked prefix of an index buffer
         and cannot be reopened for one building per year. */
      skipGids.add(h.bi);
      const built = heroPieces(h, lm.materials, o.elevAt(h.ax, h.ay), coeffs);
      for (const p of [built.solid, built.paint]) {
        if (!p) continue;
        pieces.push(p);
        meshes.push(p.mesh);
      }
    }

    if (lm.bridge) {
      for (const span of [lm.bridge as BridgeSpan, ...lm.bridge.more]) {
        const p = spanPiece(span, o.elevAt);
        if (p) {
          pieces.push(p);
          meshes.push(p.mesh);
        }
      }
    }

    applyStep();
    applyYear();
    applyScale();
    o.onBuilt?.(skipGids);
  })();

  return {
    name: "heroes",
    meshes,
    skipGids,
    onStep(_step: number, nextZex: number, nextZexb: number) {
      zex = nextZex;
      zexb = nextZexb;
      applyStep();
    },
    onYear(next: number | undefined) {
      year = next;
      applyYear();
    },
    /* THE ONE THING THAT HAS TO BE PER FRAME. Everything else here answers a
       step or a year, both of which are events; the record's detail gate is a
       threshold on `cam.scale`, which moves continuously under a wheel. It is
       a comparison and a `setDrawRange` per mesh, and it early-outs on a
       scale that has not moved — which is every frame of a hold. */
    onFrame(cam: PlaneCamera) {
      if (cam.scale === scale) return;
      scale = cam.scale;
      applyScale();
    },
    dispose() {
      disposed = true;
      for (const p of pieces) {
        p.mesh.geometry.dispose();
        p.material.dispose();
      }
      pieces.length = 0;
      meshes.length = 0;
      skipGids.clear();
    },
  };
}
