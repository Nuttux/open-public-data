/**
 * The city map's data layer: manifest, fetch, decode, cache, request policy.
 *
 * See DATA.md for the format, the tiling and the numbers behind both. In brief:
 * the mock is one 15.4 MB page (6.59 MB gzipped) that parses everything before
 * the first frame. Here the record is a manifest plus 563 binary chunks on two
 * axes — a TIER (which fields, keyed on zoom) and a CELL (which 1024 m square) —
 * and nothing is fetched before the camera can show it.
 *
 * This module knows nothing about the projection or the camera. It takes a
 * WORLD-SPACE quad (the four inverse-projected screen corners) and a zoom, and
 * decides what to hold. That is deliberate: `setRot()` exists, so a
 * projected-space tiling would be invalidated by a bearing change, and a data
 * layer that imported the camera could not be tested without one.
 */

// ── the container ───────────────────────────────────────────────────────────

export type Dtype = "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32";

export type TypedArray =
  | Uint8Array | Int8Array | Uint16Array | Int16Array
  | Uint32Array | Int32Array | Float32Array;

export interface ChunkFieldLayout {
  /** field name */
  readonly n: string;
  /** dtype */
  readonly t: Dtype;
  /** byte offset from the start of the payload */
  readonly o: number;
  /** element count */
  readonly c: number;
}

interface ChunkHeader {
  readonly k: string;
  readonly kind: string;
  readonly fields: readonly ChunkFieldLayout[];
}

export interface Chunk {
  readonly key: string;
  readonly kind: string;
  readonly fields: Readonly<Record<string, TypedArray>>;
  /** bytes this chunk occupies, for the cache budget */
  readonly bytes: number;
}

const MAGIC = 0x51_43_54_31; // 'QCT1' read big-endian, i.e. the bytes in order

/**
 * CRC-32/IEEE. The same polynomial `zlib.crc32` uses, so the encoder's value and
 * this one are the same number and either side can be checked with the other's
 * tools.
 */
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** base64 -> bytes. `atob` in the browser, `Buffer` under vitest's node env. */
function b64Bytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(
    (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } })
      .Buffer!.from(b64, "base64"),
  );
}

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const CTORS: Readonly<Record<Dtype, new (b: ArrayBuffer, o: number, n: number) => TypedArray>> = {
  u8: Uint8Array, i8: Int8Array,
  u16: Uint16Array, i16: Int16Array,
  u32: Uint32Array, i32: Int32Array,
  f32: Float32Array,
};

const ELEM_SIZE: Readonly<Record<Dtype, number>> = {
  u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4,
};

const align8 = (n: number): number => (n + 7) & ~7;

/**
 * Decode one chunk. Throws — never returns a plausible-looking array.
 *
 * This project has been bitten twice by data that decoded without complaining
 * and was wrong: a cache holding HTML error pages under a `.gz` name, and a
 * parcel key truncated by a fixed seven-character slice (which cost 10,407
 * footprints their storey count and left the Marina with no faces on it). A bare
 * `ArrayBuffer` of typed arrays cannot notice either. So: the magic is checked
 * before anything else — 'QCT1' fails on the first four bytes of
 * `<!DOCTYPE html>` — and then the CRC over the whole payload, which fails on a
 * truncation, a re-encoding or a single flipped byte.
 */
export function decodeChunk(buffer: ArrayBuffer, expectKey?: string): Chunk {
  if (buffer.byteLength < 16) throw new Error(`chunk too short: ${buffer.byteLength} bytes`);
  const dv = new DataView(buffer);
  if (dv.getUint32(0, false) !== MAGIC) {
    const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(24, buffer.byteLength)));
    throw new Error(`not a chunk (magic): starts ${JSON.stringify(head)}`);
  }
  const headerLen = dv.getUint32(4, true);
  const payloadLen = dv.getUint32(8, true);
  const wantCrc = dv.getUint32(12, true);
  const base = align8(16 + headerLen);
  if (base + payloadLen !== buffer.byteLength) {
    throw new Error(
      `chunk length: header says ${base + payloadLen} bytes, got ${buffer.byteLength}`,
    );
  }
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 16, headerLen)),
  ) as ChunkHeader;
  if (expectKey !== undefined && header.k !== expectKey) {
    throw new Error(`chunk identity: asked for ${expectKey}, file says ${header.k}`);
  }
  const payload = new Uint8Array(buffer, base, payloadLen);
  const gotCrc = crc32(payload);
  if (gotCrc !== wantCrc) {
    throw new Error(
      `chunk ${header.k}: crc ${gotCrc.toString(16)} != ${wantCrc.toString(16)}`,
    );
  }
  const fields: Record<string, TypedArray> = {};
  for (const f of header.fields) {
    const size = ELEM_SIZE[f.t];
    if (size === undefined) throw new Error(`chunk ${header.k}: unknown dtype ${f.t}`);
    if (f.o % size !== 0) {
      throw new Error(`chunk ${header.k}: field ${f.n} at ${f.o} is not ${size}-aligned`);
    }
    if (f.o + f.c * size > payloadLen) {
      throw new Error(`chunk ${header.k}: field ${f.n} runs past the payload`);
    }
    // zero copy: a view over the fetched buffer, which is why the payload starts
    // on an 8-byte boundary and every offset is a multiple of its element size
    fields[f.n] = new CTORS[f.t](buffer, base + f.o, f.c);
  }
  return { key: header.k, kind: header.kind, fields, bytes: buffer.byteLength };
}

// ── the manifest ────────────────────────────────────────────────────────────

/** [minX, minY, maxX, maxY] in world metres. */
export type Extent = readonly [number, number, number, number];

export interface SourceNote {
  readonly dataset?: string;
  readonly publisher?: string;
  readonly what?: string;
  readonly quantised?: string;
  readonly derived_from?: readonly string[];
  readonly script?: string;
  readonly url?: string;
  readonly retrieved?: string;
  readonly sha256?: string;
  readonly licence?: string;
  readonly not_measured?: string;
  readonly membership?: string;
  /** set where the source is known to be wrong; see DATA.md §5 */
  readonly defect?: string;
  readonly [k: string]: unknown;
}

export interface KindSchema {
  readonly fields: readonly { readonly n: string; readonly t: Dtype }[];
  /** field name -> a key into `manifest.sources` */
  readonly provenance: Readonly<Record<string, string>>;
  readonly note?: string;
}

export interface ChunkEntry {
  readonly k: string;
  readonly kind: string;
  readonly tier: string;
  readonly minZ: number;
  /** bytes on disk */
  readonly b: number;
  /** bytes gzipped, as measured by the encoder */
  readonly gz: number;
  /** world extent, or null where the chunk is not spatial */
  readonly e: Extent | null;
  readonly n?: number;
  readonly [k: string]: unknown;
}

/**
 * ── THE TIER ROLLUP IS RE-DERIVED FROM THE CHUNK LIST IT SUMS ────────────
 *
 * `manifest.json` states each tier's file count and byte totals twice: once in
 * `tiers`, and once, implicitly, in the 577 entries of `chunks`. On the tree
 * published 2026-08-26 the two disagreed:
 *
 *     tiers.base            chunks 15   bytes 1,383,092   gzipBytes 695,040
 *     chunks, tier "base"   chunks 16   bytes 1,437,983   gz sum     721,048
 *
 * The per-chunk `b` fields are all correct — every one of the 577 matches its
 * file's size on disk, byte for byte. It is the ROLLUP that is frozen: it has
 * read `{15, 1383092, 695040}` unchanged across three publishes while
 * `base/places.qc` grew 44,366 → 48,844 → 51,083 and `base/heroes.qc` 39,900 →
 * 41,640 underneath it. The cause is upstream and already named in
 * DATA-TRUTH.md §12.3 — `emit_places.py --marks` and `emit_heroes.py` are
 * re-applied AFTER the encoder writes the tier totals — and it is the
 * encoder's to fix in the file it writes.
 *
 * What is fixed here is that nothing downstream has to trust it. A count that
 * can be derived from the thing it counts should be derived from it, and this
 * is the cheapest possible instance: one pass over a list already in memory.
 * `minZ` is NOT derived — it is a rendering decision the encoder makes and the
 * chunk list carries per entry, so it is taken from the stated tier as before
 * (`scene.ts` rungs off it, and it is the only field of the four anything
 * reads).
 *
 * `sf_data_audit.md` A9. Nothing on the frame changes; a published catalogue
 * that contradicts itself does.
 */
