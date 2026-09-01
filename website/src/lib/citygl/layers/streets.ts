/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/streets.ts — THE STREETS, AS SURFACES.

   22,191 published rights of way and the carriageway inside each. The single
   biggest thing missing from a city drawn only as ground and buildings: the
   grid is what a reader navigates by, and without it every frame reads as
   blocks floating on a field.

   ── TWO POLYGONS A STREET, AND BOTH ARE PUBLISHED ────────────────────────
   The `strt` chunk carries, per feature, the RIGHT OF WAY ring — wall to wall,
   the whole public width — and inside it the ROADWAY ring, the carriageway
   between the kerbs. What is between them is the footway. So the sidewalk is
   not drawn and not invented: it is the part of the right of way the roadway
   does not cover, and it appears because the two are filled in different
   tones, one over the other.

   ── WHY THEY LIE ON THE GROUND AND NOT ABOVE IT ──────────────────────────
   Every vertex is lifted to the terrain's own elevation, so a street runs up
   Nob Hill with the hill. The two fills are then separated in the DEPTH
   BUFFER by `polygonOffset` rather than by a height: lifting the roadway a
   few centimetres would also move it down-screen in an axonometric
   projection, and a carriageway sliding out of its own kerbs is a great deal
   more visible than a z-fight.
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
import { ST_ALPHA, ST_C_FOOT, ST_C_ROAD, surfaceW } from "@/lib/city/streets";
import type { CityLayer } from "../engine";

export interface StreetsLayerOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — a street is ground, not a built thing */
  zex: number;
}

/** `ringIndex` in `streets.ts`: rings-per-feature + lengths → flat offsets */
function ringIndex(n: number, per: Uint8Array, len: Uint16Array): { off: Uint32Array; fo: Uint32Array } {
  const fo = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) fo[i + 1] = fo[i] + per[i];
  const R = fo[n];
  const off = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) off[r + 1] = off[r] + len[r];
  return { off, fo };
}

/**
 * One ring → triangles, appended to the running buffers.
 *
 * `ShapeUtils.triangulateShape` is an ear clipper and it wants a SIMPLE
 * polygon; a published right of way is one. Rings after the first are treated
 * as separate polygons rather than as holes — a street's second ring is a
 * separate lobe of the same right of way (a fork, a plaza), not a void, and
 * on the 72 features that have one, filling it is right and cutting it out
 * would leave a hole in the road.
 */
/**
 * ── AND THE TRIANGLES HAVE TO BE SMALL ENOUGH TO FOLLOW THE HILL ─────────
 *
 * An ear clipper is free to lay ONE triangle across a whole block. On flat
 * ground that is ideal and costs nothing. On Twin Peaks it is a lie: the three
 * corners sit on the terrain and everything between them is a flat plane
 * stretched over a slope that drops 40 m underneath it. What a reader sees is
 * a grey sheet cutting across the hillside, hanging in the air at one end and
 * buried at the other — Daniel, looking at Twin Peaks: *"weird angular grey
 * shapes."*
 *
 * So every triangle whose longest side is more than `MAX_EDGE_M` is split at
 * that side's midpoint, and the midpoint is lifted to the terrain like any
 * other vertex. Repeated until nothing is over the limit, it turns one flat
 * plane into a fan that follows the ground.
 *
 * 22 m is the published median right-of-way width (`w_p50` 22.3 m), which is
 * the natural grain of this layer: a street is already about that wide, so
 * splitting at it costs roughly one extra triangle per block-length of street
 * on the flat, and only pays the real cost where the ground actually moves.
 * The recursion is bounded at 6 levels — 64 triangles from one — so a
 * pathological ring cannot run away.
 */
