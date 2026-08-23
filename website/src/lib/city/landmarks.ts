/**
 * landmarks.ts — the authored heroes, the shaped caps, the bridge.
 *
 * Block P3. Ported from `gen/part3.html` §HERO (`heroDraw`, `heroSolid`,
 * `heroArcade`, `heroRib`, `heroEmph`, `heroPlan`, `heroZ`, `heroGate`),
 * §BLOCK LR (`lrStep`, `lrTaper`, `lrBridge`) and `drawLandmark`, with
 * `hero/BLOCK-HERO.md`, `wonder/BLOCK-WONDER.md` and `marks/BLOCK-N.md`.
 *
 * ── NOTHING HERE IS A SPRITE, AND THE REASON IS STRUCTURAL ──────────────
 * `art/` holds **thirteen hand-drawn landmark sprites that were built and then
 * deleted**, and the suite asserts they are absent on purpose: they *"flew
 * around"* during a zoom. They were authored on their own projection at their
 * own vertical exaggeration, they carried a pixel floor, and they were
 * composited over the fabric rather than into it.
 *
 * A hero is not drawn as a layer over the city — **it replaces the prism
 * inside the city draw's own near path**, at that building's own place in
 * painter's order, under the contact shadow the fabric has already thrown for
 * it. So it inherits the year gate, the depth bucket, the aerial fade, the
 * subject fade, the arrival ramp and the rise animation, **because those are
 * properties of the call site and not of the drawing.**
 *
 * The sprites were judged again, and the verdict is worth carrying: the sprite
 * is the better *drawing* — a warm cream body, a big gilt dome, an ink outline
 * — and it still cannot ship, for four reasons. It is on the wrong projection
 * *permanently* (authored at ROT 210 with basis vectors A = (1.0593, -0.3549),
 * B = (0.6148, 0.6116); the map has been north-up at 315 since the handover).
 * It cannot turn. It sits on the city rather than in it. And it carries no year
 * gate and no measured record. **So the authored geometry wins, and the
 * sprites' art direction wins — the right answer was never one or the other.**
 */

import { type Frame, lerpHex, shade, skylit, sx, sy } from "./terrain";

// ── the vocabulary ──────────────────────────────────────────────────────────

/**
 * ```
 * SOLID   a ring swept between z0 and z1 by a profile (u, s). A prism is
 *         [(0,1),(1,1)]; a dome, a spire, a cornice, a lantern and a set-back
 *         crown are the same primitive with a different profile. An optional
 *         `tilt` displaces the top.
 * ARCADE  repeated openings ON the visible walls of a ring — arches, windows,
 *         a clock face. Cut into the wall; nothing is added to the silhouette.
 * RIB     meridians stroked over the same swept ring — a dome's ribs, a
 *         shaft's flutes.
 * ```
 */
export type PartKind = "solid" | "arcade" | "rib";

export interface HeroProfile {
  /** height fraction, monotone in [0,1] */
  readonly u: number;
  /** radius scale, non-negative */
  readonly s: number;
}

export interface HeroPart {
  readonly kind: PartKind;
  readonly z0: number;
  readonly z1: number;
  readonly profile: readonly HeroProfile[];
  /** the part's own ring, world metres, relative to the anchor */
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  /** material index into the hero material table */
  readonly mat: number;
  /** the part's own cut-off, in CSS px of its own projected size. A part under
   *  it is NOT DRAWN, never held at a minimum. */
  readonly min: number;
}

export interface Hero {
  /** the shipped building index this hero replaces */
  readonly bi: number;
  readonly name: string;
  /** the year, and which register gives it */
  readonly year: number;
  readonly yearSource: string;
  /** what is MEASURED, in words, and what is DRAWN */
  readonly measured: string;
  readonly drawn: string;
  /** the register that anchors it to this footprint */
  readonly anchor: string;
  /** measured top, metres */
  readonly top: number;
  /** the roofline — the top of the building's own BULK */
  readonly zr: number;
  /** the accent, or null where the crown carries no chroma */
  readonly accent: string | null;
  /** Sutro Tower alone: the containment reference is the ring's own convex hull */
  readonly hull?: boolean;
  readonly parts: readonly HeroPart[];
}

// ── the gate ────────────────────────────────────────────────────────────────

/**
 * THE GATE, and it is the load-bearing sentence of this whole module:
 *
 * > **Every generated vertex of every part falls inside the MEASURED
 * > footprint, and nothing stands above the MEASURED top.**
 *
 * The build asserts both before it writes a byte and **refuses to write the
 * file if either fails**. The gate is then **re-run in the browser** against
 * the arrays the page actually draws from, because the data file and the
 * decoded parts are two different objects and only the second one is what a
 * reader sees.
 *
 * A part that reaches past the footprint is **shrunk about its own centroid
 * until it does not — never grown** — and a shrink below **0.80** is treated as
 * an authoring error rather than a correction and fails the build.
 *
 * FOUR AUTHORING ERRORS AND ONE ALGORITHM ERROR THE GATE CAUGHT:
 * the Old Mint's portico, placed off a bounding box, landed outside a
 * diamond-shaped footprint — it now stands on the footprint's **own longest
 * published edge**, which is what measurement can offer for which facade is the
 * front; the Conservatory of Flowers' curved wing, drawn by scaling the
 * footprint ring about its centroid, pushed vertices **straight across its own
 * notches** — that footprint is a thin jagged snake, so the inset is now a
 * per-vertex bisector offset with a fallback to the original vertex, contained
 * by construction; the Palace of Fine Arts rotunda's colonnade stood outside
 * the star-shaped podium; and Sutro Tower's legs, centred on the arms' tips,
 * were half outside.
 */
export const HERO_MIN_SHRINK = 0.8;

/**
 * SUTRO TOWER IS THE ONE RELAXED GATE, and the reason travels with the
 * building.
 *
 * Its published ring **traces three open steel legs about 2 m wide, not an
 * enclosing wall.** Measured: the largest circle that fits inside it anywhere
 * is **8.7 m** across against a **64 m** published extent, and a leg placed at
 * 0.5 or 0.7 of the way to an arm's tip falls **outside** the ring. So a vertex
 * test against the ring is a test about a slab and this is not a slab.
 *
 * For this one hero the containment reference is **the ring's own convex
 * hull**, which is derived from the published geometry and not chosen. It is
 * declared on the shipped record and named in the assertion, which tests every
 * other hero against the ring itself.
 *
 * A correction on the way: the FAA obstacle `06-000120` does **not** fall
 * inside Sutro Tower's footprint. It falls inside its bounding box and its
 * convex hull; a point-in-polygon test against the ring returns false.
 */

/**
 * VOLUME CONSERVATION.
 *
 * A cap swept by a profile has the same volume as the cylinder that was
 * measured when its radius is multiplied by `1/sqrt(integral of s^2 du)`,
 * computed over the **whole concatenated profile** so that a drum, a dome and a
 * lantern of different materials are one measured cap.
 */
