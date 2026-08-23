/**
 * trees.ts — 195,310 street trees and the canopy.
 *
 * Block P3. Ported from `gen/part3.html` §THE WORLD THE BUILDINGS STAND IN
 * (`VTREE` / `VCAN` / `WCAN` / `vspriteSheet` / `vbuildCells` / `drawVeg`),
 * with `world/BLOCK-W.md`.
 *
 * Two published files and one ladder over them:
 *
 * - `tkzw-k3nq` Street Tree List — 198,436 rows, **195,310 shipped**, on 36 %
 *   of which a planting date is published.
 * - `ni2e-vpbg` Urban Forest canopy — 289,219 polygons, of which only the
 *   **28,616 over 625 sq ft** are used: 25 ft x 25 ft, one San Francisco lot
 *   frontage squared, Block C's gate re-used rather than re-derived. Those
 *   9.9 % of the file carry **87.8 %** of the city's canopy; the median
 *   polygon in the file is 22 sq ft, two square metres of leaf.
 *
 * **The canopy file reproduces its own headline**, which is the check that it
 * was read correctly: 4,148.0 acres over San Francisco's ~30,000 acres of land
 * is 13.8 % against the study's published 13.7 %.
 */

import type { Chunk } from "./data";
import { type Frame, sx, sy, TerrainField } from "./terrain";

// ── the ladder ──────────────────────────────────────────────────────────────

/**
 * At `cam.base` the horizontal scale is **0.068 px per metre**, so a six-metre
 * crown at whole city is **0.4 px**. 195,310 draw calls for 0.4 px each is the
 * definition of the wrong answer. At z 36 = 2.454 CSS px per metre the same
 * crown is **14.7 px** and is a thing with a shape. The ladder has to cover
 * both.
 *
 * ```
 *   z < 1.55        the ground is TINTED by the measured canopy fraction over
 *                   the DEM's own 53.8 m cell. ZERO draw calls — it is an
 *                   argument to terrainColor, which already ran once per cell.
 *   1.55 -> 2.90    canopy blobs dissolve in
 *   2.90 -> 6.00    street trees dissolve in
 * ```
 *
 * Measured through the ladder (`VEG_DRAWN`, `VEG_CAN`):
 *
 * ```
 *   z 1.0   trees 0       blobs 0
 *   z 2.9   trees 0       blobs 17,851
 *   z 7.2   trees 18,696  blobs 2,095
 *   z 20    trees 2,451   blobs 73
 * ```
 */
export const VZ_C0 = 1.55;
export const VZ_C1 = 2.9;
export const VZ_T0 = 2.9;
export const VZ_T1 = 6.0;

/**
 * THE DISSOLVE IS BLOCK L'S RULE, NOT AN ALPHA: `vrnd(i) >= w` and skip.
 *
 * Same objects from raster to raster so nothing flickers, and the cost is
 * proportional to the weight, so the transition is cheaper than the end of it.
 *
 * `vrnd` is **computed from the index rather than shipped** — 195,310 bytes of
 * noise is not worth the wire — and it is the same xorshift seeded at
 * 19060418 the building stream uses, so the two dissolves are the same
 * machinery and neither is a shuffle.
 */
export function vrnd(i: number): number {
  let s = (19060418 ^ (i * 2654435761)) >>> 0;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  return s / 4294967296;
}

/** `S(t) = t^2(3-2t)` on the band, so no frame is a different picture. */
export function bandW(z: number, z0: number, z1: number): number {
  if (z <= z0) return 0;
  if (z >= z1) return 1;
  const t = (z - z0) / (z1 - z0);
  return t * t * (3 - 2 * t);
}

// ── the crown ───────────────────────────────────────────────────────────────

/**
 * A crown of radius R metres sits 2R metres up, and at this projection a metre
 * of height is `ZEXB = 1.6` against a metre of width `1.2247`, so **the centre
 * is 2.613 crown-radii up the screen** — a constant, baked in, so placing a
 * tree is one multiply.
 */
