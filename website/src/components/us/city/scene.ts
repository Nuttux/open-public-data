/**
 * THE SCENE — one paint of the city, composed out of the nine landed draw
 * modules.
 *
 * Block P4. This file owns nothing the draw modules own: it decodes the base
 * chunks into the tables those modules ask for, holds the caches that are keyed
 * on the LOD band, and calls them in the one order `DRAW.md` fixes —
 *
 *     terrain → water → streets → trees → buildings → {facades, roofs}
 *              → landmarks → labels
 *
 * — which is import order, which is paint order, and which no module here may
 * reorder.
 *
 * ── WHAT IS NEW CODE HERE AND WHAT IS A CALL ─────────────────────────────
 * Everything below is a call into `lib/city/` **except the footprint prism
 * pass** (`drawFootprints`). `buildings.ts` ships the massing tier's own draw
 * and every rule the footprint tier needs — `tierW`, `drawnAsBuilding`,
 * `colourLUT`, `inkFor`, the gates — but no `drawCity`: the mock's 597-line
 * `drawCity()` was not ported, and `DRAW.md` §5's module table does not list
 * one. So the loop is written here, against those rules, and it is a
 * SIMPLIFICATION of the mock's rather than a transcription of it. What it does
 * not carry is stated in SHELL.md §"What is not wired".
 *
 * ── NOTHING IS FABRICATED ────────────────────────────────────────────────
 * Every geometry, height, year, use class and roof colour on this canvas comes
 * out of a chunk. Where a field is missing the feature is not drawn, never
 * guessed: a chunk that has not arrived yet reads as *less city*, which is what
 * progressive loading is supposed to look like.
 */

import {
  Projection,
  screenToPlane,
  type ViewCamera,
} from "@/lib/city/projection";
import {
  bandOf,
  type CityExtent,
} from "@/lib/city/camera";
import {
  CityData,
  type Chunk,
  type CityView,
  type HeroData,
  type LandmarkTable,
  type SurroundData,
} from "@/lib/city/data";
import {
  TerrainField,
  buildSurroundLam,
  drawSurround,
  drawTerrain,
  wallGrad,
  zOf,
  shade,
  skylitN,
  HAZE,
  SUN,
  LAM0,
  type Frame,
  type SurroundGrid,
  type TerrainProj,
} from "@/lib/city/terrain";
import {
  bayPlate,
  blitGridPlate,
  buildShoal,
  buildShoalHoles,
  decodeCoast,
  depthColour,
  depthM,
  depthRamp,
  drawShoreline,
  drawWater,
  inPoly,
  shoalCellAlpha,
  shoalNodeAlpha,
  type Ring,
  type WaterMeta,
} from "@/lib/city/water";
import {
  drawCentrelines,
  drawStreetSurface,
  type StreetCell,
} from "@/lib/city/streets";
import {
  buildSpriteSheet,
  decodeParks,
  drawParkRings,
  drawVeg,
  drawWaterBodies,
  VZ_C0,
  VZ_T0,
  type CanopyCells,
  type ParkRing,
  type SpriteSheet,
  type TreeCell,
} from "@/lib/city/trees";
import {
  addContactShadow,
  areaRect,
  bucketFloor,
  buildURND,
  colourLUT,
  coverageAlpha,
  drawMassing,
  drawnAsBuilding,
  extremeQuad,
  fillContactShadow,
  inkFor,
  massAt,
  massingOf,
  massLUT,
  shadowOffset,
  streamOrder,
  tierW,
  tintIndex,
  EDGE_SHADE,
  HZL,
  NF1,
  NEAR_PX,
  QUAD_PX,
  QUAD_SCALE,
  RECT_SCALE,
  SHADOW_MIN_PX,
  STROKE_MIN_PX_A,
  STROKE_MIN_PX_B,
  WALL_MIN_PX,
  type BlockGeometry,
  type ColourTables,
  type Massing,
} from "@/lib/city/buildings";
import {
  faceWeights,
  faceGroupAlpha,
  faceGroupPath,
  faEra,
  flushFaces,
  newFaceGroups,
  openingInBand,
  storeysOf,
  faceTakesOpenings,
  FA_DOOR_H,
  FA_SHOP_SILL,
  FA_MIN_DH_PX,
} from "@/lib/city/facades";
import { bandOfHeight, drawTray, roofHeight, trayW } from "@/lib/city/roofs";
import {
  drawBridge,
  drawHero,
  heroMaterials,
  type HeroMaterials,
} from "@/lib/city/landmarks";
import {
  LabelGrid,
  placeNames,
  type PlaceLabel,
} from "@/lib/city/labels";
import {
  PAINT_C0,
  UMAT_ROOF,
  UMAT_WALL,
  USE_MASK,
  FLAG_NOYEAR,
  WAM,
  heightBand,
  legendTones,
  roofPalette,
  storeyBand,
  wallPalette,
  yearBand,
} from "./palette";

// ═══ decoded tables ════════════════════════════════════════════════════════

/**
 * One `bldg` chunk, replayed.
 *
 * The stream is a Hilbert-ordered delta chain with an escape list, and this is
 * `part3.html`'s decoder: a running cumulative sum over the whole `vx`/`vy`
 * stream, with `esc[i]` extra steps consumed before building `i`'s own run.
 * `verify_city_chunks.py` compares all 885,776 vertices of all 166,166
 * buildings against this walk, so the arithmetic is proved, not assumed.
 */
export interface BldTable {
  readonly n: number;
  readonly gid: Uint32Array;
  /** vertex offset per building, length n+1 */
  readonly off: Uint32Array;
  readonly vxw: Float32Array;
  readonly vyw: Float32Array;
  /** the vertex mean — part3's `UX`/`UY`, and the hero anchor */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly h: Uint8Array;
  readonly hf: Uint8Array;
  readonly yr: Uint8Array;
  readonly u: Uint8Array;
  readonly st: Uint8Array;
  readonly paintIdx: Uint8Array;
  readonly paintFlag: Uint8Array;
  /** roof / wall palette index, resolved once from the published columns */
  readonly ri: Uint8Array;
  readonly wi: Uint8Array;
}

const BLDG_Q = 1.0; // BLDG.q — the published 1 m vertex quantiser

function decodeBld(chunk: Chunk, year0: number, tone: ToneContext): BldTable {
  const f = chunk.fields;
  const gid = f.gid as Uint32Array;
  const cnt = f.cnt as Uint8Array;
  const vx = f.vx as Int8Array;
  const vy = f.vy as Int8Array;
  const xi = f.xi as Uint32Array;
  const xn = f.xn as Uint16Array;
  const n = cnt.length;

  const esc = new Uint32Array(n);
  for (let k = 0; k < xi.length; k++) esc[xi[k]] += xn[k];

  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const nv = off[n];
  const vxw = new Float32Array(nv);
  const vyw = new Float32Array(nv);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);

  let ax = 0;
  let ay = 0;
  let p = 0; // position in the delta stream
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < esc[i]; e++) {
      ax += vx[p];
      ay += vy[p];
      p++;
    }
    let sxAcc = 0;
    let syAcc = 0;
    const o = off[i];
    for (let k = 0; k < cnt[i]; k++) {
      ax += vx[p];
      ay += vy[p];
      p++;
      const wx = ax * BLDG_Q;
      const wy = ay * BLDG_Q;
      vxw[o + k] = wx;
      vyw[o + k] = wy;
      sxAcc += wx;
      syAcc += wy;
    }
    cx[i] = cnt[i] ? sxAcc / cnt[i] : 0;
    cy[i] = cnt[i] ? syAcc / cnt[i] : 0;
  }

  const h = f.h as Uint8Array;
  const hf = f.hf as Uint8Array;
  const yr = f.yr as Uint8Array;
  const u = f.u as Uint8Array;
  const st = f.st as Uint8Array;
  const paintIdx = f.paintIdx as Uint8Array;
  const paintFlag = f.paintFlag as Uint8Array;

  const ri = new Uint8Array(n);
  const wi = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const use = u[i] & USE_MASK;
    const noyr = (u[i] & FLAG_NOYEAR) !== 0;
    const wl = UMAT_WALL[use];
    const rl = UMAT_ROOF[use];
    if (wl && rl) {
      const hb = heightBand(h[i]);
      const y = year0 + yr[i];
      const ab = noyr ? Math.min(4, hb) : yearBand(y);
      const sb = storeyBand(st[i]);
      wi[i] = WAM(wl[ab * 3 + sb]);
      ri[i] = WAM(rl[hb * 2 + (noyr ? (hb > 1 ? 1 : 0) : y < 1925 ? 0 : 1)]);
    } else {
      // the honest bucket — no roll row, so the locale legend and nothing else
      const r = Math.hypot(cx[i] - tone.dtx, cy[i] - tone.dty) / tone.maxR;
      const side =
        (cx[i] - tone.fx) * tone.mvy - (cy[i] - tone.fy) * tone.mvx < 0 ? 0 : 1;
      const t = legendTones(r, side, tone.rnd(i));
      wi[i] = t.wall;
      ri[i] = t.roof;
    }
    // THE ROOF IS MEASURED — it replaces the legend for every building that
    // carries a sampled aerial colour. paintFlag 0 means no sample.
    if (paintFlag[i]) ri[i] = PAINT_C0 + paintIdx[i];
  }
  return { n, gid, off, vxw, vyw, cx, cy, h, hf, yr, u, st, paintIdx, paintFlag, ri, wi };
}

