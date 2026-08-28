/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/surround.ts — THE LAND THAT IS NOT THE SUBJECT.

   Everything outside the city's own DEM: the headlands opposite, the county
   across the water, the peninsula running south. It carries no buildings and
   no record — the city is the subject — but it is most of the wide frame's
   edge, and without it the city floats on an empty sea.

   The Canvas renderer fills 56,330 cells of it every rasterisation, at
   226 ms for the two rasters together. Here it is one mesh.

   ── THE COLOUR IS THE CANVAS RENDERER'S, ARITHMETIC FOR ARITHMETIC ────────
   `rasteriseSurround`'s own node function: a hypsometric tint from the cell's
   elevation, `skylitN` at `reliefK(lam) * XBASE_K`, then the aerial haze at
   that node's distance. Every constant below is read from `lib/city/terrain`
   rather than copied, so when that file's dials move — and they did, the
   night before this port started — both renderers move together.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
} from "three";

/**
 * How far a regional node's tone may wander — DECLARED.
 *
 * Wide enough that a square kilometre of distant land is not one flat value,
 * narrow enough that it reads as ground rather than as noise.
 */
const SURROUND_MOTTLE = 0.085;

/** a deterministic tone factor for one regional node, from its index */
function surroundMottle(k: number): number {
  let h = Math.imul(k | 0, 0x9e3779b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  const v = ((h >>> 8) & 1023) / 511.5 - 1;
  return 1 + v * SURROUND_MOTTLE;
}

import type { CityData } from "@/lib/city/data";
import {
  HAZE,
  QF,
  XBASE_K,
  XLC,
  buildSurroundLam,
  reliefK,
  skylitN,
  tiltOf,
  type TerrainField,
} from "@/lib/city/terrain";
import { rasteriseRings, type Ring } from "../coast-mask";
import type { CityLayer } from "../engine";

/** the hypsometric pair `rasteriseSurround` interpolates between */
const LOW = [0xec, 0xe5, 0xd6] as const;
const HIGH = [0xcf, 0xc3, 0xab] as const;
const TINT_ZMAX = 300;

/**
 * ── WHAT IS GROWING OUT THERE, PER CELL ────────────────────────────────────
 *
 * `base/surround-landcover` — the fraction of every surround cell that is each
 * of eight land cover families, reduced from NLCD 2021 at 30 m by
 * `build_surround_landcover.py`. One byte a family, 255 = the whole cell.
 *
 * **The eight need not sum to 255.** The remainder is the part of the cell
 * NLCD does not cover, which here is open Pacific beyond the L48 land
 * boundary, and a cell summing to zero is NOT KNOWN — those keep the
 * elevation tint rather than being given a colour to fill the hole.
 */
export interface SurroundLandcover {
  w: number;
  h: number;
  /** `(j * w + i) * 8 + family`, a fraction byte */
  f: Uint8Array;
  /** the same cover at NLCD's own 30 m grain: one family INDEX a sample,
   *  255 where it does not cover. Absent on a city that publishes none. */
  fine?: { w: number; h: number; c: Uint8Array } | null;
}

/**
 * ── HOW FAR THE SUB-CELL TINT MAY SWING, AND WHY IT NEEDS HEADROOM ────────
 *
 * three.js multiplies `map` INTO the vertex colour, and a texture byte cannot
 * exceed 1. A tint that may only ever darken is not a tint, it is a stain: the
 * whole region would sink every time the cover disagreed with its cell.
 *
 * So the texture carries `ratio / 2` and the vertex colours are multiplied by
 * 2 to match. Their product is unchanged wherever the ratio is 1 — which is
 * everywhere the fine cover agrees with its cell average, and everywhere there
 * is no cover at all — and a sample may now go up to twice its cell as well as
 * down. The 2 is a range, not a strength: nothing is brightened by choosing it.
 */
const LC_TEX_HEADROOM = 2;

/** the eight family colours as numbers, resolved once from the palette */
const LC_RGB: readonly (readonly [number, number, number])[] = XLC.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
] as const);

