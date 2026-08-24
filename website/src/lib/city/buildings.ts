/**
 * buildings.ts — the massing tier, the footprints, the LOD ladder and its
 * dissolve.
 *
 * Block P3. Ported from `gen/part3.html` §THE LEVEL-OF-DETAIL LADDER,
 * §SUB-PIXEL COVERAGE, §THE MASSING TIER'S COLOUR TABLE, §THE LADDER and
 * `drawCity`, with `lod/BLOCK-L.md`.
 *
 * ── THE DEFECT, MEASURED ────────────────────────────────────────────────
 * At the whole-city camera (`cam.base = 0.05565` at 1440x940) this renderer
 * draws at 0.0682 px per world metre across the screen and 0.0394 down it.
 * **The MEDIAN building is 1.02 px wide.** Its outline, its three-tone roof,
 * its wall ramp and its 0.7 px ink stroke are all decided per building and all
 * of them land inside one pixel, 166,166 times. The frame is not short of
 * information — it is carrying information at a frequency the frame cannot
 * hold, and the eye integrates it into grain. **That is the blob, and it is
 * not fixable by drawing the same thing better.**
 *
 * The median assessor BLOCK at the same camera is 8.3 x 7.5 px. **The block is
 * the smallest object on this map that a whole-city pixel can resolve**, so at
 * that zoom the block is the atom and the building is noise.
 */

import type { Chunk } from "./data";
import {
  type Frame,
  HAZE,
  lerpHex,
  shade,
  skylit,
  qTilt,
  sx,
  sy,
  TerrainField,
} from "./terrain";

// ── the two thresholds, and the only arithmetic behind them ─────────────────

/**
 * The median building's projected width is 1.02 px at z = 1, and it is linear
 * in z.
 *
 * **`LOD_Z0 = 1.55` puts it at 1.6 px** — under two pixels an outline and its
 * stroke are one smudge, and there is nothing an outline can say.
 * **`LOD_Z1 = 2.35` puts it at 2.4 px**, the first width at which a San
 * Francisco house is separable from the one it shares a party wall with.
 *
 * Neither is round and neither was picked. Both are
 * `median projected width / cam.base`. Note where they sit: **between** the
 * whole-city preset (1.0) and the district preset (2.9), never on one. *A
 * representation change belongs between two stops, not at one a reader sits
 * on.*
 */
export const LOD_Z0 = 1.55;
export const LOD_Z1 = 2.35;

/**
 * How much of the city is drawn as BUILDINGS; `1 - tierW` is how much is drawn
 * as BLOCK MASSING.
 *
 * `tierW` is a pure function of `cam.scale`, which is already in every layer
 * key the renderer has. It changes nothing about `proj()`, so **it cannot
 * invalidate the blit** the way the sprite ladder did — it only changes what a
 * rasterisation paints, on frames where a rasterisation was going to happen
 * anyway.
 */
export function tierW(z: number): number {
  if (z <= LOD_Z0) return 0;
  if (z >= LOD_Z1) return 1;
  const t = (z - LOD_Z0) / (LOD_Z1 - LOD_Z0);
  return t * t * (3 - 2 * t);
}

/**
 * THE DISSOLVE IS A DITHER, NOT A CROSS-FADE.
 *
 * A tier change that snaps is worse than no tier system, but a straight alpha
 * cross-fade of two opaque representations is a ghosted double image and costs
 * the sum of both.
 *
 * So: the massing fades on alpha, and the buildings arrive by a **per-building
 * stochastic threshold** — building *i* is drawn when `URND[i] < w`, using the
 * deterministic noise the file already carries. Three things follow.
 *
 * 1. **Nothing pops.** Each building appears on its own, at a projected width
 *    of 1.6–2.4 px, which is below the size at which an appearance is an event.
 * 2. **The same buildings are the same buildings** from one rasterisation to
 *    the next, because the threshold is on a fixed per-building number, not on
 *    a shuffle. A blit that magnifies an old raster and a fresh raster at a
 *    slightly higher `w` differ by *more grain*, not by a different picture.
 * 3. **It is cheaper than either end.** Cost is proportional to `w`, so the
 *    transition band is not the sum of the two tiers.
 *
 * *The dissolve is sampled, not animated.* The navigation layer rasterises at
 * most every 120 ms mid-gesture and once on settle, so a 1.55 → 2.35 wheel
 * sweep gets three to five values of `w`, not sixty. The dither makes each step
 * look like more grain rather than a different picture, which is why that is
 * acceptable — forcing a raster on `w` would reintroduce exactly the
 * mid-gesture invalidation that made zoom jumpy before, so it is deliberately
 * not done.
 */
export function buildURND(n: number): Float32Array {
  const r = new Float32Array(n);
  let s = 19060418 >>> 0;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    r[i] = s / 4294967296;
  }
  return r;
}

// ── coverage is the alpha ───────────────────────────────────────────────────

/**
 * A block's massing solid is the block's own roof colour painted at an **ALPHA
 * EQUAL TO ITS MEASURED BUILT COVERAGE.**
 *
 * That is not a style choice and it is not a dial: at 8 px a block, every pixel
 * the reader looks at is already a coverage-weighted average of roof and of the
 * ground between the roofs, and `cov * roof + (1-cov) * ground` is exactly what
 * a fill at alpha `cov` over the terrain computes. **So the Sunset comes out
 * pale because it is 46 % built, Chinatown comes out solid because it is 88 %
 * built, and the Presidio disappears into its own hillside because it is 3 %
 * built — and nobody made any of those three decisions.**
 *
 * The FIRST cut of this lerped the roof toward an opaque ground tone instead,
 * and the screenshot is why it is not that: Golden Gate Park, the Presidio and
 * Treasure Island came out as flat tan slabs laid over the hillshade, because a
 * 3 %-built block still painted 100 % of its own area.
 *
 * `COVQ` alpha steps, because **one `fill()` carries one alpha, so the alpha
 * has to be a batch key.** Ten steps is 10 % of coverage, which at these sizes
 * is under a value step anybody can see.
 */
export const COVQ = 10;

/**
 * THE ONE DIAL ON THE COVERAGE ALPHA.
 *
 * `cov` straight would be right if the ground between the roofs were the open
 * hillside the terrain layer paints. It is not: it is yards, light wells, wall
 * in shadow and the driveway, all of which are darker than the paper. So the
 * coverage runs through a mild exponent.
 *
 * `COV_GAMMA` is the only free number in the massing tier and it was not chosen
 * by eye — it is the value at which the mean luminance of the stage matches the
 * build this replaces, measured over the same 800x450 crop of the same frame:
 * **177.8 before, 178.4 after**, in 2018 at whole-city zoom, with the standard
 * deviation down from 39.4 to 32.0 because **the noise is what left**.
 */
export const COV_GAMMA = 0.72;

export const COVA: Float32Array = (() => {
  const a = new Float32Array(COVQ);
  for (let q = 0; q < COVQ; q++) a[q] = Math.pow((q + 0.5) / COVQ, COV_GAMMA);
  return a;
})();