export const CROWN_LIFT = (2 * 1.6) / 1.2247;

/**
 * A cell whose canopy fills it draws a blob that circumscribes the cell, so a
 * solid forest is solid and a fringe is a fringe: radius is
 * `sqrt(area/pi) * 1.128`, and **1.128 is `2/sqrt(pi)`**.
 */
export const BLOB_K = 2 / Math.sqrt(Math.PI);

export function blobRadius(areaM2: number): number {
  return Math.sqrt(areaM2 / Math.PI) * BLOB_K;
}

/**
 * A cell holding under **58.06 m2** is dropped from the blob layer, because
 * the *tint* already carries it and a blob would be one small crown's worth of
 * paint. 58.06 m2 is 25 ft squared — the same gate, again.
 */
export const BLOB_MIN_M2 = 58.06;

/**
 * **A cell holding a street tree is dropped**, because the tree drawn there
 * *is* the tree that is there. 21,124 cells, 923 acres.
 */
export const DROP_CELL_WITH_TREE = true;

/**
 * THE RASTER'S OWN BIAS WAS MEASURED, NOT ASSUMED.
 *
 * Filling polygons on a grid over-reads by half a pixel at every ring
 * boundary, and this file has 60,576 rings: the raster totals 4,955 acres at
 * 3 m, 4,298 at 1.5 m, 4,079 at 1 m against the file's own 3,642. The excess
 * scales **linearly** with the subpixel — 36 %, 18 %, 12 % — which is what
 * says it is a boundary effect and not a shape error, so one global factor
 * corrects it and is recorded in the build.
 */
export const RASTER_BIAS_1M = 0.8928;

// ── the published grid, and the defect in it ────────────────────────────────

/**
 * THE TREE GRID IS FOLDED, AND IT WAS ALREADY FOLDED.
 *
 * `world/build_world.py` buckets trees as `B[gj * GW + gi]` with `GW = 400`
 * columns of 24 m — 9,600 m. From that grid's own origin the city is 14,272 m
 * wide, so **595 columns are needed**. `gi` reaches 594, the key aliases, and
 * a tree at column 450 is written to `(gj + 1, column 50)`.
 *
 * This is not an inference. **Column 0 is x = -7,200, open Pacific about 800 m
 * west of Ocean Beach, and it holds 192 tree cells.** There are no street
 * trees in the ocean. `gi` also saturates at exactly 399 in both the tree and
 * the canopy array, and the cells-per-column histogram is flat at ~180 across
 * all 400 columns with no taper at either edge, which a real city does not do.
 * **No tree is drawn east of x = 2,376 m**, roughly Van Ness, and the western
 * half of the city carries the eastern half's trees on top of its own.
 *
 * The true column is **not recoverable** from the shipped file — the modulo
 * destroyed it. So the trees are carried through byte-faithfully and placed
 * where the mock's own draw code places them, so the render is unchanged and
 * the defect is not made *worse* here. `manifest.sources.tree.defect` and
 * `.canopy.defect` say all of this, so nothing downstream can present these
 * positions as fact.
 *
 * **The fix is one constant in `world/build_world.py` and a regenerated
 * `world-data.js`; it belongs there, not here, because inventing a position
 * here would be inventing data.**
 */
export const TREE_GRID_W = 400;
export const TREE_CELL_M = 24;
/** the vegetation grid's own origin, in world metres */
export const TREE_X0 = -7200;
export const TREE_Y0 = -6600;

export function cellOf(key: number): { gi: number; gj: number } {
  return { gi: key % TREE_GRID_W, gj: (key / TREE_GRID_W) | 0 };
}

/**
 * Positions are quantised to **1.5 m** — one byte per tree, a 16x16 lattice in
 * a 24 m cell — and that is coarser than the 1 m the footprints carry *on
 * purpose*: a tree crown is drawn 6.6 or 10.0 m across and does not align to a
 * lot line, so 1.5 m is 3.7 px of slack on a 36 px crown at the ceiling, where
 * a building edge at the same slack would be visible against its neighbour.
 */
