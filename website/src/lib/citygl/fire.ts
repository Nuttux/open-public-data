/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/fire.ts — THE GROUND A CITY LOST, AND THE LINE ROUND IT.

   A city's record can hold a catastrophe, and where it does, the map has to
   be able to draw it. This is the piece that draws one: a published burned-
   district boundary, the ground inside it carried to ash on the terrain
   ramp's own burn row, and the boundary drawing itself as a hairline.

   ── THIS FILE KNOWS NO CITY, NO DISASTER AND NO YEAR ──────────────────────
   The rings arrive as a parameter, out of the city's own register. The years
   the ash covers arrive as a parameter. Nothing here names either, and
   `engine-is-city-free.test.ts` is the reason as well as the check.

   ── 1 · THE GROUND WAS ALREADY PLUMBED FOR THIS AND SWITCHED OFF ──────────
   `TerrainField` carries `cellBurn`, one byte a DEM cell. `TerrainField.node`
   averages it over the four land cells meeting at a node and hands the mean
   to `terrainRGB` as `burnT`, which lerps the node's colour toward one ash
   tone. Every part of that is shipped. What was missing on BOTH renderers is
   the two ends of it:

     · `cellBurn` is never filled on the GPU path — `layers/terrain.ts`'s
       `prepare` hook fills `cellPark` and stops — so the mean is always 0;
     · `burnT` is never anything but 0 on the Canvas path either. Its own
       notes say so in the open: *"The 1906 burn is loaded and never phased.
       `drawTerrain(f, t, burnT)` takes the phase and this shell passes 0."*

   So the ash the terrain model already knows how to paint has never been on
   either screen. It is not an effect being added here; it is a switch being
   closed, and this file is the two ends of the wire.

   ── 2 · THE ASH IS A CROSS-FADE, AND THAT IS THE REFERENCE'S OWN METHOD ───
   `terrainRGB` is not cheap and a moving phase would recompute all 67,600
   nodes a frame. The reference renderer solved this before us and wrote down
   the check: it keeps TWO ground plates, one at `burnT` 0 and one at 1, and
   cross-fades them —

     > *"The burned ground and the recovered ground are now two layers and the
     > phase is a cross-fade between them. Verified to be the same picture:
     > against a direct render at burnT 0.2 / 0.5 / 0.8, zero pixels differ by
     > more than 6 and the largest single difference is 7/255."*

   This does the same thing one level down. Only the vertices the register
   actually touches get an endpoint pair, and the phase lerps between them in
   the buffer three's material already reads. **MEASURED on the shipped
   register: 4,947 of the ground's 94,485 vertices move at all — 5.2 %**
   (3,777 DEM nodes, 774 refined coastal sub-vertices, 396 on the hem), so a
   frame with the phase moving costs the same as one with it held: 0.7 ms
   either way, measured over 25 frames each.

   AND IT IS EXACT, not merely inside the reference's bound. The phase is
   spent in the RAMP's own sRGB bytes rather than in the buffer's linear
   space — see `paint` — and against a direct render of the same nodes at
   phase 0.2 / 0.5 / 0.8, read back off the GPU buffer, **the largest single
   channel error is 0.005 of 255.** The reference accepted 7.

   ── 3 · WHAT MOVES, AND THE THREE THINGS THAT WERE REJECTED ───────────────
   A phase that goes 0 → 1 could spread rather than switch on, and the first
   three ways to spend it are all inventions. The register is one polygon with
   NO TIME FIELD — the final extent — and the corpus note that ships with it
   says the limit in its own words: *"Not a fire that spreads. The fire can
   arrive; it cannot advance."*

     · REJECTED — a front out of the placed losses. The loss schedule this
       city publishes carries 36 structures with survey-offset positions and
       dollar values, and no ignition time for any of them. Its own header
       says the order it prints them in *"is the order of a table being read
       and NOT the order they caught fire."* Keying the ground to them would
       turn a reading order into a chronology, which is the one thing the
       record forbids.
     · REJECTED — a radial or distance-to-boundary arrival. Nothing in the
       register is a distance and nothing in it is a start. An ash that
       arrives from the edge inward states that the fire came from outside,
       which no source says.
     · REJECTED — arrival along the boundary's own vertex order. This one had
       a real argument behind it, because the vertex order IS the order the
       1906 Clerk describes the boundary in, and the published renderer tried
       exactly it. It was pulled, and its own autopsy is the reason not to
       repeat it: a partly-drawn ring closes on a CHORD, and *"that edge is
       the boundary of nothing at all."* Its verdict is the rule this file
       follows: **the extent is published and the order is not, so the extent
       is drawn WHOLE and only its colour moves.**

   WHAT MOVES INSTEAD IS THE LINE. A stroked boundary has no chord — a prefix
   of a polyline is a polyline — so the one gesture the record does support is
   the boundary describing itself, vertex by vertex, in the order it is
   written down. That is `setLine`, and it is the same 1.6 px `#b4341c`
   hairline the published film strokes.

   ── 4 · NO FLAME, NO GLOW, NO SMOKE, AND EACH ONE WAS PAID FOR ONCE ───────
   This is a record of a disaster with a death toll, not an effect. The
   published renderer arrived at the same place by trying the alternatives and
   measuring them: its smoke pass *"drew three radial discs per structure …
   a plume five times the height of the flame it came from, and eighty-one of
   them on the frame"* and was deleted rather than retuned; its additive
   flames bleached *"what was left after the fire"* out of the frame. There is
   no particle here, no glow, no bloom and no orange. There is grey ground and
   a red line, both of which are somebody's published measurement.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  BufferGeometry,
  DoubleSide,
} from "three";

