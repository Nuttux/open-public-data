/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/water.ts — THE BAY, AS ONE BAKED SURFACE.

   ── WHY THIS IS A TEXTURE AND NOT A SHADER ───────────────────────────────
   The Canvas renderer draws the water as three stacked CPU plates — a radial
   bay gradient, a shallows wash, a bathymetry blit — plus a fourth pass for
   the distance fade, each rebuilt whenever the camera moves far enough.

   Every one of those four is a function of the WORLD POSITION and of nothing
   else: the published depth at that point, and how far that point is from
   downtown. Not of the camera, not of the year, not of the zoom. A quantity
   that depends only on where it is can be computed ONCE, into a texture, and
   sampled for ever.

   The first cut here was a fragment shader, which is the obvious thing and
   was wrong twice over: it recomputed a constant sixty times a second, and a
   hand-written `ShaderMaterial` is invisible to every renderer feature that
   substitutes its own material — a shadow pass, a normal pass — and to the
   WebGPU backend, which compiles from a node graph and not from GLSL.
   Baking removes the shader, so this layer works unchanged on both backends
   and costs one texture fetch.

   ── WHAT IS PUBLISHED AND WHAT IS DECLARED, UNCHANGED ────────────────────
   `lib/city/water.ts` §THE BAY HAS A FLOOR is the argument and it carries
   over word for word: the DEPTH at every node is published, the ramp's stops
   are that distribution's own quantiles, and the ramp's direction is the
   page's own shoal-to-open step. Declared: the spread, the deep tail and the
   fade. `depthRamp`, `depthM` and `depthColour` are read from the Canvas
   module rather than restated, so the two renderers put the same colour on
   the same square metre of bay.

   ── THE FADE IS THE SAME CIRCLE, WRITTEN THE OTHER WAY ROUND ─────────────
   `drawDepthHaze` builds a radial gradient in SCREEN pixels out of `kx`, the
   pixels-per-metre factor — so what it actually describes is a circle in the
   WORLD: transparent inside 3,400 m of downtown, `WA.hazecap` at
   3,400 + 15,000 x cap metres. As a world distance it is camera-independent
   by construction, which is a whole class of rebuild gone.

   ── AND THEN IT WAS THE LARGEST FLAT AREA IN THE FRAME ───────────────────
   The bay is roughly 40 % of the whole-city picture. Three things were wrong
   with it and each has its own section below: the depth was sampled NEAREST
   (§THE BLOCKS WERE THE DEPTH GRID), the plate quantised a slow gradient to
   eight bits with no dither (§THE BANDS), and the surface had no event on it
   at all — no glint, and no mark where it meets the land (§THE GLINT,
   §THE FOAM).
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from "three";

