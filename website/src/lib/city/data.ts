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
  surroundOrder(depth: (x: number, y: number) => number): Int32Array;
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

/** `landmarks.ts`'s `BridgeDeck`, plus the record behind it. */
export interface BridgeData {
  readonly ring: readonly (readonly [number, number])[];
  readonly towers: readonly (readonly [number, number])[];
  /** the year it EXISTED — NBI completion, 1937 */
  readonly year: number;
  /** the landmark register's `yearbuilt`, 1933 — when work BEGAN */
  readonly yearLandmark: number;
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
  private sidecar: HeroSidecar | null = null;
  private readonly listeners = new Set<(key: string) => void>();

  private constructor(manifest: CityManifest, opts: CityDataOptions) {
    this.manifest = manifest;
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
    const res = await f(`${base}/manifest.json`);
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
    const manifest = (await res.json()) as CityManifest;
    if (manifest.format !== "qc/1") {
      throw new Error(`manifest: unknown format ${manifest.format}`);
    }
    return new CityData(manifest, opts);
  }

  /** Fetch and hold every base-tier chunk. Resolve when the first paint can draw. */
  async loadBase(): Promise<void> {
    await Promise.all(this.baseKeys.map((k) => this.fetchChunk(k)));
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
      surroundOrder(depth) {
        const idx: number[] = [];
        for (let j = 0; j < XH; j++) {
          for (let i = 0; i < XW; i++) {
            if (bit(own, j * XW + i)) idx.push(j * XW + i);
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
      bridge = {
        ring: Array.from(brx, (v, i) => [v, bry[i]] as const),
        towers: Array.from(btx, (v, i) => [v, bty[i]] as const),
        // 1937 is completion and opening. 1933 is when work began, and a map
        // that draws where a bridge IS wants the year it existed.
        year: be.year as number,
        yearLandmark: be.yearLandmark as number,
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