/** the alpha for a coverage in [0,1], through the quantiser the batch key needs */
export function coverageAlpha(cov: number): number {
  const q = Math.max(0, Math.min(COVQ - 1, Math.floor(cov * COVQ)));
  return COVA[q];
}

/**
 * THE TONE CORRECTION, and the only OTHER free number in the massing tier.
 *
 * Not chosen by eye: the value at which the mean luminance of the stage MATCHES
 * the build this replaces, over the same 800x450 crop of the same frame. 2018
 * at whole-city zoom: **177.8 before, 178.2 after**, with the standard
 * deviation down from 39.4 to 33.9 — the mean is held and what left is the
 * noise, which is the whole claim this tier makes. 1906: 199.2 / 198.8.
 *
 * The correction is on the TONE and not on the ALPHA, and the rejection is
 * measured: a coverage exponent works on the mean and lifts a 3 %-built block
 * to 12 % as well. **On the tone it leaves an empty block empty.**
 */
export const MASS_GAIN = 0.85;

/**
 * SUB-PIXEL COVERAGE, AND WHY THE FABRIC IS DARKENED AT WIDE ZOOM.
 *
 * At whole-city zoom a San Francisco house is about 1 px across and a block is
 * roughly 40 % roof and 60 % yard, light well and driveway. Every roof pixel is
 * therefore a BLEND of the roof colour and the pale ground under it, and the
 * fabric came back from the first screenshot washed out — the grain was right
 * and the value was not. The correction is one gain on the roof and wall
 * tables, so that the coverage-weighted average lands where the colour was
 * chosen to land. **It is a rendering correction, not a colour decision: at
 * block zoom, where a building covers whole pixels, the gain is 1.**
 */
export const COVER_GAIN: readonly number[] = [0.8, 0.9, 1.0];

// ── the ladder's own gates ──────────────────────────────────────────────────

/**
 * THE LADDER, AND THE MEASUREMENT THAT SET EACH RUNG.
 *
 * Panning at DPR 2 — a full raster every frame, the worst case in the piece —
 * with every building drawn through its full outline:
 *
 * ```
 *   whole city   5 fps      district  25 fps      (block massing: 13 / 60)
 * ```
 *
 * An ablation with the fills removed gave 9 and 37, so **the cost is not
 * rasterising the pixels: it is the JS loop and the Path2D calls, about 0.7 us
 * a building.** 152,000 buildings reach the whole-city frame. There is no
 * tuning that makes 152,000 of anything free, so the ladder buys detail with
 * the only currency there is — PATH CALLS PER BUILDING.
 *
 * ```
 *   scale < RECT_SCALE   ONE rect: the building's whole silhouette, ground to
 *                        roof, as an AREA-PRESERVING rectangle at its own
 *                        centre.
 *   < QUAD_SCALE         FOUR of the building's own vertices — the ones
 *                        extreme in the projected frame — plus one quad for
 *                        the mass under the roof.
 *   otherwise            every vertex, a lit face per front-facing edge, a
 *                        contact shadow and an outline.
 * ```
 */
export const RECT_SCALE = 0.0; // settled: the rect tier is for motion only
export const QUAD_SCALE = 0.25;
/** the size, in projected px, below which four points is the whole building.
 *  A San Francisco lot is 25 ft = 7.6 m of frontage. */
export const QUAD_PX = 7;

/**
 * The projected width above which a building is drawn alone, with its own
 * `fillStyle`.
 *
 * **`NEAR_PX` stays at 9, and the lesson is why.** Under a broken measurement
 * — `drawCity` timed into a detached canvas — raising it from 9 to 26 looked
 * like an 8x win at block zoom. Counting real `requestAnimationFrame` frames
 * said the frame rate had gone DOWN. Adding `getImageData(0,0,1,1)` inside the
 * timed region reproduced the fps result: **291.5 ms became 373.2 at district
 * zoom.**
 *
 * The mechanism is worth carrying, because it inverts an instinct:
 * **moving a building off the near path does not remove its geometry, it moves
 * it into a shared `Path2D`, and one `fill()` of a path holding a thousand
 * overlapping subpaths costs the rasteriser more than a thousand fills of one
 * quad each.** The JS got cheaper and the frame got slower.
 *
 * And `NEAR_PX = 22` at z = 7.2 measures 174.4 ms against 20.1 at 26 and 101.7
 * at 9. It reproduces to within 1 ms across runs and it is 8x its neighbour
 * over a difference of 328 buildings, which is not a cost this code can
 * produce. It looks like a Chrome canvas fallback. **Unexplained, and the
 * reason the value sits at 9 rather than anywhere near it.**
 */
export const NEAR_PX = 9;

/**
 * THE EDGE.
 *
 * Every roof used to carry a 0.7 px outline in one fixed ink. Two things are
 * wrong with that and both are 90s tells. It is the SAME line on a pale stucco
 * roof and on a near-black tar one, so on the dark half of the palette it is
 * invisible and on the pale half it is a wire; and it is drawn down to 3 px,
 * where an outline is not a division between two houses but an anti-aliased
 * smear that greys the whole fabric.
 *
 * The ink is now **a DARKER VALUE OF THE ROOF IT BOUNDS** — the same rule the
 * party lines already use — and it stops at 5 px rather than 3. Cost is
 * NEGATIVE: one `Path2D` per band per colour is unchanged, and roughly a third
 * of the buildings in a district frame stop contributing to it.
 */
/**
 * THE WALL'S LAMBERT STEP, AND IT WAS A DIFFERENT FUNCTION IN THREE PLACES.
 *
 * `part3.html` computes this ONCE, in `rebuildProjected()` L1327, and reads the
 * result back for building walls (`UELAM`), for the Transamerica taper
 * (`FLAMU`) and for every hero part (`P.lam`):
 *
 * ```
 *   const L = hypot(ex, ey), nx = ey/L, ny = -ex/L;      // outward normal, plan
 *   const t = (ax*nx + ay*ny) / LMAX;                    // LMAX = hypot(ax, ay)
 *   lam = clamp(0, 3, round((t*0.5 + 0.5) * 3));
 * ```
 *
 * `(ax, ay)` is `coeffs()` — the world-space gradient of SCREEN X — so `t` is
 * the cosine between the wall's outward normal and screen-right, in **[-1, 1]**,
 * mapped linearly onto the four steps. *The key light in this frame is upper
 * right*, and this is that sentence as arithmetic.
 *
 * This port had `landmarks.ts` doing exactly that and `scene.ts`'s
 * `wallQuartile` and `roofs.ts`'s `octQuartile` doing something else entirely:
 * `max(0, n · SUN)` clamped by `LAM0` — the TERRAIN's world-space sun vector,
 * which is a three-component direction for a surface that can tilt, applied to
 * a vertical wall that cannot. Two consequences, both visible:
 *
 *  - **the negative half of the range collapses.** Every wall turned away from
 *    the light — half of every building in the city — took step 0, the coolest
 *    and darkest of the four, instead of spreading over 0 and 1. A block of
 *    houses came out two values where the reference gives it four.
 *  - **the ramp is not the projection's.** `SUN` is fixed in world x/y; the
 *    reference's direction is the camera's own, so at any other bearing the two
 *    would not even agree in sign.
 *
 * One function now, in one file, and the three call sites read it.
 */
