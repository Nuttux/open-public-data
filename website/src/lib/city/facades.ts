/**
 * facades.ts — openings, storey rhythm, entrances, cornices, shopfronts.
 *
 * Block P3. Ported from `gen/part3.html` §THE ENVELOPE (`FA*`, `faWall`,
 * `faFlush`) with `facade/BLOCK-FACADE.md`.
 *
 * ── THE ONE THING THAT IS NOT PUBLISHED AND IS DRAWN ANYWAY ─────────────
 * **The roll does not record where a window is.** It counts storeys, rooms,
 * units and floor area. What is inside a wall here is *a typical facade
 * consistent with the published storey count, class, era and measured wall* —
 * **not a survey of that building** — and the page says so in those words.
 * That is the same separation this map already makes between measured and
 * modelled, and it is the reason `manifest.facade.NOT_MEASURED` exists.
 *
 * Every module, opening proportion and glazed fraction below is a convention,
 * declared once per (type, era) and **never per building**. What is per
 * building is which convention it gets, and that is four published columns.
 */

import { type Frame, shade, wallGrad } from "./terrain";

// ── the published vocabulary ────────────────────────────────────────────────

export const FA_TYPES: readonly string[] = [
  "HOUSE",
  "FLATS",
  "APARTMENT",
  "RETAIL",
  "OFFICE",
  "INDUSTRIAL",
  "INSTITUTION",
  "HOTEL",
  "GARAGE",
  "UNCLASSED",
];

/** Block WARMTH's own bands off the same year column, so the rule is stated
 *  once and read twice. */
export const FA_ERA_YR: readonly number[] = [1907, 1925, 1950, 1980];

export function faEra(year: number): number {
  let e = 0;
  while (e < FA_ERA_YR.length && year >= FA_ERA_YR[e]) e++;
  return e;
}

/**
 * The published gates, carried in `manifest.facade.gates` so the renderer and
 * the encoder cannot drift.
 */
export const FA_GATES = {
  /** another published footprint measured standing this far outside the edge */
  PARTY_M: 0.6,
  PARTY_HITS: 2,
  /** the search radius for the centreline that decides which face is the front */
  FRONT_MAX_M: 42.0,
  FRONT_ANG: 0.55,
  FRONT_OUT_M: 3.0,
  GAR_FLOOR_M: 2.9,
  GAR_MIN_M: 2.4,
} as const;

/** the fraction of its band an opening may fill */
export const FA_HMAX_F = 0.8;
/** metres. A door reaches the ground. */
export const FA_DOOR_H = 2.15,
  FA_DOOR_W = 0.78;
/** metres. A warehouse or garage opening. */
export const FA_VEH_H = 3.0,
  FA_VEH_W = 4.2;
/** metres. The cornice band and its shadow. */
export const FA_CORN_M = 0.6,
  FA_CORN_T = 0.14;
/** metres. Stallriser and fascia. */
export const FA_SHOP_SILL = 0.42,
  FA_SHOP_FASCIA = 0.72;

/* ── THE WALL'S OWN FOOT ─────────────────────────────────────────────────
 *
 * `buildings.ts` `SHADOW_FILL` lays a contact shadow ON THE GROUND and stops
 * at the wall. **The wall's own foot gets nothing**, so every building in this
 * city meets the pavement at a hard edge with the same value on it as three
 * storeys up. This is not a missing architectural element — this file would
 * have no right to invent a plinth, and `part3.html` has none — it is the
 * OTHER HALF OF A SHADOW THE RENDERER ALREADY DECLARES. A surface a pavement's
 * width from a pavement takes less of the sky than the same surface nine
 * metres up, and the ground beside it is already drawn on exactly that basis.
 *
 * One declared band, one for the whole city, in **the wall's own colour** at a
 * value of it — exactly as every other mark in this file is a value of the
 * wall it sits on. No new colour, and no claim about any building.
 *
 * `FA_FOOT_M` 0.9 m is where the band stops reading as contact and starts
 * reading as a plinth, which WOULD be a claim. It also sits under the sill of
 * every opening `FA_VOCAB` places and over `FA_SHOP_TOE` — so a shopfront's
 * glazing paints straight back over it and a shop keeps its glass to the
 * pavement by construction rather than by a rule.
 *
 * `FA_FOOT_CAP` is a geometric constraint and not a taste: the foot of a wall
 * cannot be most of the wall. On a 2.2 m shed 0.9 m would be 41 % of it.
 */
export const FA_FOOT_M = 0.9;
/**
 * THE FOOT IS THE SAME INK AS THE SHADOW ON THE GROUND, AND IT IS TRANSLUCENT.
 *
 * Two versions of this were shot and both were wrong for the same reason.
 * Flat `shade(col, 0.90)` reads as a PLINTH — a rectangle of one darker value
 * with a hard top edge, which is a claim about the building. A gradient in the
 * wall's own colour fixed the edge and broke something worse: **it came out
 * LIGHTER than the wall it was drawn on.** `terrain.ts` `WA.wbot` is 0.855, so
 * a wall tall enough to carry `wallGrad` is already at 0.855 of its colour
 * where it meets the street, and an opaque 0.82 band computed off the FLAT
 * colour overwrote it with something paler. Measured down one Bay Street wall,
 * `.parity/out-g1/one-{z5,foot2}.png`, x = 1860: (161,152,136) became
 * (174,165,148) — the mark was *removing* contact.
 *
 * An occlusion does not have a colour. It darkens whatever is under it, and
 * what is under it here is `wallGrad`, a shopfront's glazing, a garage door or
 * a flat fill. So the foot is **the same ink `buildings.ts` `SHADOW_FILL`
 * lays on the ground** — `rgb(72, 60, 42)` — at an alpha that runs from zero
 * at the top of the band to `FA_FOOT_A` at the contact line. It composites
 * over anything, it can never invert, and it makes the claim it should: that
 * this is one shadow, drawn on the ground and on the wall it belongs to.
 */