export function reconcileTiers(m: CityManifest): CityManifest {
  const agg = new Map<string, { chunks: number; bytes: number; gzipBytes: number }>();
  for (const c of m.chunks) {
    const a = agg.get(c.tier) ?? { chunks: 0, bytes: 0, gzipBytes: 0 };
    a.chunks++;
    a.bytes += c.b ?? 0;
    a.gzipBytes += c.gz ?? 0;
    agg.set(c.tier, a);
  }
  const tiers: Record<string, { chunks: number; bytes: number; gzipBytes: number; minZ: number }> = {};
  for (const [name, stated] of Object.entries(m.tiers)) {
    const d = agg.get(name);
    tiers[name] = d ? { ...d, minZ: stated.minZ } : { ...stated };
  }
  return { ...m, tiers };
}

export interface CityManifest {
  readonly format: string;
  readonly grid: {
    readonly cell: number;
    readonly originX: number;
    readonly originY: number;
    readonly nx: number;
    readonly ny: number;
  };
  readonly proj: Readonly<Record<string, number | number[]>>;
  readonly camera: Readonly<Record<string, unknown>>;
  readonly tiers: Readonly<Record<string, {
    readonly chunks: number; readonly bytes: number;
    readonly gzipBytes: number; readonly minZ: number;
  }>>;
  readonly kinds: Readonly<Record<string, KindSchema>>;
  readonly sources: Readonly<Record<string, SourceNote>>;
  readonly chunks: readonly ChunkEntry[];
  readonly [k: string]: unknown;
}

// ── the surround raster ─────────────────────────────────────────────────────

export interface SurroundLabel {
  readonly n: string;
  /** world metres */
  readonly x: number;
  readonly y: number;
  /** the feature's published lon/lat */
  readonly ll: readonly [number, number];
  /** a small island: drawn smaller */
  readonly sm?: number;
  /** a water body rather than a landmass */
  readonly w?: number;
}

/**
 * Everything on the frame that is NOT San Francisco: Marin, the East Bay, the
 * San Mateo peninsula, Alcatraz, Angel Island, Yerba Buena.
 *
 * This is `SurroundGrid` in `terrain.ts` MINUS `lam` and `order`, and the two
 * that are missing are missing on purpose:
 *
 *  - `lam` is `buildSurroundLam`'s. Re-deriving a hillshade here would put the
 *    arithmetic that carried a units bug twice into a second place.
 *  - `order` is a far-to-near DEPTH sort, and depth belongs to the projection.
 *    This module imports nothing from `projection.ts` or `camera.ts` (see
 *    DATA.md §8), so it cannot compute one — but it can decide WHICH CELLS
 *    are eligible, and that is `surroundOrder`.
 *
 * Compose them at the call site:
 *
 * ```ts
 * const s = city.surround()!;
 * const lam = buildSurroundLam(s.XW, s.XH, s.z, s.cellW, s.cellH, proj.zex);
 * const order = s.surroundOrder((x, y) => proj.depth(x, y));
 * drawSurround(frame, field, { ...s, lam, order });
 * ```
 */
export interface SurroundData {
  readonly XW: number;
  readonly XH: number;
  /** THE DIVISOR THE HILLSHADE NEEDS. 110.0096 m. */
  readonly cellW: number;
  /** 139.15 m. */
  readonly cellH: number;
  readonly zmax: number;
  /** node world x, length XW+1 — the `mx` SurroundGrid asks for */
  readonly mx: Float64Array;
  /** node world y, length XH+1 */
  readonly my: Float64Array;
  /** shoreline segments, groups of 4 node indices */
  readonly segs: Uint16Array;
  readonly labels: readonly SurroundLabel[];
  readonly landCells: number;
  readonly ownCells: number;
  /** elevation, metres, at cell (i,j) */
  z(i: number, j: number): number;
  /** the hydrography's own land bit — what the shoal band measures FROM */
  isLand(i: number, j: number): boolean;
  /** land NOT already drawn by the city model — what may be PAINTED */
  isOwn(i: number, j: number): boolean;
  /** the cell's centre, world metres */
  centre(i: number, j: number): [number, number];
  /**
   * The `own` cells, far-to-near under the supplied depth.
   *
   * `drawSurround` walks `order` and applies NO land test of its own, so this
   * list is the whole of the rule *do not draw a second, coarser copy of San
   * Francisco*. Building it over `isLand` instead of `isOwn` would paint the
   * city twice at two different resolutions in two different tones.
   */
  surroundOrder(
    depth: (x: number, y: number) => number,
    extra?: ((i: number, j: number) => boolean) | null,
  ): Int32Array;
}

/**
 * The REGIONAL shoreline, and the two bit-fields that make it usable.
 *
 * `base/coast` is San Francisco's own DataSF ring — 4 rings, 425 vertices —
 * and it is what the city's shoreline pass inks. It is NOT the surround's
 * coast: clipping Marin, the East Bay and San Mateo to San Francisco's own
 * outline deletes them, which was measured by doing it. The surround's coast
 * is the US Census TIGERweb areal hydrography the surround's own land mask was
 * rasterised FROM — 12 rings, 3,168 vertices, over the same 416 x 280 grid —
 * and it ships beside the chunks as `base/surround-coast.json`, the way
 * `base/heroes.json` and `base/marks.json` do.
 *
 * `reach` and `cityOffshore` are one bit per cell each; see
 * `pipeline/scripts/us_sf_city/emit_surround_coast.py` for what each is for
 * and what published file it came out of.
 */
export interface SurroundCoast {
  readonly rings: readonly (readonly (readonly [number, number])[])[];
  /** a water cell whose fill may REACH the ring, because a neighbour is land */
  reach(i: number, j: number): boolean;
  /** a CITY DEM cell more than `city_pad_m` outside the published land */
  cityOffshore(i: number, j: number): boolean;
  /** the same bits, raw, for `TerrainField.coastFix` — SAME `i*N + j` order as
   *  `maskAt`, which is why it can be handed straight over */
  readonly cityOffshoreBits: Uint8Array;
  readonly meta: Readonly<Record<string, unknown>>;
}

// ── the authored landmarks ──────────────────────────────────────────────────

export interface HeroProfilePt {
  readonly u: number;
  readonly s: number;
}

/** A hero part. `kind`, `z0`, `z1`, `profile`, `rx`, `ry`, `mat` and `min` are
 *  exactly what `landmarks.ts`'s `HeroPart` asks for; the rest are the fields
 *  the mock's own draw functions read and that interface does not yet carry. */
export interface HeroPartData {
  readonly kind: "solid" | "arcade" | "rib";
  readonly z0: number;
  readonly z1: number;
  readonly profile: readonly HeroProfilePt[];
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly mat: number;
  readonly min: number;
  /** the accent material — the decoder's resolved value, `m` where absent */
  readonly accentMat: number;
  readonly ink: number;
  /** arcade only: opening width, pitch, margin, and the darkening of the reveal */
  readonly openW: number;
  /** metres between openings; `Infinity` = one opening, no repetition */
  readonly pitch: number;
  readonly margin: number;
  readonly dark: number;
  /** rib only: how many meridians */
  readonly ribs: number;
  readonly tiltX: number;
  readonly tiltY: number;
  /** the authoring group tag, for parts drawn together */
  readonly group: string | null;
  /** arcade only: `arch`, `clock` or `rect` */
  readonly shape: string;
}

export interface HeroMeasured {
  /** footprint area AS DRAWN, m2 — the published ring after the 1 m quantiser */
  readonly a: number;
  readonly h: number;
  readonly t: number;
  readonly r: number;
  readonly yr: number;
  readonly nv: number;
}

