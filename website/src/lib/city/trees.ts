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
import {
  type Frame,
  lerpHex,
  sx,
  sy,
  TerrainField,
  WCN1,
  WG1,
  WPK1,
} from "./terrain";

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
 * THE TREE GRID WAS FOLDED, IT IS NOT FOLDED ANY MORE, AND THIS FILE STILL
 * CARRIED THE FOLD.
 *
 * `world/build_world.py` bucketed trees as `B[gj * GW + gi]` with `GW = 400`
 * columns of 24 m — 9,600 m — while from that grid's own origin the city is
 * 14,272 m wide and needs **595 columns**. `gi` reached 594, the key aliased,
 * and a tree at column 450 was written to `(gj + 1, column 50)`: 9,600 m west
 * and 24 m north of where it stands. **It was fixed at source on 2026-08-23**
 * (`GW = 600`, `encode_city_chunks.py TREE_FOLD`) and the export has shipped
 * `gw: 600` on every `tree` and `canopy` chunk entry since.
 *
 * **This module went on decoding it at 400 for a day**, which is worse than
 * the original defect: the fold at least put every tree somewhere consistent,
 * and `k % 400` over keys built for a 600-wide grid puts them nowhere at all.
 * Measured on `tree/10_10.qc`, whose declared extent is
 * `[2048, 2048, 3072, 3072]`:
 *
 * ```
 *   gw = 400   x -7,200 .. 2,376    y  6,360 .. 7,896   (the open Pacific,
 *                                                        and 4 km north of
 *                                                        the chunk it is in)
 *   gw = 600   x  2,040 .. 3,048    y  2,040 .. 3,048   (inside its own box)
 * ```
 *
 * Every one of the 129 tree chunks and the one canopy chunk agrees. That is
 * the check: **the grid width is right when, and only when, a chunk's own
 * cells land inside the extent the encoder computed for it**, and the encoder
 * computed that extent from the cell centres with the same arithmetic.
 *
 * So the width is no longer a constant here at all — it is **read off the
 * chunk entry the encoder wrote**, and `assertTreeGrid` refuses a set of
 * entries that do not agree. A constant in this file and a constant in the
 * encoder are two places to write one number down, and this is what that costs.
 */
export interface TreeGrid {
  /** columns in the source's own key: `cellKey = row * gw + col` */
  readonly gw: number;
  /** the cell's side, world metres */
  readonly cell: number;
  /** the vegetation grid's own origin, world metres */
  readonly x0: number;
  readonly y0: number;
  /** the sub-cell lattice: `pos` is two nibbles over a `q` x `q` grid */
  readonly q: number;
}

/** What the export ships today. Read the manifest; this is the fallback and
 *  the fixture, not the authority. */
export const TREE_GRID: TreeGrid = { gw: 600, cell: 24, x0: -7200, y0: -6600, q: 16 };

/**
 * The grid every `tree` and `canopy` chunk entry agrees on, or a throw.
 *
 * `decodeChunk` already refuses a chunk that is the wrong bytes; this refuses
 * a catalogue that is the wrong *shape*. Both exist for the same reason —
 * this map has twice been wrong in a way that decoded, typechecked and drew.
 */
export function assertTreeGrid(
  entries: readonly Readonly<Record<string, unknown>>[],
): TreeGrid {
  let g: TreeGrid | null = null;
  for (const e of entries) {
    const num = (k: string): number | null =>
      typeof e[k] === "number" ? (e[k] as number) : null;
    const gw = num("gw"), cell = num("cell"), x0 = num("x0"), y0 = num("y0"), q = num("q");
    if (gw === null || cell === null || x0 === null || y0 === null || q === null) continue;
    const here: TreeGrid = { gw, cell, x0, y0, q };
    if (!g) g = here;
    else if (
      g.gw !== gw || g.cell !== cell || g.x0 !== x0 || g.y0 !== y0 || g.q !== q
    ) {
      throw new Error(
        `vegetation grid disagrees: ${JSON.stringify(g)} vs ${JSON.stringify(here)}`,
      );
    }
  }
  return g ?? TREE_GRID;
}

export function cellOf(key: number, g: TreeGrid = TREE_GRID): { gi: number; gj: number } {
  return { gi: key % g.gw, gj: (key / g.gw) | 0 };
}

/**
 * Positions are quantised to **`cell / q` = 1.5 m** — one byte per tree, a
 * 16 x 16 lattice in a 24 m cell — and that is coarser than the 1 m the
 * footprints carry *on purpose*: a tree crown is drawn 6.6 or 10.0 m across
 * and does not align to a lot line, so 1.5 m is 3.7 px of slack on a 36 px
 * crown at the ceiling, where a building edge at the same slack would be
 * visible against its neighbour.
 *
 * **The lattice site is its CENTRE and not its corner** — `(n + 0.5)·cell/q`,
 * which is what `part3.html` `drawVeg` does with the same byte. Reading the
 * corner shifts every tree and every blob in the city 0.75 m north-west of
 * where the mock draws it, which is 1.8 px at the detail ceiling.
 */
