/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/facade.ts — WHICH FACADE A WALL WEARS, AND WHICH COLUMN SAYS SO.

   ── THE COMPLAINT THIS FILE ANSWERS ──────────────────────────────────────
   *"all buildings look kind of the same"*, and the walls read as corduroy.

   They did, and the cause was not subtle. `layers/buildings.ts` built ONE
   64 px tile — a window in a bay, a sill, and a full-width dark band at the
   floor — and gave it to every wall in the city, repeated by a nominal
   `BAY_M = 4.6` across and by the published storey count up. So:

     · every building wore the SAME window, whatever the roll says it is;
     · every building wore the SAME bay rhythm, because 4.6 m is one number
       and the published module runs from 3.1 m to 8.0 m;
     · and the full-width band at every floor — which is INVENTED, no such
       mark exists on the Canvas path — is a horizontal stripe at a constant
       pitch on every wall in the frame. That is the corduroy, and it is the
       first thing removed here.

   ── WHAT REPLACES IT, AND WHERE EVERY NUMBER COMES FROM ──────────────────
   `lib/city/facades.ts` already holds the real answer, and the other renderer
   already draws it per wall per band: an opening's module, width, height and
   sill are a convention **declared once per (type, era)** — `FA_VOCAB` — and
   what is per building is WHICH convention it gets, which is four published
   columns (`ty`, the roll year's era, `shop`, and the measured `role` of the
   wall). `manifest.facade.NOT_MEASURED` says in the page's own words that the
   roll does not record where a window is.

   This file does not restate any of that. It:

     1. buckets the 50 published (type, era) conventions into EIGHT drawable
        vocabularies, because a texture atlas cell is a draw call and 50 is not
        a budget — and it says which column picks each;
     2. draws each cell by calling `faceWeights`, THE SAME FUNCTION the Canvas
        renderer calls per wall, on a nominal one-bay one-band wall at a camera
        where every ramp is fully open. A tile therefore cannot drift from the
        facade the other renderer draws: there is one implementation of the
        rhythm and this asks it a question;
     3. hands the caller the published MODULE in metres, so `u` counts the
        building's own bays instead of a nominal 4.6 m. That alone is more
        variety than the eight cells are: eight vocabularies x fifty published
        modules x the published storey count.

   ── THE MIPMAP IS THE RAMP ───────────────────────────────────────────────
   `FA_RAMP` exists because a 1.4 px window drawn at full strength is noise:
   the Canvas path fades every group in on its own projected size. A texture
   does that for free and correctly — the mipmap averages a mark into the wall
   as the wall shrinks, which is the same integral `faRamp` approximates. So
   no ramp is reimplemented here and none is needed.

   ── THE ONE THING A MULTIPLY MAP CANNOT DO ───────────────────────────────
   The map multiplies the wall's own material colour, so it can only DARKEN.
   `FA_V.lit` is 1.115 — the sill, the reveal, the glazing bar and the cornice
   band are all BRIGHTER than the wall they sit on. Clipped at the multiply
   ceiling that group becomes 1.0, the wall's own colour, so:

     · a lit mark INSIDE an opening (the reveal, the mullion, the meeting rail,
       a shopfront's stallriser and fascia) is drawn, at the wall's colour
       against the opening's — which is what a recess looks like;
     · a lit mark on the OPEN WALL (the sill line under a window) is not
       drawable and is not drawn. It is not faked with a shadow, because a
       shadow under a sill is a mark `facades.ts` does not make.

   No number in any tile is invented: every opening value is an `FA_V` entry,
   every proportion comes back out of `faceWeights`, and the lit group is that
   group clipped at 1.0.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import {
  FA_SHOP_FASCIA,
  FA_SHOP_SILL,
  FA_SHOP_TOE,
  FA_TYPES,
  FA_V,
  GND_SHOP,
  ROLE_BACK,
  ROLE_FRONT,
  faGlassy,
  faVocab,
  faceTakesOpenings,
  faceWeights,
} from "@/lib/city/facades";

/* ── the eight vocabularies, and the column that picks each ───────────────
 *
 *   0 BLANK     the wall's measured `role` is a party edge, or the roll
 *               publishes no storey count and the caller derived none
 *   1 SASH      `era` 0-1 (pre-1925), a classed non-industrial building
 *   2 PUNCHED   `era` 2-4, the same
 *   3 CURTAIN   `faGlassy(ty, era)` — post-1980 of any class, or an OFFICE
 *               from 1950 on
 *   4 SHED      `ty` = INDUSTRIAL
 *   5 DECK      `ty` = GARAGE
 *   6 PLAIN     no `ty`, or no year (`FLAG_NOYEAR`) — the UNCLASSED row
 *   7 SHOPFRONT the published `shop` bit, or `ty` = RETAIL, on the wall the
 *               footprint measures as its FRONT — and it addresses that
 *               wall's GROUND BAND, not the wall
 */
export const TILE_BLANK = 0;
export const TILE_SASH = 1;
export const TILE_PUNCHED = 2;
export const TILE_CURTAIN = 3;
export const TILE_SHED = 4;
export const TILE_DECK = 5;
export const TILE_PLAIN = 6;
export const TILE_SHOPFRONT = 7;
/** the inter-war stucco wall — square openings in a lot of wall. Its own cell
 *  because eras 0 and 3 are the two ends of a range and 1925-50 is neither. */
export const TILE_STUCCO = 8;
/** the Edwardian / Classical wall — tall paired lights under a heavy cornice */
export const TILE_CLASSICAL = 9;
/** the Deco / Streamline wall — horizontal banding, no meeting rail */
export const TILE_MODERNE = 10;

export const FACADE_TILES: readonly string[] = [
  "blank", "sash", "punched", "curtain",
  "shed", "deck", "plain", "shopfront",
  "stucco", "classical", "moderne",
];

/** the atlas grid. 4 x 2 holds the eight exactly, with no dead cell. */
export const FACADE_COLS = 4;
export const FACADE_ROWS = 3;

/**
 * THE NOMINAL BAND THE TILE IS DRAWN ON, AND WHY IT IS 2.4 m AND NOT 3.4.
 *
 * A tile is one bay wide and one band tall and has no metres in it, but
 * `faceWeights` is stated in metres: `hf` is a fraction of the band and `hx`
 * caps it in metres, `FA_SHOP_FASCIA` and `FA_SHOP_TOE` are metres against
 * fractions of the band. To ask it for a tile it has to be given a band.
 *
 * **That band must never bind a metre cap**, or the tile would carry a fitted
 * floor-to-floor height — which is exactly what `FA_NO_FITTED_FLOOR_HEIGHT`
 * refuses, and which `FA_BAND_M`'s own comment says must never be quoted as
 * one. Measured over all fifty published (type, era) pairs:
 *
 * ```
 *   band     hx binds     shop fascia      shop toe
 *   2.4 m    0 of 50      fraction 0.576   fraction 0.096
 *   2.5 m    0 of 50      fraction 0.600   METRE 0.10
 *   3.0 m    0 of 50      METRE 0.72       METRE 0.10
 * ```
 *
 * At 2.4 m every branch of `faceWeights` takes its FRACTIONAL arm, so the tile
 * is a pure fraction of its own band and the number below drops out of every
 * proportion it produces. It sets nothing else: no height, no silhouette, no
 * band count. The caller's `v` is still the published storey count.
 */
export const FACADE_BAND_M = 2.4;

/** the camera the tile is drawn at: far enough in that every `FA_RAMP` is
 *  fully open, so a tile is the vocabulary at full detail and the mipmap does
 *  the fading */
const TILE_CAM = 400;

/** one cell, in CSS px, and doubled on a dense display */
export const FACADE_TILE_PX = 128;

/* ── the multiply-map values, off `FA_V` ─────────────────────────────────
 *
 * The map multiplies, so a value `k` of the wall is drawn as black at alpha
 * `1 - k`, and the lit group (`FA_V.lit` = 1.115) clips to the wall itself.
 */
const A_GLASS = 1 - FA_V.glass;
const A_GLASSM = 1 - FA_V.glassM;

// ── which vocabulary a wall gets ────────────────────────────────────────────

/**
 * The published columns a facade is chosen from. Every one of them is a column
 * the `face` chunk or the `bldg` chunk already ships.
 */
export interface FacadeKey {
  /** the surveyed or inferred appearance family, where the caller has one */
  readonly family?: FaFamily;
  /** `face.ty`, an index into `FA_TYPES` / `manifest.facade.TYPES` */
  readonly type: number;
  /** `faEra(1849 + bldg.yr)`, or **-1** where `FLAG_NOYEAR` says the roll does
   *  not date the parcel — reading an era off a date the record does not hold
   *  is inventing the date, and `faVocab` takes `era < 0` as UNCLASSED */
  readonly era: number;
  /** `storeysOf(bldg.st, face.st2)`, and where that is 0 the caller's own
   *  `derivedBands(Hm, heightStale)` — published first, declared second,
   *  exactly as `faceWeights` orders `storeys` and `bandsFallback`. 0 here
   *  means neither exists, and the wall gets the blank tile. */
  readonly storeys: number;
  /** `face.shop` — 7,044 footprints the roll marks as carrying a shopfront */
  readonly shop: boolean;
  /** `face.role` for THIS wall: one of `ROLE_BACK` / `ROLE_FRONT` /
   *  `ROLE_PARTY`. It is per ring vertex, so it is per wall and not per
   *  building, and it is the only measured input here. */
  readonly role: number;
  /** `faGlassy(type, era)`. Passed rather than recomputed so the two renderers
   *  read one answer — pass exactly that call. */
  readonly glassy: boolean;
}

/** `faVocab`'s own refusal, restated so the branches below can share it: no
 *  type, or no year, is the UNCLASSED row. */
function unclassed(type: number, era: number): boolean {
  return (
    era < 0 ||
    type < 0 ||
    type >= FA_TYPES.length ||
    /* ── AND THE PUBLISHED UNCLASSED CLASS IS UNCLASSED ────────────────
       This clause was missing and the omission was invisible, because the
       three tests above are all about an index the record could not produce.
       `FA_TYPES` carries **"UNCLASSED" as a real entry at index 9** — it is
       what `build_facade.py` writes for a footprint whose parcel carries no
       building class, 8,356 of the 166,166 drawn, 5.03 % — and index 9 is
       inside `FA_TYPES.length`, so none of the three caught it.

       The header of this file states the intended rule in its own words:
       *"6 PLAIN — no `ty`, or no year (`FLAG_NOYEAR`) — the UNCLASSED row"*,
       and `planOf(TILE_PLAIN)` maps straight back to `ty("UNCLASSED")`. So
       the intent was never in doubt; the test simply did not implement it,
       and every footprint the roll declines to class was given a CLASSED
       facade — `era <= 1 ? TILE_SASH : TILE_PUNCHED`, a full sash or punched
       window grid.

       It is also a divergence from the published page rather than a shared
       choice, which is what settles it. `facades.ts` `faVocab` reaches the
       UNCLASSED row anyway, because it looks the row up BY NAME
       (`FA_VOCAB[FA_TYPES[type]]`) and index 9's name is "UNCLASSED". Only
       this file switched on the name for INDUSTRIAL and GARAGE and then fell
       through to the classed branches. Adding the clause moves the two
       renderers together.

       What it fixes on screen: the Palace of Fine Arts colonnade. Its two
       curved wings are published footprints 159039 and 159067 — 1906,
       UNCLASSED, 59x94 m and 80x76 m on 40-vertex rings — and they are not
       the hero's own footprint, so the fabric draws them. With a sash grid on
       them a peristyle reads as an office block standing through the
       landmark. It is not only the Palace: 8,356 footprints the record
       declines to name were being told what they look like. */
    FA_TYPES[type] === "UNCLASSED"
  );
}

/**
 * The tile the BODY of this wall wears — every band of it, or every band above
 * the ground band where the caller draws one.
 *
 * The order of the tests is the order the record's own refusals bind, and it
 * is not a taste:
 *
 *  1. **A measured party edge carries no openings.** `faceTakesOpenings` is a
 *     reading of 163,536 measured ring edges, not a convention, so it wins
 *     over every class rule under it. A blank wall is the honest answer and
 *     this is where one belongs.
 *  2. **No rhythm, no openings.** Where the roll publishes no storey count and
 *     the caller derived no band count, there is nothing to divide the wall
 *     into and it stays flat — which is what the page always drew.
 *  3. **No class or no year is its own row.** `faVocab` sends both to
 *     UNCLASSED; so does this.
 *  4. **A shed is a shed in every era.** INDUSTRIAL and GARAGE are tested
 *     BEFORE `glassy`, because `faGlassy`'s `era >= 4` clause would otherwise
 *     draw every post-1980 warehouse as a curtain wall. In `facades.ts`
 *     `faGlassy` decides an opening's VALUE and `faVocab` decides its SHAPE —
 *     and `faVocab` keeps the 8.0 m industrial module in era 4. A tile bakes
 *     the value into the mark, so this is one stated departure: a post-1980
 *     shed keeps its shape and takes the punched value rather than the
 *     sky-lit one.
 */
/**
 * THE SIX APPEARANCE FAMILIES, AND WHY THERE ARE SIX.
 *
 * MEASURED on 5,544 buildings the city HAS surveyed, matched to their
 * footprints: the decade a building was built predicts its appearance family
 * about **60 %** of the time, and no other published field improves on that —
 * storeys, units, zoning, lot frontage, lot coverage and neighbourhood were
 * each tested on a held-out third and none of them beat the decade alone.
 *
 * Six is where the trade-off sits. Grouped finer, prediction collapses — the
 * exact style over 63 names is 43 %. Grouped coarser, a third of the city ends
 * up in one bucket and the map goes uniform again, which is the thing this is
 * for. Both ends were measured before six was chosen.
 *
 * The family is the DRAWING, not a label to resolve further: `victorian` is
 * one facade, not a bag holding Queen Anne and Italianate to be picked from.
 */
export type FaFamily =
  | "victorian" | "classical" | "revival" | "moderne" | "modern" | "plain";

/** the family this era falls in, where no surveyed style says otherwise */
export function familyOfEra(era: number): FaFamily {
  if (era < 0) return "plain";
  if (era === 0) return "victorian";
  if (era === 1) return "classical";
  if (era === 2) return "revival";
  return "modern";
}

/** does this family stand its front out from the wall? */
export function familyHasBay(f: FaFamily): boolean {
  return f === "victorian" || f === "classical";
}

/**
 * DOES THIS FAMILY PUT A PITCHED ROOF ON A HOUSE?
 *
 * Separate from `familyHasBay`, and it was a bug that they were one thing. The
 * house form was gated on the bay, so only Victorian and Classical got a roof
 * — and the era rule sends the whole of 1925-50 to `revival`, which is the
 * Sunset and the Richmond, which is most of the houses in this city. They came
 * out flat-lidded.
 *
 * A Craftsman and a Mediterranean Revival house have pitched roofs, wide eaves
 * and no bay. A Deco or post-war block has a parapet and a flat deck. Those are
 * two different questions and this is the second one.
 */
export function familyPitchedRoof(f: FaFamily): boolean {
  return f === "victorian" || f === "classical" || f === "revival";
}

/** how far this family's eave oversails, as a multiple of the ordinary one */
/**
 * HOW OFTEN THIS FAMILY HIPS ITS ROOF RATHER THAN GABLING IT.
 *
 * The two are the same roof at the same pitch and they read completely
 * differently from above — a gable is two slopes and a straight ridge running
 * wall to wall, a hip is four slopes and a ridge that stops short at both
 * ends. From this camera that is the single most legible difference between
 * one house and the next, and drawing every house with one of them is most of
 * what made a blockface read as repeated.
 *
 * The shares are art direction, and they follow what each family actually is:
 * a Mediterranean Revival house is hipped almost by definition, which is why
 * the tile shows on all four sides; a Victorian presents a gable to the
 * street, which is the front-gabled row this city is read by. Classical sits
 * between, because the era built both.
 */
export function familyHipShare(f: FaFamily): number {
  switch (f) {
    case "revival":   return 0.72;
    case "classical": return 0.34;
    case "victorian": return 0.14;
    default:          return 0;
  }
}

export function familyEave(f: FaFamily): number {
  switch (f) {
    case "revival":   return 1.7;   // the wide Craftsman / Mediterranean eave
    case "victorian": return 1.0;
    case "classical": return 0.8;   // a moulded cornice does this job instead
    default:          return 0;
  }
}
/** how deep its cornice oversails, as a multiple of the ordinary one */
export function familyCornice(f: FaFamily): number {
  switch (f) {
    case "victorian": return 1.35;
    case "classical": return 1.25;
    case "revival":   return 0.85;   // a deep eave, not a moulded cornice
    case "moderne":   return 0.55;   // a stepped parapet, shallow
    default:          return 0;      // modern and plain end square
  }
}

export function facadeTile(o: FacadeKey): number {
  if (!faceTakesOpenings(o.role)) return TILE_BLANK;
  if (!(o.storeys > 0)) return TILE_BLANK;
  if (unclassed(o.type, o.era)) return TILE_PLAIN;
  const name = FA_TYPES[o.type];
  if (name === "INDUSTRIAL") return TILE_SHED;
  if (name === "GARAGE") return TILE_DECK;
  if (o.glassy) return TILE_CURTAIN;
  /* ── THREE DRAWINGS, NOT THREE SETS OF NUMBERS ─────────────────────────
     The first attempt at style gave each of HOUSE / FLATS / APARTMENT its own
     cell off `FA_VOCAB`, and they came out indistinguishable — MEASURED, the
     three rows differ by 2.4-6.2 % in module and 8.7-14.2 % in opening width,
     which is five pixels on a 128 px tile. Reading different numbers does not
     make a different design.

     What separates a San Francisco facade by era is its LAYOUT, and the roll
     publishes the era. Before 1907 the opening is PAIRED and vertical; the
     inter-war stucco wall is a square hole in a lot of wall; after 1950 it is
     one wide horizontal light. Those are three drawings and `drawTile` builds
     them as such. */
  switch (o.family ?? familyOfEra(o.era)) {
    case "victorian": return TILE_SASH;
    case "classical": return TILE_CLASSICAL;
    case "revival":   return TILE_STUCCO;
    case "moderne":   return TILE_MODERNE;
    case "plain":     return TILE_PLAIN;
    default:          return TILE_PUNCHED;
  }
}

/**
 * The tile this wall's GROUND BAND wears, or **-1** where the ground storey is
 * drawn as the storeys above it.
 *
 * ── WHY THERE IS NO ENTRANCE TILE AND NO GARAGE-DOOR TILE ────────────────
 * `facades.ts` places both from `doorBay`, which is *"not a hash"*: the bay
 * used is the one at the end of the wall that meets a MEASURED party edge, and
 * the middle bay where neither end does. That is ONE bay out of `m`. A tile
 * repeats in every bay, so a repeating map can only say *a door in every bay*,
 * which is not what the record says and is not drawn.
 *
 * A SHOPFRONT is different and that is why it survives: `faceWeights` gives it
 * `gw = i.Lm`, the whole frontage. It genuinely runs the length of the wall,
 * so a tile of it repeats correctly, mullion for mullion.
 *
 * The `isFront` and `era >= 0` gates are `faceWeights`'s own line — a ground
 * feature belongs on the wall the footprint measures as its front, and a
 * footprint the roll does not date has no ground convention.
 */
export function facadeGroundTile(o: FacadeKey): number {
  if (!faceTakesOpenings(o.role)) return -1;
  if (o.role !== ROLE_FRONT) return -1;
  if (!(o.storeys > 0)) return -1;
  if (unclassed(o.type, o.era)) return -1;
  return faVocab(o.type, o.era, o.shop).ground === GND_SHOP ? TILE_SHOPFRONT : -1;
}

/**
 * Metres of wall per bay for this building — `faVocab().mod`, the published
 * convention, running 3.1 m for a 1900s apartment house to 8.0 m for a modern
 * industrial shed.
 *
 * **This is the single largest source of variety in the frame and it costs the
 * caller one divisor.** `buildings.ts` divides the run along a wall by a
 * nominal `BAY_M = 4.6` for every building in the city; dividing it by this
 * instead gives a row house twice the bays of the warehouse behind it at the
 * same wall length, which is the rhythm the two actually have.
 */
export function facadeModuleM(o: FacadeKey): number {
  return faVocab(o.type, o.era, o.shop).mod;
}

/** Everything one wall needs, in one call. */
export interface WallFacade {
  /** the tile for the wall body — an index into `FACADE_TILES` */
  readonly body: number;
  /** the tile for the ground band, or -1 when the ground storey is as above */
  readonly ground: number;
  /** metres of wall per bay: `u = runAlongWall / moduleM` */
  readonly moduleM: number;
  /** bands up the wall: `v = 0` at the foot, `v = bands` at the top. 0 means
   *  the wall carries no rhythm at all, and `body` is then `TILE_BLANK`, so
   *  any `v` draws the same thing. */
  readonly bands: number;
}

export function wallFacade(o: FacadeKey): WallFacade {
  return {
    body: facadeTile(o),
    ground: facadeGroundTile(o),
    moduleM: facadeModuleM(o),
    bands: o.storeys > 0 ? o.storeys : 0,
  };
}

// ── the atlas ───────────────────────────────────────────────────────────────

export interface FacadeAtlas {
  /**
   * The whole sheet, `cols` x `rows` cells in `FACADE_TILES` order. It is the
   * surface every cell was drawn on, so a debug view and a future texture-array
   * path read exactly the pixels the materials do. It is CLAMPED and is not
   * itself tileable — see `tiles`.
   */
  readonly texture: CanvasTexture;
  readonly cols: number;
  readonly rows: number;
  /**
   * One tangent-space normal per tile, in `FACADE_TILES` order, derived from
   * the tile's own luminance — see §AND THE RELIEF. Indexed exactly as
   * `tiles` is, so a material takes the pair.
   */
  readonly normals: DataTexture[];
  /**
   * Cell `i`, cut out of the sheet and set to `RepeatWrapping` — **this is what
   * a `MeshLambertMaterial.map` takes.**
   *
   * A wall's `u` counts bays and its `v` counts storeys, so both run well past
   * 1 and the map has to wrap. Fixed-function wrapping wraps the WHOLE image,
   * and `offset`/`repeat` are applied before the wrap, so an atlas cell
   * selected that way bleeds into its neighbours the first time `u` passes 1.
   * There is no way around that without a shader or a texture array, and this
   * port deliberately keeps three.js's own materials — so the cells are cut.
   * They share no GPU memory with the sheet and cost about a quarter of a
   * megabyte between them.
   */
  readonly tiles: readonly CanvasTexture[];
  dispose(): void;
}

/**
 * ── EVERY VOCABULARY AT THE SAME EXPOSURE ────────────────────────────────
 *
 * The tile is a MULTIPLIER over the wall's own palette colour: it says where
 * the openings are, not what the building is made of. So its MEAN is not free
 * — it is the amount by which having windows darkens a wall, and it has to be
 * the same number for every vocabulary, or the eight tiles become eight
 * different exposures of the same material table.
 *
 * Unlevelled they are nothing like each other. A curtain wall is glass over
 * nearly its whole area and a sash wall is a punched hole in a solid field, so
 * the first came out far darker than the second — and since `wallPalette`
 * gives a downtown tower a PALE grey, the frame answered with black slabs
 * where the published page draws pale blue-grey ones. Measured over the four
 * paired cameras, the port's close frames sat 14 (block) and 19 (street)
 * points of luminance under the Canvas page's, against 3 and 5 points OVER it
 * at the two wide cameras where no facade is resolved. The gap was the tiles.
 *
 * ── AND IT IS A LIFT, NOT A SCALE ────────────────────────────────────────
 * Multiplying every texel by `target / mean` would push the wall FIELD — which
 * is white, the "leave the material alone" value — past 1 and clip it, which
 * would flatten the sill and the floor band into the field and lose the mark
 * this whole file exists to make. `1 - (1 - v) * k` pulls every texel toward
 * white by one factor instead: the field stays exactly white, the ORDER of the
 * marks is preserved, and only their depth changes. Solving
 * `1 - k * mean(1 - v) = target` gives the one `k` that lands the mean.
 */
const FACADE_MEAN = 0.84;

/**
 * HOW DEEP A PAINTED OPENING SITS, AND IT WAS A FIFTH OF A REAL ONE.
 *
 * MEASURED off the running page, before this existed: the eight tiles averaged
 * 215-235 of 255 and the darkest texel in any of them was **147**. So a window
 * darkened its wall by about a tenth, and the deepest part of one reached 58 %
 * of the wall colour.
 *
 * A real opening seen from outside in daylight reads at **10-25 %** of the wall
 * around it — you are looking into an unlit room, and it is the highest-contrast
 * thing on a building. Ours were two to five times too light.
 *
 * They were painted that way on purpose. The tiles were levelled until the
 * port's close frames matched the CANVAS page's luminance, and that page is
 * deleted. Parity with a renderer that no longer exists is not a constraint.
 *
 * `1 - (1 - v) * k` pulls every texel AWAY from white by one factor: the field
 * stays exactly white — the "leave the material alone" value this whole file
 * turns on — and only the depth of the marks changes. The floor stops the
 * deepest mark going to pure black, which would lose the sill and the reveal
 * into one flat hole.
 */
const MARK_DEEPEN = 2.35;
const MARK_FLOOR = 0.10;

function deepenMarks(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c] / 255;
      d[i + c] = Math.round(255 * Math.max(MARK_FLOOR, 1 - (1 - v) * MARK_DEEPEN));
    }
  }
}