import { terrainRGB, type TerrainField } from "@/lib/city/terrain";
import type { PlaneCamera } from "./camera";
import type { CityLayer } from "./engine";
import { markTerrainCells, markTerrainCellsEvenOdd } from "./mark-cells";

export type BurnRing = readonly (readonly [number, number])[];

/* ── THE TWO TRANSFERS, THREE'S OWN ──────────────────────────────────────
   `Color.setRGB(r, g, b, SRGBColorSpace)` runs the first of these and the
   renderer's output conversion runs the second. They are written out here
   rather than called through a `Color` because the phase spends them once a
   vertex a frame and a `Color` round trip is three property writes and a
   colour-space lookup for the same three numbers. Verified against
   `Color.setRGB` on the live buffer: max error 1.9e-7 over 7,569 nodes. */
function srgbToLinear(v: number): number {
  return v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4);
}
function linearToSRGB(v: number): number {
  return v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666) - 0.055;
}

/** world metres -> the projection's own plane. The city's `proj`, curried. */
export type PlaneProject = (x: number, y: number, z: number) => readonly [number, number];

export interface FireOptions {
  /** the ground mesh the ash is painted into — `TerrainLayer.mesh` */
  ground: Mesh;
  /** the field for a camera band — `TerrainLayer.fieldFor` */
  fieldFor: (step: number) => TerrainField;
  /**
   * The published boundary of the burned district, in world metres, as the
   * register writes it: the outer ring first, then any rings that cut holes
   * in it. Read under the EVEN-ODD rule — see `mark-cells.ts`.
   */
  rings: readonly BurnRing[];
  /** the city's own projection, for the hairline's screen-constant width */
  proj: PlaneProject;
  /**
   * THE HAIRLINE'S OWN INK, and the two numbers are the published film's:
   * `#b4341c` at 1.6 CSS px, round-joined. A record's boundary is drawn in a
   * register's ink and not in a fire's colour — this is close to a printed
   * red and deliberately nowhere near a flame.
   */
  ink?: string;
  inkPx?: number;
}

export interface FireStats {
  /** rings in the register, and how many of them cut holes */
  rings: number;
  /** DEM cells the register marks, even-odd */
  cells: number;
  /** and how many the UNION rule would have marked — see `mark-cells.ts` */
  cellsUnion: number;
  /** ground NODES that carry any burn at all, of `N * N` */
  nodes: number;
  nodesTotal: number;
  /** refined coastal sub-vertices that had to be re-blended with them */
  subVertices: number;
  /**
   * VERTICES OF THE DISSOLVING HEM WHOSE COLOUR MOVES WITH THE ASH. The
   * terrain's outer ground is a second mesh with a second copy of the
   * colours, and it is written here too — see `buildBand` §PASS 3. 396 of
   * 10,299 on the shipped register, 108 of them strictly inside the line and
   * the rest blending to a node that is. It is a measurement and not an
   * assumption because the first cut of this file assumed it was zero, on the
   * reasoning that a burn downtown cannot reach the city's own data edge —
   * which is true, and beside the point: the hem also rings every hole the
   * land mask leaves INSIDE the city.
   */
  hemInside: number;
  /** segments in the hairline, across every ring */
  lineSegments: number;
}