export function treeQ(g: TreeGrid = TREE_GRID): number {
  return g.cell / g.q;
}

/** @deprecated the published quantum, kept for the fixtures: `cell / q`. */
export const TREE_Q = TREE_GRID.cell / TREE_GRID.q;

export function treeWorld(
  key: number,
  pos: number,
  g: TreeGrid = TREE_GRID,
): { x: number; y: number } {
  const gi = key % g.gw,
    gj = (key / g.gw) | 0;
  const step = g.cell / g.q;
  const ox = (pos % g.q) + 0.5,
    oy = ((pos / g.q) | 0) + 0.5;
  return {
    x: g.x0 + gi * g.cell + ox * step,
    y: g.y0 + gj * g.cell + oy * step,
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
 *
 * **AND 1955 IS NOT THE ENCODING BASE.** `build_world.py` writes
 * `max(1, min(255, y - 1900))`, so the byte is years since **1900** — which is
 * what makes 2026 fit in a `u8` at all, and what `part3.html`'s own gate reads
 * (`if (yr) { if (1900 + yr > iy) continue; }`). This file decoded it at 1955
 * for a day. The gate is `year !== undefined` and the film's clock is P5's, so
 * nothing on screen has been wrong yet — but the first frame of the first
 * scrub would have held every tree in the city back by 55 years, and the
 * failure is silent because a held tree looks exactly like a tree that is not
 * there.
 *
 * 1955 survives as what it actually is: the earliest date **in the file**, and
 * therefore the year before which the register has nothing to say about any
 * tree in it.
 */
export const TREE_YEAR_BASE = 1900;
export const TREE_EARLIEST = 1955;
/** @deprecated read `TREE_YEAR_BASE` to decode `yr`, `TREE_EARLIEST` for the
 *  fact about the file. This name meant both and was one of them. */
export const TREE_YEAR0 = TREE_YEAR_BASE;

export interface VegFlags {
  /** draw the trees whose planting date is not published */
  undated: boolean;
  /** the ground tint from the measured canopy fraction */
  tint: boolean;
  /** the canopy blobs */
  blobs: boolean;
  /** the street trees */
  trees: boolean;
  /** the park wash's per-class tone — off returns every ring to `WPKW` */
  parkCls: boolean;
}

export const WFLG: VegFlags = {
  undated: true,
  tint: true,
  blobs: true,
  trees: true,
  parkCls: true,
};
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityWFLG?: VegFlags }).__cityWFLG = WFLG;
}

/**
 * A MOTION RUNG FOR THE VEGETATION WAS WRITTEN, MEASURED, AND TAKEN BACK OUT.
 *
 * With `gw` decoded correctly the drawn tree count at the block preset goes
 * from 2,333 to 31,066, and the first frame-interval measurement of an
 * 18-notch wheel zoom out of whole city looked like a clear indictment:
 *
 * ```
 *                     median   p95      worst    frames >250 ms
 *   with vegetation   8.4 ms   241.6    917.3    4
 *   ?layers=-veg      8.4 ms   165.9    316.0    1
 * ```
 *
 * So the dissolve weight was multiplied by 0.30 while the camera moves — the
 * same `vrnd(i) >= w` index test, so a subset and not a reshuffle — and
 * measured again. **It did not move the worst frame** (774.9 / 916.6 with the
 * rung against 917.3 without it), and the next `?layers=-veg` control came
 * back at **1,016.7 ms with the vegetation switched off entirely.**
 *
 * The run-to-run variance is larger than the effect, so the first table does
 * not show what it looked like it showed. What every run agrees on is the part
 * that matters: **the median frame is 8.4 ms in every configuration** — a
 * gesture is a blit and none of this runs during one — and the long frames are
 * the handful of full RE-rasterisations a zoom forces when it crosses a band,
 * which are 300-1,000 ms with the vegetation and 300-1,000 ms without it.
 *
 * The rung is not here because a change that costs the reader trees during
 * every move has to buy something measurable, and this one did not. The band
 * crossing is the real object and it is not this module's.
 */
export const VEG_HAS_NO_MOTION_RUNG = true;

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

/**
 * ONE TONE PER PUBLISHED CLASS, NEVER A HASH, AND THREE VALUES OF IT.
 *
 * `part3.html` `vspriteSheet` L3805-3812. The port shipped ONE flat green per
 * family and dropped the other two values of each:
 *
 * ```
 *                reference mid / lit / dk        this port shipped
 *   broadleaf    #6f8f4e  #93ae66  #4d6a37       #5f7a45   (flat)
 *   conifer      #4d6f52  #6a8c68  #33503b       #4a6b46   (flat)
 *   palm         #7e9a4c  #a2b96a  #5a7135       #6f8a4e   (flat)
 *   unclassed    #75904f  #96ac68  #53693a       #66804a   (flat)
 * ```
 *
 * Every shipped green was DARKER than the reference's own mid — 12 to 16
 * levels — and with the lit lobe gone the crown had no direction, which is
 * what made the canopy read as a green mass with a dot texture at the district
 * camera where every crown in the frame is a canopy cell.
 *
 * Block M §5 is why there is one tone per class and not one per tree: 166,166
 * meaningless differences is noise, and noise reads as confetti.
 */
