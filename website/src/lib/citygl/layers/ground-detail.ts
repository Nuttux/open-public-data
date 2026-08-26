/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/ground-detail.ts — WHAT IS DRAWN *ON* THE GROUND.

   `terrain.ts` puts the DEM on screen as one mesh and `streets.ts` puts the
   published rights of way on top of it. Between those two the Canvas renderer
   draws four more things, all of them ground and none of them a street: the
   published park rings, the published inland water bodies, the published
   shoreline in ink, and the measured canopy as masses of leaf.

   ── THE ORDER IS THE CANVAS RENDERER'S, EXPRESSED AS DEPTH ───────────────
   `scene.paint` runs `drawShoreline` at §3, `drawParkRings` at §3b and
   `drawWaterBodies` immediately after, all before a single street. A 2D
   context gets that for free from paint order; here it is the depth buffer,
   and it is `polygonOffset` and NOT a height. In an axonometric projection a
   metre of Y is also tens of pixels of SCREEN, so lifting a wash off the
   ground to win a depth test slides it off the ground it is a wash OF —
   `streets.ts` and `street-detail.ts` both say this and it is the same trap.

   The stack this layer joins, extending `street-detail.ts`'s own table:

       9   the shoreline's pale rim     here
       8   the shoreline ink            here
       7   the park wash                here
       5   the inland water bodies      here
       4   right of way                 streets.ts
       2   carriageway                  streets.ts
       1   island fill, stair band      street-detail.ts
       0   centreline spine             street-detail.ts
      -1   kerb, island edge, treads    street-detail.ts

   ── FOUR PASSES, AND THE CANOPY IS THE ONLY ONE THAT IS MANY ────────────
   328 park rings are ONE mesh whose per-class tone rides on a vertex colour
   rather than on a material, 32 water bodies are one more, and the ink and
   the rim are one each. The canopy is the exception and its own section says
   why: 50,897 masses in a single city-wide `InstancedMesh` can never be
   frustum-culled, so they are bucketed over a coarse grid and the frame pays
   for the buckets it can see.

   ── WHAT IS PUBLISHED AND WHAT IS DECLARED ──────────────────────────────
   Published: every ring and every vertex, the park class byte, the canopy
   cell's own area byte, the 58.06 m2 floor, `blobRadius`'s 2/sqrt(pi), the
   park wash's 0.46 and both palettes. Declared, and each says so where it is
   written: the two ribbon widths (a stroke width in the reference is in
   SCREEN PIXELS and a pixel cannot cross to geometry), the shape of a canopy
   mass (no register publishes one), and `MASS_GAIN`, which is a measured
   compensation for THIS light rig and not a colour.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";

import type { CityData } from "@/lib/city/data";
import { lerpHex, type TerrainProj } from "@/lib/city/terrain";
import {
  assertTreeGrid,
  BLOB_MIN_M2,
  blobRadius,
  CANOPY_COV_Q,
  CANOPY_FAM,
  canopyCovBin,
  decodeParks,
  PARK_TONE,
  PARK_WASH,
  TREE_GREENS,
  treeWorld,
  VZ_C1,
  WFLG,
  WLAKE,
  WPKW,
} from "@/lib/city/trees";
import { decodeCoast, inPoly, type Ring } from "@/lib/city/water";
import { stepForZ } from "../controls";
import {
  CANOPY_MASS_RISE,
  CANOPY_MASS_SPREAD,
  canopyMass,
  setCrownYaw,
} from "../tree-geometry";
import type { CityLayer } from "../engine";

export interface GroundDetailLayerOptions {
  /** ground elevation at a world point — all four of these lie ON the ground */
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration; none of this is a built thing */
  zex: number;
}

/* ── THE DEPTH SLOTS ─────────────────────────────────────────────────────
   Named rather than written at the call site, because the whole point of the
   table in the header is that these four numbers are read together. */
const OFF_RIM = 9;
const OFF_INK = 8;
const OFF_PARK = 7;
const OFF_LAKE = 5;

/** scratch for the band change — one matrix reused, not 50,897 allocated */
const m4Step = new Matrix4();

/**
 * SEA LEVEL, AND IT IS THE REFERENCE'S OWN NUMBER.
 *
 * `water.ts` projects the coastline at a flat `0.4` in `drawShoreline` and at
 * `max(0.4, elevM(x, y))` in `coastRings`. The flat form is right for a 2D
 * context — the ink is painted over the raster whatever the raster says — and
 * it is wrong here: a depth-tested scene would bury a sea-level ribbon inside
 * the DEM's own cliff wherever the 53.8 m raster fails to resolve the foot of
 * one, and the reader would lose the line exactly where the shore is most
 * dramatic. So this takes `coastRings`' form, `max(SHORE_Z_M, elevAt)`, and
 * the ribbon lies on the ground like every other surface in this file.
 */
const SHORE_Z_M = 0.4;

