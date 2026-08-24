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
 * **AMENDED 2026-08-24, AND ONLY THE HALF THAT WAS TESTED.** Everything above
 * is about deriving a roof form **per building** from these aggregates, and it
 * is all still true: §THE PRE-FIRE CITY IS PITCHED below re-runs this section's
 * own tower control and finds 326 buildings over 40 m — flat without exception
 * in this city — carrying a modal offset of 115.5 cm. Nothing here cuts a
 * per-building form, and `draw.test.ts` asserts that this module reads no
 * height statistic at all.
 *
 * What was never asked is whether the same statistic separates by ERA on a
 * MATCHED population. It does, by five to eight times, and `DRAW.md` §35.2 has
 * the table. So this module now draws ONE pitched cap, on a population the
 * caller selects from the roll's use class and year — a declared global rule,
 * never a per-building claim, and never randomised. Every observation in this
 * header is consistent with it rather than against it: the 32-house aerial
 * sheet is the **Sunset**, 1920s-40s stock, the flat end of that table; and
 * the one named counterexample it quotes, *"the steeply gabled
 * Haas-Lilienthal House"*, is **1886**.
 *
 * A parapet is not a pitch: F2's own aerial sheets are what establish the
 * parapet as the CORRECT San Francisco form, so the tray below is allowed and
 * F2.4's clause was made **strictly stronger** rather than loosened — *the
 * coping sits AT the published height and the deck sits BELOW it, so no vertex
 * of any roof stands above the measured top.*
 */

import { KEY_DX, KEY_DY, planeQuartile, STROKE_MIN_PX_A } from "./buildings";
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

/**
 * THE TOP OF THE RAMP RAN OFF THE TOP OF THE GAMUT, AND IT WENT PURE WHITE.
 *
 * BUGS.md §4: an unshaded `#ffffff` polygon punched into a Mission roof,
 * sampled at exactly (255, 255, 255) over 3,493 pixels. It is not a missing
 * material and it is not a fallback — it is this LUT.
 *
 * `RSHADE[3]` is 1.14 and `shade()` multiplies each channel and clips it at
 * 255. **The measured aerial palette's four brightest entries are
 * `#eeeee7 · #f3f4ee · #f8f9f5 · #fcfdfb`** — white membrane roofs, which San
 * Francisco has a lot of — and 252 x 1.14 is 287. All three channels clip, so
 * the top step of the top four of the thirty-two measured colours resolves to
 * pure white.
 *
 * Two things are lost and the second is the worse one:
 *
 * · **the value step**, which is the whole point of this table — the four
 *   steps are monotone in the published height and that monotonicity is the
 *   information;
 * · **the hue.** `#fcfdfb` is a hair green. Clipping each channel separately
 *   drives it to neutral (255, 255, 255), so a measured colour is replaced by
 *   one that was never on the roof. Every other roof on the frame carries a
 *   tint; this one carries none, which is exactly what makes it read as a hole
 *   rather than as a pale roof.
 *
 * So the lift is bounded by the colour's own headroom BEFORE it is applied,
 * and bounded as ONE factor across all three channels — `255 / max(r, g, b)` —
 * which is the largest lift that keeps the colour inside the gamut and
 * therefore the largest one that keeps its hue. A roof already at the ceiling
 * of the display simply does not brighten, which is the truth about it. The
 * darkening steps are untouched: nothing clips downward.
 */
export function roofFineLUT(roof: readonly string[]): string[] {
  const out = new Array<string>(roof.length * RSHADE.length);
  for (let c = 0; c < roof.length; c++) {
    const k1 = gamutHeadroom(roof[c]);
    for (let s = 0; s < RSHADE.length; s++)
      out[c * RSHADE.length + s] = shade(roof[c], Math.min(RSHADE[s], k1));
  }
  return out;
}

/**
 * The largest factor `shade()` may be given for this colour without any
 * channel leaving the 0..255 gamut. Always >= 1: a colour with a channel
 * already at 255 gets exactly 1 and does not move.
 */
