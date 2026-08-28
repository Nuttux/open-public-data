/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/terrain.ts — THE GROUND, AS A MESH.

   The Canvas renderer walks the DEM far-to-near and fills 67,081 quads with
   bilinear sub-quads every time anything changes — 226 ms of a 404 ms
   whole-city rasterisation, measured (`terrain.ts` §GROUND_PLATE). The same
   ground here is ONE mesh, uploaded once, drawn in a fraction of a
   millisecond, at any camera, for ever.

   ── THE COLOURS ARE NOT REDERIVED ─────────────────────────────────────────
   Every node takes the colour `TerrainField.node()` gives it — the same
   object the Canvas path reads, so the hillshade, the park tint, the canopy
   tint, the burn and the aerial haze are byte-identical between the two
   renderers. That is deliberate and it is what makes a parity screenshot mean
   something: where the two frames differ, the difference is the RENDERER and
   never the palette.

   ── WHY THE VERTICAL EXAGGERATION IS A SCALE AND NOT A BAKED HEIGHT ───────
   `position.y` is the elevation in real metres and the mesh is scaled on Y by
   the band's `zex`. A band change is then one number, not 67,600 rebuilt
   vertices — where the Canvas renderer has to re-rasterise the world and
   cross-fade the two pictures on the glass.

   The node COLOURS do move with the band (the hillshade reads a slope, and a
   slope is exaggerated), so one colour buffer is built per band, lazily, and
   swapped. Three buffers, built once each, at 67,600 nodes.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import { TerrainField, type TerrainProj } from "@/lib/city/terrain";
import { decodeCoast } from "@/lib/city/water";
import { rasteriseRings, type CoastMask, type Ring } from "../coast-mask";
import type { CityLayer } from "../engine";

/** what the coast refinement did, so a harness can assert it deleted nothing */
export interface CoastStats {
  /** land cells the shipped mask calls land — the number that must not move */
  maskCells: number;
  /** of those, drawn as one whole quad */
  whole: number;
  /** of those, rebuilt as sub-quads because the published line crosses them */
  refined: number;
  /** of those, dropped: NEITHER published register calls any part of them land */
  dropped: number;
  /** land area in m2, mask cells vs what is actually built */
  areaMask: number;
  areaBuilt: number;
  /** sub-cells a side */
  K: number;
  /** built cells moved into the hem that dissolves into the far shore */
  hem: number;
}

export interface TerrainLayer extends CityLayer {
  readonly mesh: Mesh;
  /** the field for a band — the hit test and the overlay read the same one */
  fieldFor(step: number): TerrainField;
  /** what the coast refinement did — null while no register is in hand */
  coastStats(): CoastStats | null;
}

/* ── THE COAST, AND TWO DEAD ENDS BEFORE IT ───────────────────────────────
   The DEM's land bit is per 53.8 m cell, so the edge of the land is a
   staircase of that amplitude: five screen pixels a step at the whole-city
   camera, running out into the bay all the way round the peninsula, and the
   first thing a reader sees. Worse than the steps is their EXTENT. The
   shipped mask deliberately overshoots the water — `emit_surround_coast.py`
   keeps every cell within `city_pad_m` = 300 m of the published land — so the
   overhang is not half a cell, it is a three-to-five cell band, and off the
   waterfront it is a cream slab a third of a kilometre wide with the pier
   sheds sitting on it.

   ── ATTEMPT 1: DROP THE CELL IF ITS CENTRE IS OUTSIDE THE CITY'S RING ────
   Reverted. That ring is the city's OWN outline, and this DEM is a 13.9 km
   square with two other counties in it; everything past the county line went.

   ── ATTEMPT 2: THE SAME TEST AGAINST THE REGIONAL RINGS ──────────────────
   Reverted, and its justification is worth keeping because it READ well. The
   surround-coast export's own note says the rings *"reproduce the shipped
   land mask on 116,480 of 116,480 cells"* — but 416 x 280 = 116,480 is the
   SURROUND's lattice at 110 x 139 m, and this DEM is 53.8 m and 260 x 260.
   Against THAT grid the same rings agree on 99.95 % of cells, which sounds
   like agreement and was **2,172 of 37,754 land cells, 5.75 %, 1,618 of them
   interior** — 3.44 km2 of the ocean beach and the outer avenues, 1.15 km2 of
   the northern shore park, 0.52 km2 of the made island, the whole pier field.
   A percentage that reads like agreement can be several square kilometres of
   city. (And for the record the other half of that note was wrong too: the
   city ring set's four rings ARE closed, first vertex equals last, gap 0.0 m.)

   ── WHY BOTH FAILED THE SAME WAY ─────────────────────────────────────────
   A cell IS the staircase. A rule that answers PER CELL can only move the
   staircase, never remove it, and the only thing it can trade for a smaller
   overhang is deleted land. So this does not answer per cell.

   ── WHAT IS DONE INSTEAD ─────────────────────────────────────────────────
   `coast-mask.ts` scan-converts the published rings at K sub-cells a side and
   this walks the answer:

     - a cell wholly inside keeps its whole quad and costs nothing;
     - a cell the line crosses is rebuilt as up to K x K sub-quads, with
       elevation and colour interpolated bilinearly from its own four nodes,
       so its edges still match its neighbours' exactly and there is no crack;
     - a cell NO PART of which either register calls land is dropped.

   and the rings it reads are the UNION of the two published registers, which
   is the composition the 300 m pad was keeping those cells FOR — the city's
   own waterfront where it has one, the regional hydrography everywhere else.
   `coast-mask.ts` §THE UNION carries that measurement.

   `coastStats()` is on the layer so a harness can re-assert the counts after
   any change to this file: two attempts deleted land here, and the number
   that must never move is `maskCells`. */