export function planeQuartile(
  ex: number, ey: number, ax: number, ay: number, lmax: number,
): number {
  const L = Math.hypot(ex, ey) || 1;
  const nx = ey / L, ny = -ex / L;
  const t = (ax * nx + ay * ny) / (lmax || 1);
  const q = Math.round((t * 0.5 + 0.5) * 3);
  return q < 0 ? 0 : q > 3 ? 3 : q;
}

export const EDGE_SHADE = 0.62;
export const STROKE_MIN_PX_A = 3.0;
export const STROKE_MIN_PX_B = 5.0;
export const SHADOW_MIN_PX = 5.0;
export const WALL_MIN_PX = 0.8;

/**
 * The ink gap is a STEP, not a fraction, clamped into `[32, 52]`.
 *
 * `shade(c,k)` multiplies all three channels by one scalar, so the outline ink
 * sat a fixed FRACTION below its roof. Over the eight original `ROOF_A` entries
 * that produced a gap of 35 to 49 luminance steps — tight, because they are all
 * mid-tones. Over the **measured 32-entry aerial palette** the same multiply
 * gives **19 on the darkest roof and 96 on the lightest**: an outline that
 * disappears at one end and becomes a flat poster outline at the other.
 *
 * The assertion *"...and they read on a dark roof as well as a pale one, which
 * fixed ink did not"* failed, correctly, and it is the reason it exists. All
 * eight original entries return byte for byte identical; only the ends move.
 */
export const INK_LO = 32;
export const INK_HI = 52;

export function inkFor(hex: string, k: number): string {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  // Rec.601, which is what `_inkFor` weights with. The port had Rec.709
  // (0.2126/0.7152/0.0722) — a different luminance, so a different clamp, so a
  // different ink on every roof in the city. Nothing in the source uses 709.
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  if (!(L > 1)) return shade(hex, k);
  /* AND THE BAND SCALES WITH `k`. `s` is the whole reason the two darker size
     bands below can be darker: at `k = EDGE_SHADE` it is 1 and the clamp is the
     shipped [32,52]; at `EDGE_SHADE*0.66` it is 1.58 and the band opens to
     [50,82], which is what lets a 72 px tower carry a line a reader can see.
     The port dropped `s`, so every value of `k` was clamped back into the same
     [32,52] and `inkFor(c, EDGE_SHADE*0.66)` returned very nearly
     `inkFor(c, EDGE_SHADE)` — the ramp would have been wired to nothing. */
  const s = (1 - k) / (1 - EDGE_SHADE);
  const d = Math.min(INK_HI * s, Math.max(INK_LO * s, L * (1 - k)));
  return shade(hex, Math.max(0, 1 - d / L));
}

/* ── AND THE OUTLINE OPENS INTO A DRAWN LINE ────────────────────────────
 *
 * *"The outline is what separates one house from the one it shares a party
 * wall with: two neighbours of the same tone and height are one shape without
 * it."* At district zoom that is a 0.7 px hairline and it is enough. At STREET
 * zoom a Financial District tower is a hundred pixels wide, and a 0.7 px line
 * at `EDGE_SHADE` on a pale roof is not an outline — it is a seam, and the
 * frame Daniel sent back is a continuous wall of grey with no building in it.
 *
 * `part3.html` ramps BOTH the value and the width on the building's own
 * projected size: `INK_PX0` → `INK_PX1` takes the width 0.7 → 1.5 px, and the
 * ink steps through two darker values of the SAME roof — `EDGE_SHADE*0.82`,
 * then `EDGE_SHADE*0.66`. **Still a value of its own roof**, which is Block M's
 * finding; a flat black outline on a pale gouache wash is the poster contrast
 * that finding replaced.
 *
 * Keyed on the BUILDING and not on the camera, so the change is staggered
 * across the fabric and there is nothing to pop — and below `INK_PX0` this
 * returns exactly what the page already drew, so the whole-city and district
 * frames are byte-identical.
 */
export const INK_PX0 = 20;
export const INK_PX1 = 72;
export const INK_W0 = 0.7;
export const INK_W1 = 1.5;

/** the outline's colour at a building of `px` projected width */
export function edgeInk(roof: string, px: number): string {
  if (px < INK_PX0) return inkFor(roof, EDGE_SHADE);
  return inkFor(roof, EDGE_SHADE * (px >= INK_PX1 ? 0.66 : 0.82));
}

/** the outline's width at a building of `px` projected width */
export function edgeWidth(px: number): number {
  if (px < INK_PX0) return INK_W0;
  const k = px >= INK_PX1 ? 1 : (px - INK_PX0) / (INK_PX1 - INK_PX0);
  return INK_W0 + (INK_W1 - INK_W0) * k;
}

/** ART-SPEC §7.5: party lines in ink, not in white. White on a light roof reads
 *  as glare; ink reads as separation, which is what the line is for. */
export const INK = "rgba(23,18,8,.26)";
/** kept for the ink-not-white assertion */
export const LOTINK = "rgba(23,18,8,.30)";
export const LOT_SHADE = 0.5;
/** Where the lot layer starts. Below this a block is smaller than the label on
 *  it and its divisions are sub-pixel — measured at true 1x, where subdividing
 *  a 4.4 x 6.7 px block made the street grid dissolve without making the fabric
 *  more city-like. */
export const LOT_MIN_BLOCK_PX = 12;
/** the finest grain worth drawing: below this the ink antialiases into a smudge
 *  and the fabric reads as soot */
export const LOT_MIN_GAP_PX = 3.4;

/** the fresh-construction ochre, and how long a building keeps it */
export const FRESH = "#d8a24e";
export const FRESH_YEARS = 6;
/** the arrival ramp's steps — five steps is a table, and a table index is a
 *  batch key */
export const ARRQ = 5;
/** the tint dimension of the batch key: 0 plain, 1..6 ochre by age,
 *  7..11 the pale arrival ramp */
export const NF1 = FRESH_YEARS + 1 + ARRQ;

/** haze quantisation for the colour table. Haze is a smooth function of depth,
 *  so it quantises to 16 steps invisibly (0.016 of a blend per step). */
export const HZL = 16;
export const TONE_COOL = "#8b909c";
export const TONE_WARM = "#c99a5e";

// ── the colour tables ───────────────────────────────────────────────────────

export interface Palette {
  readonly roof: readonly string[];
  readonly wall: readonly string[];
}

export interface ColourTables {
  /** `ROOF.length * HZL * 3` — the three roof tones */
  readonly roof: string[];
  /** `WALL.length * HZL * 4` — four wall values */
  readonly wall: string[];
  /** with the ochre and the arrival ramp folded in */
  readonly roofF: string[];
  readonly wallF: string[];
}

let clutKey = "";
let tables: ColourTables | null = null;