export function volumeScale(profile: readonly HeroProfile[]): number {
  if (profile.length < 2) return 1;
  let acc = 0;
  for (let i = 1; i < profile.length; i++) {
    const du = profile[i].u - profile[i - 1].u;
    const a = profile[i - 1].s,
      b = profile[i].s;
    // exact for a linear s over du
    acc += du * ((a * a + a * b + b * b) / 3);
  }
  return acc > 0 ? 1 / Math.sqrt(acc) : 1;
}

/**
 * THE N-GON CORRECTION, and the number that says why it exists.
 *
 * An n-gon of circumradius R has area `(n/2) R^2 sin(2 pi / n)`, so a square
 * drum keeps the measured area only if its circumradius is grown by
 * `sqrt(pi / ((n/2) sin(2 pi / n)))`.
 *
 * **Without it the Ferry Building's square tower under-reads its own published
 * area by 36 %.**
 */
export function ngonScale(n: number): number {
  if (n < 3) return 1;
  return Math.sqrt(Math.PI / ((n / 2) * Math.sin((2 * Math.PI) / n)));
}

// ── the emphasis law ────────────────────────────────────────────────────────

/**
 * THE DEFECT, STATED AS A NUMBER.
 *
 * **City Hall's dome is 88.0 m on an 11,251 m2 footprint, and at the
 * whole-city preset that honest drawing is 7.8 px tall** — about four
 * buildings' worth of the fabric it is standing in. Every block on this project
 * has been rewarded for measuring and penalised for drawing. It worked, and it
 * produced a city that is proportionally exact and visually dead.
 *
 * The one thing that changes is that **the measured top is no longer a ceiling
 * on how big the drawing may be. It is still the ceiling on what the drawing
 * may say.** Kept exactly: the FOOTPRINT (scaled about its own centre, so the
 * shape is unchanged), the POSITION (the scale is about the building's own
 * ground anchor, a fixed point of the transform), the YEAR, and the MEASURED
 * RECORD.
 *
 * `T` and `WO_EMAX` were set by rendering the same camera over a 4x4 grid and
 * contact-sheeting it: `T = 0.075` leaves City Hall a bump at district zoom;
 * `T = 0.170` with `WO_EMAX = 6.5` starts to read as a model dropped on a map.
 * **`T = 0.135, WO_EMAX = 5.0` is the cell where the dome is unmistakable and
 * the building still sits on its own block.**
 */
export const WO_T = 0.135;
export const WO_EMAX = 5.0;
/** `1.5 * log2(WO_EMAX)`; see `emphasisElasticity` for why exactly this */
export const WO_R = 1.5 * Math.log2(WO_EMAX);