/** sub-cells a side on a refined coastal cell — see §WHAT IS DONE INSTEAD */
const COAST_K = 6;

/* ── THE OTHER EDGE: WHERE THE DEM SIMPLY STOPS ───────────────────────────
   The coast above is the edge the land actually has. This is the edge the
   DATA has, and it is a different problem with a different answer.

   The city's DEM is a 13.9 km square and the land does not stop at its
   corner: the southern suburbs run off the bottom of it and the surround
   picks them up at 110 x 139 m, with no fabric on it and its own colour
   model. Neither raster is wrong and the join between them is still the most
   conspicuous edge in the lower half of the whole-city frame.

   MEASURED across it, ground layers only, at seventy points along the join:
   luminance 197.0 on the city side against 201.9 on the surround's, a step of
   4.9 — which is not what makes the line. The two numbers that do are the
   TEXTURE, standard deviation 30.3 against 8.0, and the fact that the city's
   mask ends in a 53.8 m staircase across flat inland ground.

   ── A COLOUR MATCH WAS TRIED FIRST AND IS NOT ENOUGH ─────────────────────
   `surround.ts` §THE JOIN carries the far shore to the city's own published
   tone over 900 m, and it is kept because it is right on its own terms. On
   its own it moved the step from -15 to -16 in red-minus-blue at the columns
   the join is widest: a value match cannot hide a boundary whose real signal
   is one side having relief and the other not, with a staircase between them.

   ── SO THE CITY'S EDGE DISSOLVES INSTEAD OF STOPPING ─────────────────────
   The outermost `HEM_CELLS` of built ground, WHERE THE SURROUND HAS LAND
   UNDER IT, are drawn as a separate mesh that fades to nothing outward. A
   dissolving edge has no line in it, and both signals go at once: the
   staircase is inside the fade, and the fabric arrives gradually instead of
   at a step.

   It is applied ONLY where the surround has land underneath — at the coast
   the neighbour is the bay, the edge is the published shoreline, and it must
   stay exactly as crisp as `coast-mask.ts` made it. */
const HEM_CELLS = 4;

