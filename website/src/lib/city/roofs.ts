/**
 * roofs.ts — the coping, the dropped deck, the second step.
 *
 * Block P3. Ported from `gen/part3.html` §THE BUILDING'S OWN SURFACE
 * (`buildRoofH`, `RSHADE`, `roofFineLUT`, `STOREY_*`) and §THE FLAT ROOF IS A
 * TRAY (`DE`, `deTrayW`, `deTray`), with `roofs/BLOCK-F2.md` and
 * `detail/BLOCK-DETAIL.md`.
 *
 * ── SAN FRANCISCO'S ROOFS ARE FLAT BEHIND PARAPETS ──────────────────────
 * The brief's premise — that roof form is derivable from the published LIDAR
 * zonal statistics — is wrong, and it was shown three ways.
 *
 * **The wrong grid.** The nine statistics were taken over the HEIGHT grid, and
 * height is *height above ground*, so in San Francisco of all cities a flat
 * roof over sloping ground has a large `hgt_std` — the roof is level and the
 * datum under it falls away. Reading pitch off it would have measured the hill.
 *
 * **The tower control.** `std / height` is 0.10–0.15 in every height class,
 * **including the 301 buildings over 40 m**, which in San Francisco are
 * flat-roofed towers without exception. The median tower's first-return
 * standard deviation is **11.1 m**. Nothing on top of a San Francisco tower is
 * 11 m of roof shape. What the spread measures is the building's own edge and
 * its own multiplicity. A gable on a 25 ft lot at a 5:12 pitch is about
 * **0.46 m** of standard deviation — an order of magnitude under the
 * contamination, and inseparable from it with aggregates that carry no
 * location.
 *
 * **The modal bin.** The modal one-centimetre bin is **6 cm** from the median
 * for the median building in the city. A gable with a 2 m rise spreads its
 * cells over about 200 near-equal one-centimetre bins, so its modal bin would
 * sit of the order of **50 cm** from the median. It sits at 6. That is not a
 * gable. It is one plane with noise on it.
 *
 * **And the pictures agree.** Checked against published aerial imagery: 32
 * Sunset houses, 8 from each quartile of measured relief — rows 1–3 are white
 * and grey membrane roofs with parapets and roof plant; the three or four
 * visible pitched tile roofs are all in the top quartile. Two blind sheets of
 * 48, scored before the statistic was seen, put the modal roof flat in both.
 * The **James Flood Building**, twelve storeys and unambiguously flat, carries
 * `stdcm_1st` **175 cm**; **Hotaling Stables**, a simple flat block, **94 cm**;
 * the steeply gabled **Haas-Lilienthal House**, 276 cm. **There is no cut that
 * separates them.**
 *
 * **NO RIDGE, GABLE, HIP OR PITCH IS DRAWN BY THIS MODULE.** A city of
 * invented gables would be worse than a city of honest boxes. Asserted at run
 * time (F2.4).
 *
 * A parapet is not a pitch: F2's own aerial sheets are what establish the
 * parapet as the CORRECT San Francisco form, so the tray below is allowed and
 * F2.4's clause was made **strictly stronger** rather than loosened — *the
 * coping sits AT the published height and the deck sits BELOW it, so no vertex
 * of any roof stands above the measured top.*
 */

import { planeQuartile, STROKE_MIN_PX_A } from "./buildings";
import type { FormTable } from "./data";
import { type Frame, shade } from "./terrain";

// ── the height residual ─────────────────────────────────────────────────────

/**
 * THE SUNSET IS ONE BAR, AND IT IS A ROUNDING DEFECT.
 *
 * The shipped stream stores `hgt_mediancm` as **one byte of whole metres**.
 * Neighbouring buildings on the same assessor block differ in published height
 * by a median of **0.90 m**, so over 160,934 neighbour pairs:
 *
 * ```
 *   identical drawn height   published        0.7 %
 *                            as shipped      36.0 %   <- "the Sunset is one bar"
 *                            with residual   14.5 %
 * ```
 *
 * The residual ships beside the byte at a 0.25 m quantum — four levels,
 * `-0.375, -0.125, +0.125, +0.375` — two to a byte. The quantum is deliberately
 * coarse: this same file's HORIZONTAL geometry measures 1.01 m p50 against the
 * published rings, **and a roof level finer than the outline under it is
 * precision the record does not have.**
 *
 * The published byte is UNTOUCHED, so every assertion and hit test that reads
 * it still reads it. F2.2: *166,166 heights move, worst 0.375 m.*
 */
