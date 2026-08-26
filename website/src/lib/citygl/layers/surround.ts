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
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import {
  HAZE,
  QF,
  XBASE_K,
  buildSurroundLam,
  reliefK,
  skylitN,
  tiltOf,
  type TerrainField,
} from "@/lib/city/terrain";
import type { CityLayer } from "../engine";

/** the hypsometric pair `rasteriseSurround` interpolates between */
const LOW = [0xec, 0xe5, 0xd6] as const;
const HIGH = [0xcf, 0xc3, 0xab] as const;
const TINT_ZMAX = 300;

/**
 * ── THE FAR SHORE IS CUT AT THE PUBLISHED LINE, AND THIS WAS MISSING ──────
 *
 * `part3.html` §4426 sets ONE clip for the whole surround at the published
 * regional shoreline and draws every cell inside it. Without it the far shore
 * is the 110.01 x 139.15 m cell lattice — *"a staircase whose tread is longer
 * than a San Francisco block, on the two edges of the frame the eye reads as
 * the horizon"* — and, worse than ugly, it is BIGGER than the land: every
 * coastal cell whose centre is land paints its whole 110 x 139 m, so a
 * headland grows by up to a cell in every direction.
 *
 * Put the two whole-city frames side by side at the Marin headlands and the
 * published page draws a thin hazed strip while the port drew a chunky white
 * massif several times its width. Measured over that crop the page reads
 * (157, 173, 190) — land washed most of the way to the water — against the
 * port's (225, 226, 215), which is not a paler headland, it is a much larger
 * one.
 *
 * A raster clips with a path; a mesh cannot, so it drops the CELL. The cut is
 * therefore per cell rather than per pixel and the staircase is reduced rather
 * than removed — a headland is now at most half a cell too big instead of a
 * whole one, and it is no longer systematically too big in every direction.
 * Each ring is boxed first, so this is the rings' own area and not the grid's.
 */
function insideRings(
  rings: readonly (readonly (readonly [number, number])[])[],
  boxes: readonly Float64Array[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let r = 0; r < rings.length; r++) {
    const bb = boxes[r];
    if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
    const ring = rings[r];
    const n = ring.length;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const yi = ring[k][1];
      const yj = ring[j][1];
      if (yi > y !== yj > y) {
        const xi = ring[k][0];
        const xj = ring[j][0];
        if (x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
      }
    }
  }
  return inside;
}

export function surroundLayer(
  data: CityData,
  field: TerrainField,
  zexByStep: readonly number[],
  clip?: readonly (readonly (readonly [number, number])[])[] | null,
): (CityLayer & { mesh: Mesh }) | null {
  const sd = data.surround();
  if (!sd) return null;
  const s = sd; // narrowed once, so the closures below do not have to re-test

  const XW = s.XW;
  const XH = s.XH;
  const XNW = XW + 1;
  const XNH = XH + 1;

  const hz = [
    parseInt(HAZE.slice(1, 3), 16),
    parseInt(HAZE.slice(3, 5), 16),
    parseInt(HAZE.slice(5, 7), 16),
  ];

  // ── positions: one vertex a node, elevation in REAL metres ───────────────
  const pos = new Float32Array(XNW * XNH * 3);
  for (let j = 0; j < XNH; j++) {
    for (let i = 0; i < XNW; i++) {
      const ii = Math.min(i, XW - 1);
      const jj = Math.min(j, XH - 1);
      const o = (j * XNW + i) * 3;
      pos[o] = s.mx[i];
      pos[o + 1] = s.z(ii, jj);
      pos[o + 2] = s.my[j];
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
  const boxes: Float64Array[] = [];
  if (rings) {
    for (const ring of rings) {
      const bb = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);
      for (const [x, y] of ring) {
        if (x < bb[0]) bb[0] = x;
        if (y < bb[1]) bb[1] = y;
        if (x > bb[2]) bb[2] = x;
        if (y > bb[3]) bb[3] = y;
      }
      boxes.push(bb);
    }
  }

  const idx: number[] = [];
  let cut = 0;
  for (let j = 0; j < XH; j++) {
    for (let i = 0; i < XW; i++) {
      if (!s.isOwn(i, j) || !s.isLand(i, j)) continue;
      if (rings) {
        const [cxm, cym] = s.centre(i, j);
        if (!insideRings(rings, boxes, cxm, cym)) {
          cut++;
          continue;
        }
      }
      const a = j * XNW + i;
      const b = j * XNW + (i + 1);
      const c = (j + 1) * XNW + (i + 1);
      const d = (j + 1) * XNW + i;
      idx.push(a, b, c, a, c, d);
    }
  }
  void cut;

  const out = new Float64Array(3);
  const cc = new Color();
  const colours = new Map<number, Float32Array>();
  function coloursFor(step: number): Float32Array {
    let col = colours.get(step);
    if (col) return col;
    const zex = zexByStep[step] ?? zexByStep[0];
    const lam = buildSurroundLam(XW, XH, s.z, s.cellW, s.cellH, zex);
    col = new Float32Array(XNW * XNH * 3);
    for (let j = 0; j < XNH; j++) {
      for (let i = 0; i < XNW; i++) {
        const ii = Math.min(i, XW - 1);
        const jj = Math.min(j, XH - 1);
        const za = s.z(ii, jj);
        const l = lam[jj * XW + ii];
        const tt = Math.min(1, Math.pow(za / TINT_ZMAX, 0.8));
        const R0 = LOW[0] + (HIGH[0] - LOW[0]) * tt;
        const G0 = LOW[1] + (HIGH[1] - LOW[1]) * tt;
        const B0 = LOW[2] + (HIGH[2] - LOW[2]) * tt;
        const lamK = (QF.relief ? reliefK(l) : 0.9 + 0.15 * l) * (QF.xlam ? XBASE_K : 1);
        skylitN(R0, G0, B0, lamK, tiltOf(l), out);
        const h = field.hazeAt(s.mx[i], s.my[j]);
        const o = (j * XNW + i) * 3;
        // sRGB in, linear out — see `terrain.ts` §sRGB IN, LINEAR OUT
        cc.setRGB(
          (out[0] + (hz[0] - out[0]) * h) / 255,
          (out[1] + (hz[1] - out[1]) * h) / 255,
          (out[2] + (hz[2] - out[2]) * h) / 255,
          SRGBColorSpace,
        );
        col[o] = cc.r;
        col[o + 1] = cc.g;
        col[o + 2] = cc.b;
      }
    }
    colours.set(step, col);
    return col;
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
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
  const up = new Float32Array(XNW * XNH * 3);
  for (let v = 0; v < XNW * XNH; v++) up[v * 3 + 1] = 1;
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
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = -3;
  mesh.receiveShadow = true;

  let curStep = -1;

  return {
    name: "surround",
    mesh,
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
      colours.clear();
    },
  };
}
