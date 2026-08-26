/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/street-detail.ts — WHAT IS DRAWN *ON* THE STREET.

   `streets.ts` fills the two published polygons: the right of way, and the
   carriageway inside it. Everything else the street file publishes about a
   street is a LINE or a small ring — the kerb, the refuge, the stair run,
   the centreline — and none of it is drawn by that layer because none of it
   is a fill.

   ── WHY A LINE IS THE HARD CASE ON A GPU ─────────────────────────────────
   A 2D context strokes: it takes a path and a `lineWidth` in PIXELS and the
   rasteriser does the rest. A GPU has no such primitive. `THREE.Line` takes
   a `linewidth` and the core profile of every desktop driver IGNORES it, so
   a kerb asked for at 1.5 px arrives at 1 px, on every machine, for ever.

   So every line in this file is GEOMETRY: a quad strip laid on the ground,
   a width in WORLD METRES rather than in pixels. That is not a workaround,
   it is the honest form — a kerb is a thing of a certain width standing in a
   certain place, and drawing it that way means it thickens as a reader zooms
   in, which is what a kerb does.

   It also means this layer does NOT do the wide shot. A 0.4 m strip is a
   third of a pixel at district zoom and there is no setting of the constant
   that changes that without drawing a kerb four metres wide. The wide-shot
   network is a screen-space job and stays where it is.

   ── THE KERB IS A PUBLISHED BIT, AND ONLY HALF THE EDGES CARRY IT ────────
   `rdKerb` is one bit per ROADWAY VERTEX: is the edge leaving this vertex a
   published kerb, or is it the outer edge of the right of way that the
   roadway ring happens to run along? 1,961.6 km of the first, 1,768.9 km of
   the second. Stroking the whole roadway ring would draw a kerb down the far
   side of every right of way, which is a property line and not a kerb. So
   `isKerbEdge` gates every quad, and the bit is read through the Canvas
   module's own accessor rather than re-derived here.

   ── THE ISLANDS AND THE STAIRS SHIPPED AND DREW NOTHING ──────────────────
   `base/street-misc` has carried 1,120 island rings and 268 stair runs since
   Block B4 and `CityData` has decoded them since B6. The Canvas layer draws
   both; this one does the same from the same arrays, with the same tones and
   the same two declared stair numbers (`ST_STAIR_BAND_M`, `ST_STAIR_TICK_M`,
   an honest global treatment declared as one — the register publishes a
   stair's RUN and neither a width nor a tread count).

   ── NOTHING HERE IS LIFTED OFF THE GROUND ────────────────────────────────
   `ST_LINE_LIFT_M` — the 0.8 m the Canvas raises a centreline off the DEM
   before it projects it — is deliberately NOT used. It is that renderer's
   answer to the same problem this one solves with `polygonOffset`, and in an
   axonometric projection a height is also a SCREEN DISPLACEMENT: 0.8 m of
   lift slides the line up-screen off its own street, which is far more
   visible than the z-fight it was avoiding. `streets.ts` states this for the
   carriageway; it is the same trap and the same answer.

   The depth stack this layer joins, back to front:

       4   right of way      streets.ts
       2   carriageway       streets.ts
       1   island fill, stair band
       0   centreline spine
      -1   kerb, island edge, stair treads
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
} from "three";

import type { CityData } from "@/lib/city/data";
import {
  isKerbEdge,
  ST_C_FOOT,
  ST_C_KERB,
  ST_C_ROAD,
  ST_LINE_INK,
  ST_STAIR_BAND_M,
  ST_STAIR_TICK_M,
  streetCellOf,
} from "@/lib/city/streets";
import type { CityLayer } from "../engine";

export interface StreetDetailLayerOptions {
  elevAt: (x: number, y: number) => number;
  /** the ground's exaggeration — everything here lies ON the ground */
  zex: number;
}

/**
 * THE ONE NUMBER IN THIS FILE THAT IS NOT PUBLISHED.
 *
 * A kerb and a centreline both have a place in the record and NO WIDTH in
 * it: `street_kerb` publishes the line the kerb runs along, `3psu-pn9h`
 * publishes the centreline's geometry, and neither says how wide to draw it.
 * Something has to be declared, so ONE fraction is declared and it is applied
 * to the city's OWN published medians rather than to a metre count written
 * here — `manifest.streets.stats.fw_p50` for the kerb, which divides the
 * carriageway from the footway and is therefore a footway-scale mark, and
 * `w_p50` for the spine, which runs down the middle of a right of way.
 *
 * A twelfth. On this city's medians that is a 0.38 m kerb and a 2.5 m spine —
 * the order of a real kerb-and-gutter edge and of a lane marking — and on a
 * city with wider or narrower streets it moves with them, which a metre count
 * written here could not do.
 */