/** a city with no land cover file draws the elevation tint, which is not an error */
export async function loadSurroundLandcover(
  base: string,
): Promise<SurroundLandcover | null> {
  try {
    const [mr, br] = await Promise.all([
      fetch(`${base}/base/surround-landcover.json`),
      fetch(`${base}/base/surround-landcover.bin`),
    ]);
    if (!mr.ok || !br.ok) return null;
    const meta = (await mr.json()) as {
      w: number;
      h: number;
      families: string[];
      fine?: { file: string; w: number; h: number };
    };
    const f = new Uint8Array(await br.arrayBuffer());
    if (meta.families.length !== LC_RGB.length) return null;
    if (f.length !== meta.w * meta.h * LC_RGB.length) return null;

    /* the 30 m raster is optional and its absence is not an error: without it
       the cover is still drawn, just at the mesh's own 110 m cell */
    let fine: { w: number; h: number; c: Uint8Array } | null = null;
    if (meta.fine) {
      try {
        const fr = await fetch(`${base}/base/${meta.fine.file}`);
        if (fr.ok) {
          const c = new Uint8Array(await fr.arrayBuffer());
          if (c.length === meta.fine.w * meta.fine.h) {
            fine = { w: meta.fine.w, h: meta.fine.h, c };
          }
        }
      } catch {
        fine = null;
      }
    }
    return { w: meta.w, h: meta.h, f, fine };
  } catch {
    return null;
  }
}

/**
 * ── THE FAR SHORE IS CUT AT THE PUBLISHED LINE, AND A CELL CUT DID NOT DO IT ──
 *
 * `part3.html` §4426 sets ONE clip for the whole surround at the published
 * regional shoreline and draws every cell inside it. Without it the far shore
 * is the 110.01 x 139.15 m cell lattice — *"a staircase whose tread is longer
 * than a San Francisco block, on the two edges of the frame the eye reads as
 * the horizon"* — and, worse than ugly, it is BIGGER than the land: every
 * coastal cell whose centre is land paints its whole 110 x 139 m, so a
 * headland grows by up to a cell in every direction.
 *
 * The first port of that clip dropped a CELL whose centre fell outside the
 * rings, on the reasoning that a mesh cannot clip with a path. MEASURED, it
 * removed **26 cells of 56,330** and changed nothing on screen — and it could
 * not have, because those same rings are what the shipped land mask was
 * rasterised FROM, by the same centre test. A cell cut and a cell mask that
 * agree by construction cannot disagree about a coastline: the staircase
 * survived intact and the headlands stayed half a cell too big.
 *
 * So the cut is per SUB-cell, `coast-mask.ts`, at the same K the city's ground
 * uses. A cell wholly inside keeps its quad, a cell the line crosses is
 * rebuilt as sub-quads, and the tread goes from 110 x 139 m to 18.3 x 23.2 m —
 * from ten screen pixels at the whole-city camera to under two.
 */

/** sub-cells a side on a refined coastal cell — `terrain.ts` §THE COAST */
const COAST_K = 6;

export interface SurroundStats {
  cells: number;
  whole: number;
  refined: number;
  dropped: number;
  areaCells: number;
  areaBuilt: number;
  /** nodes the join blend touched, of `(XW + 1) * (XH + 1)` — see §THE JOIN */
  seamNodes: number;
}