/**
 * THE PHASE THE ASH SITS AT IN A GIVEN YEAR.
 *
 * Full through `full`, gone by `clear`, linear between — the reference
 * renderer's own `burnPhase`, with its two years lifted out into parameters
 * because they are the city's and not the engine's.
 *
 * It is a DRAWING rule and not a claim that a measured quantity of ash decayed
 * on a schedule: what it stands for is that the ground the record marks as
 * burned stops being the subject of the map as the register fills it back in.
 * The reference states the same thing about the same function — *"The 1906
 * burn fades out of the ground over seven years"* — and the years it uses are
 * the ones the caller passes.
 */
export function burnFadeAt(year: number, full: number, clear: number): number {
  if (!(clear > full)) return year <= full ? 1 : 0;
  if (year <= full) return 1;
  if (year >= clear) return 0;
  return 1 - (year - full) / (clear - full);
}

export interface FireLayer extends CityLayer {
  /** the hairline, for the mount to add to the scene */
  readonly mesh: Object3D;
  /**
   * 0..1, how far the ground has gone to ash. `null` hands the ground back to
   * the year — see `setYearFade`. The film's own fire act drives this with a
   * number; the map leaves it null.
   */
  setProgress(p: number | null): void;
  /**
   * 0..1, the hairline. `null` hands it to the ash, which is the map's own
   * state; a number is the film drawing it.
   *
   * It is ONE number doing two jobs, and that is deliberate. Rising, it is
   * how much of the boundary has been drawn — the gesture. At rest it is how
   * strongly the drawn boundary is held. So the hairline draws itself once,
   * stays while the ground it bounds is ash, and goes out with it: **the line
   * is never on the frame without the ground it is the boundary of, and never
   * off it while that ground is there.**
   */
  setLine(p: number | null): void;
  /** which years the ash covers, for the year rail. `null` turns it off. */
  setYearFade(win: { full: number; clear: number } | null): void;
  /** the even-odd test against the published rings, for any caller that needs
   *  to know whether a thing stood inside the line */
  insideBurn(x: number, y: number): boolean;
  stats(): FireStats;
}