export interface HeroData {
  /** the shipped building index this hero replaces */
  readonly bi: number;
  readonly key: string;
  readonly name: string;
  readonly year: number;
  readonly yearSource: string;
  readonly measured: string;
  readonly drawn: string;
  readonly anchor: string;
  /** measured top, metres */
  readonly top: number;
  /** the roofline — the top of the building's own BULK */
  readonly zr: number;
  readonly accent: string | null;
  /** Sutro Tower alone; `hullReason` says why */
  readonly hull?: boolean;
  readonly hullReason?: string;
  /** the ground anchor: the footprint's own vertex mean, part3's UX/UY */
  readonly ax: number;
  readonly ay: number;
  readonly ms: HeroMeasured;
  /** the emphasis actually reached at each preset, for the page to state */
  readonly emphasis: Readonly<Record<string, number>>;
  readonly parts: readonly HeroPartData[];
}

export interface CapProfile {
  readonly name: string;
  readonly pts: readonly HeroProfilePt[];
}

export interface CapData {
  /** published building index */
  readonly bi: number;
  readonly profile: number;
  readonly profileName: string;
}

/**
 * One of the six profiles `base/caps` ships, as the draw path wants it.
 *
 * `u` is the fraction of the MEASURED lift and `s` the fraction of the MEASURED
 * radius, and **every `u` and every `s` is ≤ 1** — that single property is what
 * makes a drawn cap honest, and `verify_city_chunks.py` §6d asserts it over
 * every point of every profile rather than trusting this sentence.
 */
export interface StepProfile {
  readonly name: string;
  readonly u: Float32Array;
  readonly s: Float32Array;
}

/**
 * THE SECOND SOLID AND THE THIRD — `base/form`, and the chunk the 68 shaped
 * caps were blocked on.
 *
 * Every building on this map is one prism at `hgt_mediancm`. A median is the
 * right statistic for a building's MASS and the wrong one for its SILHOUETTE:
 * it is by construction the height half the roof is below, so a tower, a drum,
 * a spire, a campanile or a penthouse — anything a MINORITY of the roof does —
 * is averaged out of the picture. The Ferry Building publishes a median of
 * 15.2 m over a maximum of 71.4 m, and the page drew 15.2.
 *
 * `form/model3.py` recovers the second plane from three published columns and a
 * cell count with no fitting, and `typo/mast.py` reaches the 40 the step model
 * cannot see — a steeple is a handful of 50 cm cells — through the PUBLISHED
 * CLASS of the place under the roof. **Both are one slot stream here for the
 * same reason they are one in the mock: a mast is drawn by the second solid's
 * own machinery and adds not one line to any draw loop.**
 *
 * The slots are ordered second-solid-first: `[0, nStep)` are Block C's steps
 * and `[nStep, n)` are the masts, which is the order `part3.html` appends them
 * in and the order `verify_city_chunks.py` compares against the two sources.
 */
export interface FormTable {
  /** slots — 488 second solids followed by the 40 masts that survive the merge */
  readonly n: number;
  /** where the masts begin */
  readonly nStep: number;
  /** the octagon the derived area was computed for: 8 */
  readonly octN: number;
  /** the published building each slot stands on */
  readonly bi: Uint32Array;
  /** the measured top — `hgt_maxcm` — in metres */
  readonly top: Float32Array;
  /** the octagon's circumradius, metres */
  readonly rad: Float32Array;
  /** its plan rotation: the footprint's own dominant edge direction, radians */
  readonly ang: Float32Array;
  /** metres from the vertex mean (`BldTable.cx`/`cy`) to the AREA centroid */
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  /** 0 = a step, 1 = a mast, 2 = a mast the published class gives a spire */
  readonly mast: Uint8Array;
  /** the profile per SLOT. 0 is `prism`, the identity, and means no shaped cap */
  readonly prof: Uint8Array;
  readonly profiles: readonly StepProfile[];
  /**
   * building index → slot + 1, and 0 for the 165,638 buildings with no slot.
   *
   * A typed array and not a `Map`: this is read once per building per
   * rasterisation, ~90,000 times at the district camera, and 332 KB of
   * `Uint16Array` is the cheapest form of that question. 528 slots fit a
   * `Uint16Array` with the +1 to spare.
   */
  readonly slotOf: Uint16Array;
}

/** `landmarks.ts`'s `BridgeDeck`, plus the record behind it. */
export interface BridgeSpan {
  readonly ring: readonly (readonly [number, number])[];
  readonly towers: readonly (readonly [number, number])[];
  /** each tower's head, metres above sea level — the FAA file's AMSL, per tower */
  readonly towerZ?: readonly number[];
  /** NBI navigational vertical clearance, metres */
  readonly deckZ?: number;
  /** the year it EXISTED — NBI completion */
  readonly year?: number;
  /** the span's own published key — `golden-gate`, `bay-west`. Chooses the
   *  paint and nothing else: `landmarks.ts` §BRIDGE_PAINT. */
  readonly k?: string;
}

export interface BridgeData extends BridgeSpan {
  /** the year it EXISTED — NBI completion, 1937 */
  readonly year: number;
  /** the landmark register's `yearbuilt`, 1933 — when work BEGAN */
  readonly yearLandmark: number;
  /**
   * EVERY OTHER BRIDGE IN THE CHUNK. `base/bridge` shipped one bridge as two
   * flat vertex streams; `emit_bay_bridge.py` added the Bay Bridge's west
   * crossing and the chunk now carries per-bridge counts in `rn`/`tn`. A chunk
   * WITHOUT them is one bridge and reads exactly as before, which is what let
   * the Golden Gate's own bytes survive the merge unchanged.
   */
  readonly more: readonly BridgeSpan[];
}

export interface LandmarkTable {
  readonly heroes: readonly HeroData[];
  readonly caps: readonly CapData[];
  readonly capProfiles: readonly CapProfile[];
  readonly bridge: BridgeData | null;
  /** the material table: [name, light, dark] */
  readonly materials: readonly (readonly string[])[];
  /** the emphasis law's own constants */
  readonly wo: Readonly<Record<string, unknown>>;
  /** why a hero is not to scale, in the file's own words */
  readonly note: string;
}

interface HeroSidecar {
  note: string;
  wo: Record<string, unknown>;
  mat: string[][];
  heroes: {
    k: string; n: string; b: number; y: number; an: string; ys: string;
    dr: string; measured: string; hu: string | null; ms: HeroMeasured;
    em: Record<string, number>; ac: number; accent: string | null;
  }[];
  parts: { g: string | null; sh: string }[];
}

const PART_KIND = ["solid", "arcade", "rib"] as const;


// ── the street centrelines, the names, and the mask the fade wants ──────────

/**
 * ONE CHUNK OF PUBLISHED CENTRELINES, in the shape `drawCentrelines` reads.
 *
 * `3psu-pn9h` ships 4,895 lines of classcode 0-4 and until this decoder existed
 * NO chunk carried their geometry — `manifest.kinds.strt` carries the right-of-way
 * RING and the roadway ring, and stroking the far edge of a right of way draws a
 * property line. That is why the whole-city frame had no street network where the
 * mock has a city of lines: `ST_CLS_MAX[0] = 2`, the reference strokes classes 0-2
 * at full ink on the wide shot, and this build stroked nothing.
 *
 * `cls`, `yr`, `len`, `x`, `y` and `cov` are exactly what the renderer asks for;
 * `fid`, `cnn` and `nm` are the joins, and they are what makes the `cov`
 * cross-check below possible at all.
 */
export interface CentrelineCell {
  readonly key: string;
  /** the centreline's index in the published array — the order `cov` is keyed on */
  readonly fid: Uint32Array;
  /** 3psu-pn9h classcode, 0-4, the ranks `ST_W` indexes */
  readonly cls: Uint8Array;
  /** so a line can be joined to the right of way it belongs to */
  readonly cnn: Uint32Array;
  /** index into `streetNames()`; 0xFFFF where the City publishes no name */
  readonly nm: Uint16Array;
  /** the year the Board voted it; 0 = undated, and an undated line is drawn */
  readonly yr: Uint16Array;
  /** vertices per feature */
  readonly len: Uint16Array;
  /** world metres, absolute, packed feature after feature */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** one bit per feature IN THIS CHUNK, LSB first: a right of way covers it */
  readonly cov: Uint8Array;
}