/**
 * THE TWO RIBBON WIDTHS, AND WHY A PUBLISHED NUMBER CANNOT SUPPLY THEM.
 *
 * The reference strokes the shoreline twice — a pale rim at `lineWidth 4.0`
 * and the ink at `1.0` over it — and both are CSS PIXELS. A pixel width is a
 * statement about a camera, not about the world, and `street-detail.ts`
 * §"WHY A LINE IS THE HARD CASE ON A GPU" has the rest of it: there is no
 * line primitive here, so a line is a quad strip and its width is in metres.
 *
 * Nothing in the register publishes a width for a shoreline — it publishes a
 * LINE. So the width is declared, and it is declared as a fraction of a
 * quantity the city's own manifest carries, `1 / proj.s`, the DEM cell:
 *
 *  - the RIM exists to cover the raster's staircase (`water.ts` §"AND NOT AT
 *    THE WIDE CAMERAS": *"the staircase it exists to cut back is three pixels
 *    a step at that camera and the rim under the ink now covers it"*), and the
 *    amplitude of that staircase is one cell. Half a cell of pale either side
 *    of the line covers the half-cell the raster can be wrong by;
 *  - the INK is a quarter of the rim, which is the reference's own 1.0 : 4.0.
 *
 * MEASURED AGAINST THE REFERENCE, because a declared number should say what
 * it costs. At the widest camera the horizontal scale is 0.068 px per metre
 * (`trees.ts` §the ladder), so a half-cell rim of 26.9 m is 1.8 px against
 * the reference's 4.0, and the ink 0.46 px against 1.0 — this draws the coast
 * about half as heavy as the Canvas does at the frame it was tuned on. A FULL
 * cell would match it there (3.7 px) and would be 132 px at the closest
 * camera, which is a pale beach and not a rim. One world width has to serve a
 * 36x zoom range; this is the half of that range it was chosen for.
 */
const SHORE_RIM_CELL_K = 0.5;
const SHORE_INK_K = 0.25;

/**
 * HOW MANY MESHES THE 50,897 MASSES ARE SPLIT OVER, ALONG EACH AXIS.
 *
 * An `InstancedMesh` is culled as ONE object: a single city-wide mesh is
 * either wholly in the frustum or wholly out, so the street camera paid for
 * every canopy cell in San Francisco to look at half a park. `layers/trees.ts`
 * gets this for free — the register ships 129 tree chunks and it makes a mesh
 * per chunk — and the canopy ships as ONE chunk of 50,897 cells, so the
 * bucketing has to happen here.
 *
 * 8 x 8 over the vegetation grid's own extent is 64 buckets of about 800
 * masses each, and 64 draw calls against a frame that already issues about
 * 800. Finer would cost more calls than it saves triangles.
 */
const MASS_BUCKETS = 8;

/**
 * HOW MUCH OF THE PUBLISHED DARK-TO-LIT SPREAD A MASS CARRIES.
 *
 * `crownSet` uses 0.55 and argues it: a crown is 2.4 radii tall, its sides
 * face outward, and the rig already puts a real gradient across them, so
 * baking the whole published spread on top would shade it twice. A MASS is
 * squatter — 1.81 radii tall against 1.26 wide — so a smaller share of it
 * turns away from the light and the rig has less to say about it. More of the
 * published spread has to be in the ramp, and 0.85 is where it sits: the
 * whole of it (1.0, `crownSet`'s *"right for a caller with no light of its
 * own"*) is for a surface with no rig at all, and this one has a rig.
 */
const MASS_TONE = 0.85;

/**
 * AND THE RAMP IS RE-LEVELLED, WHICH IS THE WATER'S OWN DISCIPLINE.
 *
 * `lib/city/water.ts` §DEPTH_UM re-centres the bathymetry ramp *"so that the
 * area-weighted mean colour of the water is the value Block W set for the
 * open bay — what changes is the VARIATION, not the level"*, because the
 * first cut of that port ran a third of a level pale over the whole bay and
 * read as nothing but "washed out". Same instrument, opposite sign.
 *
 * The 2D renderer paints a canopy mass at its base green through its own
 * light model, and at the measured median of that field (`lam` 0.730) that
 * model is `0.86 + 0.20 x 0.730` = 1.006 — the published mass IS its base
 * green, `#6f8f4e` = 111, 143, 78 at coverage bin 0. Under this rig a dome is
 * not: its sides take a fraction of a `HemisphereLight`'s upper half and a
 * fraction of the directional, and the same published green comes back dark.
 *
 * MEASURED BY ABLATION, not off a park crop — the layer is switched off on
 * both pages at one camera (`__cityWFLG.blobs` on the Canvas, `mesh.visible`
 * here) and the pixels that MOVED are the mass. That distinction is the whole
 * reason this number is trustworthy: the first attempt calibrated on "green
 * pixels over the Presidio crop", which is as much GROUND as canopy, asked
 * for 1.23 and moved the masses by 5 %.
 *
 * ```
 *   Presidio, the canopy's own pixels        R      G      B
 *   published                             118.0  138.5   89.6
 *   Lambert dome, gain 1                   86.4  105.4   65.0
 *   linear factor short                     1.59   1.45   1.60
 * ```
 *
 * 1.55 is that factor. Two things were ruled out on the way and both are
 * worth not re-testing: the ambient occlusion is not doing it (with the post
 * chain off the same pixels read 94.7, 118.3, 70.9 against 94.7, 116.7, 71.2
 * with it on), and straight-up normals recover only 1.10 of the 1.55.
 *
 * THIS NUMBER IS CALIBRATED AGAINST THE RIG AS IT STANDS. If `light.ts` moves
 * its level, re-measure it the same way; it is a compensation, not a colour.
 */