export function gamutHeadroom(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const m = Math.max(r, g, b);
  if (!(m > 0)) return 1;
  return Math.max(1, 255 / m);
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

/**
 * THE STOREY LINE IS ONE STEP UNDER THE WALL IT IS ON, NOT ONE FIXED BUCKET.
 *
 * `part3.html` L8994 strokes every storey line in `W4[WO+1]` — the wall
 * table's bucket **1**, whatever bucket the wall itself took. That is ported
 * faithfully and it is not a port defect, but bucket 1 is fixed and the wall
 * under it is not: `colourLUT` builds the four buckets at `0.66 + 0.1q`,
 * monotone, so one mark comes out **darker** than a bucket-3 wall,
 * **invisible** on a bucket-1 wall and **lighter** than a bucket-0 wall.
 *
 * Measured (`.parity/g1storey.py`) at the street camera, over every visible
 * wall of every building past the storey gate, weighted by the wall's own
 * drawn area — and the assumption it refuted is worth keeping: the walls that
 * lose the mark are the DARK ones, not the pale ones.
 *
 * ```
 *   camera        bucket 0     1       2       3
 *   Marina         27.3 %    6.9 %   4.4 %   61.4 %
 *   Mission        23.3 %    1.4 %   0.6 %   74.7 %
 *   downtown        2.8 %    7.3 %  45.1 %   44.8 %
 * ```
 *
 * A floor line is the shadow under a slab, so it belongs one step under
 * **whatever plane it is drawn on**. This value is that step, and it is not an
 * art choice: it is the table's own adjacent-bucket ratio, which runs
 * `0.66/0.76 = 0.868`, `0.76/0.86 = 0.884`, `0.86/0.96 = 0.896`. **0.88**
 * reproduces "one bucket darker" to within 1.6 % on all three real steps and,
 * unlike an index, still exists below bucket 0 — which is exactly the case a
 * bucket index cannot serve.
 */
export const STOREY_INK_V = 0.88;

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
  /**
   * THE PARAPET'S **OUTER** FACE, as a value of its own roof colour.
   *
   * The tray drew the parapet's INNER face and left its outer face to be
   * painted as wall — so the one declared feature every flat roof in this city
   * has, the coping band that wraps the top of the wall, existed on the far
   * side of every building and nowhere on the near side. It is the same 0.85 m
   * of solid seen from the other side; painting it as wall is not a
   * simplification, it is a different building.
   *
   * The value comes off the ROOF and not off the wall because that is what the
   * band is: the roof turned up at its edge and capped. It is UNDER `1.0`
   * because the outer face is vertical and the coping it sits under is
   * horizontal, so it takes less of the sky term, and OVER `innerv` because
   * the near face is the one the key light reaches — the same two facts that
   * put `innerv` under `deckv`.
   *
   * Shot at `0.965` first, which is the physically flattering answer and the
   * wrong one to look at: three px of very-nearly-roof-colour reads as the
   * coping bleeding onto the wall rather than as a band. At **`0.90`** the
   * roof edge resolves into three legible steps — coping `1.0`, fascia `0.90`,
   * wall — and a building stops ending in one hard line.
   * `out-g1/zoom-{before,after1,after2}.png`, same four houses on Bay Street.
   */
  outerv: 0.90,
  /**
   * THE SHADOW THE PARAPET THROWS ACROSS ITS OWN DECK.
   *
   * One declared parapet under one fixed key light is one declared shadow, and
   * it is the only dark mark on a roof plane that is otherwise a single flat
   * fill. The light is the same upper-right key `buildings.ts` `shadowOffset`
   * uses, and the two RATIOS ARE READ FROM THERE rather than re-typed, so a
   * building's contact shadow and its parapet's shadow cannot come to disagree
   * about where the sun is.
   */
  castv: 0.855,
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

/**
 * THE INWARD OFFSET OF A REGULAR N-GON, AS A SCALE ABOUT ITS OWN AXIS.
 *
 * `insetRing` has to miter a footprint per vertex because a published ring is
 * any shape. The second solid's plan is not: it is the regular octagon
 * `base/form` declares, so moving every edge in by `d` moves the circumradius
 * in by `d / cos(pi/N)` — the apothem is what an edge offset acts on — and the
 * whole ring is one multiply. Returns 0 when the offset would eat the polygon,
 * so a caller can decline rather than draw an inside-out deck.
 */
export function ngonInsetScale(rad: number, n: number, inset: number): number {
  const apo = rad * Math.cos(Math.PI / n);
  if (!(apo > inset * 1.6)) return 0;
  return 1 - inset / apo;
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

  /* ── THE PARAPET'S SHADOW ON ITS OWN DECK ──────────────────────────────
     The deck was one flat fill of one value over the whole roof plane, which
     at street zoom is the largest single area on the frame and the flattest.
     A parapet is declared; a key light is declared; the shadow is then not a
     choice, it is the two of them.

     The band is the deck MINUS the deck translated DOWN-LEFT by the light's
     own two ratios times the parapet's own projected height — so what is left
     is the crescent along the UP-RIGHT edges, which is exactly the inside of
     the parapet the sun cannot reach. Nonzero winding with the translated ring
     wound BACKWARDS subtracts it in one fill; even-odd would have kept the
     down-left crescent too and lit the wrong side of the roof.

     It costs nothing where the tray costs nothing: `drop` carries `t.w`, so at
     the bottom of the ramp the offset is zero, the two rings coincide and the
     fill is empty. */
  if (drop > 0.35) {
    const sx = drop * KEY_DX;
    const sy = drop * KEY_DY;
    const cast = new Path2D();
    cast.moveTo(trayIX[0], trayIY[0] + drop);
    for (let k = 1; k < t.nv; k++) cast.lineTo(trayIX[k], trayIY[k] + drop);
    cast.closePath();
    // the same ring, translated down-left, wound the other way
    cast.moveTo(trayIX[0] - sx, trayIY[0] + drop + sy);
    for (let k = t.nv - 1; k >= 1; k--) {
      cast.lineTo(trayIX[k] - sx, trayIY[k] + drop + sy);
    }
    cast.closePath();
    ctx.fillStyle = shade(t.roofColour, DE.castv);
    ctx.fill(cast);
  }

  /* ── THE PARAPET'S OUTER FACE ──────────────────────────────────────────
     See `DE.outerv`. Drawn LAST of the tray's four fills because it is the
     nearest of them to the reader: it stands on the wall, in front of the deck
     and in front of the coping's own inner edge. On exactly the edges whose
     outer face IS visible — the complement of the inner face's set, which is
     why the two together wrap the whole ring and neither is a rule. */
  const outer = new Path2D();
  let anyO = false;
  for (let k = 0; k < t.nv; k++) {
    if (!t.outerVisible(k)) continue;
    const u = (k + 1) % t.nv;
    outer.moveTo(t.bx[k], t.by[k]);
    outer.lineTo(t.bx[u], t.by[u]);
    outer.lineTo(t.bx[u], t.by[u] + drop);
    outer.lineTo(t.bx[k], t.by[k] + drop);
    outer.closePath();
    anyO = true;
  }
  if (anyO) {
    ctx.fillStyle = shade(t.roofColour, DE.outerv);
    ctx.fill(outer);
  }
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

  /* ── THE TOP PLATE, AND A CAP IS A ROOF ALL THE WAY DOWN ──────────────
     This was `ctx.fillStyle = t.roofColour` — the roof colour RAW — under a
     comment reading "a cap is a roof", which is exactly the argument against
     what the line did. **No roof in this renderer is drawn at its raw value.**
     `drawTray` fills every roof deck at `shade(roofColour, DE.deckv)` and the
     parapet's inner face at `DE.innerv`, so the plane a reader sees on a roof
     is 0.905 of the palette entry and the raw value survives only on the 0.4 m
     of coping around its edge.

     THIS IS THE SECOND HALF OF BUGS §4. `roofFineLUT`'s gamut clamp above took
     the plate off (255, 255, 255) and gave it its hue back; it did not make it
     a deck, so what is left is a plate that is still the brightest plane on the
     frame. Measured after that fix, not before it.

     MEASURED, BUGS §4 / §19, the State Armory & Arsenal at the block camera
     (`out-c1/c1-armory-blk.png`, sampled off the shipped page): the cap's plate
     is **(252, 253, 251)** and the roof deck it stands in the middle of is
     **(228, 229, 227)**. 228/252 = **0.905**, which is `DE.deckv` to three
     places — the disagreement is not approximately the tray, it IS the tray.
     That building's `ri` is 55, `PAINT_C0` + 31, the brightest entry of the
     measured aerial palette (`#fcfdfb`), so on it the missing 9.5 % is the
     difference between a roof and a hole in the map: BUGS calls it "a pure-
     white polygon … unshaded, on an otherwise shaded roof", and §19 groups it
     with the pier sheds as one defect at two sizes.

     RAMPED ON THE CAP'S OWN WIDTH, not applied flat, for the reason DE6 states
     about `trayW` — *"nothing is clamped to a minimum: at the bottom of the
     ramp the inset and the drop go to zero and the roof is exactly the flat
     fill it was."* A cap 3 px wide at the whole-city camera stands among roofs
     3 px wide, and those are under `DE.tr0` and drawn flat; darkening the cap
     alone there would trade a bug at the block camera for a new one at the wide
     shot. Above `DE.tr1` it is a deck like every other deck. The ramp is
     `trayW` itself, read on the plate's own drawn width, so a cap and a roof of
     the same size on screen are the same value by construction and the two
     cannot drift apart again. */
  const tr = (NR - 1) * N;
  const ts = stepPS[NR - 1];
  if (ts > 0.02) {
    const capTray = trayW(wpx * ts);
    ctx.fillStyle =
      capTray > 0.002
        ? shade(t.roofColour, 1 - (1 - DE.deckv) * capTray)
        : t.roofColour;
    ctx.beginPath();
    ctx.moveTo(stepSX[tr], stepSY[tr]);
    for (let k = 1; k < N; k++) ctx.lineTo(stepSX[tr + k], stepSY[tr + k]);
    ctx.closePath();
    ctx.fill();

    /* ── AND THE PLATE IS A TRAY, FOR THE SAME REASON IT IS A DECK ─────
       §19.1 established that a cap's top plate is a ROOF and gave it the
       deck's value. It stopped there, so what a reader sees on top of every
       tower downtown, on City Hall's drum and on the Ferry Building's clock
       tower is **one flat octagon of one value** — the plainest plane on the
       frame, standing on the most looked-at buildings in the city.

       A tower's roof in San Francisco is a flat roof behind a parapet exactly
       like the 150,000 under it, and `DE` already declares that parapet. So
       the plate takes the same four fills `drawTray` gives a footprint — the
       coping it was just filled with, the parapet's inner face, the inset and
       dropped deck, its cast shadow, and the parapet's outer face — and NOT
       one new declared number. The octagon is regular and convex, so the
       inward offset that `insetRing` has to miter per vertex on a footprint is
       here a scale about the cap's own axis: an edge moved in by `DE.thick`
       moves the circumradius in by `DE.thick / cos(pi/N)`.

       Gated on `capTray`, which is `trayW` on the plate's OWN drawn width, so
       the cap and the roofs around it open their trays together and a cap
       3 px wide at the whole-city camera is still exactly the flat fill §19.1
       made it. */
    const drop = DE.parapet * capTray * kh;
    const fin = ngonInsetScale(rad * ts, N, DE.thick * capTray);
    if (capTray > 0.002 && drop > 0.35 && fin > 0) {
      const yTop = dh + (dt - dh) * stepPU[NR - 1];
      const ix = (k: number): number => bxs + stepOX[k] * ts * fin;
      const iy = (k: number): number => bys - stepOY[k] * ts * fin - yTop + drop;

      // the parapet's inner face, on the facets whose outer face is turned away
      const inner = new Path2D();
      let anyI = false;
      for (let k = 0; k < N; k++) {
        if (stepVis[k]) continue;
        const u = (k + 1) % N;
        inner.moveTo(stepSX[tr + k], stepSY[tr + k]);
        inner.lineTo(stepSX[tr + u], stepSY[tr + u]);
        inner.lineTo(ix(u), iy(u));
        inner.lineTo(ix(k), iy(k));
        inner.closePath();
        anyI = true;
      }
      if (anyI) {
        ctx.fillStyle = shade(t.roofColour, DE.innerv);
        ctx.fill(inner);
      }
      // the deck
      const deck = new Path2D();
      deck.moveTo(ix(0), iy(0));
      for (let k = 1; k < N; k++) deck.lineTo(ix(k), iy(k));
      deck.closePath();
      ctx.fillStyle = shade(t.roofColour, DE.deckv);
      ctx.fill(deck);
      // and the parapet's shadow across it — the deck minus the deck
      // translated down-left, wound backwards. See `DE.castv`.
      const sx = drop * KEY_DX;
      const sy = drop * KEY_DY;
      const cast = new Path2D();
      cast.moveTo(ix(0), iy(0));
      for (let k = 1; k < N; k++) cast.lineTo(ix(k), iy(k));
      cast.closePath();
      cast.moveTo(ix(0) - sx, iy(0) + sy);
      for (let k = N - 1; k >= 1; k--) cast.lineTo(ix(k) - sx, iy(k) + sy);
      cast.closePath();
      ctx.fillStyle = shade(t.roofColour, DE.castv);
      ctx.fill(cast);
      // the parapet's outer face, on the facets that show one
      const outer = new Path2D();
      let anyO = false;
      for (let k = 0; k < N; k++) {
        if (!stepVis[k]) continue;
        const u = (k + 1) % N;
        outer.moveTo(stepSX[tr + k], stepSY[tr + k]);
        outer.lineTo(stepSX[tr + u], stepSY[tr + u]);
        outer.lineTo(stepSX[tr + u], stepSY[tr + u] + drop);
        outer.lineTo(stepSX[tr + k], stepSY[tr + k] + drop);
        outer.closePath();
        anyO = true;
      }
      if (anyO) {
        ctx.fillStyle = shade(t.roofColour, DE.outerv);
        ctx.fill(outer);
      }
    }

    if (t.ink && wpx * ts > STROKE_MIN_PX_A) {
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(stepSX[tr], stepSY[tr]);
      for (let k = 1; k < N; k++) ctx.lineTo(stepSX[tr + k], stepSY[tr + k]);
      ctx.closePath();
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

// ── the pitched cap ─────────────────────────────────────────────────────────

/**
 * THE PRE-FIRE CITY IS PITCHED, AND THE RECORD NOW SAYS SO — BY POPULATION.
 *
 * This module's header refutes deriving pitch **per building** from the
 * published LIDAR aggregates, and that refutation stands: `DRAW.md` §35.2
 * re-runs its own tower control and finds 326 buildings over 40 m — flat
 * without exception in this city — carrying a modal offset of **115.5 cm**.
 * A statistic that reads 115 cm on a certainly-flat tower cannot be cut per
 * building, and nothing here cuts one.
 *
 * What had never been asked is whether the same statistic separates by ERA on
 * a matched population. It does. Single family, ring of at most six vertices,
 * 60-260 m2, bare-earth range under the footprint below 0.6 m, and then
 * matched on building height as well (`DRAW.md` §35.2 has the full table):
 *
 * ```
 *   |modal 1 cm bin - median|, cm      ->1906   1907-29   1930-59   1960-89
 *     height 300-400 cm                  38        8         5         7
 *     height 400-500 cm                  39       12         4        15
 *     height 500-700 cm                  48       26         6        16
 * ```
 *
 * and this file's own arithmetic says what those two ends mean: *"a gable with
 * a 2 m rise spreads its cells over about 200 near-equal one-centimetre bins,
 * so its modal bin would sit of the order of 50 cm from the median"*, against
 * **6 cm** for one plane with noise on it. The pre-1907 cohort sits at 38-48.
 * The 1930-59 cohort sits at 4-6.
 *
 * It is also consistent with every observation the header already made rather
 * than against them: the 32-house aerial sheet that established the flat
 * parapet was the **Sunset**, which is 1920s-40s stock — the flat end of that
 * table — and the one named counterexample it quotes, *"the steeply gabled
 * Haas-Lilienthal House"*, is **1886**.
 *
 * SO: **a global rule keyed on (use class, era), declared, never randomised
 * and never per-building.** The caller decides who is in the population; this
 * function only draws.
 *
 * ── AND IT DOES NOT MOVE THE PUBLISHED STATISTIC ────────────────────────
 *
 * `F2.4` was written for a flat roof, where the published median IS the top,
 * and it says the coping sits at the published height and everything else
 * below it. **A pitched surface's median is not its top — it is mid-slope**,
 * which is exactly what `hgt_mediancm` measures over a pitched footprint. So
 * the general form of the same clause is *the drawn roof must not change the
 * statistic it is drawn from*, and this cap satisfies it strictly: the eave
 * sits `rise/2` BELOW the published plane and the apex `rise/2` above, so the
 * drawn surface's own median is the published median to the centimetre. The
 * building's mass is unchanged and nothing is added to its height.
 */

/** the declared slope, as a rise over a run. 5:12 — the shallow-to-moderate
 *  pitch of a San Francisco wood-frame roof behind its false front, not the
 *  steep alpine gable a steeper number would draw. ONE for the whole city. */
export const PITCH_RUN = 12 / 5;

/** the apex never stands more than this above the published plane, metres —
 *  a cut-off on a large footprint, whose inscribed offset would otherwise put
 *  a barn on a corner store. DECLARED. */
export const PITCH_MAX_HALFRISE_M = 1.3;

/**
 * THE RUN IS THE PLAN'S OWN INSCRIBED OFFSET, FOUND BY TRYING, NOT ESTIMATED.
 *
 * `area / perimeter` is a safe lower bound on the inradius for every simple
 * polygon, and that is what the first cut used — but it is only TIGHT for a
 * long thin plan and it is HALF the answer for a square: a rectangle L x W has
 * `area/per = LW/2(L+W)` against an inradius of `W/2`, a ratio of `1 + W/L`.
 * So on the San Francisco row house, which is the whole population here, the
 * first cut drew about two thirds of the roof it should have and every ridge
 * came out as a wide plateau. MEASURED on a 10 x 20 m plan: run 3.17 m and a
 * rise of 1.32 m, where the plan supports 5.0 and 2.08.
 *
 * The offset that is wanted is the largest one whose MITERED ring has not
 * turned itself inside out, and that is cheaper to test than to derive: walk
 * the multipliers downward and take the first that survives. At the exact
 * inradius a long plan's offset ring collapses onto its own centreline, which
 * is not a failure — **it is the ridge**, and it is why the acceptance test is
 * on the SIGN of the offset ring's area and not on its size.
 *
 * TWO tests, and the second one is the one that matters. **43.1 % of the
 * pitched population is a CONCAVE ring** (8,281 of 14,555 are convex), and a
 * mitered offset of a concave plan bowties before its area changes sign — one
 * pale arrow standing out of a Noe Valley roof in
 * `out/P2-str-noe-1906.hip.prod.png` is exactly that. A bowtie reverses an
 * edge, so the second test is that **every offset edge still runs the way its
 * plan edge ran**, which is O(nv) and catches it. Refusing all 6,274 concave
 * plans instead would have left half of a Victorian block flat and half of it
 * pitched, which reads as a bug rather than as a record.
 */
const PITCH_RUN_MULT: readonly number[] = [1.95, 1.6, 1.3, 1.0];

/**
 * The cap's own cut-off, CSS px of total rise on screen. Under it the cap is
 * NOT DRAWN AT ALL — never squeezed to a minimum, which is the distinction
 * `gszV` and `FSTEP_LIFT_PX` already record in this file.
 */
export const PITCH_MIN_RISE_PX = 2.0;

/** the three slope values, as values of the roof's own colour, by
 *  `planeQuartile` — the SAME law the wall buckets use, so a slope facing the
 *  key light and a wall facing it cannot come to disagree about where the sun
 *  is. Monotone, and centred on 1.0 so a pitched roof has the same mean value
 *  as the flat roof it replaces. */
export const PITCH_V: readonly number[] = [0.845, 0.935, 1.02, 1.075];

const hipEX = new Float32Array(64),
  hipEY = new Float32Array(64),
  hipRX = new Float32Array(64),
  hipRY = new Float32Array(64),
  hipMX = new Float32Array(64),
  hipMY = new Float32Array(64);

export interface HipInput {
  /** the ring projected at the PUBLISHED plane — `tx`/`ty` at the call site */
  readonly bx: ArrayLike<number>;
  readonly by: ArrayLike<number>;
  /** the same ring, UNROTATED world metres */
  readonly rx: ArrayLike<number>;
  readonly ry: ArrayLike<number>;
  readonly vo: number;
  readonly nv: number;
  /** projected px per world metre, down the screen */
  readonly k2: number;
  /** projected px per world metre of BUILT HEIGHT — `proj.zexb * cam.scale` */
  readonly kh: number;
  /** `proj.coeffs()`, for the world→screen inward offset */
  readonly cax: number;
  readonly cay: number;
  readonly cbx: number;
  readonly cby: number;
  /** `planeQuartile`'s gradient axis and its length */
  readonly ax: number;
  readonly ay: number;
  readonly lmax: number;
  readonly roofColour: string;
  /** the outline, or null under the stroke threshold */
  readonly ink: string | null;
}

/**
 * ONE HIPPED CAP — the mitered inward offset of the published ring, lifted.
 *
 * A hip roof IS the straight skeleton of its own plan, and a mitered inward
 * offset is that skeleton's own construction: offset every edge inward by the
 * run and the offset ring IS the ridge. `insetRing` already builds exactly
 * that miter for `drawTray`, so this reuses it rather than inventing a second
 * offset. A long footprint's offset ring collapses onto its centreline and the
 * cap comes out a gable with hipped ends; a squarer one keeps a short ridge
 * platform. **Nothing chooses between those two — the plan does.**
 *
 * The offset is `0.95 * area / perimeter`, which is at or below the inradius
 * for every simple polygon (it equals it for a long rectangle and is half of
 * it for a square), **so the ring can never invert and there is no clamp to
 * tune.** The rise follows from the offset and the declared pitch, so a narrow
 * house gets a low roof and a deep one a taller one, off the plan and not off
 * a table.
 *
 * Returns false when the cap is under its own cut-off or the ring is longer
 * than the scratch, and the caller then draws the flat roof it always drew.
 */
export function drawHip(f: Frame, t: HipInput): boolean {
  const { nv } = t;
  /* 12, not 64. Above it a plan is not a house — 167 of the 14,555 footprints
     in the population carry more than twelve vertices — and the edge-reversal
     test below is the only thing standing between a complicated ring and a
     bowtie on the roof. A refusal here draws the flat roof, which is what the
     page drew before. */
  if (nv < 3 || nv > 12) return false;
  // the plan's own area and perimeter, in world metres
  let a2 = 0;
  let per = 0;
  for (let k = 0; k < nv; k++) {
    const k1 = (k + 1) % nv;
    const x0 = t.rx[t.vo + k],
      y0 = t.ry[t.vo + k],
      x1 = t.rx[t.vo + k1],
      y1 = t.ry[t.vo + k1];
    a2 += x0 * y1 - x1 * y0;
    per += Math.hypot(x1 - x0, y1 - y0);
  }
  const area = Math.abs(a2) * 0.5;
  if (!(per > 0) || !(area > 0)) return false;
  const wind = a2 >= 0 ? 1 : -1;
  insetRing(t.rx, t.ry, t.vo, nv, { mx: hipMX, my: hipMY });
  /* the largest offset whose mitered ring is still wound the way the plan is.
     `insetRing` returns the per-vertex miter DIRECTION at unit offset, so one
     call serves every candidate and the loop is arithmetic. */
  const d0 = area / per;
  let run = 0;
  for (let c = 0; c < PITCH_RUN_MULT.length; c++) {
    const d = d0 * PITCH_RUN_MULT[c];
    let s2 = 0;
    for (let k = 0; k < nv; k++) {
      const k1 = (k + 1) % nv;
      const x0 = t.rx[t.vo + k] + hipMX[k] * d,
        y0 = t.ry[t.vo + k] + hipMY[k] * d,
        x1 = t.rx[t.vo + k1] + hipMX[k1] * d,
        y1 = t.ry[t.vo + k1] + hipMY[k1] * d;
      s2 += x0 * y1 - x1 * y0;
    }
    if (s2 * wind < 0) continue;
    let simple = true;
    for (let k = 0; k < nv && simple; k++) {
      const k1 = (k + 1) % nv;
      const ex = t.rx[t.vo + k1] - t.rx[t.vo + k],
        ey = t.ry[t.vo + k1] - t.ry[t.vo + k];
      const fx = ex + (hipMX[k1] - hipMX[k]) * d,
        fy = ey + (hipMY[k1] - hipMY[k]) * d;
      if (ex * fx + ey * fy < 0) simple = false;
    }
    if (simple) {
      run = d;
      break;
    }
  }
  if (!(run > 0)) return false;
  let half = (run / PITCH_RUN) * 0.5;
  if (half > PITCH_MAX_HALFRISE_M) half = PITCH_MAX_HALFRISE_M;
  const risePx = 2 * half * t.kh;
  if (!(risePx >= PITCH_MIN_RISE_PX)) return false;

  const halfPx = risePx * 0.5;
  for (let k = 0; k < nv; k++) {
    // the eave: the published ring, half the rise BELOW the published plane
    hipEX[k] = t.bx[k];
    hipEY[k] = t.by[k] + halfPx;
    // the apex ring: the mitered inward offset, half the rise above it
    const mx = hipMX[k],
      my = hipMY[k];
    hipRX[k] = t.bx[k] + (t.cax * mx + t.cay * my) * run * t.k2;
    hipRY[k] = t.by[k] - (t.cbx * mx + t.cby * my) * run * t.k2 - halfPx;
  }

  const { ctx } = f;
  /* PAINTER'S ORDER INSIDE THE CAP. Every slope of a roof seen from above is
     visible, but the apex ring can project ABOVE a far eave once the vertical
     exaggeration is applied, so the far slopes go down first and the near ones
     over them. The far/near test is the ring's own screen winding — the same
     one `drawTray` uses for the parapet's two faces, so the two cannot come to
     disagree about which edge is which. */
  const sgn = 1; // see `buildings.ts` BUGS §2 and the call site: the winding
  //               test is screen-x and its sign is settled at +1.
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < nv; k++) {
      const k1 = (k + 1) % nv;
      const nearEdge = (t.bx[k1] - t.bx[k]) * sgn > 0;
      if ((pass === 0) === nearEdge) continue;
      const q = planeQuartile(
        t.rx[t.vo + k1] - t.rx[t.vo + k],
        t.ry[t.vo + k1] - t.ry[t.vo + k],
        t.ax, t.ay, t.lmax,
      );
      ctx.fillStyle = shade(t.roofColour, PITCH_V[q]);
      ctx.beginPath();
      ctx.moveTo(hipEX[k], hipEY[k]);
      ctx.lineTo(hipEX[k1], hipEY[k1]);
      ctx.lineTo(hipRX[k1], hipRY[k1]);
      ctx.lineTo(hipRX[k], hipRY[k]);
      ctx.closePath();
      ctx.fill();
    }
  }
  /* ONE OUTLINE, ON THE EAVE, and not one per slope. The four value steps
     already separate the slopes from each other; what the line is for is
     separating this building from the one beside it, which is the EAVE — and
     an ink line down every hip turns a block of houses into a wire model. */
  if (t.ink) {
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hipEX[0], hipEY[0]);
    for (let k = 1; k < nv; k++) ctx.lineTo(hipEX[k], hipEY[k]);
    ctx.closePath();
    ctx.stroke();
  }
  return true;
}
