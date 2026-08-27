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

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

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

export const FACADE_TILES: readonly string[] = [
  "BLANK",
  "SASH",
  "PUNCHED",
  "CURTAIN",
  "SHED",
  "DECK",
  "PLAIN",
  "SHOPFRONT",
];

/** the atlas grid. 4 x 2 holds the eight exactly, with no dead cell. */
export const FACADE_COLS = 4;
export const FACADE_ROWS = 2;

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
export function facadeTile(o: FacadeKey): number {
  if (!faceTakesOpenings(o.role)) return TILE_BLANK;
  if (!(o.storeys > 0)) return TILE_BLANK;
  if (unclassed(o.type, o.era)) return TILE_PLAIN;
  const name = FA_TYPES[o.type];
  if (name === "INDUSTRIAL") return TILE_SHED;
  if (name === "GARAGE") return TILE_DECK;
  if (o.glassy) return TILE_CURTAIN;
  return o.era <= 1 ? TILE_SASH : TILE_PUNCHED;
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

function levelTile(g: CanvasRenderingContext2D, px: number): void {
  const img = g.getImageData(0, 0, px, px);
  const d = img.data;
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

  return {
    texture,
    cols: FACADE_COLS,
    rows: FACADE_ROWS,
    tiles,
    dispose() {
      texture.dispose();
      for (const t of tiles) t.dispose();
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
}

function ty(name: string): number {
  return FA_TYPES.indexOf(name);
}

function planOf(tile: number): TilePlan | null {
  switch (tile) {
    case TILE_SASH:
      return { type: ty("FLATS"), era: 0, shop: false, role: ROLE_BACK, plain: false };
    case TILE_PUNCHED:
      return { type: ty("FLATS"), era: 3, shop: false, role: ROLE_BACK, plain: false };
    case TILE_CURTAIN:
      return { type: ty("OFFICE"), era: 4, shop: false, role: ROLE_BACK, plain: false };
    case TILE_SHED:
      return { type: ty("INDUSTRIAL"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    case TILE_DECK:
      return { type: ty("GARAGE"), era: 2, shop: false, role: ROLE_BACK, plain: false };
    case TILE_PLAIN:
      return { type: ty("UNCLASSED"), era: 0, shop: false, role: ROLE_BACK, plain: true };
    case TILE_SHOPFRONT:
      return { type: ty("RETAIL"), era: 2, shop: true, role: ROLE_FRONT, plain: false };
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

  /* ── THE ORDINARY OPENING ────────────────────────────────────────────
     Width `ow` of the bay, height `oh` of the band, standing `sill_m` off
     the floor — all three straight out of `faceWeights`, which got them from
     this class's own `FA_VOCAB` row. */
  const owF = w.ow / mod;
  const ohF = w.oh / w.bandM;
  const sillF = w.sill_m / w.bandM;
  const s0 = 0.5 - owF / 2;
  const s1 = 0.5 + owF / 2;
  g.fillStyle = `rgba(0, 0, 0, ${glass})`;
  rect(s0, s1, sillF, sillF + ohF);
  if (p.plain) return;

  /* THE LIT REVEAL DOWN THE LEFT JAMB. The key light in this frame is upper
     right — the same light every contact shadow is thrown from — so the jamb
     that faces it is the left one, and it is the only part of a recessed
     opening brighter than the wall. `emitFace` draws it 0.035 m wide, which
     is one pixel of a tile and is what a reveal is. */
  lit();
  const rv = Math.max(1 / px, 0.035 / mod);
  rect(s0, s0 + rv, sillF, sillF + ohF);

  /* AND THE GLAZING BAR — one mullion and one meeting rail, which is what
     turns a dark rectangle into a window. `emitFace` puts the rail at 0.54 of
     the opening, not at half: a sash's meeting rail sits above centre. */
  const bt = Math.max(1 / px, 0.035 / mod);
  rect(0.5 - bt, 0.5 + bt, sillF, sillF + ohF);
  const rh = Math.max(1 / px, 0.03 / w.bandM);
  rect(s0, s1, sillF + ohF * 0.54 - rh, sillF + ohF * 0.54 + rh);
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
 * So the ceiling here is that step. Two walls jittered to opposite extremes
 * differ by `2 x FACADE_TINT_V` = **0.070**, which is inside the smallest
 * difference the renderer itself declares as *two objects of the same
 * material*; a single wall never moves more than half of it. For scale, one
 * wall already runs `WA.wbot` 0.76 to `WA.wtop` 1.14 of its own colour from
 * the pavement to its head — a span of 0.38 — so this is under a fifth of a
 * grade the eye already reads as one surface.
 */
export const FACADE_TINT_V = 0.035;

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
export const FACADE_TINT_H = 0.012;

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
export function wallJitter(gid: number): number {
  return 1 + tri(gid) * FACADE_TINT_V;
}