/** the three named points the locale legend is measured against */
interface ToneContext {
  dtx: number;
  dty: number;
  fx: number;
  fy: number;
  mvx: number;
  mvy: number;
  maxR: number;
  rnd: (i: number) => number;
}

export interface BlockTable extends BlockGeometry {
  readonly area: Float32Array;
  readonly hood: Uint8Array;
  readonly hoodNames: readonly string[];
  readonly ids: readonly string[];
  /**
   * THE BLOCK'S MEASURED ROOF COLOUR — an index into the same 32-entry palette
   * the buildings use, or `BIDX_NONE` where no sampled building stands on the
   * block. Shipped by P1 at P4b's request; see `blockRoofIdx`.
   */
  readonly bidx: Uint8Array;
}

/** `paint/blocks.py`'s `NOBLOCK`: park, water or right of way — 361 of 5,404 */
const BIDX_NONE = 255;

function decodeBlocks(
  chunk: Chunk,
  hoodNames: readonly string[],
  ids: readonly string[],
): BlockTable {
  const f = chunk.fields;
  const cnt = f.cnt as Uint16Array;
  const sc = f.sc as Uint8Array;
  const ox = f.ox as Float32Array;
  const oy = f.oy as Float32Array;
  const dvx = f.vx as Int16Array;
  const dvy = f.vy as Int16Array;
  const z = f.z as Uint16Array;
  const a = f.a as Float32Array;
  const hood = f.hood as Uint8Array;
  const bidx = (f.bidx as Uint8Array | undefined) ?? new Uint8Array(0);
  const n = cnt.length;

  const off = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + cnt[i];
  const nv = off[n];
  const rx = new Float32Array(nv);
  const ry = new Float32Array(nv);
  const inx = new Float32Array(nv);
  const iny = new Float32Array(nv);
  const maxInset = new Float32Array(n);
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = off[i];
    const m = cnt[i];
    /* THE QUANTUM IS `(1 << sc) / 10`, and it MULTIPLIES.
       part3.html §84. `sc` is a per-block power-of-two exponent and the deltas
       are in tenths of that unit, so a vertex is `ox + vx * 2^sc / 10`. Read
       as `1 / (1 << sc)` — which is what "a power-of-two quantiser" sounds
       like — the rings come out hundreds of times too large and the frame
       fills with pale diagonal slabs the size of the whole bay. Measured, on
       the third screenshot of this file. */
    const q = (1 << sc[i]) / 10;
    let mnx = 1e18, mny = 1e18, mxx = -1e18, mxy = -1e18;
    let sxAcc = 0, syAcc = 0;
    for (let k = 0; k < m; k++) {
      const x = ox[i] + dvx[o + k] * q;
      const y = oy[i] + dvy[o + k] * q;
      rx[o + k] = x;
      ry[o + k] = y;
      sxAcc += x;
      syAcc += y;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
    }
    cx[i] = m ? sxAcc / m : ox[i];
    cy[i] = m ? syAcc / m : oy[i];

    /* The largest inset this ring can take without turning inside out.
       0.30 of the bounding box was the mock's first cut and it folded six
       blocks — every one a 100–230 m² sliver: a traffic island, a median
       strip, a wedge left between two streets. Area over perimeter is the
       ring's own inradius, which is the quantity that actually bounds an
       offset, and it holds for all 5,404. */
    let per = 0;
    let ar = 0;
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      per += Math.hypot(rx[o + k1] - rx[o + k], ry[o + k1] - ry[o + k]);
      ar += rx[o + k] * ry[o + k1] - rx[o + k1] * ry[o + k];
    }
    ar = Math.abs(ar) / 2;
    maxInset[i] = Math.max(
      0.05,
      Math.min(0.3 * Math.min(mxx - mnx, mxy - mny), (0.75 * ar) / (per || 1)),
    );

    /* Per-vertex INWARD offset, one unit of inset. On a rectangle that is a
       constant; on the Presidio's 388-vertex boundary it is not, so it is the
       angle bisector of the two adjacent edges' inward normals, scaled by
       1/sin(half-angle) and clamped at 3× — past that a spike folds through
       itself. CCW ring → the inward normal of edge (ex,ey) is (−ey, ex). */
    for (let k = 0; k < m; k++) {
      const kp = (k + m - 1) % m;
      const k1 = (k + 1) % m;
      const e0x = rx[o + k] - rx[o + kp];
      const e0y = ry[o + k] - ry[o + kp];
      const e1x = rx[o + k1] - rx[o + k];
      const e1y = ry[o + k1] - ry[o + k];
      const l0 = Math.hypot(e0x, e0y) || 1;
      const l1 = Math.hypot(e1x, e1y) || 1;
      const n0x = -e0y / l0, n0y = e0x / l0;
      const n1x = -e1y / l1, n1y = e1x / l1;
      let bx = n0x + n1x;
      let by = n0y + n1y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6) {
        inx[o + k] = n1x;
        iny[o + k] = n1y;
        continue;
      }
      bx /= bl;
      by /= bl;
      const sgn = Math.min(3, 1 / Math.max(0.33, bx * n0x + by * n0y));
      inx[o + k] = bx * sgn;
      iny[o + k] = by * sgn;
    }
  }
  return {
    n, off, rx, ry, inx, iny, maxInset, cx, cy, z, area: a, hood, hoodNames, ids,
    /* A chunk written before P1 shipped `bidx` has none, and the tone falls
       back to the published height band for every block rather than throwing.
       Nothing here fills the gap with a value. */
    bidx: bidx.length === n ? bidx : new Uint8Array(n).fill(BIDX_NONE),
  };
}

// ═══ the scene ═════════════════════════════════════════════════════════════

/**
 * ABLATION SWITCHES, in the spirit of `terrain.ts`'s own `LOOK`: "kept because
 * every one of them names a decision somebody argued for, and turning one off
 * is how the next person tells whether it is still earning its place."
 *
 * Driven from `?layers=` on the route, so a screenshot can isolate one pass.
 * Every one defaults ON and nothing reads them but `paint`.
 */
export interface SceneLayers {
  surround: boolean;
  terrain: boolean;
  water: boolean;
  shore: boolean;
  parks: boolean;
  streets: boolean;
  veg: boolean;
  massing: boolean;
  buildings: boolean;
  /** the eleven authored heroes, drawn inside the footprint stream */
  heroes: boolean;
  bridge: boolean;
  labels: boolean;
}

export const ALL_LAYERS: SceneLayers = {
  surround: true, terrain: true, water: true, shore: true, parks: true,
  streets: true, veg: true, massing: true, buildings: true, heroes: true,
  bridge: true, labels: true,
};

/** `?layers=-water,-veg` turns two off; `?layers=terrain` turns everything
 *  else off. Unknown names are ignored rather than silently changing a layer. */
export function parseLayers(spec: string | null): SceneLayers {
  if (!spec) return { ...ALL_LAYERS };
  const names = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const subtractive = names.every((n) => n.startsWith("-"));
  const out: SceneLayers = subtractive
    ? { ...ALL_LAYERS }
    : (Object.fromEntries(
        Object.keys(ALL_LAYERS).map((k) => [k, false]),
      ) as unknown as SceneLayers);
  for (const n of names) {
    const off = n.startsWith("-");
    const k = (off ? n.slice(1) : n) as keyof SceneLayers;
    if (k in out) out[k] = !off;
  }
  return out;
}

export interface SceneStats {
  cells: number;
  massed: number;
  buildings: number;
  streets: number;
  trees: number;
  labels: number;
  /** the LOD ladder's own weight this frame */
  wB: number;
}

const emptyStats = (): SceneStats => ({
  cells: 0, massed: 0, buildings: 0, streets: 0, trees: 0, labels: 0, wB: 0,
});

/** one frame's heroes, in the order their own depth buckets flush */
interface HeroQueue {
  readonly n: number;
  readonly flushD: Float64Array;
  readonly items: readonly { hero: HeroData; zg: number }[];
  /** the shipped building indices, so the prism is not drawn inside the hero */
  readonly gids: ReadonlySet<number>;
  readonly mat: readonly (readonly string[])[];
  readonly mats: HeroMaterials;
}

interface BandCache {
  terrain: TerrainField;
  surround: SurroundGrid | null;
  /** the key those two were built for */
  key: string;
}

export class CityScene {
  readonly data: CityData;
  readonly proj: Projection;

  private bands = new Map<number, BandCache>();
  private blocks: BlockTable | null = null;
  private massing: Massing | null = null;
  private urnd: Float32Array | null = null;
  private solo: BldTable | null = null;
  private soloFace: Chunk | null = null;
  private bldCache = new Map<string, BldTable>();
  private coast: Ring[] = [];
  private burn: Ring[] = [];
  private parks: ParkRing[] = [];
  private waterBodies: ParkRing[] = [];
  private surroundData: SurroundData | null = null;
  private landmarkTable: LandmarkTable | null = null;
  private places: PlaceLabel[] = [];
  private sprite: SpriteSheet | null = null;
  private tone: ToneContext | null = null;
  private depthPlate: HTMLCanvasElement | null = null;
  private shoalPlate: HTMLCanvasElement | null = null;
  private blockOrder: Int32Array = new Int32Array(0);
  private massRowYear = -1;
  private massRow: ReturnType<typeof massAt> | null = null;
  private labelGrid: LabelGrid | null = null;
  private roofLut: ColourTables | null = null;
  private roofLutKey = "";
  private blockRoof: Uint8Array | null = null;
  private heroMats: HeroMaterials | null = null;