import type { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import {
  BAY_OPEN,
  BAY_SHOAL,
  decodeCoast,
  depthColour,
  depthM,
  depthRamp,
  type WaterMeta,
} from "@/lib/city/water";
import { HAZE, WA, lerpHex } from "@/lib/city/terrain";
import { axonBasis } from "../camera";
import { rasteriseRings, type Ring } from "../coast-mask";
import { SUN_SCENE } from "../light";
import type { CityLayer } from "../engine";

/** the two radii `drawDepthHaze` and `bayPlate` are written in, in metres */
const FADE_R0_M = 3400;
const FADE_SPAN_M = 15000;

/**
 * How finely the baked plate is sampled.
 *
 * The plate is not the survey: it reaches `reachM` past it so nothing beyond
 * the bathymetry is a hole, which makes it about 80 km on a side. At the
 * original 1024 that is 78 m a texel — 7.4 SCREEN pixels at the whole-city
 * camera, which is coarse enough that the linear filter's own ramps read as
 * Mach bands. 1536 puts it at 52 m and 4.9 px, for 9.4 MB of texture; past
 * that the bake starts to cost a visible hitch at load for a gradient the
 * dither has already fixed.
 */
const BAKE_W = 1536;

/* ── THE FOAM ─────────────────────────────────────────────────────────────
   Where the water meets the land the published page has a pale rim under the
   shoreline ink (`water.ts` §THE RIM), drawn on the LAND side: *"a model's
   edge meets its resin"*. It has nothing on the water side, because a 2D
   context that repaints the bay inside a corridor does not need one.

   This does. With the ground now cut at the published line
   (`terrain.ts` §THE COAST) the shore is a hard geometric edge between two
   flat colours, and an edge between two flat colours is the one thing a
   drawing of water must not have. The wash is a band on the WATER side of
   that edge, at full strength on the waterline and gone `FOAM_OUT` metres
   out — see `buildFoam` for why it is a distance FIELD and not a ribbon.

   Every number here is DECLARED, not published: no register carries a surf
   width. 55 m is the smallest band that survives the whole-city camera —
   5.3 px there — and it is a plausible surf line at the district camera,
   where it is 26 px. */
const FOAM_OUT = 55;
/** the wash's alpha ON the waterline; it reaches zero at `FOAM_OUT` */
const FOAM_A = 0.34;
/** the falloff's exponent — above 1 the wash hugs the line instead of hazing out */
const FOAM_FALL = 1.6;
/** how far toward white the published shoal tone is carried */
const FOAM_WHITE = 0.38;
/** the lattice the union land mask is scanned onto, metres — see §THE FOAM */
/* ── AND 25 m WAS TOO COARSE TO BE A GRADIENT ───────────────────────────
   The wash is 55 m wide, so at a 25 m grid it crossed from full to nothing in
   about two cells — a two-step ramp, and with the node's min-of-four filter on
   top of it that reads as flat plateaus with hard sides. Rendered alone at the
   Marina at a 1,100 m camera it was a stair-stepped pale mass lying over the
   harbour, which is what Daniel saw as a hard-edged band and what a bisect over
   the scene could not find, because this mesh is a CHILD of the bay plate and
   never appears in `scene.children`.

   At 12 m the same 55 m band gets four and a half cells, which is a ramp. It
   costs four times the cells — the shore is a curve through a grid, so the
   count goes as 1/cell, not 1/cell squared, and measured that is about 51,000
   cells against 25,599. */
const FOAM_CELL = 12;

/* ── THE GLINT ────────────────────────────────────────────────────────────
   A flat plane under an ORTHOGRAPHIC camera cannot have a specular
   highlight: the view direction and the light direction are both constant, so
   `dot(n, h)` is one number over the whole bay and the plate would simply be a
   different flat colour. What makes real water glitter is that it is NOT
   flat — the facets of the swell turn toward the half-vector and away from it,
   and the eye reads the ones that turn toward it as light.

   So the field this bakes is the SWELL, and the glint is where its facets
   point at the sun. Three sinusoids, wavelengths 2,300 / 1,150 / 610 m — long
   enough that a 52 m texel resolves them (12 texels on the shortest) and short
   enough that the whole-city frame holds a dozen of them. That is a swell at
   the scale of a chart rather than of a photograph, which is the register this
   page is drawn in.

   The two directions are taken, not invented: `light.ts` §aimKey swings the
   sun's AZIMUTH round to the camera's screen-right and keeps its published
   HEIGHT, and `camera.ts` gives the view axis for the fixed bearing. Both are
   read here rather than restated, so a change to the sun moves the glint. */
const WAVES: readonly { lam: number; deg: number; amp: number; ph: number }[] = [
  { lam: 2300, deg: 24, amp: 1.0, ph: 0.0 },
  { lam: 1150, deg: -13, amp: 0.55, ph: 1.9 },
  { lam: 610, deg: 41, amp: 0.3, ph: 3.7 },
];
/** how sharply the lobe closes — 3 lights roughly an eighth of the open bay */
const GLINT_P = 3;
/** how far toward white a fully lit facet is carried */
const GLINT_GAIN = 0.17;

export interface WaterLayerOptions {
  /** the fade's centre — the city's own downtown, from its manifest */
  anchor: readonly [number, number];
  /** how far out the plane reaches, world metres, beyond the survey */
  reachM?: number;
}

function rgb255(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * THE SUN THIS SURFACE ACTUALLY SEES.
 *
 * `light.ts` §aimKey: the rig keeps the published sun's HEIGHT — which is what
 * sets the length of every shadow — and takes the camera's own screen-right
 * for its AZIMUTH, so that a wall lit down one face and the shadow it throws
 * do not read as two suns. The bearing is fixed, so screen-right is a
 * constant and this is the same three lines, evaluated once.
 */
function aimedSun(): Vector3 {
  const R = axonBasis(projection).R;
  const out = Math.hypot(SUN_SCENE.x, SUN_SCENE.z);
  return new Vector3(R.x * out, SUN_SCENE.y, R.z * out).normalize();
}

/** a deterministic hash in [0,1), for the dither — see §THE BANDS */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function waterLayer(
  data: CityData,
  opts: WaterLayerOptions,
): CityLayer & { mesh: Mesh; foamStats(): FoamStats | null } {
  const meta = data.manifest.water as unknown as WaterMeta & {
    world: [number, number, number, number];
  };
  const chunk = data.get("base/water0");
  if (!chunk || !meta) throw new Error("water: base/water0 has not landed");

  const dep = chunk.fields.dep as Uint8Array;
  /* the coarse grid is the fine one divided by `mul`, plus one node — the
     encoder's own refinement rule, asserted in `water.ts` §assertRefinement */
  const gw = (meta.nw - 1) / meta.mul + 1;
  const gh = (meta.nh - 1) / meta.mul + 1;
  if (gw * gh !== dep.length) {
    throw new Error(`water: dep is ${dep.length}, the grid says ${gw}x${gh}`);
  }

  const [wx0, wy0, wx1, wy1] = meta.world;
  const reach = opts.reachM ?? 40_000;
  const x0 = Math.min(wx0, opts.anchor[0] - reach);
  const y0 = Math.min(wy0, opts.anchor[1] - reach);
  const x1 = Math.max(wx1, opts.anchor[0] + reach);
  const y1 = Math.max(wy1, opts.anchor[1] + reach);

  // ── the bake ─────────────────────────────────────────────────────────────
  const ramp = depthRamp(meta.qs);
  const W = BAKE_W;
  const H = Math.max(2, Math.round((BAKE_W * (y1 - y0)) / (x1 - x0)));
  const tex = new Uint8Array(W * H * 4);

  const near = rgb255(BAY_OPEN);
  const far = rgb255(lerpHex(BAY_OPEN, HAZE, 0.62));
  const haze = rgb255(HAZE);
  const cap = WA.hazecap;
  const fadeR1 = FADE_R0_M + FADE_SPAN_M * cap;

  /* ── THE GLINT'S TWO DIRECTIONS, RESOLVED ONCE ────────────────────────
     `h` is the half-vector between the light and the eye; a facet turned
     along it is the one that sends the sun into the camera. `hxz` is what a
     SLOPE has to work against, and it is what the wave field is normalised
     by below so the lobe is the same shape whatever the sun's height is. */
  const L = aimedSun();
  const V = axonBasis(projection).F; // the camera looks along -F, so F is the eye
  const h = new Vector3(L.x + V.x, L.y + V.y, L.z + V.z).normalize();
  const hxz = Math.hypot(h.x, h.z) || 1e-6;

  /* the wave field, as gradients: the slope a facet has at (x, z) is the sum
     of each component's own, and the largest the sum can be is the sum of the
     amplitudes — which is the normaliser that makes `t` land in [-1, 1] */
  const wv = WAVES.map((w) => {
    const k = (2 * Math.PI) / w.lam;
    const a = (w.deg * Math.PI) / 180;
    return { kx: k * Math.cos(a), kz: k * Math.sin(a), amp: w.amp, ph: w.ph };
  });
  const wSum = wv.reduce((s, w) => s + w.amp, 0);

  for (let py = 0; py < H; py++) {
    /* +0.5 for the texel CENTRE, and the row runs south to north because a
       texture's v = 0 is its first row and this quad's v = 0 is its southern
       edge. Backwards, this mirrors the bay about the Golden Gate — entirely
       plausible on screen, which is why it is written down rather than
       remembered. */
    const wy = y0 + ((py + 0.5) / H) * (y1 - y0);
    for (let px = 0; px < W; px++) {
      const wx = x0 + ((px + 0.5) / W) * (x1 - x0);
      const d = Math.hypot(wx - opts.anchor[0], wy - opts.anchor[1]);

      // the open-bay gradient the published depth is laid over
      const g = Math.max(0, Math.min(1, (d - FADE_R0_M) / FADE_SPAN_M));
      let r = near[0] + (far[0] - near[0]) * g;
      let gg = near[1] + (far[1] - near[1]) * g;
      let bb = near[2] + (far[2] - near[2]) * g;

      /* ── THE BLOCKS WERE THE DEPTH GRID, NOT THE GRADIENT ─────────────
         The published survey is 417 x 281 over 45.8 x 39.0 km, which is
         110 x 139 m a node — the SURROUND's own tread. Sampled with
         `Math.round` it painted the bay in 110 m blocks, and at the district
         camera one of them is 53 px: the "banding in the gradient" is
         mostly this, and it is nearest-neighbour rather than a ramp.

         Bilinear, and the weights skip a DRY node. `dep` is 0 where the
         survey has no water, so a plain bilinear would drag the shore's
         zeros out into the bay as a pale halo; weighting only the wet
         corners keeps the interpolation inside the water and leaves the
         open-bay gradient to carry the rest. */
      const gx = ((wx - wx0) / (wx1 - wx0)) * (gw - 1);
      const gy = ((wy - wy0) / (wy1 - wy0)) * (gh - 1);
      let wet = 0;
      if (gx >= 0 && gx <= gw - 1 && gy >= 0 && gy <= gh - 1) {
        const i0 = Math.min(gw - 1, Math.floor(gx));
        const j0 = Math.min(gh - 1, Math.floor(gy));
        const i1 = Math.min(gw - 1, i0 + 1);
        const j1 = Math.min(gh - 1, j0 + 1);
        const fx = gx - i0;
        const fy = gy - j0;
        let acc = 0;
        let wsum = 0;
        const add = (i: number, j: number, w: number): void => {
          const v = dep[j * gw + i];
          if (v === 0) return;
          acc += v * w;
          wsum += w;
        };
        add(i0, j0, (1 - fx) * (1 - fy));
        add(i1, j0, fx * (1 - fy));
        add(i0, j1, (1 - fx) * fy);
        add(i1, j1, fx * fy);
        /* ── AND THE SURVEY'S OWN RECTANGLE MUST NOT BE VISIBLE ──────
           `wsum` crosses smoothly wherever a NODE is dry, which is what the
           note above is about — but the grid's outer BOUNDARY is not a dry
           node, it is the end of the array, and there `wsum` steps from ~1 to
           0 across a single texel. The result is a ruler-straight edge in the
           bay wherever the survey's rectangle falls inside a frame.

           Found at the Marina: a hard-edged translucent band lay across the
           water and the far shore at a 1,100 m camera. Bisected by
           `setDrawRange(0, 0)` over the scene while sampling one pixel — it
           converged on child 7, the bay plate itself, which ruled out the
           terrain, the surround, the hem, the foam and the sky.

           So the last `FEATHER_CELLS` of the grid fade out. Six cells is
           660 m at this survey's 110 m pitch — about half a texel of the
           1,536 bake at the whole-city camera, and four texels at the
           district camera, which is enough to be a gradient rather than a
           line. The glint is scaled by `wet` too, so this feathers that with
           it and the sparkle no longer stops on a straight edge either. */
        const FEATHER_CELLS = 6;
        const edge =
          Math.min(gx, gy, gw - 1 - gx, gh - 1 - gy) / FEATHER_CELLS;
        wsum *= Math.max(0, Math.min(1, edge));
        if (wsum > 0) {
          wet = wsum;
          const c = depthColour(depthM(acc / wsum, meta.dmax), ramp);
          /* `wsum` is also HOW MUCH of this texel the survey calls water, so
             a texel on the survey's own edge crosses to the open-bay tone
             instead of stepping to it */
          r += (c[0] - r) * wsum;
          gg += (c[1] - gg) * wsum;
          bb += (c[2] - bb) * wsum;
        }
      }

      // and the distance fade over both
      const a = Math.max(0, Math.min(1, (d - FADE_R0_M) / (fadeR1 - FADE_R0_M))) * cap;
      r += (haze[0] - r) * a;
      gg += (haze[1] - gg) * a;
      bb += (haze[2] - bb) * a;

      /* ── THE GLINT ────────────────────────────────────────────────────
         `t` is how far this facet turns TOWARD the half-vector, in units of
         the steepest turn the swell can make, so it is in [-1, 1] whatever
         the amplitudes are. Raised to `GLINT_P` it becomes a sparse set of
         broad lobes rather than an even sheen.

         It is scaled by `1 - a`, the haze: water that has gone to paper is
         not water any more and must not glitter. And by `wet`, so the glint
         belongs to the surveyed bay rather than to the empty ocean past it,
         where there is nothing for it to be the surface OF. */
      let slope = 0;
      for (const w of wv) {
        slope +=
          (w.amp *
            Math.cos(w.kx * wx + w.kz * wy + w.ph) *
            (w.kx * h.x + w.kz * h.z)) /
          (Math.hypot(w.kx, w.kz) * hxz);
      }
      const t = -slope / wSum;
      if (t > 0 && a < 1 && wet > 0) {
        const gl = Math.pow(t, GLINT_P) * GLINT_GAIN * (1 - a) * wet;
        r += (255 - r) * gl;
        gg += (255 - gg) * gl;
        bb += (250 - bb) * gl;
      }

      /* ── THE BANDS ────────────────────────────────────────────────────
         What is left after the depth is fixed is a genuine eight-bit
         problem: the fade moves by one part in 255 over some 300 m of bay,
         so the plate holds long runs of one byte with a hard step between
         them, and the linear filter turns each step into a Mach band the eye
         finds instantly on a flat surface.

         A triangular-PDF dither of one least significant bit removes the
         step by turning it into noise the filter then averages away — the
         standard answer, and the reason it is triangular rather than
         rectangular is that a rectangular dither leaves the noise CORRELATED
         with the signal, which is a texture that shimmers where the gradient
         is steep. Deterministic, so two bakes of the same city are the same
         bytes. */
      const dth = hash2(px, py) + hash2(px + 9871, py + 1237) - 1;
      const o = (py * W + px) * 4;
      tex[o] = Math.max(0, Math.min(255, Math.round(r + dth)));
      tex[o + 1] = Math.max(0, Math.min(255, Math.round(gg + dth)));
      tex[o + 2] = Math.max(0, Math.min(255, Math.round(bb + dth)));
      tex[o + 3] = 255;
    }
  }

  const map = new DataTexture(tex, W, H, RGBAFormat);
  map.colorSpace = SRGBColorSpace;
  /* ── THE BAY NEEDS MIPMAPS, AND WITHOUT THEM IT SHIMMERS ────────────────
     This plate is 80 km of world across a 1,536-texel bake — 52 m a texel —
     and at the whole-city camera every screen pixel covers several of them.
     With `LinearFilter` and no mip chain the GPU takes ONE of those texels per
     pixel, and which one it takes changes the instant the camera moves. Over
     the largest single surface in the frame — the bay is about 40 % of the
     wide shot — that is a sheet of sparkle across the water on every gesture.
     Daniel: *"when i move it scintillates."*

     A mip chain averages the texels a pixel actually covers instead of picking
     one, so the answer stops depending on sub-pixel position. Anisotropy is
     what keeps that from going soft at this camera, where the plate is seen at
     a shallow angle and one screen pixel is a long thin footprint in texture
     space — 8 rather than the 4 the facade tiles take, because nothing in the
     scene is more foreshortened than a horizontal plane under an axonometric
     camera. `magFilter` stays linear: near the camera the plate is magnified
     and there is nothing to average. */
  map.generateMipmaps = true;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.anisotropy = 8;
  map.needsUpdate = true;

  /* ── SEA LEVEL EXACTLY, AND THE DEPTH IS PUSHED INSTEAD ─────────────────
     The first cut put the bay half a unit BELOW zero so land would win the
     depth test. It does — and so does the bay, over the SURROUND, whose own
     sea-level nodes sit lower; Marin and the East Bay vanished under the
     water. Moving a plane in Y also moves it on SCREEN in an axonometric
     projection — 79 px at the street camera — so the fix is `polygonOffset`:
     the plane stays at zero and is pushed back in the DEPTH BUFFER only. */
  const g = new BufferGeometry();
  const Y = 0;
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      [x0, Y, y0, x1, Y, y0, x1, Y, y1, x0, Y, y0, x1, Y, y1, x0, Y, y1],
      3,
    ),
  );
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
  );
  g.computeBoundingSphere();

  const m = new MeshBasicMaterial({
    map,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 6,
  });

  const mesh = new Mesh(g, m);
  /* ── THE BAY IS THE BOTTOM OF THE STACK, UNDER THE FAR SHORE ────────────
     `layers/surround.ts` had to become a depth-less BACKDROP (see its own
     note), which took it out of the depth buffer and left ORDER as the only
     thing separating it from this plane. At -1 the bay drew after it and
     painted straight over the Marin headlands, the East Bay and the San Bruno
     peninsula: the whole-city frame came back with the far shore missing and
     measured 10.3 points of luminance under the published page's, its p10 22
     under, because a pale hazed headland had become open water.

     One number below the surround, so the stack reads bay, far shore, city —
     which is the order the published page paints them in. The foam added
     below takes the rung between the far shore and the city, because it is
     the far shore's surf as much as the city's. */
  mesh.renderOrder = -4;

  const foam = buildFoam(data, mesh);

  return {
    name: "water",
    mesh,
    foamStats: () => foam.stats,
    dispose() {
      g.dispose();
      m.dispose();
      map.dispose();
      foam.dispose();
    },
  };
}