/** the ray-crossing test, on the ring's own vertices */
function inRing(x: number, y: number, ring: BurnRing): boolean {
  let inside = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const yi = ring[k][1];
    const yj = ring[j][1];
    if (yi > y !== yj > y) {
      const xi = ring[k][0];
      const xj = ring[j][0];
      if (x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * ONE NODE'S COLOUR AT ONE BURN PHASE, BY `TerrainField.node`'S OWN RULE.
 *
 * Not `TerrainField.node()` itself, and the reason is a trap worth naming:
 * that method caches per node on a generation counter and **the phase is not
 * in the key**, so asking it for the same node at a second phase hands back
 * the first phase's colour. The Canvas path pays for that with
 * `invalidateNodes()` and 67,600 recomputed nodes. Here the two endpoints are
 * computed once, off the cache, through the same arithmetic — the mean over
 * the up-to-four LAND cells that meet at the node, land only, so a coastal
 * node takes the value of the land it is a corner of.
 */
function nodeColour(t: TerrainField, i: number, j: number, burnT: number, o: Float64Array): void {
  const N = t.N;
  let np = 0;
  let nb = 0;
  let nc = 0;
  let n = 0;
  const can = t.canopyFrac;
  for (let a = -1; a <= 0; a++) {
    for (let b = -1; b <= 0; b++) {
      const ii = i + a;
      const jj = j + b;
      if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) continue;
      if (!t.maskAt(ii, jj)) continue;
      const kk = ii * N + jj;
      np += t.cellPark[kk];
      nb += t.cellBurn[kk];
      nc += can ? can[kk] : 0;
      n++;
    }
  }
  const li = i < 1 ? 1 : i > N - 2 ? N - 2 : i;
  const lj = j < 1 ? 1 : j > N - 2 ? N - 2 : j;
  terrainRGB(
    t.elevAt(i, j),
    t.lamSh(li * N + lj),
    n ? np / n : 0,
    n ? burnT * (nb / n) : 0,
    n ? nc / n : 0,
    o,
  );
}

/** how much burn a node carries at phase 1, 0 when it carries none */
function nodeBurnFrac(t: TerrainField, i: number, j: number): number {
  const N = t.N;
  let nb = 0;
  let n = 0;
  for (let a = -1; a <= 0; a++) {
    for (let b = -1; b <= 0; b++) {
      const ii = i + a;
      const jj = j + b;
      if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) continue;
      if (!t.maskAt(ii, jj)) continue;
      nb += t.cellBurn[ii * N + jj];
      n++;
    }
  }
  return n ? nb / n : 0;
}

/**
 * The ash for ONE camera band, precomputed as a pair of endpoints.
 *
 * `layers/terrain.ts` keeps one colour buffer per band and swaps the whole
 * attribute on a band change, so this is per band too — and it is rebuilt
 * against whatever array is bound, because that layer also rebuilds its
 * geometry once when the regional shoreline resolves.
 */
interface BandBurn {
  /** vertex indices into the ground's colour buffer, 3 floats a vertex */
  idx: Int32Array;
  c0: Float32Array;
  c1: Float32Array;
  /** the same, into the HEM's colour buffer, which is RGBA — see `hemOf` */
  hemIdx: Int32Array;
  hemC0: Float32Array;
  hemC1: Float32Array;
  /** of `idx`, how many are refined coastal sub-vertices rather than nodes */
  subVertices: number;
}

/** the hem — the terrain's outermost ground, its own mesh, its own colours */
function hemOf(ground: Mesh): Mesh | null {
  for (const c of ground.children) {
    const m = c as Mesh;
    const col = m.geometry?.getAttribute?.("color");
    if (col && col.itemSize === 4) return m;
  }
  return null;
}

export function fireLayer(o: FireOptions): FireLayer {
  const rings = o.rings.filter((r) => r.length >= 3);
  const t0 = o.fieldFor(0);
  const N = t0.N;
  const ink = o.ink ?? "#b4341c";
  const inkPx = o.inkPx ?? 1.6;

  /* ── THE CELLS, ONCE, ON EVERY BAND'S FIELD ────────────────────────────
     `fieldFor` builds a field per band and each has its own `cellBurn`, so
     the mark has to be made on each of them — and it has to be made BEFORE
     that band's colours are asked for, which is why `bandOf` goes through
     here. */
  const marked = new Map<number, number>();

  function fieldWithBurn(step: number): TerrainField {
    const t = o.fieldFor(step);
    if (!marked.has(step)) {
      marked.set(step, markTerrainCellsEvenOdd(t, rings, t.cellBurn));
    }
    return t;
  }

  const geo = o.ground.geometry;
  const hemMesh = hemOf(o.ground);
  const bands = new Map<number, BandBurn>();
  /* the array identity the band was built against — `layers/terrain.ts` can
     replace the whole attribute, and a stale endpoint pair would then be
     written into a buffer whose pristine colours are somewhere else */
  const builtFor = new WeakMap<Float32Array, Set<number>>();
  const scratch = new Float64Array(3);

  function buildBand(step: number): BandBurn {
    const t = fieldWithBurn(step);
    const pos = geo.getAttribute("position");
    const posArr = pos.array as Float32Array;
    const live = geo.getAttribute("color").array as Float32Array;
    const X0 = t.proj.X0;
    const Y0 = t.proj.Y0;
    const cell = t.cellM;

    /* ── PASS 1: THE BASE LATTICE ─────────────────────────────────────────
       Only the nodes the register actually reaches. MEASURED on the shipped
       register: 3,777 of 67,600, which is 5.6 % — the rest of the ground
       never moves and never needs an endpoint. */
    const slot = new Int32Array(N * N).fill(-1);
    const idx: number[] = [];
    const c0: number[] = [];
    const c1: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (nodeBurnFrac(t, i, j) <= 0) continue;
        nodeColour(t, i, j, 0, scratch);
        const r0 = scratch[0];
        const g0 = scratch[1];
        const b0 = scratch[2];
        nodeColour(t, i, j, 1, scratch);
        const v = i * N + j;
        slot[v] = idx.length;
        idx.push(v);
        c0.push(r0, g0, b0);
        c1.push(scratch[0], scratch[1], scratch[2]);
      }
    }
    /** a corner's endpoint colour, or the pristine one where it takes no burn.
     *  Both in the ramp's own sRGB BYTES — see §THE LERP IS IN THE RAMP'S OWN
     *  SPACE — so the untouched corner is carried back out of the linear
     *  buffer the layer wrote it into. */
    const corner = (v: number, ch: number, arr: number[]): number =>
      slot[v] >= 0 ? arr[slot[v] * 3 + ch] : 255 * linearToSRGB(live[v * 3 + ch]);

    /* ── THE BLEND EVERY OTHER VERTEX IN THE GROUND TAKES ─────────────────
       `layers/terrain.ts` rebuilds a cell the published shoreline crosses as
       up-to-6x6 sub-quads, and hands its outermost cells to a dissolving hem
       mesh; every vertex of both is a BILINEAR BLEND of one cell's own four
       nodes, computed once at build. Move a node and all of them go stale — a
       seam of unburned pale ground along the waterfront inside the line,
       which is exactly where the fire reached, and pale patches wherever the
       hem covers ground the register marks.

       The blend needs (cell, u, v) and that table is private to the layer, so
       it is read back out of the POSITION buffer, which states it: a vertex
       sits at `X0 + (i + u) * cell`. The base lattice satisfies the same
       identity with u = v = 0, and a vertex landing exactly on a cell edge
       (u = 1) resolves into the neighbouring cell at u = 0 and blends to the
       same two nodes, to the float. */
    const blend = (
      x: number,
      z: number,
      arr: number[],
      out: number[],
    ): boolean => {
      const fi = (x - X0) / cell;
      const fj = (z - Y0) / cell;
      let i = Math.floor(fi);
      let u = fi - i;
      let j = Math.floor(fj);
      let v = fj - j;
      if (i >= N - 1) {
        i = N - 2;
        u = 1;
      }
      if (j >= N - 1) {
        j = N - 2;
        v = 1;
      }
      if (i < 0 || j < 0) return false;
      const a = i * N + j;
      const b = (i + 1) * N + j;
      const c = (i + 1) * N + (j + 1);
      const d = i * N + (j + 1);
      if (slot[a] < 0 && slot[b] < 0 && slot[c] < 0 && slot[d] < 0) return false;
      for (let ch = 0; ch < 3; ch++) {
        const va = corner(a, ch, arr);
        const vb = corner(b, ch, arr);
        const vc = corner(c, ch, arr);
        const vd = corner(d, ch, arr);
        out.push((va * (1 - u) + vb * u) * (1 - v) + (vd * (1 - u) + vc * u) * v);
      }
      return true;
    };

    // ── PASS 2: the refined coastal sub-vertices ─────────────────────────
    let subs = 0;
    for (let v = N * N; v < pos.count; v++) {
      const x = posArr[v * 3];
      const z = posArr[v * 3 + 2];
      const probe: number[] = [];
      if (!blend(x, z, c0, probe)) continue;
      subs++;
      idx.push(v);
      c0.push(probe[0], probe[1], probe[2]);
      blend(x, z, c1, c1);
    }

    /* ── PASS 3: THE HEM, WHICH IS A SECOND MESH WITH A SECOND COPY ───────
       It is not only the city's outer edge. The hem is seeded on any built
       cell within four of ground that is NOT built and has far-shore land
       under it, so it also rings the holes the land mask leaves INSIDE the
       city. MEASURED on the shipped register: **108 of its 10,299 vertices
       fall inside the burned district and 396 blend to a node that does**, at
       a mean fade of 0.47, scattered across the whole district and not at its
       edge. This file's first cut skipped the hem on the assumption that a
       burn downtown could not reach the city's outer edge, which was true and
       beside the point. Left alone they are pale ground in an ash field. The
       alpha is that layer's own dissolve and is never written here; only the
       three colour channels are. */
    const hemIdx: number[] = [];
    const hemC0: number[] = [];
    const hemC1: number[] = [];
    const hp = hemMesh?.geometry.getAttribute("position");
    if (hp && hemMesh?.geometry.getAttribute("color")) {
      const hpa = hp.array as Float32Array;
      for (let v = 0; v < hp.count; v++) {
        const x = hpa[v * 3];
        const z = hpa[v * 3 + 2];
        const probe: number[] = [];
        if (!blend(x, z, c0, probe)) continue;
        hemIdx.push(v);
        hemC0.push(probe[0], probe[1], probe[2]);
        blend(x, z, c1, hemC1);
      }
    }

    return {
      idx: Int32Array.from(idx),
      c0: Float32Array.from(c0),
      c1: Float32Array.from(c1),
      hemIdx: Int32Array.from(hemIdx),
      hemC0: Float32Array.from(hemC0),
      hemC1: Float32Array.from(hemC1),
      subVertices: subs,
    };
  }

  // ── the hairline ─────────────────────────────────────────────────────────

  /* ── ONE GESTURE, ACROSS THE RINGS IN ORDER ────────────────────────────
     Every segment of every ring, concatenated in the register's own order,
     as one index buffer — so `setDrawRange` spends the phase across the
     whole boundary rather than letting each ring race its neighbours. (The
     published Canvas stroke says it wants this in its own comment and then
     gives every ring the same phase; a draw range is the thing that actually
     does it.) MEASURED on the shipped register: 174 segments — 181 edges less
     the seven that close a ring onto a repeated first vertex and have no
     length.

     ── AND WHY IT IS TRIANGLES AND NOT A `Line` ─────────────────────────
     `LineBasicMaterial`'s width is one device pixel on every WebGL backend
     three has, which at DPR 2 is half a CSS pixel — a boundary that
     disappears on the display this is looked at on. So the stroke is a
     ribbon: two triangles a segment, widened along the SCREEN normal, with
     the half-width recomputed per frame from the camera's own scale so the
     line stays 1.6 CSS px at every zoom the way a stroked path would.

     The widening is exact rather than approximate. The projection is a
     linear map from world metres to plane units; the plane tangent of a
     segment is measured through it AT EACH END'S OWN ELEVATION, so a boundary
     running over a hill is widened perpendicular to the line as DRAWN and not
     as it would be on a flat map. The unit normal is then carried back into
     world metres through the map's inverse, which exists because the map is
     onto. */
  const lineGeo = new BufferGeometry();
  const lineMat = new MeshBasicMaterial({
    color: new Color(ink),
    side: DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    /* a hairline lying ON the ground z-fights it; the offset is what keeps it
       on top of the ground and still UNDER anything standing on the ground */
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
  const lineMesh = new Mesh(lineGeo, lineMat);
  lineMesh.renderOrder = 1;
  lineMesh.frustumCulled = false;
  lineMesh.castShadow = false;
  lineMesh.receiveShadow = false;
  lineMesh.visible = false;

  /* per ribbon vertex: the point it sits on, and the two unit world vectors
     that widen and cap it. Position is `base + (off + cap) * halfWidth`. */
  let rbX = new Float32Array(0);
  let rbY = new Float32Array(0);
  let rbZ = new Float32Array(0);
  let rbOX = new Float32Array(0);
  let rbOZ = new Float32Array(0);
  let rbCX = new Float32Array(0);
  let rbCZ = new Float32Array(0);
  let lineSegments = 0;

  function buildLine(): void {
    const t = fieldWithBurn(0);
    const p00 = o.proj(0, 0, 0);
    const pe1 = o.proj(1, 0, 0);
    const pe2 = o.proj(0, 1, 0);
    const m00 = pe1[0] - p00[0];
    const m10 = pe1[1] - p00[1];
    const m01 = pe2[0] - p00[0];
    const m11 = pe2[1] - p00[1];
    const det = m00 * m11 - m01 * m10;
    if (!det) return;
    const i00 = m11 / det;
    const i01 = -m01 / det;
    const i10 = -m10 / det;
    const i11 = m00 / det;

    const X: number[] = [];
    const Y: number[] = [];
    const Z: number[] = [];
    const OX: number[] = [];
    const OZ: number[] = [];
    const CX: number[] = [];
    const CZ: number[] = [];
    const idx: number[] = [];
    for (const ring of rings) {
      const n = ring.length;
      for (let k = 0; k < n; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % n];
        const za = t.elevM(a[0], a[1]);
        const zb = t.elevM(b[0], b[1]);
        const pa = o.proj(a[0], a[1], za);
        const pb = o.proj(b[0], b[1], zb);
        let tx = pb[0] - pa[0];
        let ty = pb[1] - pa[1];
        const L = Math.hypot(tx, ty);
        if (!(L > 1e-9)) continue;
        tx /= L;
        ty /= L;
        /* the plane normal, carried back into world metres */
        const nx = -ty;
        const ny = tx;
        const ox = i00 * nx + i01 * ny;
        const oz = i10 * nx + i11 * ny;
        /* the CAP: each segment is also extended by the half-width along its
           own direction at both ends, which makes consecutive quads overlap
           and covers the wedge a turn opens between them. `water.ts`
           §coastBand proves the same construction covers every turn up to
           180 degrees — 159 of 159 wedges, against 103 without it. */
        const cx = i00 * tx + i01 * ty;
        const cz = i10 * tx + i11 * ty;
        const base = X.length;
        // a-left, a-right, b-right, b-left
        X.push(a[0], a[0], b[0], b[0]);
        Y.push(za, za, zb, zb);
        Z.push(a[1], a[1], b[1], b[1]);
        OX.push(ox, -ox, -ox, ox);
        OZ.push(oz, -oz, -oz, oz);
        CX.push(-cx, -cx, cx, cx);
        CZ.push(-cz, -cz, cz, cz);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        lineSegments++;
      }
    }
    rbX = Float32Array.from(X);
    rbY = Float32Array.from(Y);
    rbZ = Float32Array.from(Z);
    rbOX = Float32Array.from(OX);
    rbOZ = Float32Array.from(OZ);
    rbCX = Float32Array.from(CX);
    rbCZ = Float32Array.from(CZ);
    lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(rbX.length * 3), 3));
    lineGeo.setIndex(new BufferAttribute(Uint32Array.from(idx), 1));
    lineGeo.setDrawRange(0, 0);
  }

  buildLine();

  let halfW = -1;
  function widen(w: number): void {
    if (w === halfW || !rbX.length) return;
    halfW = w;
    const at = lineGeo.getAttribute("position") as BufferAttribute;
    const arr = at.array as Float32Array;
    for (let v = 0; v < rbX.length; v++) {
      arr[v * 3] = rbX[v] + (rbOX[v] + rbCX[v]) * w;
      arr[v * 3 + 1] = rbY[v];
      arr[v * 3 + 2] = rbZ[v] + (rbOZ[v] + rbCZ[v]) * w;
    }
    at.needsUpdate = true;
    lineGeo.computeBoundingSphere();
  }

  // ── the state ────────────────────────────────────────────────────────────

  let step = 0;
  let filmPhase: number | null = null;
  let yearWin: { full: number; clear: number } | null = null;
  let yearPhase = 0;
  let linePhase: number | null = null;
  /* the gesture is MONOTONE: a boundary half drawn and then re-drawn from the
     start is not a hand describing something, it is a loop. It only resets
     when the hairline has gone out altogether, which is what lets the film be
     replayed. */
  let drawn = 0;
  let applied = -1;
  let appliedTo: Float32Array | null = null;

  /** the even-odd test against the published rings */
  function layerInside(x: number, y: number): boolean {
    let cross = 0;
    for (const r of rings) if (inRing(x, y, r)) cross++;
    return (cross & 1) === 1;
  }

  const phase = (): number => {
    const p = filmPhase ?? (yearWin ? yearPhase : 0);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  };

  function bandOf(): BandBurn {
    const arr = geo.getAttribute("color").array as Float32Array;
    let seen = builtFor.get(arr);
    if (!seen) {
      seen = new Set<number>();
      builtFor.set(arr, seen);
    }
    let b = bands.get(step);
    if (!b || !seen.has(step)) {
      /* the buffer this band is bound to is pristine right now — it was just
         set by the terrain layer, or it has never been written — so this is
         the moment the endpoint pair can be taken off it */
      b = buildBand(step);
      bands.set(step, b);
      seen.add(step);
    }
    return b;
  }

  /**
   * The hairline's own draw range and opacity.
   *
   * `polygonOffset` is what keeps it from z-fighting the ground it lies on
   * while still letting anything STANDING on that ground occlude it — a
   * boundary painted over the buildings inside it would be a diagram, and
   * this is a mark on the ground.
   */
  function paintLine(): void {
    const a = Math.max(0, Math.min(1, linePhase ?? phase()));
    if (a <= 0) {
      drawn = 0;
      lineMesh.visible = false;
      lineGeo.setDrawRange(0, 0);
      return;
    }
    if (a > drawn) drawn = a;
    const total = lineSegments * 6;
    const n = drawn >= 1 ? total : Math.floor((total * drawn) / 6) * 6;
    lineGeo.setDrawRange(0, n);
    lineMat.opacity = a;
    lineMesh.visible = n > 0;
  }

  /**
   * THE ASH, AT THE PHASE IT IS AT.
   *
   * One lerp between two precomputed endpoints, over the 4,947 of the
   * ground's 94,485 vertices the register reaches — the reference's own
   * cross-fade, one level down.
   *
   * ── THE LERP IS IN THE RAMP'S OWN SPACE, NOT THE BUFFER'S ───────────────
   * `terrainRGB` lerps toward the ash tone in sRGB BYTES and three's vertex
   * colour is LINEAR, and those are not the same lerp. MEASURED over the
   * ramp's whole domain — 15,444 samples across every elevation, every
   * Lambert, both park rows and the whole canopy range — a linear-space
   * cross-fade runs **max 15.4 of 255 and mean 1.86** from what the ramp
   * itself gives at that phase, which is over the reference's own accepted
   * bound of 7. So the endpoints are kept in bytes, the phase is spent
   * there, and the sRGB transfer is applied on the way into the buffer:
   * **max 0.013, mean 0.0014** on the same sweep. The whole of that residue
   * is `skylitN`'s luminance renormalisation, which is a ratio and cannot
   * commute with a lerp.
   *
   * The two buffers are written the same way and differ only in stride: the
   * ground's vertex colour is RGB and the hem's is RGBA, whose alpha is that
   * layer's own dissolve and is never touched here.
   */
  function paint(force = false): void {
    const p = phase();
    const arr = geo.getAttribute("color").array as Float32Array;
    if (!force && p === applied && arr === appliedTo) return;
    const b = bandOf();
    for (let k = 0; k < b.idx.length; k++) {
      const v = b.idx[k] * 3;
      const s = k * 3;
      arr[v] = srgbToLinear((b.c0[s] + (b.c1[s] - b.c0[s]) * p) / 255);
      arr[v + 1] = srgbToLinear((b.c0[s + 1] + (b.c1[s + 1] - b.c0[s + 1]) * p) / 255);
      arr[v + 2] = srgbToLinear((b.c0[s + 2] + (b.c1[s + 2] - b.c0[s + 2]) * p) / 255);
    }
    (geo.getAttribute("color") as BufferAttribute).needsUpdate = true;
    const hcol = hemMesh?.geometry.getAttribute("color") as BufferAttribute | undefined;
    if (hcol && b.hemIdx.length) {
      const h = hcol.array as Float32Array;
      for (let k = 0; k < b.hemIdx.length; k++) {
        const v = b.hemIdx[k] * 4;
        const s = k * 3;
        h[v] = srgbToLinear((b.hemC0[s] + (b.hemC1[s] - b.hemC0[s]) * p) / 255);
        h[v + 1] = srgbToLinear((b.hemC0[s + 1] + (b.hemC1[s + 1] - b.hemC0[s + 1]) * p) / 255);
        h[v + 2] = srgbToLinear((b.hemC0[s + 2] + (b.hemC1[s + 2] - b.hemC0[s + 2]) * p) / 255);
      }
      hcol.needsUpdate = true;
    }
    applied = p;
    appliedTo = arr;
    paintLine();
  }

  paint(true);

  /* ── THE TWO NUMBERS THIS FILE HAS TO BE ABLE TO SHOW ────────────────────
     What the union rule would have marked, so the hole count is a measurement
     and not an assertion; and whether any vertex of the terrain's dissolving
     HEM — which keeps its own copy of the colours and is not written here —
     falls inside the line. On the shipped register the second is 0, and the
     day a city publishes a burn that reaches its own data edge, this is where
     it shows up. */
  const unionCells = (() => {
    const probe = new Uint8Array(N * N);
    return markTerrainCells(t0, rings, probe);
  })();
  const hemInside = bands.get(0)?.hemIdx.length ?? 0;

  const stats: FireStats = {
    rings: rings.length,
    cells: marked.get(0) ?? 0,
    cellsUnion: unionCells,
    nodes: 0,
    nodesTotal: N * N,
    subVertices: 0,
    hemInside,
    lineSegments,
  };

  const layer: FireLayer = {
    name: "fire",
    mesh: lineMesh,
    setProgress(p: number | null) {
      filmPhase = p;
      paint();
    },
    setLine(p: number | null) {
      linePhase = p;
      paintLine();
    },
    setYearFade(win) {
      yearWin = win;
      paint(true);
    },
    insideBurn: layerInside,
    stats() {
      const b = bands.get(step);
      return {
        ...stats,
        cells: marked.get(step) ?? stats.cells,
        nodes: b ? b.idx.length - b.subVertices : 0,
        subVertices: b ? b.subVertices : 0,
      };
    },
    onStep(s: number) {
      step = s;
      /* the colour attribute the terrain layer just swapped is a different
         array, and this band may never have had its endpoints computed */
      paint(true);
    },
    onYear(year: number | undefined) {
      if (!yearWin) return;
      yearPhase = year === undefined ? 0 : burnFadeAt(year, yearWin.full, yearWin.clear);
      paint();
    },
    onFrame(cam: PlaneCamera) {
      if (!lineMesh.visible) return;
      /* ── THE HAIRLINE TAKES THE GROUND'S OWN EXAGGERATION, BY READING IT ──
         The band's `zex` is on `onStep`, and `onStep` does not fire for the
         band the engine STARTS on — so a hairline that set its scale there
         would lie flat under a ground standing at 3.3x until the reader
         changed zoom, which is a line buried in a hillside. The ground's
         scale is the one number that cannot be wrong about the ground. */
      if (lineMesh.scale.y !== o.ground.scale.y) lineMesh.scale.y = o.ground.scale.y;
      /* the half-width in world metres that lands `inkPx` CSS pixels wide:
         the unit offsets were built to have unit PLANE length, and the camera
         scale is pixels per plane unit */
      widen(inkPx / 2 / Math.max(1e-9, cam.scale));
    },
    dispose() {
      lineGeo.dispose();
      lineMat.dispose();
      bands.clear();
    },
  };
  return layer;
}