export const FA_FOOT_INK = "72, 60, 42";
/** the alpha at the contact line. `SHADOW_FILL` is 0.16 flat on the ground. */
export const FA_FOOT_A = 0.2;
/** the foot is never more than this fraction of the wall it stands at */
export const FA_FOOT_CAP = 0.22;
/** the ramp, in CSS px of the BAND'S OWN drawn height */
export const FA_FOOT_PX0 = 1.1,
  FA_FOOT_PX1 = 4.0;

/**
 * `S(t) = t²(3−2t)` on the band's own projected height.
 *
 * **A CUT-OFF AND A RAMP, NEVER A FLOOR.** Under `FA_FOOT_PX0` the band is not
 * drawn at all and the wall is exactly the flat fill it was; it is never held
 * at a minimum height, which is the pattern behind every float and lurch this
 * project has had. At the block camera the band is 0.9 × 1.6 × 0.336 = 0.48 px
 * and this returns 0, so nothing is smeared across a fabric that cannot
 * resolve it — see DRAW.md §23, which measures why that is the right answer
 * there and not a shortfall.
 */
export function footWeight(bandPx: number): number {
  const t = (bandPx - FA_FOOT_PX0) / (FA_FOOT_PX1 - FA_FOOT_PX0);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

const footCaches = new WeakMap<
  CanvasRenderingContext2D, Map<string, CanvasGradient>
>();

/**
 * The foot's falloff: `SHADOW_FILL`'s own ink at alpha 0 at the top of the
 * band, running to `FA_FOOT_A` at the contact line, ramped by `footWeight` so
 * it opens with the camera and reaches nothing at the bottom of its own ramp.
 * It carries no colour of its own, so it cannot be lighter than what it is
 * drawn over — see `FA_FOOT_INK` for the version that was.
 *
 * Quantised and cached on the ctx exactly as `wallGrad` is, because a gradient
 * object per wall per frame is 4,000 allocations at the street camera and the
 * two ends round to the same pair of pixels across a whole blockface.
 */
export function footGrad(
  g: CanvasRenderingContext2D,
  yTop: number,
  yBot: number,
  w: number,
): CanvasGradient {
  let m = footCaches.get(g);
  if (!m) { m = new Map(); footCaches.set(g, m); }
  const a = Math.round(yTop), b = Math.round(yBot);
  const wq = Math.round(w * 16);
  const k = a + "|" + b + "|" + wq;
  let gr = m.get(k);
  if (gr === undefined) {
    gr = g.createLinearGradient(0, a, 0, b === a ? a + 1 : b);
    gr.addColorStop(0, `rgba(${FA_FOOT_INK}, 0)`);
    gr.addColorStop(1, `rgba(${FA_FOOT_INK}, ${(FA_FOOT_A * wq) / 16})`);
    if (m.size > 6000) m.clear();
    m.set(k, gr);
  }
  return gr;
}

/**
 * THE SEVEN VALUES A FACE IS DRAWN IN, AND EVERY ONE IS A VALUE OF THE WALL'S
 * OWN COLOUR.
 *
 * `part3.html` §THE ENVELOPE carries them on its `FA` object as
 * `glass / glassM / litv / bayv / shadv / awnv`, and this port had four of
 * them typed in at different numbers with nothing behind the difference:
 *
 * ```
 *              mock    port as landed
 *   glass      0.575   0.52     an opening 10 % darker on every wall in the city
 *   glassM     0.735   0.74
 *   litv       1.115   1.12  (sill/reveal) and 1.2 (the glazing bar)
 *   bayv       1.045   1.04
 *   shadv      0.795   — the group does not exist
 *   ground     glass   0.62     a shopfront darker than the windows above it
 * ```
 *
 * The mock has **no separate value for a glazing bar**: sills, lit reveals,
 * glazing bars and the cornice band are one group at `litv`. This port keeps
 * the bar in its own group so it can be drawn OVER the opening — see
 * `flushFaces` — but it is drawn at `litv`, because 1.2 was a number nobody
 * chose.
 */
export const FA_V = {
  /** an opening, as a value of its own wall colour */
  glass: 0.575,
  /** ...for a curtain wall, which reflects the sky instead of showing a room */
  glassM: 0.735,
  /** sills, lit reveals, glazing bars and the cornice band */
  lit: 1.115,
  /** the bay's own face */
  bay: 1.045,
  /** the shadow a cornice or a bay throws on the wall under it */
  shad: 0.795,
} as const;

/**
 * A CURTAIN WALL REFLECTS THE SKY INSTEAD OF SHOWING A ROOM.
 *
 * `part3.html` §9034 passes `(era >= 4) || (type === OFFICE && era >= 3)` into
 * `faFlush`, so post-1980 of any type and an office from 1950 on take
 * `glassM`. Both halves are the published year column read in Block WARMTH's
 * own bands, and nothing else decides it.
 *
 * **This port passed `false`.** Every tower in the Financial District — which
 * is where Daniel was looking when he wrote *"you cant distinguish any
 * building"* — was drawn with punched dark holes at 0.52 of its wall instead of
 * a sky-lit curtain wall at 0.735, a gap of 0.215 of the wall's value on the
 * one class of building the whole frame is made of.
 */
export function faGlassy(type: number, era: number): boolean {
  return era >= 4 || (FA_TYPES[type] === "OFFICE" && era >= 3);
}

// ── the ramps ───────────────────────────────────────────────────────────────

/**
 * THE RAMPS. Each is `[start, full]` in CSS px of **THE FEATURE'S OWN
 * projected size** — never the camera's.
 *
 * *A floor is a step in the first derivative, and a threshold is a step in the
 * value.* Every tier fades in over a band of its own projected size with
 * `S(t) = t^2(3-2t)`, whose derivative is zero at both ends — so nothing pops
 * on, and the geometry is **never clamped to a minimum**. Keyed on the feature
 * and not on the camera, so the change is staggered across the fabric.
 *
 * **The ramp is an ALPHA, not a gate.** The first working version computed the
 * weights and then used them only as on/off tests, which is a threshold — a
 * step in the *value*, worse than the pixel floor the project banned.
 * Corrected: each group is composited at `S(t)`, so a tier at the bottom of its
 * ramp is a faint tone on the wall and the geometry is never clamped.
 */
export const FA_RAMP = {
  /** an ordinary opening. A tenth of a pixel above what block zoom can hold,
   *  so a window is not drawn where it is genuinely sub-pixel. */
  op: [0.9, 2.8],
  /** the ground-floor feature. A shopfront is a much bigger object than a
   *  window and arrives earlier — it is what makes a Mission blockface read
   *  as *shops* rather than as *walls*. */
  ground: [1.2, 3.6],
  /** sill and lit reveal. Below three pixels a sill is one grey line and reads
   *  as noise. */
  sill: [3.0, 6.0],
  /** a glazing bar. A mullion inside a five-pixel window is not a mullion. */
  bar: [5.5, 9.5],
  /** the cornice, keyed on the band's projected DEPTH: it is a 0.60 m band, so
   *  it is small in pixels long after the building is large. */
  cornice: [0.55, 1.6],
  /** the bay window, keyed on the bay's projected WIDTH. */
  bay: [4.0, 10.0],
} as const;

export function faRamp(v: number, a: number, b: number): number {
  const t = (v - a) / (b - a);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * THE ONE HARD EARLY-OUT, and it is **exact rather than tuned**.
 *
 * `dh < 2.0 px`. The opening is capped at `FA_HMAX_F` = 0.80 of its band and
 * `band <= dh`, so at `dh = 2.0` the opening is at most 1.6 px, which is
 * `FA_RAMP.op[0]` — where the ramp is already zero. **It removes nothing that
 * would have been drawn.**
 */
export const FA_MIN_DH_PX = 2.0;

// ── the storey question, and the refusal ────────────────────────────────────

/**
 * FLOOR-TO-FLOOR IS NOT FITTED, AND THAT IS THE FINDING.
 *
 * `roofs/BLOCK-F2.md` §2.2 measured that the roll's storey count and the LIDAR
 * median disagree systematically — height by published storey runs
 * **6.0 / 8.4 / 10.9 / 12.1 m**, increments of 2.4 m, **which is not a floor**
 * — and declined to fit the relation. A later run re-fitted it on dwellings
 * alone (5.9 / 7.6 / 9.1 / 10.6, increments 1.5–1.7 m) and reached the same
 * verdict. **So no uncounted storey is invented.**
 *
 * THE TWO INDEPENDENT PUBLISHED MEASUREMENTS AGREE. The storey column is not
 * undercounting finished floors — a 1-storey house really does hold one floor
 * of floor area, and only **10.4 %** of them hold as much as 1.6. So the six
 * metres a "1-storey" Sunset house measures is **not a second finished floor**;
 * it is a level the Assessor does not count as floor area, which in this city
 * is the garage.
 *
 * REJECTED, AND WHY. Putting a garage door on that base would make the Sunset
 * look right and would be an inference (a measured residual) layered on a claim
 * (that the residual is a garage) over 66,075 buildings. **The base is left as
 * wall.**
 */
export const FA_NO_FITTED_FLOOR_HEIGHT = true;

/**
 * The opening's geometry inside its band.
 *
 * THE SILL IS A FRACTION OF THE BAND, NOT A METRE OFFSET. A fixed
 * `sill = 0.95 m` with a fixed `opening ~= 2.0 m` puts, on a Sunset house of
 * one published storey and six measured metres, a window in the bottom third
 * and three metres of blank wall over it — **which reads as a windowless upper
 * floor: an artefact of the disagreement above, drawn as if it were a fact.**
 *
 * The metre CAP survives (a window is not four metres tall); the metre OFFSET
 * does not.
 */
export function openingInBand(
  bandM: number,
  hFrac: number,
  capM: number,
  sillFrac: number,
): { h: number; sill: number } {
  const h = Math.min(capM, bandM * Math.min(FA_HMAX_F, hFrac));
  return { h, sill: (bandM - h) * sillFrac };
}

/**
 * THE JOIN BUG THAT WAS FOUND BY LOOKING AT A PICTURE.
 *
 * The brief asked for a **Marina apartment block**. The first after-shot of one
 * was **identical to the before-shot** — not one face on any wall — while the
 * Mission and the Sunset were full of them. *That is exactly the kind of thing
 * screenshots catch and a green suite does not.*
 *
 * `bldg/ingest.py` reads the footprint file's `mblr` as **`mblr[2:9]`, a fixed
 * seven-character slice**. But `wv5m-vpq2`'s `parcel_number` is seven, eight or
 * nine characters — 176,031 / 32,003 / 3,513 of 211,547 roll rows — and the
 * footprint's `mblr` is `SM` + that same parcel number. **A fixed
 * seven-character slice truncates every parcel on an assessor block with a
 * letter suffix.** Block 0460A lot 001 is published as `0460A001`; the slice
 * asks for `0460A00`, which matches nothing.
 *
 * Those blocks are not scattered — they are the later-platted parts of the
 * city, **the Marina above all**, which is precisely the blockface that came
 * out bare. The whole key resolves 159,656 of 166,166 (96.1 %) against the
 * slice's 149,445 (89.9 %); of the 16,721 the slice missed, 8,640 (51.7 %) have
 * a letter in the parcel number.
 *
 * The supplement ships beside the primary stream as `st2`, and the renderer
 * **reads `st` first**, so the correction fills holes and never contests a
 * value the primary stream already ships. The two derivations agree on
 * **9,984 of 9,984**, which is the evidence the fix recovered published data
 * rather than inventing it.
 */
export const FA_ST2_IS_A_SUPPLEMENT = true;

export function storeysOf(st: number, st2: number): number {
  return st > 0 ? st : st2;
}

// ── the role bits ───────────────────────────────────────────────────────────

/**
 * THE TWO BITS, AND THEY WERE THE WRONG WAY ROUND.
 *
 * `facade/build_facade.py` L291 writes the stream and names its own values in
 * the same line: **`role = np.zeros(NV, np.uint8)  # 0 back, 1 front, 2
 * party`**, and `part3.html` `faWall` reads it back the same way twice —
 * `if (FA.party && role === 2) return 0` for the party rule, and `pv === 2` for
 * which end of a wall the entrance is against.
 *
 * P3 landed `ROLE_PARTY = 0` and `ROLE_BACK = 2`. Nothing threw, nothing failed
 * a test, and the consequence went straight into the frame the piece is looked
 * at in: `faceTakesOpenings` refused every one of the city's **back** walls and
 * allowed all **163,536 measured party edges**, which is the opposite of the
 * rule the constant is named for. A row of Mission houses was drawn with
 * windows in the walls it shares with its neighbours.
 *
 * `ROLE_SIDE = 3` is kept and is unreachable — the stream is two bits and the
 * builder writes three values.
 */
export const ROLE_BACK = 0;
export const ROLE_FRONT = 1;
export const ROLE_PARTY = 2;
export const ROLE_SIDE = 3;

/**
 * A MEASURED PARTY WALL CARRIES NO OPENINGS.
 *
 * Not a convention: a party edge is one with at least `PARTY_HITS` other
 * published footprints measured standing `PARTY_M` outside it. 163,536 of the
 * 885,776 published ring edges are party edges, and none of them gets a window.
 */
export function faceTakesOpenings(role: number): boolean {
  return role !== ROLE_PARTY;
}

/**
 * THE BAY WINDOW IS A CLAIM ABOUT A TYPE, NOT A READING OF A COLUMN, AND IT
 * SAYS SO.
 *
 * `roofs/BLOCK-F2.md` §1 established that no published field records a bay, an
 * oriel or any projection, and its own aerial check found the modal SF roof
 * flat. The bay is drawn anyway because it is the signature of the city — but
 * it is drawn **in the plane of the measured wall**, it never leaves the
 * footprint, and it is behind its own flag so the difference can be looked at.
 * It is the one feature here that is a claim about a *type* rather than a
 * reading of a *column*.
 */
export const FA = {
  on: 1,
  /** the bay window — a declared claim, switchable */
  bay: 1,
  /** cheaper while the camera moves. MEASURED AT EXACTLY ZERO, and kept only
   *  because it is correct in principle and costs one branch: a move is served
   *  from a blit, so the city is not re-rasterised and the facade is not drawn.
   *  The clause is satisfied by the blit, not by this. */
  motion: 1,
};

if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityFA?: typeof FA }).__cityFA = FA;
}

