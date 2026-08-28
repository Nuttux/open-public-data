/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/materials.ts — WHICH COLOUR A FOOTPRINT GETS, AND WHY.

   The rule is not this port's and is not invented here. It is
   `scene.ts` §decodeBld, and every branch of it is a PUBLISHED COLUMN:

     the roof   the aerial imagery's own measured palette index, whenever the
                imagery returned a sample for that footprint — 166,042 of
                166,166. When it did not, the roll's use class and its era
                pick a material instead.
     the wall   the roll's use class, its year band and its storey band, in
                the renderer's own material table.
     the shade  which quartile of ITS OWN HEIGHT BAND the roof falls in, so
                two neighbours of the same material and different heights do
                not read as one long roof.
     no row     5.0 % of footprints join no roll row, and the reference does
                not hand those a neutral — it hands them a LOCALE LEGEND, a
                tone by distance from the city's own centre and by which side
                of a published dividing line the parcel sits on. See
                `LocaleLegend`.

   This file is a reader for that rule, not a second copy of it: the tables
   come from `components/us/city/palette`, which is the renderer's material
   table rather than any one city's data, and a city that wants different
   materials passes different tables.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  FLAG_NOYEAR,
  PAINT_C0,
  UMAT_ROOF,
  UMAT_WALL,
  USE_MASK,
  WAM,
  heightBand,
  storeyBand,
  yearBand,
} from "@/components/us/city/palette";
import { RSHADE, bandOfHeight, gamutHeadroom, roofHeight } from "@/lib/city/roofs";
import { buildURND, roofTone } from "@/lib/city/buildings";
import type { BldgTable } from "./bldg";

/** the roof-height quartiles a city publishes, per height band */
export type Quartiles = readonly (readonly number[])[];

/**
 * THE FALLBACK LEGEND, AND IT IS A CITY'S AND NOT THIS ENGINE'S.
 *
 * 5.0 % of the published footprints join no roll row — `UMAT_WALL[use]` is
 * `null` for them, which is the record's own honest bucket rather than a gap.
 *
 * ── AND THAT FIGURE WAS 3.8 % UNTIL IT WAS RE-MEASURED ──────────────────
 * MEASURED off `__cityGLMat`, the histogram `layers/buildings.ts` keeps for
 * exactly this question, against the shipped chunks: **8,365 of 166,166**,
 * which is 5.03 %. This file said 3.8 % and 6,436 in four places. The count is
 * an UNDER-count at that: it increments on `!UMAT_WALL[use]` alone, while the
 * branch below falls to the legend on `!(wl && rl)`, so a footprint with a
 * wall entry and no roof entry lands here and is not counted.
 *
 * Two other figures in this file were checked at the same time and are exact:
 * 166,166 footprints, and 124 without an aerial sample — the "166,042 of
 * 166,166" the roof rule quotes. So the roll simply grew a larger honest
 * bucket than the note was written against, which strengthens the argument
 * below rather than weakening it.
 * The reference does NOT hand those a neutral: it hands them a tone by WHERE
 * THEY ARE, biased on two published quantities — how far the parcel is from
 * the city's own centre, and which side of a published dividing line it falls
 * on — with a reproducible per-footprint draw breaking the tie inside each
 * family. `scene.ts` §the honest bucket is the rule and `palette.ts`
 * §legendTones is the table.
 *
 * It matters far more than 5 % suggests, because those footprints are not
 * spread evenly: they are the federal reservations, the port, the made ground
 * offshore — whole districts at a time. Given one neutral pair they render as
 * a field of identical white boxes, which is exactly what they did.
 *
 * Everything here is a NUMBER the city publishes, so no place name reaches
 * this engine: an origin, the largest distance from it, a point on the
 * dividing line and that line's unit direction. The tone table itself is the
 * city's function, passed in.
 */
export interface LocaleLegend {
  /** the point distances are measured from, world metres */
  readonly originX: number;
  readonly originY: number;
  /** the LARGEST such distance over every published footprint. Published,
   *  because a client holding a few chunks cannot compute it. */
  readonly maxR: number;
  /** a point on the dividing line, world metres */
  readonly lineX: number;
  readonly lineY: number;
  /** that line's UNIT direction */
  readonly lineDX: number;
  readonly lineDY: number;
  /** the city's own table: `r` in 0..1, `side` 0 or 1, `u` in 0..1 */
  readonly tones: (r: number, side: number, u: number) => { wall: number; roof: number };
}

/**
 * The reproducible draw the legend breaks ties with, keyed on the PUBLISHED
 * footprint id and not on the row's position in its chunk.
 *
 * `scene.ts` records what the difference costs: keyed on the chunk-local index
 * instead, 3,053 of `base/solo`'s 15,261 footprints — 20.0 % — came out a
 * different material from the reference, and they are precisely the footprints
 * the legend exists for. The table is `buildURND`, which is the mock's own
 * xorshift seeded with the 1906 date; it is built once and shared, and the id
 * is folded into it rather than used to size it, because an id space is not a
 * population.
 */
const URND_BITS = 18;
let urnd: Float32Array | null = null;
export function legendDraw(gid: number): number {
  urnd ??= buildURND(1 << URND_BITS);
  return urnd[gid & ((1 << URND_BITS) - 1)];
}