/* ── ONE DEPTH LADDER FOR EVERYTHING THAT LIES ON THE GROUND ─────────────
   Every layer here is coplanar with the terrain, so none of them can be
   separated by height — in an axonometric projection a Y offset is also a
   SCREEN offset. They are separated in the DEPTH BUFFER instead, and the sign
   is the whole thing: a POSITIVE `polygonOffsetFactor` pushes a polygon AWAY
   from the camera, a negative one brings it forward.

   This stack had both signs in it. The street surfaces were pushed BACK (+4
   and +2) while the kerbs were pulled forward (-1) and the traffic islands
   pushed back again (+1). A pushed-back surface coplanar with the ground wins
   the depth test wherever the ground happens to slope toward the camera and
   loses it everywhere else — and because polygon offset scales with the
   depth SLOPE, which way it goes changes with the zoom. Daniel: *"parts of
   the street come when I zoom in but not completely, and some not at all, it
   seems like some sort of shading weird thing."* That is this, exactly.

   So there is one ladder now, all negative, ordered by what should be on top
   of what. Nothing in it is a taste; the ORDER is the published paint order
   and the numbers are just consecutive.

     0   the ground
    -1   the block tint          (under the parks and the streets)
    -2   the right of way        (the footway, wall to wall)
    -3   the carriageway         (and the roads with no published polygon)
    -4   the tonal contrast pass
    -5   kerbs, islands, stairs
    -6   crossings, lane lines, the centreline ink
*/
const MAX_EDGE_M = 22;

/* dev-only tally: how much of the published network never becomes geometry.
   A street with a centreline and no surface is the shape of the complaint
   *"there's a trace of a street but no asphalt"*, and there are three ways to
   get one — no ring at all, a ring of fewer than three points, and a ring the
   ear clipper refuses. This counts all three so the answer is a number. */
const STAT = { rings: 0, short: 0, failed: 0, noRow: 0, noRoad: 0, features: 0 };
const MAX_SPLIT_DEPTH = 6;

function ringTris(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  pos: number[],
  idx: number[],
): void {
  const m = to - from;
  if (m < 3) { STAT.short++; return; }
  STAT.rings++;
  /* REAL `Vector2`s, not plain objects. `triangulateShape` strips duplicate
     end points with `points[l - 1].equals(...)`, so `{ x, y }` throws
     `points[l-1].equals is not a function` — the same shape of mistake the
     tree layer made with a hand-rolled quaternion, and the second time in one
     session that a structurally-typed cast compiled and then failed at
     runtime on a METHOD the value does not have. */
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(x[from + k], y[from + k]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) { STAT.failed++; return; }

  const base = pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = x[from + k];
    const wy = y[from + k];
    pos.push(wx, elevAt(wx, wy) * zex, wy);
  }

  /** a vertex at (wx, wy), on the ground, appended once */
  const put = (wx: number, wy: number): number => {
    const i = pos.length / 3;
    pos.push(wx, elevAt(wx, wy) * zex, wy);
    return i;
  };
  const px = (i: number): number => pos[i * 3];
  const py = (i: number): number => pos[i * 3 + 2];

  const split = (a: number, b: number, c: number, depth: number): void => {
    if (depth < MAX_SPLIT_DEPTH) {
      const ab = Math.hypot(px(b) - px(a), py(b) - py(a));
      const bc = Math.hypot(px(c) - px(b), py(c) - py(b));
      const ca = Math.hypot(px(a) - px(c), py(a) - py(c));
      const longest = Math.max(ab, bc, ca);
      if (longest > MAX_EDGE_M) {
        /* split the LONGEST side, which keeps the children from degenerating
           into slivers the way splitting a fixed side would */
        if (longest === ab) {
          const mid = put((px(a) + px(b)) / 2, (py(a) + py(b)) / 2);
          split(a, mid, c, depth + 1);
          split(mid, b, c, depth + 1);
        } else if (longest === bc) {
          const mid = put((px(b) + px(c)) / 2, (py(b) + py(c)) / 2);
          split(a, b, mid, depth + 1);
          split(a, mid, c, depth + 1);
        } else {
          const mid = put((px(c) + px(a)) / 2, (py(c) + py(a)) / 2);
          split(a, b, mid, depth + 1);
          split(mid, b, c, depth + 1);
        }
        return;
      }
    }
    idx.push(a, b, c);
  };

  for (const t of faces) split(base + t[0], base + t[1], base + t[2], 0);
}

/** metres of one paving panel — see §AND THE PAVING WAS ONE TONE */
const PAVE_M = 70;
/** how far a panel's tone may wander from its published colour */
const PAVE_MOTTLE = 0.13;

/** a deterministic hash on an integer lattice, 0..1 */
function paveHash(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 16;
  return (h >>> 8) / 0xffffff;
}