function levelTile(g: CanvasRenderingContext2D, px: number): void {
  const img = g.getImageData(0, 0, px, px);
  const d = img.data;
  deepenMarks(d);
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    dark += 1 - (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
  }
  dark /= d.length / 4;
  /* a tile with no marks at all — BLANK, PLAIN — is already the field and
     wants no lift; `k` would divide by zero */
  if (dark < 1e-4) return;
  /* ── AND IT MAY ONLY LIFT, NEVER DARKEN ────────────────────────────────
     `k = (1 - MEAN) / dark` lands the mean from either side, and that is the
     bug. A tile with FEW marks has a small `dark`, so `k` comes out above 1
     and the levelling drives its openings toward black to make the average
     come out right. On the Mint and Subtreasury Building — a monumental wall
     with a sparse punched rhythm — that turned the published small pale window
     pairs into solid black bars, while the published page draws them at barely
     a shade under the wall.

     The purpose here was only ever to stop a DENSE vocabulary (a glass curtain
     wall) reading two stops darker than a sparse one. That is a ceiling, not a
     target: a wall with few windows genuinely is lighter than one that is all
     glass, and forcing them to the same average asserts the opposite. Clamped
     at 1, the levelling pulls the dark tiles up and leaves every other tile
     exactly as the published vocabulary drew it. */
  const k = Math.min(1, (1 - FACADE_MEAN) / dark);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - (255 - d[i]) * k;
    d[i + 1] = 255 - (255 - d[i + 1]) * k;
    d[i + 2] = 255 - (255 - d[i + 2]) * k;
  }
  g.putImageData(img, 0, 0);
}