export function faBayOK(
  type: number,
  era: number,
  role: number,
  storeys: number,
): boolean {
  if (!FA.bay) return false;
  const t = FA_TYPES[type];
  if (t !== "HOUSE" && t !== "FLATS") return false;
  if (role !== ROLE_FRONT) return false;
  // pre-1950, and more than one published storey
  if (era >= 2) return false;
  return storeys > 1;
}

// ── the wall ────────────────────────────────────────────────────────────────

/**
 * A FACE HAS MATERIAL INSIDE IT.
 *
 * At street zoom a wall is a hundred and fifty pixels of exactly one colour
 * ending in a hard edge. Outdoors a wall never is one value: the top of it sees
 * the whole sky dome and the foot of it sees the street, the building opposite
 * and its own shadow. The grade from top to bottom is the only thing on the
 * surface that says it is standing up, and it is an **HONEST GLOBAL
 * TREATMENT** — the same grade, in the same direction, on every wall in the
 * city, taken as a value of the wall's OWN colour. Nothing varies building to
 * building except what the material tables decided.
 *
 * Asserted by **photographing it, not by reading the source** (WA2): the frame
 * is rendered twice, band and grade on and off, and differenced. The silhouette
 * must not grow **or shrink** by one pixel in either direction while the colour
 * moves.
 *
 * And WA2 measures COVERAGE, NOT PIXEL SITES, which is that clause's own
 * sentence finally being what the code does: it says "the silhouette does not
 * grow by ONE PIXEL"; it counted pixel SITES, so one site at alpha 1/255 — a
 * coverage of 0.004 px — failed it. `grew == 0` was true of the camera the
 * suite picks and of nothing else.
 */