export interface CrownTone {
  readonly mid: string;
  readonly lit: string;
  readonly dk: string;
}

export const TREE_FAM: readonly CrownTone[] = [
  { mid: "#6f8f4e", lit: "#93ae66", dk: "#4d6a37" }, // broadleaf
  { mid: "#4d6f52", lit: "#6a8c68", dk: "#33503b" }, // conifer
  { mid: "#7e9a4c", lit: "#a2b96a", dk: "#5a7135" }, // palm
  { mid: "#75904f", lit: "#96ac68", dk: "#53693a" }, // unclassed
];

/**
 * THE CANOPY MASS IS ITS OWN TONE AND ITS OWN HEIGHT.
 *
 * `part3.html` L3866-3868: index 9 — a cell more than 55 % covered — is
 * `#5f7f45 / #83a05c / #415c30`, and index 8 is the broadleaf family's own
 * row. The port drew both as one flat `#5b7742`.
 */
export const CANOPY_FAM: CrownTone = {
  mid: "#5f7f45",
  lit: "#83a05c",
  dk: "#415c30",
};

/** the mid tone of each family, kept as its own export for the ground tint */
export const TREE_GREENS: readonly string[] = TREE_FAM.map((f) => f.mid);

/** crown diameter in metres, by the one published size bit */
export const CROWN_M: readonly [number, number] = [6.6, 10.0];

/**
 * THE SMALL CROWN IS 0.76 OF THE SPRITE, NOT 0.66.
 *
 * `part3.html` L3819, `VSPR_R*(big?1.0:0.76)`. The sprite radius is not what
 * sizes a STREET tree — `CROWN_M` does that, through `rp/S.r` — but it IS
 * what sizes the crown inside its own cell of the sheet, so a small crown was
 * being drawn at 87 % of the area the reference draws it at.
 */
export const CROWN_SMALL_K = 0.76;

/**
 * A CANOPY MASS SITS 1.30 RADII UP, NOT 2.613.
 *
 * `part3.html` L3868: `const R=VSPR_R, cy=VSPR_AY-R*1.30`. `CROWN_LIFT`
 * = 2·ZEXB/1.2247 = 2.613 is the lift of a TREE, whose crown sits two radii of
 * real height above its own ground point. A canopy cell is not a tree standing
 * on the ground; it is the mass itself, and the reference sits it at half that
 * — *"the same wash, no trunk, sitting lower on the ground"*. The port lifted
 * it by the tree's number and floated every blob in Golden Gate Park a full
 * crown-diameter north of the cell it is measured over.
 */
export const CANOPY_LIFT = 1.3;

/** the six lobes a broadleaf crown is made of: x, y, r, all in crown radii */
const LOBES: readonly (readonly [number, number, number])[] = [
  [0, 0, 1.0],
  [-0.52, 0.12, 0.68],
  [0.52, 0.1, 0.66],
  [-0.22, -0.46, 0.62],
  [0.28, -0.44, 0.6],
  [0, 0.46, 0.62],
];

export interface SpriteSheet {
  readonly canvas: CanvasImageSource;
  readonly w: number;
  readonly h: number;
  readonly ay: number;
  readonly n: number;
}

/**
 * Draw the sheet once and blit it. The sheet is a function of the palette and
 * of nothing the camera does, so a pan does not rebuild it.
 *
 * **THE LIGHT IS UPPER-RIGHT ON SCREEN** — VISUAL-SPEC §1.3, resolved in
 * favour of the faces, and the same light the walls and the cast shadows
 * already use. So the lit lobe is up-right and the shadow falls down-left.
 * That is the whole reason a crown has three values and not one: a flat disc
 * has no light on it and cannot agree with the buildings beside it.
 *
 * Ported shape for shape from `part3.html` L3795-3885 — the six-lobe
 * broadleaf silhouette, the three-value conifer cone, the eight fronds and
 * four lit fronds of a palm, the stroked trunk, and the two canopy masses.
 * The port that this replaces drew one ellipse per crown, no trunk, and a
 * cone with no shading.
 */