/** what the shore wash covered, so the comments above can be re-measured */
export interface FoamStats {
  /** water cells inside the band, on the `FOAM_CELL` lattice */
  cells: number;
  vertices: number;
  triangles: number;
}

/**
 * THE SURF, AS A DISTANCE FROM THE LAND THE FRAME ACTUALLY DRAWS.
 *
 * ── THE FIRST CUT WAS A RIBBON PER SEGMENT, AND IT GLOWED ────────────────
 * One quad per published ring segment, offset onto its water side, is the
 * obvious shape and it accumulated: the two registers trace the SAME shore a
 * few tens of metres apart, so most of the waterfront got two ribbons at
 * `FOAM_A` each and composed to 0.75; and at a pier head, where the segments
 * are short and the turns are sharp, the end caps that stop a corner wedge
 * overlapped three and four deep. MEASURED, 3,109 segments kept of 3,577, and
 * the district frame came back with a white halo round every pier that read
 * as a glow rather than as surf.
 *
 * Alpha that accumulates is a bug wherever the mark is meant to be a FIELD
 * rather than a stroke, and this one is a field: how near the land is. So it
 * is computed as one — the union of the two registers is scan-converted onto
 * a `FOAM_CELL` lattice, a chamfer transform gives every water cell its
 * distance to the nearest land cell, and the wash is a function of that
 * distance with no overlap anywhere by construction.
 *
 * It also disposes of the gate the ribbon needed. A published ring that runs
 * across dry land — the county line through the southern suburbs is one —
 * contributes nothing here, because every cell along it is land and land
 * cells are not emitted.
 *
 * Returns its own disposer and its own counts.
 */
