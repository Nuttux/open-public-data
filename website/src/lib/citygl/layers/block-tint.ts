/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/block-tint.ts — THE GROUND HAS A GRID.

   The published page states this one outright, and the port never had it:

     *"Between the buildings the ground was the page: a block's interior and
      the street outside it were the same cream, and the only thing that said
      'block' was the buildings standing on it. The bird's-eye lithographs
      this register follows tint the block and leave the street the colour of
      the paper, and that one value step is most of why they read as DRAWN."*
     — `scene.ts` §THE GROUND HAS A GRID

   It is one fill: the published assessor block rings, inset by their own
   1.5 m, in a warm brown at 16 %, under the parks and the streets, at every
   camera.

   ── WHAT IT FIXES, MEASURED ──────────────────────────────────────────────
   Without it the two complaints a reader makes are the same complaint. The
   ground reads sandy, and the streets stop reading at all — because a street
   and the block beside it are the same tone and nothing separates them.
   Sampled at the same three points on both pages, over the Mission:

                       published                 the port
     open yard         152.3 151.0 128.8         158.9 154.9 129.7
     wide street       158.9 155.6 143.3         169.4 166.7 149.6
     block interior    117.1 118.9 107.3         126.2 128.8 107.8
     saturation        0.097 - 0.154             0.117 - 0.184

   The port sat 6 to 10 points brighter at every one and half again as
   saturated — not a different ground colour, since both renderers compute it
   from the same `terrainRGB` with the same inputs, but a MISSING TINT over
   two thirds of it. The block interior is where the gap is widest, which is
   exactly where this layer paints.

   ── AND IT FOLLOWS THE GROUND, WHICH THE ORIGINAL CANNOT ─────────────────
   `paintGround` lifts a whole block to the elevation of its own CENTROID —
   the right answer for a 2D path, which has one z to give. A mesh can put
   every vertex on the terrain under it, and on a San Francisco block that is
   the difference between a tint that lies on the hill and one that hovers
   over the downhill end of it. Stated as a departure rather than left to be
   discovered.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";

import type { CityData } from "@/lib/city/data";
import type { CityLayer } from "../engine";

/** `paintGround`'s own fill: `rgba(118, 92, 54, 0.16)` */
const TINT = "#765c36";
const TINT_ALPHA = 0.16;

/** `BLOCK_INSET_M` — the published page insets every ring by its own 1.5 m,
 *  so a hair of paper stays between the tint and the kerb. */
const INSET_M = 1.5;

/* the same limit `layers/streets.ts` splits at, and for the same reason: an
   ear clipper will lay one triangle across a whole block, and a block IS the
   size of a block. On a slope that one flat plane hangs over the downhill
   end. 22 m is the published median right-of-way width. */
const MAX_EDGE_M = 22;
/* ── AND FIVE LEVELS WAS NOT ENOUGH FOR A BIG BLOCK ─────────────────────
   Each level halves one triangle, so depth 5 is at most 32 pieces from one
   ear. A downtown block is 100 m and never needs them; a Presidio or Golden
   Gate Park parcel is over a kilometre across, and 32 pieces of that is still
   200 m a side — a flat plane stretched over a hill, which is exactly the
   large angular facets Daniel reported over the Palace of Fine Arts. Measured
   by another agent isolating the layer: 202,140 indices citywide, 67,380
   triangles over 5,404 blocks, 12.5 a block. That is a city of quadrilaterals
   pretending to be ground.

   Nine levels is up to 512 pieces, which takes the same kilometre parcel to
   under 30 m. The subdivision stops at `MAX_EDGE_M` on its own, so a small
   block costs exactly what it did before — only the big ones spend more. */
const MAX_SPLIT_DEPTH = 9;

/**
 * The published block rings.
 *
 * ── THE QUANTISER IS A POWER-OF-TWO EXPONENT, AND IT IS A TRAP ───────────
 * `sc` is an EXPONENT and the deltas are tenths of that unit, so a vertex is
 * `ox + vx · 2^sc / 10`. Read as `1 / (1 << sc)` the rings come out hundreds
 * of times too large. `overlay.ts`, `scene.ts` and `pick.ts` have each paid
 * for this once; this is the fourth time it is written down.
 */
