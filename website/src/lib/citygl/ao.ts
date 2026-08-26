/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/ao.ts — AMBIENT OCCLUSION UNDER AN ORTHOGRAPHIC CAMERA.

   A shadow map answers *is the sun blocked?*. This answers the other half —
   *how much of the sky can this point see?* — and it is what darkens the
   inside corner where a wall meets a pavement, the strip under an eave and
   the well between two towers. Without it 166,166 buildings standing on a
   ground plane read as stickers.

   ── WHY NOT THE STOCK `GTAONode` ─────────────────────────────────────────
   It was wired in and turned off, with a note saying it "reconstructs a view
   position from the depth buffer, and that reconstruction assumes a
   PERSPECTIVE camera". MEASURED: that diagnosis is wrong. `getViewPosition`
   is `projectionMatrixInverse * clip`, then a divide by w — and the inverse
   of an ORTHOGRAPHIC projection has last row (0,0,0,1), so w comes back 1
   and the divide is a no-op. The reconstruction was already exact here.

   What was actually wrong is SCALE. `GTAONode.radius` defaults to `0.25`
   and `thickness` to `1`, both in view units; this scene's view units are
   WORLD METRES, so every one of its horizon samples landed inside the
   fragment's own texel, `viewDelta` came out as the zero vector, and
   `normalize(vec3(0))` is NaN. MEASURED on this machine (WebGL 2 backend,
   1440 x 666): the stock chain returns a frame that is uniformly
   `(255,255,255)` at all four cameras — a NaN wash, not a dark one.

   The rest of `GTAONode` is still built for a pinhole: its view vector is
   `normalize(-viewPosition)`, the ray from the eye to the fragment. Under an
   orthographic camera there is no eye — every ray is the same ray — and that
   direction is exactly `(0, 0, 1)` in view space. Rather than fight a node
   whose one wrong assumption is spread through its inner loop, this file
   states the orthographic case directly and gets a shorter shader for it.

   ── THE RECONSTRUCTION, AND WHY IT NEEDS NO MATRIX ───────────────────────
   Under an orthographic projection every screen coordinate is an AFFINE
   function of the view position, so it inverts in three multiply-adds:

       view.x = (2u - 1) * kx + ox      kx = (right - left) / 2
       view.y = (1 - 2v) * ky + oy      ky = (top - bottom) / 2
       view.z = -(near + d * (far - near))

   The last line is the one a perspective camera cannot have: depth is LINEAR
   in view z, so a depth texel is a distance in metres rather than a
   reciprocal. It also holds on BOTH backends unchanged — WebGPU's clip z is
   [0,1] and WebGL's is [-1,1], but the depth TEXTURE is [0,1] in both and
   the two conventions cancel against their own projection matrices.

   ── THE OCCLUSION TERM ───────────────────────────────────────────────────
   A normal-oriented disc in screen space. For each of N taps on a disc of
   radius R around the fragment, take the sample's view position, and let

       occ += max(0, dot(n, normalize(delta)) - bias) * (1 - |delta| / R)

   `dot(n, normalize(delta))` is the sine of the sample's elevation above the
   fragment's own TANGENT PLANE. That is what makes this safe on the two
   surfaces the brief calls out:

     flat ground   every neighbour lies IN the tangent plane, the dot product
                   is 0, and the ground is left exactly as it was. There is no
                   flat-surface term to cancel and therefore no halo.
     the sky       a sky texel has depth 1, so its view z is -far, `delta`
                   points hard AWAY from the surface and the dot product is
                   negative — clamped to zero — while `|delta| / R` is in the
                   thousands and the falloff is zero as well. Two independent
                   reasons the sky contributes nothing.

   Samples are clamped to the viewport, so a fragment at the frame's edge
   samples itself rather than wrapping: `delta` is 0 and it contributes
   nothing, which is why there is no border seam.

   ── THE RADIUS IS IN WORLD METRES, WITH A FLOOR IN PIXELS ────────────────
   `radiusM` is a distance on the ground. The default, 6 m, is about a
   pavement plus a traffic lane — the distance over which a real building
   visibly darkens the ground beside it, and the scale of the well between
   two towers.

   But this camera spans four orders of magnitude. MEASURED from the frustum
   at the four stops, at a 1440 px viewport: 9.86 m per pixel at the city
   stop, 2.96 at the district, 0.99 at the block, 0.30 at the street. A fixed
   6 m radius is 20 px of disc at the street stop and 0.6 px at the city stop
   — below one texel, where every tap lands on the fragment itself and the
   term collapses to nothing. So the radius used is

       R = max(radiusM, minPx * metresPerPixel)

   which keeps a physical scale wherever the frame can resolve one and falls
   back to a fixed few-pixel disc when it cannot. `minPx` is in DEVICE
   pixels, so the effect holds its apparent size on a 2x screen.

   One honesty note: the scene's vertical axis is exaggerated (the ground by
   `zex`, built height by `zexb`), so a radius of 6 m is 6 true metres
   horizontally and rather less than 6 true metres of building. This is a
   look, not a measurement, and the exaggeration is the look.
   ═══════════════════════════════════════════════════════════════════════ */