const MASS_GAIN = 1.55;

// ── the published land mask, read straight off the chunk ────────────────────

interface LandProbe {
  /** the reference's 3 x 3: is ANY of the nine cells around this point land? */
  near(x: number, y: number): boolean;
  /** one cell, for deciding which side of a segment the water is on */
  at(x: number, y: number): boolean;
  /** the DEM cell's own width in metres */
  cellM: number;
}

/**
 * `TerrainField.maskAt` WITHOUT THE FIELD, AND WHAT THAT COSTS.
 *
 * `drawShoreline`'s gate needs the land bit and nothing else the field
 * carries, and this layer is handed an `elevAt` callback rather than a
 * `TerrainField`. The bit is in `base/terrain`'s own `mask` — one bit a node,
 * `k = i * N + j`, MSB first — so it is read here directly.
 *
 * THE ONE DIFFERENCE, STATED: `maskAt` also applies the offshore coast fix
 * (`terrain.ts` §"A CELL MORE THAN 300 m OUTSIDE THE PUBLISHED LAND IS NOT
 * LAND"), which arrives from a separate published file the field is handed by
 * its owner. Without it this gate is the raw published mask, which is
 * strictly more permissive: a handful of legal-boundary cells offshore still
 * read as land, so the ink survives a few vertices further out than the
 * Canvas lets it. It is the same direction of error the reference's own
 * comment describes and a smaller amount of it.
 *
 * ── AND THE INDEX IS `maskAt`'s, WHICH IS NOT THE ARRAY'S. MEASURED. ─────
 * `terrain.ts` reads `k = i * N + j` with `i` taken from the world X
 * (`elevM`: `i = round(gx)`, `j = round(gy)`). The shipped array is the other
 * way round — `k = gy * N + gx` — and three independent tests say so, none of
 * them an argument about a loop:
 *
 * ```
 *                                          k = gx*N+gy     k = gy*N+gx
 *   published mask vs "inside a coast ring"     0.790           0.983
 *   canopy cells that land on land              0.884           1.000
 *   coast vertices with land in their 3 x 3   218 / 425       425 / 425
 * ```
 *
 * and the highest node in the file lands on the city's own highest hill under
 * the second reading and on a 150 m ridge under the first.
 *
 * This gate STILL USES `maskAt`'s index, deliberately. `terrain.ts` in this
 * directory states the rule it is obeying — *"Same test, same skips, so the
 * two renderers cut the coast in the same place"* — and the ground this ink
 * is drawn over is cut by `maskAt`. A gate that read the array the other way
 * round would be right about the data and wrong about the picture. When
 * `lib/city/terrain.ts` is fixed, this follows it with no edit; today it costs
 * the ribbon the 207 vertices in the table above, and that number is a
 * measurement OF the transposition, not of this layer.
 */
function landProbe(data: CityData): LandProbe | null {
  const chunk = data.get("base/terrain");
  const mask = chunk?.fields.mask;
  const proj = data.manifest.proj as unknown as TerrainProj;
  if (!mask || !(mask instanceof Uint8Array) || !proj || !proj.N) return null;
  const N = proj.N;
  const bit = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    const k = i * N + j;
    return ((mask[k >> 3] >> (7 - (k & 7))) & 1) === 1;
  };
  return {
    cellM: 1 / proj.s,
    at(x, y) {
      return bit(
        Math.round((x - proj.X0) * proj.s),
        Math.round((y - proj.Y0) * proj.s),
      );
    },
    near(x, y) {
      const gi = Math.round((x - proj.X0) * proj.s);
      const gj = Math.round((y - proj.Y0) * proj.s);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) if (bit(gi + a, gj + b)) return true;
      return false;
    },
  };
}

// ── geometry ────────────────────────────────────────────────────────────────

/** the running buffers one mesh is built out of */
interface Buf {
  pos: number[];
  idx: number[];
  /** present only where the mesh carries a per-vertex tone */
  col: number[] | null;
}

function buf(withColour: boolean): Buf {
  return { pos: [], idx: [], col: withColour ? [] : null };
}

/**
 * One closed ring → triangles on the ground.
 *
 * `keep` is the per-triangle gate. It exists for the park wash and the
 * argument is `trees.ts` §"ONE PUBLISHED RING IN 328 IS 71 % OVER THE BAY":
 * one published property is a yacht harbour and its ring is 70.5 % water, so
 * the wash has to stop at the published shoreline. The Canvas gets that from
 * `ctx.clip`; there is no clip here, so the ring is triangulated and every
 * triangle whose CENTROID is outside every published coast ring is dropped.
 *
 * That is a cull and not a boolean clip, and it OVER-cuts rather than under-
 * cuts, because a triangle whose centroid is outside goes whole. Measured
 * against the reference's own figures for the same rings: it drops **55.78 ha
 * over 18 triangles of 2,226**, where the exact clip removes 48.3 ha — 7.5 ha
 * more, 0.4 % of the 1,379 ha of park inside the published line. And it lands
 * on the RIGHT rings: 55.14 of those hectares are the one property whose ring
 * is 70.5 % water, and the only others touched are the eight waterfront
 * properties the reference lists, each losing tenths of a hectare where it
 * overhangs its own beach.
 */