function decodeRings(
  chunk: { fields: Record<string, unknown> },
): { n: number; off: Uint32Array; rx: Float32Array; ry: Float32Array } | null {
  const f = chunk.fields;
  const cnt = f.cnt as Uint16Array | undefined;
  const sc = f.sc as Uint8Array | undefined;
  const ox = f.ox as Float32Array | undefined;
  const oy = f.oy as Float32Array | undefined;
  const dvx = f.vx as Int16Array | undefined;
  const dvy = f.vy as Int16Array | undefined;
  if (!cnt || !sc || !ox || !oy || !dvx || !dvy) return null;

  const n = cnt.length;
  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const rx = new Float32Array(off[n]);
  const ry = new Float32Array(off[n]);
  for (let i = 0; i < n; i++) {
    const o = off[i];
    const m = cnt[i];
    const q = (1 << sc[i]) / 10;
    for (let k = 0; k < m; k++) {
      rx[o + k] = ox[i] + dvx[o + k] * q;
      ry[o + k] = oy[i] + dvy[o + k] * q;
    }
  }
  return { n, off, rx, ry };
}

/**
 * One ring, pulled `INSET_M` toward its own inside.
 *
 * The published `blockRing` reads a per-vertex inward normal and a per-vertex
 * `maxInset` the encoder shipped alongside the geometry; those columns are not
 * in this export, so the inset is taken from the ring itself — each vertex
 * moves along the bisector of its two edges, in the direction the ring's own
 * winding says is inside. The DIFFERENCE from the published version is that a
 * very thin block can be over-inset; the guard is the published one's in
 * spirit — no vertex moves more than a quarter of its shorter edge.
 */
function insetRing(
  rx: Float32Array,
  ry: Float32Array,
  o: number,
  m: number,
): [number, number][] | null {
  if (m < 3) return null;
  let area = 0;
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    area += rx[o + k] * ry[o + k1] - rx[o + k1] * ry[o + k];
  }
  if (!Number.isFinite(area) || area === 0) return null;
  /* a positive shoelace is counter-clockwise, and the inward normal of an
     edge is its left-hand normal; clockwise flips the sign */
  const wind = area > 0 ? 1 : -1;

  const out: [number, number][] = new Array(m);
  for (let k = 0; k < m; k++) {
    const kp = (k + m - 1) % m;
    const kn = (k + 1) % m;
    const e0x = rx[o + k] - rx[o + kp];
    const e0y = ry[o + k] - ry[o + kp];
    const e1x = rx[o + kn] - rx[o + k];
    const e1y = ry[o + kn] - ry[o + k];
    const l0 = Math.hypot(e0x, e0y) || 1;
    const l1 = Math.hypot(e1x, e1y) || 1;
    /* the left normal of each edge, averaged — the bisector */
    let nx = (-e0y / l0 - e1y / l1) * wind;
    let ny = (e0x / l0 + e1x / l1) * wind;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) {
      out[k] = [rx[o + k], ry[o + k]];
      continue;
    }
    nx /= nl;
    ny /= nl;
    const cap = Math.min(INSET_M, Math.min(l0, l1) * 0.25);
    out[k] = [rx[o + k] + nx * cap, ry[o + k] + ny * cap];
  }
  return out;
}

export interface BlockTintOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — a tint is ground, not a built thing */
  zex: number;
}