import { Vector2, Vector4, type OrthographicCamera } from "three";
import type { TextureNode } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  clamp,
  cos,
  cross,
  dot,
  float,
  length,
  max,
  normalize,
  select,
  sin,
  sqrt,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

/** whatever TSL hands back — named once so this file needs no TSL type import */
type AnyNode = ReturnType<TextureNode["sample"]>;

export interface OrthoAoParams {
  /** the disc radius on the ground, WORLD METRES */
  radiusM: number;
  /** the floor on that radius, DEVICE PIXELS — see §the radius is in world metres */
  minPx: number;
  /** how much of the occlusion term reaches the picture, 0..1 */
  intensity: number;
  /** the self-occlusion cutoff, as a sine of elevation above the tangent plane */
  bias: number;
}

export interface OrthoAoOptions extends Partial<OrthoAoParams> {
  /** taps on the disc — a compile-time constant, not a uniform */
  samples?: number;
}

export interface OrthoAo {
  /** the occlusion term as a float node: 1 is open sky, 0 is a sealed corner */
  readonly node: AnyNode;
  readonly params: Readonly<OrthoAoParams>;
  /** the live parameters; a change takes effect on the next frame */
  setParams(p: Partial<OrthoAoParams>): void;
  /**
   * Push this frame's camera in. Must be called before the frame is
   * rendered — the whole reconstruction is four numbers off the frustum.
   */
  update(camera: OrthographicCamera, bufferW: number, bufferH: number): void;
  /** what the radius came out as this frame, world metres — for a harness */
  readonly radiusUsedM: number;
}