/* ── THE GROUND'S FORM, WHICH IS NOT THE SAME THING AS ITS HILLSHADE ──────
   The ground used to be shaded by exactly one number. Its normals all pointed
   straight up, so the sun's diffuse term was a constant across the whole city
   and every hillside was one unbroken facet with a painting on it. A reader:
   *"looks like some pre-renaissance painting, false illusion of depth but
   there's not really feelings of depth like in modern animations and games."*
   That is a fair description of a surface on which light does nothing.

   The obvious move — give the mesh its true normals — was tried and MEASURED,
   and the reason it was rejected is not the one written down here before. The
   old note said a second hillshade would come back *"olive and waxy, like a
   satellite render"*. It does not: full true normals move the twin-peaks
   district frame's mean by +0.28 of 255 and its standard deviation from 33.44
   to 35.56. The real objection is direction. `lib/city/terrain.ts` bakes its
   hillshade from `SUN` = (0.2435, 0.6346, 0.73) — 47 degrees up, and 69
   degrees round in the DEM's own axes. `light.ts` puts the SCENE sun at 35.26
   degrees, azimuth pinned to screen-right, which in those same axes is 0
   degrees. **The two suns are 69 degrees apart.** Handing the mesh its true
   normals lights every hillside from a direction the painted shading on it
   disagrees with, and the disagreement is worst on exactly the big open
   slopes this is trying to fix.

   ── SO ONLY THE PART THE PAINTING HAS NO OPINION ABOUT IS HANDED OVER ────
   The normal used is `up + K * (true - lowpass(true))`. The low pass is eight
   1-2-1 passes each way, sigma about two cells, so it keeps everything above
   roughly 300 m and the deviation carries the band from 54 m — the DEM's own
   cell, below which there is no data — up to about 300 m. That band is
   ridges, gullies, knolls and breaks of slope: real published shape, at the
   scale a hillside needs to stop being a facet.

   And because the deviation is zero-mean over the kernel, the LANDFORM-scale
   diffuse term does not move, which is the whole of what a second hillshade
   would have been. MEASURED against the same frames:

     twin peaks, district    mean 133.86 -> 134.11    sd 33.44 -> 34.50
     twin peaks, street      mean 138.09 -> 137.92    sd 33.23 -> 36.34
     inner richmond, block   mean 139.96 -> 139.88    sd 35.86 -> 36.77

   A quarter of a level of mean at worst, against three to nine per cent more
   contrast, and the flattest district in the city is left where it was.

   ── AND A NOISE BUMP WAS TRIED FIRST, AND IS NOT HERE ────────────────────
   Three octaves of `mx_noise_float` under the DEM's own cell size, as a
   `normalNode`, amplitude ramped by slope. At a strength that could be seen
   at all it read as staining rather than as relief — isotropic noise on a
   matte surface makes blotches, not landform — and at district and city
   cameras it was invisible, because the sun is a small share of the ground's
   value and only ALBEDO survives that far out. Real shape at 54-300 m beat
   invented shape at 4-37 m on every camera, and it does not have to be
   defended as a thing we made up. */
const FORM_K = 1.2;
/** 1-2-1 passes each way on the normal field; 8 is a sigma of about two cells */
const FORM_LOWPASS = 8;


/**
 * @param zexByStep the descriptor's own exaggeration table
 * @param prepare a hook the caller uses to attach what the field needs that
 *        the chunk does not carry — the canopy tint, the park cells, the
 *        offshore bits. Kept as a callback because every one of those is the
 *        CITY's data and this file may not know a city.
 * @param regional the REGIONAL shoreline rings — `data.surroundCoast().rings`.
 *        Optional: when it is not supplied this resolves them itself, which
 *        costs one rebuild in a microtask because the mount has already
 *        awaited that same promise. Passing them avoids the rebuild.
 */