/**
 * Build the atlas.
 *
 * Returns **null where there is no `document`** — server rendering and the test
 * environment — which is the same answer `buildings.ts` `facadeTexture()`
 * gives and the reason its caller already handles a null map.
 */
/**
 * How much relief the facade's own painting is worth, in the height field the
 * normal is taken from. Declared: the tile records where the openings ARE, not
 * how deep they sit, so this is one number for the whole vocabulary in exactly
 * the sense `BAY_DEPTH_M` is one depth for the whole city.
 */
const FACADE_RELIEF = 6.4;

/**
 * A tangent-space normal for one tile, read off the sheet it was just drawn
 * on. Height is inverted luminance, so the dark of a painted window becomes
 * the recess a window is, and the pale of the wall around it stays proud.
 *
 * Sampled with wrap, because the tile repeats across a wall and a normal that
 * did not wrap would put a seam down every storey.
 */
function tileNormal(
  sg: CanvasRenderingContext2D,
  px: number,
  i: number,
): DataTexture {
  const ox = (i % FACADE_COLS) * px;
  const oy = Math.floor(i / FACADE_COLS) * px;
  const src = sg.getImageData(ox, oy, px, px).data;
  const h = new Float32Array(px * px);
  for (let k = 0; k < px * px; k++) {
    const r = src[k * 4];
    const g = src[k * 4 + 1];
    const b = src[k * 4 + 2];
    /* inverted luminance: dark paint is a hole */
    h[k] = 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  const at = (x: number, y: number): number =>
    h[((y + px) % px) * px + ((x + px) % px)];
  const data = new Uint8Array(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * FACADE_RELIEF;
      const dy = (at(x, y + 1) - at(x, y - 1)) * FACADE_RELIEF;
      /* normalise (-dx, -dy, 1) into the 0..1 the encoding wants */
      const L = Math.hypot(dx, dy, 1);
      const o = (y * px + x) * 4;
      data[o] = Math.round(((-dx / L) * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round(((-dy / L) * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / L * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const t = new DataTexture(data, px, px, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.needsUpdate = true;
  return t;
}

export function facadeAtlas(dpr?: number): FacadeAtlas | null {
  if (typeof document === "undefined") return null;
  const px = (dpr ?? 1) >= 2 ? FACADE_TILE_PX * 2 : FACADE_TILE_PX;

  const sheet = document.createElement("canvas");
  sheet.width = px * FACADE_COLS;
  sheet.height = px * FACADE_ROWS;
  const sg = sheet.getContext("2d");
  if (!sg) return null;
  sg.fillStyle = "#ffffff";
  sg.fillRect(0, 0, sheet.width, sheet.height);

  const tiles: CanvasTexture[] = [];
  for (let i = 0; i < FACADE_TILES.length; i++) {
    const cv = document.createElement("canvas");
    cv.width = px;
    cv.height = px;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, px, px);
    drawTile(g, px, i);
    levelTile(g, px);
    sg.drawImage(cv, (i % FACADE_COLS) * px, Math.floor(i / FACADE_COLS) * px);

    const t = new CanvasTexture(cv);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    /* a wall is near-vertical and so is much less foreshortened than a roof,
       but a facade tile is 1 px of window line at the district camera and the
       cost of the higher sample count is the same as the roof's — see
       `roof-grain.ts` §A ROOF IS A HORIZONTAL PLANE. */
    t.anisotropy = 16;
    tiles.push(t);
  }

  const texture = new CanvasTexture(sheet);
  texture.colorSpace = SRGBColorSpace;

  /* ── AND THE RELIEF, WHICH THE WALLS HAVE NEVER HAD ────────────────────
     Reported from the page: *"you didnt give any form to facades or anything
     its all flat"*. That is literally what the wall material was — a colour
     texture on a flat-shaded plane, with no normal map anywhere. The ROOF has
     carried one since `roof-grain.ts`; the wall, which is the surface a reader
     at street level actually looks AT, carried none.

     The relief is derived from the tile that is already drawn rather than
     authored a second time, so it can never disagree with the picture: the
     openings this vocabulary paints dark become the openings the light finds
     recessed, and a change to `drawTile` moves both together. Height is the
     tile's own luminance, inverted — a window is dark and it is also a hole.

     This adds no claim. `manifest.facade.NOT_MEASURED` still says what it
     said; the same painted facade simply catches light now. */
  const normals = tiles.map((_t, i) => tileNormal(sg, px, i));

  return {
    texture,
    cols: FACADE_COLS,
    rows: FACADE_ROWS,
    tiles,
    normals,
    dispose() {
      texture.dispose();
      for (const t of tiles) t.dispose();
      for (const t of normals) t.dispose();
    },
  };
}

// ── addressing a cell: the uv convention ────────────────────────────────────

/**
 * THE UV RECTANGLE OF ONE CELL, IN PLAIN NUMBERS.
 *
 * ── the convention ───────────────────────────────────────────────────────
 * Cell `i` is column `i % FACADE_COLS`, row `floor(i / FACADE_COLS)`, counting
 * rows DOWN the canvas in `FACADE_TILES` order — which is the order
 * `facadeAtlas` draws them in. The rectangle returned is in **three.js uv
 * space**, whose origin is bottom-left, so the row index is flipped:
 *
 * ```
 *   ox = col / cols          sx = 1 / cols
 *   oy = (rows - 1 - row)    sy = 1 / rows
 *          / rows
 * ```
 *
 * and a point `(u, v)` INSIDE one cell — both already wrapped into [0,1) —
 * lands at
 *
 * ```
 *   su = ox + (u - Math.floor(u)) * sx
 *   sv = oy + (v - Math.floor(v)) * sy
 * ```
 *
 * ── the flip is not a detail ─────────────────────────────────────────────
 * `facadeAtlas` leaves `CanvasTexture.flipY` at three.js's default, `true`, so
 * the sheet is uploaded upside down relative to the canvas it was painted on.
 * The `rows - 1 - row` above is that flip and nothing else. `drawTile` already
 * carries the matching flip inside a cell — its `rect()` measures `up` from the
 * FLOOR and writes to the last row of the canvas — so a cell is right way up
 * once both are applied, and neither can be removed alone.
 *
 * ── WHEN THIS IS THE RIGHT TOOL, AND WHEN `atlas.tiles[i]` IS ────────────
 * This is for geometry that carries its OWN baked uvs — a per-bay, per-band
 * quad, where `u` and `v` are already in [0,1] and the wrap is done on the CPU
 * before the atlas rectangle is applied. Bake `su`/`sv` into the `uv`
 * attribute and one draw call can wear all eight vocabularies.
 *
 * It is **not** valid as `texture.offset.set(ox, oy)` / `repeat.set(sx, sy)` on
 * a wall whose `u` counts bays and whose `v` counts storeys, which is what
 * `buildings.ts` emits today. Fixed-function wrapping wraps the whole sheet
 * AFTER offset and repeat are applied, so the first time `u` passes 1 the
 * sampler walks straight into the neighbouring cell. That path wants
 * `atlas.tiles[i]`, which is the cell already cut out and set to
 * `RepeatWrapping`.
 *
 * ── plain numbers, deliberately ──────────────────────────────────────────
 * Four scalars, not two `Vector2`s and not an object shaped like one. Handing
 * three.js a plain literal where it wants a class instance compiles and fails
 * at runtime, and it has bitten this codebase three times; four named scalars
 * cannot be assigned to `texture.offset` by accident, because `tsc` rejects it.
 * If you do want them on a texture, call the setters: `t.offset.set(ox, oy)`.
 *
 * An index outside the atlas degrades to cell 0, the blank wall — the same
 * refusal `planOf` makes, for the same reason: an out-of-range tile must never
 * silently become another building's vocabulary.
 */
export interface FacadeTileUV {
  /** u of the cell's left edge */
  readonly ox: number;
  /** v of the cell's BOTTOM edge, in three.js uv space */
  readonly oy: number;
  /** width of one cell in u: `1 / FACADE_COLS` */
  readonly sx: number;
  /** height of one cell in v: `1 / FACADE_ROWS` */
  readonly sy: number;
}

export function facadeTileUV(tile: number): FacadeTileUV {
  const i = Number.isInteger(tile) && tile >= 0 && tile < FACADE_COLS * FACADE_ROWS ? tile : TILE_BLANK;
  const col = i % FACADE_COLS;
  const row = Math.floor(i / FACADE_COLS);
  return {
    ox: col / FACADE_COLS,
    oy: (FACADE_ROWS - 1 - row) / FACADE_ROWS,
    sx: 1 / FACADE_COLS,
    sy: 1 / FACADE_ROWS,
  };
}

/** which published class each cell reads its convention out of. Stated, so a
 *  reader can check a tile against `FA_VOCAB` by eye. */
interface TilePlan {
  /** an index into `FA_TYPES`, or -1 for the blank wall */
  readonly type: number;
  readonly era: number;
  readonly shop: boolean;
  /** the role the tile is evaluated at: a ground band needs `ROLE_FRONT` for
   *  `faceWeights` to give it a ground feature at all */
  readonly role: number;
  /** the UNCLASSED row is *"deliberately duller than a classed building"*
   *  because the record knows less about it. `facades.ts` spends that on the
   *  entrance, the shopfront, the cornice and the bay; this spends it on the
   *  reveal and the glazing bar too, so a footprint the roll does not class
   *  gets an opening and nothing else. */
  readonly plain: boolean;
  readonly fam: FaFamily;
}

function ty(name: string): number {
  return FA_TYPES.indexOf(name);
}

function planOf(tile: number): TilePlan | null {
  switch (tile) {
    case TILE_SASH:
      return { fam: "victorian", type: ty("FLATS"), era: 0, shop: false, role: ROLE_BACK, plain: false };
    case TILE_PUNCHED:
      return { fam: "modern", type: ty("FLATS"), era: 3, shop: false, role: ROLE_BACK, plain: false };
    case TILE_CURTAIN:
      return { fam: "modern", type: ty("OFFICE"), era: 4, shop: false, role: ROLE_BACK, plain: false };
    case TILE_SHED:
      return { fam: "plain", type: ty("INDUSTRIAL"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    case TILE_DECK:
      return { fam: "plain", type: ty("GARAGE"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    case TILE_PLAIN:
      return { fam: "plain", type: ty("UNCLASSED"), era: 0, shop: false, role: ROLE_BACK, plain: true };
    case TILE_SHOPFRONT:
      return { fam: "classical", type: ty("RETAIL"), era: 2, shop: true, role: ROLE_FRONT, plain: false };
    case TILE_STUCCO:
      return { fam: "revival", type: ty("HOUSE"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    case TILE_CLASSICAL:
      return { fam: "classical", type: ty("FLATS"), era: 1, shop: false, role: ROLE_BACK, plain: false };
    case TILE_MODERNE:
      return { fam: "moderne", type: ty("APARTMENT"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    default:
      /* TILE_BLANK. A party wall carries no openings and neither does a wall
         with no published rhythm, so the cell stays exactly the material
         colour — and an out-of-range index degrades to plain wall rather than
         to another building's vocabulary. */
      return null;
  }
}

function drawTile(g: CanvasRenderingContext2D, px: number, tile: number): void {
  const p = planOf(tile);
  if (!p) return;

  /* THE TILE IS `faceWeights` ASKED ABOUT ONE BAY OF ONE BAND. `Lm` is the
     class's own module, so `bayCount` returns exactly 1 and every metre the
     answer comes back in is a fraction of this tile. `storeys` is 1, so
     `bandM` is `FACADE_BAND_M`. The camera is far enough in that every ramp
     is saturated: the tile is the vocabulary at full detail, and the mipmap
     is what fades it. */
  const mod = faVocab(p.type, p.era, p.shop).mod;
  const w = faceWeights({
    Lm: mod,
    Hm: FACADE_BAND_M,
    dhPx: FACADE_BAND_M * TILE_CAM,
    wallPx: mod * TILE_CAM,
    storeys: 1,
    role: p.role,
    type: p.type,
    era: p.era,
    shop: p.shop,
    camScale: TILE_CAM,
  });
  if (w.bands <= 0) return;

  /* a rectangle ON the tile: `s` across in [0,1], `up` from the FLOOR in
     [0,1] of the band. Canvas y runs down and three.js flips the image, so
     the floor is the last row of the canvas. */
  const rect = (s0: number, s1: number, up0: number, up1: number): void => {
    const a = Math.round(s0 * px);
    const b = Math.round(s1 * px);
    const t = Math.round(px * (1 - up1));
    const u = Math.round(px * (1 - up0));
    g.fillRect(a, t, Math.max(1, b - a), Math.max(1, u - t));
  };
  /** the `FA_V.lit` group at the multiply ceiling: the wall's own colour */
  const lit = (): void => {
    g.fillStyle = "#ffffff";
  };

  /* `flushFaces` fills the openings and the ground feature at ONE value —
     `glassM` for a curtain wall, `glass` otherwise — and `faGlassy` is what
     picks it. A curtain wall reflects the sky instead of showing a room. */
  const glass = faGlassy(p.type, p.era) ? A_GLASSM : A_GLASS;

  if (w.gnd === GND_SHOP) {
    /* ── THE SHOPFRONT BAND, `emitFace`'s own arithmetic ────────────────
       Glazed ACROSS the frontage from just off the pavement to its fascia,
       with a mullion on every bay line, a stallriser line and a fascia line.
       One band, not a row of punched holes — which is the whole difference
       between a shopping street and a residential one. */
    const fh = w.bandM;
    const top = (fh - Math.min(FA_SHOP_FASCIA, fh * 0.24)) / fh;
    const bot = Math.min(FA_SHOP_TOE, fh * 0.04) / fh;
    const gap = 0.1 / mod;
    g.fillStyle = `rgba(0, 0, 0, ${glass})`;
    rect(gap, 1 - gap, bot, top);

    lit();
    const rz = Math.min(FA_SHOP_SILL, fh * 0.14) / fh;
    rect(gap, 1 - gap, rz - Math.min(0.07, fh * 0.02) / fh, rz);
    rect(gap, 1 - gap, top, top + Math.min(0.2, fh * 0.06) / fh);
    /* the mullion sits ON the bay line, so each tile carries its two halves
       and the tiling puts them back together */
    const mw = 0.045 / mod;
    rect(0, mw, bot, top);
    rect(1 - mw, 1, bot, top);
    return;
  }

  /* ── THE ORDINARY OPENING, LAID OUT BY ERA ──────────────────────────
     `faceWeights` gives the opening's width, height and sill off this class's
     own `FA_VOCAB` row. What it does NOT give is the LAYOUT — whether the bay
     carries one light or two, upright or lying down — and that is what makes
     a pre-fire flat look unlike a post-war one. The roll publishes the era;
     these are three drawings of it.

     DECLARED, like every other mark in this file. `manifest.facade` already
     says the roll does not record where a window is and that the vocabulary is
     a convention per (type, era). This is that convention given three shapes
     instead of one, which is the difference the eye actually reads. */
  const owF = w.ow / mod;
  const ohF = w.oh / w.bandM;
  const sillF = w.sill_m / w.bandM;

  /** one light, with its head reveal, sill and jamb */
  const light = (a0: number, a1: number, b0: number, b1: number,
                 bars: boolean): void => {
    g.fillStyle = `rgba(0, 0, 0, ${glass})`;
    rect(a0, a1, b0, b1);
    if (p.plain) return;
    /* THE LIT REVEAL DOWN THE LEFT JAMB. The key light in this frame is upper
       right — the same light every contact shadow is thrown from — so the jamb
       that faces it is the left one, and it is the only part of a recessed
       opening brighter than the wall. */
    lit();
    const rv = Math.max(1 / px, 0.035 / mod);
    rect(a0, a0 + rv, b0, b1);
    /* the HEAD never sees the sky, so it is darker than the glass under it —
       it is what stops an opening reading as paint on a wall */
    const headH = Math.max(1 / px, Math.min((b1 - b0) * 0.16, 0.12 / w.bandM));
    g.fillStyle = `rgba(0, 0, 0, ${Math.min(0.95, glass + 0.28)})`;
    rect(a0 + rv, a1, b1 - headH, b1);
    /* the SILL oversails, so it takes light the wall is turned from and drops
       a shadow on the wall beneath it */
    const st = Math.max(1 / px, 0.05 / w.bandM);
    lit();
    rect(a0 - rv, a1 + rv, b0 - st, b0);
    g.fillStyle = "rgba(0, 0, 0, 0.20)";
    rect(a0 - rv, a1 + rv, b0 - st * 2.1, b0 - st);
    if (!bars) return;
    /* one mullion and one meeting rail, which is what turns a dark rectangle
       into a window. The rail sits at 0.54 of the light, not at half: a sash's
       meeting rail is above centre. */
    g.fillStyle = `rgba(0, 0, 0, ${glass})`;
    lit();
    const bt = Math.max(1 / px, 0.03 / mod);
    rect((a0 + a1) / 2 - bt, (a0 + a1) / 2 + bt, b0, b1);
    const rh = Math.max(1 / px, 0.03 / w.bandM);
    rect(a0, a1, b0 + (b1 - b0) * 0.54 - rh, b0 + (b1 - b0) * 0.54 + rh);
  };

  if (tile === TILE_CURTAIN) {
    /* ── A CURTAIN WALL IS A FRAME, NOT A WINDOW IN A WALL ────────────
       It used to fall through to the post-war branch below and come out as
       one wide light across 90 % of the bay, which over a whole tower is a
       near-uniform multiply — and that is why the glass towers downtown read
       as flat coloured slabs standing next to punched-window blocks that read
       fine.

       Drawing the glass DARKER did not fix it, and the reason is `levelTile`
       three hundred lines up. It lands every tile on one mean darkness so the
       vocabularies are not eight different exposures of the same material
       table, and it does that by pulling every texel toward white by a single
       factor. On a sparse tile that factor is clamped at 1 and nothing moves.
       On a tile that is dark over its WHOLE area it comes out near 0.27, and
       since the same factor scales the tile's contrast as well as its mean,
       the mullions and the spandrel are crushed along with the glass. A full
       coverage tile cannot win an argument with a mean.

       It does not need to. The wall's palette entry for a post-war tower is
       already a pale blue-grey, and on a reflective curtain wall THAT IS THE
       GLASS — the wall does not sit behind the window, the wall IS the
       window. So the field is left exactly alone, which is what white means
       in this file, and the only marks are the frame hung on it:

         a SPANDREL over each floor slab, opaque and darker than the glass —
         the horizontal banding every glass tower in this city is read by;

         MULLIONS, dark anodised aluminium, which is what a curtain grid
         actually looks like against reflective glass from across a street;

         and the slab's own shadow line under the spandrel.

       DECLARED like every other mark in this file: the roll publishes that a
       building is a post-war office and nothing at all about its grid. */
    const dk = (a2: number): string => `rgba(0, 0, 0, ${a2})`;

    /* THE SPANDREL. A floor band is about 3.6 m and the panel over the slab
       about 0.95 of it, which is the proportion that reads as banding rather
       than as a window strip. */
    const sp = Math.min(0.42, Math.max(0.16, 0.95 / w.bandM));
    g.fillStyle = dk(0.30);
    rect(0, 1, 0, sp);
    /* the slab edge under it, where the floor plate throws its own shadow */
    g.fillStyle = dk(0.46);
    rect(0, 1, 0, Math.max(1 / px, 0.07 / w.bandM));

    /* THE MULLIONS. A curtain module is about 1.5 m and this class's bay is
       several times that, so the bay is divided rather than mullioned only on
       its own line — one line every 5 m is not a curtain wall. `lites` is the
       count that lands the module nearest 1.5 m, bounded so a tile never
       carries more lines than it has texels to draw them with. */
    const lites = Math.max(1, Math.min(6, Math.round(mod / 1.5)));
    const mw = Math.max(1 / px, 0.075 / mod);
    g.fillStyle = dk(0.26);
    for (let k = 0; k <= lites; k++) {
      const c = k / lites;
      rect(Math.max(0, c - mw), Math.min(1, c + mw), sp, 1);
    }
    return;
  }

  if (p.fam === "victorian") {
    /* ── PAIRED AND UPRIGHT, UNDER A HEAVY HEAD ──────────────────────
       Two narrow lights with a pier between, taller than they are wide, and
       a moulded head band over the pair. This is the vertical emphasis the
       pre-fire stock is read by. */
    const pier = Math.max(0.055, 0.16 / mod);
    const each = Math.max(0.06, (owF - pier) / 2);
    const tall = Math.min(0.86, ohF * 1.20);
    const c = 0.5;
    light(c - pier / 2 - each, c - pier / 2, sillF, sillF + tall, true);
    light(c + pier / 2, c + pier / 2 + each, sillF, sillF + tall, true);
    /* the moulded head over both lights */
    const hb = Math.max(1 / px, 0.10 / w.bandM);
    lit();
    rect(c - pier / 2 - each - 0.02, c + pier / 2 + each + 0.02,
         sillF + tall, sillF + tall + hb);
    g.fillStyle = "rgba(0, 0, 0, 0.22)";
    rect(c - pier / 2 - each - 0.02, c + pier / 2 + each + 0.02,
         sillF + tall + hb, sillF + tall + hb * 1.6);
  } else if (p.fam === "classical") {
    /* ── TALL, SINGLE, SYMMETRICAL, WITH A STRING COURSE ─────────────
       The Edwardian and Classical Revival wall: one tall light per bay,
       wider than the Victorian pair, and a continuous band at the floor
       rather than a moulding over each opening. */
    const tall = Math.min(0.82, ohF * 1.12);
    const wide = Math.min(0.62, owF * 1.10);
    const s0 = 0.5 - wide / 2;
    light(s0, s0 + wide, sillF, sillF + tall, true);
    const sc = Math.max(1 / px, 0.07 / w.bandM);
    lit(); rect(0, 1, sillF - sc * 2.4, sillF - sc * 1.4);
    g.fillStyle = "rgba(0, 0, 0, 0.16)";
    rect(0, 1, sillF - sc * 3.2, sillF - sc * 2.4);
  } else if (p.fam === "revival") {
    /* ── SQUARE, IN A LOT OF WALL ────────────────────────────────────
       The inter-war stucco: smaller than the eras either side of it and
       standing higher off the floor. The Sunset and the Richmond are this. */
    const sq = Math.min(owF * 0.86, ohF * 0.92);
    const s0 = 0.5 - sq / 2;
    light(s0, s0 + sq, sillF * 1.15, sillF * 1.15 + sq * 1.05, true);
  } else if (p.fam === "moderne") {
    /* ── HORIZONTAL, BANDED, NO RAIL ─────────────────────────────────
       Deco and Streamline: the light runs wide, the wall carries a band
       above and below it, and a sash's meeting rail has no place here. */
    const wide = Math.min(0.86, owF * 1.5);
    const shortF = Math.max(0.18, ohF * 0.72);
    const s0 = 0.5 - wide / 2;
    light(s0, s0 + wide, sillF * 1.1, sillF * 1.1 + shortF, false);
    const bb = Math.max(1 / px, 0.05 / w.bandM);
    lit();
    rect(0, 1, sillF * 1.1 + shortF + bb * 0.8, sillF * 1.1 + shortF + bb * 2.0);
    rect(0, 1, sillF * 1.1 - bb * 2.0, sillF * 1.1 - bb * 0.8);
  } else {
    /* ── WIDE AND LYING DOWN — post-war and plain ────────────────────
       One light across most of the bay, shallower than it is broad, with no
       meeting rail: a picture window is not a sash. */
    const wide = Math.min(0.90, owF * 1.42);
    const shortF = Math.max(0.16, ohF * 0.80);
    const s0 = 0.5 - wide / 2;
    light(s0, s0 + wide, sillF, sillF + shortF, false);
  }

  /* the slab edge, across the whole tile at the floor */
  const fl = Math.max(1 / px, 0.045 / w.bandM);
  g.fillStyle = "rgba(0, 0, 0, 0.13)";
  rect(0, 1, 0, fl);
}

// ── the wall's colour, widened honestly ─────────────────────────────────────

/**
 * HOW FAR TWO NEIGHBOURS OF THE SAME MATERIAL MAY BE DRAWN APART, AND THE
 * RENDERER HAS ALREADY ANSWERED THAT QUESTION ONCE.
 *
 * `materials.ts` gives every ROOF one of four shades of its own colour by
 * which quartile of its height band it falls in, *"so two neighbours of the
 * same material and different heights do not read as one long roof"*. That is
 * this exact problem, already solved, at a declared magnitude: `RSHADE` is
 * `[0.875, 0.958, 1.042, 1.14]`, and its **smallest adjacent step is 0.083**.
 *
 * That step was BORROWED, and re-deriving it moved the number. MEASURED over
 * the 24 wall materials, asking the question a value jitter actually poses —
 * *is one material a scalar multiple of another, so that scaling A lands on
 * B?* — the closest crossable pair is `#f0e4c8` and `#e6dcc4` at a ratio of
 * **0.0356**. Tighter than RSHADE's 0.083, so the borrowed bound was not
 * conservative; it was loose, and pointed at the wrong quantity.
 *
 * ── AND THE PAIR IT PROTECTS IS ONE NOBODY CAN SEE ───────────────────────
 * `#f0e4c8` and `#e6dcc4` are **13 RGB units apart** — two creams, indistinct
 * side by side. Crossing that boundary costs a reader nothing. Ignoring pairs
 * under 28 units, the closest crossable pair is `#f0e4c8` / `#e0d4b4` and the
 * ceiling is **0.0713**.
 *
 * `2 x 0.060` = 0.120 sits ABOVE that, and this is the one number on this page
 * that is an ART CHOICE rather than a measurement. The argument for making it:
 * the wall material table is not measured data. It is a lookup on use class,
 * year band and storey band — a rule of thumb. Protecting its exact values
 * from a jitter protects a guess, and in the Sunset it protects it at the cost
 * of every house on the blockface coming out the identical colour, because
 * every house there shares a use class, an era and a storey count.
 *
 * The ROOF is the opposite case and is treated as one: that colour IS measured,
 * per building, from aerial imagery, and it gets no jitter at all — see
 * `lib/city/buildings.ts` §roofTone, where the fix was to stop flattening the
 * measurement rather than to add spread on top of it.
 */
export const FACADE_TINT_V = 0.060;

/**
 * THE HUE IS THE DANGEROUS AXIS AND IT IS BOUNDED FIVE TIMES TIGHTER.
 *
 * A value jitter cannot be mistaken for the material table, because the table
 * is not a luminance ladder. MEASURED over the sixteen wall materials: the
 * closest pair in luminance is `#95aaad` and `#a7a6a0` at **identical
 * luminance, 22.6 RGB units apart** — a blue-grey and a warm grey. Several of
 * the table's own distinctions are hue and nothing else, so a hue jitter is
 * the one that could make a building read as the wrong material.
 *
 * The tilt is applied as `r x (1 + t)`, `b x (1 - t)` at fixed `g`, so on a
 * mid tone it moves a colour about `233 t` RGB units and two neighbours tilted
 * opposite ways separate by about `466 t`. At `t = 0.012` that is **5.6 units,
 * a quarter of the 22.6 that separates the closest two materials the table
 * actually distinguishes by hue.** It widens a blockface; it cannot cross a
 * material.
 */
export const FACADE_TINT_H = 0.022;

/**
 * The record knows less about a footprint it does not class or does not date,
 * *"and the drawing should say so"* — `FA_VOCAB`'s own account of its
 * UNCLASSED row. Those walls take half the spread, so they read as a more
 * even mass than a classed blockface does.
 */
export const FACADE_TINT_UNCLASSED = 0.5;

/** the tightest bound that holds for every channel of every tint */
export const FACADE_TINT_MAX = (1 + FACADE_TINT_V) * (1 + FACADE_TINT_H) - 1;

/**
 * Three multipliers on the wall's palette RGB.
 *
 * **Plain numbers, deliberately, and not a `Color`.** Handing three.js a plain
 * object where it wants a class instance compiles and fails at runtime, and it
 * has bitten this codebase three times. The caller already computes
 * `wc[0] * WBOT` and `wc[0] * WTOP` per building; this multiplies into the
 * same expression and never constructs anything.
 */
export interface WallTint {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** murmur3's finaliser. The hash MUST be scrambled: `gid` is spatially
 *  ordered, so neighbouring buildings carry consecutive ids and an unmixed
 *  hash would lay a gradient across a block rather than break one up. */
function mix32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A TRIANGULAR draw on [-1, 1], not a uniform one: the sum of two independent
 * uniforms. A uniform draw puts as many buildings at the bound as at the
 * table's own value, which is the shape that makes a jitter read as a claim.
 * With this the mode is the palette entry and the bound is rare, so **the
 * material table is what the frame reads and the spread is what separates two
 * walls inside it.**
 */
function tri(seed: number): number {
  const a = (mix32(seed) >>> 8) / 0x1000000;
  const b = (mix32(seed ^ 0x9e3779b9) >>> 8) / 0x1000000;
  return a + b - 1;
}

/**
 * A small deterministic spread on one building's wall colour, inside its own
 * material.
 *
 * `key` is read for its class only — `type` and `era`, the two columns the
 * material table itself is keyed on — because a building has ONE wall colour
 * and `role` is per wall. `hash` is any stable per-building integer; `gid` is
 * the one the chunk already ships.
 *
 * Pure integer arithmetic on the hash, so the same building is the same colour
 * in every session, at every zoom, in every year.
 */
export function wallTint(key: FacadeKey, hash: number): WallTint {
  const k = unclassed(key.type, key.era) ? FACADE_TINT_UNCLASSED : 1;
  const v = 1 + tri(hash) * FACADE_TINT_V * k;
  const t = tri(hash ^ 0x51ed270b) * FACADE_TINT_H * k;
  return { r: v * (1 + t), g: v, b: v * (1 - t) };
}

/**
 * THE ONE-NUMBER FORM: A BOUNDED, DETERMINISTIC MULTIPLIER ON A WALL'S VALUE.
 *
 * `wallTint` moves a wall on two axes and needs the class columns to know how
 * far it may go. This is the value axis alone, keyed on nothing but the
 * building's own `gid`, for the caller that has one number to multiply and no
 * key to hand over. It is exactly `wallTint(...).g` for a classed footprint:
 *
 * ```
 *   wallJitter(gid) === wallTint(key, gid).g        // whenever key is classed
 * ```
 *
 * ── THE MAGNITUDE IS ±0.035, AND IT IS NOT A TASTE ───────────────────────
 * The return is in **[1 - FACADE_TINT_V, 1 + FACADE_TINT_V] = [0.965, 1.035]**,
 * so two neighbours drawn at opposite extremes differ by `2 x 0.035` = 0.070
 * of their shared material colour.
 *
 * That ceiling is borrowed rather than chosen. `materials.ts` already answers
 * this same question for roofs — four shades of one colour so *"two neighbours
 * of the same material and different heights do not read as one long roof"* —
 * and its `RSHADE` ladder `[0.875, 0.958, 1.042, 1.14]` has a smallest adjacent
 * step of **0.083**. 0.070 sits under it, so the widest separation this can
 * open between two walls is still narrower than the narrowest gap the renderer
 * itself declares to mean *two objects of the same material*. It widens a
 * blockface; it cannot be read as a second material. For scale, a single wall
 * already runs `WA.wbot` 0.76 to `WA.wtop` 1.14 of its own colour between the
 * pavement and its head — a span of 0.38, five times this — and the eye reads
 * that as one surface.
 *
 * ── WHY THE HASH IS MIXED AND THE DRAW IS TRIANGULAR ─────────────────────
 * `gid` is spatially ordered, so neighbouring buildings carry consecutive ids;
 * an unmixed hash would lay a gradient across a block instead of breaking one
 * up, which is the corduroy again on another axis. `mix32` is murmur3's
 * finaliser and `tri` is the sum of two independent uniforms, so the MODE is
 * the palette entry and the bound is rare — the material table stays what the
 * frame reads.
 *
 * Pure integer arithmetic on the id: the same building is the same value in
 * every session, at every zoom, in every year.
 */
/**
 * THE BLOCKFACE IS ONE COLOUR, AND THE JITTER WAS NEVER GOING TO FIX IT.
 *
 * MEASURED over 11,026 sixty-metre cells holding eight or more buildings: the
 * material table has 24 entries, a cell gets a median of **3**, and on
 * **20.2 %** of them a SINGLE key covers every building. The key is use class,
 * year band and storey band — and every house on a Sunset blockface shares all
 * three, so the table hands them one colour and `wallTint` moves each of them
 * a few per cent around it. A spread around one entry cannot make a blockface
 * that reads as separate buildings; only a different entry per building can.
 *
 * ── WHAT IS BEING ASSERTED, AND WHAT IS NOT ─────────────────────────────
 * NOT that a given house is pink. The record does not say what colour a wall
 * is and no aerial photograph can see one — the imagery `paintIdx` comes from
 * looks straight down and measures ROOFS. This is a declared treatment on a
 * table that is itself a lookup rather than a measurement.
 *
 * What it does assert is that neighbouring houses of the same class are
 * DIFFERENT colours, which is true of this city in a way the single-entry
 * blockface is not. San Francisco's painted stock is the most photographed
 * thing about it; drawing a street of it in one grey is the less faithful of
 * the two errors available.
 *
 * The table entry stays the anchor: each building blends toward one of eight
 * tints by a hash-chosen fraction, the fractions are small at the low end so
 * the family still reads as one material, and the draw is on `gid` so the same
 * house is the same colour in every session and every year.
 */
/**
 * ── PAINT BELONGS TO THE PAINTED STOCK, AND NOT TO A TOWER ───────────────
 *
 * The first cut of this handed one palette to all 166,166 footprints, so
 * downtown came out in sage and terracotta. San Francisco's towers are grey,
 * blue-grey and glass; its HOUSES are the painted ones. Applying a house
 * palette to an office block is not a widening, it is a wrong claim about a
 * building anyone can walk past and check.
 *
 * So the family is chosen by what the record already says the building is:
 * its use class, its era and its height. A footprint the roll does not class
 * gets the neutral set, because the record knows less about it and the drawing
 * should say so.
 */
const PAINTED_HEX: readonly string[] = [
  "#f2ece0", "#efdfae", "#e9c88c", "#e0a99a",
  "#cf8f7a", "#9fb3b8", "#aebba0", "#8f8378",
];
/** offices, hotels, institutions, and anything tall: stone, concrete, glass */
const CIVIC_HEX: readonly string[] = [
  "#e6e4de", "#d2cec4", "#b9bcc0", "#a7a49c",
  "#c8c4b6", "#96a1a8", "#8e8c86", "#dcd6c8",
];
/** sheds, garages, works: brick, block, corrugated metal */
const WORKS_HEX: readonly string[] = [
  "#c2b3a2", "#a8968a", "#9aa0a0", "#b4a898",
  "#8d857c", "#a89a86", "#9c9490", "#b8ada0",
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function toLin(hex: readonly string[]): (readonly [number, number, number])[] {
  return hex.map((h) => {
    const n = parseInt(h.slice(1), 16);
    return [
      srgbToLinear(((n >> 16) & 255) / 255),
      srgbToLinear(((n >> 8) & 255) / 255),
      srgbToLinear((n & 255) / 255),
    ] as const;
  });
}
const FAM_PAINTED = toLin(PAINTED_HEX);
const FAM_CIVIC = toLin(CIVIC_HEX);
const FAM_WORKS = toLin(WORKS_HEX);

/** how far a building may travel from its table entry toward its tint */
export const WALL_FAMILY_MIX = 0.97;
/** ...and how far a building the record does not class may travel */
export const WALL_FAMILY_MIX_UNCLASSED = 0.45;

/**
 * ANYTHING THIS TALL IS NOT PAINTED STOCK.
 *
 * A 25 m wall is eight storeys. Nothing in San Francisco that size is a
 * painted timber house, whatever its use class says, and a mis-classed tower
 * in a pastel is the most visible error this function can make.
 */
const PAINTED_MAX_H = 25;

/**
 * One building's wall colour: its material, moved toward a tint from the
 * family its own class belongs to. `base` is the palette entry in the
 * renderer's working (linear) space.
 */
export function wallFamilyRGB(
  base: readonly [number, number, number],
  gid: number,
  type?: number,
  era?: number,
  heightM?: number,
): [number, number, number] {
  const name = type === undefined ? "" : (FA_TYPES[type] ?? "");
  const tall = (heightM ?? 0) > PAINTED_MAX_H;
  const glassy = type !== undefined && era !== undefined && faGlassy(type, era);
  let fam = FAM_PAINTED;
  let mix = WALL_FAMILY_MIX;
  if (name === "INDUSTRIAL" || name === "GARAGE") {
    fam = FAM_WORKS;
  } else if (
    tall || glassy ||
    name === "OFFICE" || name === "HOTEL" || name === "INSTITUTION"
  ) {
    fam = FAM_CIVIC;
  } else if (name === "" || name === "UNCLASSED") {
    fam = FAM_CIVIC;
    mix = WALL_FAMILY_MIX_UNCLASSED;
  }
  const h = mix32(gid ^ 0x2545f491);
  const t = fam[h % fam.length];
  /* the amount travels too, so a family is a spread and not eight stripes */
  const k = mix * (0.4 + 0.6 * (((h >>> 8) & 1023) / 1023));
  return [
    base[0] + (t[0] - base[0]) * k,
    base[1] + (t[1] - base[1]) * k,
    base[2] + (t[2] - base[2]) * k,
  ];
}

export function wallJitter(gid: number): number {
  return 1 + tri(gid) * FACADE_TINT_V;
}

/* ═══════════════════════════════════════════════════════════════════════
   A PITCHED ROOF IS A DIFFERENT MATERIAL FROM A FLAT ONE, AND THE
   PHOTOGRAPH ONLY MEASURED ONE OF THEM WELL.
   ═══════════════════════════════════════════════════════════════════════

   The 32-entry roof palette is measured off an aerial photograph and
   `palette.ts` §39 is right about what it carries: the real value of a real
   roof, on the picture's scale. It is also measured looking STRAIGHT DOWN,
   which is the correct view of a flat roof and a poor one of a pitched roof —
   an aerial pixel over a gable is two slopes at two angles to the sun plus
   whatever sky the north face is reflecting, averaged. Tar and gravel comes
   through that honestly. A dark composition shingle does not: it comes back
   pale, and `roofTone` then pulls it 26 % toward its own grey, 18 % toward
   paper and lifts it 16 % more, because those numbers were chosen for a TOP
   FACE IN DAYLIGHT and a flat roof is exactly that.

   MEASURED, and this is the reason the Sunset reads as one material: the
   single-family row of `UMAT_ROOF` is `[3, 15, 3, 8, 13, 8, 1, 11]`, indexed
   by height band and era. A low single-family house — which is most of the
   west side — reaches two of those eight. Two entries, put through a
   transform that narrows everything toward paper, is one pale grey over
   forty thousand houses.

   ── SO THE PITCHED ROOF GETS A DECLARED MATERIAL ─────────────────────────
   Same shape as `wallFamilyRGB` and for the same reason: the table entry is
   the anchor, the family is the spread, and the draw is keyed on the
   building's published id so a house is the same house in every year.

   What is claimed: nothing about any individual roof. No register records
   what a San Francisco house is roofed with — not the assessor roll, not the
   survey, not the 2023 scan, which measures a surface and not a substance.
   This is art direction, and it is confined to the roofs this renderer
   already draws as an authored form. A FLAT ROOF IS NOT TOUCHED: the
   photograph measured it looking straight at it, and it stays exactly as it
   was.
*/

/**
 * Composition shingle and slate — what a pre-war San Francisco house is
 * actually topped with, and dark, which is the whole difference from the
 * pale aerial mean.
 *
 * ── AND THE HUES ARE SPREAD, WHICH IS THE SECOND CUT ────────────────────
 * The first eight were all a low-saturation grey a step apart in value, and
 * over a district of pre-fire stock — Hayes Valley, the Haight, the Mission
 * — they merged back into one dark roof, which is the complaint this whole
 * exercise started from wearing a darker coat. Value alone does not separate
 * a hundred roofs at district zoom; hue does.
 *
 * So the set keeps the same value range and opens the hue: three greys,
 * because most of them really are grey; two browns, for wood shingle gone
 * grey and the same weathered warmer; and slate blue, the green and the
 * oxide red of rolled asphalt — the only two hues a shingle roof in this
 * city ever actually takes, and both of them common on stock that has been
 * patched and re-covered for a century.
 */
const SHINGLE_HEX: readonly string[] = [
  /* charcoal composition, which is what most of them are */
  "#4b4a46", "#3d4043", "#54504c",
  /* wood shingle gone grey-brown, and the same weathered warmer */
  "#5c4f42", "#6b5a45",
  /* slate, and the green and oxide-red rolled asphalt the pre-fire stock
     was patched and re-covered with — the only two hues a shingle roof in
     this city ever actually takes */
  "#44566d", "#41513f", "#6b4638",
];

/**
 * The Mediterranean Revival roof, and the one genuinely COLOURED roof this
 * city has. Three of eight are clay, which puts tile on roughly a third of
 * the 1925-50 stock — the share that reads as characteristic of the Marina
 * and the outer avenues without turning a blockface into a tile field.
 */
const TILE_HEX: readonly string[] = [
  "#8a4e33", "#a0603c", "#78452f",
  /* and the other five are shingle, drawn from the same spread as
     `SHINGLE_HEX` — a Revival house that is not tiled is roofed like its
     neighbours, not out of a private list */
  "#54504c", "#41513f", "#5c4f42", "#44566d", "#4b4a46",
];

const FAM_SHINGLE = toLin(SHINGLE_HEX);
const FAM_TILE = toLin(TILE_HEX);

/**
 * How far a pitched roof travels from its table entry toward its material.
 *
 * Not 1.0. The measured entry still carries the ORDER — a roof the photograph
 * found dark stays darker than its neighbour — and at 0.82 that ordering
 * survives as about a fifth of the final value while the material decides the
 * rest. Set against the wall's 0.97 deliberately: a wall's table entry is a
 * material code and one key covers a fifth of the city, so there is little
 * left to preserve; a roof's is a photometric measurement of that particular
 * roof, and throwing all of it away would be discarding real information.
 */
export const ROOF_FAMILY_MIX = 0.94;

/**
 * One pitched roof's colour: its measured entry, moved toward a material from
 * the family its era belongs to. `base` is the palette entry in the
 * renderer's working (linear) space. Callers must only reach this for roofs
 * they are drawing as an authored pitched form — see the header.
 */
export function roofFamilyRGB(
  base: readonly [number, number, number],
  gid: number,
  fam: FaFamily,
): [number, number, number] {
  const set = fam === "revival" ? FAM_TILE : FAM_SHINGLE;
  const h = mix32(gid ^ 0x7f4a7c15);
  const t = set[h % set.length];
  /* ── AND THE AMOUNT BARELY TRAVELS, WHICH IS THE OPPOSITE OF THE WALL ──
     `wallFamilyRGB` lets its mix run from 0.4 to 1.0 of the family strength,
     and on a wall that is right: the eight tints are all pale, so a short
     travel reads as a paler version of the same tint and the spread is still
     a spread.

     A roof's materials are DARK and some of them are saturated, and a short
     travel toward one does not read as a paler shingle — it reads as the
     base, which is the pale aerial grey this exists to get away from.
     MEASURED against a typical entry after `roofTone` (#b4b0a6):

       terracotta #8a4e33   at 0.52 -> #a0887c   a dusty pink
                            at 0.94 -> #8d5842   clay
       charcoal   #4b4a46   at 0.52 -> #8a8780   pale grey
                            at 0.94 -> #565550   shingle

     So the travel is nearly fixed and the SPREAD comes from the palette,
     which is where a material difference belongs. 0.80 to 0.94 of the
     family strength; the measured entry still contributes between a
     twentieth and a fifth. */
  const k = ROOF_FAMILY_MIX * (0.85 + 0.15 * (((h >>> 9) & 1023) / 1023));
  return [
    base[0] + (t[0] - base[0]) * k,
    base[1] + (t[1] - base[1]) * k,
    base[2] + (t[2] - base[2]) * k,
  ];
}

/* ═══════════════════════════════════════════════════════════════════════
   AND FOR 171 TOWERS THE CITY PUBLISHES WHAT THEY ARE CLAD IN.

   Everything above chooses a wall's material from what a building IS — its
   use class, its era, its height — because that is all the assessor roll
   carries. For one register it is not: DataSF's Tall Building Inventory has a
   `facade_material` on all 180 of its rows, and 171 of them resolve to a
   footprint this map draws.

   That is a per-building measurement of the thing this file otherwise infers,
   and downtown is exactly where the inference is weakest: `wallFamilyRGB`
   sends everything tall to `FAM_CIVIC`, so 82 concrete towers, 42 glass ones,
   18 of stone and 5 of terra cotta all came out of one eight-entry pale set
   on a hash of the id. The Hobart Building and a 1980s concrete slab were the
   same grey.

   `build_tall_tops.py` reads the string and collapses 41 free-text spellings
   into five families. This is what the drawing does with each, and it is the
   authored half: which vocabulary and which colours a family is drawn in is
   the same kind of judgement as deciding a 1925 house is `revival`.
   ═══════════════════════════════════════════════════════════════════════ */

export type CladFamily = "glass" | "mixed" | "concrete" | "stone" | "terracotta";

/** reflective curtain wall — the wall IS the window, so the field is the glass */
const CLAD_GLASS_HEX: readonly string[] = [
  "#cfe0e4", "#b7ccd6", "#c6d8d4", "#a8c0cc", "#d6e4e2", "#b0c6d0",
];
/** glass named beside a solid: a frame with wide lights in it */
const CLAD_MIXED_HEX: readonly string[] = [
  "#c9ccc8", "#b4bcbe", "#c2c8c0", "#a8b2b6", "#d0d2ca",
];
/** concrete and its panel variants — the largest family by far */
const CLAD_CONCRETE_HEX: readonly string[] = [
  "#d8d4ca", "#c4c0b6", "#cec9bd", "#b6b2a8", "#dcd8ce", "#c8c2b4", "#bfbcb4",
];
/** stone and granite: paler, warmer, and quieter than concrete */
const CLAD_STONE_HEX: readonly string[] = [
  "#e6ddc9", "#d8ceb6", "#e2dac6", "#cfc6ae", "#ded4bd",
];
/** terra cotta — five towers, and they are the ones this city is read by */
const CLAD_TERRA_HEX: readonly string[] = [
  "#e0c9a6", "#d6b990", "#e6d2b0", "#cdb188", "#dcc49c",
];

const CLAD_SETS: Readonly<Record<CladFamily, (readonly [number, number, number])[]>> = {
  glass: toLin(CLAD_GLASS_HEX),
  mixed: toLin(CLAD_MIXED_HEX),
  concrete: toLin(CLAD_CONCRETE_HEX),
  stone: toLin(CLAD_STONE_HEX),
  terracotta: toLin(CLAD_TERRA_HEX),
};

/**
 * The wall vocabulary a published cladding is drawn with.
 *
 * `glass` is the only one that gets the curtain grid, and `mixed` deliberately
 * does not: a wall the register describes as concrete AND glass is a solid
 * frame with wide lights in it, which is a punched wall. Drawing it as a
 * curtain would say the whole face is glazed, which is the thing the register
 * took the trouble to say it is not.
 */
export function cladTile(c: CladFamily): number {
  switch (c) {
    case "glass":      return TILE_CURTAIN;
    case "stone":      return TILE_CLASSICAL;
    case "terracotta": return TILE_CLASSICAL;
    default:           return TILE_PUNCHED;
  }
}

/**
 * One tower's wall colour from its published cladding — the same shape as
 * `wallFamilyRGB`, and it REPLACES that call rather than following it: where
 * the register says what a building is made of, a family inferred from its
 * height has nothing to add.
 *
 * The travel is fixed high, for `roofFamilyRGB`'s reason: these sets are
 * distinct materials rather than eight shades of pale, and a short travel
 * toward one reads as the table entry it started from.
 */
export function cladWallRGB(
  base: readonly [number, number, number], gid: number, c: CladFamily,
): [number, number, number] {
  const set = CLAD_SETS[c];
  const h = mix32(gid ^ 0x27d4eb2f);
  const t = set[h % set.length];
  const k = 0.90 + 0.08 * (((h >>> 11) & 1023) / 1023);
  return [
    base[0] + (t[0] - base[0]) * k,
    base[1] + (t[1] - base[1]) * k,
    base[2] + (t[2] - base[2]) * k,
  ];
}