export const RHQ = 0.25;
export const RH_LEVELS: readonly number[] = [-0.375, -0.125, 0.125, 0.375];

export function roofHeight(hByte: number, hf: number): number {
  return hByte + RH_LEVELS[hf & 3];
}

// ── the roof's value inside its own band ────────────────────────────────────

/**
 * THE PUBLISHED VALUE REACHES EVERY ROOF.
 *
 * The roof tone bands are `hgt_mediancm` at **9 / 15 / 25 m**. That is right
 * for the city, and it means **121,419 of 166,166 footprints — every house in
 * the Sunset and the Richmond — fall in band 0 and take one single roof
 * colour**. Band 0's own quartiles are **5.69 / 6.11 / 7.25 m**, which is
 * exactly the range a Sunset blockface occupies.
 *
 * So a roof's value inside its band is its published height against that
 * band's own quartiles — four steps, **monotone in the published height, so
 * the DIRECTION is information; which end is lighter is an art choice and is
 * stated as one.**
 *
 * The amplitude is **±14 %**, and the sweep is why. At 8 % it is inside the
 * "a few per cent of value between neighbours is invisible" that the three
 * roof tones already run ~30 % apart to escape — measured max delta 12/255. At
 * 20 % the fabric starts to read as noise. ±14 % is where a row of houses
 * separates and stays a row.
 *
 * AND IT REACHES THE FABRIC TIER, NOT ONLY THE NEAR PATH. At the DISTRICT
 * camera 42,462 buildings are drawn and only 2,343 of them are near, so
 * **40,119 roofs shared sixteen tones** at the zoom where most of a district is
 * on screen at once. The fabric tier's roof bucket now carries this too — a
 * wider bucket array and **NOT ONE NEW BYTE ON THE PAGE**, because the value is
 * already built from `hgt_mediancm` at load and a building does not change
 * colour when it crosses `NEAR_PX`.
 */
export const RSHADE: readonly number[] = [0.875, 0.958, 1.042, 1.14];

export const HEIGHT_BANDS: readonly number[] = [9, 15, 25];

/** the published quartiles per band, from `manifest.buildings.hq` */
export type Quartiles = readonly (readonly [number, number, number])[];

export function bandOfHeight(h: number): number {
  let b = 0;
  while (b < HEIGHT_BANDS.length && h >= HEIGHT_BANDS[b]) b++;
  return b;
}

/**
 * The step index 0..3 for a building of measured height `h`, against its own
 * band's published quartiles. **Checked element by element, not a hash** (F2.5).
 */
export function roofStep(h: number, hq: Quartiles): number {
  const b = Math.min(hq.length - 1, bandOfHeight(h));
  const q = hq[b];
  if (h < q[0]) return 0;
  if (h < q[1]) return 1;
  if (h < q[2]) return 2;
  return 3;
}

/** the fine roof LUT: four value steps of every roof colour */
export function roofFineLUT(roof: readonly string[]): string[] {
  const out = new Array<string>(roof.length * RSHADE.length);
  for (let c = 0; c < roof.length; c++)
    for (let s = 0; s < RSHADE.length; s++)
      out[c * RSHADE.length + s] = shade(roof[c], RSHADE[s]);
  return out;
}

// ── the storey lines ────────────────────────────────────────────────────────

/**
 * THE STOREY LINE IS A CUT-OFF, NOT A SIZE FLOOR (F2.3).
 *
 * A band under `STOREY_MIN_PX` is **not drawn at all**, never squeezed to a
 * minimum — the distinction measured on `gszV`, where a size floor made a
 * landmark stop shrinking with the city and lurch through a zoom.
 *
 * WHERE IT DOES AND DOES NOT HELP, STATED: it is the dominant treatment
 * downtown, where a wall is 130 px at the ceiling and you can count the floors;
 * and it does **nothing in the Sunset**, 0.0 % of pixels, because the roll's
 * median Sunset house is **1 storey**. The 8.7 % the roll does not count get
 * **none, not a guess.**
 */