export function drawWallGrade(
  f: Frame,
  path: Path2D,
  yTop: number,
  yBot: number,
  wallColour: string,
): void {
  const { ctx } = f;
  ctx.fillStyle = wallGrad(ctx, yTop, yBot, wallColour);
  ctx.fill(path);
}

/**
 * THIS BLOCK DRAWS NO STROKES AT ALL, and that is structural rather than lucky.
 *
 * Every feature — opening, sill, reveal, glazing bar, mullion, cornice, bay,
 * shopfront — is a **filled path in world metres**, so it scales exactly with
 * the camera and with the backing store, and **no DPR decision and no
 * buffer-resolution decision can change its weight.** Whatever the resolution
 * tier concludes, nothing here needs revisiting.
 */
export const FA_NO_STROKES = true;

export interface FaceInput {
  /** the wall's world length and height, metres */
  readonly Lm: number;
  readonly Hm: number;
  /** the wall's projected height in CSS px */
  readonly dhPx: number;
  /**
   * The wall's own projected LENGTH in CSS px.
   *
   * Not `Lm · 1.2247 · camScale`: that is the across-screen factor and it is
   * the length of a wall that happens to run across the screen. A wall turned
   * into the frame projects shorter, and every ramp below is keyed on the
   * feature's *projected* size, so using the maximum for all of them opens the
   * detail early on exactly the walls that can least afford it. Optional
   * because the fixtures do not have a projection; it defaults to that
   * maximum, which is what the first cut used everywhere.
   */
  readonly wallPx?: number;
  /** the published storey count, `st` first then `st2` */
  readonly storeys: number;
  readonly role: number;
  readonly type: number;
  readonly era: number;
  readonly shop: boolean;
  readonly camScale: number;
}