export function blockTintLayer(
  data: CityData,
  o: BlockTintOptions,
): (CityLayer & { mesh: Mesh; blocks: number }) | null {
  const chunk = data.get("base/blocks");
  if (!chunk) return null;
  const bl = decodeRings(chunk as unknown as { fields: Record<string, unknown> });
  if (!bl || !bl.n) return null;

  const pos: number[] = [];
  const idx: number[] = [];

  const put = (wx: number, wy: number): number => {
    const i = pos.length / 3;
    pos.push(wx, o.elevAt(wx, wy) * o.zex, wy);
    return i;
  };
  const px = (i: number): number => pos[i * 3];
  const pz = (i: number): number => pos[i * 3 + 2];

  const split = (a: number, b: number, c: number, depth: number): void => {
    if (depth < MAX_SPLIT_DEPTH) {
      const ab = Math.hypot(px(b) - px(a), pz(b) - pz(a));
      const bc = Math.hypot(px(c) - px(b), pz(c) - pz(b));
      const ca = Math.hypot(px(a) - px(c), pz(a) - pz(c));
      const longest = Math.max(ab, bc, ca);
      if (longest > MAX_EDGE_M) {
        if (longest === ab) {
          const mm = put((px(a) + px(b)) / 2, (pz(a) + pz(b)) / 2);
          split(a, mm, c, depth + 1);
          split(mm, b, c, depth + 1);
        } else if (longest === bc) {
          const mm = put((px(b) + px(c)) / 2, (pz(b) + pz(c)) / 2);
          split(a, b, mm, depth + 1);
          split(a, mm, c, depth + 1);
        } else {
          const mm = put((px(c) + px(a)) / 2, (pz(c) + pz(a)) / 2);
          split(a, b, mm, depth + 1);
          split(mm, b, c, depth + 1);
        }
        return;
      }
    }
    idx.push(a, b, c);
  };

  let blocks = 0;
  for (let b = 0; b < bl.n; b++) {
    const start = bl.off[b];
    const m = bl.off[b + 1] - start;
    const ring = insetRing(bl.rx, bl.ry, start, m);
    if (!ring) continue;
    const contour: Vector2[] = ring.map((p) => new Vector2(p[0], p[1]));
    const faces = ShapeUtils.triangulateShape(contour, []);
    if (!faces.length) continue;
    const base = pos.length / 3;
    for (const p of ring) put(p[0], p[1]);
    for (const t of faces) split(base + t[0], base + t[1], base + t[2], 0);
    blocks++;
  }
  if (!idx.length) return null;

  const g = new BufferGeometry();
  const posArr = new Float32Array(pos);
  g.setAttribute("position", new BufferAttribute(posArr, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();

  const c = new Color();
  c.setStyle(TINT, SRGBColorSpace);
  /* ── UNLIT, BECAUSE IT IS A WASH AND NOT A SURFACE ──────────────────────
     The published fill is a flat translucent colour laid over ground that is
     already lit — a wash on a drawing, not a plane catching the sun. Giving
     it a Lambert material would light it a second time and put a hillshade
     inside a tint whose whole job is to be even. */
  const mat = new MeshBasicMaterial({
    color: c,
    side: DoubleSide,
    transparent: true,
    opacity: TINT_ALPHA,
    depthWrite: false,
    /* ── TOWARD THE CAMERA, NOT AWAY FROM IT ────────────────────────────
       A POSITIVE `polygonOffsetFactor` pushes a polygon AWAY in depth. This
       tint is coplanar with the ground it washes, so a positive offset put it
       BEHIND the terrain and the depth test threw every fragment away: the
       layer was in the scene, one mesh at renderOrder 0.5, drawing nothing,
       and the frame's mean moved by less than half a point when it should
       have moved by nine. An overlay on a coplanar surface wants to come
       FORWARD, which is a negative offset. */
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: -1,
  });
  const mesh = new Mesh(g, mat);
  /* under the streets (1 and 2) and over the ground — `paintGround` is drawn
     *"under the parks and the streets"* and this is that sentence as an
     ordering */
  mesh.renderOrder = 0.5;

  return {
    name: "block-tint",
    mesh,
    blocks,
    onStep(_step: number, zex: number) {
      if (zex === o.zex) return;
      const k = zex / o.zex;
      for (let v = 0; v < posArr.length; v += 3) posArr[v + 1] *= k;
      (g.getAttribute("position") as BufferAttribute).needsUpdate = true;
      g.computeBoundingSphere();
      o.zex = zex;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
