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

export const ROLE_PARTY = 0;
export const ROLE_FRONT = 1;
export const ROLE_BACK = 2;
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
  };
  if (!FA.on) return zero;
  if (i.dhPx < FA_MIN_DH_PX) return zero;
  if (!faceTakesOpenings(i.role)) return zero;
  // The 14.8 % (now 8.6 %) with no storey count get NO OPENINGS, not a guess.
  // The gap is visible in the frame and it should be.
  if (i.storeys <= 0) return zero;
  const bands = i.storeys;
  const bandM = i.Hm / bands;
  const px = (m: number) => m * 1.2247 * i.camScale;
  const opW = px(bandM * FA_HMAX_F * 0.5);
  return {
    opening: faRamp(opW, FA_RAMP.op[0], FA_RAMP.op[1]),
    ground: faRamp(px(Math.min(i.Lm, 6)), FA_RAMP.ground[0], FA_RAMP.ground[1]),
    sill: faRamp(opW, FA_RAMP.sill[0], FA_RAMP.sill[1]),
    bar: faRamp(opW, FA_RAMP.bar[0], FA_RAMP.bar[1]),
    // the cornice is keyed on the BAND's own projected depth
    cornice:
      i.era < 2
        ? faRamp(px(FA_CORN_M) * 0.7071, FA_RAMP.cornice[0], FA_RAMP.cornice[1])
        : 0,
    bay: faBayOK(i.type, i.era, i.role, i.storeys)
      ? faRamp(px(2.4), FA_RAMP.bay[0], FA_RAMP.bay[1])
      : 0,
    bands,
    bandM,
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
  readonly aOpen: Float32Array;
  readonly aBar: Float32Array;
  readonly aLit: Float32Array;
  readonly aBay: Float32Array;
  readonly aShop: Float32Array;
}

export function newFaceGroups(): FaceGroups {
  const mk = () => [null, null, null, null] as (Path2D | null)[];
  return {
    open: mk(),
    bar: mk(),
    lit: mk(),
    bay: mk(),
    shop: mk(),
    aOpen: new Float32Array(4),
    aBar: new Float32Array(4),
    aLit: new Float32Array(4),
    aBay: new Float32Array(4),
    aShop: new Float32Array(4),
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
 */
export function flushFaces(
  f: Frame,
  g: FaceGroups,
  wallColour: string,
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
      ctx.fillStyle = shade(wallColour, k);
      ctx.fill(p);
    }
  };
  // the opening: a hole in a wall, so it is the wall's own colour taken down
  fill(g.open, g.aOpen, glassy ? 0.74 : 0.52);
  fill(g.shop, g.aShop, 0.62);
  fill(g.bay, g.aBay, 1.04);
  fill(g.lit, g.aLit, 1.12);
  fill(g.bar, g.aBar, 1.2);
  ctx.restore();
}