/**
 * Every block used to run two `lerpHex()` and two `shade()` per frame — 19,000
 * string parses at whole-city zoom, before a single pixel was filled. Haze is a
 * smooth function of depth, so it quantises to 16 steps invisibly and the whole
 * palette collapses to one table built once per zoom level.
 *
 * `CL_ARR` IS DEAD in the mock. It has exactly two occurrences in the whole
 * tree — its own declaration and its allocation — and nothing ever reads or
 * writes an element of it. At 21 roofs x 21 walls it was a 2 MB backing store
 * thrown away on every haze-key change; with sixteen materials appended it
 * would have been 6 MB. **Not ported, and this note is the record of why.**
 */
export function colourLUT(
  pal: Palette,
  fadeAmt: number,
  camStep: number,
): ColourTables {
  const gain = COVER_GAIN[camStep] ?? 1;
  const key = fadeAmt.toFixed(4) + "|" + gain;
  if (key === clutKey && tables) return tables;
  clutKey = key;
  const ROOF = pal.roof,
    WALL = pal.wall;
  const roof = new Array<string>(ROOF.length * HZL * 3);
  const wall = new Array<string>(WALL.length * HZL * 4);
  for (let c = 0; c < ROOF.length; c++)
    for (let z = 0; z < HZL; z++) {
      const base = shade(lerpHex(ROOF[c], HAZE, (fadeAmt * z) / (HZL - 1)), gain);
      const o = (c * HZL + z) * 3;
      /* ART-SPEC §7.3: a few per cent of value between neighbours is invisible.
         These three run ~30 % apart in value AND part in hue — one pulled cool,
         one pulled toward the warm ochre — because that is what makes two
         houses next door to each other read as two houses and not as one long
         roof. */
      roof[o] = shade(lerpHex(base, TONE_COOL, 0.13), 0.84);
      roof[o + 1] = base;
      roof[o + 2] = shade(lerpHex(base, TONE_WARM, 0.13), 1.11);
    }
  for (let c = 0; c < WALL.length; c++)
    for (let z = 0; z < HZL; z++) {
      const base = shade(lerpHex(WALL[c], HAZE, (fadeAmt * z) / (HZL - 1)), gain);
      const o = (c * HZL + z) * 4;
      /* Four wall values, not two. The lattice had exactly two wall normals per
         frame so two tones covered it; a real block has as many as it has
         edges, and a graded ramp is what stops an angled Mission block or a
         curved Twin Peaks block from reading as a cardboard box.
         THE LIGHT IS TWO COLOURS — the four steps run from a wall turned away
         from the key light to one turned toward it, so they run from sky-lit to
         sun-lit. Same four values; a different colour at each end. */
      for (let q = 0; q < 4; q++)
        wall[o + q] = skylit(base, 0.66 + 0.1 * q, qTilt(q));
    }
  const t: ColourTables = { roof, wall, ...freshLUT(pal, fadeAmt, gain, roof, wall) };
  tables = t;
  return t;
}

/**
 * The same table again, with the OCHRE OF NEW CONSTRUCTION folded in.
 *
 * A building keeps the fresh tint for `FRESH_YEARS`, and `age` is an integer,
 * so there are only six tints in the whole model. Six is a lookup table, not a
 * per-building `lerpHex` — and **once the colour is a table index the building
 * can go into a BATCHED PATH with every other building of the same colour
 * instead of paying for its own `fill()`.** That is what makes the 1907-12
 * rebuild, when thousands of buildings are inside their six ochre years at
 * once, cost the same as any other frame.
 *
 * And the ARRIVAL RAMP: a building that is mid-rise lands PALE and settles into
 * its own colour, so the wave reads as construction rather than as a switch
 * being thrown. That used to be a per-building `lerpHex`, which forced every
 * rising building onto its own `fill()` — and in 1908 the cohort is thousands
 * of buildings, which is exactly why the rebuild frames were the slowest in the
 * piece. The ramp is five steps, five steps is a table, and a table index is a
 * batch key.
 */
function freshLUT(
  pal: Palette,
  fadeAmt: number,
  gain: number,
  roof0: readonly string[],
  wall0: readonly string[],
): { roofF: string[]; wallF: string[] } {
  const ROOF = pal.roof,
    WALL = pal.wall;
  const roofF = new Array<string>(ROOF.length * HZL * NF1);
  const wallF = new Array<string>(WALL.length * HZL * NF1 * 4);
  for (let f = 1; f <= FRESH_YEARS; f++) {
    const fr = Math.pow(1 - (f - 1) / FRESH_YEARS, 1.4);
    for (let z = 0; z < HZL; z++) {
      const hz = (fadeAmt * z) / (HZL - 1);
      for (let c = 0; c < ROOF.length; c++) {
        let r = lerpHex(ROOF[c], FRESH, fr * 0.55);
        if (hz > 0.004) r = lerpHex(r, HAZE, hz);
        roofF[(c * HZL + z) * NF1 + f] = shade(r, gain);
      }
      for (let c = 0; c < WALL.length; c++) {
        let w = lerpHex(WALL[c], FRESH, fr * 0.42);
        if (hz > 0.004) w = lerpHex(w, HAZE, hz);
        const o = ((c * HZL + z) * NF1 + f) * 4;
        for (let q = 0; q < 4; q++)
          wallF[o + q] = skylit(w, (0.66 + 0.1 * q) * gain, qTilt(q));
      }
    }
  }
  for (let z = 0; z < HZL; z++) {
    for (let c = 0; c < ROOF.length; c++)
      roofF[(c * HZL + z) * NF1] = roof0[(c * HZL + z) * 3 + 1];
    for (let c = 0; c < WALL.length; c++) {
      const o = (c * HZL + z) * NF1 * 4;
      for (let q = 0; q < 4; q++) wallF[o + q] = wall0[(c * HZL + z) * 4 + q];
    }
  }
  for (let a = 0; a < ARRQ; a++) {
    const f = FRESH_YEARS + 1 + a,
      tt = (a + 0.5) / ARRQ;
    for (let z = 0; z < HZL; z++) {
      const hz = (fadeAmt * z) / (HZL - 1);
      for (let c = 0; c < ROOF.length; c++) {
        let r = lerpHex(lerpHex(ROOF[c], "#c9bda9", tt * 0.6), FRESH, 0.55);
        if (hz > 0.004) r = lerpHex(r, HAZE, hz);
        roofF[(c * HZL + z) * NF1 + f] = shade(r, gain);
      }
      for (let c = 0; c < WALL.length; c++) {
        let w = lerpHex(lerpHex(WALL[c], "#f3ecdd", tt * 0.55), FRESH, 0.42);
        if (hz > 0.004) w = lerpHex(w, HAZE, hz);
        const o = ((c * HZL + z) * NF1 + f) * 4;
        for (let q = 0; q < 4; q++)
          wallF[o + q] = skylit(w, (0.66 + 0.1 * q) * gain, qTilt(q));
      }
    }
  }
  return { roofF, wallF };
}

let mlutKey = "";
let massTables: { mass: string[]; mwall: string[] } | null = null;