export const TREE_Q = 1.5;

export function treeWorld(
  key: number,
  pos: number,
): { x: number; y: number } {
  const { gi, gj } = cellOf(key);
  const ox = pos & 15,
    oy = (pos >> 4) & 15;
  return {
    x: TREE_X0 + gi * TREE_CELL_M + ox * TREE_Q,
    y: TREE_Y0 + gj * TREE_CELL_M + oy * TREE_Q,
  };
}

// ── the year ────────────────────────────────────────────────────────────────

/**
 * THE DATE FIELD WAS CHECKED BEFORE IT WAS USED.
 *
 * This project has been burned twice by a date field stamped to one bulk-load
 * day, so `plantdate` was checked: 70,076 of 195,310 trees carry a date over
 * 61 distinct years, 1955-2026, peaking 1998 (4,445) and 2008 (4,390), with
 * 1955-1989 only 16 % of them. **That is a real planting curve, not a stamp.**
 *
 * It is also a **short** curve: the earliest planting date in the whole file is
 * **1955**, so the record has nothing whatever to say about a tree standing in
 * 1919. A tree WITHOUT a date is drawn in every year, and **counted**, so the
 * page can say so. On the 1919 frame that is 11,797 trees, every one of them
 * undated, and zero dated ones.
 *
 * Two date fields that WERE dead ends, recorded so nobody re-checks them:
 * `gtr9-ntp6`'s `created_date` / `data_as_of` are a single 2025-12-18 GIS
 * load, so Recreation and Parks properties cannot be dated.
 */
export const TREE_YEAR0 = 1955;

export interface VegFlags {
  /** draw the trees whose planting date is not published */
  undated: boolean;
  /** the ground tint from the measured canopy fraction */
  tint: boolean;
  /** the canopy blobs */
  blobs: boolean;
  /** the street trees */
  trees: boolean;
}

export const WFLG: VegFlags = { undated: true, tint: true, blobs: true, trees: true };

// ── the sprite sheet ────────────────────────────────────────────────────────

/**
 * TEN SPRITES: four published form classes x the one published size bit, plus
 * two canopy masses.
 *
 * `tkzw-k3nq` publishes three crown families — palm, conifer, broadleaf — with
 * their own greens, their own silhouettes and their own ground shadow, plus
 * unclassed. Nothing here invents a species.
 *
 * REJECTED, and why it matters: **sub-cell placement inside a canopy cell** —
 * N lobes on a lattice scaled to the cell. It would have looked better at z 36
 * and **every one of those positions would have been invented.**
 */
export const VSPR_R = 26;
export const VSPR_W = VSPR_R * 4;
export const VSPR_H = VSPR_R * 5.4;
/** where the ground point sits in the sprite */
export const VSPR_AY = VSPR_R * 4.2;

export const TREE_GREENS: readonly string[] = [
  "#5f7a45", // broadleaf
  "#4a6b46", // conifer
  "#6f8a4e", // palm
  "#66804a", // unclassed
];

/** crown diameter in metres, by the one published size bit */
export const CROWN_M: readonly [number, number] = [6.6, 10.0];

export interface SpriteSheet {
  readonly canvas: CanvasImageSource;
  readonly w: number;
  readonly h: number;
  readonly ay: number;
  readonly n: number;
}

/**
 * Draw the sheet once, at a size that is a multiple of the largest crown any
 * camera reaches, and blit it. The sheet is a function of the palette and of
 * nothing the camera does, so a pan does not rebuild it.
 */