export interface FaceWeights {
  readonly opening: number;
  readonly ground: number;
  readonly sill: number;
  readonly bar: number;
  readonly cornice: number;
  readonly bay: number;
  /** how many bands the wall is divided into; 0 = no openings are drawn */
  readonly bands: number;
  /** the band height, metres */
  readonly bandM: number;
  /** ── the geometry the weights were computed FROM, so the emitter does not
   *     recompute it and the two cannot disagree ─────────────────────────── */
  /** bays across this wall, from the era's own module */
  readonly m: number;
  /** the opening's width and height, metres */
  readonly ow: number;
  readonly oh: number;
  /** where it sits in the leftover of its band, metres off the floor */
  readonly sill_m: number;
  /** what the ground floor is: `GND_*` */
  readonly gnd: number;
  /** the ground-floor feature's width and height, metres */
  readonly gw: number;
  readonly gh: number;
  /** does this (type, era) carry a projecting cornice at all */
  readonly hasCornice: boolean;
}

/**
 * The whole per-face decision, as arithmetic, so it can be asserted without a
 * canvas.
 *
 * THE ONE HONEST APPROXIMATION, STATED: the weight is held per (group, lambert
 * index) rather than per wall, because at this bearing a building shows one
 * wall down-screen and at most one more, and two walls facing different ways
 * take different lambert indices by construction — so a group *is* a wall in
 * the overwhelming majority. Where two walls do share an index the larger
 * weight wins, **which never draws a feature at less than the size it earned.**
 */
export function faceWeights(i: FaceInput): FaceWeights {
  const zero: FaceWeights = {
    opening: 0,
    ground: 0,
    sill: 0,
    bar: 0,
    cornice: 0,
    bay: 0,
    bands: 0,
    bandM: 0,
    m: 0,
    ow: 0,
    oh: 0,
    sill_m: 0,
    gnd: GND_AS_ABOVE,
    gw: 0,
    gh: 0,
    hasCornice: false,
  };
  if (!FA.on) return zero;
  if (i.dhPx < FA_MIN_DH_PX) return zero;
  if (!faceTakesOpenings(i.role)) return zero;
  // The 14.8 % (now 8.6 %) with no storey count get NO OPENINGS, not a guess.
  // The gap is visible in the frame and it should be.
  if (i.storeys <= 0) return zero;
  if (i.Lm < 1.2 || i.Hm < 2.0) return zero;
  const bands = i.storeys;
  const bandM = i.Hm / bands;

  /* THE TWO PROJECTED RATES, and they are different quantities. `hs` is px per
     metre ALONG this wall and `vs` is px per metre UP it — `projb` adds height
     to the plane's second coordinate only, so a metre of wall height is
     `zexb · scale` whatever the wall's bearing, while a metre of wall LENGTH
     is foreshortened by how far the wall is turned out of the screen. Every
     ramp below is keyed on the one that actually shrinks for that feature:
     an opening on `min(width, height)`, a cornice on its band's DEPTH, a bay
     on its own projected WIDTH. */
  const hs = (i.wallPx ?? i.Lm * 1.2247 * i.camScale) / Math.max(1e-6, i.Lm);
  const vs = i.dhPx / Math.max(1e-6, i.Hm);

  const v = faVocab(i.type, i.era, i.shop);
  const m = bayCount(i.Lm, v.mod);
  const ow = (i.Lm / m) * v.wf;
  const op = openingInBand(bandM, v.hf, v.hx, v.sf);
  const owpx = ow * hs;
  const ohpx = op.h * vs;
  const opMin = Math.min(owpx, ohpx);

  /* THE GROUND FLOOR IS A DIFFERENT SIZE OF OBJECT AND ARRIVES AT A DIFFERENT
     CAMERA. A shopfront is the whole frontage by two-thirds of a storey; a
     window is a fifth of a bay by half of one. Ramping the two together is
     what made a Mission blockface read as walls until the windows appeared all
     at once. `FA_RAMP.ground` starts at 1.2 px against the opening's 0.9 and
     is over by 3.6 — but on a much larger feature, so it is over first. */
  const isFront = i.role === ROLE_FRONT;
  const gnd = isFront && i.era >= 0 ? v.ground : GND_AS_ABOVE;
  const fh = bandM;
  const gh =
    gnd === GND_SHOP
      ? fh - Math.min(FA_SHOP_FASCIA, fh * 0.24) - Math.min(FA_SHOP_TOE, fh * 0.14)
      : gnd === GND_VEHICLE
        ? Math.min(FA_VEH_H, fh * 0.78)
        : gnd === GND_ENTRANCE
          ? Math.min(FA_DOOR_H, fh * 0.82)
          : 0;
  const gw =
    gnd === GND_SHOP
      ? i.Lm
      : gnd === GND_VEHICLE
        ? Math.min(FA_VEH_W, i.Lm * 0.62)
        : gnd === GND_ENTRANCE
          ? Math.max(ow * FA_DOOR_W, 0.75)
          : 0;

  return {
    opening: faRamp(opMin, FA_RAMP.op[0], FA_RAMP.op[1]),
    ground: gnd ? faRamp(Math.min(gw * hs, gh * vs), FA_RAMP.ground[0], FA_RAMP.ground[1]) : 0,
    sill: faRamp(opMin, FA_RAMP.sill[0], FA_RAMP.sill[1]),
    bar: faRamp(owpx, FA_RAMP.bar[0], FA_RAMP.bar[1]),
    /* the cornice is keyed on the BAND's own projected DEPTH — 0.60 m of wall
       standing up, so `vs` and not `hs`, and it is small in pixels long after
       the building is large. */
    cornice: v.cornice ? faRamp(FA_CORN_M * vs, FA_RAMP.cornice[0], FA_RAMP.cornice[1]) : 0,
    bay: faBayOK(i.type, i.era, i.role, i.storeys)
      ? faRamp(i.Lm * hs, FA_RAMP.bay[0], FA_RAMP.bay[1])
      : 0,
    bands,
    bandM,
    m,
    ow,
    oh: op.h,
    sill_m: op.sill,
    gnd,
    gw,
    gh,
    hasCornice: v.cornice,
  };
}