  constructor(data: CityData, proj: Projection) {
    this.data = data;
    this.proj = proj;
  }

  /**
   * Can anything be painted yet?
   *
   * The ground, and nothing more. This is deliberately the LOWEST bar in the
   * file: the base tier arrives as twelve separate chunks and the map is
   * supposed to be usable before all twelve have landed. A chunk that is not
   * here yet reads as *less city*, never as a blank frame.
   */
  get ready(): boolean {
    return this.data.has("base/terrain");
  }

  /** the DEM-derived caches depend on chunks that arrive later; drop them */
  invalidateBands(): void {
    this.bands.clear();
    this.depthPlate = null;
    this.shoalPlate = null;
  }

  get blockTable(): BlockTable | null {
    return this.blocks;
  }

  get landmarks(): LandmarkTable | null {
    return this.landmarkTable;
  }

  /**
   * Build every table that can be built from what is currently held. Cheap and
   * idempotent: called after every chunk lands, and does nothing for a table it
   * has already built.
   */
  build(): void {
    const d = this.data;
    const m = d.manifest;

    if (!this.tone) {
      const p = m.proj as unknown as TerrainProj;
      const dt = p.downtown;
      const fe = p.ferry;
      const ka = p.castro;
      let mvx = ka[0] - fe[0];
      let mvy = ka[1] - fe[1];
      const L = Math.hypot(mvx, mvy) || 1;
      mvx /= L;
      mvy /= L;
      // the same xorshift the mock seeds with the 1906 date, so the tie-break
      // inside a family is reproducible rather than random
      const rnd = buildURND(1 << 18);
      this.tone = {
        dtx: dt[0], dty: dt[1], fx: fe[0], fy: fe[1], mvx, mvy,
        maxR: 12000,
        rnd: (i) => rnd[i & ((1 << 18) - 1)],
      };
    }

    const blocksChunk = d.get("base/blocks");
    if (!this.blocks && blocksChunk) {
      const entry = m.chunks.find((c) => c.k === "base/blocks");
      const hoods = ((entry?.hoodNames ?? []) as string[]) ?? [];
      this.blocks = decodeBlocks(blocksChunk, hoods, []);
      const order = new Int32Array(this.blocks.n);
      for (let i = 0; i < order.length; i++) order[i] = i;
      const bl = this.blocks;
      const dep = (i: number): number => this.proj.depth(bl.cx[i], bl.cy[i]);
      this.blockOrder = Int32Array.from(
        Array.from(order).sort((a, b) => dep(a) - dep(b)),
      );
    }

    const massChunk = d.get("base/massing");
    if (!this.massing && massChunk) {
      const entry = m.chunks.find((c) => c.k === "base/massing");
      const year0 = (entry?.year0 as number) ?? 1849;
      this.massing = massingOf(massChunk, year0);
      this.urnd = buildURND((m.buildings as { n: number }).n);
    }

    const soloChunk = d.get("base/solo");
    if (!this.solo && soloChunk && this.tone) {
      this.solo = decodeBld(soloChunk, 1849, this.tone);
    }
    if (!this.soloFace) this.soloFace = d.get("base/solo-face") ?? null;

    const coastChunk = d.get("base/coast");
    if (!this.coast.length && coastChunk) {
      const c = decodeCoast(coastChunk);
      this.coast = c.coast;
      this.burn = c.burn;
    }

    const parksChunk = d.get("base/parks");
    if (!this.parks.length && parksChunk) {
      const p = decodeParks(parksChunk);
      this.parks = p.parks;
      this.waterBodies = p.water;
    }

    if (!this.surroundData) this.surroundData = d.surround();

    if (!this.sprite && typeof document !== "undefined") {
      this.sprite = buildSpriteSheet((w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      });
    }
  }

  /**
   * Build the terrain field and the surround grid for ALL THREE bands, once,
   * off the critical path.
   *
   * A band cache costs a `TerrainField` (67,600 nodes of Lambert and
   * self-shadow), `buildSurroundLam` (116,480 cells) and a 56,330-element
   * depth sort. Built lazily, the FIRST frame of a zoom that crosses a band
   * pays all of it — and a zoom crosses two of them. MEASURED before this
   * existed: a wheel zoom from whole city to the ceiling ran at **9.8 rAF/s**,
   * against 112 at block zoom where every band was already warm.
   *
   * There are exactly three (`ZEX_BY_STEP` is three long), so this is bounded.
   */
  warmBands(): void {
    for (let step = 0; step < 3; step++) this.bandFor(step);
  }

  /** the landmark table needs a fetch of its own for the prose beside it */
  async loadLandmarks(): Promise<void> {
    if (this.landmarkTable) return;
    this.landmarkTable = await this.data.landmarks();
  }

  /** the place names, from `base/marks.json` */
  setPlaces(p: PlaceLabel[]): void {
    this.places = p;
  }

  /** The DEM walk `fitCity` needs. Every third node inside the coast mask. */
  extent(): CityExtent | null {
    const band = this.bandFor(0);
    if (!band) return null;
    const t = band.terrain;
    const maxBuilt = 260; // metres — the tallest published derived top
    return {
      maxBuiltHeightM: maxBuilt,
      forEachGroundSample(visit) {
        const N = t.N;
        for (let i = 0; i < N; i += 3)
          for (let j = 0; j < N; j += 3) {
            if (!t.maskAt(i, j)) continue;
            const x = t.proj.X0 + i * t.cellM;
            const y = t.proj.Y0 + j * t.cellM;
            visit(x, y, t.elevAt(i, j));
          }
      },
    };
  }

  /** The terrain field and the surround grid for one LOD band, built once. */
  private bandFor(step: number): BandCache | null {
    const held = this.bands.get(step);
    const key = `${this.proj.rotDeg}|${this.proj.sA}`;
    if (held && held.key === key) return held;
    const chunk = this.data.get("base/terrain");
    if (!chunk) return null;
    const p = this.data.manifest.proj as unknown as TerrainProj;
    const zex = [3.3, 2.6, 2.0][step] ?? 3.3;
    const t = new TerrainField(chunk, p, { zex });

    // the ground tint is a measurement, and it is on the first-paint path
    const tint = this.data.get("base/canopy-tint");
    if (tint) t.canopyFrac = tint.fields.demFrac as Uint8Array;

    // park fraction and the burn flag, per DEM cell
    if (this.parks.length) markCells(t, this.parks, t.cellPark);
    if (this.burn.length) markCells(t, this.burn, t.cellBurn);

    let sg: SurroundGrid | null = null;
    const s = this.surroundData;
    if (s) {
      // §11: `lam` is terrain.ts's and `order` is the projection's, so the
      // composition is the caller's and it is four lines.
      const lam = buildSurroundLam(s.XW, s.XH, s.z, s.cellW, s.cellH, zex);
      const order = s.surroundOrder((x, y) => this.proj.depth(x, y));
      sg = { ...s, lam, order };
    }
    const cache: BandCache = { terrain: t, surround: sg, key };
    this.bands.set(step, cache);
    return cache;
  }

  /** the `bldg` table for a held chunk, decoded once */
  private bldFor(chunk: Chunk): BldTable | null {
    const hit = this.bldCache.get(chunk.key);
    if (hit) return hit;
    if (!this.tone) return null;
    const t = decodeBld(chunk, 1849, this.tone);
    if (this.bldCache.size > 200) this.bldCache.clear();
    this.bldCache.set(chunk.key, t);
    return t;
  }

  /**
   * THE HIT TEST. Which assessor block is under this canvas pixel?
   *
   * The pixel is a line in z (`projection.ts` §THE PIXEL IS A LINE), so this
   * marches z downward from above the terrain and takes the first crossing of
   * the drawn surface — `HIT_STEP_M`'s own rule, at `marchStepZ()`, so the step
   * is a WORLD distance and stays one at every tilt and every band.
   */
  pick(px: number, py: number, cam: ViewCamera, W: number, H: number): number {
    const step = bandOf(zOf(cam));
    const band = this.bandFor(step);
    const bl = this.blocks;
    if (!band || !bl) return -1;
    const t = band.terrain;
    const plane = screenToPlane(px, py, W, H, cam);
    const dz = this.proj.marchStepZ();
    let hitX = 0;
    let hitY = 0;
    let found = false;
    for (let z = 320; z >= -20; z -= dz) {
      const w = this.proj.invAt(plane[0], plane[1], z);
      const g = t.elevM(w[0], w[1]);
      if (g >= z) {
        hitX = w[0];
        hitY = w[1];
        found = true;
        break;
      }
    }
    if (!found) return -1;
    // nearest-first over the blocks whose bbox contains the point
    for (let i = 0; i < bl.n; i++) {
      const o = bl.off[i];
      const m = bl.off[i + 1] - o;
      if (m < 3) continue;
      if (Math.abs(bl.cx[i] - hitX) > 900 || Math.abs(bl.cy[i] - hitY) > 900)
        continue;
      const ring: [number, number][] = new Array(m);
      for (let k = 0; k < m; k++) ring[k] = [bl.rx[o + k], bl.ry[o + k]];
      if (inPoly(hitX, hitY, ring)) return i;
    }
    return -1;
  }