/**
 * The golden angle. Consecutive taps at this angular step and a radius of
 * sqrt(k / N) tile a disc evenly with no repeating direction — a Vogel
 * spiral. It is DETERMINISTIC on purpose: this renderer paints on demand and
 * holds the frame, so a stochastic kernel would show as fixed grain rather
 * than averaging away over time the way it does in an animated renderer.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function orthoAo(depthTex: TextureNode, opts: OrthoAoOptions = {}): OrthoAo {
  const N = Math.max(4, Math.round(opts.samples ?? 12));

  const params: OrthoAoParams = {
    radiusM: opts.radiusM ?? 12,
    minPx: opts.minPx ?? 3.5,
    intensity: opts.intensity ?? 2.4,
    bias: opts.bias ?? 0.4,
  };

  /* (kx, ky, ox, oy) — the orthographic unprojection, read off the frustum */
  const unproj = uniform(new Vector4(1, 1, 0, 0));
  /* (near, far - near) */
  const zRange = uniform(new Vector2(0, 1));
  /* one depth texel, in uv */
  const texel = uniform(new Vector2(1, 1));
  /* uv per view metre, on each screen axis */
  const uvPerM = uniform(new Vector2(1, 1));
  /* the radius this frame, view metres */
  const radius = uniform(1);
  const intensity = uniform(params.intensity);
  const bias = uniform(params.bias);

  let radiusUsedM = params.radiusM;

  /** the affine inverse of the orthographic projection — see the header */
  const viewPos = (u: AnyNode, d: AnyNode): AnyNode =>
    vec3(
      u.x.mul(2).sub(1).mul(unproj.x).add(unproj.z),
      float(1).sub(u.y.mul(2)).mul(unproj.y).add(unproj.w),
      zRange.x.add(d.mul(zRange.y)).negate(),
    );

  const sampleDepth = (u: AnyNode): AnyNode => depthTex.sample(clamp(u, vec2(0), vec2(1))).r;

  const node = Fn(() => {
    const u0 = uv();
    const d0 = sampleDepth(u0).toVar();
    const out = float(1).toVar();

    /* the sky is not a surface: leave it exactly as the scene pass left it */
    If(d0.lessThan(0.9999), () => {
      const p0 = viewPos(u0, d0).toVar();

      /* ── THE NORMAL, FROM DEPTH, AND WHY NOT FROM AN MRT ──────────────
         An MRT normal buffer is the usual answer and costs a second full
         render target plus its bandwidth every frame. Under an orthographic
         camera the depth buffer already IS the surface — position is affine
         in (u, v, depth) — so the geometric normal is a cross product of two
         finite differences and four extra texel fetches.

         The differences are taken on whichever side has the SMALLER depth
         step, which is the standard guard against a silhouette: at a roof
         edge one neighbour is a rooftop and the other is the street 40 m
         below, and averaging them would tilt the normal into a false ridge
         that then draws a dark line along every silhouette in the frame. */
      const uL = u0.sub(vec2(texel.x, 0));
      const uR = u0.add(vec2(texel.x, 0));
      const uD = u0.sub(vec2(0, texel.y));
      const uU = u0.add(vec2(0, texel.y));
      const dL = sampleDepth(uL).toVar();
      const dR = sampleDepth(uR).toVar();
      const dD = sampleDepth(uD).toVar();
      const dU = sampleDepth(uU).toVar();
      const dpx = select(
        dR.sub(d0).abs().lessThan(d0.sub(dL).abs()),
        viewPos(uR, dR).sub(p0),
        p0.sub(viewPos(uL, dL)),
      );
      const dpy = select(
        dU.sub(d0).abs().lessThan(d0.sub(dD).abs()),
        viewPos(uU, dU).sub(p0),
        p0.sub(viewPos(uD, dD)),
      );
      /* Under an orthographic camera every VISIBLE surface faces the eye, so
         the normal's view z is positive by construction. Forcing that sign
         makes the term independent of which way round the cross product came
         out, and of whether the uv the depth is sampled with runs up or down
         the frame — neither of which is worth deriving twice. */
      const nRaw = normalize(cross(dpx, dpy));
      const n = select(nRaw.z.lessThan(0), nRaw.negate(), nRaw).toVar();

      const occ = float(0).toVar();
      Loop(N, ({ i }) => {
        const ang = float(i).mul(GOLDEN_ANGLE);
        const rad = radius.mul(sqrt(float(i).add(0.5).div(N)));
        const off = vec2(cos(ang), sin(ang)).mul(rad);
        const su = u0.add(off.mul(uvPerM));
        const sp = viewPos(su, sampleDepth(su));
        const delta = sp.sub(p0).toVar();
        const len = length(delta).add(1e-4).toVar();
        /* sine of the sample's elevation above this fragment's tangent plane */
        const rise = dot(n, delta).div(len);
        /* R^2 / (R^2 + d^2): full weight against the fragment, half at one
           radius, negligible past two. A LINEAR falloff was tried first and
           is why the term read as a thin scribble rather than a pool of
           shade — MEASURED at the block camera, it left only 1.4 % of the
           frame darkened by more than 4/255 at a 30 m radius, because most
           of a disc's area sits near its rim where a linear weight is
           already near zero. */
        const r2 = radius.mul(radius);
        const fall = r2.div(r2.add(len.mul(len)));
        occ.addAssign(max(0, rise.sub(bias)).mul(fall));
      });

      out.assign(clamp(float(1).sub(occ.div(N).mul(intensity)), 0, 1));
    });

    return out;
  })() as AnyNode;

  return {
    node,
    get params() {
      return params;
    },
    get radiusUsedM() {
      return radiusUsedM;
    },
    setParams(p: Partial<OrthoAoParams>): void {
      if (p.radiusM !== undefined) params.radiusM = p.radiusM;
      if (p.minPx !== undefined) params.minPx = p.minPx;
      if (p.intensity !== undefined) params.intensity = p.intensity;
      if (p.bias !== undefined) params.bias = p.bias;
      intensity.value = params.intensity;
      bias.value = params.bias;
    },
    update(camera: OrthographicCamera, bufferW: number, bufferH: number): void {
      const kx = (camera.right - camera.left) / 2;
      const ky = (camera.top - camera.bottom) / 2;
      unproj.value.set(kx, ky, (camera.right + camera.left) / 2, (camera.top + camera.bottom) / 2);
      zRange.value.set(camera.near, camera.far - camera.near);
      texel.value.set(1 / Math.max(1, bufferW), 1 / Math.max(1, bufferH));
      /* d(view.x)/d(u) = 2 kx and d(view.y)/d(v) = -2 ky — see the header */
      uvPerM.value.set(1 / (2 * kx), -1 / (2 * ky));
      const mPerPx = Math.abs(camera.right - camera.left) / Math.max(1, bufferW);
      radiusUsedM = Math.max(params.radiusM, params.minPx * mPerPx);
      radius.value = radiusUsedM;
    },
  };
}