/**
 * ONE PATH PER (GROUP, LAMBERT), FILLED ONCE, AT THE GROUP'S OWN ALPHA.
 *
 * Five groups — openings, glazing bars, lit reveals, bays, shopfronts — so a
 * whole block of houses is at most twenty fills whatever it holds. This is the
 * shape of the batching, and it is deliberately *not* one enormous path: **one
 * `fill()` of a path with a thousand overlapping subpaths costs more than a
 * thousand small fills.** The groups are small and they do not overlap each
 * other.
 */
export interface FaceGroups {
  readonly open: (Path2D | null)[];
  readonly bar: (Path2D | null)[];
  readonly lit: (Path2D | null)[];
  readonly bay: (Path2D | null)[];
  readonly shop: (Path2D | null)[];
  /** the shadow a cornice or a bay throws on the wall under it */
  readonly shad: (Path2D | null)[];
  readonly aOpen: Float32Array;
  readonly aBar: Float32Array;
  readonly aLit: Float32Array;
  readonly aBay: Float32Array;
  readonly aShop: Float32Array;
  readonly aShad: Float32Array;
}

export function newFaceGroups(): FaceGroups {
  const mk = () => [null, null, null, null] as (Path2D | null)[];
  return {
    open: mk(),
    bar: mk(),
    lit: mk(),
    bay: mk(),
    shop: mk(),
    shad: mk(),
    aOpen: new Float32Array(4),
    aBar: new Float32Array(4),
    aLit: new Float32Array(4),
    aBay: new Float32Array(4),
    aShop: new Float32Array(4),
    aShad: new Float32Array(4),
  };
}

export function faceGroupPath(
  arr: (Path2D | null)[],
  lam: number,
): Path2D {
  let p = arr[lam];
  if (!p) {
    p = new Path2D();
    arr[lam] = p;
  }
  return p;
}

/** the largest weight wins for a shared lambert index */
export function faceGroupAlpha(a: Float32Array, lam: number, w: number): void {
  if (w > a[lam]) a[lam] = w;
}

/**
 * Flush one building's face groups. The colours all come from the wall's own
 * colour through `shade()`, so **this layer adds no new colour claim
 * whatsoever.**
 *
 * ── A WINDOW ON A SUNLIT WALL AND A WINDOW ON A SHADED ONE WERE THE SAME
 *    COLOUR ────────────────────────────────────────────────────────────────
 * `faFlush` reads `W4[WO + lam]` — **the wall colour of the lambert bucket it
 * is filling.** This port was handed one string, `wallF[wallO + 2]`, and used
 * it for all four: a corner building's two visible walls came out at two
 * values with the same openings punched in both, which flattens the corner
 * exactly where the corner is the thing that says the building is a solid.
 * The four values are already built and already the batch key; the fix is to
 * pass the table and the offset instead of one entry out of it.
 *
 * ── THE ORDER, AND THE ONE DELIBERATE DEPARTURE ──────────────────────────
 * `faFlush`'s order is shadow, bay, lit, ground, garage, opening, awning: the
 * bay is **under** the openings so an opening sits IN it, and the shadow is
 * under everything. This port had the bay filled AFTER the openings, over its
 * own windows, contradicting `emitFace`'s own comment. Corrected.
 *
 * The departure is the glazing bar, which the mock does not separate — it goes
 * into the lit group and is therefore covered by the opening filled after it.
 * Here it is its own group, filled last, at `FA_V.lit`: the same value, drawn
 * where it can be seen.
 */