const INK_FRAC = 0.12;

/**
 * What the two widths fall back to where a manifest publishes no street
 * medians at all. A nominal street and a nominal footway, so that a city
 * whose manifest is silent draws something rather than nothing; every city
 * that publishes its own stats overrides both on the first line that reads
 * them.
 */
const NOMINAL_ROW_M = 20;
const NOMINAL_FOOT_M = 3;

/** `ringIndex` in `streets.ts`: rings-per-feature + lengths → flat offsets */
function ringIndex(n: number, per: Uint8Array, len: Uint16Array): { off: Uint32Array; fo: Uint32Array } {
  const fo = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) fo[i + 1] = fo[i] + per[i];
  const R = fo[n];
  const off = new Uint32Array(R + 1);
  for (let r = 0; r < R; r++) off[r + 1] = off[r] + len[r];
  return { off, fo };
}

/**
 * One ring → triangles. The same ear clip `streets.ts` uses on a right of
 * way, on a refuge instead, and with the same trap: `triangulateShape` strips
 * a duplicated end point with `points[l - 1].equals(...)`, so the contour has
 * to be REAL `Vector2`s. A `{ x, y }` cast compiles and throws at runtime on
 * a method the value does not have.
 */
function ringTris(
  x: Float32Array,
  y: Float32Array,
  from: number,
  to: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  pos: number[],
  idx: number[],
): void {
  const m = to - from;
  if (m < 3) return;
  const contour: Vector2[] = new Array(m);
  for (let k = 0; k < m; k++) contour[k] = new Vector2(x[from + k], y[from + k]);
  const faces = ShapeUtils.triangulateShape(contour, []);
  if (!faces.length) return;
  const base = pos.length / 3;
  for (let k = 0; k < m; k++) {
    const wx = x[from + k];
    const wy = y[from + k];
    pos.push(wx, elevAt(wx, wy) * zex, wy);
  }
  for (const t of faces) idx.push(base + t[0], base + t[1], base + t[2]);
}

/**
 * ONE SEGMENT OF LINE, AS FOUR CORNERS ON THE GROUND.
 *
 * `ext` is the segment's own butt cap, in metres, and it exists for corners:
 * a kerb that turns is two segments meeting at an angle, and two quads that
 * stop dead at the shared vertex leave a wedge of roadway showing through the
 * outside of every turn. Extending each by its own half width closes that
 * wedge for a hundredth of the cost of solving a miter, and the price is that
 * a run's two true ENDS overhang by the same half width — 0.2 m on a kerb,
 * which is below the quantum the island and stair rings are even published
 * at. Passed 0 where an end is a real end and must stay put, which is the
 * stair band: a stair is 2.2 m wide, so its cap would overhang by 1.1 m.
 */