/**
 * The street NAMES — 2,786 published stretches over 2,397 distinct names.
 *
 * `rank` and `lengthM` are the two arguments `labelOrder` and `spineOf` take,
 * and they are the file's own: rank is `geo/build_streets.py`'s LABEL rank
 * (classcode 2/3 to 0, 4 to 1, 5 to 2, and the freeways to the bottom, because
 * a freeway is the least useful thing to name on a map of San Francisco) and
 * `lengthM` is the summed length of the stretch's own segments.
 *
 * `dx`/`dy` are a DIRECTION and not a place: the reference pushes them through
 * `proj()` as a point and takes the angle of the difference from `proj(0,0)`,
 * which is exact because `proj` is linear in (x, y).
 */
export interface StreetLabelTable {
  readonly n: number;
  readonly names: readonly string[];
  /** index into `names` */
  readonly nm: Uint16Array;
  readonly rank: Uint8Array;
  /** the year the name is first written; 0 = written in every year */
  readonly yr: Uint16Array;
  readonly lengthM: Float32Array;
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  name(i: number): string;
}

/**
 * `base/street-misc`, which shipped for four blocks and was decoded by nobody:
 * 1,120 published traffic islands, 268 named stair runs, and **the 4,895-bit
 * coverage mask the centreline fade wants**.
 *
 * The manifest note used to call `cov` *one bit per right of way*. It is not:
 * `covn` is 4,895, which is the number of CENTRELINES, and the bit is set by
 * testing that centreline's own midpoint against the published right-of-way
 * polygons. 4,361 of 4,895 are covered.
 */
export interface StreetMisc {
  /** vertices per island ring */
  readonly islandLen: Uint16Array;
  readonly islandX: Float32Array;
  readonly islandY: Float32Array;
  /** vertices per stair run */
  readonly stairLen: Uint16Array;
  readonly stairX: Float32Array;
  readonly stairY: Float32Array;
  readonly stairNames: readonly string[];
  /** one bit per centreline, LSB first, in the published array's own order */
  readonly cov: Uint8Array;
  readonly covN: number;
  /** does a published right of way cover the centreline with this `fid`? */
  covered(fid: number): boolean;
}

// ── the spatial query ───────────────────────────────────────────────────────

export type Point = readonly [number, number];

/** What the camera is looking at, in WORLD metres. */
export interface CityView {
  /** cam.scale / cam.base; 1 is "the whole city fits the strip" */
  readonly z: number;
  /**
   * The view quad, world space — the four inverse-projected screen corners, in
   * order. Any convex polygon works. The renderer produces this; this module
   * never projects anything.
   */
  readonly quad: readonly Point[];
}

function quadBBox(quad: readonly Point[]): Extent {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of quad) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * Separating-axis test between a convex polygon and an axis-aligned box.
 *
 * A bbox test alone over-fetches badly here: the screen axes are the world axes
 * rotated 45 degrees, so the view is a DIAMOND and its axis-aligned bound is
 * twice its area. At the district preset that is the difference between ~40
 * cells and ~20.
 */
function quadHitsBox(quad: readonly Point[], e: Extent): boolean {
  const [bx0, by0, bx1, by1] = e;
  const [qx0, qy0, qx1, qy1] = quadBBox(quad);
  if (qx1 < bx0 || qx0 > bx1 || qy1 < by0 || qy0 > by1) return false;
  const box: Point[] = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i];
    const [cx, cy] = quad[(i + 1) % quad.length];
    const nx = ay - cy;
    const ny = cx - ax;
    let qMin = Infinity, qMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const [px, py] of quad) {
      const d = px * nx + py * ny;
      if (d < qMin) qMin = d;
      if (d > qMax) qMax = d;
    }
    for (const [px, py] of box) {
      const d = px * nx + py * ny;
      if (d < bMin) bMin = d;
      if (d > bMax) bMax = d;
    }
    if (qMax < bMin || bMax < qMin) return false;
  }
  return true;
}

// ── the store ───────────────────────────────────────────────────────────────

export interface CityDataOptions {
  /** where manifest.json and the chunk tree live */
  readonly baseUrl?: string;
  /**
   * How many decoded bytes to hold beyond the base tier before evicting the
   * least recently used. The base tier is never evicted: it is what the first
   * paint is, and re-fetching it is a blank frame.
   */
  readonly cacheBytes?: number;
  /** how many chunk requests may be in flight at once */
  readonly concurrency?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface CityDataStats {
  readonly held: number;
  readonly heldBytes: number;
  readonly inFlight: number;
  readonly queued: number;
  readonly fetched: number;
  readonly cancelled: number;
  readonly failed: number;
  readonly evicted: number;
}

interface Held {
  readonly chunk: Chunk;
  used: number;
}

const DEFAULT_BASE = "/data/us/sf/city";

export class CityData {
  readonly manifest: CityManifest;
  private readonly baseUrl: string;
  /** where this city's files live, for assets that are not catalogue chunks */
  get assetBase(): string {
    return this.baseUrl;
  }

  private readonly cacheBytes: number;
  private readonly concurrency: number;
  private readonly doFetch: typeof fetch;

  private readonly byKey = new Map<string, ChunkEntry>();
  private readonly held = new Map<string, Held>();
  private readonly inFlight = new Map<string, AbortController>();
  private queue: string[] = [];
  private wanted = new Set<string>();
  private readonly baseKeys: string[] = [];
  private clock = 0;
  private heldBytes = 0;
  private counts = { fetched: 0, cancelled: 0, failed: 0, evicted: 0 };
  private surroundCache: SurroundData | null = null;
  private landmarkCache: LandmarkTable | null = null;
  private formCache: FormTable | null = null;
  private sidecar: HeroSidecar | null = null;
  private coastCache: SurroundCoast | null = null;
  private lineCache: readonly CentrelineCell[] | null = null;
  private lineCacheKey = "";
  private labelCache: StreetLabelTable | null = null;
  private labelCacheKey = "";
  private miscCache: StreetMisc | null = null;
  private readonly listeners = new Set<(key: string) => void>();

  private constructor(manifest: CityManifest, opts: CityDataOptions) {
    this.manifest = reconcileTiers(manifest);
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.cacheBytes = opts.cacheBytes ?? 48 * 1024 * 1024;
    this.concurrency = opts.concurrency ?? 6;
    this.doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    for (const c of manifest.chunks) {
      this.byKey.set(c.k, c);
      if (c.tier === "base") this.baseKeys.push(c.k);
    }
  }

  static async load(opts: CityDataOptions = {}): Promise<CityData> {
    const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    /* ── ONE RETRY ON AN EMPTY BODY ──────────────────────────────────────
       Daniel, 2026-08-26: *"The map could not be loaded. JSON.parse:
       unexpected end of data at line 1 column 1"* — every file on disk and
       over HTTP was valid when checked a minute later. A dev server mid-
       recompile (and, in production, a CDN edge mid-purge) can answer 200
       with nothing in the body, and a page that stays dead on that until the
       reader reloads is a bug of ours. Read as text, and if it is empty or
       does not parse, fetch it once more past every cache before giving up. */
    const read = async (init?: RequestInit): Promise<CityManifest> => {
      const res = await f(`${base}/manifest.json`, init);
      if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error("manifest: empty body");
      return JSON.parse(text) as CityManifest;
    };
    let manifest: CityManifest;
    try {
      manifest = await read();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        manifest = await read({ cache: "reload" });
      } catch {
        throw e instanceof Error ? e : new Error(String(e));
      }
    }
    if (manifest.format !== "qc/1") {
      throw new Error(`manifest: unknown format ${manifest.format}`);
    }
    return new CityData(manifest, opts);
  }

  /** Fetch and hold every base-tier chunk. Resolve when the first paint can draw. */
  async loadBase(): Promise<void> {
    await Promise.all(this.baseKeys.map((k) => this.fetchChunk(k)));
  }