export interface MaterialConfig {
  /** `manifest.buildings.hq` */
  hq: Quartiles;
  /** the bit in `paintFlag` that means the imagery returned nothing */
  noSampleBit: number;
  /** the first year the year byte counts from */
  year0: number;
  /** the city's own legend for the footprints no published row reaches. A
   *  city that publishes none falls back to the neutral pair below. */
  legend?: LocaleLegend | null;
  /** a neutral pair for the footprints no published row reaches, and for a
   *  city with no legend at all */
  fallbackRoof: number;
  fallbackWall: number;
}

export interface BldgMaterials {
  /** index into the combined roof palette */
  readonly roof: Uint8Array;
  /** index into the combined wall palette */
  readonly wall: Uint8Array;
  /** which quartile of its own height band the roof is in, 0..3 */
  readonly shade: Uint8Array;
}

function roofStepOf(h: number, hq: Quartiles): number {
  if (!hq.length) return 1;
  const b = Math.min(hq.length - 1, bandOfHeight(h));
  const q = hq[b];
  if (!q) return 1;
  if (h < q[0]) return 0;
  if (h < q[1]) return 1;
  if (h < q[2]) return 2;
  return 3;
}

export function bldgMaterials(tb: BldgTable, cfg: MaterialConfig): BldgMaterials {
  const n = tb.n;
  const roof = new Uint8Array(n);
  const wall = new Uint8Array(n);
  const shade = new Uint8Array(n);
  const lg = cfg.legend ?? null;

  for (let i = 0; i < n; i++) {
    const h = tb.h[i];
    shade[i] = roofStepOf(h, cfg.hq);

    const use = tb.u[i] & USE_MASK;
    const noyr = (tb.u[i] & FLAG_NOYEAR) !== 0;
    const wl = UMAT_WALL[use];
    const rl = UMAT_ROOF[use];

    if (wl && rl) {
      const hb = heightBand(h);
      const y = cfg.year0 + tb.yr[i];
      const ab = noyr ? Math.min(4, hb) : yearBand(y);
      const sb = storeyBand(tb.st[i]);
      wall[i] = WAM(wl[ab * 3 + sb]);
      roof[i] = WAM(rl[hb * 2 + (noyr ? (hb > 1 ? 1 : 0) : y < 1925 ? 0 : 1)]);
    } else if (lg) {
      /* ── THE HONEST BUCKET, AND IT GETS THE CITY'S OWN LEGEND ───────────
         `scene.ts` §the honest bucket, arithmetic for arithmetic. `r` is the
         parcel's distance from the published origin over the published
         largest such distance; `side` is the sign of the cross product
         against the published dividing line, which is 0 on one side of it
         and 1 on the other; the draw is keyed on the published id.

         This used to be one neutral pair for all of them — 6,436 when that
         note was written, 8,365 in the shipped chunks today — with a note
         calling it a stand-in for a Block 6 that never came. It is not 5 %
         of the frame spread thinly — these footprints CLUSTER, so the pair
         rendered whole districts as one white box repeated. */
      const r = Math.hypot(tb.cx[i] - lg.originX, tb.cy[i] - lg.originY) / lg.maxR;
      const side =
        (tb.cx[i] - lg.lineX) * lg.lineDY - (tb.cy[i] - lg.lineY) * lg.lineDX < 0 ? 0 : 1;
      const t = lg.tones(r, side, legendDraw(tb.gid[i]));
      wall[i] = t.wall;
      roof[i] = t.roof;
    } else {
      /* no legend published: the neutral pair, which is what a city that has
         not written its own fallback gets rather than an invented one */
      wall[i] = cfg.fallbackWall;
      roof[i] = cfg.fallbackRoof;
    }

    /* AND THE PHOTOGRAPH WINS, for the 99.9 % it has a sample for. Last,
       exactly as `decodeBld` orders it. */
    if ((tb.paintFlag[i] & cfg.noSampleBit) === 0) {
      roof[i] = PAINT_C0 + tb.paintIdx[i];
    }
  }

  return { roof, wall, shade };
}

/**
 * The roof palette with its four per-height shades already applied.
 *
 * ── AND THROUGH `roofTone` FIRST, WHICH THIS FILE WAS SKIPPING ───────────
 * The measured aerial palette is what the photograph says a roof IS: tar and
 * gravel, and its dark end is very dark. `colourLUT` on the Canvas path maps
 * the whole palette through `roofTone` before it uses it — pull each entry
 * toward its own grey, a little toward the paper, and lift it — because from
 * a bird's eye a roof is the TOP FACE, the one the sun lands on, and it
 * should sit above the walls in value.
 *
 * This table used the RAW palette, so every roof in the GPU city came out one
 * to two stops darker than the same roof on the published page, and a block
 * of them read as holes cut in the map. Daniel, with the two frames side by
 * side: *"roofs are not done."* This line is most of what he was looking at.
 */
export function roofShadeTable(palette: readonly string[]): string[] {
  const out = new Array<string>(palette.length * RSHADE.length);
  for (let c = 0; c < palette.length; c++) {
    const toned = roofTone(palette[c]);
    const cap = gamutHeadroom(toned);
    for (let s = 0; s < RSHADE.length; s++) {
      out[c * RSHADE.length + s] = shadeHex(toned, Math.min(RSHADE[s], cap));
    }
  }
  return out;
}

/** `terrain.ts` §shade, inlined so this file does not import the draw layer */
function shadeHex(hex: string, k: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * k));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * k));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * k));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export { roofHeight };