function strip(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW: number,
  ext: number,
  elevAt: (x: number, y: number) => number,
  zex: number,
  pos: number[],
  idx: number[],
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  // a zero-length edge has no direction to offset along, and the published
  // rings do contain repeated vertices
  if (L < 1e-6) return;
  const ux = dx / L;
  const uy = dy / L;
  const ex = ux * ext;
  const ey = uy * ext;
  const nx = -uy * halfW;
  const ny = ux * halfW;
  const x0 = ax - ex;
  const y0 = ay - ey;
  const x1 = bx + ex;
  const y1 = by + ey;
  const base = pos.length / 3;
  const c: [number, number][] = [
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ];
  for (const [wx, wy] of c) pos.push(wx, elevAt(wx, wy) * zex, wy);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * The sRGB bytes behind a CSS colour the street module publishes, and its
 * alpha. Both forms appear there: the tones are hex, the centreline ink is
 * `rgba(...)` with an alpha that is part of the published look.
 */
function srgb(css: string): [number, number, number, number] {
  if (css.startsWith("#")) {
    const v = parseInt(css.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
  }
  const m = css.match(/[\d.]+/g) ?? [];
  return [
    Number(m[0]) || 0,
    Number(m[1]) || 0,
    Number(m[2]) || 0,
    m.length > 3 ? Number(m[3]) : 1,
  ];
}

/**
 * THE INK HAS AN ALPHA AND A LAMBERT MATERIAL HAS NOT.
 *
 * `ST_LINE_INK` is `rgba(58,44,20,.20)` — the published centreline ink is a
 * translucent one, and what a reader actually sees is that ink COMPOSITED
 * over whatever is under the line, which for a centreline is the carriageway.
 * Handing the raw string to `Color.setStyle` would silently drop the alpha
 * and paint a near-black stripe down every arterial in the city.
 *
 * So the composite is done here instead, and it is done in sRGB BYTES rather
 * than in the renderer's linear working space, because sRGB is the space the
 * 2D context composites in — mixing in linear would give a different colour
 * from the Canvas page for the same published pair, which is exactly what a
 * parity screenshot exists to catch.
 */
function over(fg: string, bg: string): string {
  const f = srgb(fg);
  const b = srgb(bg);
  const ch = (i: number): number => Math.round(f[i] * f[3] + b[i] * (1 - f[3]));
  return "#" + ((1 << 24) | (ch(0) << 16) | (ch(1) << 8) | ch(2)).toString(16).slice(1);
}

function mesh(
  pos: number[],
  idx: number[],
  colour: string,
  offset: number,
): Mesh | null {
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  /* FLAT UP, like the ground and like the street surfaces: the slope is
     already in the vertices, and a Lambert term taken from a strip that
     twists as it follows a kerb round a corner would flicker quad to quad. */
  const n = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(n, 3));
  g.computeBoundingSphere();

  const c = new Color();
  c.setStyle(colour, SRGBColorSpace);
  const m = new MeshLambertMaterial({
    color: c,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const out = new Mesh(g, m);
  out.receiveShadow = true;
  out.castShadow = false;
  return out;
}

/** a geometry whose draw range is a year, and the sorted years to find it by */
interface Gate {
  g: BufferGeometry;
  /** `idx.length` after the feature at this position was emitted */
  marks: number[];
  /** that feature's year, ascending; -1 where the record is silent */
  years: number[];
}

/** how many features of `years` are drawn in `year` — they are sorted, so bisect */
function upTo(years: number[], year: number | undefined): number {
  if (year === undefined) return years.length;
  let lo = 0;
  let hi = years.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (years[mid] <= year) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function streetDetailLayer(
  data: CityData,
  o: StreetDetailLayerOptions,
): CityLayer & { meshes: Mesh[] } {
  const meshes: Mesh[] = [];
  const gates: Gate[] = [];

  /* THE TWO WIDTHS COME OUT OF THE CITY'S OWN MANIFEST, which is the whole
     reason this file can sit in a city-free engine and still draw a kerb at a
     believable size: a city with 12 m streets gets a narrower one without a
     line of code moving. */
  const stats = (data.manifest.streets as
    { stats?: { w_p50?: number; fw_p50?: number } } | undefined)?.stats;
  const rowP50 = stats?.w_p50 && stats.w_p50 > 0 ? stats.w_p50 : NOMINAL_ROW_M;
  const fwP50 = stats?.fw_p50 && stats.fw_p50 > 0 ? stats.fw_p50 : NOMINAL_FOOT_M;
  const inkHalf = (fwP50 * INK_FRAC) / 2;
  const spineHalf = (rowP50 * INK_FRAC) / 2;

  // ── the kerbs ─────────────────────────────────────────────────────────────
  for (const entry of data.manifest.chunks) {
    if (entry.kind !== "strt") continue;
    const chunk = data.get(entry.k);
    if (!chunk) continue;
    const cell = streetCellOf(chunk);
    const n = cell.cls.length;
    if (!n) continue;

    const rd = ringIndex(n, cell.rdN, cell.rdLen);
    const pos: number[] = [];
    const idx: number[] = [];

    /* ── EMITTED IN KERBING-YEAR ORDER ───────────────────────────────────
       `krb` is the year the Board is recorded ordering the kerb, and it is a
       DIFFERENT year from `yr`: 438 rights of way carry one, and 1,974 stand
       unkerbed at some point in the record while the roadway under them is
       already there. `periodOf`'s rule, in emission order — `krb` where the
       record has one, the acceptance year where it does not, and a silent
       record means drawn in every year. Sorting by it makes the century
       scrub a draw range instead of a rebuild, exactly as `streets.ts`
       does for the surfaces. */
    const kerbYear = (i: number): number =>
      cell.krb[i] !== 0 ? cell.krb[i] : cell.yr[i] !== 0 ? cell.yr[i] : -1;
    const ord = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => kerbYear(a) - kerbYear(b) || a - b,
    );

    const marks: number[] = [];
    const years: number[] = [];
    for (const i of ord) {
      for (let r = rd.fo[i]; r < rd.fo[i + 1]; r++) {
        const a = rd.off[r];
        const b = rd.off[r + 1];
        if (b - a < 3) continue;
        for (let v = a; v < b; v++) {
          // the ring closes, so the last vertex's edge runs back to the first
          const w = v + 1 < b ? v + 1 : a;
          if (!isKerbEdge(cell, v)) continue;
          strip(
            cell.rdX[v], cell.rdY[v], cell.rdX[w], cell.rdY[w],
            inkHalf, inkHalf, o.elevAt, o.zex, pos, idx,
          );
        }
      }
      marks.push(idx.length);
      years.push(kerbYear(i));
    }

    const m = mesh(pos, idx, ST_C_KERB, -1);
    if (m) {
      meshes.push(m);
      gates.push({ g: m.geometry, marks, years });
    }
  }

  // ── the islands and the stairs ────────────────────────────────────────────
  const misc = data.streetMisc();
  if (misc) {
    /* THE ISLANDS ARE FOOTWAY, because that is what a refuge is — the same
       tone the footway takes in `streets.ts`, with the kerb that rings it
       drawn as its own strip. Neither carries a year: `emxt-b6yg` publishes
       the ring and no date, so a refuge is drawn in every year, which is the
       rule the undated streets and the undated trees are drawn under. */
    const isPos: number[] = [];
    const isIdx: number[] = [];
    const ikPos: number[] = [];
    const ikIdx: number[] = [];
    let v = 0;
    for (let r = 0; r < misc.islandLen.length; r++) {
      const nv = misc.islandLen[r];
      ringTris(misc.islandX, misc.islandY, v, v + nv, o.elevAt, o.zex, isPos, isIdx);
      for (let k = 0; k < nv; k++) {
        const a = v + k;
        const b = k + 1 < nv ? v + k + 1 : v;
        strip(
          misc.islandX[a], misc.islandY[a], misc.islandX[b], misc.islandY[b],
          inkHalf, inkHalf, o.elevAt, o.zex, ikPos, ikIdx,
        );
      }
      v += nv;
    }
    const isM = mesh(isPos, isIdx, ST_C_FOOT, 1);
    const ikM = mesh(ikPos, ikIdx, ST_C_KERB, -1);
    if (isM) meshes.push(isM);
    if (ikM) meshes.push(ikM);

    /* ── THE STAIRS ──────────────────────────────────────────────────────
       A band the width of the declared `ST_STAIR_BAND_M` with a tread tick
       every declared `ST_STAIR_TICK_M`, both taken from the Canvas module
       rather than restated, and both an honest global treatment: `aw7j-9354`
       publishes the RUN of each stair and neither a width nor a tread count,
       so every stair in the city gets the same two numbers and NEITHER IS A
       MEASUREMENT OF THAT STAIR.

       The Canvas gates the ticks on being more than two pixels apart, and
       that gate cannot come across: this geometry is built once and the
       camera meets it afterwards. What replaces it is the projection itself —
       at a zoom where 0.9 m is sub-pixel the ticks merge into the band they
       are drawn on, which is the same picture the gate was protecting. */
    const bandHalf = ST_STAIR_BAND_M / 2;
    const sbPos: number[] = [];
    const sbIdx: number[] = [];
    const stPos: number[] = [];
    const stIdx: number[] = [];
    v = 0;
    for (let r = 0; r < misc.stairLen.length; r++) {
      const nv = misc.stairLen[r];
      for (let k = 0; k + 1 < nv; k++) {
        const ax = misc.stairX[v + k];
        const ay = misc.stairY[v + k];
        const bx = misc.stairX[v + k + 1];
        const by = misc.stairY[v + k + 1];
        // 0 extension: a stair run ENDS where it ends, and a 1.1 m cap on a
        // 2.2 m band would push the top tread out into the street
        strip(ax, ay, bx, by, bandHalf, 0, o.elevAt, o.zex, sbPos, sbIdx);
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        if (L <= ST_STAIR_TICK_M) continue;
        const ux = dx / L;
        const uy = dy / L;
        for (let s = ST_STAIR_TICK_M; s < L; s += ST_STAIR_TICK_M) {
          const mx = ax + ux * s;
          const my = ay + uy * s;
          // the tick lies ACROSS the run, so it is the normal that carries the
          // band's width and the strip's own half width that is the ink
          strip(
            mx + uy * bandHalf, my - ux * bandHalf,
            mx - uy * bandHalf, my + ux * bandHalf,
            inkHalf, 0, o.elevAt, o.zex, stPos, stIdx,
          );
        }
      }
      v += nv;
    }
    const sbM = mesh(sbPos, sbIdx, ST_C_FOOT, 1);
    const stM = mesh(stPos, stIdx, ST_C_KERB, -1);
    if (sbM) meshes.push(sbM);
    if (stM) meshes.push(stM);
  }

  // ── the spine of the arterials ────────────────────────────────────────────
  /* RANK 0 AND RANK 1, AND THE RANK TABLE IS WHY THEY SHARE A WIDTH.
     `ST_W` — the per-class weight the Canvas strokes centrelines at — opens
     `[1.5, 1.5, 1.0, ...]`: the published classcode ranks 0 and 1 are the
     same weight in it, and 2 is not. So one width for the two of them is the
     rank table's own answer and not a shortcut, and the ceiling at 1 is the
     point where that table steps down.

     `strt/street-unimplied` falls out of the same test for free — it is
     classes 5 to 7 by construction, so it is never rank 0 or 1. */
  const spineInk = over(ST_LINE_INK, ST_C_ROAD);
  for (const c of data.streetLines()) {
    const nF = c.cls.length;
    const pos: number[] = [];
    const idx: number[] = [];
    const marks: number[] = [];
    const years: number[] = [];

    /* the vertex runs are packed feature after feature, so the offsets have
       to be walked in FILE order even though the emission is in year order —
       hence one pass to find each feature's base and a second to draw */
    const base = new Uint32Array(nF);
    let off = 0;
    for (let i = 0; i < nF; i++) {
      base[i] = off;
      off += c.len[i];
    }
    const lineYear = (i: number): number => (c.yr[i] !== 0 ? c.yr[i] : -1);
    const ord: number[] = [];
    for (let i = 0; i < nF; i++) if (c.cls[i] <= 1) ord.push(i);
    ord.sort((a, b) => lineYear(a) - lineYear(b) || a - b);

    for (const i of ord) {
      const b0 = base[i];
      const m = c.len[i];
      for (let k = 0; k + 1 < m; k++) {
        strip(
          c.x[b0 + k], c.y[b0 + k], c.x[b0 + k + 1], c.y[b0 + k + 1],
          spineHalf, spineHalf, o.elevAt, o.zex, pos, idx,
        );
      }
      marks.push(idx.length);
      years.push(lineYear(i));
    }

    /* `cov` — does a published right of way cover this line? — is read by the
       Canvas to FADE a line as its surface arrives, and is deliberately not
       read here. At the zooms this layer exists for the surface is always
       there, and a spine drawn over a carriageway in the carriageway's own
       ink at a twelfth of its width reads as the lane marking it sits where.
       A fade would need transparency on a ground-coplanar quad, which is the
       depth-sorting problem `polygonOffset` was chosen to avoid. */
    const m = mesh(pos, idx, spineInk, 0);
    if (m) {
      meshes.push(m);
      gates.push({ g: m.geometry, marks, years });
    }
  }

  return {
    name: "street-detail",
    meshes,
    onYear(year: number | undefined) {
      for (const gt of gates) {
        const k = upTo(gt.years, year);
        gt.g.setDrawRange(0, k ? gt.marks[k - 1] : 0);
      }
    },
    onStep(step: number, zex: number) {
      /* the kerbs and the spines are a close-camera treatment for the same
         reason the surface is — see `streets.ts` */
      for (const m of meshes) m.visible = step >= 1;
      /* the ground's exaggeration moved, so every vertex moves with it — the
         same one pass over Y the surfaces and the footprints take */
      const k = zex / o.zex;
      for (const m of meshes) {
        const p = m.geometry.getAttribute("position") as BufferAttribute;
        const arr = p.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) arr[i + 1] *= k;
        p.needsUpdate = true;
        m.geometry.computeBoundingSphere();
      }
      o.zex = zex;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        (m.material as MeshLambertMaterial).dispose();
      }
      meshes.length = 0;
      gates.length = 0;
    },
  };
}