export function terrainLayer(
  data: CityData,
  zexByStep: readonly number[],
  prepare?: (t: TerrainField) => void,
  regional?: readonly Ring[] | null,
): TerrainLayer {
  const chunk = data.get("base/terrain");
  if (!chunk) throw new Error("terrain: base/terrain has not landed");
  const proj = data.manifest.proj as unknown as TerrainProj;
  const N = proj.N;
  const step = 1 / proj.s;

  const fields = new Map<number, TerrainField>();
  const colours = new Map<number, Float32Array>();
  const normals = new Map<number, Float32Array>();

  function fieldFor(s: number): TerrainField {
    let t = fields.get(s);
    if (!t) {
      t = new TerrainField(chunk!, proj, { zex: zexByStep[s] ?? zexByStep[0] });
      prepare?.(t);
      fields.set(s, t);
    }
    return t;
  }

  const t0 = fieldFor(0);

  /* the city's own published waterfront — the register that resolves a pier */
  const coastChunk = data.get("base/coast");
  const cityRings: Ring[] = coastChunk ? decodeCoast(coastChunk).coast : [];

  /* ── THE SUB-VERTICES, DESCRIBED RATHER THAN STORED TWICE ──────────────
     A refined cell's extra vertices are a bilinear blend of its own four
     nodes, so all a colour rebuild needs is WHICH cell and WHERE in it. Four
     small arrays instead of a second copy of the geometry, and a band change
     then costs the same arithmetic on them as it does on the base lattice. */
  let exI = new Int32Array(0);
  let exJ = new Int32Array(0);
  let exU = new Float32Array(0);
  let exV = new Float32Array(0);
  let stats: CoastStats | null = null;

  /* the hem's own compact buffers: which base vertex each of its vertices is,
     and the alpha it fades to — see §THE OTHER EDGE */
  let hemSrc = new Int32Array(0);
  let hemA = new Float32Array(0);
  const hemG = new BufferGeometry();
  /* ── WHERE THE HEM SITS IN THE STACK ────────────────────────────────────
     renderOrder -4 bay, -3 far shore, -2 HERE and the shore wash, 0 the city.
     After the far shore because it dissolves INTO it, and it writes no depth
     so nothing after it has to know it is there. Nothing is drawn on this
     ground — it is the ground past the city's own record, which is why it is
     the piece that may be given up to a fade. */
  const hemM = new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const hemMesh = new Mesh(hemG, hemM);
  hemMesh.renderOrder = -2;
  hemMesh.receiveShadow = true;
  hemMesh.castShadow = false;
  hemMesh.visible = false;

  /** the far shore's own land bit, which is what says the join is not a coast */
  const sur = data.surround();

  const g = new BufferGeometry();
  /* BASIC LIGHTING, AND THE HILLSHADE IS ALREADY IN THE COLOURS: the mesh's
     normals point straight up (below), so the sun adds no second hillshade
     and the one thing it does add is the cast shadow. */
  const m = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(g, m);
  mesh.matrixAutoUpdate = true;
  mesh.renderOrder = 0;
  /* ── THE GROUND RECEIVES AND DOES NOT CAST, AND THIS IS THE WEDGE FIX ──
     It used to cast, on this justification: *"a hill puts its own far slope
     in shadow, which no hillshade can do: a hillshade is a function of the
     slope AT a point and knows nothing about the ridge between that point
     and the sun."*

     **That is not true of this field.** `lib/city/terrain.ts` §THE HILL OVER
     THE VALLEY (`buildTsh`) marches every DEM node along the sun's own
     horizontal direction for twenty cells and asks exactly that question —
     what stands between this node and the sun — at the same vertical
     exaggeration the mesh is drawn at. `lamSh` takes `terrk` = 0.8 of the
     direct term away where it answers yes, and `coloursFor` below bakes the
     result into every vertex colour this mesh uploads. The ridge shadow was
     already in the picture, at the DEM's own resolution, with the overshoot
     carried as a penumbra and a 1-2-1 smooth over it, and COOL rather than
     merely dark — a `lam` driven toward 0 crosses `LAM0`, and the node is
     then coloured through `SKYC` instead of `SUNC`.

     Casting as well drew that shadow a SECOND time, and the second copy was
     the bad one:

       - it was resolved on a 53.8 m triangulated mesh through a shadow map,
         so its boundary was a polyline of 53.8 m segments at arbitrary
         angles, where the baked copy's boundary is a full-resolution ramp;
       - it was neutral grey where the baked copy is cool;
       - and it landed on a surface whose normals all point straight up (see
         §THE GROUND'S NORMALS below), so nothing leads into it. A real
         terminator hides itself — the surface is already dark where its own
         shadow starts. With a constant N.L the shadow arrives instead as a
         flat step of about 20 of 255 with no ramp in front of it.

     A hard-edged 53.8 m polygon of flat grey lying across open ground is
     what the frame was showing at Silver Ave, at the Industrial St ramps and
     at Panorama Dr, and it is what a reader called torn tarpaulins.

     MEASURED at the Panorama Dr street camera: clearing this flag alone
     changes 3.39 % of the frame by 20.7 of 255 in the mean, and removing the
     shadow pass entirely (`?sm=0`) moves those same pixels by 20.2 — so the
     ground was contributing effectively ALL of what the shadow map put on
     open hillside. It is not acne: twenty times the normal bias (11 m
     against a 0.55 m texel, enough to erase any acne several times over)
     moves that same figure only from 20.7 to 15.1. It is real occlusion — an
     independent horizon march over the shipped DEM at the shipped sun puts
     23.3 % of the city's land cells in terrain self-shadow at true scale and
     24.2 % at the whole-city band's 3.3x. Real, correct, and drawn once
     already.

     WHAT IS GIVEN UP. A hill can no longer put a BUILDING on its far slope
     into shade; only the ground remembers the ridge. That is a real loss and
     it is the smaller one: it costs a few buildings a shading they largely
     read as grey anyway, where keeping it cost every open hillside in the
     city a torn edge across it. Recovering it means letting a building
     sample the ground's own `tsh` where it stands, which is
     `layers/buildings.ts` and not this file.

     Buildings, caps, heroes and tree crowns are untouched: they still cast,
     and this mesh still RECEIVES, so their shadows still fall across the
     ground exactly as before. */
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  /* a CHILD of the ground, so the mount adds one object and gets both. Both
     sit at the identity transform, and `mesh.scale.y` is the band's
     exaggeration — which the hem must take too, being the same ground. */
  mesh.add(hemMesh);

  let curStep = -1;

  function coloursFor(s: number): Float32Array {
    let col = colours.get(s);
    if (col) return col;
    const t = fieldFor(s);
    const E = exI.length;
    col = new Float32Array((N * N + E) * 3);
    const c = new Color();
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = t.node(i, j, 0);
        const o = (i * N + j) * 3;
        /* ── sRGB IN, LINEAR OUT, AND THIS IS NOT A DETAIL ──────────────
           `nodeR/G/B` are the bytes the Canvas path writes straight into a
           2D context: sRGB. three.js treats a vertex colour as LINEAR and
           converts it to sRGB on the way out, so handing it sRGB values
           raises everything a second time — the ground came out white-hot
           and the city read as black silhouettes on paper
           (shots/b2-gl-block.png). `setRGB(..., SRGBColorSpace)` converts
           into the working space, and the round trip then returns exactly
           the byte the Canvas renderer would have written. */
        c.setRGB(t.nodeR(k) / 255, t.nodeG(k) / 255, t.nodeB(k) / 255, SRGBColorSpace);
        col[o] = c.r;
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      }
    }
    /* the sub-vertices, blended in the WORKING space rather than in bytes. On
       a cell EDGE a bilinear blend degenerates to a linear one, which is
       exactly what the neighbouring whole quad interpolates along that same
       edge — so a refined cell and a whole cell meet with no seam in colour,
       any more than they do in position. */
    for (let e = 0; e < E; e++) {
      const i = exI[e];
      const j = exJ[e];
      const u = exU[e];
      const v = exV[e];
      const o = (N * N + e) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const a = col[(i * N + j) * 3 + ch];
        const b = col[((i + 1) * N + j) * 3 + ch];
        const cc = col[((i + 1) * N + (j + 1)) * 3 + ch];
        const d = col[(i * N + (j + 1)) * 3 + ch];
        col[o + ch] = (a * (1 - u) + b * u) * (1 - v) + (d * (1 - u) + cc * u) * v;
      }
    }
    colours.set(s, col);
    return col;
  }

  /**
   * The ground's normals for a band — see §THE GROUND'S FORM.
   *
   * One buffer per band, built lazily and swapped, exactly as the colours are
   * and for the same reason: a normal reads a slope, and a slope is
   * exaggerated, so a band change moves it. Three buffers at 67,600 nodes.
   */
  function normalsFor(sIdx: number): Float32Array {
    let n = normals.get(sIdx);
    if (n) return n;
    const E = exI.length;
    n = new Float32Array((N * N + E) * 3);
    const zx = zexByStep[sIdx] ?? zexByStep[0];

    /* the TRUE normal at every node, off the published elevation, at the
       exaggeration this band actually draws it at */
    const tx = new Float32Array(N * N);
    const ty = new Float32Array(N * N);
    const tz = new Float32Array(N * N);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const ia = i > 0 ? i - 1 : i;
        const ib = i < N - 1 ? i + 1 : i;
        const ja = j > 0 ? j - 1 : j;
        const jb = j < N - 1 ? j + 1 : j;
        const gx = ((t0.elevAt(ib, j) - t0.elevAt(ia, j)) / ((ib - ia) * step)) * zx;
        const gy = ((t0.elevAt(i, jb) - t0.elevAt(i, ja)) / ((jb - ja) * step)) * zx;
        const L = Math.hypot(gx, gy, 1);
        const k = i * N + j;
        tx[k] = -gx / L;
        ty[k] = 1 / L;
        tz[k] = -gy / L;
      }

    /* the LANDFORM-scale normal: the same field, low-passed. Separable 1-2-1,
       `FORM_LOWPASS` times each way — the same kernel `lib/city/terrain.ts`
       uses on its own penumbra, at a width chosen here rather than there. */
    const lowpass = (a: Float32Array): Float32Array => {
      let src: Float32Array<ArrayBufferLike> = a;
      let dst: Float32Array<ArrayBufferLike> = new Float32Array(N * N);
      for (let pass = 0; pass < FORM_LOWPASS; pass++) {
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N; j++) {
            const k = i * N + j;
            const l = j > 0 ? src[k - 1] : src[k];
            const r = j < N - 1 ? src[k + 1] : src[k];
            dst[k] = (l + 2 * src[k] + r) * 0.25;
          }
        let t: Float32Array<ArrayBufferLike> = src;
        src = dst;
        dst = t === a ? new Float32Array(N * N) : t;
        for (let i = 0; i < N; i++)
          for (let j = 0; j < N; j++) {
            const k = i * N + j;
            const u = i > 0 ? src[k - N] : src[k];
            const d = i < N - 1 ? src[k + N] : src[k];
            dst[k] = (u + 2 * src[k] + d) * 0.25;
          }
        t = src;
        src = dst;
        dst = t;
      }
      return src as Float32Array;
    };
    const bx = lowpass(tx);
    const by = lowpass(ty);
    const bz = lowpass(tz);

    const put = (i: number, j: number, o: number): void => {
      const k = i * N + j;
      const vx = (tx[k] - bx[k]) * FORM_K;
      const vy = 1 + (ty[k] - by[k]) * FORM_K;
      const vz = (tz[k] - bz[k]) * FORM_K;
      const L = Math.hypot(vx, vy, vz);
      n![o] = vx / L;
      n![o + 1] = vy / L;
      n![o + 2] = vz / L;
    };
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) put(i, j, (i * N + j) * 3);
    /* a sub-vertex takes its own cell's node rather than a blend: the normal
       is already the smooth part of a smooth field, and the four corners of a
       53.8 m cell differ by less than the coast refinement's own K = 6 step */
    for (let e = 0; e < E; e++) put(exI[e], exJ[e], (N * N + e) * 3);

    normals.set(sIdx, n);
    return n;
  }

  /** the hem's RGBA, out of the band's own colour buffer plus the stored fade */
  function hemColours(col: Float32Array): Float32Array {
    const out = new Float32Array(hemSrc.length * 4);
    for (let v = 0; v < hemSrc.length; v++) {
      const b = hemSrc[v] * 3;
      out[v * 4] = col[b];
      out[v * 4 + 1] = col[b + 1];
      out[v * 4 + 2] = col[b + 2];
      out[v * 4 + 3] = hemA[v];
    }
    return out;
  }

  /**
   * Build the geometry against a coast mask, or against nothing.
   *
   * Called once at construction and, when the regional rings were not handed
   * over, once more when they resolve. Nothing else rebuilds it: a published
   * shoreline does not move with the band or with the year.
   */
  function build(mask: CoastMask | null): void {
    const idx: number[] = [];
    const exi: number[] = [];
    const exj: number[] = [];
    const exu: number[] = [];
    const exv: number[] = [];
    const KK = COAST_K * COAST_K;
    let whole = 0;
    let refined = 0;
    let dropped = 0;
    let subKept = 0;
    let maskCells = 0;

    /* the corner→vertex map for ONE refined cell: (K+1)^2 slots, invalidated
       by a generation counter rather than refilled, because it is walked once
       per coastal cell and there are a couple of thousand of them */
    const slotN = (COAST_K + 1) * (COAST_K + 1);
    const slot = new Int32Array(slotN);
    const slotGen = new Int32Array(slotN);
    let gen = 0;

    /* ── PASS 1: WHAT IS BUILT, AND HOW FAR IT IS FROM THE DATA'S EDGE ────
       `cnt` is the sub-cell count per cell, kept so the emit pass does not
       scan the mask twice. `hemD` is a breadth-first distance IN CELLS from
       the join — the cells that are not built and have far-shore land under
       them — walked through built cells only, so it cannot leak across water
       and put a fade on a coastline. See §THE OTHER EDGE. */
    const cnt = new Int16Array(N * N).fill(-1);
    const hemD = new Int16Array(N * N).fill(-1);
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        if (!t0.maskAt(i, j)) continue;
        maskCells++;
        cnt[i * N + j] = mask ? mask.countIn(i, j) : KK;
      }
    }
    if (sur) {
      const q: number[] = [];
      for (let i = 0; i < N - 1; i++) {
        for (let j = 0; j < N - 1; j++) {
          if (cnt[i * N + j] > 0) continue; // built: not a seed
          const x = proj.X0 + (i + 0.5) * step;
          const y = proj.Y0 + (j + 0.5) * step;
          const si = Math.floor((x - sur.mx[0]) / sur.cellW);
          const sj = Math.floor((y - sur.my[0]) / sur.cellH);
          if (si < 0 || sj < 0 || si >= sur.XW || sj >= sur.XH) continue;
          if (!sur.isLand(si, sj)) continue;
          hemD[i * N + j] = 0;
          q.push(i * N + j);
        }
      }
      for (let head = 0; head < q.length; head++) {
        const k = q[head];
        const dcur = hemD[k];
        if (dcur >= HEM_CELLS) continue;
        const i = (k / N) | 0;
        const j = k % N;
        const push = (ii: number, jj: number): void => {
          if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) return;
          const kk = ii * N + jj;
          if (cnt[kk] <= 0) return; // only through built ground
          if (hemD[kk] >= 0) return;
          hemD[kk] = dcur + 1;
          q.push(kk);
        };
        push(i + 1, j);
        push(i - 1, j);
        push(i, j + 1);
        push(i, j - 1);
      }
    }

    /** the fade at a NODE: the nearest of the four cells that meet at it */
    const RAMP = HEM_CELLS + 1;
    const nodeAlpha = (i: number, j: number): number => {
      let m = RAMP;
      for (let a = -1; a <= 0; a++) {
        for (let b = -1; b <= 0; b++) {
          const ii = i + a;
          const jj = j + b;
          if (ii < 0 || jj < 0 || ii >= N - 1 || jj >= N - 1) continue;
          const k = ii * N + jj;
          const v = cnt[k] > 0 ? (hemD[k] < 0 ? RAMP : hemD[k]) : hemD[k] === 0 ? 0 : RAMP;
          if (v < m) m = v;
        }
      }
      return m / RAMP;
    };

    // ── PASS 2: the triangles ────────────────────────────────────────────
    const hidx: number[] = [];
    const hsrc: number[] = [];
    const halpha: number[] = [];
    const hmap = new Map<number, number>();
    let hem = 0;
    const hvert = (base: number, i: number, j: number, u: number, v: number): number => {
      const had = hmap.get(base);
      if (had !== undefined) return had;
      const k = hsrc.length;
      hsrc.push(base);
      /* a sub-vertex takes the bilinear blend of its cell's four node fades,
         the same rule its colour and its elevation take */
      const a0 = nodeAlpha(i, j);
      const b0 = nodeAlpha(i + 1, j);
      const c0 = nodeAlpha(i + 1, j + 1);
      const d0 = nodeAlpha(i, j + 1);
      halpha.push((a0 * (1 - u) + b0 * u) * (1 - v) + (d0 * (1 - u) + c0 * u) * v);
      hmap.set(base, k);
      return k;
    };

    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const n = cnt[i * N + j];
        if (n < 0) continue;
        const a = i * N + j;
        const b = (i + 1) * N + j;
        const c = (i + 1) * N + (j + 1);
        const d = i * N + (j + 1);
        const inHem = hemD[i * N + j] > 0;
        const push6 = (p0: number, p1: number, p2: number, p3: number,
          uv: readonly [number, number][]): void => {
          if (!inHem) {
            idx.push(p0, p1, p2, p0, p2, p3);
            return;
          }
          const q0 = hvert(p0, i, j, uv[0][0], uv[0][1]);
          const q1 = hvert(p1, i, j, uv[1][0], uv[1][1]);
          const q2 = hvert(p2, i, j, uv[2][0], uv[2][1]);
          const q3 = hvert(p3, i, j, uv[3][0], uv[3][1]);
          hidx.push(q0, q1, q2, q0, q2, q3);
        };
        if (n === KK) {
          whole++;
          subKept += KK;
          if (inHem) hem++;
          push6(a, b, c, d, [[0, 0], [1, 0], [1, 1], [0, 1]]);
          continue;
        }
        if (n === 0) {
          dropped++;
          continue;
        }
        refined++;
        if (inHem) hem++;
        gen++;
        const vert = (su: number, sv: number): number => {
          if (su === 0 && sv === 0) return a;
          if (su === COAST_K && sv === 0) return b;
          if (su === COAST_K && sv === COAST_K) return c;
          if (su === 0 && sv === COAST_K) return d;
          const k = sv * (COAST_K + 1) + su;
          if (slotGen[k] === gen) return slot[k];
          const v = N * N + exi.length;
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
            const K1 = COAST_K;
            push6(p0, p1, p2, p3, [
              [si / K1, sj / K1],
              [(si + 1) / K1, sj / K1],
              [(si + 1) / K1, (sj + 1) / K1],
              [si / K1, (sj + 1) / K1],
            ]);
          }
        }
      }
    }

    const E = exi.length;
    exI = Int32Array.from(exi);
    exJ = Int32Array.from(exj);
    exU = Float32Array.from(exu);
    exV = Float32Array.from(exv);

    // ── positions: one vertex per DEM node, elevation in REAL metres ───────
    const pos = new Float32Array((N * N + E) * 3);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const o = (i * N + j) * 3;
        pos[o] = proj.X0 + i * step;
        pos[o + 1] = t0.elevAt(i, j);
        pos[o + 2] = proj.Y0 + j * step;
      }
    }
    for (let e = 0; e < E; e++) {
      const i = exI[e];
      const j = exJ[e];
      const u = exU[e];
      const v = exV[e];
      const za = t0.elevAt(i, j);
      const zb = t0.elevAt(i + 1, j);
      const zc = t0.elevAt(i + 1, j + 1);
      const zd = t0.elevAt(i, j + 1);
      const o = (N * N + e) * 3;
      pos[o] = proj.X0 + (i + u) * step;
      pos[o + 1] = (za * (1 - u) + zb * u) * (1 - v) + (zd * (1 - u) + zc * u) * v;
      pos[o + 2] = proj.Y0 + (j + v) * step;
    }

    hemSrc = Int32Array.from(hsrc);
    hemA = Float32Array.from(halpha);

    colours.clear();
    normals.clear();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    const col0 = coloursFor(curStep < 0 ? 0 : curStep);
    g.setAttribute("color", new BufferAttribute(col0, 3));
    g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));

    // ── the hem, as its own compact copy of the vertices it uses ──────────
    if (hidx.length) {
      const hp = new Float32Array(hemSrc.length * 3);
      /* the hem takes the ground's own normals: it IS the ground, and a
         normal that disagreed with its neighbour's would put a shading seam
         exactly where this mesh exists to remove one */
      const nrm0 = normalsFor(curStep < 0 ? 0 : curStep);
      const hn = new Float32Array(hemSrc.length * 3);
      for (let v = 0; v < hemSrc.length; v++) {
        const b = hemSrc[v] * 3;
        hp[v * 3] = pos[b];
        hp[v * 3 + 1] = pos[b + 1];
        hp[v * 3 + 2] = pos[b + 2];
        hn[v * 3] = nrm0[b];
        hn[v * 3 + 1] = nrm0[b + 1];
        hn[v * 3 + 2] = nrm0[b + 2];
      }
      hemG.setAttribute("position", new BufferAttribute(hp, 3));
      hemG.setAttribute("normal", new BufferAttribute(hn, 3));
      hemG.setAttribute("color", new BufferAttribute(hemColours(col0), 4));
      hemG.setIndex(new BufferAttribute(new Uint32Array(hidx), 1));
      hemG.computeBoundingSphere();
      hemMesh.visible = true;
    } else {
      hemMesh.visible = false;
    }
    g.setAttribute("normal", new BufferAttribute(normalsFor(curStep < 0 ? 0 : curStep), 3));
    g.computeBoundingSphere();

    const cellA = step * step;
    stats = {
      maskCells,
      whole,
      refined,
      dropped,
      areaMask: maskCells * cellA,
      areaBuilt: (subKept / KK) * cellA,
      K: COAST_K,
      hem,
    };
  }

  function maskFor(reg: readonly Ring[] | null): CoastMask | null {
    const sets: (readonly Ring[])[] = [];
    if (cityRings.length) sets.push(cityRings);
    if (reg && reg.length) sets.push(reg);
    /* ── ONE REGISTER IS NOT ENOUGH TO CUT ANYTHING ────────────────────
       Either alone deletes a piece of the city — the county outline deletes
       the two other counties this DEM reaches into, the regional hydrography
       deletes the waterfront the 300 m pad exists to keep. `coast-mask.ts`
       §THE UNION has the counts. With only one of the two in hand the honest
       answer is the staircase, which is what the published page ships. */
    if (sets.length < 2) return null;
    return rasteriseRings(
      sets,
      { x0: proj.X0, y0: proj.Y0, nx: N - 1, ny: N - 1, cellW: step, cellH: step },
      COAST_K,
    );
  }

  build(maskFor(regional ?? null));
  if (!regional) {
    /* the mount has already awaited this same promise, so it is resolved and
       the rebuild lands in a microtask — before the first frame, and long
       before the tiers that follow it */
    void data
      .surroundCoast()
      .catch(() => null)
      .then((sc) => {
        if (!sc || !sc.rings.length) return;
        build(maskFor(sc.rings as readonly Ring[]));
      });
  }

  const layer: TerrainLayer = {
    name: "terrain",
    mesh,
    fieldFor,
    coastStats: () => stats,
    onStep(s: number, zex: number) {
      if (s === curStep) return;
      curStep = s;
      mesh.scale.y = zex;
      const col = coloursFor(s);
      g.setAttribute("color", new BufferAttribute(col, 3));
      (g.getAttribute("color") as BufferAttribute).needsUpdate = true;
      const nrm = normalsFor(s);
      g.setAttribute("normal", new BufferAttribute(nrm, 3));
      (g.getAttribute("normal") as BufferAttribute).needsUpdate = true;
      if (hemMesh.visible) {
        hemG.setAttribute("color", new BufferAttribute(hemColours(col), 4));
        (hemG.getAttribute("color") as BufferAttribute).needsUpdate = true;
        const hn = new Float32Array(hemSrc.length * 3);
        for (let v = 0; v < hemSrc.length; v++) {
          const b = hemSrc[v] * 3;
          hn[v * 3] = nrm[b];
          hn[v * 3 + 1] = nrm[b + 1];
          hn[v * 3 + 2] = nrm[b + 2];
        }
        hemG.setAttribute("normal", new BufferAttribute(hn, 3));
        (hemG.getAttribute("normal") as BufferAttribute).needsUpdate = true;
      }
    },
    dispose() {
      g.dispose();
      m.dispose();
      hemG.dispose();
      hemM.dispose();
      fields.clear();
      colours.clear();
      normals.clear();
    },
  };
  return layer;
}