export function flushFaces(
  f: Frame,
  g: FaceGroups,
  wallF: readonly string[],
  wallO: number,
  glassy: boolean,
): void {
  const { ctx } = f;
  ctx.save();
  const fill = (
    arr: (Path2D | null)[],
    a: Float32Array,
    k: number,
  ): void => {
    for (let lam = 0; lam < 4; lam++) {
      const p = arr[lam];
      if (!p || a[lam] <= 0.002) continue;
      ctx.globalAlpha = a[lam];
      ctx.fillStyle = shade(wallF[wallO + lam] ?? "#c0b49a", k);
      ctx.fill(p);
    }
  };
  const gl = glassy ? FA_V.glassM : FA_V.glass;
  fill(g.shad, g.aShad, FA_V.shad);
  fill(g.bay, g.aBay, FA_V.bay);
  // the ground-floor feature takes the SAME value as the openings above it —
  // `faFlush` fills FAG_GN with `gl`, not with a value of its own
  fill(g.shop, g.aShop, gl);
  // the opening: a hole in a wall, so it is the wall's own colour taken down
  fill(g.open, g.aOpen, gl);
  fill(g.lit, g.aLit, FA_V.lit);
  fill(g.bar, g.aBar, FA_V.lit);
  ctx.restore();
}

// ── the vocabulary: five numbers per (type, era), and never per building ────

/**
 * THE DECLARED VOCABULARY, PORTED. `part3.html` §THE ENVELOPE `FA_VOCAB`.
 *
 * Block P3 landed this module's *law* — the ramps, the gates, the party rule,
 * the storey supplement, the batching — and left the tables the law reads out.
 * Without them `emitFace` had to make the rhythm up, and it did: **a column
 * every 4 m, an opening from 0.28 to 0.72 of it, on every building in the
 * city.** Every window in San Francisco was the same window, and the whole
 * point of the file above — *what is per building is which convention it gets,
 * and that is four published columns* — bought nothing.
 *
 * These are the mock's own numbers, carried across unchanged, and its own
 * account of them travels with them because it is the honest one:
 *
 * ```
 *   mod  metres of wall per bay
 *   wf   the opening's width, as a fraction of the bay
 *   hf   the opening's height, as a fraction of ITS OWN STOREY BAND
 *   hx   the cap on that height, IN METRES — a window is not four metres tall
 *        however tall the band the roll and the LIDAR leave it
 *   sf   where the opening sits in the leftover: 0 = on the floor, 1 = against
 *        the ceiling. Above 0.5 because a sill stands further off the floor
 *        than a lintel hangs from the slab.
 *   cn   1 if this type in this era carries a projecting cornice
 * ```
 *
 * **Every row is monotone across the eras** — the module widens, the opening
 * widens, the glass grows, the sill drops and the cornice stops. A 1908 sash is
 * tall and narrow in a 3.3 m bay; a 1968 opening is wide and low in a 4.4 m
 * bay; a 2005 office is very nearly all glass. Those directions are the period,
 * and they are a **convention declared once per (type, era)**, not a
 * measurement of any building — `manifest.facade.NOT_MEASURED` says so in the
 * page's own words.
 *
 * `UNCLASSED` is deliberately duller than a classed building: one plain module
 * across all five eras, no entrance, no shopfront, no cornice and no bay,
 * because the record knows less about those 8,356 footprints and the drawing
 * should say so.
 */
interface FaVocabRow {
  readonly mod: readonly number[];
  readonly wf: readonly number[];
  readonly hf: readonly number[];
  readonly hx: readonly number[];
  readonly sf: readonly number[];
  readonly cn: readonly number[];
}

const FA_VOCAB: Readonly<Record<string, FaVocabRow>> = {
  HOUSE: { mod: [3.3, 3.4, 3.7, 4.3, 4.7], wf: [.42, .44, .50, .60, .66], hf: [.52, .51, .48, .42, .46], hx: [2.10, 2.05, 1.95, 1.70, 2.05], sf: [.70, .70, .68, .62, .58], cn: [1, 1, 1, 0, 0] },
  FLATS: { mod: [3.2, 3.3, 3.6, 4.2, 4.6], wf: [.44, .46, .52, .62, .70], hf: [.53, .52, .49, .43, .47], hx: [2.15, 2.10, 2.00, 1.75, 2.10], sf: [.70, .70, .68, .62, .58], cn: [1, 1, 1, 0, 0] },
  APARTMENT: { mod: [3.1, 3.2, 3.5, 4.2, 4.8], wf: [.46, .48, .56, .66, .76], hf: [.54, .53, .50, .45, .52], hx: [2.15, 2.10, 2.00, 1.80, 2.30], sf: [.70, .69, .67, .62, .56], cn: [1, 1, 1, 0, 0] },
  RETAIL: { mod: [3.6, 3.8, 4.2, 5.0, 5.6], wf: [.52, .56, .62, .72, .84], hf: [.55, .54, .52, .48, .58], hx: [2.30, 2.25, 2.15, 1.95, 2.55], sf: [.68, .68, .66, .60, .52], cn: [1, 1, 1, 0, 0] },
  OFFICE: { mod: [3.1, 3.3, 3.7, 4.5, 5.4], wf: [.50, .55, .62, .80, .92], hf: [.56, .56, .55, .56, .68], hx: [2.40, 2.35, 2.30, 2.25, 2.90], sf: [.66, .66, .64, .55, .45], cn: [1, 1, 1, 0, 0] },
  INDUSTRIAL: { mod: [6.0, 6.0, 6.4, 7.2, 8.0], wf: [.62, .64, .70, .76, .82], hf: [.44, .44, .43, .40, .42], hx: [2.60, 2.60, 2.50, 2.30, 2.60], sf: [.62, .62, .60, .56, .52], cn: [0, 0, 0, 0, 0] },
  INSTITUTION: { mod: [4.2, 4.4, 4.6, 5.2, 5.8], wf: [.42, .44, .50, .62, .74], hf: [.58, .57, .54, .48, .55], hx: [2.80, 2.75, 2.60, 2.30, 2.80], sf: [.68, .68, .66, .60, .54], cn: [1, 1, 1, 0, 0] },
  HOTEL: { mod: [3.1, 3.2, 3.4, 4.0, 4.6], wf: [.46, .48, .54, .64, .74], hf: [.54, .53, .50, .45, .50], hx: [2.15, 2.10, 2.05, 1.85, 2.25], sf: [.70, .69, .67, .62, .56], cn: [1, 1, 1, 0, 0] },
  GARAGE: { mod: [6.0, 6.0, 6.4, 7.0, 7.4], wf: [.60, .62, .68, .74, .78], hf: [.30, .30, .30, .29, .30], hx: [1.40, 1.40, 1.40, 1.35, 1.40], sf: [.78, .78, .76, .74, .72], cn: [0, 0, 0, 0, 0] },
  UNCLASSED: { mod: [4.4, 4.4, 4.4, 4.4, 4.4], wf: [.50, .50, .50, .50, .50], hf: [.48, .48, .48, .48, .48], hx: [2.00, 2.00, 2.00, 2.00, 2.00], sf: [.66, .66, .66, .66, .66], cn: [0, 0, 0, 0, 0] },
};