export function buildSpriteSheet(
  makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): SpriteSheet | null {
  const n = TREE_GREENS.length * 2 + 2;
  const c = makeCanvas(Math.ceil(VSPR_W * n), Math.ceil(VSPR_H));
  const g = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;
  for (let k = 0; k < n; k++) {
    const fam = Math.min(TREE_GREENS.length - 1, k >> 1);
    const big = (k & 1) === 1;
    const isCanopy = k >= TREE_GREENS.length * 2;
    const cx = k * VSPR_W + VSPR_W / 2;
    const r = VSPR_R * (big ? 1 : 0.66);
    const cy = VSPR_AY - r * CROWN_LIFT;
    // the ground shadow first, so a crown lands on it
    g.globalAlpha = 0.16;
    g.fillStyle = "#3a3524";
    g.beginPath();
    g.ellipse(cx, VSPR_AY, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = isCanopy ? "#5b7742" : TREE_GREENS[fam];
    g.beginPath();
    if (fam === 2 && !isCanopy) {
      // a palm: a trunk and a splayed crown, not a ball
      g.moveTo(cx - r * 0.09, VSPR_AY);
      g.lineTo(cx + r * 0.09, VSPR_AY);
      g.lineTo(cx + r * 0.05, cy);
      g.lineTo(cx - r * 0.05, cy);
      g.closePath();
      g.fill();
      g.beginPath();
      for (let a = 0; a < 7; a++) {
        const th = Math.PI + (a / 6) * Math.PI;
        g.moveTo(cx, cy);
        g.quadraticCurveTo(
          cx + Math.cos(th) * r * 0.7,
          cy + Math.sin(th) * r * 0.5,
          cx + Math.cos(th) * r,
          cy + Math.sin(th) * r * 0.8 + r * 0.25,
        );
      }
      g.lineWidth = Math.max(1, r * 0.16);
      g.strokeStyle = TREE_GREENS[fam];
      g.stroke();
      continue;
    }
    if (fam === 1 && !isCanopy) {
      // a conifer: a cone
      g.moveTo(cx, cy - r * 1.25);
      g.lineTo(cx + r * 0.85, cy + r * 0.9);
      g.lineTo(cx - r * 0.85, cy + r * 0.9);
      g.closePath();
    } else {
      g.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
    }
    g.fill();
  }
  return { canvas: c, w: VSPR_W, h: VSPR_H, ay: VSPR_AY, n };
}

// ── the draw ────────────────────────────────────────────────────────────────

export interface TreeCell {
  readonly cellKey: Uint32Array;
  readonly cellCnt: Uint16Array;
  readonly pos: Uint8Array;
  readonly form: Uint8Array;
  readonly big: Uint8Array;
  /** years from `TREE_YEAR0`; 0 = the date is not published */
  readonly yr: Uint8Array;
}

export interface CanopyCells {
  readonly cellKey: Uint32Array;
  readonly pos: Uint8Array;
  /** canopy area in the cell, one byte over the cell's own area */
  readonly area: Uint8Array;
}

export interface VegResult {
  readonly trees: number;
  readonly blobs: number;
  /** trees drawn whose planting date is not published — the page says so */
  readonly undated: number;
}

/**
 * WHERE THEY ARE DRAWN MATTERS AS MUCH AS HOW MANY.
 *
 * The tint, the park rings and the lakes live in the TERRAIN layer, whose key
 * is `cam.step|cx|cy` — no year, no tier — so they are paid once per
 * rasterisation and **never on a blit**. The trees and blobs live in the CITY
 * layer, whose key already carries the year and the tier, because a tree has a
 * year and a blob has a zoom.
 */
export function drawVeg(
  f: Frame,
  t: TerrainField,
  sheet: SpriteSheet | null,
  trees: readonly TreeCell[],
  canopy: readonly CanopyCells[],
  z: number,
): VegResult {
  const { ctx, cam, W, H } = f;
  let nT = 0,
    nB = 0,
    nU = 0;
  const wCan = WFLG.blobs ? bandW(z, VZ_C0, VZ_C1) : 0;
  const wTree = WFLG.trees ? bandW(z, VZ_T0, VZ_T1) : 0;
  const year = f.year;

  if (wCan > 0.002) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#5b7742";
    const p = new Path2D();
    let idx = 0;
    for (const c of canopy) {
      for (let i = 0; i < c.cellKey.length; i++, idx++) {
        if (vrnd(idx) >= wCan) continue;
        const areaM2 = (c.area[i] / 255) * TREE_CELL_M * TREE_CELL_M;
        if (areaM2 < BLOB_MIN_M2) continue;
        const w = treeWorld(c.cellKey[i], c.pos[i]);
        const r = blobRadius(areaM2);
        const pr = f.proj.proj(w.x, w.y, t.elevM(w.x, w.y));
        const X = sx(f, pr),
          Y = sy(f, pr) - r * CROWN_LIFT * cam.scale;
        const rx = r * 1.2247 * cam.scale;
        if (X + rx < -8 || X - rx > W + 8 || Y + rx < -8 || Y - rx > H + 8)
          continue;
        p.moveTo(X + rx, Y);
        p.ellipse(X, Y, rx, rx * 0.82, 0, 0, Math.PI * 2);
        nB++;
      }
    }
    ctx.fill(p);
    ctx.restore();
  }

  if (wTree > 0.002 && sheet) {
    ctx.save();
    let idx = 0;
    for (const c of trees) {
      let vo = 0;
      for (let k = 0; k < c.cellKey.length; k++) {
        const cnt = c.cellCnt[k];
        const base = vo;
        vo += cnt;
        for (let i = 0; i < cnt; i++, idx++) {
          const j = base + i;
          if (vrnd(idx) >= wTree) continue;
          const yy = c.yr[j];
          if (yy === 0) {
            if (!WFLG.undated) continue;
          } else if (year !== undefined && year < TREE_YEAR0 + yy) continue;
          const w = treeWorld(c.cellKey[k], c.pos[j]);
          const dM = CROWN_M[c.big[j] ? 1 : 0];
          const pr = f.proj.proj(w.x, w.y, t.elevM(w.x, w.y));
          const X = sx(f, pr),
            Y = sy(f, pr);
          const wpx = ((dM * 1.2247 * cam.scale) / (2 * VSPR_R)) * VSPR_W;
          if (wpx < 1.2) continue;
          const hpx = (wpx / VSPR_W) * VSPR_H;
          const ay = (wpx / VSPR_W) * VSPR_AY;
          if (X + wpx < -8 || X - wpx > W + 8 || Y < -8 || Y - hpx > H + 8)
            continue;
          const si = Math.min(sheet.n - 1, (c.form[j] & 3) * 2 + (c.big[j] ? 1 : 0));
          ctx.drawImage(
            sheet.canvas,
            si * VSPR_W,
            0,
            VSPR_W,
            VSPR_H,
            X - wpx / 2,
            Y - ay,
            wpx,
            hpx,
          );
          nT++;
          if (yy === 0) nU++;
        }
      }
    }
    ctx.restore();
  }
  return { trees: nT, blobs: nB, undated: nU };
}