export function massLUT(
  pal: Palette,
  fadeAmt: number,
): { mass: string[]; mwall: string[] } {
  const key = fadeAmt.toFixed(4);
  if (key === mlutKey && massTables) return massTables;
  mlutKey = key;
  const ROOF = pal.roof,
    WALL = pal.wall;
  const mass = new Array<string>(ROOF.length * HZL * (FRESH_YEARS + 1));
  const mwall = new Array<string>(WALL.length * HZL * (FRESH_YEARS + 1) * 4);
  for (let f = 0; f <= FRESH_YEARS; f++) {
    const fr = f === 0 ? 0 : Math.pow(1 - (f - 1) / FRESH_YEARS, 1.4);
    for (let z = 0; z < HZL; z++) {
      const hz = (fadeAmt * z) / (HZL - 1);
      for (let c = 0; c < ROOF.length; c++) {
        let t = ROOF[c];
        if (fr > 0) t = lerpHex(t, FRESH, fr * 0.5);
        if (hz > 0.004) t = lerpHex(t, HAZE, hz);
        mass[(c * HZL + z) * (FRESH_YEARS + 1) + f] = shade(t, MASS_GAIN);
      }
      for (let c = 0; c < WALL.length; c++) {
        let t = WALL[c];
        if (fr > 0) t = lerpHex(t, FRESH, fr * 0.42);
        if (hz > 0.004) t = lerpHex(t, HAZE, hz);
        const o = ((c * HZL + z) * (FRESH_YEARS + 1) + f) * 4;
        for (let k = 0; k < 4; k++)
          mwall[o + k] = skylit(t, (0.7 + 0.09 * k) * MASS_GAIN, qTilt(k));
      }
    }
  }
  massTables = { mass, mwall };
  return massTables;
}

// ── painter's order ─────────────────────────────────────────────────────────

export interface BldOrder {
  readonly order: Int32Array;
  readonly hi: number;
  readonly k: number;
  readonly range: readonly [number, number];
}

/**
 * A counting sort over 8,192 depth buckets. Ordering by `depth()` is exact to
 * within one bucket, and the whole point is that it is O(n) over 166,166
 * buildings once per bearing rather than an O(n log n) every frame.
 */
export function buildBldOrder(depth: Float32Array): BldOrder {
  const n = depth.length;
  let lo = 1e18,
    hi = -1e18;
  for (let i = 0; i < n; i++) {
    const d = depth[i];
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const NBU = 8192,
    k = (NBU - 1) / (hi - lo || 1);
  const cnt = new Uint32Array(NBU + 1);
  const bi = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const b = ((hi - depth[i]) * k) | 0;
    bi[i] = b;
    cnt[b + 1]++;
  }
  for (let b = 0; b < NBU; b++) cnt[b + 1] += cnt[b];
  const ord = new Int32Array(n);
  for (let i = 0; i < n; i++) ord[cnt[bi[i]]++] = i;
  return { order: ord, hi, k, range: [lo, hi] };
}

/**
 * THE BUCKETING IS ALSO WHY A LANDMARK NEEDS ITS OWN FLUSH DEPTH.
 *
 * The city draw flushes a mark when it meets the first building EXACTLY nearer
 * than the mark's depth, and inside a bucket the buildings are in Hilbert
 * order, not depth order. So a mark keyed to its own building's exact depth
 * flushes at whichever bucket-mate happens to come first — which may be several
 * buildings BEFORE the one it is marking, and that building then paints the
 * fabric's roof straight back over it.
 *
 * MEASURED: City Hall's mark fired at building 6,179 of the stream and
 * something filled `#6f6b61` over it at 6,182; **139 of its 2,360 pixels
 * survived**, and it came out grey in the screenshot while the Civic
 * Auditorium, whose bucket happened to order the other way, came out blue in
 * the same frame.
 *
 * `bucketFloor()` returns the depth of the FAR EDGE of the next bucket down, so
 * a mark keyed to it lands after every building its own bucket holds and before
 * every building in the next one. Keyed to the bucket floor the survival is
 * **54 %**, the rest being honest occlusion by buildings that really are in
 * front.
 *
 * WHICH LANDMARK WITNESSES THIS IS NOT TYPED, AND USED TO BE: at 210 deg all
 * three footprinted landmarks were caught; at 315 deg the buckets are thin
 * east-west strips and City Hall's own building sorts BEFORE its mark's flush
 * point (stream index 28,424 against 28,449), so City Hall survives either way
 * and proves nothing. Moscone does not: 21,562 against 21,557, and it keeps
 * 0 % against 93 %.
 */
export function bucketFloor(o: BldOrder, depthI: number): number {
  const b = ((o.hi - depthI) * o.k) | 0;
  return o.hi - (b + 1) / o.k;
}

// ── the massing table ───────────────────────────────────────────────────────

export interface Massing {
  readonly off: Uint32Array;
  /** year - `year0`, one byte */
  readonly ty: Uint8Array;
  /** coverage, one byte over 0..255 */
  readonly tc: Uint8Array;
  /** area-weighted mean height, metres, one byte */
  readonly th: Uint8Array;
  /** one bit per building: is it a SOLO? */
  readonly solo: Uint8Array;
  readonly year0: number;
}

export function massingOf(chunk: Chunk, year0: number): Massing {
  const f = chunk.fields;
  return {
    off: f.off as Uint32Array,
    ty: f.ty as Uint8Array,
    tc: f.tc as Uint8Array,
    th: f.th as Uint8Array,
    solo: f.solo as Uint8Array,
    year0,
  };
}

export function isSolo(m: Massing, i: number): boolean {
  return ((m.solo[i >> 3] >> (i & 7)) & 1) === 1;
}

export interface MassRow {
  readonly cov: Uint8Array;
  readonly hgt: Uint8Array;
  readonly yr: Int16Array;
  /** the state BEFORE this year's row, so a block that gains buildings can grow
   *  into its new mass instead of stepping into it */
  readonly cov0: Uint8Array;
  readonly hgt0: Uint8Array;
  /** the blocks that gained something THIS YEAR, in painter's order */
  readonly cohort: Int32Array;
}

/**
 * THE BLOCK'S ROW FOR THIS YEAR.
 *
 * Each block's timeline is a handful of rows (median 8) and the year only
 * changes 113 times in the whole film, so the whole table is resolved once per
 * year into flat arrays rather than binary-searched per block per frame.
 *
 * THE COHORT: the arrival overlay needs it and it needs it badly. **The overlay
 * paints over an already-painted city, and a massing solid is drawn at an ALPHA
 * equal to its coverage, so painting the whole city's massing twice composites
 * `cov` twice and lands at `1-(1-cov)^2` instead of `cov`.** The screenshot of
 * that mistake is the 1948 frame with the entire peninsula gone warm and heavy.
 * Only the blocks that actually changed are repainted, and on those the
 * doubling is the arrival reading a little heavier while it lands, which is
 * what an arrival should do.
 */