/** The ground floor by type. `part3.html` `FA_GROUND`. The published shop bit
 *  overrides it to `GND_SHOP`. */
export const GND_AS_ABOVE = 0;
export const GND_ENTRANCE = 1;
export const GND_SHOP = 2;
export const GND_VEHICLE = 3;

const FA_GROUND: Readonly<Record<string, number>> = {
  HOUSE: GND_ENTRANCE, FLATS: GND_ENTRANCE, APARTMENT: GND_ENTRANCE,
  RETAIL: GND_SHOP, OFFICE: GND_ENTRANCE, INDUSTRIAL: GND_VEHICLE,
  INSTITUTION: GND_ENTRANCE, HOTEL: GND_ENTRANCE, GARAGE: GND_VEHICLE,
  UNCLASSED: GND_AS_ABOVE,
};

/** metres. The glazing runs to this far off the pavement, and the stallriser
 *  survives as a LIT LINE (`FA_SHOP_SILL`) at the detail tier. A shopfront
 *  standing on a 0.42 m riser at block zoom is one dark band floating a pixel
 *  off the ground, which reads as shadow under a house and not as a shop. */
export const FA_SHOP_TOE = 0.10;

export interface FaVocab {
  /** metres of wall per bay */
  readonly mod: number;
  /** the opening's width as a fraction of the bay */
  readonly wf: number;
  /** the opening's height as a fraction of its own storey band */
  readonly hf: number;
  /** the cap on that height, metres */
  readonly hx: number;
  /** where the opening sits in the leftover */
  readonly sf: number;
  /** does this (type, era) carry a projecting cornice */
  readonly cornice: boolean;
  /** what the ground floor is: `GND_*` */
  readonly ground: number;
}

/**
 * The convention for one (type, era), with the record's own two refusals in it:
 *
 *  - a footprint the roll gives **no type** takes `UNCLASSED` — and so does one
 *    whose parcel and whose block both carry **no year** (`FLAG_NOYEAR`,
 *    signalled here as `era < 0`), because reading an era off a date the record
 *    does not hold is inventing the date.
 *  - the published **shop bit** promotes the ground floor to a shopfront on
 *    7,044 footprints whatever the type says, because that bit is a reading of
 *    a column and `FA_GROUND` is a convention about a class.
 */
export function faVocab(type: number, era: number, shop: boolean): FaVocab {
  const unclassed = era < 0 || type < 0 || type >= FA_TYPES.length;
  const name = unclassed ? "UNCLASSED" : FA_TYPES[type];
  const row = FA_VOCAB[name] ?? FA_VOCAB.UNCLASSED;
  const e = unclassed ? 0 : Math.max(0, Math.min(4, era));
  const g = shop ? GND_SHOP : (FA_GROUND[name] ?? GND_AS_ABOVE);
  return {
    mod: row.mod[e], wf: row.wf[e], hf: row.hf[e], hx: row.hx[e], sf: row.sf[e],
    cornice: row.cn[e] === 1, ground: g,
  };
}

/** How many bays this wall's module divides it into. At least one. */
export function bayCount(Lm: number, mod: number): number {
  const m = Math.round(Lm / mod);
  return m < 1 ? 1 : m;
}

/**
 * WHICH BAY THE DOOR IS IN, AND IT IS NOT A HASH.
 *
 * A San Francisco row house puts its entry against the party wall, so the bay
 * used is the one at the END of this wall that meets a **measured** party edge;
 * where neither end does, it is the middle bay. Deterministic — the same for
 * every building with the same measurements, which is the whole difference
 * between this and a seeded pattern.
 */
export function doorBay(m: number, prevRole: number, nextRole: number): number {
  if (m <= 1) return 0;
  if (prevRole === ROLE_PARTY && nextRole !== ROLE_PARTY) return 0;
  if (nextRole === ROLE_PARTY && prevRole !== ROLE_PARTY) return m - 1;
  return (m - 1) >> 1;
}