// ── the parks ───────────────────────────────────────────────────────────────

/**
 * THE PARK MASK IS THE PUBLISHED RINGS, NOT FIVE HAND-TYPED QUADS.
 *
 * `gen_city.py` L131 was headed *"MODELLED: parks / open space, hand-entered
 * from well-known extents"* and shipped **five** of them. **Golden Gate Park
 * was a four-vertex quad.**
 *
 * What is here now is **247 published Recreation and Parks rings, 328
 * polygons, 3,214 vertices after RDP at 6 m, 3,504.2 acres.** They are drawn
 * twice on purpose: they build the DEM cell mask (per-ring over that ring's own
 * bounding box — 14 million point-in-polygon tests becomes 0.2 million), and
 * the ring itself is washed over the cells at 0.46, which gives the park its
 * own published edge. **The 53.8 m staircase that WAS the shape of Golden Gate
 * Park is gone.**
 *
 * Three properties are dropped by their own coordinates: **Sharp Park**
 * (Pacifica) and **Camp Mather** (Yosemite) are real properties of this
 * department outside the drawn city.
 *
 * **The Presidio is not a Recreation and Parks property. It is federal.** It
 * had a hand-typed quad and now has none. It is green on this map because the
 * canopy layer *measures* its forest, which is what it actually is. That is a
 * strictly better claim than the rectangle it replaces, and it is worth
 * stating plainly rather than quietly restoring the quad.
 */