function S(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * ```
 *   x = log2( T*H / (top * ZEXB * cam.scale) )   octaves the honest drawing
 *                                                 falls short
 *   E = WO_EMAX ^ S(x/R)
 * ```
 *
 * `E` is what the **drawn top** is multiplied by. At or above the target it is
 * exactly 1 and the building is at its published size.
 */
export function emphasis(
  topM: number,
  camScale: number,
  zexb: number,
  H: number,
): number {
  const honest = topM * zexb * camScale;
  if (honest <= 0) return 1;
  const x = Math.log2((WO_T * H) / honest);
  if (x <= 0) return 1;
  return Math.pow(WO_EMAX, S(x / WO_R));
}

/**
 * A PIXEL FLOOR IS A STEP IN THE DERIVATIVE.
 *
 * ```
 *   d log h / d log k  =  1 - (log2 WO_EMAX / R) * S'(x/R)
 * ```
 *
 * `S'` peaks at exactly 1.5. Setting `R = 1.5 * log2(WO_EMAX)` makes the
 * bracket peak at exactly 1, so **the elasticity lives in [0, 1] and is never
 * negative**:
 *
 * - at both ends it is **1** — the hero scales exactly with the city, which is
 *   what a building does;
 * - in between it is between 0 and 1 — it shrinks more slowly than the city;
 * - at its flattest it is **0** — it holds its size for an instant;
 * - **nowhere is it below 0 — the drawing never grows as the camera pulls
 *   back.**
 *
 * That last line is the whole difference from the floor that killed the
 * thirteen sprites and from the `gszV` floor Block E measured: **46 m drawn as
 * 89.8 m, RELEASING at `cam.scale` 0.1087, a scale that sits strictly between
 * the whole-city and district presets so a wheel zoom passes straight through
 * it.** A floor is a step in the first derivative: flat, then abruptly
 * proportional. `S'` is continuous and is zero at both ends of the ramp, so
 * this function's first derivative is continuous everywhere and **there is no
 * release point to pass through.**
 *
 * The suite checks both as arithmetic — the elasticity over 400 steps, and the
 * second difference under 0.0020, where a size-1 step in the first derivative
 * would read about 0.0126 — and again **in pixels off the rendered frame**,
 * which is the check that counts.
 */
export function emphasisElasticity(
  topM: number,
  camScale: number,
  zexb: number,
  H: number,
  h = 1e-4,
): number {
  const at = (k: number) => Math.log(emphasis(topM, k, zexb, H) * k);
  const l0 = Math.log(camScale);
  return (at(Math.exp(l0 + h)) - at(Math.exp(l0 - h))) / (2 * h);
}

/**
 * THE CROWN FACTOR.
 *
 * City Hall's cap is 460.7 m2 of an 11,251 m2 footprint — **4 %** — so making
 * the whole building five times bigger makes the dome five times bigger *and
 * the block five times bigger*, and what arrives is a larger white box with the
 * same invisible bump on it. **Civ VI does not scale a wonder, it caricatures
 * one.**
 *
 * So every part standing above the roofline is drawn `F` times bigger **in all
 * three axes** about the roofline, so the crown's own shape is preserved
 * exactly and only its size against the block changes. The first cut grew the
 * crown `F` taller and only `sqrt(F)` wider, on the theory that it would keep a
 * tower slender; **it turned City Hall's dome into a gold stick** — visible in
 * the comparison sheet, invisible in the arithmetic. Uniform is right.
 *
 * `F` does not add height, it **redistributes** it: the plan scale is solved so
 * that the total drawn top is exactly the `E` the law asked for. And it has a
 * second effect worth having — **`E' < E`, so the footprint grows much less
 * than the height does.**
 *
 * If `F` simply multiplied the crown, the elasticity would pick up a factor
 * strictly greater than 1 and the drawn height would **grow as the camera pulls
 * back**. That is float, and it is the failure this project has already shipped
 * once.
 */
export const WO_FEAT = 0.5;

export function crownFactor(E: number): number {
  return 1 + (E - 1) * WO_FEAT;
}

export function planScale(E: number, topM: number, zrM: number): number {
  const F = crownFactor(E);
  const denom = zrM + (topM - zrM) * F;
  return denom > 0 ? (E * topM) / denom : E;
}

/**
 * THE ROOFLINE — the top of the building's own BULK, derived by one mechanical
 * test over the authored parts: **the highest `z1` among the parts whose ring
 * is at least 0.35 of the largest ring in the drawing. Nothing is named.**
 *
 * The test says the right thing about the cases that would embarrass it: the
 * Old Mint and the two windmills come out `zr = top`, i.e. no crown — which is
 * correct, because a windmill's cap is nearly as wide as its tower.
 */
export const ZR_RING_FRAC = 0.35;

export function rooflineOf(parts: readonly HeroPart[]): number {
  let biggest = 0;
  const span = (p: HeroPart) => {
    let mn = Infinity,
      mx = -Infinity,
      mny = Infinity,
      mxy = -Infinity;
    for (let i = 0; i < p.rx.length; i++) {
      if (p.rx[i] < mn) mn = p.rx[i];
      if (p.rx[i] > mx) mx = p.rx[i];
      if (p.ry[i] < mny) mny = p.ry[i];
      if (p.ry[i] > mxy) mxy = p.ry[i];
    }
    return Math.max(mx - mn, mxy - mny);
  };
  for (const p of parts) biggest = Math.max(biggest, span(p));
  let zr = 0;
  for (const p of parts)
    if (span(p) >= ZR_RING_FRAC * biggest && p.z1 > zr) zr = p.z1;
  return zr;
}

/**
 * THE DETAIL DIAL, AND THE SIGN BUG.
 *
 * The ornament gates are cut-offs on a part's own projected size, so
 * **emphasis buys detail for free**: a hero drawn three times larger crosses
 * its cornice, column and rib thresholds three times sooner. On top of that
 * this dial opens them earlier still — and it was written as `sz /= WO_DETAIL`,
 * **which makes the gate open LATER**. For most of the block's life the dial
 * was suppressing ornament rather than adding it, and the arithmetic looked
 * fine; what caught it was a magnified crop of the dome in which City Hall's
 * dome was a featureless olive blob at block zoom, where its ribs and its drum
 * colonnade should both be drawn. **`sz *= WO_DETAIL`.**
 */
export const WO_DETAIL = 3.2;

export function partVisible(part: HeroPart, projectedPx: number): boolean {
  return part.min <= 0 || projectedPx * WO_DETAIL >= part.min;
}

// ── the accent ──────────────────────────────────────────────────────────────

/**
 * A DETAIL THAT CANNOT BE DRAWN IS CARRIED BY THE COLOUR OF THE THING IT IS
 * MADE OF, AND THE COLOUR ARRIVES EXACTLY AS THE THING LEAVES.
 *
 * At 25 px City Hall's twenty gilt ribs, its lantern and its finial are all
 * under their own cut-offs and the lead shell they sit on is the same value as
 * the office block behind it, so the dome takes their gold. At the zoom where
 * the ribs are drawn the blend is zero and the shell is lead again. The first
 * cut put the blend on the emphasis's own ramp and produced a solid gold
 * bullet.
 *
 * The accent is not chosen either: it is the **highest-chroma material used
 * above the roofline**, and a hero whose crown carries no chroma gets none.
 * Chroma is `max - min` of the channels, deliberately **not** HLS saturation: a
 * near-white cream reads S = 0.58 in HLS and is not a colour anybody sees. On
 * chroma the eleven split the way the art spec's own readability verdict table
 * splits them, which is corroboration rather than tuning.
 */
export function chroma(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

export function accentOf(crownMaterials: readonly string[]): string | null {
  let best: string | null = null,
    bc = 0;
  for (const m of crownMaterials) {
    const c = chroma(m);
    if (c > bc) {
      bc = c;
      best = m;
    }
  }
  // a crown that carries no chroma gets no accent
  return bc >= 0.12 ? best : null;
}

/** the blend, which goes to zero exactly as the ornament arrives */
export function accentBlend(ornamentW: number): number {
  return Math.max(0, 1 - ornamentW);
}

// ── the family colour ───────────────────────────────────────────────────────

/**
 * THE FAMILY COLOUR IS NOT POURED OVER A HERO'S ROOF.
 *
 * The defect: the landmark draw poured the decision's family colour over the
 * whole roof at `lerpHex("#ffffff", col, 0.40)`. **That exact note was already
 * in the file**: its own comment records that the first cut used 0.60 and
 * *"against 166,166 earth and slate roofs a 60 % #1e45e4 read as a selection
 * swatch rather than as a roof"*. 0.40 is the same mistake at a lower opacity.
 *
 * **The roof is a MATERIAL and the family colour is on the RING.** While a beat
 * is HELD the material is pulled 0.20 on the walls and 0.26 on the roof toward
 * the family colour, which is a lens on a building rather than a swatch over
 * one.
 */
export const HELD_PULL_WALL = 0.2;
export const HELD_PULL_ROOF = 0.26;

export function heldMaterial(
  base: string,
  family: string,
  isRoof: boolean,
): string {
  return lerpHex(base, family, isRoof ? HELD_PULL_ROOF : HELD_PULL_WALL);
}

// ── the two render bugs that only a picture catches ─────────────────────────

/**
 * CITY HALL'S DOME CAME OUT A GILT BIRDCAGE WITH THE SKY SHOWING THROUGH IT.
 *
 * Canvas fills a `Path2D` with the **nonzero** rule, so two overlapping
 * subpaths of opposite winding cancel and leave a hole — and a solid of
 * revolution's far faces are wound opposite to its near ones, which is exactly
 * what the visibility test measures. **Emitting the far face in reverse order
 * fixes it and one fill is still one fill.**
 */
export function emitBand(
  p: Path2D,
  near: readonly [number, number][],
  far: readonly [number, number][],
): void {
  if (!near.length) return;
  p.moveTo(near[0][0], near[0][1]);
  for (let i = 1; i < near.length; i++) p.lineTo(near[i][0], near[i][1]);
  for (let i = far.length - 1; i >= 0; i--) p.lineTo(far[i][0], far[i][1]);
  p.closePath();
}

/**
 * A BAND WHOSE RADIUS SHRINKS FASTER THAN IT RISES TAKES THE TOP TWO STEPS OF
 * ITS OWN RAMP WHICHEVER WAY IT FACES.
 *
 * The Ferry Building's cap read as the inside of an open terracotta box.
 * Back-face culling is right for a prism and wrong for a cone: **a face that
 * leans back is tilted UP**, and from above you see the far slopes of a pyramid
 * as well as the near ones. And once they were drawn, the four faces came out
 * at four *wall* values, the far ones bright and the near ones dark.
 */
export function bandLambert(
  dRadius: number,
  dHeight: number,
  facing: number,
): number {
  const leansIn = dHeight > 0 && -dRadius > dHeight;
  if (leansIn) return facing >= 0 ? 3 : 2;
  return facing >= 0 ? 3 : 0;
}

// ── the LOD, and the thing it must never read ──────────────────────────────

/**
 * THE LANDMARK LOD DOES NOT MOVE WITH THE ZOOM.
 *
 * The old sprite ladder asked *"is this drawing big enough to be named?"* — a
 * continuous function of `cam.scale` — and its answer went into the mark
 * signature, which is the navigation buffer's content key, which is what tells
 * the buffer its content is stale. **Every floor a sprite crossed while the
 * reader was zooming threw away a rasterisation of 166,166 buildings: MEASURED
 * at 3 forced re-rasterisations of 46–130 ms in 1.8 s of zooming in from whole
 * city.**
 *
 * **Nothing in the LOD may read `cam.scale`.** It reads the zoom STEP, which is
 * frozen during a gesture, so the landmark signature is IDENTICAL across a
 * whole band of zoom and therefore so is the content key. The pixel-size
 * decision that IS still worth making lives in the draw call, where the buffer
 * never sees it.
 */
export type LandmarkLOD = "mark" | "ring" | "hero";

export function lmLOD(
  camStep: number,
  hasFootprint: boolean,
  isHero: boolean,
): LandmarkLOD {
  if (isHero && camStep >= 1) return "hero";
  if (hasFootprint && camStep >= 1) return "ring";
  return "mark";
}

// ── the bridge ──────────────────────────────────────────────────────────────

/**
 * THE GOLDEN GATE BRIDGE.
 *
 * **It is not in the street centreline file.** `3psu-pn9h`'s US-101 stops at
 * the toll plaza — measured, the northernmost vertex on that alignment is
 * 37.8113 N. It is not in DPW's StreetStructures either (417 rows: retaining
 * walls, stairs, and thirteen city-maintained bridges, none of them this one).
 * It is a Bridge and Highway District structure and the City does not maintain
 * it.
 *
 * **It is in the City's own landmark register**: `97yj-54sx` carries it as
 * Article 10 landmark no. 222, designated 1999, with a five-vertex ring — the
 * deck corridor, 1,753 m long.
 *
 * **A second, independent, federal file agrees.** US Census TIGERweb Primary
 * Roads publishes two centrelines named `Golden Gate Brg`, and 9 of their 11
 * vertices fall inside the City's ring. And both files stop at the same place —
 * **37.8254 N, the county line, mid-channel** — because that is where San
 * Francisco stops. The deck ends there, and that is the published extent rather
 * than an unfinished drawing.
 *
 * **It is flat**, because no deck height is published in either file, and the
 * Bay Bridge on this same map is drawn flat for the same reason. A deck lifted
 * to a plausible-looking height would be the one invented number in the frame.
 *
 * THE YEAR IS 1937 AND THAT CHANGED ON PURPOSE. The register's `yearbuilt` is
 * 1933 and the two registers were never in conflict: **1933 is when
 * construction began and 1937 is when the bridge was completed (19 April) and
 * opened (27 May). A map that shows where a bridge IS wants the year it
 * existed.** The block write-up still says 1933; the assertion was changed
 * 2026-08-23 and the code is what is current.
 *
 * AND THE DECK IS NOT A POSITION FOR THE CORPUS'S OWN DECISION. The corpus
 * holds a decision called `golden-gate-bridge` — the city's share of the
 * approach road, 1930–53, $27,165,000 — whose `geometry_source` reads *"NOT IN
 * RECORD — the corpus names the two ends by their structures … never an
 * alignment."* So that entity carries `g:"none"` and the deck drawn here is the
 * register's geometry: **no family colour, no place mark, no subject ring, no
 * hit target, no drawer, no money.**
 */
export const GGB = {
  /** the register's own ring length, metres */
  deckLenM: 1753,
  /** the FAA obstacle file's tower height, feet */
  towerFt: 760,
  towerAglFt: 757,
  /** metres */
  deckZ: 67.1,
  deckW: 18.9,
  spanM: 1280.2,
  towers: 2,
  /** the year it EXISTED, not the year work began */
  year: 1937,
  /** the drawn suspender spacing along the deck */
  suspenderM: 30.0,
  legM: 7.0,
} as const;

/**
 * The published tower positions fall ON the published deck line, inside the
 * obstacle file's own arc-second rounding — asserted at **31.0 m**.
 */
export const GGB_TOWER_TOL_M = 31.0;

export interface BridgeDeck {
  readonly ring: readonly (readonly [number, number])[];
  readonly towers: readonly (readonly [number, number])[];
}

export function drawBridge(
  f: Frame,
  deck: BridgeDeck,
  year: number | undefined,
): number {
  if (year !== undefined && year < GGB.year) return 0;
  const { ctx } = f;
  let ops = 0;
  ctx.save();
  // the deck, flat, at the published width
  const p = new Path2D();
  for (let i = 0; i < deck.ring.length; i++) {
    const pr = f.proj.proj(deck.ring[i][0], deck.ring[i][1], GGB.deckZ);
    if (i) p.lineTo(sx(f, pr), sy(f, pr));
    else p.moveTo(sx(f, pr), sy(f, pr));
  }
  p.closePath();
  ctx.fillStyle = "#a8603f";
  ctx.fill(p);
  ops++;
  const towerM = GGB.towerFt * 0.3048;
  for (const t of deck.towers) {
    const a = f.proj.projb(t[0], t[1], 0, 0);
    const b = f.proj.projb(t[0], t[1], 0, towerM);
    ctx.strokeStyle = "#a8603f";
    ctx.lineWidth = Math.max(1, GGB.deckW * 0.25 * 1.2247 * f.cam.scale);
    ctx.beginPath();
    ctx.moveTo(sx(f, a), sy(f, a));
    ctx.lineTo(sx(f, b), sy(f, b));
    ctx.stroke();
    ops++;
  }
  ctx.restore();
  return ops;
}

// ── the hero draw ───────────────────────────────────────────────────────────

export interface HeroMaterials {
  /** [fill, light, dark] per material index */
  readonly mats: readonly (readonly [string, string, string])[];
}

/**
 * THE INK.
 *
 * Three flat values plus ink per object, a warm near-black rather than pure
 * black, at one weight per drawing **scaled to the drawing rather than held at
 * a constant pixel width.** It is most of why the deleted sprites read as
 * *drawings* and the authored heroes read as shaded solids.
 *
 * Drawn **per lambert bucket**, so a whole dome is four strokes, and it rules
 * the band boundaries as well as the outline — which is the gouache move
 * (*"curved surfaces get bands, not gradients"*) rather than an accident. Gated
 * on the part's own drawn width: below the size at which a line is a line it is
 * **not drawn at all, never thinned to a smear.**
 */
export const WO_RIBMAX = 2.2;
export const LM_INK = "rgba(34,27,18,.44)";

/**
 * A hero's material goes through the fabric's own four-step lambert ramp under
 * the fabric's own two illuminants, and recedes into the frame's own aerial
 * fade, **read where the colour table already computes it.** So a hero is lit
 * by whatever light the fabric is lit by, and anything done to the illuminants,
 * the ramp or the haze moves the heroes with it.
 */
export function heroMaterial(
  mats: HeroMaterials,
  mi: number,
  lam: number,
  fade: number,
  haze: string,
  accent: string | null,
  accentBlendW: number,
): string {
  const m = mats.mats[mi] ?? (["#b9b2a2", "#d0c9ba", "#6f6a60"] as const);
  let c = m[0];
  if (accent && accentBlendW > 0) c = lerpHex(c, accent, accentBlendW * 0.55);
  if (fade > 0.004) c = lerpHex(c, haze, fade);
  return skylit(c, 0.66 + 0.1 * lam, (lam - 1.5) / 1.5);
}

/** the ink for one material, taken from that material's own dark */
export function heroInk(mats: HeroMaterials, mi: number): string {
  const m = mats.mats[mi];
  return m ? shade(m[2], 0.9) : LM_INK;
}

/**
 * WHAT THE GROUND OVERLAP COSTS, STATED.
 *
 * A drawing at x2 its plan covers ground its neighbours stand on, exactly as a
 * Civ VI wonder overlaps its tile. It is worth what it costs because the
 * emphasis is largest precisely where the neighbours are sub-pixel — at
 * whole-city zoom the fabric under a hero is the block massing, not individual
 * buildings — **and it is gone by the time a reader could see the overlap**: at
 * block zoom `E` is 1.16 for City Hall and 1.00 for Sutro Tower.
 */
export const GROUND_OVERLAP_IS_STATED = true;

/**
 * THE TWO HONESTY RULES, AND THE DIFFERENCE IS DELIBERATE.
 *
 * Block LR's: *a drawn shape may be **carved out of** a measured one and may
 * not be **added on top of** it* — and on that rule it explicitly declined the
 * Ferry Building's clock faces and City Hall's lantern.
 *
 * Block HERO's: *the drawn building must be contained in the measured
 * envelope — every vertex inside the published footprint, nothing above the
 * measured top — and the measured cap VOLUME is conserved inside it.* Under
 * that rule a lantern and a clock face are allowed, because they are inside.
 *
 * **What neither rule allows, and what nothing here does, is a drawn shape that
 * makes a landmark taller, wider or somewhere else than the published files put
 * it.** If the call goes the other way, the lantern, the finial, the clock
 * faces, the columns and the ribs are all separate parts and removing them is
 * removing lines.
 */
export const HONESTY_RULES_ARE_STATED = true;

// ═══ P4b — the hero pass ═══════════════════════════════════════════════════
//
// P3 landed the LAW of this module and no entry point: the containment gate,
// the conservation rules, the emphasis curve, the roofline test, the accent
// derivation and both winding fixes are all here, and `emitBand`,
// `heroMaterial` and `bandLambert` are pieces rather than a pass. So the eleven
// authored heroes and their 127 parts loaded and drew nothing.
//
// This composes them. **Nothing below invents a form.** Every ring, every
// profile point, every material index, every cut-off and every tilt is read
// out of `base/heroes` exactly as the encoder moved it out of the mock's own
// payload, and the three primitives are `part3.html`'s `heroSolid`,
// `heroArcade` and `heroRib`. Where a decision differs from the mock's it is
// because the LANDED RULE differs, and each of those is marked `DIVERGES`.

/** the ring, projected once per bearing — `part3.html`'s `buildHeroProj` */
interface PartProj {
  /** the ring in projected units */
  readonly px: Float32Array;
  readonly py: Float32Array;
  /** per EDGE: does edge t→t+1 face the camera, and its step on the ramp */
  readonly vis: Uint8Array;
  readonly lam: Uint8Array;
  /** the projected AREA centroid — the point `build_hero.py` scaled about */
  readonly cx: number;
  readonly cy: number;
  /** projected width, the ornament gates' own currency */
  readonly rw: number;
  /** the tilt, in the same projected basis */
  readonly tpx: number;
  readonly tpy: number;
}

export interface HeroPartInput {
  readonly kind: PartKind;
  readonly z0: number;
  readonly z1: number;
  readonly profile: readonly HeroProfile[];
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly mat: number;
  readonly min: number;
  readonly accentMat: number;
  readonly ink: number;
  readonly openW: number;
  readonly pitch: number;
  readonly margin: number;
  readonly dark: number;
  readonly ribs: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly shape: string;
}

export interface HeroInput {
  readonly bi: number;
  readonly year: number;
  readonly top: number;
  readonly zr: number;
  readonly accent: string | null;
  readonly ax: number;
  readonly ay: number;
  readonly parts: readonly HeroPartInput[];
}

export interface HeroDrawOptions {
  /** the frame's aerial fade and the haze it fades into */
  readonly fade: number;
  readonly haze: string;
  /** the arrival curve; 1 whenever the clock is not running */
  readonly rise?: number;
  /** the year on the clock. A hero draws nothing before its published year. */
  readonly year?: number;
  /** while a beat is HELD, the decision's family colour */
  readonly family?: string | null;
}

/**
 * THE MATERIAL TABLE, ADAPTED — and the adaptation is not a choice.
 *
 * `base/heroes.json` ships `mat[i] = [name, top, wall]` (the mock's `HRO.mat`,
 * moved across byte for byte). `HeroMaterials` is `[fill, light, dark]`, where
 * `heroMaterial` lights `fill` through the fabric's ramp and `heroInk` shades
 * `dark`. So the **wall** is the fill, the **top** is the light, and the dark
 * is the mock's own `lerpHex(wall, "#000000", 0.38)`, which is the expression
 * `heroMat` derives its ink from.
 *
 * Building it here rather than in the export is deliberate: it is a mapping
 * between two shipped contracts, and the shipped record stays the mock's.
 */
export function heroMaterials(mat: readonly (readonly string[])[]): HeroMaterials {
  return {
    mats: mat.map((m) => {
      const wall = m[2] ?? "#b9b2a2";
      return [wall, m[1] ?? "#d0c9ba", lerpHex(wall, "#000000", 0.38)] as const;
    }),
  };
}

/**
 * The accent's material INDEX, recovered from the accent's own colour.
 *
 * `HeroData` carries the accent as a hex and not as an index, and the index is
 * what says WHICH PARTS carry it — the test `accentBlend` needs, because the
 * blend goes to zero exactly as those parts open. The hex is `mat[ac][1]`, so
 * the index is recoverable from the shipped table without widening any
 * contract. Returns -1 for a hero whose crown carries no chroma, which is what
 * `accentOf` already says about seven of the eleven.
 */
export function accentMatIndex(
  mat: readonly (readonly string[])[],
  accent: string | null,
): number {
  if (!accent) return -1;
  for (let i = 0; i < mat.length; i++) if (mat[i][1] === accent) return i;
  return -1;
}

const projCache = new WeakMap<HeroPartInput, { key: string; p: PartProj }>();

function projectPart(part: HeroPartInput, f: Frame): PartProj {
  const c = f.proj.coeffs();
  const key = `${c.ax},${c.ay},${c.bx},${c.by}`;
  const hit = projCache.get(part);
  if (hit && hit.key === key) return hit.p;
  const n = part.rx.length;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const vis = new Uint8Array(n);
  const lam = new Uint8Array(n);
  /* the depth form and the light's own maximum, both bearing-only. `depth()`
     reduces to `dx·x + dy·y`; an edge faces the camera when its outward normal
     points at LESS depth. */
  const dx = f.proj.depth(1, 0);
  const dy = f.proj.depth(0, 1);
  const LMAX = Math.hypot(c.ax, c.ay) || 1;
  let mnx = Infinity, mxx = -Infinity;
  for (let t = 0; t < n; t++) {
    const x = part.rx[t], y = part.ry[t];
    px[t] = c.ax * x + c.ay * y;
    py[t] = c.bx * x + c.by * y;
    if (px[t] < mnx) mnx = px[t];
    if (px[t] > mxx) mxx = px[t];
    const u = (t + 1) % n;
    const ex = part.rx[u] - x, ey = part.ry[u] - y;
    const L = Math.hypot(ex, ey) || 1;
    const nx = ey / L, ny = -ex / L;
    vis[t] = dx * nx + dy * ny < 0 ? 1 : 0;
    const tt = (c.ax * nx + c.ay * ny) / LMAX;
    lam[t] = Math.max(0, Math.min(3, Math.round((tt * 0.5 + 0.5) * 3)));
  }
  /* THE AREA CENTROID, IN PROJECTED SPACE — which is the projection of the
     area centroid, because the projection is affine. It HAS to be the same
     point `build_hero.py` scaled the ring about, or the containment the gate
     proved is not the containment that gets drawn. */
  let a2 = 0, cx = 0, cy = 0;
  for (let t = 0; t < n; t++) {
    const u = (t + 1) % n;
    const cr = px[t] * py[u] - px[u] * py[t];
    a2 += cr;
    cx += (px[t] + px[u]) * cr;
    cy += (py[t] + py[u]) * cr;
  }
  if (Math.abs(a2) < 1e-9) {
    cx = 0; cy = 0;
    for (let t = 0; t < n; t++) { cx += px[t]; cy += py[t]; }
    cx /= n; cy /= n;
  } else {
    cx = cx / (3 * a2);
    cy = cy / (3 * a2);
  }
  const p: PartProj = {
    px, py, vis, lam, cx, cy,
    rw: mxx - mnx,
    tpx: c.ax * part.tiltX + c.ay * part.tiltY,
    tpy: c.bx * part.tiltX + c.by * part.tiltY,
  };
  projCache.set(part, { key, p });
  return p;
}

/**
 * ONE PART'S CUT-OFF, AND THE ALPHA RAMP UNDER IT.
 *
 * `partVisible` is the landed boolean; this is the same test with the mock's
 * own ramp above it, so a cornice fades in over its own threshold instead of
 * switching on. The quantity is the part's own drawn size and it differs by
 * kind, which is the point: an arcade is gated on the width of ONE OPENING and
 * a rib on the GAP BETWEEN TWO RIBS, not on the ring they sit on.
 */
function partAlpha(part: HeroPartInput, p: PartProj, k2: number, E: number): number {
  let sz: number;
  if (part.kind === "arcade") sz = part.openW * k2 * E;
  else if (part.kind === "rib")
    sz = ((p.rw * Math.PI) / Math.max(1, part.ribs)) * k2 * E;
  else sz = p.rw * k2 * E;
  if (!partVisible(part, sz)) return 0;
  if (!(part.min > 0)) return 1;
  const open = sz * WO_DETAIL;
  return Math.min(1, (open - part.min) / (part.min * 1.15 + 0.9));
}

/** scratch, grown on demand — a hero's rings are 72 vertices by 30 profile steps */
let HBSX = new Float64Array(1024), HBSY = new Float64Array(1024);
let HSX = new Float64Array(8192), HSY = new Float64Array(8192);

/** the state one hero's whole drawing shares — set once, read by every part */
interface HeroState {
  readonly E: number;
  /** the plan scale, solved so the drawn top is exactly `E` times the measured */
  readonly plan: number;
  /** the crown factor, applied in all three axes above the roofline */
  readonly F: number;
  readonly zr: number;
  /** the projected ground anchor */
  readonly ax: number;
  readonly ay: number;
  readonly accentMat: number;
  readonly accentW: number;
  readonly rise: number;
  readonly zZ: number;
}

/** a part's height, mapped through the roofline. Below `zr` nothing moves. */
function heroZ(s: HeroState, z: number): number {
  return z <= s.zr ? z : s.zr + (z - s.zr) * s.F;
}

function baseRing(part: HeroPartInput, p: PartProj, f: Frame, s: HeroState): void {
  const n = part.rx.length;
  if (HBSX.length < n) { HBSX = new Float64Array(n * 2); HBSY = new Float64Array(n * 2); }
  /* Every ring vertex, scaled about the hero's own projected ground anchor.
     `proj()` is affine, so scaling in projected space IS scaling in world
     space: the drawing is the same shape, larger, standing in the same place.
     `zZ` is the TERRAIN under it and is never scaled.
     A part standing above the roofline is also widened about its OWN centre by
     the same `F`, so the crown's shape is preserved exactly and only its size
     against the block changes:  v' = A + (c−A)E + (v−c)EF. */
  const w = part.z0 >= s.zr - 1e-3 ? s.F : 1;
  const bx = s.ax + (p.cx - s.ax) * s.plan;
  const by = s.ay + (p.cy - s.ay) * s.plan;
  const k2 = f.cam.scale, W2 = f.W / 2, H2 = f.H / 2;
  for (let t = 0; t < n; t++) {
    HBSX[t] = (bx + (p.px[t] - p.cx) * s.plan * w - f.cam.cx) * k2 + W2;
    HBSY[t] = H2 - (by + (p.py[t] - p.cy) * s.plan * w + s.zZ - f.cam.cy) * k2;
  }
}

function capColour(
  mat: readonly (readonly string[])[],
  mi: number,
  accentMi: number,
  accentW: number,
  fade: number,
  haze: string,
): string {
  let top = mat[mi]?.[1] ?? "#d0c9ba";
  if (accentMi >= 0 && accentW > 0.01)
    top = lerpHex(top, mat[accentMi]?.[1] ?? top, accentW);
  if (fade > 0.004) top = lerpHex(top, haze, fade);
  return top;
}

function drawSolid(
  f: Frame, part: HeroPartInput, p: PartProj, s: HeroState,
  mats: HeroMaterials, mat: readonly (readonly string[])[],
  o: HeroDrawOptions,
): void {
  const { ctx } = f;
  const n = part.rx.length, NR = part.profile.length;
  if (NR < 2 || n < 3) return;
  if (HSX.length < NR * n) { HSX = new Float64Array(NR * n); HSY = new Float64Array(NR * n); }
  baseRing(part, p, f, s);
  const k2 = f.cam.scale, W2 = f.W / 2, H2 = f.H / 2;
  const cxs = (s.ax + (p.cx - s.ax) * s.plan - f.cam.cx) * k2 + W2;
  const cys = H2 - (s.ay + (p.cy - s.ay) * s.plan + s.zZ - f.cam.cy) * k2;
  const w = part.z0 >= s.zr - 1e-3 ? s.F : 1;
  const zexb = f.proj.zexb;
  for (let r = 0; r < NR; r++) {
    const sc = part.profile[r].s, u = part.profile[r].u;
    const yy = heroZ(s, part.z0 + (part.z1 - part.z0) * u) * s.rise * zexb * k2 * s.plan;
    const ox = p.tpx * u * k2 * s.plan * w;
    const oy = p.tpy * u * k2 * s.plan * w;
    const b = r * n;
    for (let t = 0; t < n; t++) {
      HSX[b + t] = cxs + (HBSX[t] - cxs) * sc + ox;
      HSY[b + t] = cys + (HBSY[t] - cys) * sc - oy - yy;
    }
  }
  const crown = part.z0 >= s.zr - 1e-3;
  const accMi = crown ? s.accentMat : -1;
  const accent = accMi >= 0 ? (mat[accMi]?.[2] ?? null) : null;
  const lamPath: (Path2D | null)[] = [null, null, null, null];
  for (let r = 0; r + 1 < NR; r++) {
    /* A TAPERING BAND SHOWS ITS FAR FACES, A VERTICAL ONE DOES NOT — back-face
       culling is right for a prism and wrong for a cone. */
    const dRadius = part.profile[r + 1].s - part.profile[r].s;
    const dHeight = part.profile[r + 1].u - part.profile[r].u;
    const taper = -dRadius > 0.004;
    /* DIVERGES from the mock, and it is the landed rule that diverges:
       `part3.html` treats a band as up-facing at `−dRadius > 0.55·dHeight`;
       `bandLambert`'s own `leansIn` is `−dRadius > dHeight`. The landed test is
       the stricter one, so slightly fewer bands take the sky's two steps. The
       function is called for exactly the case it documents. */
    const leans = dHeight > 0 && -dRadius > dHeight;
    for (let t = 0; t < n; t++) {
      if (!p.vis[t] && !taper) continue;
      const u = (t + 1) % n;
      const b = r * n, b2 = (r + 1) * n;
      const q = leans
        ? bandLambert(dRadius, dHeight, p.lam[t] > 1 ? 1 : -1)
        : Math.min(3, p.lam[t]);
      let path = lamPath[q];
      if (!path) { path = new Path2D(); lamPath[q] = path; }
      /* AND THE FAR FACE IS WOUND THE OTHER WAY ROUND — `emitBand`, which is
         the whole of the gilt-birdcage fix and is why one fill is still one
         fill. */
      if (p.vis[t])
        emitBand(path,
          [[HSX[b + t], HSY[b + t]], [HSX[b + u], HSY[b + u]]],
          [[HSX[b2 + t], HSY[b2 + t]], [HSX[b2 + u], HSY[b2 + u]]]);
      else
        emitBand(path,
          [[HSX[b + u], HSY[b + u]], [HSX[b + t], HSY[b + t]]],
          [[HSX[b2 + u], HSY[b2 + u]], [HSX[b2 + t], HSY[b2 + t]]]);
    }
  }
  for (let q = 0; q < 4; q++) {
    const path = lamPath[q];
    if (!path) continue;
    let col = heroMaterial(mats, part.mat, q, o.fade, o.haze, accent, s.accentW);
    if (o.family) col = heldMaterial(col, o.family, false);
    ctx.fillStyle = col;
    ctx.fill(path);
  }
  /* THE INK — one weight per drawing, scaled to the drawing, per lambert
     bucket, so a whole dome is four strokes and the bucket boundaries are
     ruled as well as the outline. Below the size at which a line is a line it
     is not drawn at all, never thinned to a smear. */
  const wpx = p.rw * f.cam.scale * s.plan;
  if (wpx > WO_INK_MIN) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * Math.min(1, (wpx - WO_INK_MIN) / WO_INK_MIN) * WO_INK;
    ctx.strokeStyle = heroInk(mats, part.mat);
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.6, Math.min(WO_INK_MAX, wpx / 95));
    for (let q = 0; q < 4; q++) { const path = lamPath[q]; if (path) ctx.stroke(path); }
    ctx.restore();
  }
  // the cap: the top ring, in the part's own CAP material
  const tr = (NR - 1) * n;
  if (part.profile[NR - 1].s > 0.03) {
    let top = capColour(mat, part.accentMat >= 0 ? part.accentMat : part.mat,
      accMi, s.accentW, o.fade, o.haze);
    if (o.family) top = heldMaterial(top, o.family, true);
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(HSX[tr], HSY[tr]);
    for (let t = 1; t < n; t++) ctx.lineTo(HSX[tr + t], HSY[tr + t]);
    ctx.closePath();
    ctx.fill();
    if (part.ink && p.rw * part.profile[NR - 1].s * f.cam.scale * s.plan > 5.0) {
      ctx.strokeStyle = heroInk(mats, part.accentMat >= 0 ? part.accentMat : part.mat);
      ctx.lineWidth = 0.7;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }
}

/**
 * The openings — arches, windows and a clock face, CUT INTO the wall of a ring
 * that is already drawn. Nothing here changes a silhouette and nothing is added
 * outside the measured footprint, which is why the gate can be a statement
 * about vertices.
 */
function drawArcade(
  f: Frame, part: HeroPartInput, p: PartProj, s: HeroState,
  mats: HeroMaterials, o: HeroDrawOptions,
): void {
  const { ctx } = f;
  const n = part.rx.length;
  baseRing(part, p, f, s);
  const k2 = f.cam.scale, zexb = f.proj.zexb;
  const wallC = heroMaterial(mats, part.mat, 1, o.fade, o.haze, null, 0);
  const dark = shade(wallC, part.dark || 0.75);
  const zb = heroZ(s, part.z0) * s.rise * zexb * k2 * s.plan;
  const zt = heroZ(s, part.z1) * s.rise * zexb * k2 * s.plan;
  const hh = zt - zb;
  const clock = part.shape === "clock" ? new Path2D() : null;
  ctx.fillStyle = dark;
  ctx.beginPath();
  for (let t = 0; t < n; t++) {
    if (!p.vis[t]) continue;
    const u = (t + 1) % n;
    const L = Math.hypot(part.rx[u] - part.rx[t], part.ry[u] - part.ry[t]);
    const X0 = HBSX[t], Y0 = HBSY[t], X1 = HBSX[u], Y1 = HBSY[u];
    let nb: number, pitch = part.pitch;
    if (!isFinite(pitch) || L - 2 * part.margin < part.openW) { nb = 1; pitch = L; }
    else nb = Math.max(1, Math.floor((L - 2 * part.margin) / pitch));
    if (nb * part.openW > L) continue;
    const start = (L - nb * pitch) * 0.5 + (pitch - part.openW) * 0.5;
    for (let b = 0; b < nb; b++) {
      const a = (start + b * pitch) / L, c = (start + b * pitch + part.openW) / L;
      if (a < 0 || c > 1) continue;
      if (clock) {
        /* a circle in a VERTICAL WALL PLANE. The projection is affine, so it
           comes out an ellipse, and an n-gon in the wall's own two directions —
           along the edge, and straight up on ZEXB — is that ellipse. */
        const rM = part.openW * 0.5, tc = (a + c) * 0.5;
        const zc = heroZ(s, (part.z0 + part.z1) * 0.5) * s.rise * zexb * k2 * s.plan;
        const rr = rM / L;
        for (let q = 0; q < WO_CLKN; q++) {
          const th = (Math.PI * 2 * q) / WO_CLKN;
          const tt = tc + rr * Math.cos(th);
          const xx = X0 + (X1 - X0) * tt;
          const yy = Y0 + (Y1 - Y0) * tt -
            (zc + rM * Math.sin(th) * s.rise * zexb * k2 * s.plan);
          if (q) clock.lineTo(xx, yy); else clock.moveTo(xx, yy);
        }
        clock.closePath();
        continue;
      }
      const xA = X0 + (X1 - X0) * a, yA = Y0 + (Y1 - Y0) * a;
      const xB = X0 + (X1 - X0) * c, yB = Y0 + (Y1 - Y0) * c;
      ctx.moveTo(xA, yA - zb);
      ctx.lineTo(xB, yB - zb);
      if (part.shape === "arch") {
        const sp = Math.min(hh * 0.62, part.openW * 0.5 * zexb * k2 * s.rise * s.plan);
        ctx.lineTo(xB, yB - (zt - sp));
        ctx.lineTo(xB + (xA - xB) * 0.22, yA - (zt - sp * 0.34));
        ctx.lineTo((xA + xB) * 0.5, (yA + yB) * 0.5 - zt);
        ctx.lineTo(xA + (xB - xA) * 0.22, yA - (zt - sp * 0.34));
        ctx.lineTo(xA, yA - (zt - sp));
      } else {
        ctx.lineTo(xB, yB - zt);
        ctx.lineTo(xA, yA - zt);
      }
      ctx.closePath();
    }
  }
  ctx.fill();
  /* THE CLOCK IS A PALE FACE, NOT A DARK HOLE. Every other opening on this
     building is a hole in a wall and is drawn as one; a clock face is the one
     bright thing on a sandstone tower, and drawing it at the arcade's own
     darkness made it a smudge. */
  if (clock) {
    ctx.fillStyle = lerpHex(wallC, "#ffffff", 0.45);
    ctx.fill(clock);
    ctx.strokeStyle = shade(wallC, 0.70);
    ctx.lineWidth = Math.min(1.6, 0.10 * part.openW * k2 * s.plan);
    ctx.stroke(clock);
  }
}

/**
 * The ribs — a meridian stroked over the same swept ring the solid used, so a
 * dome's ribs and a shaft's flutes lie ON the surface rather than beside it.
 * The gate is the GAP between two ribs in pixels: below it they are not a
 * rhythm, they are a texture the anti-aliasing eats.
 */
function drawRib(
  f: Frame, part: HeroPartInput, p: PartProj, s: HeroState,
  mats: HeroMaterials,
): void {
  const { ctx } = f;
  const n = part.rx.length, NR = part.profile.length;
  if (NR < 2) return;
  baseRing(part, p, f, s);
  const k2 = f.cam.scale, W2 = f.W / 2, H2 = f.H / 2, zexb = f.proj.zexb;
  const cxs = (s.ax + (p.cx - s.ax) * s.plan - f.cam.cx) * k2 + W2;
  const cys = H2 - (s.ay + (p.cy - s.ay) * s.plan + s.zZ - f.cam.cy) * k2;
  const w = part.z0 >= s.zr - 1e-3 ? s.F : 1;
  ctx.strokeStyle = heroInk(mats, part.mat);
  /* a rib is a line ON a surface that is now up to `WO_EMAX` times bigger, so
     its weight grows with the drawing rather than sitting at 0.9 px — which at
     emphasis read as a hairline scratched over a large dome. Clamped so it
     never becomes a bar. */
  ctx.lineWidth = Math.max(0.9, Math.min(WO_RIBMAX, 0.9 * Math.sqrt(s.plan)));
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let t = 0; t < n; t++) {
    if (!p.vis[t] && !p.vis[(t - 1 + n) % n]) continue;
    for (let r = 0; r < NR; r++) {
      const sc = part.profile[r].s, u = part.profile[r].u;
      const yy = heroZ(s, part.z0 + (part.z1 - part.z0) * u) * s.rise * zexb * k2 * s.plan;
      const x = cxs + (HBSX[t] - cxs) * sc + p.tpx * u * k2 * s.plan * w;
      const y = cys + (HBSY[t] - cys) * sc - p.tpy * u * k2 * s.plan * w - yy;
      if (r) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

/** `part3.html`'s own ink dials, moved with the drawing they belong to */
const WO_INK = 0.55;
const WO_INK_MIN = 26;
const WO_INK_MAX = 1.9;
/** the clock face was a 14-gon, which at emphasis is visibly a polygon */
const WO_CLKN = 40;

/**
 * ONE HERO, DRAWN AS ITSELF.
 *
 * Called from the footprint tier's own near path, with the same camera the rest
 * of the frame is drawn with, at this building's own place in painter's order,
 * over the contact shadow the fabric has already thrown for it. **It is not
 * composited over the city — it IS the city's own draw call**, which is the
 * whole anti-float argument and the reason the thirteen sprites could not ship.
 *
 * Returns `false` when the year gate refuses it, and the caller then draws the
 * ordinary prism — which is what stood there in the years before the register
 * says the building did.
 *
 * `zg` is the terrain elevation under the anchor, in metres, and is **never
 * scaled**: the emphasis is a similarity about the building's own ground
 * anchor, so the anchor is a fixed point of the whole transform and the drawing
 * stays where the published files put it.
 */
export function drawHero(
  f: Frame,
  hero: HeroInput,
  mat: readonly (readonly string[])[],
  mats: HeroMaterials,
  zg: number,
  opts: HeroDrawOptions,
): boolean {
  if (opts.year !== undefined && Math.floor(opts.year) < hero.year) return false;
  const { ctx } = f;
  const c = f.proj.coeffs();
  const E = emphasis(hero.top, f.cam.scale, f.proj.zexb, f.H);
  const accentMat = accentMatIndex(mat, hero.accent);
  const zr = hero.zr > 0 ? hero.zr : hero.top;
  const plan = planScale(E, hero.top, zr);
  const s0: HeroState = {
    E, plan, F: crownFactor(E), zr,
    ax: c.ax * hero.ax + c.ay * hero.ay,
    ay: c.bx * hero.ax + c.by * hero.ay,
    accentMat, accentW: 0,
    rise: opts.rise ?? 1,
    zZ: zg * f.proj.zex,
  };
  /* THE ACCENT — how far the accent's OWN parts have opened. The blend is one
     minus that, so *a detail that cannot be drawn is carried by the colour of
     the thing it is made of, and the colour arrives exactly as the thing
     leaves.* Only above the roofline: the accent is the crown's. */
  let accentW = 0;
  if (accentMat >= 0 && E > 1.0001) {
    let open = 0;
    for (const part of hero.parts) {
      if (part.mat !== accentMat && part.accentMat !== accentMat) continue;
      if (part.z0 < zr - 1e-3) continue;
      const a = partAlpha(part, projectPart(part, f), f.cam.scale, plan);
      if (a > open) open = a;
    }
    accentW = accentBlend(open);
  }
  const s: HeroState = { ...s0, accentW };
  for (const part of hero.parts) {
    const p = projectPart(part, f);
    const a = partAlpha(part, p, f.cam.scale, plan);
    if (a <= 0.02) continue;
    const prev = ctx.globalAlpha;
    if (a < 0.999) ctx.globalAlpha = prev * a;
    if (part.kind === "solid") drawSolid(f, part, p, s, mats, mat, opts);
    else if (part.kind === "arcade") drawArcade(f, part, p, s, mats, opts);
    else drawRib(f, part, p, s, mats);
    ctx.globalAlpha = prev;
  }
  return true;
}