export const STOREY_MIN_PX = 4.0;
export const STOREY_W_PX = 14;

export function storeyBandPx(wallPx: number, storeys: number): number {
  return storeys > 0 ? wallPx / storeys : 0;
}

export function drawsStoreyLines(wallPx: number, storeys: number): boolean {
  return storeyBandPx(wallPx, storeys) >= STOREY_MIN_PX;
}

// ── the tray ────────────────────────────────────────────────────────────────

/**
 * A FLAT ROOF IS A TRAY.
 *
 * The measured ring is the **COPING**; the deck is inset by the parapet's
 * declared thickness and dropped by its declared height; and the parapet's
 * **INNER FACE is drawn on exactly the edges whose outer face is not visible**
 * — at any bearing the inside of the far parapet faces the camera and the
 * inside of the near one does not. **That is geometry, not a rule.**
 *
 * The four numbers were chosen by rendering six candidates on one frame: at
 * `deck 0.938 / inner 0.868 / parapet 0.55 m` the tray is nearly invisible; at
 * `0.870 / 0.770 / 1.20 m` the deck reads as sunken and darker than the wall
 * under it. **`0.905 / 0.820 / 0.85 m / 0.40 m thick`** is where a roof
 * separates from its neighbour and stays a roof.
 *
 * ONE DECLARED PARAPET FOR THE WHOLE CITY, because **nothing published records
 * a parapet height per building** and it is confounded in the LIDAR exactly as
 * the spread statistics above are.
 */
export const DE = {
  on: 1,
  tray: 1,
  deck: 1,
  /** the deck's value, as a value of its own roof colour */
  deckv: 0.905,
  /** the parapet's inner face */
  innerv: 0.82,
  /** the parapet's height, metres — DECLARED, one for the whole city */
  parapet: 0.85,
  /** the parapet's thickness, metres — DECLARED */
  thick: 0.4,
  /** the ramp, in CSS px of the building's own projected width.
   *
   * THESE WERE 6.0 AND 22.0, WHICH ARE `LR_FORM_PX` AND `LR_FORM_FULL` — a
   * DIFFERENT ramp in the same file, the one that fades a cap's shape to the
   * prism. `part3.html`'s `DE.tr0/tr1` are **7.0 and 26.0**, and 26 is the
   * number this file's own note two paragraphs down already quotes: *"the
   * previous edge band switched on in ONE STEP at 26 css px of building
   * width"*. The tray was opening a pixel early and reaching full inset four
   * pixels early on every building in the city. */
  tr0: 7.0,
  tr1: 26.0,
};

/**
 * `S(t) = t^2(3-2t)` on the building's OWN projected width, so the derivative
 * is zero at both ends and the change is staggered across the fabric by the
 * city's own sizes rather than landing on one frame.
 *
 * **Nothing is clamped to a minimum: at the bottom of the ramp the inset and
 * the drop go to zero and the roof is exactly the flat fill it was.** It
 * replaces a threshold and a pixel floor — the previous edge band switched on
 * in ONE STEP at 26 css px of building width and then held its width at
 * `Math.max(1.0, ...)`, which is a step in the value and a floor on the width,
 * the two patterns behind every float and lurch this project has had.
 *
 * DE6: `S(tr0) = 0`, `S(tr1) = 1`, `S'` = 1e-6 at both ends, monotone over 400
 * steps, worst step 0.005, and no `Math.max` floor in the source.
 */