  /** the world point under a canvas pixel, at ground level — for the readout */
  groundAt(
    px: number, py: number, cam: ViewCamera, W: number, H: number,
  ): [number, number] | null {
    const band = this.bandFor(bandOf(zOf(cam)));
    if (!band) return null;
    const plane = screenToPlane(px, py, W, H, cam);
    const dz = this.proj.marchStepZ();
    for (let z = 320; z >= -20; z -= dz) {
      const w = this.proj.invAt(plane[0], plane[1], z);
      if (band.terrain.elevM(w[0], w[1]) >= z) return [w[0], w[1]];
    }
    return null;
  }

  /** the world-space view quad — the four inverse-projected screen corners */
  viewQuad(cam: ViewCamera, W: number, H: number): CityView {
    const z = zOf(cam);
    const corners: [number, number][] = [];
    for (const [px, py] of [[0, 0], [W, 0], [W, H], [0, H]] as const) {
      const pl = screenToPlane(px, py, W, H, cam);
      const w = this.proj.invAt(pl[0], pl[1], 0);
      corners.push([w[0], w[1]]);
    }
    // the diamond is convex but the corner order above is screen order, which
    // survives the inverse because the map is affine
    return { z, quad: corners };
  }

  // ── the paint ────────────────────────────────────────────────────────────

  layers: SceneLayers = { ...ALL_LAYERS };

  paint(f: Frame, opts: { year?: number } = {}): SceneStats {
    const L = this.layers;
    const st = emptyStats();
    const cam = f.cam as ViewCamera & { step?: number };
    const z = zOf(cam);
    const step = typeof cam.step === "number" ? cam.step : bandOf(z);
    const band = this.bandFor(step);
    if (!band) return st;
    const t = band.terrain;
    const view = this.viewQuad(cam, f.W, f.H);

    /* 1 ── THE WATER GOES DOWN FIRST, AND THE LAND IS PAINTED OVER IT.
       This is `drawTerrain`'s own order in part3.html §5312: bay plate, depth
       plate, `drawContext` (the surround), then the city's DEM cells, and its
       comment says why — "every pixel of the plate that reaches the land is
       painted [over]". Both plates are grids laid under one affine and neither
       carries a land test of its own, so the ONLY thing that keeps the bay out
       of the Sunset is the land being painted after it. Drawing the water last
       — which is what "terrain → water" import order looks like if you read it
       as paint order — puts the Pacific over the whole peninsula. Measured, on
       the second screenshot of this file. */
    if (L.water) this.paintWaterBed(f, band);

    // 2 ── the surround, then the city's own ground, both over the plates
    if (L.surround) drawSurround(f, t, band.surround);
    if (L.terrain) {
      const tr = drawTerrain(f, t, 0);
      st.cells = tr.cells;
    }

    // 3 ── the shallows, and the published shoreline over whatever the raster did
    if (L.water) this.paintShoal(f, band);
    if (L.shore && this.coast.length) drawShoreline(f, t, this.coast);

    // 3 ── the parks and the published water bodies
    if (L.parks && this.parks.length) drawParkRings(f, t, this.parks);
    if (L.parks && this.waterBodies.length) drawWaterBodies(f, t, this.waterBodies);

    // 4 ── the streets
    if (L.streets && z >= VZ_T0) st.streets = this.paintStreets(f, t, view, opts.year);

    // 5 ── the vegetation
    if (L.veg && z >= VZ_C0) st.trees = this.paintVeg(f, t, view, z);

    // 6 ── the buildings: the massing tier, then the footprints over it
    const wB = tierW(z);
    st.wB = wB;
    if (L.massing) st.massed = this.paintMassing(f, t, step, wB, opts.year);
    if (L.buildings) st.buildings = this.paintFootprints(f, t, view, z, step, wB);

    // 7 ── the landmarks the record points the whole map at
    const lm = this.landmarkTable;
    if (L.bridge && lm?.bridge) drawBridge(f, lm.bridge, opts.year);

    // 8 ── the names, last, over everything, on one ink budget
    if (L.labels && this.places.length) {
      this.labelGrid = new LabelGrid(f.W, f.H);
      const r = placeNames(f, this.places, this.labelGrid, (x, y) => t.elevM(x, y));
      st.labels = r.placed;
    }
    return st;
  }

  /** the bay's aerial gradient and the published bathymetry, under everything */
  private paintWaterBed(f: Frame, band: BandCache): void {
    const sg = band.surround;
    const bay = bayPlate(
      f, makeCanvas,
      (this.data.manifest.proj as unknown as TerrainProj).downtown,
    );
    if (sg) this.ensurePlates(sg);
    drawWater(f, {
      bay: bay as (CanvasImageSource & { width: number; height: number }) | undefined,
      depth: this.depthPlate ?? undefined,
      surround: sg,
      depthTexels: 1,
    });
  }

  /**
   * The shallows, AFTER the land.
   *
   * `water.ts` is explicit that this band is "distance from land, in cells, so
   * the shallows can be a shade lighter" and NOT a depth claim — the depth
   * claim is the plate above, which is published. It goes down last because it
   * is a wash on the water's own surface and it has no land test either.
   */
  private paintShoal(f: Frame, band: BandCache): void {
    const sg = band.surround;
    if (!sg || !this.shoalPlate) return;
    blitGridPlate(f, this.shoalPlate, sg, 1);
  }