export const PARK_WASH = 0.46;
export const WPKW = "#93ad6a";
/** an inland lake or reservoir */
export const WLAKE = "#7f9fbe";

export type ParkRing = readonly (readonly [number, number])[];

export function decodeParks(chunk: Chunk): {
  parks: ParkRing[];
  cls: Uint8Array;
  water: ParkRing[];
} {
  const read = (lenName: string, xyName: string): ParkRing[] => {
    const len = chunk.fields[lenName];
    const xy = chunk.fields[xyName];
    if (!len || !xy) return [];
    const out: ParkRing[] = [];
    let o = 0;
    for (let r = 0; r < len.length; r++) {
      const n = len[r];
      const ring: [number, number][] = new Array(n);
      // decimetres, i32 x 10 — the published quantum, 0.05 m worst error
      for (let k = 0; k < n; k++)
        ring[k] = [xy[o + k * 2] / 10, xy[o + k * 2 + 1] / 10];
      out.push(ring);
      o += n * 2;
    }
    return out;
  };
  const cls = chunk.fields.cls;
  return {
    parks: read("len", "xy"),
    cls: cls instanceof Uint8Array ? cls : new Uint8Array(0),
    water: read("waterLen", "waterXY"),
  };
}

/**
 * The published ring, washed over the ground the tint has already coloured.
 *
 * Each water body is drawn at ONE elevation for the whole body, because a lake
 * is level and reading the DEM per vertex tilts it down the hillside it sits
 * on. **Sunset Reservoir was a blank tan rectangle in the middle of the Sunset
 * frame** before this existed; it is now a published reservoir drawn as one,
 * and whether a reservoir should read like a lake is still a call.
 */
export function drawParkRings(
  f: Frame,
  t: TerrainField,
  parks: readonly ParkRing[],
): number {
  const { ctx } = f;
  if (!parks.length) return 0;
  ctx.save();
  ctx.globalAlpha = PARK_WASH;
  ctx.fillStyle = WPKW;
  const p = new Path2D();
  for (const ring of parks) {
    for (let i = 0; i < ring.length; i++) {
      const pr = f.proj.proj(ring[i][0], ring[i][1], t.elevM(ring[i][0], ring[i][1]));
      if (i) p.lineTo(sx(f, pr), sy(f, pr));
      else p.moveTo(sx(f, pr), sy(f, pr));
    }
    p.closePath();
  }
  ctx.fill(p, "evenodd");
  ctx.restore();
  return parks.length;
}

export function drawWaterBodies(
  f: Frame,
  t: TerrainField,
  bodies: readonly ParkRing[],
): number {
  const { ctx } = f;
  if (!bodies.length) return 0;
  ctx.save();
  ctx.fillStyle = WLAKE;
  for (const ring of bodies) {
    if (!ring.length) continue;
    // one elevation for the whole body
    let z = 0;
    for (const v of ring) z += t.elevM(v[0], v[1]);
    z /= ring.length;
    const p = new Path2D();
    for (let i = 0; i < ring.length; i++) {
      const pr = f.proj.proj(ring[i][0], ring[i][1], z);
      if (i) p.lineTo(sx(f, pr), sy(f, pr));
      else p.moveTo(sx(f, pr), sy(f, pr));
    }
    p.closePath();
    ctx.fill(p);
  }
  ctx.restore();
  return bodies.length;
}