export function buildSpriteSheet(
  makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): SpriteSheet | null {
  const n = TREE_FAM.length * 2 + 2;
  const c = makeCanvas(Math.ceil(VSPR_W * n), Math.ceil(VSPR_H));
  const g = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;
  const TAU = Math.PI * 2;
  for (let k = 0; k < n; k++) {
    g.save();
    g.translate(k * VSPR_W + VSPR_W / 2, 0);
    if (k < TREE_FAM.length * 2) {
      const fam = k >> 1,
        big = (k & 1) === 1;
      const F = TREE_FAM[fam];
      const R = VSPR_R * (big ? 1 : CROWN_SMALL_K),
        cy = VSPR_AY - R * CROWN_LIFT;
      // contact shadow on the ground, down-left, soft
      g.save();
      g.globalAlpha = 0.2;
      g.fillStyle = "#3b3222";
      g.beginPath();
      g.ellipse(-R * 0.3, VSPR_AY - R * 0.06, R * 0.92, R * 0.4, 0, 0, TAU);
      g.fill();
      g.restore();
      // trunk
      g.strokeStyle = "#5d4a33";
      g.lineWidth = Math.max(1.6, R * 0.13);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, VSPR_AY - R * 0.1);
      g.lineTo(0, cy + R * 0.25);
      g.stroke();
      if (fam === 2) {
        // a palm: fronds, not a crown. Eight, on the file's word for it.
        g.strokeStyle = F.mid;
        g.lineWidth = Math.max(2, R * 0.2);
        g.lineCap = "round";
        for (let a = 0; a < 8; a++) {
          const th = -Math.PI / 2 + (a - 3.5) * 0.4;
          g.beginPath();
          g.moveTo(0, cy + R * 0.3);
          g.quadraticCurveTo(
            Math.cos(th) * R * 0.8,
            cy + R * 0.3 + Math.sin(th) * R * 0.75,
            Math.cos(th) * R * 1.25,
            cy + R * 0.3 + Math.sin(th) * R * 0.55 + R * 0.3,
          );
          g.stroke();
        }
        g.strokeStyle = F.lit;
        g.lineWidth = Math.max(1, R * 0.09);
        for (let a = 0; a < 4; a++) {
          const th = -Math.PI / 2 + (a - 1.2) * 0.42;
          g.beginPath();
          g.moveTo(0, cy + R * 0.3);
          g.quadraticCurveTo(
            Math.cos(th) * R * 0.8,
            cy + R * 0.3 + Math.sin(th) * R * 0.75,
            Math.cos(th) * R * 1.2,
            cy + R * 0.3 + Math.sin(th) * R * 0.55 + R * 0.26,
          );
          g.stroke();
        }
      } else if (fam === 1) {
        // a conifer: a cone, three flat wash values, no gradient
        const top = cy - R * 1.15,
          bot = cy + R * 0.95;
        g.fillStyle = F.mid;
        g.beginPath();
        g.moveTo(0, top);
        g.lineTo(R * 0.95, bot);
        g.lineTo(-R * 0.95, bot);
        g.closePath();
        g.fill();
        g.fillStyle = F.lit;
        g.beginPath();
        g.moveTo(0, top);
        g.lineTo(R * 0.95, bot);
        g.lineTo(0, bot);
        g.closePath();
        g.fill();
        g.fillStyle = F.dk;
        g.beginPath();
        g.moveTo(-R * 0.3, top + R * 0.55);
        g.lineTo(-R * 0.95, bot);
        g.lineTo(-R * 0.2, bot);
        g.closePath();
        g.fill();
      } else {
        // a broadleaf crown: overlapping lobes, so the silhouette is lumpy
        g.fillStyle = F.mid;
        g.beginPath();
        for (const L of LOBES) {
          g.moveTo(L[0] * R + L[2] * R, cy + L[1] * R);
          g.arc(L[0] * R, cy + L[1] * R, L[2] * R, 0, TAU);
        }
        g.fill();
        g.fillStyle = F.lit;
        g.beginPath();
        g.arc(R * 0.3, cy - R * 0.34, R * 0.62, 0, TAU);
        g.arc(R * 0.62, cy + R * 0.02, R * 0.42, 0, TAU);
        g.fill();
        g.fillStyle = F.dk;
        g.beginPath();
        g.arc(-R * 0.36, cy + R * 0.4, R * 0.52, 0, TAU);
        g.fill();
      }
    } else {
      // a canopy mass: the same wash, no trunk, sitting lower on the ground
      const dense = k - TREE_FAM.length * 2 === 1;
      const R = VSPR_R,
        cy = VSPR_AY - R * CANOPY_LIFT;
      const F = dense ? CANOPY_FAM : TREE_FAM[0];
      g.save();
      g.globalAlpha = 0.22;
      g.fillStyle = "#3b3222";
      g.beginPath();
      g.ellipse(-R * 0.26, VSPR_AY - R * 0.3, R * 1.02, R * 0.44, 0, 0, TAU);
      g.fill();
      g.restore();
      g.fillStyle = F.mid;
      g.beginPath();
      for (const L of LOBES) {
        g.moveTo(L[0] * R * 1.05 + L[2] * R * 1.05, cy + L[1] * R * 0.9);
        g.arc(L[0] * R * 1.05, cy + L[1] * R * 0.9, L[2] * R * 1.05, 0, TAU);
      }
      g.fill();
      g.fillStyle = F.lit;
      g.beginPath();
      g.arc(R * 0.34, cy - R * 0.32, R * 0.66, 0, TAU);
      g.arc(R * 0.66, cy + R * 0.04, R * 0.44, 0, TAU);
      g.fill();
      g.fillStyle = F.dk;
      g.beginPath();
      g.arc(-R * 0.4, cy + R * 0.36, R * 0.56, 0, TAU);
      g.fill();
    }
    g.restore();
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
  /** years from `TREE_YEAR_BASE` = 1900; 0 = the date is not published */
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
/**
 * §VPROBE — one counter per REASON a crown was not drawn.
 *
 * `terrain.ts` §GPROBE's pattern, for the same reason: a claim about which
 * gate is costing the frame its midtones has to be a COUNT taken out of the
 * running page, not an argument about a constant. Off by default, dev only,
 * parked on `globalThis` so the parity harness can switch it on through the
 * renderer hook and read it back without a source edit.
 */
export const VPROBE: {
  on: boolean;
  z: number;
  k: number;
  /** canopy cells that reached the gates, after the dissolve */
  canSeen: number;
  /** dropped by BLOB_MIN_M2 */
  canArea: number;
  /** dropped by BLOB_MIN_M2 having passed the reference's OWN gate (rp >= 0.9) */
  canAreaLost: number;
  /** dropped by rp < 0.9 — the reference's gate, and the only one it has */
  canRp: number;
  /** dropped by the frame cull */
  canOff: number;
  canDrawn: number;
  /** street trees that reached the gates, after the dissolve and the year */
  trSeen: number;
  /** dropped by this file's `wpx < 1.2` */
  trFloor: number;
  /** would be dropped by the REFERENCE's `rp < 0.7`, i.e. `wpx < 2.8` */
  trRefFloor: number;
  trOff: number;
  trDrawn: number;
} = {
  on: false, z: 0, k: 0,
  canSeen: 0, canArea: 0, canAreaLost: 0, canRp: 0, canOff: 0, canDrawn: 0,
  trSeen: 0, trFloor: 0, trRefFloor: 0, trOff: 0, trDrawn: 0,
};
function vprobeReset(z: number, k: number) {
  Object.assign(VPROBE, {
    z, k,
    canSeen: 0, canArea: 0, canAreaLost: 0, canRp: 0, canOff: 0, canDrawn: 0,
    trSeen: 0, trFloor: 0, trRefFloor: 0, trOff: 0, trDrawn: 0,
  });
}
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityVPROBE?: typeof VPROBE }).__cityVPROBE = VPROBE;
}

