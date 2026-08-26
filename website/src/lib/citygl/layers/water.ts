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
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  SRGBColorSpace,
} from "three";

import type { CityData } from "@/lib/city/data";
import {
  BAY_OPEN,
  depthColour,
  depthM,
  depthRamp,
  type WaterMeta,
} from "@/lib/city/water";
import { HAZE, WA, lerpHex } from "@/lib/city/terrain";
import type { CityLayer } from "../engine";

/** the two radii `drawDepthHaze` and `bayPlate` are written in, in metres */
const FADE_R0_M = 3400;
const FADE_SPAN_M = 15000;

/** how finely the baked plate is sampled — the published grid is 417 x 281 */
const BAKE_W = 1024;

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

export function waterLayer(
  data: CityData,
  opts: WaterLayerOptions,
): CityLayer & { mesh: Mesh } {
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

      // the published depth, where the survey has a node
      const gx = ((wx - wx0) / (wx1 - wx0)) * (gw - 1);
      const gy = ((wy - wy0) / (wy1 - wy0)) * (gh - 1);
      if (gx >= 0 && gx <= gw - 1 && gy >= 0 && gy <= gh - 1) {
        const v = dep[Math.round(gy) * gw + Math.round(gx)];
        if (v !== 0) {
          const c = depthColour(depthM(v, meta.dmax), ramp);
          r = c[0];
          gg = c[1];
          bb = c[2];
        }
      }

      // and the distance fade over both
      const a = Math.max(0, Math.min(1, (d - FADE_R0_M) / (fadeR1 - FADE_R0_M))) * cap;
      const o = (py * W + px) * 4;
      tex[o] = r + (haze[0] - r) * a;
      tex[o + 1] = gg + (haze[1] - gg) * a;
      tex[o + 2] = bb + (haze[2] - bb) * a;
      tex[o + 3] = 255;
    }
  }

  const map = new DataTexture(tex, W, H, RGBAFormat);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = LinearFilter;
  map.magFilter = LinearFilter;
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
    polygonOffsetFactor: 6,
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
     which is the order the published page paints them in. */
  mesh.renderOrder = -4;

  return {
    name: "water",
    mesh,
    dispose() {
      g.dispose();
      m.dispose();
      map.dispose();
    },
  };
}