  /**
   * Fetch and hold every chunk of one tier, whatever the view.
   *
   * ADDITIVE, AND NOT ON THE CANVAS PATH. That renderer streams by view
   * because it can only afford the cells it is looking at; a GPU renderer
   * uploads the city once and then draws it for nothing, so it wants the
   * whole tier up front and never asks again. Nothing else calls this and
   * nothing about `setView`'s queue changes.
   */
  async loadTier(tier: string): Promise<number> {
    const keys = this.manifest.chunks.filter((c) => c.tier === tier).map((c) => c.k);
    await Promise.all(keys.map((k) => this.fetchChunk(k).catch(() => undefined)));
    return keys.length;
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /** A held chunk, or undefined. Never triggers a fetch: the draw path is sync. */
  get(key: string): Chunk | undefined {
    const h = this.held.get(key);
    if (!h) return undefined;
    h.used = ++this.clock;
    return h.chunk;
  }

  has(key: string): boolean {
    return this.held.has(key);
  }

  /** Every held chunk of one kind that the given view can show, in fetch order. */
  *visible(kind: string, view: CityView): Iterable<Chunk> {
    for (const key of this.keysFor(view)) {
      const e = this.byKey.get(key);
      if (!e || e.kind !== kind) continue;
      const c = this.get(key);
      if (c) yield c;
    }
  }

  /** The chunk entries a view needs, nearest first. Does not fetch. */
  keysFor(view: CityView): string[] {
    const bb = quadBBox(view.quad);
    const cx = (bb[0] + bb[2]) / 2;
    const cy = (bb[1] + bb[3]) / 2;
    const out: { k: string; d: number }[] = [];
    for (const c of this.manifest.chunks) {
      if (view.z < c.minZ) continue;
      if (c.e && !quadHitsBox(view.quad, c.e)) continue;
      const d = c.e
        ? Math.hypot((c.e[0] + c.e[2]) / 2 - cx, (c.e[1] + c.e[3]) / 2 - cy)
        : -1; // non-spatial chunks (terrain, massing) are always nearest
      out.push({ k: c.k, d });
    }
    out.sort((a, b) => (a.d - b.d) || (a.k < b.k ? -1 : 1));
    return out.map((o) => o.k);
  }

  /** The grid cell a world point falls in, or null if it is off the grid. */
  cellOf(x: number, y: number): string | null {
    const g = this.manifest.grid;
    const tx = Math.floor((x - g.originX) / g.cell);
    const ty = Math.floor((y - g.originY) / g.cell);
    if (tx < 0 || tx >= g.nx || ty < 0 || ty >= g.ny) return null;
    return `${tx}_${ty}`;
  }

  /** Where a field came from, for the page to print. */
  provenanceOf(kind: string, field: string): SourceNote | undefined {
    const key = this.manifest.kinds[kind]?.provenance?.[field];
    return key === undefined ? undefined : this.manifest.sources[key];
  }


  // ── the surround ──────────────────────────────────────────────────────────

  /**
   * The surround raster, or null if `base/surround` is not held yet.
   *
   * Everything outside San Francisco stands on this: `drawSurround`'s relief,
   * the shoal band's BFS, and the affine both water plates are laid under.
   */
  surround(): SurroundData | null {
    if (this.surroundCache) return this.surroundCache;
    const c = this.get("base/surround");
    if (!c) return null;
    const e = this.byKey.get("base/surround");
    if (!e) return null;
    const XW = e.w as number;
    const XH = e.h as number;
    const zmax = e.zmax as number;
    const cellW = e.cellW as number;
    const cellH = e.cellH as number;
    const world = e.world as number[];
    const dem = c.fields.dem as Uint8Array;
    const land = c.fields.land as Uint8Array;
    const own = c.fields.own as Uint8Array;
    const segs = c.fields.segs as Uint16Array;
    if (dem.length !== XW * XH) {
      throw new Error(`surround: ${dem.length} cells for a ${XW}x${XH} grid`);
    }
    const mx = new Float64Array(XW + 1);
    const my = new Float64Array(XH + 1);
    for (let i = 0; i <= XW; i++) mx[i] = world[0] + i * cellW;
    for (let j = 0; j <= XH; j++) my[j] = world[1] + j * cellH;
    // MSB first within each byte — numpy packbits' order, kept so the bytes are
    // the source's. A bitset read the other way round decodes silently.
    const bit = (a: Uint8Array, k: number): boolean =>
      ((a[k >> 3] >> (7 - (k & 7))) & 1) === 1;
    const K = zmax / 255;
    const s: SurroundData = {
      XW, XH, cellW, cellH, zmax, mx, my, segs,
      labels: (e.labels ?? []) as SurroundLabel[],
      landCells: e.landCells as number,
      ownCells: e.ownCells as number,
      z: (i, j) => dem[j * XW + i] * K,
      isLand: (i, j) => bit(land, j * XW + i),
      isOwn: (i, j) => bit(own, j * XW + i),
      centre: (i, j) => [world[0] + (i + 0.5) * cellW, world[1] + (j + 0.5) * cellH],
      surroundOrder(depth, extra) {
        const idx: number[] = [];
        for (let j = 0; j < XH; j++) {
          for (let i = 0; i < XW; i++) {
            /* `extra` is the coast clip's own margin and NOTHING else. A cell
               it adds is water by the hydrography's own bit, so it may only
               ever paint the part of itself that is inside the published ring
               — which is why it is safe here and would not be without the
               clip. Passing it without clipping paints a second, coarser copy
               of the shoreline. */
            if (bit(own, j * XW + i) || (extra ? extra(i, j) : false)) {
              idx.push(j * XW + i);
            }
          }
        }
        const d = new Float64Array(idx.length);
        for (let n = 0; n < idx.length; n++) {
          const k = idx[n];
          const i = k % XW;
          const j = (k / XW) | 0;
          d[n] = depth(world[0] + (i + 0.5) * cellW, world[1] + (j + 0.5) * cellH);
        }
        const ord = idx.map((_, n) => n);
        ord.sort((u, v) => d[v] - d[u]); // far first
        const out = new Int32Array(idx.length);
        for (let n = 0; n < ord.length; n++) out[n] = idx[ord[n]];
        return out;
      },
    };
    this.surroundCache = s;
    return s;
  }

  /**
   * The surround's own coastline. Resolves to null if `base/surround` is not
   * held; throws if the sidecar's grid is not the shipped surround's, because
   * a bit-field read against the wrong stride decodes silently and draws a
   * plausible wrong coast.
   */
  async surroundCoast(): Promise<SurroundCoast | null> {
    if (this.coastCache) return this.coastCache;
    const e = this.byKey.get("base/surround");
    if (!e) return null;
    const res = await this.doFetch(`${this.baseUrl}/base/surround-coast.json`);
    if (!res.ok) throw new Error(`base/surround-coast.json: HTTP ${res.status}`);
    const d = (await res.json()) as {
      w: number; h: number; cn: number; nv: number;
      start: number[]; count: number[]; x: number[]; y: number[];
      xtra: string; cfix: string; meta: Record<string, unknown>;
    };
    if (d.w !== e.w || d.h !== e.h) {
      throw new Error(
        `base/surround-coast.json is ${d.w}x${d.h}, base/surround is ${String(e.w)}x${String(e.h)}`,
      );
    }
    const rings: [number, number][][] = [];
    for (let r = 0; r < d.start.length; r++) {
      const s0 = d.start[r], n = d.count[r];
      const ring: [number, number][] = new Array(n);
      for (let k = 0; k < n; k++) ring[k] = [d.x[s0 + k], d.y[s0 + k]];
      rings.push(ring);
    }
    const xtra = b64Bytes(d.xtra);
    const cfix = b64Bytes(d.cfix);
    const bit = (a: Uint8Array, k: number): boolean =>
      ((a[k >> 3] >> (7 - (k & 7))) & 1) === 1;
    const XW = d.w, CN = d.cn;
    const out: SurroundCoast = {
      rings,
      reach: (i, j) => bit(xtra, j * XW + i),
      // `cfix` is keyed i*N + j — the CITY grid's own column-major order, which
      // is not the surround's. Kept as the builder wrote it.
      cityOffshore: (i, j) => bit(cfix, i * CN + j),
      cityOffshoreBits: cfix,
      meta: d.meta,
    };
    this.coastCache = out;
    return out;
  }

  /**
   * The 488 second solids, the 40 masts and the six cap profiles.
   *
   * SYNC, unlike `landmarks()`: there is no prose to fetch. Every sentence this
   * carries is in the manifest's own provenance and none of it is per-slot, so
   * the draw path can ask for it inside a rasterisation and get an answer or a
   * null, which is what every other reader on that path does.
   *
   * `base/caps` is folded in here rather than left in `LandmarkTable` because a
   * cap is not a landmark: it is a PROFILE swept around one of these solids, and
   * the two halves shipped apart for four blocks with nothing drawing either.
   * `LandmarkTable.caps` stays as the record a fiche prints; this is the
   * geometry the renderer sweeps.
   *
   * Returns null if `base/form` is not held — the caller draws the prism, which
   * is what stood there before this chunk existed.
   */
  form(): FormTable | null {
    if (this.formCache) return this.formCache;
    const fc = this.get("base/form");
    if (!fc) return null;
    const e = this.byKey.get("base/form");
    const f = fc.fields;
    const sbi = f.bi as Uint32Array;
    const mbi = f.mbi as Uint32Array;
    const nStep = sbi.length;
    const nAll = nStep + mbi.length;
    const nb = (this.manifest.buildings as { n: number }).n;

    const bi = new Uint32Array(nAll);
    const top = new Float32Array(nAll);
    const rad = new Float32Array(nAll);
    const ang = new Float32Array(nAll);
    const dx = new Float32Array(nAll);
    const dy = new Float32Array(nAll);
    const mast = new Uint8Array(nAll);
    const slotOf = new Uint16Array(nb);

    const stop = f.top as Uint16Array;
    const srad = f.rad as Uint16Array;
    const sang = f.ang as Uint8Array;
    const sdx = f.dx as Int16Array;
    const sdy = f.dy as Int16Array;
    const A = Math.PI / 2 / 255;
    for (let s = 0; s < nStep; s++) {
      const i = sbi[s];
      bi[s] = i;
      top[s] = stop[s] * 0.1; // decimetres -> metres
      rad[s] = srad[s] * 0.01; // centimetres -> metres
      ang[s] = sang[s] * A;
      dx[s] = sdx[s] * 0.1;
      dy[s] = sdy[s] * 0.1;
      slotOf[i] = s + 1;
    }
    /* NEVER TWO SOLIDS OVER ONE ROOF. `mast.py` already drops the 44 footprints
       that carry Block C's step and the encoder asserts the two streams are
       disjoint, so this test never fires — it is `part3.html`'s own merge, kept
       because it is the one line that makes the invariant true HERE rather than
       true somewhere upstream. A slot skipped is a mast not drawn, never a
       second claim over one roof. */
    const mtop = f.mtop as Uint16Array;
    const mrad = f.mrad as Uint16Array;
    const mang = f.mang as Uint8Array;
    const mdx = f.mdx as Int16Array;
    const mdy = f.mdy as Int16Array;
    const msp = f.mspire as Uint8Array;
    let put = nStep;
    for (let k = 0; k < mbi.length; k++) {
      const i = mbi[k];
      if (slotOf[i]) continue;
      bi[put] = i;
      top[put] = mtop[k] * 0.1;
      rad[put] = mrad[k] * 0.01;
      ang[put] = mang[k] * A;
      dx[put] = mdx[k] * 0.1;
      dy[put] = mdy[k] * 0.1;
      mast[put] = msp[k] ? 2 : 1;
      slotOf[i] = put + 1;
      put++;
    }

    // ── the six profiles, and which slot takes which ──────────────────────
    const profiles: StepProfile[] = [];
    const prof = new Uint8Array(nAll);
    const cc = this.get("base/caps");
    const ce = this.byKey.get("base/caps");
    if (cc && ce) {
      const names = (ce.profiles ?? []) as string[];
      const po = cc.fields.poff as Uint32Array;
      const pu = cc.fields.pu as Float32Array;
      const ps = cc.fields.ps as Float32Array;
      for (let k = 0; k + 1 < po.length; k++) {
        profiles.push({
          name: names[k] ?? String(k),
          u: pu.subarray(po[k], po[k + 1]),
          s: ps.subarray(po[k], po[k + 1]),
        });
      }
      const cbi = cc.fields.bi as Uint32Array;
      const cpr = cc.fields.prof as Uint8Array;
      for (let k = 0; k < cbi.length; k++) {
        const s = slotOf[cbi[k]];
        if (s) prof[s - 1] = cpr[k];
      }
      /* THE SPIRE IS CHOSEN BY THE PUBLISHED CLASS AND BY NOTHING ELSE.
         `mspire` is the class table's own bit — church, and the nine others
         `mast.py` names — and it is the only thing on this path that picks a
         shape. A mast without it draws the prism, which is a box on a roof and
         is exactly what a fire station's hose tower is. */
      const spire = profiles.findIndex((p) => p.name === "spire");
      if (spire > 0) {
        for (let s = nStep; s < put; s++) if (mast[s] === 2 && !prof[s]) prof[s] = spire;
      }
    }

    const t: FormTable = {
      n: put,
      nStep,
      octN: (e?.octN as number) ?? 8,
      bi: bi.subarray(0, put),
      top: top.subarray(0, put),
      rad: rad.subarray(0, put),
      ang: ang.subarray(0, put),
      dx: dx.subarray(0, put),
      dy: dy.subarray(0, put),
      mast: mast.subarray(0, put),
      prof: prof.subarray(0, put),
      profiles,
      slotOf,
    };
    this.formCache = t;
    return t;
  }


  // ── the street centrelines, the names, and the mask ───────────────────────

  /**
   * Every held chunk of published centrelines, base tier first.
   *
   * SYNC and cheap: the chunks are already typed arrays in the shape the
   * renderer reads, so this only assembles the list. Hand the result straight
   * to `drawCentrelines` as `opts.lines`.
   *
   * The layer is split on `ST_CLS_MAX`, the LOD band's own class gate, and not
   * on the 1024 m grid — a centreline runs up to 3.1 km and does not fit a
   * cell. `base/street-lines` is classes 0-2, the whole-city frame's own
   * network, and it is in the base tier so the first paint has it;
   * `strt/street-lines-2` is classes 3-4 at `minZ` 1.70, which is BANDS[0] and
   * therefore the first zoom at which either class can be drawn at all.
   *
   * **AND THE MASK IS CHECKED, NOT TRUSTED.** Each chunk carries `cov`
   * re-indexed from the citywide mask through `fid`, and re-indexing is the one
   * step that could shift a bit silently — which is exactly what the mock's own
   * note warns about (*"a regenerated geo-data.js must not be able to shift
   * this by one"*). Where `base/street-misc` is also held, every bit is
   * compared against it once per chunk and a disagreement throws.
   */
  streetLines(): readonly CentrelineCell[] {
    const keys: string[] = [];
    for (const c of this.manifest.chunks) {
      if (c.kind === "strt-line" && this.held.has(c.k)) keys.push(c.k);
    }
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const tag = keys.join("|");
    if (this.lineCache && this.lineCacheKey === tag) return this.lineCache;
    const misc = this.streetMisc();
    const out: CentrelineCell[] = [];
    for (const k of keys) {
      const c = this.get(k);
      if (!c) continue;
      const f = c.fields;
      const cell: CentrelineCell = {
        key: k,
        fid: f.fid as Uint32Array,
        cls: f.cls as Uint8Array,
        cnn: f.cnn as Uint32Array,
        nm: f.nm as Uint16Array,
        yr: f.yr as Uint16Array,
        len: f.len as Uint16Array,
        x: f.x as Float32Array,
        y: f.y as Float32Array,
        cov: f.cov as Uint8Array,
      };
      // `strt/street-unimplied` IS THE SAME KIND AND NOT THE SAME INDEX.
      // The cross-check below re-indexes the citywide mask through `fid`, and
      // that only means anything while `fid` is a position in `G.streets`. The
      // unimplied chunk — the 846 published centrelines no assessor block
      // implies, which is why the Hunters Point shipyard had buildings and no
      // streets — is a SEPARATE array with its own dense 0..n-1 index,
      // deliberately, because `TIME.street.yr`, this mask, the encoder's
      // positional replay and time/out/ship-cnn.json are all keyed one-to-one
      // on `G.streets` and appending to it would have shifted all four. Its
      // `cov` is zero for every feature and that is a measurement, not a
      // placeholder: h8n7-e4ns is the PUBLIC right of way and a Navy yard is
      // not in it. `verify_city_chunks.py` asserts both facts on the wire.
      if (misc && k !== "strt/street-unimplied") {
        for (let i = 0; i < cell.fid.length; i++) {
          const mine = ((cell.cov[i >> 3] >> (i & 7)) & 1) === 1;
          if (mine !== misc.covered(cell.fid[i])) {
            throw new Error(
              `${k}: cov bit ${i} (centreline ${cell.fid[i]}) is ${String(mine)}, ` +
              `base/street-misc says ${String(misc.covered(cell.fid[i]))}`,
            );
          }
        }
      }
      out.push(cell);
    }
    this.lineCache = out;
    this.lineCacheKey = tag;
    return out;
  }

  /** The name of centreline `nm[i]`, or `null` where the City publishes none. */
  streetNames(): readonly string[] {
    return (this.byKey.get("base/street-labels")?.names ?? []) as string[];
  }

  /**
   * The published street-name stretches, base tier first, as one table.
   *
   * Rebuilt when the set of held label chunks changes and cached otherwise:
   * the label pass runs inside a frame and cannot afford to concatenate 2,786
   * entries on every one.
   *
   * Returns null before `base/street-labels` lands.
   */
  streetLabels(): StreetLabelTable | null {
    const keys: string[] = [];
    for (const c of this.manifest.chunks) {
      if (c.kind === "strt-label" && this.held.has(c.k)) keys.push(c.k);
    }
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (keys.length === 0) return null;
    const tag = keys.join("|");
    if (this.labelCache && this.labelCacheKey === tag) return this.labelCache;
    const parts = keys.map((k) => this.get(k)).filter((c): c is Chunk => !!c);
    let n = 0;
    for (const c of parts) n += (c.fields.rank as Uint8Array).length;
    const nm = new Uint16Array(n);
    const rank = new Uint8Array(n);
    const yr = new Uint16Array(n);
    const lengthM = new Float32Array(n);
    const wx = new Float32Array(n);
    const wy = new Float32Array(n);
    const dx = new Float32Array(n);
    const dy = new Float32Array(n);
    let o = 0;
    for (const c of parts) {
      const f = c.fields;
      const m = (f.rank as Uint8Array).length;
      nm.set(f.nm as Uint16Array, o);
      rank.set(f.rank as Uint8Array, o);
      yr.set(f.yr as Uint16Array, o);
      const L = f.len as Uint16Array;
      const px = f.x as Float32Array;
      const py = f.y as Float32Array;
      const pdx = f.dx as Int16Array;
      const pdy = f.dy as Int16Array;
      for (let i = 0; i < m; i++) {
        lengthM[o + i] = L[i];
        wx[o + i] = px[i];
        wy[o + i] = py[i];
        // x10000 is the encoder's, and it is exact: the source rounds the unit
        // vector to four decimals, so this is the published number back again.
        dx[o + i] = pdx[i] / 10000;
        dy[o + i] = pdy[i] / 10000;
      }
      o += m;
    }
    const names = this.streetNames();
    const t: StreetLabelTable = {
      n, names, nm, rank, yr, lengthM, wx, wy, dx, dy,
      name: (i) => names[nm[i]] ?? "",
    };
    this.labelCache = t;
    this.labelCacheKey = tag;
    return t;
  }

  /**
   * `base/street-misc` — the islands, the stairs and the coverage mask.
   *
   * Coordinates are u16 at scale `q` from `(ox, oy)`, which is the file's own
   * quantiser and not this decoder's; they are expanded to world metres once
   * and cached, because both readers walk every vertex per frame.
   *
   * Returns null before the `strt` tier lands, which is why `streetLines()`
   * treats the cross-check as available-or-not rather than required: the wide
   * shot draws the layer from `base/street-lines` alone, and `base/street-misc`
   * is not fetched until z >= 1.75.
   */
  streetMisc(): StreetMisc | null {
    if (this.miscCache) return this.miscCache;
    const c = this.get("base/street-misc");
    const e = this.byKey.get("base/street-misc");
    if (!c || !e) return null;
    const q = e.q as number;
    const ox = e.ox as number;
    const oy = e.oy as number;
    const expand = (xy: Uint16Array): [Float32Array, Float32Array] => {
      const nv = xy.length >> 1;
      const X = new Float32Array(nv);
      const Y = new Float32Array(nv);
      for (let i = 0; i < nv; i++) {
        X[i] = ox + xy[i * 2] * q;
        Y[i] = oy + xy[i * 2 + 1] * q;
      }
      return [X, Y];
    };
    const [ix, iy] = expand(c.fields.islandXY as Uint16Array);
    const [sx, sy] = expand(c.fields.stairXY as Uint16Array);
    const cov = c.fields.cov as Uint8Array;
    const covN = e.covn as number;
    if (cov.length * 8 < covN) {
      throw new Error(`base/street-misc: ${cov.length} bytes for ${covN} bits`);
    }
    const m: StreetMisc = {
      islandLen: c.fields.islandLen as Uint16Array,
      islandX: ix, islandY: iy,
      stairLen: c.fields.stairLen as Uint16Array,
      stairX: sx, stairY: sy,
      stairNames: (e.stairNames ?? []) as string[],
      cov, covN,
      // LSB first within each byte — the order `build_surface.py` packed it in
      // and the order `drawCentrelines` reads it in. Read the other way round
      // it decodes silently and fades the wrong half of the city.
      covered: (fid) => ((cov[fid >> 3] >> (fid & 7)) & 1) === 1,
    };
    this.miscCache = m;
    return m;
  }

  // ── the authored landmarks ────────────────────────────────────────────────

  /**
   * The eleven heroes, the 68 shaped caps and the Golden Gate deck.
   *
   * Async because the prose — names, the anchoring register, the year's
   * register, what is measured and what is drawn — is a JSON companion beside
   * the chunk, exactly as `base/marks.json` is. The geometry is in the chunk;
   * the sentences a fiche prints are not worth a binary format.
   *
   * Resolves to null if the base tier is not loaded.
   */
  async landmarks(): Promise<LandmarkTable | null> {
    if (this.landmarkCache) return this.landmarkCache;
    const hc = this.get("base/heroes");
    const cc = this.get("base/caps");
    if (!hc || !cc) return null;
    if (!this.sidecar) {
      const res = await this.doFetch(`${this.baseUrl}/base/heroes.json`);
      if (!res.ok) throw new Error(`base/heroes.json: HTTP ${res.status}`);
      this.sidecar = (await res.json()) as HeroSidecar;
    }
    const side = this.sidecar;
    const f = hc.fields;
    const poff = f.poff as Uint32Array;
    const roff = f.roff as Uint32Array;
    const proff = f.proff as Uint32Array;
    const rx = f.rx as Float32Array;
    const ry = f.ry as Float32Array;
    const pu = f.pu as Float32Array;
    const ps = f.ps as Float32Array;
    const bi = f.bi as Uint32Array;
    if (side.heroes.length !== bi.length) {
      throw new Error(
        `base/heroes.json has ${side.heroes.length} heroes, the chunk has ${bi.length}`,
      );
    }
    const CM = 1 / 100;
    const heroes: HeroData[] = [];
    for (let q = 0; q < bi.length; q++) {
      const meta = side.heroes[q];
      if (meta.b !== bi[q]) {
        throw new Error(`hero ${q}: sidecar names building ${meta.b}, chunk says ${bi[q]}`);
      }
      const parts: HeroPartData[] = [];
      for (let j = poff[q]; j < poff[q + 1]; j++) {
        const prof: HeroProfilePt[] = [];
        for (let t = proff[j]; t < proff[j + 1]; t++) prof.push({ u: pu[t], s: ps[t] });
        const pitchCm = (f.ppi as Int32Array)[j];
        parts.push({
          kind: PART_KIND[(f.pk as Uint8Array)[j]],
          z0: (f.pz0 as Int32Array)[j] * CM,
          z1: (f.pz1 as Int32Array)[j] * CM,
          profile: prof,
          rx: rx.subarray(roff[j], roff[j + 1]),
          ry: ry.subarray(roff[j], roff[j + 1]),
          mat: (f.pm as Uint8Array)[j],
          min: (f.pmin as Int32Array)[j] * CM,
          accentMat: (f.pc as Int16Array)[j],
          ink: (f.pink as Uint8Array)[j],
          openW: (f.pw as Int32Array)[j] * CM,
          // -1 is the file's 1e9: one opening, no repetition.
          pitch: pitchCm < 0 ? Infinity : pitchCm * CM,
          margin: (f.pmg as Int32Array)[j] * CM,
          dark: (f.pdk as Int32Array)[j] * CM,
          ribs: (f.pnb as Uint16Array)[j],
          tiltX: (f.ptx as Int32Array)[j] * CM,
          tiltY: (f.pty as Int32Array)[j] * CM,
          group: side.parts[j]?.g ?? null,
          shape: side.parts[j]?.sh ?? "",
        });
      }
      heroes.push({
        bi: bi[q],
        key: meta.k,
        name: meta.n,
        year: (f.yr as Uint16Array)[q],
        yearSource: meta.ys,
        measured: meta.measured,
        drawn: meta.dr,
        anchor: meta.an,
        top: (f.top as Int32Array)[q] * CM,
        zr: (f.zr as Int32Array)[q] * CM,
        accent: meta.accent,
        ...((f.hull as Uint8Array)[q] ? { hull: true, hullReason: meta.hu ?? "" } : {}),
        ax: (f.ax as Float32Array)[q],
        ay: (f.ay as Float32Array)[q],
        ms: meta.ms,
        emphasis: meta.em,
        parts,
      });
    }

    const ce = this.byKey.get("base/caps");
    const names = ((ce?.profiles ?? []) as string[]);
    const cpo = cc.fields.poff as Uint32Array;
    const cpu = cc.fields.pu as Float32Array;
    const cps = cc.fields.ps as Float32Array;
    const capProfiles: CapProfile[] = [];
    for (let k = 0; k + 1 < cpo.length; k++) {
      const pts: HeroProfilePt[] = [];
      for (let t = cpo[k]; t < cpo[k + 1]; t++) pts.push({ u: cpu[t], s: cps[t] });
      capProfiles.push({ name: names[k] ?? String(k), pts });
    }
    const cbi = cc.fields.bi as Uint32Array;
    const cpr = cc.fields.prof as Uint8Array;
    const caps: CapData[] = [];
    for (let k = 0; k < cbi.length; k++) {
      caps.push({ bi: cbi[k], profile: cpr[k], profileName: names[cpr[k]] ?? String(cpr[k]) });
    }

    let bridge: BridgeData | null = null;
    const bc = this.get("base/bridge");
    const be = this.byKey.get("base/bridge");
    if (bc && be) {
      const brx = bc.fields.rx as Float32Array;
      const bry = bc.fields.ry as Float32Array;
      const btx = bc.fields.tx as Float32Array;
      const bty = bc.fields.ty as Float32Array;
      /* THE COUNTS ARE OPTIONAL AND THAT IS THE POINT. One bridge ships two
         flat streams and no counts, which is the shape the city encoder writes
         and the shape this read has always handled; `emit_bay_bridge.py` adds
         `rn`/`tn`/`tz` and a second bridge without touching the first bridge's
         bytes. Absent counts ⇒ the whole stream is one bridge. */
      const rn = bc.fields.rn as Uint16Array | undefined;
      const tn = bc.fields.tn as Uint16Array | undefined;
      const tz = bc.fields.tz as Float32Array | undefined;
      /* `k` is the span's own published key — `golden-gate`, `bay-west` —
         and it is read for exactly one reason: the PAINT. `drawSpan` was
         generalised from one bridge to N and carried the Golden Gate's
         International Orange onto the Bay Bridge's four towers. See
         `landmarks.ts` §BRIDGE_PAINT. A chunk without keys is unchanged. */
      const meta = (be.bridges ?? []) as {
        k?: string; deckZ?: number; year?: number;
      }[];
      const nb = rn?.length ?? 1;
      const spans: BridgeSpan[] = [];
      for (let q = 0, ro = 0, to = 0; q < nb; q++) {
        const rc = rn ? rn[q] : brx.length;
        const tc = tn ? tn[q] : btx.length;
        spans.push({
          ring: Array.from({ length: rc }, (_, i) =>
            [brx[ro + i], bry[ro + i]] as const),
          towers: Array.from({ length: tc }, (_, i) =>
            [btx[to + i], bty[to + i]] as const),
          towerZ: tz
            ? Array.from({ length: tc }, (_, i) => tz[to + i])
            : undefined,
          deckZ: meta[q]?.deckZ,
          year: meta[q]?.year,
          k: meta[q]?.k,
        });
        ro += rc;
        to += tc;
      }
      bridge = {
        ...spans[0],
        // 1937 is completion and opening. 1933 is when work began, and a map
        // that draws where a bridge IS wants the year it existed.
        year: (spans[0].year ?? be.year) as number,
        yearLandmark: be.yearLandmark as number,
        more: spans.slice(1),
      };
    }

    const t: LandmarkTable = {
      heroes, caps, capProfiles, bridge,
      materials: side.mat, wo: side.wo, note: side.note,
    };
    this.landmarkCache = t;
    return t;
  }

  // ── the request policy ────────────────────────────────────────────────────

  /**
   * Tell the store where the camera is. Everything follows from this call:
   *
   *  - what is wanted becomes exactly what this view can show;
   *  - anything in flight that this view CANNOT show is aborted, because a
   *    request the camera has already panned past is competing for the same
   *    connection as one it is waiting on;
   *  - the queue is rebuilt nearest-first, so the cell under the cursor lands
   *    before the cell at the edge of the frame.
   *
   * Safe to call every frame: it is O(chunks) with no allocation per chunk
   * beyond the sort, and the manifest is 563 entries.
   */
  setView(view: CityView): void {
    const want = this.keysFor(view);
    this.wanted = new Set(want);
    for (const k of this.baseKeys) this.wanted.add(k);

    for (const [key, ctl] of this.inFlight) {
      if (!this.wanted.has(key)) {
        ctl.abort();
        this.inFlight.delete(key);
        this.counts.cancelled++;
      }
    }
    this.queue = [];
    for (const k of this.baseKeys) {
      if (!this.held.has(k) && !this.inFlight.has(k)) this.queue.push(k);
    }
    for (const k of want) {
      if (!this.held.has(k) && !this.inFlight.has(k) && !this.queue.includes(k)) {
        this.queue.push(k);
      }
    }
    this.pump();
  }

  /** Called when a chunk lands, so the renderer can schedule a repaint. */
  onChunk(fn: (key: string) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  stats(): CityDataStats {
    return {
      held: this.held.size,
      heldBytes: this.heldBytes,
      inFlight: this.inFlight.size,
      queued: this.queue.length,
      ...this.counts,
    };
  }

  private pump(): void {
    while (this.inFlight.size < this.concurrency && this.queue.length > 0) {
      const key = this.queue.shift();
      if (key === undefined) break;
      if (this.held.has(key) || this.inFlight.has(key)) continue;
      void this.fetchChunk(key);
    }
  }

  private async fetchChunk(key: string): Promise<Chunk | undefined> {
    const entry = this.byKey.get(key);
    if (!entry) throw new Error(`no such chunk: ${key}`);
    const existing = this.held.get(key);
    if (existing) return existing.chunk;
    const ctl = new AbortController();
    this.inFlight.set(key, ctl);
    try {
      const res = await this.doFetch(`${this.baseUrl}/${key}.qc`, { signal: ctl.signal });
      if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      // `expectKey` closes the last hole a CRC leaves open: a correct chunk
      // served under the wrong name still fails here.
      const chunk = decodeChunk(buf, key);
      this.inFlight.delete(key);
      this.held.set(key, { chunk, used: ++this.clock });
      this.heldBytes += chunk.bytes;
      this.counts.fetched++;
      this.evict();
      for (const fn of this.listeners) fn(key);
      this.pump();
      return chunk;
    } catch (err) {
      this.inFlight.delete(key);
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        this.counts.failed++;
        this.pump();
        throw err;
      }
      return undefined;
    }
  }

  private evict(): void {
    if (this.heldBytes <= this.cacheBytes) return;
    const base = new Set(this.baseKeys);
    const candidates = [...this.held.entries()]
      .filter(([k]) => !base.has(k) && !this.wanted.has(k))
      .sort((a, b) => a[1].used - b[1].used);
    for (const [k, h] of candidates) {
      if (this.heldBytes <= this.cacheBytes) break;
      this.held.delete(k);
      this.heldBytes -= h.chunk.bytes;
      this.counts.evicted++;
    }
  }
}