export function trayW(px: number): number {
  if (!(DE.on && DE.tray)) return 0;
  const t = (px - DE.tr0) / (DE.tr1 - DE.tr0);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * The per-vertex inward miter of a ring, in world metres.
 *
 * `proj()` is linear, so a WORLD inward offset projects to a fixed screen
 * delta. **The ring is read UNROTATED because the dimetric squash does not
 * preserve a normal's direction and the rotation does.**
 */
export function insetRing(
  rx: ArrayLike<number>,
  ry: ArrayLike<number>,
  vo: number,
  nv: number,
  out: { mx: Float32Array; my: Float32Array },
): void {
  for (let t = 0; t < nv; t++) {
    const p = (t + nv - 1) % nv,
      q = (t + 1) % nv;
    const e1x = rx[vo + t] - rx[vo + p],
      e1y = ry[vo + t] - ry[vo + p];
    const e2x = rx[vo + q] - rx[vo + t],
      e2y = ry[vo + q] - ry[vo + t];
    const L1 = Math.hypot(e1x, e1y) || 1,
      L2 = Math.hypot(e2x, e2y) || 1;
    // outward normal of edge k->k+1 is (ey,-ex) for this ring's winding, so
    // inward is (-ey, ex)
    const n1x = -e1y / L1,
      n1y = e1x / L1,
      n2x = -e2y / L2,
      n2y = e2x / L2;
    let mx = n1x + n2x,
      my = n1y + n2y;
    const dp = n1x * n2x + n1y * n2y,
      s = 1 + dp;
    if (s > 0.2) {
      mx /= s;
      my /= s;
    } else {
      mx = n2x;
      my = n2y;
    }
    const ml = Math.hypot(mx, my);
    if (ml > 3) {
      mx = (mx * 3) / ml;
      my = (my * 3) / ml;
    }
    out.mx[t] = mx;
    out.my[t] = my;
  }
}

const trayMX = new Float32Array(64),
  trayMY = new Float32Array(64),
  trayIX = new Float32Array(64),
  trayIY = new Float32Array(64);

export interface TrayInput {
  /** the ring's projected screen coordinates at the roof plane */
  readonly bx: ArrayLike<number>;
  readonly by: ArrayLike<number>;
  /** the same ring, UNROTATED world coordinates */
  readonly rx: ArrayLike<number>;
  readonly ry: ArrayLike<number>;
  readonly vo: number;
  readonly nv: number;
  /** per-edge: is this edge's OUTER face visible? */
  readonly outerVisible: (k: number) => boolean;
  /** the tray's ramp weight, `trayW(projected width)` */
  readonly w: number;
  /** projected px per world metre, down the screen */
  readonly k2: number;
  readonly roofColour: string;
}

/**
 * Draw one roof as a tray: the parapet's inner face, then the dropped deck.
 *
 * Returns false where the ring is too long for the scratch arrays — the mock's
 * own bound, 64 vertices, which is above the 99.9th percentile of the shipped
 * footprints and below the Presidio's 388-vertex block ring, which is not a
 * roof.
 */
export function drawTray(f: Frame, t: TrayInput): boolean {
  if (t.nv > 64 || t.w <= 0.002) return false;
  const { ctx } = f;
  const c = f.proj.coeffs();
  const ins = DE.thick * t.w;
  const drop = DE.parapet * t.w * f.proj.zexb * t.k2;
  insetRing(t.rx, t.ry, t.vo, t.nv, { mx: trayMX, my: trayMY });
  for (let k = 0; k < t.nv; k++) {
    const mx = trayMX[k],
      my = trayMY[k];
    trayIX[k] = t.bx[k] + (c.ax * mx + c.ay * my) * ins * t.k2;
    trayIY[k] = t.by[k] - (c.bx * mx + c.by * my) * ins * t.k2;
  }
  // the parapet's INNER FACE, on exactly the edges whose outer face is NOT
  // visible. At any bearing the inside of the far parapet faces the camera and
  // the inside of the near one does not; this is geometry, not a rule.
  ctx.fillStyle = shade(t.roofColour, DE.innerv);
  const inner = new Path2D();
  let any = false;
  for (let k = 0; k < t.nv; k++) {
    if (t.outerVisible(k)) continue;
    const u = (k + 1) % t.nv;
    inner.moveTo(t.bx[k], t.by[k]);
    inner.lineTo(t.bx[u], t.by[u]);
    inner.lineTo(trayIX[u], trayIY[u] + drop);
    inner.lineTo(trayIX[k], trayIY[k] + drop);
    inner.closePath();
    any = true;
  }
  if (any) ctx.fill(inner);
  // and the deck itself, inset and dropped
  ctx.fillStyle = shade(t.roofColour, DE.deckv);
  const deck = new Path2D();
  deck.moveTo(trayIX[0], trayIY[0] + drop);
  for (let k = 1; k < t.nv; k++) deck.lineTo(trayIX[k], trayIY[k] + drop);
  deck.closePath();
  ctx.fill(deck);
  return true;
}

// ── the second step ─────────────────────────────────────────────────────────

/**
 * THE SECOND SOLID — and what it is derived from.
 *
 * Every building below is ONE PRISM at `hgt_mediancm`, the median LIDAR return
 * over its footprint. That is the right statistic for a building's MASS and the
 * wrong one for its SILHOUETTE: a median is by construction the height half the
 * roof is below, so anything a MINORITY of the roof does — a tower, a drum, a
 * spire, a campanile, a penthouse — is averaged out of the picture.
 *
 * MEASURED on the case that started this: the Ferry Building's footprint
 * publishes `hgt_mediancm` **15.2 m** over `hgt_maxcm` **71.4 m**. The page
 * drew 15.2 and the clock tower was gone. *A San Franciscan looking at the
 * waterfront and not finding that tower is the whole defect in one building.*
 *
 * THREE PUBLISHED COLUMNS PLUS THE CELL COUNT FIX A TWO-PLANE MODEL EXACTLY:
 *
 * ```
 *   L = hgt_mediancm     the plane already drawn. Unchanged.
 *   T = hgt_maxcm        the highest 50 cm cell in the footprint.
 *   f = (mean - L)/(T - L)   the fraction of cells that must stand at T
 * ```
 *
 * The gate is `T - L >= 6 m` (one San Francisco storey) and
 * `A2 >= 58.06 m2` (25 ft squared), and it fires on **488 footprints**.
 * Widening it four times buys **435 more, 0.26 % of the city**, because on
 * 40,359 of the 68,081 footprints in those bands the published mean sits at or
 * BELOW the published median (the edge cells drag it down) and the model
 * correctly declines. **Two published moments support two planes and no more.**
 *
 * The step stands ABOVE the plane the page already drew, on a MINORITY of its
 * own roof, and its own gate is a CUT-OFF: under its pixel threshold it is not
 * drawn at all, **which is what the retired sprite ladder got wrong.**
 *
 * The visible margin bottoms out at 5.5 m rather than 6.0 because the drawn
 * byte is the median rounded to a whole metre; MEASURED worst case 5.70 m. And
 * `f <= 0.5` caps it; measured worst 0.380.
 */
export const STEP_GATE_DH_M = 6.0;
export const STEP_GATE_A2_M2 = 58.06;
export const STEP_F_CAP = 0.5;
/** the step's own cut-off, CSS px of lift */
export const FSTEP_LIFT_PX = 1.4;
export const FSTEP_W_PX = 0.7;

export function stepFraction(L: number, T: number, mean: number): number {
  if (!(T > L)) return 0;
  return Math.min(STEP_F_CAP, Math.max(0, (mean - L) / (T - L)));
}

export function stepFires(L: number, T: number, a2: number): boolean {
  return T - L >= STEP_GATE_DH_M && a2 >= STEP_GATE_A2_M2;
}

// ── the step, drawn ─────────────────────────────────────────────────────────

/**
 * THE SHAPE FADES TO THE PRISM AS THE CAP GETS SMALL.
 *
 * At `LR_FORM_PX` of lift a dome **is** Block C's cylinder, and it opens
 * continuously from there to `LR_FORM_FULL`. So nothing changes shape on a
 * threshold, and the change is keyed on the CAP'S OWN SIZE and not on the
 * camera — which staggers it across the city instead of landing every dome in
 * San Francisco on one frame of a zoom. That is `roofs/BLOCK-F2.md` §2.3's
 * distinction for the ink line, applied to a silhouette.
 */
export const LR_FORM_PX = 6.0;
export const LR_FORM_FULL = 22.0;

/** the sweep's scratch: 16 profile levels of at most 8 octagon vertices */
const stepSX = new Float32Array(16 * 8);
const stepSY = new Float32Array(16 * 8);
const stepPU = new Float32Array(16);
const stepPS = new Float32Array(16);
const stepWX = new Float32Array(8);
const stepWY = new Float32Array(8);
const stepOX = new Float32Array(8);
const stepOY = new Float32Array(8);
const stepLam = new Uint8Array(8);
const stepVis = new Uint8Array(8);
const stepPath: (Path2D | null)[] = [null, null, null, null];

/* THE CAP SHADES BY THE SAME LAW AS THE SOLID IT STANDS ON, and it did not.
   `octQuartile` was `max(0, n · SUN)` clamped at `LAM0`, which is neither the
   building's rule nor the reference's — see `planeQuartile` in `buildings.ts`
   for both, and for what the clamp was costing. Deleted; the call site reads
   the shared function off the projection's own coefficients. */

export interface StepInput {
  readonly form: FormTable;
  readonly slot: number;
  /** the terrain the building stands on, world metres, UNEXAGGERATED */
  readonly zg: number;
  /** the roof plane already drawn, world metres, AFTER the arrival rise */
  readonly h: number;
  /** the arrival wave: the second solid grows with the building under it */
  readonly rise: number;
  /** the vertex mean the building's own ring was drawn about — `BldTable.cx` */
  readonly ux: number;
  readonly uy: number;
  /** `colourLUT`'s wall table and this building's offset into it */
  readonly wall: ArrayLike<string>;
  readonly wallO: number;
  readonly roofColour: string;
  /** the outline, or null when the cap is under the stroke threshold */
  readonly ink: string | null;
}

/**
 * ONE SECOND SOLID — the octagon of the derived area, swept by the profile its
 * published class was given, standing on the plane the page already drew.
 *
 * Two floors, both in PIXELS OF THE THING ITSELF, and a cap that falls under
 * either is **not drawn at all** — it is never drawn larger than it is, which
 * is what the retired sprite ladder got wrong.
 *
 *   `FSTEP_LIFT_PX`  how far the top plane stands above the roof, on screen.
 *                    This is the one that matters at whole-city zoom, where the
 *                    Ferry Building's tower is 0.9 px wide and 5.0 px tall — *a
 *                    skyline is made of lifts, not of widths.*
 *   `FSTEP_W_PX`     how wide it is, so a 4 × 4 m core on a distant house is
 *                    not a path call for a smear.
 *
 * ── AND THE MEASURED QUANTITY IS KEPT, NOT JUST NOT-EXCEEDED ────────────
 * Block C's cylinder is not an outline, it is a **volume**: the area comes from
 * the published mean, and `A2 × (T − L)` is exactly the volume that mean
 * measures standing above the median plane. Carving a dome out of that cylinder
 * throws a third of the volume away and the drawn landmark would *under*-read
 * the file. So the radius is rescaled by `1/√(∫s²du)` — the drawn solid of
 * revolution has the SAME volume as the cylinder, with the shape being the only
 * thing that changed. A hemisphere is ⅔ of its cylinder, so a domed cap comes
 * out about 9 % wider; a spire, nearer a cone at ⅓, comes out 60 % wider.
 * Computed on the BLENDED profile, so the rescale is continuous with `w` and
 * nothing jumps.
 *
 * The widening is not a licence, and `verify_city_chunks.py` §6d bounds it
 * where it matters: after the rescale not one of the 68 caps is wider than the
 * footprint it stands on — worst 42.3 % of its own roof, median 14.0 %.
 */
export function drawStep(f: Frame, t: StepInput): boolean {
  const F = t.form;
  const s = t.slot;
  const { ctx, cam, proj } = f;
  const kh = proj.zexb * cam.scale;
  const top = F.top[s] * t.rise;
  const lift = (top - t.h) * kh;
  if (lift < FSTEP_LIFT_PX) return false;
  const c = proj.coeffs();
  const lmax = Math.hypot(c.ax, c.ay) || 1;
  const kx = lmax * cam.scale;
  const rad = F.rad[s];
  const wpx = 2 * rad * kx;
  if (wpx < FSTEP_W_PX) return false;

  /* ── the profile, blended toward the cylinder by the cap's own size ──── */
  const pi = F.prof[s];
  const p = pi > 0 ? F.profiles[pi] : undefined;
  let NR = 2;
  if (p && p.u.length > 1 && p.u.length <= 16) {
    const w = Math.max(
      0,
      Math.min(1, (Math.min(lift, wpx * 2.2) - LR_FORM_PX) / (LR_FORM_FULL - LR_FORM_PX)),
    );
    if (w > 0.001) {
      NR = p.u.length;
      let vsum = 0;
      for (let r = 0; r + 1 < NR; r++) {
        const s0 = p.s[r] + (1 - p.s[r]) * (1 - w);
        const s1 = p.s[r + 1] + (1 - p.s[r + 1]) * (1 - w);
        vsum += (p.u[r + 1] - p.u[r]) * (s0 * s0 + s0 * s1 + s1 * s1) / 3;
      }
      const vs = vsum > 0.02 ? 1 / Math.sqrt(vsum) : 1;
      for (let r = 0; r < NR; r++) {
        stepPU[r] = p.u[r];
        stepPS[r] = (p.s[r] + (1 - p.s[r]) * (1 - w)) * vs;
      }
    }
  }
  if (NR === 2) {
    // Block C's own cylinder — profile 0, `prism`, the identity
    stepPU[0] = 0; stepPS[0] = 1;
    stepPU[1] = 1; stepPS[1] = 1;
  }

  /* ── the octagon, at the AREA centroid and in the footprint's own grid ─
     `dx`,`dy` carry the vertex mean the building was drawn about to the
     footprint's true area centroid, and `ang` turns the octagon onto the
     footprint's own dominant edge direction — so a stepped tower shares its
     building's grid instead of sitting at an arbitrary angle to it. */
  const N = Math.min(8, F.octN);
  const ccx = t.ux + F.dx[s];
  const ccy = t.uy + F.dy[s];
  const W2 = f.W / 2;
  const H2 = f.H / 2;
  const bxs = (c.ax * ccx + c.ay * ccy - cam.cx) * cam.scale + W2;
  const bys = H2 - (c.bx * ccx + c.by * ccy + t.zg * proj.zex - cam.cy) * cam.scale;
  const TAU = Math.PI * 2;
  const a0 = F.ang[s];
  for (let k = 0; k < N; k++) {
    const th = a0 + (TAU * k) / N;
    const ox = rad * Math.cos(th);
    const oy = rad * Math.sin(th);
    stepWX[k] = ox;
    stepWY[k] = oy;
    stepOX[k] = (c.ax * ox + c.ay * oy) * cam.scale;
    stepOY[k] = (c.bx * ox + c.by * oy) * cam.scale;
  }
  // screen winding at the base ring, then the same front-face sign test the
  // building's own walls run — one rule for both, at any bearing
  let s2 = 0;
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N;
    s2 += stepOX[k] * -stepOY[k1] - stepOX[k1] * -stepOY[k];
  }
  const sgn = s2 >= 0 ? 1 : -1;
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N;
    stepVis[k] = (stepOX[k1] - stepOX[k]) * sgn > 0 ? 1 : 0;
    stepLam[k] = planeQuartile(
      stepWX[k1] - stepWX[k], stepWY[k1] - stepWY[k], c.ax, c.ay, lmax,
    );
  }

  const dh = t.h * kh;
  const dt = top * kh;
  for (let r = 0; r < NR; r++) {
    const sc = stepPS[r];
    const yy = dh + (dt - dh) * stepPU[r];
    for (let k = 0; k < N; k++) {
      stepSX[r * N + k] = bxs + stepOX[k] * sc;
      stepSY[r * N + k] = bys - stepOY[k] * sc - yy;
    }
  }

  /* ONE PATH PER LAMBERT VALUE OVER THE WHOLE CAP, not one fill per facet: a
     dome is seven rings of eight and that is 56 quads, which as four fills is
     four fills and as 56 fills is a stall. */
  stepPath[0] = stepPath[1] = stepPath[2] = stepPath[3] = null;
  for (let r = 0; r + 1 < NR; r++) {
    /* a band that faces UP takes the next value of the same ramp — the gouache
       move, three flat bands and no gradient */
    const up = (stepPU[r] + stepPU[r + 1]) * 0.5 > 0.72 ? 1 : 0;
    for (let k = 0; k < N; k++) {
      if (!stepVis[k]) continue;
      const u = (k + 1) % N;
      const q = Math.min(3, stepLam[k] + up);
      let pth = stepPath[q];
      if (!pth) { pth = new Path2D(); stepPath[q] = pth; }
      pth.moveTo(stepSX[r * N + k], stepSY[r * N + k]);
      pth.lineTo(stepSX[r * N + u], stepSY[r * N + u]);
      pth.lineTo(stepSX[(r + 1) * N + u], stepSY[(r + 1) * N + u]);
      pth.lineTo(stepSX[(r + 1) * N + k], stepSY[(r + 1) * N + k]);
      pth.closePath();
    }
  }
  for (let q = 0; q < 4; q++) {
    const pth = stepPath[q];
    if (!pth) continue;
    ctx.fillStyle = t.wall[t.wallO + q] ?? t.roofColour;
    ctx.fill(pth);
  }

  // the top plate, in the building's own roof colour — a cap is a roof
  const tr = (NR - 1) * N;
  const ts = stepPS[NR - 1];
  if (ts > 0.02) {
    ctx.fillStyle = t.roofColour;
    ctx.beginPath();
    ctx.moveTo(stepSX[tr], stepSY[tr]);
    for (let k = 1; k < N; k++) ctx.lineTo(stepSX[tr + k], stepSY[tr + k]);
    ctx.closePath();
    ctx.fill();
    if (t.ink && wpx * ts > STROKE_MIN_PX_A) {
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }
  return true;
}