export function massAt(
  m: Massing,
  nBlocks: number,
  iy: number,
  blockOrder: Int32Array,
): MassRow {
  const cov = new Uint8Array(nBlocks),
    hgt = new Uint8Array(nBlocks),
    yr = new Int16Array(nBlocks),
    cov0 = new Uint8Array(nBlocks),
    hgt0 = new Uint8Array(nBlocks);
  const y8 = iy - m.year0;
  for (let b = 0; b < nBlocks; b++) {
    const s = m.off[b],
      e = m.off[b + 1];
    let c = 0,
      h = 0,
      yy = -32768,
      c0 = 0,
      h0 = 0;
    for (let r = s; r < e; r++) {
      if (m.ty[r] > y8) break;
      c0 = c;
      h0 = h;
      c = m.tc[r];
      h = m.th[r];
      yy = m.ty[r] + m.year0;
    }
    cov[b] = c;
    hgt[b] = h;
    yr[b] = yy;
    cov0[b] = c0;
    hgt0[b] = h0;
  }
  const co: number[] = [];
  for (let o = 0; o < blockOrder.length; o++) {
    const b = blockOrder[o];
    if (yr[b] === iy) co.push(b);
  }
  return { cov, hgt, yr, cov0, hgt0, cohort: Int32Array.from(co) };
}

// ── the block ring ──────────────────────────────────────────────────────────

export interface BlockGeometry {
  /** vertex offset per block, length n+1 */
  readonly off: Uint32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  /** per-vertex inward normal, unit */
  readonly inx: Float32Array;
  readonly iny: Float32Array;
  /** largest safe inset, per block */
  readonly maxInset: Float32Array;
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly z: Uint16Array;
  readonly n: number;
}

/**
 * THE BLOCK'S OWN MEASURED OUTLINE, inset toward its interior so the
 * right-of-way between two blocks reads as a street. World metres.
 *
 * **1.35 px of EXTRA street inset at the massing tier was measured and
 * rejected.** An assessor block already excludes the right-of-way, so two
 * neighbouring rings are ~21 m apart — 1.43 px at whole-city zoom, already over
 * the 1.35 px VISUAL-SPEC §4.5 asks a street to hold. Insisting on more ate
 * 19.8 m off every edge and the Sunset came out as thin stripes with ground
 * between them. **It is a 1.5 m hairline now.**
 *
 * Median 4 vertices, mean 6.9, max 388 (the Presidio) — so nothing downstream
 * may assume four corners.
 */
/**
 * THE MASSING SOLID'S OWN SKYLINE, AND THE ONE NUMBER THAT DECIDES IT.
 *
 * `drawMassing` painted the block's ring at its own mean height and stopped —
 * so at the whole-city camera, the first frame anyone sees and the one the
 * film opens on, San Francisco was **4,908 lids lying at their own heights
 * with nothing under any of them.** `mwall` was built by `massLUT` every
 * frame, `wallIdx` was allocated and passed by `paintMassing` every frame, and
 * `drawMassing` ended `void wallIdx;`. Both halves of the side of the city
 * were written, tested and called by nobody.
 *
 * **0.9 CSS px of projected wall, PER BLOCK.** The reference's own number and
 * its own reason: *"the extrusion is only added when it is worth a pixel: the
 * median block's mean height is 7 m, which projects 0.4 px of wall at the
 * whole-city camera, and adding that to five thousand blocks is a vertical
 * comb, not a city. Downtown, where the mean is 40 m and up, keeps its rise."*
 *
 * Measured on the shipped payload at the whole-city camera (`.parity/g1city.py`,
 * `kh` = 0.0747 px per metre of height), over the 4,908 blocks that carry any
 * coverage in 2018:
 *
 * ```
 *   projected wall dh   p10 0.448   p50 0.523   p90 0.821   p99 1.195   max 1.419 px
 *   over 0.9 px         253 blocks — 5.15 % of blocks, 3.90 % of block area
 * ```
 *
 * So the gate keeps **the 5 % that is downtown** and refuses the other 95 %,
 * which is the whole point: *the difference between San Francisco and any
 * other grey blob at this zoom is that it has a skyline.* It is a CUT-OFF and
 * not a floor — a block under it draws exactly the plate it drew before, never
 * a wall squeezed to a minimum.
 *
 * And it costs nothing anywhere else: `paintMassing` returns at
 * `alpha = 1 - tierW(z) <= 0.004`, which is `z >= LOD_Z1` = 2.35, so this
 * whole pass exists only between the whole-city stop and the district one.
 */
export const MASS_WALL_PX = 0.9;

/** the block ring's projected top, reused across blocks — max 388 (Presidio) */
const massTX = new Float32Array(512);
const massTY = new Float32Array(512);

export const BLOCK_INSET_M = 1.5;

export function blockRing(
  g: BlockGeometry,
  i: number,
  inset: number,
): [number, number][] {
  const o = g.off[i],
    n = g.off[i + 1] - o;
  const t = Math.min(inset || 0, g.maxInset[i]);
  const r: [number, number][] = new Array(n);
  for (let k = 0; k < n; k++)
    r[k] = [g.rx[o + k] + g.inx[o + k] * t, g.ry[o + k] + g.iny[o + k] * t];
  return r;
}

// ── the draw ────────────────────────────────────────────────────────────────

export interface CityDrawOptions {
  readonly z: number;
  readonly year?: number;
  /** how far through its arrival the year's cohort is; 1 when the clock is
   *  not running, which is what a scrub, a deep link and the cached layer
   *  all need */
  readonly risePh?: number;
  /** the frame's aerial fade */
  readonly fadeAmt?: number;
  readonly camStep?: number;
}

export interface CityDrawResult {
  readonly buildings: number;
  readonly near: number;
  readonly massed: number;
  /** the ladder's weight this frame */
  readonly W_B: number;
}

/**
 * The massing tier, painted at the coverage alpha.
 *
 * WHAT THE MASSING SOLID IS, AND WHAT IT IS NOT. It is the block's OWN
 * published assessor ring — the same 5,404 polygons the hit test uses — inset
 * by the same street channel, extruded to the AREA-WEIGHTED MEAN of the LIDAR
 * heights of the buildings standing on it in that year, and toned by that
 * year's MEASURED BUILT COVERAGE. Nothing here is invented: `build_lod.py`
 * joins the 166,166 published footprints to the 5,404 published blocks **by
 * containment of the footprint's own centroid**, and every row of the table is
 * keyed to a year that is in the assessor's roll.
 *
 * Containment and nothing else: a "nearest block" rule would put a pier, a
 * Presidio barracks or a Golden Gate Park structure inside whichever block
 * happened to be closest and then draw it there.
 *
 * WHAT IS NEVER AGGREGATED. A SOLO is drawn as itself at every zoom: 13,814
 * buildings that stand on land the assessor does not divide into blocks
 * (measured median 31.6 m from the nearest block ring, so this is not a
 * rounding gap), and 1,753 buildings at least 20 m high **at their derived
 * top**. A block's coverage and mean height are computed over its NON-solo
 * members, so nothing is counted twice.
 *
 * The tall test reads `max(base, the derived top)`, not the base: the Ferry
 * Building publishes a 15.2 m median over a 71.4 m maximum, and a test on the
 * base folds its clock tower into a block mean and the waterfront loses its
 * silhouette.
 */