function ringTris(
  ring: readonly (readonly [number, number])[],
  yOf: (x: number, y: number) => number,
  b: Buf,
  rgb: readonly [number, number, number] | null,
  keep?: (cx: number, cy: number) => boolean,
): boolean {
  const m = ring.length;
  if (m < 3) return false;
  /* REAL `Vector2`s. `triangulateShape` strips a duplicated end point with
     `points[l - 1].equals(...)`, so a `{ x, y }` cast compiles and throws at
     runtime on a method the value does not have — `streets.ts` and
     `street-detail.ts` both carry this note and it is the third time in this
     codebase that a structurally-typed cast has passed the compiler and not
     the browser. */
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(ring[k][0], ring[k][1]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return false;

  let taken: number[][] = faces;
  if (keep) {
    taken = [];
    for (const t of faces) {
      const cx = (ring[t[0]][0] + ring[t[1]][0] + ring[t[2]][0]) / 3;
      const cy = (ring[t[0]][1] + ring[t[1]][1] + ring[t[2]][1]) / 3;
      if (keep(cx, cy)) taken.push(t);
    }
    if (!taken.length) return false;
  }

  const base = b.pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = ring[k][0];
    const wy = ring[k][1];
    b.pos.push(wx, yOf(wx, wy), wy);
    if (b.col && rgb) b.col.push(rgb[0], rgb[1], rgb[2]);
  }
  for (const t of taken) b.idx.push(base + t[0], base + t[1], base + t[2]);
  return true;
}

/**
 * ONE SEGMENT OF RIBBON, AS FOUR CORNERS ON THE GROUND.
 *
 * `street-detail.ts` §strip's own shape, with one addition: `shift` moves the
 * quad sideways off the line it follows, which is what puts the pale rim on
 * the WATER side of the ink rather than symmetrically about it.
 *
 * Both ends are extended by the half width for the same reason the kerbs are
 * — two quads meeting at an angle leave a wedge on the outside of every turn,
 * and a butt cap closes it for a hundredth of the cost of a miter. A coast
 * ring turns constantly, so this matters more here than it does on a kerb.
 */