  /**
   * The two grid plates. Built once — they are a picture of a published field
   * over a fixed grid, so nothing about them depends on the camera, and
   * rebuilding one per frame would be the whole bay resampled for nothing.
   */
  private ensurePlates(sg: SurroundGrid): void {
    if (this.depthPlate && this.shoalPlate) return;
    const wc = this.data.get("base/water0");
    const meta = this.data.manifest.water as unknown as WaterMeta | undefined;
    const XW = sg.XW;
    const XH = sg.XH;
    const XNW = XW + 1;
    const XNH = XH + 1;

    if (!this.depthPlate && wc && meta) {
      const dep = wc.fields.dep as Uint8Array;
      if (dep.length === XNW * XNH) {
        const ramp = depthRamp(meta.qs);
        const cv = makeCanvas(XNW, XNH);
        const g = cv.getContext("2d");
        if (g) {
          const img = g.createImageData(XNW, XNH);
          for (let k = 0; k < XNW * XNH; k++) {
            const v = dep[k];
            const o = k * 4;
            if (v === 0) {
              img.data[o + 3] = 0; // all land: the source dropped it, so do we
              continue;
            }
            const c = depthColour(depthM(v, meta.dmax), ramp);
            img.data[o] = c[0];
            img.data[o + 1] = c[1];
            img.data[o + 2] = c[2];
            img.data[o + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          this.depthPlate = cv;
        }
      }
    }

    if (!this.shoalPlate) {
      const sh = buildShoal(XW, XH, (i, j) => sg.z(i, j) > 0 && isLandOf(sg, i, j));
      const hole = buildShoalHoles(
        XW, XH,
        (i, j) => [
          sg.mx[i] + (sg.mx[1] - sg.mx[0]) / 2,
          sg.my[j] + (sg.my[1] - sg.my[0]) / 2,
        ],
        sh.dist,
        this.coast,
        (x, y) => {
          const b = this.bandFor(0);
          return b ? b.terrain.elevM(x, y) <= 0 : false;
        },
      );
      const cell = shoalCellAlpha(XW, XH, { ...sh, hole });
      const node = shoalNodeAlpha(XW, XH, cell);
      const cv = makeCanvas(XNW, XNH);
      const g = cv.getContext("2d");
      if (g) {
        const img = g.createImageData(XNW, XNH);
        // BAY_SHOAL, as an alpha over whatever the depth plate left
        for (let k = 0; k < XNW * XNH; k++) {
          const o = k * 4;
          img.data[o] = 0xc6;
          img.data[o + 1] = 0xdc;
          img.data[o + 2] = 0xe3;
          img.data[o + 3] = Math.round(Math.max(0, Math.min(1, node[k])) * 255);
        }
        g.putImageData(img, 0, 0);
        this.shoalPlate = cv;
      }
    }
  }

  private paintStreets(
    f: Frame,
    t: TerrainField,
    view: CityView,
    year: number | undefined,
  ): number {
    const cells: StreetCell[] = [];
    for (const c of this.data.visible("strt", view)) {
      cells.push(c.fields as unknown as StreetCell);
    }
    if (!cells.length) return 0;
    const stats = this.data.manifest.streets as unknown as {
      stats: { w_p50: number };
    };
    const medianW = [
      stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50,
      stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50, stats.stats.w_p50,
    ];
    drawCentrelines(f, cells, t, {
      medianW,
      // a published right of way HAS arrived for every feature in these cells:
      // the surface and the centreline ship in the same chunk.
      covered: () => true,
      band: 0,
    });
    const r = drawStreetSurface(f, cells, { year });
    return r.surfaces;
  }

  private paintVeg(f: Frame, t: TerrainField, view: CityView, z: number): number {
    const trees: TreeCell[] = [];
    const canopy: CanopyCells[] = [];
    if (z >= VZ_T0) {
      for (const c of this.data.visible("tree", view))
        trees.push(c.fields as unknown as TreeCell);
    }
    for (const c of this.data.visible("canopy", view))
      canopy.push(c.fields as unknown as CanopyCells);
    if (!trees.length && !canopy.length) return 0;
    const r = drawVeg(f, t, this.sprite, trees, canopy, z);
    return r.trees + r.blobs;
  }

  private paintMassing(
    f: Frame,
    t: TerrainField,
    step: number,
    wB: number,
    year: number | undefined,
  ): number {
    const bl = this.blocks;
    const mg = this.massing;
    if (!bl || !mg) return 0;
    const iy = year === undefined ? 2025 : Math.floor(year);
    if (!this.massRow || this.massRowYear !== iy) {
      this.massRow = massAt(mg, bl.n, iy, this.blockOrder);
      this.massRowYear = iy;
    }
    const pal = {
      roof: roofPalette((this.data.manifest.buildings as { palette: string[] }).palette),
      wall: wallPalette(),
    };
    const fade = fadeAmt(f);
    const colours = massLUT(pal, fade);
    const roofIdx = this.blockRoofIdx(bl);
    const wallIdx = new Uint8Array(bl.n);
    const alpha = 1 - wB;
    if (alpha <= 0.004) return 0;
    return drawMassing(
      f, t, bl, this.massRow, this.blockOrder, colours, roofIdx, wallIdx,
      { alpha, fadeAmt: fade },
    );
  }

  /**
   * THE MASSING SOLID'S ROOF TONE — MEASURED, as of P4b.
   *
   * `part3.html` §5732 replaced a seeded locale legend — "downtown: grey,
   * hard", "the avenues: pale stucco rows" — with **the area-weighted mean of
   * the measured roof colours of the buildings actually standing on the
   * block** (`paint/blocks.py` → `PAINT.bidx`), and its own comment calls the
   * legend it replaced *"an honest description of an invention, sitting in the
   * frame this piece is most often looked at in."*
   *
   * P4 could not read it: `manifest.kinds.blocks` shipped nine fields and none
   * was a roof index, and there is no block → building map in `base/massing` to
   * recompute one from. The stand-in was the block's own published
   * area-weighted mean LIDAR height, banded at `roofs.ts`'s 9 / 15 / 25 m —
   * an art choice on a measured column, stated as one, and **reported to P1 as
   * a gap.**
   *
   * P1 closed it. `bidx` is now a tenth field on the `blocks` chunk: per
   * building the MEDIAN colour of the published aerial pixels inside the
   * footprint, eroded 1.5 m so the sample is roof and not wall or kerb (Esri
   * World Imagery at z=18, 0.472 m/px; 166,042 of 166,166 footprints sampled);
   * area-weighted onto the block whose published ring CONTAINS the footprint's
   * centroid, and quantised to the same 32-entry palette the buildings use.
   * **5,043 of 5,404 blocks carry it (93.3 %).**
   *
   * The 361 that do not are park, water and right of way, and they ship the
   * `255` sentinel. Those keep the height band — the measurement says nothing
   * about them, so nothing is invented for them, and the fallback is named
   * here rather than hidden behind a default.
   */
  private blockRoofIdx(bl: BlockTable): Uint8Array {
    const hit = this.blockRoof;
    if (hit && hit.length === bl.n) return hit;
    const out = new Uint8Array(bl.n);
    const row = this.massRow;
    const BY_BAND = [WAM(3), WAM(8), WAM(10), WAM(1)];
    for (let b = 0; b < bl.n; b++) {
      const m = bl.bidx[b];
      if (m !== BIDX_NONE) {
        out[b] = PAINT_C0 + m;
        continue;
      }
      const h = row ? row.hgt[b] : 0;
      out[b] = BY_BAND[bandOfHeight(h)];
    }
    this.blockRoof = out;
    return out;
  }

  /**
   * THE FOOTPRINT TIER — `drawCity`'s own loop, as far as the export carries it.
   *
   * One prism per published footprint: the roof at `roofHeight(h, hf)` over the
   * ground the DEM gives, and the walls of every edge whose outward normal
   * faces down-screen. At the 315° bearing a building shows its roof and ONE
   * wall, so the front-face test is a sign test on the projected edge and not a
   * dot product.
   *
   * `drawnAsBuilding` is the dither: below `LOD_Z0` nothing but the solos is
   * here, and between 1.55 and 2.35 a building arrives on its own fixed
   * `URND[i]`, so a re-rasterisation at a higher `w` differs from the last one
   * by *more grain* and not by a different picture.
   *
   * ── WHAT P4b ADDED, AND WHY EACH ONE IS NOT COSMETIC ────────────────────
   * P4 shipped this as a stated SIMPLIFICATION of the mock's 597-line
   * `drawCity()`. Five things were missing and four of them are here:
   *
   * 1. **PAINTER'S ORDER.** The first loop walked the visible chunks in arrival
   *    order and each chunk in its own Hilbert order, which is spatially
   *    coherent and is *not* depth order — so a near building could be drawn
   *    before a far one and the far one then painted its roof over it. Nothing
   *    threw and the suite stayed green. `streamOrder` is the counting sort
   *    `buildings.ts` ships for exactly this.
   * 2. **THE CONTACT SHADOW**, batched per depth band. See `addContactShadow`.
   * 3. **THE `RECT_SCALE` RUNG** and the four-extreme-vertex `QUAD_PX` rung,
   *    both of which the first loop replaced with a bounding box. A bounding
   *    box circumscribes the shape, so it thickens every building by ~30 % of
   *    its area and closes up the streets between them.
   * 4. **THE ARRIVAL TINT**, which is `colourLUT`'s `roofF`/`wallF` — shipped
   *    since P3 and read by nothing, so every building on this map was drawn at
   *    tint index 0.
   * 5. **THE LANDMARK FLUSH AT THE BUCKET FLOOR** — `paintHeroes`, below.
   *
   * The lot-grain party lines are the one item on P4's list that is NOT here,
   * and the reason is that they do not exist to port. `LOTINK`, `LOT_SHADE`,
   * `LOT_MIN_BLOCK_PX` and `LOT_MIN_GAP_PX` are **dead in the mock as well** —
   * three declarations and one comment, no reader anywhere in `part1–4.html` —
   * because the 48 seeded frontage patterns they belonged to were deleted on
   * 2026-08-21 as an invention, and the real lot boundaries that were to
   * replace them are not in the P1 catalogue: `manifest.kinds` has seventeen
   * kinds and none is a lot. Drawing a party line here would be inventing both
   * its position and its existence. What the mock kept of that layer is the
   * ROOF OUTLINE — *"the outline is what separates one house from the one it
   * shares a party wall with"* — and that is drawn, at `EDGE_SHADE`.
   */
  private paintFootprints(
    f: Frame,
    t: TerrainField,
    view: CityView,
    z: number,
    step: number,
    wB: number,
  ): number {
    const mg = this.massing;
    const urnd = this.urnd;
    if (!mg || !urnd) return 0;
    const fade = fadeAmt(f);
    const key = fade.toFixed(4) + "|" + step;
    if (this.roofLutKey !== key || !this.roofLut) {
      const pal = {
        roof: roofPalette((this.data.manifest.buildings as { palette: string[] }).palette),
        wall: wallPalette(),
      };
      this.roofLut = colourLUT(pal, fade, step);
      this.roofLutKey = key;
    }
    const lut = this.roofLut;

    /** the `bldg` chunk and the `face` chunk that mirrors it, key for key */
    const tables: { tb: BldTable; face: Chunk | null }[] = [];
    if (this.solo) tables.push({ tb: this.solo, face: this.soloFace });
    if (z >= 1.55) {
      for (const c of this.data.visible("bldg", view)) {
        /* `base/solo` IS OF KIND `bldg`, so `visible("bldg")` yields it too and
           the solo table would be decoded, sorted and drawn TWICE — once from
           the line above and once from here. Harmless while the loop had no
           painter's order and not harmless now: a doubled roof is a doubled
           outline and a doubled wall gradient. */
        if (c.key === "base/solo") continue;
        const b = this.bldFor(c);
        /* THE FACE CHUNK IS PER CELL AND IT HAS TO BE MATCHED PER CELL.
           `face/10_10` mirrors `bldg/10_10` row for row, and the first cut read
           `base/solo-face` for every table — so a Mission house's openings were
           the published storey count, type and shop flag of whichever SOLO
           happened to share its row index. Silent, typed and wrong.
           `faceKeyFor` is a total function over the two key shapes that exist
           and returns null for anything else, because a WRONG face chunk reads
           as a plausible building and a missing one reads as fewer openings. */
        const fk = faceKeyFor(c.key);
        if (b) tables.push({ tb: b, face: fk ? this.data.get(fk) ?? null : null });
      }
    }
    if (!tables.length) return 0;

    const { ctx, W, H } = f;
    const iy = 2025;
    /* Projected px per world metre, from the one equation. At the 315° bearing
       proj() is axis-aligned, so a world metre is `cA·√2·scale` px ACROSS the
       screen and `sA·√2·scale` px DOWN it — and a metre of BUILT HEIGHT is
       neither: it is `zexb·scale`, because `projb` adds `h·ZEXB` straight to
       the plane's second coordinate. Using the down-screen factor for height
       under-reports a wall by 2.7× and silently suppresses every facade
       (`FA_MIN_DH_PX`) and every roof tray. */
    const kx = f.proj.cA * Math.SQRT2 * f.cam.scale;
    const k2 = f.proj.sA * Math.SQRT2 * f.cam.scale;
    const kh = f.proj.zexb * f.cam.scale;
    const cf = f.proj.coeffs();
    const faceOn = z >= 4.0;
    const groups = faceOn ? newFaceGroups() : null;

    /* ── PASS ONE: WHO IS IN THE FRAME, AND HOW FAR AWAY ──────────────
       One centroid projection and one screen-space reject per building, before
       a single ring vertex is touched — at block zoom that is 94 % of the city.
       What survives goes into three parallel arrays and is counting-sorted by
       depth. The sort cannot be cached per bearing the way the mock's is: the
       visible set changes as chunks arrive and as the camera moves. It is per
       RASTERISATION, which is the frame that can afford it, because a gesture
       is served from a blit of the last one. */
    let cap = 0;
    for (const { tb } of tables) cap += tb.n;
    const srcT = new Int32Array(cap);
    const srcI = new Int32Array(cap);
    const srcD = new Float32Array(cap);
    let m = 0;
    for (let ti = 0; ti < tables.length; ti++) {
      const tb = tables[ti].tb;
      for (let i = 0; i < tb.n; i++) {
        if (!drawnAsBuilding(urnd, mg, tb.gid[i], wB)) continue;
        if (tb.off[i + 1] - tb.off[i] < 3) continue;
        const hM = roofHeight(tb.h[i], tb.hf[i]);
        const zg = t.elevM(tb.cx[i], tb.cy[i]);
        const pcx = cf.ax * tb.cx[i] + cf.ay * tb.cy[i];
        const pcy =
          cf.bx * tb.cx[i] + cf.by * tb.cy[i] + zg * f.proj.zex + hM * f.proj.zexb;
        const cxs = (pcx - f.cam.cx) * f.cam.scale + W / 2;
        const cys = H / 2 - (pcy - f.cam.cy) * f.cam.scale;
        const rad = 120 * kx + hM * k2;
        if (cxs < -rad || cxs > W + rad || cys < -rad || cys > H + rad) continue;
        srcT[m] = ti;
        srcI[m] = i;
        srcD[m] = f.proj.depth(tb.cx[i], tb.cy[i]);
        m++;
      }
    }
    if (!m) return 0;
    const ord = streamOrder(srcD.subarray(0, m));
    const [dlo, dhi] = ord.range;
    const dspan = dhi - dlo || 1;

    /* ── THE HEROES, KEYED TO THEIR OWN BUCKET FLOOR ──────────────────
       See `paintHeroes`. Prepared here because the flush depths have to be
       computed against THIS frame's bucket geometry. */
    const heroQ = this.heroQueue(f, t, ord, iy);
    let hq = 0;
    const heroGids = heroQ.gids;

    /* ── THE BATCH, AND WHERE IT STOPS ────────────────────────────────
       `buildings.ts` §"One fill of a thousand subpaths" is explicit that a
       shared `Path2D` is NOT always the win: moving a NEAR building into one
       does not remove its geometry, it moves it into a path the rasteriser
       then has to resolve against a thousand overlapping subpaths, and that
       measured SLOWER — 291.5 ms → 373.2 — while the JS got cheaper.
       `NEAR_PX` = 9 is where the split sits, and it sits there because raising
       it looked like an 8x win under a broken measurement and was a regression
       under rAF counting.
       So: a building wider than NEAR_PX gets its own fill(); everything
       narrower joins a bucket keyed on its COLOUR, because one fill() carries
       one colour and the colour therefore HAS to be the batch key.
       The buckets are flushed AT EVERY DEPTH BAND and not at the end of the
       frame, because a batch that spans the whole city is a batch that has
       thrown painter's order away again. 128 bands is the mock's own number. */
    const BANDS = 128;
    const roofBatch = new Map<string, Path2D>();
    const wallBatch = new Map<string, Path2D>();
    const strokeBatch = new Map<string, Path2D>();
    let shadow: Path2D | null = null;
    const batch = (mp: Map<string, Path2D>, c: string): Path2D => {
      let p = mp.get(c);
      if (!p) { p = new Path2D(); mp.set(c, p); }
      return p;
    };
    /* ONE BAND, COMPOSITED INTO THE CITY LAYER — the shadow first, because it
       is under everything this band stands up; then the walls, the roofs and
       the outlines. A nearer band is painted after, over it, which is the
       whole of *a shadow obeys the same painter's order everything else does*. */
    const flushBand = (): void => {
      if (shadow) { fillContactShadow(f, shadow); shadow = null; }
      for (const [col, p] of wallBatch) { ctx.fillStyle = col; ctx.fill(p); }
      wallBatch.clear();
      for (const [col, p] of roofBatch) { ctx.fillStyle = col; ctx.fill(p); }
      roofBatch.clear();
      if (strokeBatch.size) {
        ctx.lineWidth = 0.7;
        for (const [col, p] of strokeBatch) { ctx.strokeStyle = col; ctx.stroke(p); }
        strokeBatch.clear();
      }
    };

    const quad = QUAD_IX;
    let bandIx = -1;
    let drawn = 0;

    ctx.save();
    ctx.lineJoin = "round";
    for (let o = 0; o < ord.order.length; o++) {
      const j = ord.order[o];
      const dpt = srcD[j];
      const bx0 = (((dhi - dpt) / dspan) * BANDS) | 0;
      if (bx0 !== bandIx) { flushBand(); bandIx = bx0; }
      /* the landmarks of this bucket, before the buildings that are nearer
         than they are and after every building in their own bucket */
      while (hq < heroQ.n && heroQ.flushD[hq] > dpt) { this.drawOneHero(f, heroQ, hq++, fade); }

      const tbe = tables[srcT[j]];
      const tb = tbe.tb;
      const i = srcI[j];
      const gid = tb.gid[i];
      if (heroGids.has(gid)) continue; // its own hero has already stood here

      const oo = tb.off[i];
      const nv = tb.off[i + 1] - oo;
      const hM = roofHeight(tb.h[i], tb.hf[i]);
      const zg = t.elevM(tb.cx[i], tb.cy[i]);

      /* Project the ring twice, base and roof, THROUGH THE COEFFICIENTS.
         `proj.coeffs()` exists for exactly this loop — "pre-projection loops
         (rings, footprints, the surround) want the coefficients, not four
         trig calls per vertex". It also matters that `projb` RETURNS A NEW
         ARRAY: at the district camera this loop runs over 87,774 buildings
         and ~880,000 vertices, so calling it twice a vertex allocates 1.8
         million two-element arrays per rasterisation. Same arithmetic, no
         allocation, one scratch pair of buffers reused across buildings. */
      const bx = ringBuf(0, nv), by = ringBuf(1, nv);
      const tx = ringBuf(2, nv), ty = ringBuf(3, nv);
      const zBase = zg * f.proj.zex;
      const dh = hM * f.proj.zexb;
      for (let k = 0; k < nv; k++) {
        const wx = tb.vxw[oo + k];
        const wy = tb.vyw[oo + k];
        const px = cf.ax * wx + cf.ay * wy;
        const pyB = cf.bx * wx + cf.by * wy + zBase;
        const sxv = (px - f.cam.cx) * f.cam.scale + W / 2;
        bx[k] = sxv;
        by[k] = H / 2 - (pyB - f.cam.cy) * f.cam.scale;
        tx[k] = sxv; // screen x carries no height: `projb` adds it to p1 only
        ty[k] = H / 2 - (pyB + dh - f.cam.cy) * f.cam.scale;
      }
      // the projected width, which is what every gate below is measured in
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < nv; k++) {
        if (tx[k] < x0) x0 = tx[k];
        if (tx[k] > x1) x1 = tx[k];
        if (ty[k] < y0) y0 = ty[k];
        if (ty[k] > y1) y1 = ty[k];
      }
      const wpx = x1 - x0;
      if (wpx < 0.35) continue;

      // ring winding, in SCREEN coordinates
      let s2 = 0;
      for (let k = 0; k < nv; k++) {
        const k1 = (k + 1) % nv;
        s2 += tx[k] * ty[k1] - tx[k1] * ty[k];
      }
      const sgn = s2 >= 0 ? 1 : -1;

      const wallCi = tb.wi[i];
      const roofCi = tb.ri[i];
      const hz = hazeIdx(f, tb.cx[i], tb.cy[i]);
      const dhPx = hM * kh;
      /* THE TINT — the ochre of new construction and the arrival ramp, off
         `colourLUT`'s own `NF1`-wide tables. `FLAG_NOYEAR` is not "1849": the
         roll dates 12,594 parcels to its own "not known", and treating those
         as a year put the Presidio in ochre in the mock's 1906 frame. A
         building the roll does not date takes tint 0 and no ochre. */
      const fi = (tb.u[i] & FLAG_NOYEAR) !== 0 ? 0 : tintIndex(iy - (1849 + tb.yr[i]), 1);
      const roofCol = lut.roofF[(roofCi * HZL + hz) * NF1 + fi] ?? "#9a9384";
      const wallO = ((wallCi * HZL + hz) * NF1 + fi) * 4;
      const near = wpx > NEAR_PX;

      /* ── THE RECT RUNG: one path call, the whole silhouette ───────────
         `RECT_SCALE` is 0.0 — "settled: the rect tier is for motion only" — so
         off a gesture this never fires and the ladder starts at `QUAD_PX`.
         The rectangle is AREA-PRESERVING and at the building's own centre:
         a bounding box would thicken every building by ~30 % of its area and
         close up the streets between them. The extrusion is only added where
         it is worth a pixel — a two-storey house projects 0.5 px of wall here,
         and adding it to every rectangle turns the fabric into a vertical
         comb. Downtown keeps its rise. */
      if (f.cam.scale < RECT_SCALE || (f.moving && f.cam.scale < QUAD_SCALE)) {
        let ar = 0;
        for (let k = 0; k < nv; k++) {
          const k1 = (k + 1) % nv;
          ar += tx[k] * ty[k1] - tx[k1] * ty[k];
        }
        const [rw, rh] = areaRect(Math.abs(ar) / 2, x1 - x0, y1 - y0);
        const ex = dhPx > 1.5 ? dhPx : 0;
        batch(roofBatch, roofCol).rect(
          (x0 + x1) * 0.5 - rw * 0.5, (y0 + y1) * 0.5 - rh * 0.5 - ex, rw, rh + ex,
        );
        drawn++;
        continue;
      }

      /* ── THE QUAD RUNG: four of the building's OWN vertices ───────────
         Not a bounding box: leftmost, topmost, rightmost, bottommost are real
         vertices of the real footprint, so the shape keeps its orientation and
         its proportions and only loses detail between those four points. At
         `QUAD_PX` = 7 px — a San Francisco lot is 25 ft of frontage — there is
         nothing between them to lose. Decided PER BUILDING and not per zoom:
         keyed on the zoom alone it cut the corners off the big ones, and a
         school or an L-shaped apartment block came out a wedge. */
      let n4 = nv;
      if (wpx < QUAD_PX) {
        extremeQuad(tx, ty, nv, quad);
        for (let k = 0; k < 4; k++) {
          const q = quad[k];
          QBX[k] = bx[q]; QBY[k] = by[q];
          QTX[k] = tx[q]; QTY[k] = ty[q];
        }
        for (let k = 0; k < 4; k++) {
          bx[k] = QBX[k]; by[k] = QBY[k]; tx[k] = QTX[k]; ty[k] = QTY[k];
        }
        n4 = 4;
      }

      /* ── THE CONTACT SHADOW ───────────────────────────────────────────
         Thrown down-LEFT from the fixed upper-right key light. Without it a
         building floats; with it the fabric has depth at 4 px, and at street
         zoom it is the single loudest mark on the frame. Gated on `h > 2` and
         on `SHADOW_MIN_PX` of projected width, both the mock's. A near
         building's own shadow goes in the same band path: it is the same
         colour, and two translucent fills that cross composite twice. */
      if (hM > 2 && wpx > SHADOW_MIN_PX) {
        const [sox, soy] = shadowOffset(hM, f.cam.scale);
        if (!shadow) shadow = new Path2D();
        addContactShadow(shadow, bx, by, n4, sox, soy);
      }

      // ── the walls, back to front is not needed: one wall faces the camera
      if (dhPx >= WALL_MIN_PX) {
        for (let k = 0; k < n4; k++) {
          const k1 = (k + 1) % n4;
          const dx = tx[k1] - tx[k];
          if (dx * sgn <= 0) continue; // turned away from the camera
          const q = n4 === nv
            ? wallQuartile(
                tb.vxw[oo + k], tb.vyw[oo + k], tb.vxw[oo + k1], tb.vyw[oo + k1],
              )
            : 1;
          const col = lut.wallF[wallO + q] ?? "#c0b49a";
          if (!near) {
            const p = batch(wallBatch, col);
            p.moveTo(bx[k], by[k]);
            p.lineTo(bx[k1], by[k1]);
            p.lineTo(tx[k1], ty[k1]);
            p.lineTo(tx[k], ty[k]);
            p.closePath();
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(bx[k], by[k]);
          ctx.lineTo(bx[k1], by[k1]);
          ctx.lineTo(tx[k1], ty[k1]);
          ctx.lineTo(tx[k], ty[k]);
          ctx.closePath();
          const topY = Math.min(ty[k], ty[k1]);
          const botY = Math.max(by[k], by[k1]);
          ctx.fillStyle =
            botY - topY > 6 ? wallGrad(ctx, topY, botY, col) : col;
          ctx.fill();

          if (groups && dhPx >= FA_MIN_DH_PX && n4 === nv) {
            this.emitFace(
              groups, tb, tbe.face, i, k, k1, bx, by, tx, ty, dhPx, q,
            );
          }
        }
      }

      // ── the roof
      if (!near) {
        const p = batch(roofBatch, roofCol);
        p.moveTo(tx[0], ty[0]);
        for (let k = 1; k < n4; k++) p.lineTo(tx[k], ty[k]);
        p.closePath();
        /* THE OUTLINE — a DARKER VALUE OF THE ROOF IT BOUNDS, at
           `EDGE_SHADE`, and it stops at `STROKE_MIN_PX_B` rather than 3. The
           same line in one fixed ink is invisible on the near-black tar roofs
           that are half of downtown and a wire on the pale stucco ones; and
           below 5 px an outline is not a division between two houses, it is an
           anti-aliased smear that greys the whole fabric. This is what the
           party-line layer left behind, and it is the thing that makes two
           neighbours of the same tone and height read as two houses. */
        if (wpx > STROKE_MIN_PX_B) {
          const st = batch(strokeBatch, inkFor(roofCol, EDGE_SHADE));
          st.moveTo(tx[0], ty[0]);
          for (let k = 1; k < n4; k++) st.lineTo(tx[k], ty[k]);
          st.closePath();
        }
        drawn++;
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(tx[0], ty[0]);
      for (let k = 1; k < n4; k++) ctx.lineTo(tx[k], ty[k]);
      ctx.closePath();
      ctx.fillStyle = roofCol;
      ctx.fill();

      if (wpx >= STROKE_MIN_PX_A) {
        ctx.strokeStyle = inkFor(roofCol, EDGE_SHADE);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // ── the coping, when the roof is worth one
      const tw = trayW(wpx);
      if (tw > 0 && n4 === nv) {
        drawTray(f, {
          bx: tx, by: ty,
          rx: subarrayOf(tb.vxw, oo, nv), ry: subarrayOf(tb.vyw, oo, nv),
          vo: 0, nv,
          outerVisible: (k) => (tx[(k + 1) % nv] - tx[k]) * sgn > 0,
          w: tw,
          k2,
          roofColour: roofCol,
        });
      }

      if (groups) {
        flushFaces(
          f, groups,
          lut.wallF[wallO + 2] ?? "#c0b49a",
          false,
        );
        resetGroups(groups);
      }
      drawn++;
    }
    // whatever is left of the near end, and every landmark nearer than it
    flushBand();
    while (hq < heroQ.n) this.drawOneHero(f, heroQ, hq++, fade);
    ctx.restore();
    void coverageAlpha;
    void skylitN;
    return drawn + heroQ.n;
  }

  /**
   * THE LANDMARK FLUSH, AND WHY IT IS THE BUCKET FLOOR AND NOT THE DEPTH.
   *
   * A hero is drawn INSIDE this stream, at its own place in painter's order,
   * over the contact shadow the fabric has already thrown and under every
   * building that really is in front of it. That is the whole anti-float
   * argument: it is not composited over the city, it IS one of the city's own
   * draw calls, and it therefore inherits the aerial fade, the depth bucket and
   * the year gate *because those are properties of the call site.*
   *
   * The flush depth is `bucketFloor` and not the hero's own depth, and
   * `buildings.ts` records the measurement that settled it: inside one of the
   * 8,192 depth buckets the buildings are in Hilbert order, not depth order, so
   * a landmark keyed to its own exact depth fires at whichever bucket-mate
   * happens to come first and the fabric then paints its roof straight back
   * over it. **Moscone kept 0 % of its pixels against 93 %.**
   *
   * The hero's building is then SKIPPED when the stream reaches it, so the
   * prism is not drawn inside the drawing that replaced it.
   *
   * Nothing here is fabricated: the eleven heroes, their 127 parts, every ring,
   * profile, material index, cut-off and tilt come out of `base/heroes`, and a
   * hero whose published year is after the year on the clock is not drawn at
   * all — the prism draws instead, which is what stood there.
   */
  private heroQueue(
    f: Frame,
    t: TerrainField,
    ord: ReturnType<typeof streamOrder>,
    iy: number,
  ): HeroQueue {
    const lm = this.landmarkTable;
    const gids = new Set<number>();
    if (!lm || !lm.heroes.length || !this.layers.heroes) {
      return { n: 0, flushD: new Float64Array(0), items: [], gids, mat: [], mats: { mats: [] } };
    }
    if (!this.heroMats) this.heroMats = heroMaterials(lm.materials);
    const items: { hero: HeroData; zg: number }[] = [];
    const fd: number[] = [];
    for (const h of lm.heroes) {
      if (iy < h.year) continue; // the prism draws — that is what stood there
      items.push({ hero: h, zg: t.elevM(h.ax, h.ay) });
      fd.push(bucketFloor(ord, f.proj.depth(h.ax, h.ay)));
      gids.add(h.bi);
    }
    const ix = items.map((_, k) => k).sort((a, b) => fd[b] - fd[a]);
    return {
      n: items.length,
      flushD: Float64Array.from(ix, (k) => fd[k]),
      items: ix.map((k) => items[k]),
      gids,
      mat: lm.materials,
      mats: this.heroMats,
    };
  }

  private drawOneHero(f: Frame, q: HeroQueue, k: number, fade: number): void {
    const it = q.items[k];
    drawHero(f, it.hero, q.mat, q.mats, it.zg, {
      fade,
      haze: HAZE,
      rise: 1,
      // the year is P5's; with no clock running everything published is there
      year: undefined,
      family: null,
    });
  }

  /**
   * One wall's openings, into the shared face groups.
   *
   * Everything about the rhythm is `facades.ts`'s: the era from the roll year,
   * the band count from `faceWeights`, the opening's height and sill from
   * `openingInBand`. **No storey height is fitted here** — `FA_NO_FITTED_
   * FLOOR_HEIGHT` — and no uncounted storey is invented: a wall whose published
   * storey count is zero gets no bands and therefore no openings.
   */
  private emitFace(
    g: ReturnType<typeof newFaceGroups>,
    tb: BldTable,
    face: Chunk | null,
    i: number,
    k: number,
    k1: number,
    bx: Float64Array,
    by: Float64Array,
    tx: Float64Array,
    ty: Float64Array,
    dhPx: number,
    q: number,
  ): void {
    const o = tb.off[i];
    const Lm = Math.hypot(
      tb.vxw[o + k1] - tb.vxw[o + k],
      tb.vyw[o + k1] - tb.vyw[o + k],
    );
    const Hm = roofHeight(tb.h[i], tb.hf[i]);
    const st2 = face ? ((face.fields.st2 as Uint8Array)[i] ?? 0) : 0;
    const storeys = storeysOf(tb.st[i], st2);
    if (storeys <= 0) return;
    const role = face ? ((face.fields.role as Uint8Array)[o + k] ?? 1) : 1;
    if (!faceTakesOpenings(role)) return;
    const w = faceWeights({
      Lm, Hm, dhPx, storeys, role,
      type: face ? ((face.fields.ty as Uint8Array)[i] ?? 0) : 0,
      era: faEra(1849 + tb.yr[i]),
      shop: face ? ((face.fields.shop as Uint8Array)[i] ?? 0) === 1 : false,
      camScale: 1,
    });
    if (w.bands <= 0 || w.opening <= 0.002) return;

    const p = faceGroupPath(g.open, q);
    faceGroupAlpha(g.aOpen, q, w.opening);
    const bandPx = dhPx / Math.max(1, w.bands);
    const openW = Math.max(1, (bx[k1] - bx[k]) / Math.max(2, Math.round(Lm / 4)));
    const cols = Math.max(1, Math.round(Lm / 4));
    for (let b = 0; b < w.bands; b++) {
      const oi = openingInBand(w.bandM, 0.62, 2.4, FA_SHOP_SILL);
      const hpx = (oi.h / Math.max(0.001, w.bandM)) * bandPx;
      const yTop = ty[k] + b * bandPx + (bandPx - hpx) * 0.45;
      for (let c = 0; c < cols; c++) {
        const u0 = (c + 0.28) / cols;
        const u1 = (c + 0.72) / cols;
        const ax = bx[k] + (bx[k1] - bx[k]) * u0;
        const bx2 = bx[k] + (bx[k1] - bx[k]) * u1;
        p.rect(Math.min(ax, bx2), yTop, Math.abs(bx2 - ax), Math.max(0.6, hpx));
      }
    }
    void openW;
    void FA_DOOR_H;
  }
}

// ═══ helpers ═══════════════════════════════════════════════════════════════

/** four scratch vertex buffers, grown on demand and reused across buildings */
const RING_BUFS: Float64Array[] = [
  new Float64Array(64), new Float64Array(64),
  new Float64Array(64), new Float64Array(64),
];
function ringBuf(i: number, n: number): Float64Array {
  if (RING_BUFS[i].length < n) RING_BUFS[i] = new Float64Array(n * 2);
  return RING_BUFS[i];
}

/** the four-extreme-vertex rung's scratch: the indices, and the quad it picks
 *  out, held aside so the ring buffers can be overwritten in place */
const QUAD_IX = new Int32Array(4);
const QBX = new Float64Array(4), QBY = new Float64Array(4);
const QTX = new Float64Array(4), QTY = new Float64Array(4);

/**
 * The `face` chunk that mirrors a `bldg` chunk, row for row.
 *
 * Exactly two key shapes exist in the catalogue — `base/solo` and `bldg/<cell>`
 * — and anything else returns null rather than a guess. A regex that only
 * rewrote the `bldg/` prefix mapped `base/solo` to ITSELF, and the loop then
 * read the building chunk's own `gid`/`cnt`/`vx` where it expected
 * `st2`/`role`. It threw on the first frame at block zoom, which is the good
 * outcome; the bad one is the version of that mistake that returns a number.
 */
function faceKeyFor(key: string): string | null {
  if (key === "base/solo") return "base/solo-face";
  if (key.startsWith("bldg/")) return "face/" + key.slice(5);
  return null;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function subarrayOf(a: Float32Array, o: number, n: number): Float32Array {
  return a.subarray(o, o + n);
}

function resetGroups(g: ReturnType<typeof newFaceGroups>): void {
  for (let i = 0; i < 4; i++) {
    g.open[i] = null;
    g.bar[i] = null;
    g.lit[i] = null;
    g.bay[i] = null;
    g.shop[i] = null;
    g.aOpen[i] = 0;
    g.aBar[i] = 0;
    g.aLit[i] = 0;
    g.aBay[i] = 0;
    g.aShop[i] = 0;
  }
}

function isLandOf(sg: SurroundGrid, i: number, j: number): boolean {
  const s = sg as SurroundGrid & { isLand?: (i: number, j: number) => boolean };
  return s.isLand ? s.isLand(i, j) : false;
}

/**
 * The frame's aerial fade, read off log z and QUANTISED TO A 64th.
 *
 * It used to be three values by `cam.step`, so a third of the whole frame's
 * depth cue changed on the single frame the band flipped — and the band flips
 * in the middle of a zoom. Continuous in z, quantised for the cache key: under
 * a 64th of a blend is not a step anybody can see, and quantising is what keeps
 * `colourLUT()` a cache hit instead of a rebuild per frame.
 */
function fadeAmt(f: Frame): number {
  const z = zOf(f.cam);
  const l = Math.log(Math.max(1, z)) / Math.log(12);
  const v = 0.17 + (0.06 - 0.17) * Math.min(1, l);
  return Math.round(v * 64) / 64;
}

/** the haze index into the colour table — 16 steps, invisible at that step */
function hazeIdx(f: Frame, x: number, y: number): number {
  const d = f.proj.depth(x, y);
  const t = Math.max(0, Math.min(1, (d + 12000) / 24000));
  return Math.max(0, Math.min(HZL - 1, Math.round((1 - t) * (HZL - 1))));
}

/**
 * The wall's step on the four-value ramp: 0 turned furthest from the key light,
 * 3 turned toward it. The light is `SUN`, and the anchor is `LAM0` — a wall
 * standing edge-on to the sun sits in the middle of the ramp.
 */
function wallQuartile(
  x0: number, y0: number, x1: number, y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  // the outward normal of a wall in plan, unit, z = 0
  const nx = dy / l;
  const ny = -dx / l;
  const lam = Math.max(0, nx * SUN[0] + ny * SUN[1]);
  const t = Math.max(0, Math.min(1, lam / Math.max(0.001, LAM0)));
  return Math.max(0, Math.min(3, Math.round(t * 3)));
}

/**
 * Flag the DEM cells a set of published rings covers.
 *
 * **ONE, NOT 255.** `TerrainField.node()` averages these over the four cells
 * meeting at a node and hands the mean to `terrainRGB` as `parkF`, a FRACTION
 * in [0,1] that weights two rows of the colour table. Writing 255 weights the
 * park row 255× and the ground comes outwhite — measured as hard white rectangles
 * scattered across Golden Gate Park, the Presidio and every playground, on the
 * first screenshot of this file.
 */
function markCells(t: TerrainField, rings: readonly Ring[], out: Uint8Array): void {
  const N = t.N;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const g0 = t.toGrid(x0, y0);
    const g1 = t.toGrid(x1, y1);
    const i0 = Math.max(0, Math.floor(g0[0]));
    const j0 = Math.max(0, Math.floor(g0[1]));
    const i1 = Math.min(N - 1, Math.ceil(g1[0]));
    const j1 = Math.min(N - 1, Math.ceil(g1[1]));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const x = t.proj.X0 + i * t.cellM;
        const y = t.proj.Y0 + j * t.cellM;
        if (inPoly(x, y, ring)) out[i * N + j] = 1;
      }
  }
}

export { HAZE, shade, drawShoreline, drawSurround, CityData, Projection };
export type { Frame, PlaceLabel };