export function drawMassing(
  f: Frame,
  t: TerrainField,
  g: BlockGeometry,
  row: MassRow,
  order: Int32Array,
  colours: { mass: string[]; mwall: string[] },
  roofIdx: Uint8Array,
  wallIdx: Uint8Array,
  opts: { readonly alpha: number; readonly fadeAmt: number },
): number {
  const { ctx } = f;
  if (opts.alpha <= 0.004) return 0;
  // one bucket per (colour, coverage step, freshness) — because one fill()
  // carries one alpha, the alpha HAS to be a batch key
  const roofBuckets = new Map<number, Path2D>();
  const wallBuckets = new Map<number, Path2D>();
  const alphas = new Map<number, number>();
  const cf = f.proj.coeffs();
  const lmax = Math.hypot(cf.ax, cf.ay) || 1;
  /** px per metre of BUILT HEIGHT — `projb` adds `h * zexb` to the plane's
   *  second coordinate, so this is neither of the two ground factors. */
  const kh = f.proj.zexb * f.cam.scale;
  let n = 0;
  for (let o = 0; o < order.length; o++) {
    const b = order[o];
    const cov = row.cov[b] / 255;
    if (cov <= 0) continue;
    const h = row.hgt[b];
    const ring = blockRing(g, b, BLOCK_INSET_M);
    if (!ring.length) continue;
    const q = Math.max(0, Math.min(COVQ - 1, Math.floor(cov * COVQ)));
    const fresh = 0;
    const key = (roofIdx[b] * HZL + 0) * COVQ * (FRESH_YEARS + 1) + q * (FRESH_YEARS + 1) + fresh;
    let p = roofBuckets.get(key);
    if (!p) {
      p = new Path2D();
      roofBuckets.set(key, p);
      alphas.set(key, COVA[q] * opts.alpha);
    }
    const zg = t.elevM(g.cx[b], g.cy[b]);
    const nk = ring.length;
    for (let k = 0; k < nk; k++) {
      const pr = f.proj.projb(ring[k][0], ring[k][1], zg, h);
      const X = sx(f, pr), Y = sy(f, pr);
      massTX[k] = X;
      massTY[k] = Y;
      if (k) p.lineTo(X, Y);
      else p.moveTo(X, Y);
    }
    p.closePath();

    /* ── THE SKYLINE ──────────────────────────────────────────────────
       See `MASS_WALL_PX`. The top plate above is a plate: at whole-city zoom
       the city was 4,908 lids lying at their own mean height with nothing
       under any of them, and a mass with no side has no silhouette.

       The extrusion is added ONLY where it is worth a pixel, and the gate is
       PER BLOCK, so the Sunset stays a plate and downtown stands up. Same
       front-face rule the buildings use — at this bearing a solid shows its
       top and the edges whose projected run goes right — and the same
       `planeQuartile` off the same coefficients, so a block and a building of
       the same orientation take the same lambert bucket by construction.

       `dh` is added DOWNWARD from the top ring rather than the top being
       lifted off a base ring: screen x carries no height, so the base of a
       vertical edge is its top plus `dh` in screen y, exactly, with no second
       projection per vertex. */
    const dh = h * kh;
    if (dh > MASS_WALL_PX) {
      const wo = ((wallIdx[b] * COVQ + q) * (FRESH_YEARS + 1) + fresh) * 4;
      for (let k = 0; k < nk; k++) {
        const u = (k + 1) % nk;
        if (massTX[u] - massTX[k] <= 0) continue; // turned away from the camera
        const lam = planeQuartile(
          ring[u][0] - ring[k][0], ring[u][1] - ring[k][1],
          cf.ax, cf.ay, lmax,
        );
        const wk = (wo + lam) * COVQ + q;
        let wp = wallBuckets.get(wk);
        if (!wp) {
          wp = new Path2D();
          wallBuckets.set(wk, wp);
          alphas.set(-wk - 1, COVA[q] * opts.alpha);
        }
        wp.moveTo(massTX[k], massTY[k]);
        wp.lineTo(massTX[u], massTY[u]);
        wp.lineTo(massTX[u], massTY[u] + dh);
        wp.lineTo(massTX[k], massTY[k] + dh);
        wp.closePath();
      }
    }
    n++;
  }
  ctx.save();
  /* THE WALLS FIRST, then the roofs over them — a lid is above its own side
     and painter's order inside one block is not negotiable. The mock flushes
     in this order for the same reason (`massFlush`). */
  for (const [wk, p] of wallBuckets) {
    ctx.globalAlpha = alphas.get(-wk - 1) ?? 1;
    ctx.fillStyle = colours.mwall[(wk / COVQ) | 0] ?? "#c0b49a";
    ctx.fill(p);
  }
  for (const [key, p] of roofBuckets) {
    ctx.globalAlpha = alphas.get(key) ?? 1;
    const ci = Math.floor(key / (HZL * COVQ * (FRESH_YEARS + 1)));
    ctx.fillStyle =
      colours.mass[(ci * HZL + 0) * (FRESH_YEARS + 1)] ?? "#9a9384";
    ctx.fill(p);
  }
  ctx.restore();
  return n;
}

/**
 * Whether building `i` is drawn as a building this frame, or left to the
 * massing tier.
 *
 * **This is the dither.** A SOLO is always a building — it has no block to be
 * aggregated onto.
 */
export function drawnAsBuilding(
  urnd: Float32Array,
  m: Massing,
  i: number,
  W_B: number,
): boolean {
  if (W_B >= 1) return true;
  if (isSolo(m, i)) return true;
  return urnd[i] < W_B;
}

// ═══ P4b — the draw entry points the footprint tier was missing ═════════════
//
// `drawCity()` was never ported: `DRAW.md` §5's module table lists the rules
// and no draw, and the shell's first footprint loop was written against the
// rules as a stated SIMPLIFICATION. These are the rungs it did not carry,
// added here as entry points rather than re-derived at the call site, so the
// rule and the drawing that obeys it stay in one file.
//
// The loop itself stays in `components/us/city/scene.ts` and cannot move here:
// it needs `facades.ts`, and `facades.ts` imports FROM this module. Nothing in
// `DRAW.md`'s order may import upward.

/**
 * THE CONTACT SHADOW, AND THE ONE THING IT IS NOT.
 *
 * `part3.html` §8990: *"contact shadow, thrown down-LEFT from the fixed
 * upper-right key light. Without it a building floats; with it the fabric has
 * depth at 4 px."* It is the single highest-yield mark on this map at street
 * zoom and it was the last thing missing from the fabric.
 *
 * **It is not the mock's `sunCast` pass.** That is a different, larger object:
 * a full-resolution mask canvas built in depth order with every drawn body
 * punched back out of it, blitted over the composited frame under
 * `globalCompositeOperation = "difference"`. It is the right thing for a film
 * that wants a hill's shadow lying across the valley below it, and its own
 * comment records what it costs — a full-resolution blit every frame.
 *
 * This is `drawCity`'s OWN fallback, the `else if (px > SHADOW_MIN_PX && h > 2)`
 * branch, and it is composited **into the city layer** at the depth band's
 * flush rather than blitted over it. That is what makes it free: it is one
 * extra `fill()` per depth band on a path that is already being built, against
 * one full-frame `drawImage` per frame.
 *
 * **The offsets are the mock's, to the digit**, and both are clamped: a tower
 * throwing a shadow proportional to its height would lay a 200 px bar across
 * downtown at street zoom.
 */