export function surroundLayer(
  data: CityData,
  field: TerrainField,
  zexByStep: readonly number[],
  clip?: readonly Ring[] | null,
  landcover?: SurroundLandcover | null,
): (CityLayer & { mesh: Mesh; surroundStats(): SurroundStats }) | null {
  const sd = data.surround();
  if (!sd) return null;
  const s = sd; // narrowed once, so the closures below do not have to re-test

  const XW = s.XW;
  const XH = s.XH;
  const XNW = XW + 1;
  const XNH = XH + 1;
  const BASE = XNW * XNH;

  /** the land cover, if the city published any — see §WHAT IS GROWING */
  const lc = landcover && landcover.w === XW && landcover.h === XH ? landcover : null;
  const NLC = LC_RGB.length;

  const hz = [
    parseInt(HAZE.slice(1, 3), 16),
    parseInt(HAZE.slice(3, 5), 16),
    parseInt(HAZE.slice(5, 7), 16),
  ];

  // ── positions: one vertex a node, elevation in REAL metres ───────────────
  const basePos = new Float32Array(BASE * 3);
  for (let j = 0; j < XNH; j++) {
    for (let i = 0; i < XNW; i++) {
      const ii = Math.min(i, XW - 1);
      const jj = Math.min(j, XH - 1);
      const o = (j * XNW + i) * 3;
      basePos[o] = s.mx[i];
      basePos[o + 1] = s.z(ii, jj);
      basePos[o + 2] = s.my[j];
    }
  }

  /* ── THE CELLS THE SURROUND OWNS ────────────────────────────────────────
     `isOwn` is the encoder's own bit for "this cell is the surround's to
     paint" — the city's own DEM covers the rest and is drawn at 53.8 m
     instead of 110 x 139 m. Water is skipped here and left to the bay: the
     Canvas path paints those cells only under a coastline clip, which a mesh
     does not have and does not need, because the bay is a surface under it
     rather than a plate over it. */
  const rings = clip && clip.length ? clip : null;
  const mask = rings
    ? rasteriseRings(
        [rings],
        {
          x0: s.mx[0],
          y0: s.my[0],
          nx: XW,
          ny: XH,
          cellW: s.cellW,
          cellH: s.cellH,
        },
        COAST_K,
      )
    : null;

  /* the sub-vertices, described rather than stored twice — `terrain.ts`
     §THE SUB-VERTICES carries the argument */
  const exi: number[] = [];
  const exj: number[] = [];
  const exu: number[] = [];
  const exv: number[] = [];

  const idx: number[] = [];
  const KK = COAST_K * COAST_K;
  let cells = 0;
  let whole = 0;
  let refined = 0;
  let dropped = 0;
  let subKept = 0;
  {
    const slotN = (COAST_K + 1) * (COAST_K + 1);
    const slot = new Int32Array(slotN);
    const slotGen = new Int32Array(slotN);
    let gen = 0;
    for (let j = 0; j < XH; j++) {
      for (let i = 0; i < XW; i++) {
        if (!s.isOwn(i, j) || !s.isLand(i, j)) continue;
        cells++;
        const a = j * XNW + i;
        const b = j * XNW + (i + 1);
        const c = (j + 1) * XNW + (i + 1);
        const d = (j + 1) * XNW + i;
        const n = mask ? mask.countIn(i, j) : KK;
        if (n === KK) {
          whole++;
          subKept += KK;
          idx.push(a, b, c, a, c, d);
          continue;
        }
        if (n === 0) {
          dropped++;
          continue;
        }
        refined++;
        gen++;
        const vert = (su: number, sv: number): number => {
          if (su === 0 && sv === 0) return a;
          if (su === COAST_K && sv === 0) return b;
          if (su === COAST_K && sv === COAST_K) return c;
          if (su === 0 && sv === COAST_K) return d;
          const k = sv * (COAST_K + 1) + su;
          if (slotGen[k] === gen) return slot[k];
          const v = BASE + exi.length;
          exi.push(i);
          exj.push(j);
          exu.push(su / COAST_K);
          exv.push(sv / COAST_K);
          slot[k] = v;
          slotGen[k] = gen;
          return v;
        };
        for (let sj = 0; sj < COAST_K; sj++) {
          for (let si = 0; si < COAST_K; si++) {
            if (!mask || !mask.at(i, j, si, sj)) continue;
            subKept++;
            const p0 = vert(si, sj);
            const p1 = vert(si + 1, sj);
            const p2 = vert(si + 1, sj + 1);
            const p3 = vert(si, sj + 1);
            idx.push(p0, p1, p2, p0, p2, p3);
          }
        }
      }
    }
  }

  const E = exi.length;
  const pos = new Float32Array((BASE + E) * 3);
  pos.set(basePos);
  for (let e = 0; e < E; e++) {
    const i = exi[e];
    const j = exj[e];
    const u = exu[e];
    const v = exv[e];
    const a = (j * XNW + i) * 3;
    const b = (j * XNW + i + 1) * 3;
    const c = ((j + 1) * XNW + i + 1) * 3;
    const d = ((j + 1) * XNW + i) * 3;
    const o = (BASE + e) * 3;
    for (let ch = 0; ch < 3; ch++) {
      pos[o + ch] =
        (basePos[a + ch] * (1 - u) + basePos[b + ch] * u) * (1 - v) +
        (basePos[d + ch] * (1 - u) + basePos[c + ch] * u) * v;
    }
  }

/* ── THE JOIN IS NOT A THING TO ANNOUNCE ──────────────────────────────────
   The city's DEM is a square and the land does not stop at its corner: the
   southern suburbs run off the bottom of it and the surround picks them up on
   the far side of a ruler-straight line. Both meshes are drawn correctly and
   the line between them is still the most conspicuous edge in the lower half
   of the whole-city frame, because the two rasters DO NOT SHARE A COLOUR
   MODEL. The city's ground is `terrainRGB` — a photographed, tinted,
   park-marked fabric; the surround's is a hypsometric ramp between two creams.

   MEASURED at the join, ground layers only, at eight points along it:
   the city reads (196, 204, 205) and the surround (191-223, 181-209,
   164-189). In luminance they are within a few points of each other, which is
   why turning either up or down does not help — the gap is HUE. Red minus
   blue is -9 on the city side and +28 to +34 on the surround side, a 40-point
   step across one cell edge, and that is the line.

   So the surround is carried to the city's own value where they meet. Every
   node within `SEAM_M` of a city LAND cell takes that cell's published colour
   in proportion to how near it is, full strength on the boundary itself. It
   is a blend of two PUBLISHED colours and invents no third one: at the join
   the far shore is the near shore's tone, and 900 m out it is entirely its
   own again.

   900 m is nine surround cells and it is DECLARED. Shorter and the ramp is
   itself an edge; longer and a visible band of the far shore is wearing the
   city's fabric tone, which is a different lie from the one being fixed.

   ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────
   It does not touch the GEOMETRY of the join — the two lattices still meet at
   53.8 m against 110 x 139 m and their elevations differ by a metre or two at
   the line. At the whole-city camera, where this seam is visible at all, that
   is under a pixel. And it reads the band-0 field for every band, because the
   join is 7 km from downtown and no band but the widest has it in frame. */
const SEAM_M = 900;

  const out = new Float64Array(3);
  const cc = new Color();

  /* ── THE NEAREST CITY LAND, FOR EVERY POINT NEAR THE SQUARE ────────────
     A vector distance transform on the CITY's own grid, padded by the band so
     a surround node just outside the square still finds its way back in. Two
     chamfer sweeps carrying the OFFSET to the nearest land cell rather than
     only its distance, because the blend needs that cell's colour and not
     just how far away it is. 294 x 294 cells, built once. */
  const cProj = field.proj;
  const cN = field.N;
  const cM = field.cellM;
  const PAD = Math.ceil(SEAM_M / cM) + 1;
  const PW = cN + 2 * PAD;
  const FAR = 1e9;
  const dsq = new Float64Array(PW * PW).fill(FAR);
  const offI = new Int16Array(PW * PW);
  const offJ = new Int16Array(PW * PW);
  for (let i = 0; i < cN - 1; i++) {
    for (let j = 0; j < cN - 1; j++) {
      if (!field.maskAt(i, j)) continue;
      const k = (j + PAD) * PW + (i + PAD);
      dsq[k] = 0;
      offI[k] = 0;
      offJ[k] = 0;
    }
  }
  const relax = (k: number, kk: number, di: number, dj: number): void => {
    if (dsq[kk] >= FAR) return;
    const ni = offI[kk] + di;
    const nj = offJ[kk] + dj;
    const v = ni * ni + nj * nj;
    if (v < dsq[k]) {
      dsq[k] = v;
      offI[k] = ni;
      offJ[k] = nj;
    }
  };
  for (let j = 1; j < PW; j++) {
    for (let i = 1; i < PW - 1; i++) {
      const k = j * PW + i;
      if (dsq[k] === 0) continue;
      relax(k, k - 1, 1, 0);
      relax(k, k - PW, 0, 1);
      relax(k, k - PW - 1, 1, 1);
      relax(k, k - PW + 1, -1, 1);
    }
  }
  for (let j = PW - 2; j >= 0; j--) {
    for (let i = PW - 2; i >= 1; i--) {
      const k = j * PW + i;
      if (dsq[k] === 0) continue;
      relax(k, k + 1, -1, 0);
      relax(k, k + PW, 0, -1);
      relax(k, k + PW + 1, -1, -1);
      relax(k, k + PW - 1, 1, -1);
    }
  }

  /** the seam blend at a world point: [weight, city node index] or null */
  function seamAt(x: number, y: number): [number, number] | null {
    const gi = Math.round((x - cProj.X0) / cM) + PAD;
    const gj = Math.round((y - cProj.Y0) / cM) + PAD;
    if (gi < 0 || gj < 0 || gi >= PW || gj >= PW) return null;
    const k = gj * PW + gi;
    if (dsq[k] >= FAR) return null;
    const d = Math.sqrt(dsq[k]) * cM;
    if (d >= SEAM_M) return null;
    const ci = gi - PAD + offI[k];
    const cj = gj - PAD + offJ[k];
    if (ci < 0 || cj < 0 || ci >= cN || cj >= cN) return null;
    const t = 1 - d / SEAM_M;
    // smoothstep, so neither end of the ramp is itself an edge
    return [t * t * (3 - 2 * t), field.node(ci, cj, 0)];
  }

  let seamNodes = 0;
  const colours = new Map<number, Float32Array>();
  function coloursFor(step: number): Float32Array {
    let col = colours.get(step);
    if (col) return col;
    const zex = zexByStep[step] ?? zexByStep[0];
    seamNodes = 0;
    const lam = buildSurroundLam(XW, XH, s.z, s.cellW, s.cellH, zex);
    col = new Float32Array((BASE + E) * 3);
    for (let j = 0; j < XNH; j++) {
      for (let i = 0; i < XNW; i++) {
        const ii = Math.min(i, XW - 1);
        const jj = Math.min(j, XH - 1);
        const za = s.z(ii, jj);
        const l = lam[jj * XW + ii];
        const tt = Math.min(1, Math.pow(za / TINT_ZMAX, 0.8));
        let R0 = LOW[0] + (HIGH[0] - LOW[0]) * tt;
        let G0 = LOW[1] + (HIGH[1] - LOW[1]) * tt;
        let B0 = LOW[2] + (HIGH[2] - LOW[2]) * tt;
        /* ── AND WHERE IT IS KNOWN, WHAT IS ACTUALLY GROWING THERE ───────
           The lerp above reads ONE quantity, the cell's elevation, and no
           elevation can tell a reservoir from a subdivision from a redwood
           hillside. `base/surround-landcover` can: it carries the fraction of
           this cell that is each of eight families, so the base tone becomes
           those colours blended by those fractions.

           It is a REPLACEMENT of the guess and not a wash over it, but only
           to the extent the cell is covered — `cov` is the fraction NLCD
           knows, so a cell it does not cover keeps the elevation tint whole
           and a half-covered coastal cell keeps half of it. Nothing invents a
           colour for ground the source is silent about.

           Everything after this point — the relief, the haze, the city seam,
           the mottle — is unchanged and still runs on top. */
        if (lc) {
          const b = (jj * lc.w + ii) * NLC;
          let cov = 0;
          let LR = 0;
          let LG = 0;
          let LB = 0;
          for (let k = 0; k < NLC; k++) {
            const fr = lc.f[b + k];
            if (!fr) continue;
            cov += fr;
            LR += LC_RGB[k][0] * fr;
            LG += LC_RGB[k][1] * fr;
            LB += LC_RGB[k][2] * fr;
          }
          if (cov > 0) {
            const w = Math.min(1, cov / 255);
            R0 += (LR / cov - R0) * w;
            G0 += (LG / cov - G0) * w;
            B0 += (LB / cov - B0) * w;
          }
        }
        const lamK = (QF.relief ? reliefK(l) : 0.9 + 0.15 * l) * (QF.xlam ? XBASE_K : 1);
        skylitN(R0, G0, B0, lamK, tiltOf(l), out);
        const h = field.hazeAt(s.mx[i], s.my[j]);
        const o = (j * XNW + i) * 3;
        let R = out[0] + (hz[0] - out[0]) * h;
        let G = out[1] + (hz[1] - out[1]) * h;
        let B = out[2] + (hz[2] - out[2]) * h;
        // and the join takes the city's own published tone — see §THE JOIN
        const sm = seamAt(s.mx[i], s.my[j]);
        if (sm) {
          const w = sm[0];
          const k = sm[1];
          R += (field.nodeR(k) - R) * w;
          G += (field.nodeG(k) - G) * w;
          B += (field.nodeB(k) - B) * w;
          seamNodes++;
        }
        /* ── AND A MOTTLE, BECAUSE THIS LAND WAS ONE FLAT COLOUR ─────────
           Reported from the page: *"some areas now look just like someone put
           a color and thats it theres no detail, no texture nothing."* That is
           exactly what the regional land was — a hillshade over 110 x 139 m
           cells and nothing else, which on gently sloped distant ground is
           one tone across whole square kilometres.

           A detail NORMAL map was built for this first, from real 3DEP over
           the regional frame, and measured: it moves 0.57 % of the frame even
           at nine times its honest strength. Shading is not the lever here —
           this land is lit nearly head-on and its problem is that its COLOUR
           does not vary. So the fix is the one that worked on the city's own
           ground in `city/terrain.ts` §ONE GREEN FOR EVERY TREED CELL: vary
           the colour itself, deterministically in the node's own index so a
           rebuild puts every node back.

           Declared, and it is not a claim about any square metre — the same
           status as the canopy mottle and the wall palette. */
        const mj = surroundMottle(i * XNH + j);
        R *= mj;
        G *= mj;
        B *= mj;
        // sRGB in, linear out — see `terrain.ts` §sRGB IN, LINEAR OUT
        cc.setRGB(R / 255, G / 255, B / 255, SRGBColorSpace);
        col[o] = cc.r * COLK;
        col[o + 1] = cc.g * COLK;
        col[o + 2] = cc.b * COLK;
      }
    }
    for (let e = 0; e < E; e++) {
      const i = exi[e];
      const j = exj[e];
      const u = exu[e];
      const v = exv[e];
      const a = (j * XNW + i) * 3;
      const b = (j * XNW + i + 1) * 3;
      const c = ((j + 1) * XNW + i + 1) * 3;
      const d = ((j + 1) * XNW + i) * 3;
      const o = (BASE + e) * 3;
      for (let ch = 0; ch < 3; ch++) {
        col[o + ch] =
          (col[a + ch] * (1 - u) + col[b + ch] * u) * (1 - v) +
          (col[d + ch] * (1 - u) + col[c + ch] * u) * v;
      }
    }
    colours.set(step, col);
    return col;
  }

  /* ── THE SAME COVER AGAIN, UNDER THE CELL ───────────────────────────────
     The vertex colours above give every 110 x 139 m cell the blend of what
     grows in it. That is real and it is still an AVERAGE: NLCD's grain is
     30 m, so a cell throws away a 4 x 4 patch of what it knows, and a cell
     average is the "someone put a color" problem one step smaller.

     The mesh carries a uv, so the finer grain arrives as a texture instead of
     as sixteen times the geometry. What the texture holds is not a colour but
     a RATIO — this sample's cover against its own cell's blend — so it is
     neutral wherever the two agree and it cannot fight the vertex colours,
     which keep on carrying the relief, the haze, the seam and the mottle.

     Two things damp it, and both are the honest kind. `w` is how much of the
     cell NLCD covers at all, so a half-covered coastal cell gets half the
     swing and an uncovered one gets none. `1 - h` is the aerial haze: the
     vertex colour at that node is already a lerp toward the haze, and past it
     the cover has no business asserting itself, which is why Marin's texture
     correctly says less than the peninsula's. */
  const s2l = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const LC_LIN = LC_RGB.map(
    (c) => [s2l(c[0] / 255), s2l(c[1] / 255), s2l(c[2] / 255)] as const,
  );

  function landcoverTint(): DataTexture | null {
    const fine = lc?.fine;
    if (!lc || !fine) return null;
    const mult = fine.w / lc.w;
    if (!Number.isInteger(mult) || fine.h / lc.h !== mult) return null;

    const data = new Uint8Array(fine.w * fine.h * 4);
    const cell = [0, 0, 0];
    for (let j = 0; j < lc.h; j++) {
      for (let i = 0; i < lc.w; i++) {
        const b = (j * lc.w + i) * NLC;
        let cov = 0;
        let CR = 0;
        let CG = 0;
        let CB = 0;
        for (let k = 0; k < NLC; k++) {
          const fr = lc.f[b + k];
          if (!fr) continue;
          cov += fr;
          CR += LC_RGB[k][0] * fr;
          CG += LC_RGB[k][1] * fr;
          CB += LC_RGB[k][2] * fr;
        }
        /* how far this cell's cover may speak at all */
        const say =
          cov > 0
            ? Math.min(1, cov / 255) * (1 - field.hazeAt(s.mx[i], s.my[j]))
            : 0;
        if (cov > 0) {
          cell[0] = s2l(CR / cov / 255);
          cell[1] = s2l(CG / cov / 255);
          cell[2] = s2l(CB / cov / 255);
        }
        for (let dj = 0; dj < mult; dj++) {
          for (let di = 0; di < mult; di++) {
            const fx = i * mult + di;
            const fy = j * mult + dj;
            const k = fine.c[fy * fine.w + fx];
            const o = (fy * fine.w + fx) * 4;
            for (let ch = 0; ch < 3; ch++) {
              let r = 1;
              if (say > 0 && k < NLC && cell[ch] > 1e-6) {
                r = 1 + (LC_LIN[k][ch] / cell[ch] - 1) * say;
              }
              const q = Math.min(1, Math.max(0, r / LC_TEX_HEADROOM));
              data[o + ch] = Math.round(q * 255);
            }
            data[o + 3] = 255;
          }
        }
      }
    }
    const t = new DataTexture(data, fine.w, fine.h, RGBAFormat);
    /* a RATIO, not a colour: no transfer function belongs on it */
    t.colorSpace = NoColorSpace;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }

  const tintTex = landcoverTint();
  /** the vertex colours' half of §HOW FAR THE SUB-CELL TINT MAY SWING */
  const COLK = tintTex ? LC_TEX_HEADROOM : 1;

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  /* ── UV OVER THE SURROUND'S OWN FRAME, FOR THE DETAIL NORMAL ──────────
     The regional land is a regular grid in world X/Z like the city's ground,
     so its UV is its own position rescaled — no unwrap and no seam. */
  {
    /* `mx`/`my` are the NODE coordinates, so the span is first to last —
       not `mx[1] - mx[0]`, which is one cell. */
    const spanX = s.mx[s.mx.length - 1] - s.mx[0];
    const spanY = s.my[s.my.length - 1] - s.my[0];
    const nv = (pos.length / 3) | 0;
    const uv = new Float32Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      uv[v * 2] = (pos[v * 3] - s.mx[0]) / spanX;
      uv[v * 2 + 1] = (pos[v * 3 + 2] - s.my[0]) / spanY;
    }
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  }
  g.setAttribute("color", new BufferAttribute(coloursFor(0), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  /* NORMALS, OR THE HEADLANDS ARE BLACK. A Lambert material with no `normal`
     attribute lights every face by the zero vector, which is no light at all
     — Marin, the East Bay and the peninsula came out solid black while the
     city beside them was lit (shots/gl-block0.png). The city's own terrain
     had `computeVertexNormals`; this did not. */
  /* ── THE GROUND'S NORMALS POINT STRAIGHT UP, ON PURPOSE ────────────────
     The vertex colours ALREADY carry a hillshade — a hand-tuned one, off the
     full-resolution DEM, with the project's own sun in it. Give this mesh its
     true normals and a directional light and the frame gets a SECOND
     hillshade over the first: same direction, compounding contrast, and the
     city comes back olive and waxy, like a satellite render.

     With every normal straight up the sun's diffuse term is CONSTANT across
     the ground, so it adds no shading of its own — and the one thing it does
     add is the thing a hillshade cannot: the SHADOW a building or a ridge
     throws across it. That is the whole reason the sun is here. The relief
     you see is still the published DEM's; it is just drawn once instead of
     twice.

     Buildings keep their real normals — they have no baked shading and every
     facet needs its own. */
  const up = new Float32Array((BASE + E) * 3);
  for (let v = 0; v < BASE + E; v++) up[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(up, 3));
  g.computeBoundingSphere();

  /* ── THE SURROUND IS A BACKDROP, NOT A PARTICIPANT IN THE DEPTH BUFFER ──
     This is the difference between a painter and a depth test, and it cost a
     large piece of the city.

     The Canvas renderer rasterises the surround FIRST and then draws the city
     over it. Order settles it, and the surround can never occlude the subject.
     A depth buffer does not work that way: it asks which surface is nearer the
     camera, and in an axonometric projection two points far apart in the world
     can land on the same pixel. San Bruno Mountain rises 400 m some kilometres
     south of Bayview, so it is genuinely NEARER the camera than the flat land
     at Hunters Point — and the GPU, being correct about that, painted the
     mountain over the neighbourhood. Hiding this one mesh brought back
     Bayview's blocks, streets and parks intact underneath: measured, the
     surround owns 56,330 cells and just NINE of them sit over a city land
     cell, so the overlap was never in the world. It was on the screen.

     `depthWrite: false` with a renderOrder before everything restores the
     painter's model exactly: the surround lays down colour and no depth, and
     every published thing after it draws over it unconditionally.

     Its own self-occlusion goes with it — a far ridge can now paint over a
     near one — and at 110 x 139 m cells of distant, gently sloped land seen
     from this camera height, that is not visible. If it ever is, the fix is to
     emit the cells back-to-front for the fixed 315-degree bearing rather than
     to give the depth buffer back a mesh that has no business in it. */
  const m = new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
    depthWrite: false,
    map: tintTex,
  });

  const mesh = new Mesh(g, m);
  mesh.renderOrder = -3;
  mesh.receiveShadow = true;

  let curStep = -1;
  const cellA = s.cellW * s.cellH;
  const stats: SurroundStats = {
    cells,
    whole,
    refined,
    dropped,
    areaCells: cells * cellA,
    areaBuilt: (subKept / KK) * cellA,
    get seamNodes() {
      return seamNodes;
    },
  };

  return {
    name: "surround",
    mesh,
    surroundStats: () => stats,
    onStep(step: number, zex: number) {
      if (step === curStep) return;
      curStep = step;
      mesh.scale.y = zex;
      g.setAttribute("color", new BufferAttribute(coloursFor(step), 3));
      (g.getAttribute("color") as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      g.dispose();
      m.dispose();
      tintTex?.dispose();
      colours.clear();
    },
  };
}