/**
 * NOTHING IS PLACED ON A ROOF, AND THAT IS THE FINDING RATHER THAN A
 * SHORTFALL.
 *
 * The first-return grid's `max - median` is the one statistic that is a genuine
 * UP-signal: a wall-straddling cell drags `min` down and cannot raise `max`. It
 * runs p10 0.37 / p50 1.12 / p90 3.54 m, and a pure ranging-noise order
 * statistic would give ~0.35 m at the p10 — so more than half the city's
 * footprints carry something real standing above the dominant roof plane. A
 * gate demanding that two published moments agree fires on 11,183 footprints,
 * 6.7 % of the city.
 *
 * **And it does not survive the pictures.** The two sheets are not separable:
 * the declined sheet is full of roofs with obvious stairheads, lift overruns
 * and plant enclosures; the fired sheet is full of bare white membrane and of
 * trees. The moment doing the discriminating is `mean - median`, and it is
 * dominated by the same edge and vegetation contamination — the first-return
 * grid records a branch over a footprint as a return on that footprint.
 *
 * So **no rooftop object is drawn from these statistics** (DE7). The up-signal
 * is a real population fact about a CLASS of roof and is not a per-building
 * measurement of one.
 *
 * Also measured and declined: `variety / cells` (single-family 0.31,
 * industrial 0.33 — no separation at all); the **courtyard** (3,282 of 177,023
 * footprints carry an interior ring, median 4 m2, only 511 over 20 m2 —
 * **0.3 % of the city is not a renderer path**); and a published roof-type,
 * solar or roof-plant dataset, **of which there is none** — the only DataSF hit
 * for *roof* / *solar* / *green roof* is `sfnk-6tdn`, 35 rows, and they are
 * Points.
 */
export const NOTHING_IS_PLACED_ON_A_ROOF = true;

/**
 * The one performance note that belongs here rather than in a write-up.
 *
 * **THE BUCKET SPLIT IS THE TRAY'S REAL COST, NOT THE TRAY.** Four times as
 * many roof buckets is four times as many `fill(Path2D)` over the same
 * geometry, and at a camera with a large fabric tier that is ~25 ms. If it has
 * to go, `DE.deck` is the half to drop; `DE.tray` is the half you can see.
 *
 * And the honest price of splitting a batch, on the record rather than
 * asserted away: DE5's silhouette grew by 181 pixels, real and not a defect —
 * two neighbouring roofs that used to be filled in ONE `Path2D` are now filled
 * in two, so the seam between them antialiases instead of being covered solid.
 * The clause now proves those pixels are INTERIOR and bounds them at **174
 * pixels, 0.016 % of the frame.**
 */
export const ROOF_BUCKET_SPLIT_NOTE = true;