/** the paving tint at a world point: smooth, so a run of a block agrees */
function paveMottle(x: number, z: number): number {
  const fx = x / PAVE_M;
  const fz = z / PAVE_M;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const tx = fx - i0;
  const tz = fz - j0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = paveHash(i0, j0);
  const b = paveHash(i0 + 1, j0);
  const cc = paveHash(i0, j0 + 1);
  const d = paveHash(i0 + 1, j0 + 1);
  const n = (a + (b - a) * sx) * (1 - sz) + (cc + (d - cc) * sx) * sz;
  return 1 + (n * 2 - 1) * PAVE_MOTTLE;
}

function mesh(
  pos: number[],
  idx: number[],
  colour: string,
  offset: number,
  order: number,
): Mesh | null {
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  /* FLAT UP, like the ground: a street's own slope is already in its
     vertices, and a Lambert term computed from a triangulated road surface
     would shade each ear-clipped triangle differently — a road that flickers
     facet to facet down a hill. */
  const n = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(n, 3));
  /* FLAT UP, like the ground: a street's own slope is already in its
     vertices, and a Lambert term computed from a triangulated road surface
     would shade each ear-clipped triangle differently — a road that flickers
     facet to facet down a hill. */
  g.computeBoundingSphere();

  /* ── AND THE PAVING WAS ONE TONE FROM THE PRESIDIO TO HUNTERS POINT ───
     Every right of way in the city was drawn at a single value. A road
     surface is one of the largest continuous things in the frame, and real
     paving is nothing like uniform: it is laid, cut, patched and relaid in
     stretches, so from above it reads as panels of slightly different age
     against each other, block by block.

     So the wash carries a vertex tint on a smooth field of about seventy
     metres — long enough that a whole run of a block shares its tone and the
     variation lands BETWEEN stretches rather than across the width of a
     carriageway, which would read as a gradient down the middle of the road
     instead of as paving.

     It MULTIPLIES the material's own colour, so the roadway, the footway and
     the kerb each vary around their own published tone and none of them
     drifts toward another. Declared: not a claim about any resurfacing
     anywhere, the same status as the ground mottle it is washed over. */
  const vc = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) {
    const t = paveMottle(pos[v * 3], pos[v * 3 + 2]);
    vc[v * 3] = t;
    vc[v * 3 + 1] = t;
    vc[v * 3 + 2] = t;
  }
  g.setAttribute("color", new BufferAttribute(vc, 3));

  const c = new Color();
  c.setStyle(colour, SRGBColorSpace);
  /* ── A STREET IS A WASH, NOT A FILL, AND THIS IS THE WHOLE LOOK ────────
     `drawStreetSurface` paints at `ST_ALPHA` — 0.8 — over ground it does not
     replace, so the terrain's own colour, its hillshade and its park tint all
     read THROUGH the roadway and the footway. Drawn opaque, as this layer
     first did, every right of way becomes a flat sheet of one cream and the
     city loses the ground it stands on: Daniel, looking at a block frame,
     *"it still looks awful."* He was looking at 22,191 opaque polygons.

     `depthWrite` is off because these are coplanar with each other and with
     the ground; the order between them is stated by `renderOrder` — footway,
     then carriageway over it — rather than left to a depth test that has
     nothing to separate. */
  const m = new MeshLambertMaterial({
    color: c,
    vertexColors: true,
    side: DoubleSide,
    transparent: true,
    opacity: ST_ALPHA,
    depthWrite: false,
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
  out.receiveShadow = true;
  out.castShadow = false;
  out.renderOrder = order;
  /* the bias above is asked for and does not arrive on the WebGPU backend;
     `engine.ts` §THE DEPTH LADDER HAD TO BECOME GEOMETRY has the three
     bit-identical frames that establish that, and seats this rung instead */
  out.userData.wash = true;
  return out;
}

export function streetsLayer(
  data: CityData,
  o: StreetsLayerOptions,
): CityLayer & { meshes: Mesh[]; features: number } {
  const meshes: Mesh[] = [];
  /** the exaggeration the vertices were BAKED at — `onStep` scales against
   *  this and never against the last value it was handed, so a band change
   *  cannot accumulate rounding. See §THE EXAGGERATION IS A TRANSFORM. */
  const bakedZex = o.zex;
  /** each chunk's own median right-of-way width, metres */
  const medians: number[] = [];
  const gates: {
    g: BufferGeometry;
    marks: number[];
    upTo: (y: number | undefined) => number;
    full: number;
  }[] = [];
  let features = 0;

  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const c = chunk.fields as unknown as {
      cls: Uint8Array;
      yr: Uint16Array;
      rwN: Uint8Array; rwLen: Uint16Array; rwX: Float32Array; rwY: Float32Array;
      rdN: Uint8Array; rdLen: Uint16Array; rdX: Float32Array; rdY: Float32Array;
    };
    const n = c.cls.length;
    if (!n) continue;

    const rw = ringIndex(n, c.rwN, c.rwLen);
    const rd = ringIndex(n, c.rdN, c.rdLen);

    const rowPos: number[] = [];
    const rowIdx: number[] = [];
    const rdPos: number[] = [];
    const rdIdx: number[] = [];

    /* ── EMITTED IN ACCEPTANCE-YEAR ORDER ──────────────────────────────
       Same rule as the footprints and the canopy: a right of way is not
       drawn before the year the Board is recorded accepting it, `yr` 0 means
       the record is silent and a silent street is drawn from the first year
       the map draws. Emitting in that order makes the century scrub a draw
       range rather than a rebuild. */
    const ord = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => (c.yr[a] || 0) - (c.yr[b] || 0) || a - b,
    );
    const emitted: number[] = [];
    const rowMark: number[] = [];
    const rdMark: number[] = [];
    /* the published footway band of each feature, for the fade below */
    const fw: number[] = [];

    for (const i of ord) {
      const rowBefore = rowIdx.length;
      const rdBefore = rdIdx.length;
      for (let r = rw.fo[i]; r < rw.fo[i + 1]; r++) {
        ringTris(c.rwX, c.rwY, rw.off[r], rw.off[r + 1], o.elevAt, o.zex, rowPos, rowIdx);
      }
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        ringTris(c.rdX, c.rdY, rd.off[r], rd.off[r + 1], o.elevAt, o.zex, rdPos, rdIdx);
      }
      /* the footway band is the right of way less the roadway, and it is the
         width the published ramp is keyed on. Taken from the rings' own
         bounding boxes rather than a column, because that is what is here. */
      let rwW = 0;
      for (let r = rw.fo[i]; r < rw.fo[i + 1]; r++) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let k = rw.off[r]; k < rw.off[r + 1]; k++) {
          if (c.rwX[k] < x0) x0 = c.rwX[k];
          if (c.rwX[k] > x1) x1 = c.rwX[k];
          if (c.rwY[k] < y0) y0 = c.rwY[k];
          if (c.rwY[k] > y1) y1 = c.rwY[k];
        }
        if (Number.isFinite(x0)) rwW = Math.max(rwW, Math.min(x1 - x0, y1 - y0));
      }
      if (rwW > 0) fw.push(rwW);
      STAT.features++;
      if (rowIdx.length === rowBefore) STAT.noRow++;
      if (rdIdx.length === rdBefore) STAT.noRoad++;
      emitted.push(c.yr[i] === 0 ? -1 : c.yr[i]);
      rowMark.push(rowIdx.length);
      rdMark.push(rdIdx.length);
      features++;
    }

    /* the right of way first and further back, the carriageway over it — so
       what shows around the roadway is the footway, which is what it is */
    const a = mesh(rowPos, rowIdx, ST_C_FOOT, -2, 1);
    const b = mesh(rdPos, rdIdx, ST_C_ROAD, -3, 2);
    const upTo = (year: number | undefined): number => {
      if (year === undefined) return emitted.length;
      let lo = 0;
      let hi = emitted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (emitted[mid] <= year) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    fw.sort((p2, q2) => p2 - q2);
    medians.push(fw.length ? fw[fw.length >> 1] : 22.3);
    if (a) {
      meshes.push(a);
      gates.push({ g: a.geometry, marks: rowMark, upTo, full: rowIdx.length });
    }
    if (b) {
      meshes.push(b);
      gates.push({ g: b.geometry, marks: rdMark, upTo, full: rdIdx.length });
    }
  }

  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    (globalThis as { __cityGLStreetStat?: unknown }).__cityGLStreetStat = { ...STAT };
  }

  return {
    name: "streets",
    meshes,
    features,
    /* ── THE SURFACE IS NOT DRAWN AT EVERY CAMERA, AND THIS WAS A REAL BUG ──
       The Canvas renderer gates the right-of-way SURFACE on `streetsResolve`:
       below about two projected pixels of width the tier is not dispatched at
       all and the street network is carried by centrelines alone. That is not
       an optimisation — it is what the picture needs. Drawn at full opacity at
       the whole-city camera, the footway tone (`ST_C_FOOT`, a pale cream)
       covers most of the Sunset, the Richmond and the Excelsior, and the
       result is a bleached sheet with the terrain and the fabric buried under
       it. Daniel: *"the terrain barely shows."* He was looking at this.

       Gated to the district camera and closer, the ground gets its colour back
       and the streets still read, because at that zoom they are wide enough to
       be a surface rather than a wash. */
    onYear(year: number | undefined) {
      for (const gt of gates) {
        const k = gt.upTo(year);
        gt.g.setDrawRange(0, k ? gt.marks[k - 1] : 0);
      }
    },
    /* ── THE SURFACE FADES IN, IT DOES NOT SWITCH ON ────────────────────
       This layer used to be gated `step >= 1`: every street surface in the
       city appeared or vanished together the instant the camera crossed a band
       threshold. Daniel: *"some of the street parts appearing then they
       disappear."* Measured, all 124 chunks flip at once — 124 visible at the
       district camera, 124 hidden at the whole-city one, with nothing in
       between.

       The published page does not have a switch. `streets.ts` §the two gates
       is a continuous ramp on the FEATURE's own projected width, linear over
       its own octave from `ST_SRF_PX` (1 px) to `ST_SRF_PX1` (2 px), and its
       own header says why: *"Keyed on the feature, promotion is staggered
       across the frame by the city's own widths and no frame is a different
       picture from the one before it."*

       One weight per chunk rather than per feature — a chunk is one mesh and
       one material, and splitting 22,191 rights of way by width would cost
       more draw calls than the fade is worth — so the ramp is keyed on the
       chunk's OWN median width. Wide boulevards therefore still arrive before
       alleys, chunk by chunk, which is the staggering the published rule is
       after, at a coarser grain. */
    onFrame(cam: { scale: number }) {
      for (let i = 0; i < meshes.length; i++) {
        /* two meshes a chunk — the footway and the roadway over it */
        const w = surfaceW(medians[i >> 1] ?? 22.3, cam.scale);
        const m = meshes[i];
        const mm = m.material as MeshLambertMaterial;
        m.visible = w > 0.004;
        mm.opacity = ST_ALPHA * w;
      }
    },
    /* ── §THE EXAGGERATION IS A TRANSFORM, NOT A REWRITE ──────────────────
       The ground's exaggeration moved, so every street vertex moves with it.
       This used to do that by hand: one pass over Y across 1.4 M vertices in
       248 meshes, a full re-upload of every position buffer, and a
       `computeBoundingSphere` on each — 11 ms of blocked main thread on every
       band change, for an operation that is a scale about the origin.

       A scale about the origin is what the model matrix is for. `mesh.scale.y`
       hands it to the GPU, costs one float per mesh, and the buffers never
       move — which is what `layers/rail.ts` §onStep has always done.

       AND THE LIGHT DOES NOT CARE, which is the half to check before doing
       this anywhere else. A non-uniform scale reaches the shading as the
       inverse transpose of the model matrix, so it WOULD tilt a normal with
       any x or z in it. Every normal on this layer is exactly (0, 1, 0) — see
       §FLAT UP, LIKE THE GROUND, where they are baked — and the inverse
       transpose of `diag(1, k, 1)` sends (0, 1, 0) to (0, 1/k, 0), which
       normalises back to itself. Same argument, same result, on
       `street-markings` and `street-uncovered`; `block-tint` is unlit and has
       no normals at all. `street-detail` bakes REAL normals for its kerbs and
       its stairs, so it keeps the hand-written pass. */
    onStep(_step: number, zex: number) {
      const k = zex / bakedZex;
      for (const m of meshes) m.scale.y = k;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
      }
      meshes.length = 0;
    },
  };
}
