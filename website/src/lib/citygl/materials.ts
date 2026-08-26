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
import { roofTone } from "@/lib/city/buildings";
import type { BldgTable } from "./bldg";

/** the roof-height quartiles a city publishes, per height band */
export type Quartiles = readonly (readonly number[])[];

export interface MaterialConfig {
  /** `manifest.buildings.hq` */
  hq: Quartiles;
  /** the bit in `paintFlag` that means the imagery returned nothing */
  noSampleBit: number;
  /** the first year the year byte counts from */
  year0: number;
  /** a neutral pair for the footprints no published row reaches */
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
    } else {
      /* THE HONEST BUCKET. `scene.ts` reaches for a locale legend here — a
         tone by distance from downtown and which side of Market the parcel
         is on. That legend is a DECLARED treatment for the footprints no
         roll row reaches, and it is not reproduced: this port lights its
         buildings rather than tinting them, so a neutral pair is the honest
         stand-in until Block 6 gives these their own material. */
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