function buildFoam(
  data: CityData,
  parent: Mesh,
): { dispose(): void; stats: FoamStats | null } {
  let mesh: Mesh | null = null;
  const out: { dispose(): void; stats: FoamStats | null } = {
    stats: null,
    dispose() {
      if (!mesh) return;
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.removeFromParent();
      mesh = null;
    },
  };
  const meta = data.manifest.water as unknown as { world: [number, number, number, number] };
  const coastChunk = data.get("base/coast");
  const cityRings: Ring[] = coastChunk ? decodeCoast(coastChunk).coast : [];

  void data
    .surroundCoast()
    .catch(() => null)
    .then((sc) => {
      const sets: (readonly Ring[])[] = [];
      if (cityRings.length) sets.push(cityRings);
      if (sc && sc.rings.length) sets.push(sc.rings as readonly Ring[]);
      /* the same union the ground is cut at — `terrain.ts` §THE COAST. With
         one register the ground is not cut either, so there is no new edge
         for a wash to soften and drawing one would put surf on a staircase. */
      if (sets.length < 2) return;

      const [bx0, by0, bx1, by1] = meta.world;
      const nx = Math.ceil((bx1 - bx0) / FOAM_CELL);
      const ny = Math.ceil((by1 - by0) / FOAM_CELL);
      const mask = rasteriseRings(
        sets,
        { x0: bx0, y0: by0, nx, ny, cellW: FOAM_CELL, cellH: FOAM_CELL },
        1,
      );

      /* ── THE DISTANCE, BY CHAMFER ─────────────────────────────────────
         Two sweeps over the lattice with the (1, sqrt2) neighbourhood. Its
         worst error against a true Euclidean distance is about 6 %, which on
         a 55 m band is 3 m — a tenth of a cell, and well under the width of
         the softest part of the falloff. An exact transform is a page of
         code for a difference nothing in this frame can hold. */
      const CAP = FOAM_OUT / FOAM_CELL + 2;
      const d = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          d[j * nx + i] = mask.at(i, j, 0, 0) ? 0 : CAP;
        }
      }
      const D1 = 1;
      const D2 = Math.SQRT2;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          let v = d[k];
          if (v === 0) continue;
          if (i > 0) v = Math.min(v, d[k - 1] + D1);
          if (j > 0) v = Math.min(v, d[k - nx] + D1);
          if (i > 0 && j > 0) v = Math.min(v, d[k - nx - 1] + D2);
          if (i < nx - 1 && j > 0) v = Math.min(v, d[k - nx + 1] + D2);
          d[k] = v;
        }
      }
      for (let j = ny - 1; j >= 0; j--) {
        for (let i = nx - 1; i >= 0; i--) {
          const k = j * nx + i;
          let v = d[k];
          if (v === 0) continue;
          if (i < nx - 1) v = Math.min(v, d[k + 1] + D1);
          if (j < ny - 1) v = Math.min(v, d[k + nx] + D1);
          if (i < nx - 1 && j < ny - 1) v = Math.min(v, d[k + nx + 1] + D2);
          if (i > 0 && j < ny - 1) v = Math.min(v, d[k + nx - 1] + D2);
          d[k] = v;
        }
      }

      /* a NODE takes the nearest of the up-to-four cells that meet at it, so
         a node on the waterline reads zero and the wash starts at full
         strength exactly where the land stops */
      const nnx = nx + 1;
      const nodeF = (ni: number, nj: number): number => {
        let m = CAP;
        for (let a = -1; a <= 0; a++) {
          for (let b = -1; b <= 0; b++) {
            const i = ni + a;
            const j = nj + b;
            if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
            const v = d[j * nx + i];
            if (v < m) m = v;
          }
        }
        const f = 1 - (m * FOAM_CELL) / FOAM_OUT;
        return f <= 0 ? 0 : Math.pow(f, FOAM_FALL);
      };

      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const seen = new Map<number, number>();
      const c = new Color();
      c.setStyle(lerpHex(BAY_SHOAL, "#ffffff", FOAM_WHITE), SRGBColorSpace);
      let cells = 0;

      const vert = (ni: number, nj: number): number => {
        const key = nj * nnx + ni;
        const had = seen.get(key);
        if (had !== undefined) return had;
        const v = pos.length / 3;
        pos.push(bx0 + ni * FOAM_CELL, 0, by0 + nj * FOAM_CELL);
        col.push(c.r, c.g, c.b, FOAM_A * nodeF(ni, nj));
        seen.set(key, v);
        return v;
      };

      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (d[j * nx + i] === 0) continue; // land: the ground draws it
          if (d[j * nx + i] * FOAM_CELL >= FOAM_OUT) continue;
          cells++;
          const a = vert(i, j);
          const b = vert(i + 1, j);
          const cc = vert(i + 1, j + 1);
          const dd = vert(i, j + 1);
          idx.push(a, b, cc, a, cc, dd);
        }
      }
      if (!idx.length) return;

      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("color", new BufferAttribute(new Float32Array(col), 4));
      const n = new Float32Array(pos.length);
      for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
      g.setAttribute("normal", new BufferAttribute(n, 3));
      g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
      g.computeBoundingSphere();

      /* LAMBERT WITH FLAT-UP NORMALS, like every other ground surface here:
         a mark that does not take the scene's light is a mark that is out of
         register with the shore rim two rungs above it. */
      const fm = new MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: 3,
      });
      mesh = new Mesh(g, fm);
      /* ── WHERE THE WASH SITS IN THE STACK ─────────────────────────────
         renderOrder -4 bay, -3 far shore, -2 HERE, 0 the city and everything
         drawn on it. After the far shore because the far shore has surf too
         and this has to reach it; before the ground because the ground must
         always win over it. It writes no depth, so nothing after it has to
         know it is there. */
      mesh.renderOrder = -2;
      mesh.receiveShadow = true;
      out.stats = { cells, vertices: pos.length / 3, triangles: idx.length / 3 };
      parent.add(mesh);
    });

  return out;
}