export function drawVeg(
  f: Frame,
  t: TerrainField,
  sheet: SpriteSheet | null,
  trees: readonly TreeCell[],
  canopy: readonly CanopyCells[],
  z: number,
  grid: TreeGrid = TREE_GRID,
): VegResult {
  const { ctx, cam, W, H } = f;
  let nT = 0,
    nB = 0,
    nU = 0;
  const wCan = WFLG.blobs ? bandW(z, VZ_C0, VZ_C1) : 0;
  const wTree = WFLG.trees ? bandW(z, VZ_T0, VZ_T1) : 0;
  const year = f.year;
  if (VPROBE.on) vprobeReset(z, cam.scale);

  /* ── NO `proj()` INSIDE EITHER LOOP ────────────────────────────────────
     `proj()` returns a NEW two-element array and does four multiplies of its
     own trig. `buildings.ts` paid for that lesson once — "at district the
     footprint loop ran over 880,000 vertices, so calling it twice a vertex
     allocated 1.8 million two-element arrays per rasterisation" — and
     `proj.coeffs()` exists for exactly this shape of loop. There are 195,310
     trees and 50,897 canopy cells, so this is the same loop again.

     MEASURED, because a claim about frames has to be: with the vegetation
     grid decoded correctly the drawn tree count went from 2,333 to 31,066 at
     the block preset, and an 18-notch wheel zoom out of whole city fell from
     45.9 rAF/s with `?layers=-veg` to 31.2 with it. The three changes below
     are the mock's own arithmetic, not a cheaper approximation of it. */
  const cf = f.proj.coeffs();
  const zex = f.proj.zex;
  const k = cam.scale;
  const W2 = W / 2,
    H2 = H / 2;
  const cell = grid.cell;

  /*
   * ── THE CANOPY IS THE SAME KIND OF OBJECT AS A STREET TREE ─────────────
   *
   * This layer was one `Path2D` of flat ellipses filled once at
   * `globalAlpha 0.5` in a single green. `part3.html` §drawVeg draws **the
   * sprite sheet's own two canopy masses**, one blit a cell, far to near,
   * with the ground shadow the sheet already carries — the sheet has been
   * building those two sprites all along (`isCanopy`, indices 8 and 9) and
   * nothing was asking for them.
   *
   * The difference is the whole of the district band: `VZ_T0` = 2.9 is
   * exactly the district preset, so `bandW(2.9, 2.9, 6.0)` is 0 and **there
   * are no street trees in that frame at all** — every crown a reader sees
   * over the Sunset and inside Golden Gate Park at 2.9x is a canopy cell.
   * Drawn as one flat fill they are a green mass with a dot texture; drawn as
   * the mock draws them they are crowns with shadows and the meadows read as
   * meadows. Parity §7's "counted but barely drawn at band 1" is this.
   *
   * The two gates are the reference's own and they are different gates: the
   * 58.06 m2 floor is on the PUBLISHED area (the tint already carries a cell
   * that small), and `rp < 0.9` is on the DRAWN radius, which is what stops a
   * blit that cannot resolve. Far to near is `descending cellKey`, because
   * `cellKey = row * gw + col` and at ROT 315 `depth()` reduces to world y,
   * so a descending row IS painter order and no sort is needed.
   */
  if (wCan > 0.002 && sheet) {
    ctx.save();
    const pxm = 1.2247 * k;
    const amax = cell * cell;
    const canopy0 = TREE_GREENS.length * 2;
    let base = 0;
    for (const c of canopy) base += c.cellKey.length;
    for (let ci = canopy.length - 1; ci >= 0; ci--) {
      const c = canopy[ci];
      base -= c.cellKey.length;
      for (let i = c.cellKey.length - 1; i >= 0; i--) {
        if (vrnd(base + i) >= wCan) continue;
        const areaM2 = (c.area[i] / 255) * amax;
        const rp = blobRadius(areaM2) * pxm;
        if (VPROBE.on) {
          VPROBE.canSeen++;
          if (areaM2 < BLOB_MIN_M2) {
            VPROBE.canArea++;
            if (rp >= 0.9) VPROBE.canAreaLost++;
          } else if (rp < 0.9) VPROBE.canRp++;
        }
        if (areaM2 < BLOB_MIN_M2) continue;
        if (rp < 0.9) continue;
        const w = treeWorld(c.cellKey[i], c.pos[i], grid);
        const pz = t.elevM(w.x, w.y) * zex;
        const X = (cf.ax * w.x + cf.ay * w.y - cam.cx) * k + W2;
        const Y = H2 - (cf.bx * w.x + cf.by * w.y + pz - cam.cy) * k;
        const sc = rp / VSPR_R;
        const dw = VSPR_W * sc,
          dh = VSPR_H * sc;
        if (X + dw < -8 || X - dw > W + 8 || Y < -8 || Y - dh > H + 8) {
          if (VPROBE.on) VPROBE.canOff++;
          continue;
        }
        const si = Math.min(
          sheet.n - 1,
          canopy0 + (areaM2 > amax * 0.55 ? 1 : 0),
        );
        ctx.drawImage(
          sheet.canvas,
          si * VSPR_W,
          0,
          VSPR_W,
          VSPR_H,
          X - dw / 2,
          Y - VSPR_AY * sc,
          dw,
          dh,
        );
        nB++;
        if (VPROBE.on) VPROBE.canDrawn++;
      }
    }
    ctx.restore();
  }

  if (wTree > 0.002 && sheet) {
    ctx.save();
    /* the two crown sizes are the same two for every tree in the city, so the
       drawn size is two numbers and not a divide per tree */
    const wpxS = ((CROWN_M[0] * 1.2247 * k) / (2 * VSPR_R)) * VSPR_W;
    const wpxB = ((CROWN_M[1] * 1.2247 * k) / (2 * VSPR_R)) * VSPR_W;
    let idx = 0;
    for (const c of trees) {
      let vo = 0;
      for (let ci = 0; ci < c.cellKey.length; ci++) {
        const cnt = c.cellCnt[ci];
        const base = vo;
        vo += cnt;
        /* ── THE CELL IS CULLED BEFORE ANY TREE IN IT IS TOUCHED, AND THE
               ELEVATION IS READ ONCE FOR THE CELL ──────────────────────────
           `part3.html` `drawVeg` projects the cell's own centre, rejects the
           whole cell against the frame with a 200 px margin, and then takes
           `elevDrawn(bx + cel/2, by + cel/2)` ONCE for every tree standing in
           it. A 24 m cell is under 60 px at the detail ceiling, so one DEM
           sample across it is the same sample the per-tree read would return
           to within one bilinear step of a 53.8 m grid — and it is what the
           reference does, so this is a port and not an economy. */
        const gi = c.cellKey[ci] % grid.gw,
          gj = (c.cellKey[ci] / grid.gw) | 0;
        const bxw = grid.x0 + gi * cell,
          byw = grid.y0 + gj * cell;
        const mxw = bxw + cell * 0.5,
          myw = byw + cell * 0.5;
        const cX = (cf.ax * mxw + cf.ay * myw - cam.cx) * k + W2;
        const cY = H2 - (cf.bx * mxw + cf.by * myw - cam.cy) * k;
        if (cX < -200 || cX > W + 200 || cY < -200 || cY > H + 400) {
          idx += cnt;
          continue;
        }
        const pz = t.elevM(mxw, myw) * zex;
        const step = cell / grid.q;
        for (let i = 0; i < cnt; i++, idx++) {
          const j = base + i;
          if (vrnd(idx) >= wTree) continue;
          const yy = c.yr[j];
          if (yy === 0) {
            if (!WFLG.undated) continue;
          } else if (year !== undefined && year < TREE_YEAR_BASE + yy) continue;
          const pos = c.pos[j];
          const wx = bxw + ((pos % grid.q) + 0.5) * step;
          const wy = byw + (((pos / grid.q) | 0) + 0.5) * step;
          const big = c.big[j] !== 0;
          const wpx = big ? wpxB : wpxS;
          if (VPROBE.on) {
            VPROBE.trSeen++;
            if (wpx < 1.2) VPROBE.trFloor++;
            if (wpx < 2.8) VPROBE.trRefFloor++;
          }
          if (wpx < 1.2) continue;
          const X = (cf.ax * wx + cf.ay * wy - cam.cx) * k + W2;
          const Y = H2 - (cf.bx * wx + cf.by * wy + pz - cam.cy) * k;
          const hpx = (wpx / VSPR_W) * VSPR_H;
          const ay = (wpx / VSPR_W) * VSPR_AY;
          if (X + wpx < -8 || X - wpx > W + 8 || Y < -8 || Y - hpx > H + 8) {
            if (VPROBE.on) VPROBE.trOff++;
            continue;
          }
          const si = Math.min(sheet.n - 1, (c.form[j] & 3) * 2 + (big ? 1 : 0));
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
          if (VPROBE.on) VPROBE.trDrawn++;
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

/**
 * ONE TONE PER PUBLISHED PROPERTY TYPE — the sixth decoded field with no
 * reader, and the reference has it too.
 *
 * `base/parks` ships `cls`, one byte a ring, and it is not a drawing hint: it
 * is DataSF `gtr9-ntp6`'s own `propertytype`, ranked by
 * `world/build_world.py` L274 and shipped through `encode_city_chunks.py`
 * L1220. **`part3.html` L3317 decodes it into `WPARKC` and `grep -n WPARKC`
 * over the whole reference returns that one line and nothing else** — the
 * fifth pass this project has found written and read by nobody, and this port
 * inherited the habit: `decodeParks` returned `cls` and `scene.ts` L980 threw
 * it away.
 *
 * The published ranks and what they hold:
 *
 * ```
 *   0  Regional Park · Parkway · Zoological Garden · Family Camp     55 rings
 *   1  Neighborhood Park or Playground                              187 rings
 *   2  Mini Park                                                     45 rings
 *   3  Civic Plaza or Square · Library · Concession ·
 *      Other Non-Park Property                                       29 rings
 *   4  Community Garden                                              12 rings
 * ```
 *
 * **A CIVIC PLAZA IS NOT GRASS.** Union Square, Civic Center Plaza, UN Plaza
 * and 26 other properties the register itself calls a plaza, a library or a
 * concession were washed in the same meadow green as Golden Gate Park, which
 * is the largest single thing making the open ground read as one flat fill.
 *
 * **The five tones are a DRAWING CONVENTION and they are stated as one.** The
 * source publishes a type, not a colour. What is not invented is the palette:
 * every tone is `WPKW` moved toward a value **this page already paints**, by a
 * stated fraction, so no sixth colour enters the register.
 *
 * ```
 *   0  lerp(WPKW, WCN1, 0.35)   toward the CANOPY's own dark green: the
 *                               regional parks are the ones that hold forest
 *   1  WPKW                     unchanged — 187 of 328 rings, so the frame's
 *                               mean park tone does not move
 *   2  WPKW                     unchanged: a mini park is a small one, not a
 *                               different surface
 *   3  lerp(WPKW, WG1, 0.72)    toward the page's own BARE GROUND tan: paved
 *   4  lerp(WPKW, WPK1, 0.35)   toward the park ground's own pale: cultivated
 * ```
 *
 * `PARK_WASH` stays 0.46 for every class, because §16.5's composite is what
 * makes two overlapping rings read as the two claims they are, and a per-class
 * alpha would break that arithmetic.
 */
export const PARK_TONE: readonly string[] = [
  lerpHex(WPKW, WCN1, 0.35),
  WPKW,
  WPKW,
  lerpHex(WPKW, WG1, 0.72),
  lerpHex(WPKW, WPK1, 0.35),
];

/**
 * A ring, with the published property type it came in on.
 *
 * The class rides on the ring rather than in a parallel array because the
 * ring is what every caller already holds: `scene.ts` stores `p.parks` and
 * hands it to `markCells` and to `drawParkRings`, and a parallel `cls` array
 * has to be carried by every one of them or dropped by one of them — which is
 * exactly how it came to be dropped. An array with an own property is still
 * an array to `for (const [x, y] of ring)`.
 */
export type ParkRing = readonly (readonly [number, number])[] & {
  /** the published `gtr9-ntp6` propertytype rank; undefined = not supplied */
  readonly cls?: number;
};

export function decodeParks(chunk: Chunk): {
  parks: ParkRing[];
  cls: Uint8Array;
  water: ParkRing[];
} {
  const cls = chunk.fields.cls;
  const clsA = cls instanceof Uint8Array ? cls : new Uint8Array(0);
  const read = (
    lenName: string,
    xyName: string,
    withCls: boolean,
  ): ParkRing[] => {
    const len = chunk.fields[lenName];
    const xy = chunk.fields[xyName];
    if (!len || !xy) return [];
    const out: ParkRing[] = [];
    let o = 0;
    for (let r = 0; r < len.length; r++) {
      const n = len[r];
      const ring = new Array(n) as [number, number][] & { cls?: number };
      // decimetres, i32 x 10 — the published quantum, 0.05 m worst error
      for (let k = 0; k < n; k++)
        ring[k] = [xy[o + k * 2] / 10, xy[o + k * 2 + 1] / 10];
      /* THE CLASS RIDES ON THE RING. See `ParkRing`: a parallel array is
         dropped by whichever caller forgets it, and one already had. */
      if (withCls && r < clsA.length) ring.cls = clsA[r];
      out.push(ring);
      o += n * 2;
    }
    return out;
  };
  return {
    parks: read("len", "xy", true),
    cls: clsA,
    water: read("waterLen", "waterXY", false),
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
  const { ctx, W, H } = f;
  if (!parks.length) return 0;
  ctx.save();
  ctx.globalAlpha = PARK_WASH;
  ctx.fillStyle = WPKW;
  /* ONE fillStyle CHANGE PER CHANGE OF CLASS, not one per ring: the rings
     arrive in the register's own order, which is the order the overlaps
     compose in, so they are not sorted — but consecutive rings of one
     property are common and the assignment is skipped when the tone repeats. */
  let tone = WPKW;
  /* ── ONE FILL A RING, NOT ONE FILL FOR ALL OF THEM ─────────────────────
     This built every ring into a single `Path2D` and filled it `"evenodd"`.
     Two things follow and both are visible over Golden Gate Park and Lake
     Merced:
       - **even-odd CANCELS an overlap.** 328 published rings are not disjoint
         — a park ring and the recreation-area ring drawn on top of it are two
         rings over the same ground — and every such overlap came out as a HOLE
         in the wash, tan ground inside a park with a hard published edge round
         it.
       - **and the wash stops accumulating.** `part3.html` L3758-3773 fills each
         ring separately at `globalAlpha = 0.46`, so two rings over the same
         ground compose to 0.708 and read as the two claims they are. One fill
         of a merged path composes once.
     The bbox cull is the reference's own, and it is per ring for the same
     reason: a ring that cannot be seen costs a `fill()` in a merged path
     whether it is in frame or not. */
  let drawn = 0;
  for (const ring of parks) {
    if (!ring.length) continue;
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9;
    const p = new Path2D();
    for (let i = 0; i < ring.length; i++) {
      const pr = f.proj.proj(ring[i][0], ring[i][1], t.elevM(ring[i][0], ring[i][1]));
      const X = sx(f, pr),
        Y = sy(f, pr);
      if (X < x0) x0 = X;
      if (X > x1) x1 = X;
      if (Y < y0) y0 = Y;
      if (Y > y1) y1 = Y;
      if (i) p.lineTo(X, Y);
      else p.moveTo(X, Y);
    }
    if (x1 < -8 || x0 > W + 8 || y1 < -8 || y0 > H + 8) continue;
    const c = WFLG.parkCls ? ring.cls : undefined;
    const want =
      c !== undefined && c < PARK_TONE.length ? PARK_TONE[c] : WPKW;
    if (want !== tone) {
      tone = want;
      ctx.fillStyle = want;
    }
    p.closePath();
    ctx.fill(p);
    drawn++;
  }
  ctx.restore();
  return drawn;
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
  let last: Path2D | null = null;
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
    last = p;
  }
  /* ── THE TRAILING STROKE, AND WHY IT IS SAFE HERE ──────────────────────
     `part3.html` L3670 strokes OUTSIDE the loop, so it strokes whatever path
     the loop left on the context — the LAST water body — deliberately, and
     with its own hazard note: reaching that line having drawn nothing strokes
     the last ring `drawParkRings` left behind, and a dark outline appears
     round a park. DRAW.md §13.7 left this unported for exactly that reason.
     It is safe in this port because there is no shared current path: each body
     is its own `Path2D`, so "the last body" is a value, and a pass that drew
     nothing has `null` and strokes nothing. The hazard was a property of the
     context, not of the treatment. */
  if (last) {
    ctx.strokeStyle = "rgba(28,44,60,.30)";
    ctx.lineWidth = 0.9;
    ctx.stroke(last);
  }
  ctx.restore();
  return bodies.length;
}