function segQuad(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW: number,
  shift: number,
  yOf: (x: number, y: number) => number,
  b: Buf,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  // the published rings do contain repeated vertices, and a zero-length edge
  // has no direction to offset along
  if (L < 1e-6) return;
  const ux = dx / L;
  const uy = dy / L;
  // the LEFT normal, which is the sign `shift` is expressed in
  const lx = -uy;
  const ly = ux;
  const cx0 = ax - ux * halfW + lx * shift;
  const cy0 = ay - uy * halfW + ly * shift;
  const cx1 = bx + ux * halfW + lx * shift;
  const cy1 = by + uy * halfW + ly * shift;
  const nx = lx * halfW;
  const ny = ly * halfW;
  const base = b.pos.length / 3;
  const c: readonly [number, number][] = [
    [cx0 + nx, cy0 + ny],
    [cx1 + nx, cy1 + ny],
    [cx1 - nx, cy1 - ny],
    [cx0 - nx, cy0 - ny],
  ];
  for (const [wx, wy] of c) b.pos.push(wx, yOf(wx, wy), wy);
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function srgb(hex: string): [number, number, number] {
  const c = new Color();
  c.setStyle(hex, SRGBColorSpace);
  return [c.r, c.g, c.b];
}

/**
 * A ground surface, out of the running buffers.
 *
 * FLAT UP, like the ground and like the street surfaces: the slope is already
 * in the vertices, and a Lambert term taken off an ear-clipped triangulation
 * shades each ear differently — a park that flickers facet to facet down a
 * hillside. The one thing the sun is here for is the shadow a building throws
 * across this, which needs `receiveShadow` and a constant diffuse term.
 */
function groundMesh(
  b: Buf,
  colour: string | null,
  offset: number,
  opacity: number,
): Mesh | null {
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
    /* ── THE WASH ACCUMULATES, AND THAT IS THE WHOLE ARITHMETIC ────────
       `trees.ts` §"ONE FILL A RING, NOT ONE FILL FOR ALL OF THEM": the 328
       rings are not disjoint, a park ring and the recreation-area ring on
       top of it are two claims over one piece of ground, and the reference
       fills each at 0.46 so the pair composes to 0.708. Merging them into
       one mesh does NOT lose that — blending happens per fragment per
       triangle, so two overlapping triangles of one geometry blend twice,
       exactly as two fills do. What would lose it is an even-odd fill, and
       that is what the reference had to stop doing. */
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const out = new Mesh(g, m);
  out.receiveShadow = true;
  out.castShadow = false;
  return out;
}

export function groundDetailLayer(
  data: CityData,
  o: GroundDetailLayerOptions,
): (CityLayer & { meshes: Mesh[] }) | null {
  const meshes: Mesh[] = [];
  /* the flat surfaces follow the ground's exaggeration on a band change; the
     blobs do not, because a blob's own height is not a ground quantity */
  const flat: Mesh[] = [];
  const blobs: InstancedMesh[] = [];
  /** per blob mesh: the ground metres under each instance */
  const blobY: { mesh: InstancedMesh; ground: Float32Array }[] = [];
  let zexNow = o.zex;

  const land = landProbe(data);
  const yGround = (x: number, y: number): number => o.elevAt(x, y) * zexNow;

  // ── the published shoreline ───────────────────────────────────────────────
  const coastChunk = data.get("base/coast");
  let coast: Ring[] = [];
  if (coastChunk) coast = decodeCoast(coastChunk).coast;

  if (coast.length && land) {
    const halfRim = (land.cellM * SHORE_RIM_CELL_K) / 2;
    const halfInk = halfRim * SHORE_INK_K;
    const rim = buf(false);
    const ink = buf(false);
    const yShore = (x: number, y: number): number =>
      Math.max(SHORE_Z_M, o.elevAt(x, y)) * zexNow;

    /* WHICH SIDE THE WATER IS ON, ASKED OF THE PUBLISHED MASK RATHER THAN OF
       THE WINDING. A rim laid on the water side by ring orientation needs all
       four published rings to be wound the same way, and nothing in the file
       promises that; a rim laid by sampling the land bit three quarters of a
       cell out on each side needs no promise at all. Where both sides read
       the same — a pier, a spit, a sliver the raster cannot resolve — the rim
       goes back to being centred on the line, which is what the reference's
       own `stroke()` does everywhere. */
    const probeM = land.cellM * 0.75;
    for (const ring of coast) {
      let pen = false;
      for (let i = 0; i < ring.length; i++) {
        const x = ring[i][0];
        const y = ring[i][1];
        /* THE REFERENCE'S OWN GATE, and the pen LIFTS on a vertex that fails
           so a run of offshore vertices leaves a gap rather than a chord
           across open water. `water.ts` §drawShoreline: *"the vector
           shoreline resolves piers and slivers the raster cannot, and
           stroking those draws INK FLOATING ON EMPTY WATER."* */
        if (!land.near(x, y)) {
          pen = false;
          continue;
        }
        if (pen) {
          const ax = ring[i - 1][0];
          const ay = ring[i - 1][1];
          const mx = (ax + x) / 2;
          const my = (ay + y) / 2;
          const dx = x - ax;
          const dy = y - ay;
          const L = Math.hypot(dx, dy) || 1;
          const lx = (-dy / L) * probeM;
          const ly = (dx / L) * probeM;
          const leftWet = !land.at(mx + lx, my + ly);
          const rightWet = !land.at(mx - lx, my - ly);
          const shift = leftWet === rightWet ? 0 : leftWet ? halfRim : -halfRim;
          segQuad(ax, ay, x, y, halfRim, shift, yShore, rim);
          segQuad(ax, ay, x, y, halfInk, 0, yShore, ink);
        }
        pen = true;
      }
    }
    /* THE RIM IS STROKED FIRST AND THE INK OVER IT — `water.ts` §THE RIM. The
       pale is `rgba(255,252,242,.75)` over whatever is under the coast, which
       at the shore is the bay; the alpha is kept and the blend does the rest,
       so a rim over dark water and a rim over pale sand are not the same
       colour, which is what an alpha means. */
    const mRim = groundMesh(rim, "#fffcf2", OFF_RIM, 0.75);
    const mInk = groundMesh(ink, "#0a0a0a", OFF_INK, 0.5);
    for (const m of [mRim, mInk]) {
      if (m) {
        meshes.push(m);
        flat.push(m);
      }
    }
  }

  // ── the park rings and the inland water bodies ────────────────────────────
  const parksChunk = data.get("base/parks");
  if (parksChunk) {
    const decoded = decodeParks(parksChunk);

    /* the wash stops at the published shoreline; with no coast on the wire
       there is nothing to stop it at, and the reference degrades the same way
       (`borrowedCoast()` returning null) rather than refusing to draw */
    const clip =
      WFLG.parkShore && coast.length
        ? (cx: number, cy: number): boolean => {
            for (const ring of coast) if (inPoly(cx, cy, ring)) return true;
            return false;
          }
        : undefined;

    /* ONE MESH, FIVE TONES, ZERO EXTRA DRAW CALLS. The reference changes
       `fillStyle` per change of class; a material change here is a draw call,
       so the class rides on a vertex colour instead. Same five tones, same
       published `cls` byte, one call. */
    const toneRGB = PARK_TONE.map((hex) => srgb(hex));
    const fallback = srgb(WPKW);
    const park = buf(true);
    for (const ring of decoded.parks) {
      const cls = WFLG.parkCls ? ring.cls : undefined;
      const rgb =
        cls !== undefined && cls < toneRGB.length ? toneRGB[cls] : fallback;
      ringTris(ring, yGround, park, rgb, clip);
    }
    const mPark = groundMesh(park, null, OFF_PARK, PARK_WASH);
    if (mPark) {
      meshes.push(mPark);
      flat.push(mPark);
    }

    /* ── ONE ELEVATION FOR THE WHOLE BODY ─────────────────────────────
       `trees.ts` §drawWaterBodies, and it is not an economy: *"a lake is
       level and reading the DEM per vertex tilts it down the hillside it
       sits on."* A reservoir read per vertex off a 53.8 m raster comes out
       as a sloping sheet of water, which is the one thing a body of water
       cannot be.

       THE TRAILING STROKE IS NOT PORTED. The reference strokes OUTSIDE its
       loop, so exactly one body — whichever the loop left on the context —
       gets a dark outline, and `trees.ts` explains that this is deliberate
       in `part3.html` and safe in the port because each body is its own
       `Path2D`. It is not portable here for a reason that has nothing to do
       with safety: a mesh has no "last path", so reproducing it would mean
       choosing one body out of 32 to outline and outlining it, which is a
       claim about that body that neither register makes. */
    const lake = buf(false);
    for (const ring of decoded.water) {
      if (!ring.length) continue;
      let z = 0;
      for (const v of ring) z += o.elevAt(v[0], v[1]);
      z /= ring.length;
      ringTris(ring, () => z * zexNow, lake, null);
    }
    const mLake = groundMesh(lake, WLAKE, OFF_LAKE, 1);
    if (mLake) {
      meshes.push(mLake);
      flat.push(mLake);
    }
  }

  // ── the canopy, as masses ─────────────────────────────────────────────────
  const canopyEntries = data.manifest.chunks.filter(
    (c) => c.kind === "canopy" || c.kind === "tree",
  );
  const geom = canopyMass({ tone: MASS_TONE, gain: MASS_GAIN });
  /* ── LAMBERT WITH THE DOME'S OWN NORMALS, AND SMOOTH ────────────────────
     The defect this whole pass exists for was a detail-0 icosahedron shaded
     FLAT: twenty facets, all within a few degrees of horizontal once the
     solid was squashed, all lit by the same near-vertical rig — so every
     facet came back the same value and what fifty thousand of them made was
     a HEX PATTERN printed on the grass.

     Two materials were tried in its place and the numbers are in
     `MASS_GAIN`. `MeshBasicMaterial` is the tidy argument — a mass ARRIVES
     lit, the way the bay does in `layers/water.ts` — and it is the wrong one
     here: with no rig at all the only variation left is the geometry's own
     ramp, which runs with HEIGHT, and a squat dome seen from above shows
     almost none of its own height. MEASURED over the street capture by
     ablating the layer on both pages, the spread of the canopy's own pixels:
     published 74.6 of luminance, Lambert 51.6, Basic 45.4. The rig's key is a
     `HemisphereLight` at 1.60 — a light that is itself brighter from above —
     plus a directional at 0.75, and between them they are the only thing in
     this renderer that can tell one SIDE of a mass from another. */
  const blobMat = new MeshLambertMaterial({ vertexColors: true });

  if (canopyEntries.length) {
    /* THE VEGETATION GRID IS READ OFF THE CATALOGUE, NOT OFF A CONSTANT.
       `cellKey = row * gw + col` and `gw` moved in the encoder once while a
       renderer's copy of it did not; every cell in the city decoded on the
       old width and landed in open water. `assertTreeGrid` throws if the
       entries disagree, which is the only version of this that cannot drift. */
    const grid = assertTreeGrid(canopyEntries);
    const amax = grid.cell * grid.cell;

    /* ── THE TONE IS THE PUBLISHED COVERAGE, WITHOUT THE BAKED LIGHT ────
       `canopyToneOf` puts its ramp through `skylit(...)` on the DEM node
       under the cell, because a Canvas sprite carries its own shading or it
       has none. This renderer has a real sun and a real shadow map, so the
       ramp is taken at its base — `lerpHex(TREE_GREENS[0], CANOPY_FAM.mid,
       cov / 3)`, which is `canopyToneOf`'s own first two lines — and the
       light is left to the light. Baking it as well would shade the same
       mass twice, which is exactly what `terrain.ts` §"THE GROUND'S NORMALS
       POINT STRAIGHT UP" refuses for the ground.

       `WFLG.canopyTone` off collapses the four coverage bins back to the
       reference's own two endpoints, because with `CANOPY_COV_Q.length` bins
       the ablation is `u ∈ {0, 1}` and those two ARE `TREE_FAM[0]` and
       `CANOPY_FAM`. Read once, here, at build: this layer is built once and
       an ablation is a reload, where the Canvas re-reads it per frame. */
    const bins = CANOPY_COV_Q.length;
    const ramp: Color[] = [];
    for (let cov = 0; cov <= bins; cov++) {
      const c = new Color();
      c.setStyle(lerpHex(TREE_GREENS[0], CANOPY_FAM.mid, cov / bins), SRGBColorSpace);
      ramp.push(c);
    }

    const m4 = new Matrix4();
    const pos = new Vector3();
    const scl = new Vector3();
    /* A REAL QUATERNION. `Matrix4.compose` reads `_x`/`_y`/`_z`/`_w` — the
       PRIVATE fields — so `{ x: 0, y: 0, z: 0, w: 1 }` cast to the type
       compiles, runs, and writes NaN into all nine rotation-and-scale
       components of every instance: nothing drawn, nothing thrown. The tree
       layer paid for this one. */
    const rot = new Quaternion();

    for (const entry of canopyEntries) {
      if (entry.kind !== "canopy") continue;
      const chunk = data.get(entry.k);
      if (!chunk) continue;
      const cellKey = chunk.fields.cellKey;
      const cpos = chunk.fields.pos;
      const area = chunk.fields.area;
      if (!cellKey || !cpos || !area || !cellKey.length) continue;

      /* ── EVERY MASS THIS CHUNK DRAWS, PLACED BEFORE ANY MESH EXISTS ────
         The bucket a mass belongs to is a fact about where it is, so the
         cells are read once into flat arrays and the meshes are cut out of
         them afterwards. Nothing here is a per-frame cost: the layer is
         built once. */
      const N = cellKey.length;
      const wx = new Float32Array(N);
      const wy = new Float32Array(N);
      const wg = new Float32Array(N);
      const wr = new Float32Array(N);
      const wc = new Uint8Array(N);
      let kept = 0;
      let lo0 = Infinity;
      let lo1 = Infinity;
      let hi0 = -Infinity;
      let hi1 = -Infinity;
      for (let i = 0; i < N; i++) {
        const areaM2 = (area[i] / 255) * amax;
        /* THE PUBLISHED-AREA FLOOR, AND IT IS THE ONLY ONE OF THE
           REFERENCE'S TWO GATES THAT PORTS. `BLOB_MIN_M2` = 58.06 is 25 ft
           squared and it is a claim about the DATA — a cell holding less
           than that is already carried by the ground tint and a mass would
           be one small crown's worth of paint. The other gate, `rp < 0.9`,
           is a claim about the CAMERA: a drawn radius under nine tenths of a
           pixel cannot resolve, which is a fact about a blit and not about a
           cell. There is no blit here, so that gate has nothing to gate. */
        if (areaM2 < BLOB_MIN_M2) continue;
        const w = treeWorld(cellKey[i], cpos[i], grid);
        wx[kept] = w.x;
        wy[kept] = w.y;
        /* ── SEATED ON THE HIGHEST GROUND IT COVERS, NOT ON ITS OWN POINT ──
           A mass is 38 m across at a full cell and the DEM under it is a
           53.8 m raster, so its footprint routinely spans a slope. Seated on
           the one sample at its own centre, the uphill half of every mass on
           a hillside is INSIDE the hill — and the ground is exaggerated by
           3.3, so a real 17-degree slope is enough to bury a dome as tall as
           its own radius. What showed was a crescent of the downhill rim,
           which is what the park read as before this.
           Five published samples over the mass's own footprint and the
           highest wins: no invented elevation, and nothing it covers is
           above its foot. Downhill it now stands proud of the slope, which
           is what a canopy over a hillside does. */
        const pr = blobRadius(areaM2) * CANOPY_MASS_SPREAD * 0.7;
        wg[kept] = Math.max(
          o.elevAt(w.x, w.y),
          o.elevAt(w.x + pr, w.y),
          o.elevAt(w.x - pr, w.y),
          o.elevAt(w.x, w.y + pr),
          o.elevAt(w.x, w.y - pr),
        );
        /* ── AND THE MASS IS DRAWN AT THE SPREAD THE REFERENCE DRAWS IT AT
           ────────────────────────────────────────────────────────────────
           `blobRadius(area)` is the radius the published area implies and
           the 2D renderer does not stop the silhouette there: its sprite
           lays the six-lobe path at 1.05 of the crown's lobe radii, whose
           widest lobe is `[-0.52, 0.12, 0.68]`, so the mass reaches 1.26 of
           that radius on screen. Stopping at 1.00 covers 63 % of the ground
           the reference paints for the same cell — MEASURED over the
           Presidio crop, 32.5 % of pixels green against the published
           page's 51.4 %. */
        wr[kept] = blobRadius(areaM2);
        wc[kept] =
          WFLG.canopyTone
            ? canopyCovBin(area[i])
            : areaM2 > amax * 0.55
              ? bins
              : 0;
        if (w.x < lo0) lo0 = w.x;
        if (w.x > hi0) hi0 = w.x;
        if (w.y < lo1) lo1 = w.y;
        if (w.y > hi1) hi1 = w.y;
        kept++;
      }
      if (!kept) continue;

      /* the bucket index of every mass, and how many land in each */
      const spanX = Math.max(1e-6, hi0 - lo0);
      const spanY = Math.max(1e-6, hi1 - lo1);
      const B = MASS_BUCKETS;
      const bucketOf = new Uint16Array(kept);
      const tally = new Uint32Array(B * B);
      for (let i = 0; i < kept; i++) {
        const bi = Math.min(B - 1, Math.floor(((wx[i] - lo0) / spanX) * B));
        const bj = Math.min(B - 1, Math.floor(((wy[i] - lo1) / spanY) * B));
        const b = bj * B + bi;
        bucketOf[i] = b;
        tally[b]++;
      }

      const filled = new Uint32Array(B * B);
      const perBucket: (InstancedMesh | null)[] = new Array(B * B).fill(null);
      const groundOf: (Float32Array | null)[] = new Array(B * B).fill(null);
      for (let b = 0; b < B * B; b++) {
        if (!tally[b]) continue;
        const mesh = new InstancedMesh(geom, blobMat, tally[b]);
        /* THEY DO NOT CAST, AND THAT IS MEASURED. `trees.ts` in this
           directory has the number: an `InstancedMesh` has no per-instance
           culling, so every crown in a chunk is re-rendered into the shadow
           map whether it is on screen or not, and the block camera sat at
           991 ms for a metre of dapple. A canopy MASS is a worse bargain
           than a crown — it is wider, flatter and there are 50,897 of them.
           Buildings cast, which is the shadow anybody looks at. */
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        perBucket[b] = mesh;
        groundOf[b] = new Float32Array(tally[b]);
      }

      for (let i = 0; i < kept; i++) {
        const b = bucketOf[i];
        const mesh = perBucket[b];
        const gY = groundOf[b];
        if (!mesh || !gY) continue;
        const n = filled[b]++;
        // y = 0 IS THE GROUND in `canopyMass`, so the ground point IS the
        // position — no lift, and nothing to undo when the band changes
        pos.set(wx[i], wg[i] * zexNow, wy[i]);
        /* `canopyMass` puts its widest ring at r = 1 and its apex at y = 1,
           so the two ratios go in here: 1.26 of the published radius wide
           and 1.81 of it tall, both off the reference's own sprite. */
        scl.set(
          wr[i] * CANOPY_MASS_SPREAD,
          wr[i] * CANOPY_MASS_RISE,
          wr[i] * CANOPY_MASS_SPREAD,
        );
        /* A YAW PER MASS, FROM ITS INDEX. Fifty thousand identical solids at
           one orientation is a pattern, and the eye finds a pattern before it
           finds a tree — which is exactly what the hex grid was. Derived
           from the index so a rebuild puts every mass back where it was. */
        setCrownYaw(i, rot);
        m4.compose(pos, rot, scl);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, ramp[wc[i]]);
        gY[n] = wg[i];
      }

      for (let b = 0; b < B * B; b++) {
        const mesh = perBucket[b];
        const gY = groundOf[b];
        if (!mesh || !gY) continue;
        mesh.count = filled[b];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        meshes.push(mesh);
        blobs.push(mesh);
        blobY.push({ mesh, ground: gY });
      }
    }
  }

  if (!meshes.length) {
    geom.dispose();
    blobMat.dispose();
    return null;
  }

  return {
    name: "ground-detail",
    meshes,
    /* NO `onYear`. The park register's own date fields are a single GIS load
       (`trees.ts` §THE DATE FIELD WAS CHECKED BEFORE IT WAS USED), the
       shoreline is undated, and THE CANOPY CHUNK PUBLISHES NO YEAR AT ALL —
       so all four are drawn in every year. Emitting them in some invented
       order and gating a draw range on it would put a date on 50,897 cells
       that no file gives one to. */
    onStep(step: number, zex: number) {
      /* ── THE LADDER, AS FAR AS A STEP FUNCTION CAN CARRY IT ──────────
         `trees.ts` §the ladder dissolves the canopy masses in over
         [VZ_C0, VZ_C1] = [1.55, 2.90] and below that the ground TINT carries
         the canopy — which `terrain.ts` already applies here, out of the same
         published fraction. A band is a step function and cannot dissolve, so
         this takes the band the dissolve COMPLETES in, `stepForZ(VZ_C1)`, and
         shows the masses whole from there. Below it the tint has the canopy
         on its own, which is what the ladder says it should. */
      const show = step >= stepForZ(VZ_C1);
      for (const m of blobs) m.visible = show;

      if (zex === zexNow) return;
      const k = zex / zexNow;
      /* the ground moved under everything, so everything moves with it — one
         pass over Y, the same trick the streets use. The ribbon's sea-level
         floor scales too: `SHORE_Z_M` is a height in ground metres and the
         exaggeration is what turns ground metres into scene units. */
      for (const m of flat) {
        const p = m.geometry.getAttribute("position") as BufferAttribute;
        const arr = p.array as Float32Array;
        for (let v = 0; v < arr.length; v += 3) arr[v + 1] *= k;
        p.needsUpdate = true;
        m.geometry.computeBoundingSphere();
      }
      /* A BLOB IS NOT SCALED, IT IS RE-SEATED. Multiplying an instance's Y by
         the same factor would exaggerate the MASS as well as the ground it
         stands on, and a canopy mass has no published height to exaggerate —
         its height is a borrowed ratio. So only the foot moves, and since
         `canopyMass` puts y = 0 on the ground the foot IS the translation. */
      for (const b of blobY) {
        for (let i = 0; i < b.mesh.count; i++) {
          b.mesh.getMatrixAt(i, m4Step);
          m4Step.elements[13] = b.ground[i] * zex;
          b.mesh.setMatrixAt(i, m4Step);
        }
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.computeBoundingSphere();
      }
      zexNow = zex;
    },
    dispose() {
      for (const m of meshes) {
        if (m instanceof InstancedMesh) m.dispose();
        else {
          m.geometry.dispose();
          (m.material as MeshLambertMaterial).dispose();
        }
      }
      geom.dispose();
      blobMat.dispose();
      meshes.length = 0;
      flat.length = 0;
      blobs.length = 0;
      blobY.length = 0;
    },
  };
}