export const SHADOW_FILL = "rgba(72,60,42,0.16)";

/**
 * WHERE THE SUN IS, AS ONE PAIR OF NUMBERS, IN ONE PLACE.
 *
 * These two were literals inside `shadowOffset` and nowhere else, so the
 * second thing in the renderer that needed to know which way the key light
 * throws — the parapet's shadow on its own deck, `roofs.ts` `DE.castv` — would
 * have had to re-type them, and two typed copies of one light is how a city
 * ends up with a building's shadow going one way and its parapet's the other.
 * Exported and imported instead. **`shadowOffset`'s arithmetic is unchanged.**
 */
export const KEY_DX = 0.34;
export const KEY_DY = 0.20;

/** down-LEFT, from the fixed upper-right key light. `[ox, oy]`, CSS px. */
export function shadowOffset(hM: number, k2: number): readonly [number, number] {
  return [Math.min(9, hM * k2 * KEY_DX), Math.min(7, hM * k2 * KEY_DY)];
}

/**
 * ONE PATH FOR THE WHOLE BAND, AND THE REASON IS NOT SPEED.
 *
 * `SHADOW_FILL` is translucent, so two shadows filled separately where they
 * cross composite twice and the overlap comes out a step darker than either —
 * a doubling you can see from the back of a room. Accumulated into ONE
 * `Path2D` and filled once, the nonzero rule unions them for free.
 *
 * That is safe here for the reason the mock states: **every published footprint
 * ring in this file has positive signed area** (166,166 of 166,166;
 * `sun/functional_sun.py` SU2), so same-sign subpaths cannot cancel each other
 * into holes.
 */
export function addContactShadow(
  p: Path2D,
  bx: ArrayLike<number>,
  by: ArrayLike<number>,
  n: number,
  ox: number,
  oy: number,
): void {
  p.moveTo(bx[0] - ox, by[0] + oy);
  for (let k = 1; k < n; k++) p.lineTo(bx[k] - ox, by[k] + oy);
  p.closePath();
}

/** one fill, one colour, at the band's own flush — see `addContactShadow` */
export function fillContactShadow(f: Frame, p: Path2D): void {
  const { ctx } = f;
  const prev = ctx.fillStyle;
  ctx.fillStyle = SHADOW_FILL;
  ctx.fill(p);
  ctx.fillStyle = prev;
}

/**
 * THE AREA-PRESERVING RECTANGLE — the `RECT_SCALE` rung's whole silhouette.
 *
 * `part3.html` §1298: *"A bounding box circumscribes the shape, so drawing the
 * box would thicken every building by ~30 % of its area and close up the
 * streets between them; scaling it back to the true area keeps the fabric's
 * coverage right, which at this zoom is the only property of a building the
 * reader can actually see."*
 *
 * Same centre, same bounding-box proportions, the same PROJECTED AREA as the
 * real footprint. Everything is in projected units, so the caller may pass
 * either world-projected or screen values as long as all three agree.
 */
export function areaRect(
  areaProj: number,
  bw: number,
  bh: number,
): readonly [number, number] {
  const w = bw || 0.1;
  const h = bh || 0.1;
  const s = Math.sqrt(areaProj / (w * h)) || 1;
  return [w * s, h * s];
}

/**
 * THE FOUR EXTREME VERTICES — the `QUAD_PX` rung, and it is **not** a bounding
 * box either.
 *
 * `part3.html` §1290: *"each building is drawn through the FOUR VERTICES OF
 * ITS OWN OUTLINE that are extreme in the projected frame — leftmost, topmost,
 * rightmost, bottommost. Not a bounding box: every corner is a real vertex of
 * the real footprint, so the shape keeps its orientation and its proportions
 * and only loses detail between those four points."*
 *
 * Returned left, top, right, bottom, **which is a convex cycle in screen
 * order**, so the quad never self-intersects however odd the footprint is.
 * Screen y grows downward, so "top" is the minimum of `py`.
 */
export function extremeQuad(
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  n: number,
  out: Int32Array,
): void {
  let kl = 0, kt = 0, kr = 0, kb = 0;
  for (let k = 1; k < n; k++) {
    if (px[k] < px[kl]) kl = k;
    if (px[k] > px[kr]) kr = k;
    if (py[k] < py[kt]) kt = k;
    if (py[k] > py[kb]) kb = k;
  }
  out[0] = kl; out[1] = kt; out[2] = kr; out[3] = kb;
}

/**
 * THE TINT DIMENSION OF THE BATCH KEY — `colourLUT`'s `roofF`/`wallF` index.
 *
 * `freshLUT` has shipped the ochre and the arrival ramp since P3 and nothing
 * read them, so every building on this map was drawn at index 0. The two
 * things they carry are the whole reason the tables are `NF1` wide:
 *
 * - **the ochre of new construction**, `1..FRESH_YEARS`, decaying over six
 *   years so a run of empty years still shows a wave of construction moving
 *   across the map;
 * - **the arrival ramp**, `FRESH_YEARS+1 .. NF1-1`, five steps: a building
 *   that is mid-rise lands PALE and settles into its own colour, so a cohort
 *   reads as construction rather than as a switch being thrown.
 *
 * `rise` is the per-building entrance curve. **The stagger it exists for is
 * P5's** — the film owns the clock, and with no clock running every building
 * this year is simply `rise = 1`, which is what a scrub, a deep link and the
 * cached layer all need. Quantised to `ARRQ` steps here for the same reason
 * the table is a table: *a table index is a batch key*, and a per-building
 * `lerpHex` would force every rising building onto its own `fill()`.
 */
export function tintIndex(age: number, rise: number): number {
  if (rise < 0.999)
    return FRESH_YEARS + 1 + Math.min(ARRQ - 1, ((1 - rise) * ARRQ) | 0);
  return age >= 0 && age < FRESH_YEARS ? age + 1 : 0;
}

/**
 * THE STREAM, IN PAINTER'S ORDER, AND WHY THE SHELL HAD TO GROW ONE.
 *
 * The first footprint loop walked the visible `bldg` chunks in arrival order
 * and each chunk in its own Hilbert order. Hilbert order is spatially coherent
 * and it is **not depth order**, so a near building could be drawn before a far
 * one and the far one then painted its roof over it. Nothing threw, the suite
 * stayed green, and the fabric lost the one cue that says which of two
 * overlapping roofs is in front.
 *
 * `buildBldOrder` is the counting sort this file already ships for exactly
 * this, and it is O(n) over 8,192 buckets. What it cannot be here is *cached
 * per bearing*: the visible set changes as chunks arrive and as the camera
 * moves, so the sort is per rasterisation — which is the frame that can afford
 * it, because a gesture is served from a blit.
 *
 * Returns the permutation and the bucket geometry `bucketFloor` needs, so a
 * landmark can be flushed at its own bucket's floor rather than at its own
 * depth. **That distinction is not cosmetic** — see `bucketFloor`, where a mark
 * keyed to its own building's exact depth kept 0 % of its pixels against 93 %.
 */
export function streamOrder(depth: Float32Array): BldOrder {
  return buildBldOrder(depth);
}
