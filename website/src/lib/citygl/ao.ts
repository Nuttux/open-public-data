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

       occ += max(0, dot(n, normalize(delta)) - bias) * R² / (R² + |delta|²)

   `dot(n, normalize(delta))` is the sine of the sample's elevation above the
   fragment's own TANGENT PLANE. That is what makes this safe on the two
   surfaces the brief calls out:

     flat ground   every neighbour lies IN the tangent plane, the dot product
                   is 0, and the ground is left exactly as it was. There is no
                   flat-surface term to cancel and therefore no halo.
     the sky       a sky texel has depth 1, so its view z is -far, `delta`
                   points hard AWAY from the surface and the dot product is
                   negative — clamped to zero — while `|delta|` is kilometres
                   and R²/(R²+|delta|²) is a millionth. Two independent
                   reasons the sky contributes nothing. A sky FRAGMENT is
                   never even asked: depth 1 returns 1 before the loop.

   Samples are clamped to the viewport, so a fragment at the frame's edge
   samples itself rather than wrapping: `delta` is 0 and it contributes
   nothing, which is why there is no border seam.

   ── THE RADIUS IS IN WORLD METRES, WITH A FLOOR IN PIXELS ────────────────
   `radiusM` is a distance on the ground. The default, 12 m, is about the
   width of a two-lane street: the distance over which a real building
   visibly darkens the ground beside it, and roughly the well between two
   towers on the same block.

   But this camera spans two orders of magnitude. MEASURED off the frustum at
   the four stops, at a 1440 px viewport: 10.34 m per pixel at the city stop,
   3.10 at the district, 1.03 at the block, 0.31 at the street. A fixed 12 m
   radius is 39 px of disc at the street stop and 1.2 px at the city stop —
   about one texel, where every tap lands on the fragment itself and the term
   collapses to nothing. So the radius used is

       R = max(radiusM, minPx * metresPerPixel)

   which keeps a physical scale wherever the frame can resolve one and falls
   back to a fixed few-pixel disc when it cannot. At the city stop that comes
   out as 36.2 m — MEASURED, and about one building — and at the other three
   the floor never binds. `minPx` is in DEVICE pixels, so the effect holds its
   apparent size on a 2x screen.

   One honesty note: the scene's vertical axis is exaggerated (the ground by
   `zex`, built height by `zexb`), so a radius of 12 m is 12 true metres
   horizontally and rather less than 12 true metres of building. This is a
   look, not a measurement, and the exaggeration is the look.

   ── WHAT IT COMES TO ON THE GLASS ────────────────────────────────────────
   MEASURED at 1440 x 666, WebGL 2 backend, at the shipped settings (12 taps,
   12 m, intensity 2.4, bias 0.4), comparing the same camera with the chain
   off and on:

       stop        mean luminance      darkest pixel   frame darkened
       city        160.65 -> 158.95    -31.8 / 255     14.1 % of pixels
       district    143.93 -> 141.88    -33.9           18.8 %
       block       137.29 -> 135.73    -34.1           14.0 %
       street      121.23 -> 120.17    -27.1            9.5 %

   The frame's mean moves by 1.1 to 2.1 of 255 while individual crevices go
   down by thirty — which is the shape this wanted: occlusion in the corners,
   not a filter over the picture.

   ── AND WHAT THE CONTACT DISC ADDS ON TOP ────────────────────────────────
   Same measurement, the second disc's intensity swept with everything else
   held, against the same frame with that disc at zero:

       contactIntensity      1.5     2.6     4.0     5.5
       city   frame mean    -0.64   -1.14   -1.81   -2.58   of 255
              p99 drop       8.1    15.0    24.1    35.2
              pixels >4/255  5.7 %  10.6 %  13.7 %  15.7 %
       block  frame mean    -0.30   -0.54   -0.86   -1.23
              p99 drop       6.3    11.3    18.1    26.2
              pixels >4/255  2.1 %   4.5 %   6.6 %   7.8 %

   4.0 is what ships. It takes the deepest one per cent of the frame down by
   another 18 to 24 levels — a wall's foot, the strip under an eave, the seam
   where two towers meet — for less than a point of the frame's own mean. 5.5
   was rejected on a single number: its darkest pixel goes down by 179 of 255,
   which is a black hole rather than a corner.

   And the halo test, which is the one that catches a wrong AO: over every
   region of the frame that is UNIFORM ACROSS THE WHOLE DISC — flat ground,
   flat roof, open sky — the two frames differ by EXACTLY ZERO at the city,
   district and block stops. (At the street stop the disc is 39 px and no
   region of the frame is uniform over 79 px, so the test cannot run there.)
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
  /**
   * THE CEILING ON THAT RADIUS, WORLD METRES — and it is what makes the floor
   * usable.
   *
   * MEASURED, the disc this ships with is not an occlusion term at three of
   * the four cameras. At a 1440 px buffer:
   *
   *     camera     m/px    radius m    radius PX
   *     city      10.673      37.4         3.5
   *     district   4.360      15.3         3.5
   *     block      2.118      12.0         5.7
   *     street     0.865      12.0        13.9
   *
   * The two wide cameras sit ON the `minPx` floor and the block camera is
   * barely off it. A 3.5 px disc with twelve taps is an edge detector, and
   * that is exactly what the debug view shows: white everywhere except
   * hairlines on the silhouettes. No pool of shade beside a wall, no well
   * between two towers.
   *
   * Raising `minPx` alone does not fix it, because the two ends want opposite
   * things. MEASURED by sweep, mean local standard deviation over 16 px
   * blocks — the statistic a global histogram cannot see:
   *
   *     minPx        3.5      8     14     20     28
   *     district   27.09  28.02  28.78  29.39  29.92   rising
   *     richmond   29.97  31.03  31.88  32.53  33.04   rising
   *     city       13.75  13.63  13.56  13.51  13.50   FALLING
   *
   * At the whole-city camera a building is two or three pixels across, so a
   * disc that grows with the metre-per-pixel averages across whole blocks and
   * washes the frame out — its p05-p95 range narrows from 55 to 47.
   *
   * So the radius is floored in PIXELS, where the frame needs a kernel it can
   * see, and capped in METRES, where the world stops making sense. At
   * `minPx` 14 and `maxM` 40 the disc lands at 3.7 px at the city camera
   * (where more hurts), 9.2 at the district and 14 at the block and street —
   * which is the shape the sweep asks for.
   *
   * ── AND IT IS WORTH NOTHING UNTIL `intensity` IS RAISED ─────────────────
   * On the clean protocol this radius rule moves local standard deviation by
   * at most 0.26 at the intensity this file used to ship: a term that weak does
   * not care how wide its disc is. At `intensity` 6 the same change is worth
   * +0.07 at the city camera, +0.84 at the district and +0.61 at the block.
   * The two go together and neither is worth much on its own.
   */
  maxM: number;
  /**
   * How hard the occlusion term is pushed. Not a 0..1 fade: the raw sum over
   * the disc reaches only about 0.35 for a fragment sitting in a right-angle
   * corner with half its disc on a wall, so a multiplier near 1 would be
   * invisible.
   *
   * ── IT SHIPPED AT 2.4, AND 2.4 WAS DOING ALMOST NOTHING ─────────────────
   * MEASURED at the block camera on a clean protocol (see §HOW THIS WAS
   * MEASURED), mean local standard deviation over 16 px blocks — the statistic
   * a global histogram cannot see, because occlusion moves NEIGHBOURING pixels
   * apart without moving the frame's own distribution much:
   *
   *     intensity / contact     local SD     frame mean
   *     ~0 (term off)             29.70        158.1
   *     2.4 / 4  (shipped)        30.16        153.4
   *     6 / 10                    35.79        143.6
   *     12 / 20                   45.64        126.6
   *
   * The shipped setting bought **0.46 of a level** over having no occlusion at
   * all. The debug view says the same thing in one picture: white everywhere
   * except hairlines on the silhouettes — no pool of shade beside a wall, no
   * well between two towers.
   *
   * 6 is taken. 12 is not muddy either, but it moves the frame's mean by 31
   * levels, which is a look decision wearing an occlusion term's clothes.
   */
  intensity: number;
  /**
   * The self-occlusion cutoff, as a SINE of elevation above the tangent
   * plane: a tap has to stand at least this far off the surface to count. It
   * is the lever that separates "occlusion in the corners" from "a grey wash".
   *
   * ── IT WAS 0.4, AND THAT WAS A PARITY NUMBER ────────────────────────────
   * Chosen because raising it from 0.1 to 0.4 "took the frame's MEAN SHIFT
   * from -3.74 to -1.21" — a smaller departure from the published page, which
   * is no longer what this renderer is for. It also predates the term being
   * worth anything at all (§it shipped at 2.4).
   *
   * Re-swept on the clean protocol at the block camera, mean local standard
   * deviation over 16 px blocks:
   *
   *     bias    local SD    frame mean    p05
   *     0.40      35.78        151.3      71.6
   *     0.30      39.73        144.2      51.7
   *     0.22      42.99        136.7      33.9
   *     0.15      46.05        128.6      13.5
   *
   * Monotonic, so the number is chosen by eye against what the wash actually
   * looks like. At 0.30 the darkening lands in the GAPS — the streets between
   * towers, the wells, the strip where a wall meets its neighbour — and the
   * city reads as solid rather than as paper. At 0.22 it starts appearing on
   * building FACES as smudges, which is the wash this cutoff exists to
   * prevent, and by 0.15 the frame's darkest twentieth is at 13 of 255.
   */
  bias: number;
  /**
   * ── THE CONTACT DISC, AND WHY IT IS A SECOND ONE ────────────────────────
   * The 12 m disc above answers "how much sky does this point see", which is
   * a question about a WELL between towers and a courtyard. It is the wrong
   * scale for the other thing occlusion has to do, which is put a building ON
   * the pavement rather than in front of it. That happens in the last metre or
   * two, and a 12 m disc spreads it over forty pixels and forgets it: MEASURED
   * at the shipped settings, the whole chain moved the frame's mean by 1.1 to
   * 2.1 of 255 and the wall/pavement junction was inside that.
   *
   * Widening the big disc is the wrong fix — it darkens the courtyard, the
   * park and the middle of the street along with the corner, which is the
   * muddy frame. A SECOND, SHORT disc costs six more taps and only ever sees
   * what is within a couple of metres, so nothing an arm's length away can
   * darken anything.
   *
   * `contactM` is that radius in world metres and `contactMinPx` its floor in
   * device pixels — the same two-scale rule as the wide disc, and for the same
   * reason: at the whole-city camera one pixel is 10.34 m and a 3 m disc has
   * nowhere to land.
   */
  contactM: number;
  contactMinPx: number;
  /** how hard the contact term is pushed; 0 removes it and the taps with it.
   *  Moved 4 -> 10 alongside `intensity` 2.4 -> 6, for the same measurement. */
  contactIntensity: number;

  /* ══ HOW THIS WAS MEASURED, AND WHY THREE ATTEMPTS BEFORE IT WERE WRONG ══
     Any AO sweep taken by moving the camera once and then changing a parameter
     between screenshots is INVALID here, and it fails silently.

     `temporal.ts` accumulates over frames. At a fixed camera each successive
     capture sits further into that accumulation and is a little smoother, so
     local standard deviation DRIFTS DOWNWARD across a sweep whatever the
     parameter does. The proof: running the same four cases in reverse order
     reversed every number.

         forward   old 27.09  c26 27.95  c32 28.58  c36 29.00
         reverse   old 29.04  c26 28.63  c32 27.99  c36 27.10

     The same values, reassigned to whichever case ran last. An evening's worth
     of conclusions about `minPx` came out of that and was thrown away.

     What works: a FRESH PAGE per case, `setTemporal(0)` so there is no
     accumulation to drift, one camera move, one capture. Under it the same
     `minPx` change measured +-0.26 where the artefact had shown +-1.6.

     `scratchpad/gl-night/aopow.mjs` is that harness. */
}

export interface OrthoAoOptions extends Partial<OrthoAoParams> {
  /** taps on the wide disc — a compile-time constant, not a uniform */
  samples?: number;
  /** taps on the contact disc; 0 compiles the second loop out entirely */
  contactSamples?: number;
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
  /** and the contact disc's, which has its own floor */
  readonly contactUsedM: number;
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
  const NC = Math.max(0, Math.round(opts.contactSamples ?? 6));

  const params: OrthoAoParams = {
    radiusM: opts.radiusM ?? 12,
    minPx: opts.minPx ?? 14,
    maxM: opts.maxM ?? 40,
    /* ── HALVED, BECAUSE 6 AND 10 WERE PAINTING THE FRAME BLACK ──────────
       These shipped at 6 and 10 on the strength of a local-contrast figure,
       and that figure was measuring the defect. MEASURED at the Inner
       Richmond's closest camera, a FRESH PAGE per case so the accumulator
       cannot carry a result between them, each case run forward and then in
       reverse and the two orders bit-identical:

           intensity / contact    p05    median   < 20 of 255   R-B
           off                    87.9   144.9      0.1 %      +26.1
           6 / 10  (shipped)       3.9   112.9     11.8 %      +19.2
           3 / 5                  56.8   129.6      0.7 %      +22.8
           2 / 3                  72.9   137.2      0.1 %      +24.0

       An eighth of the frame under 20 of 255, the darkest twentieth crushed
       from 88 to 4, and seven points of warmth off the whole picture. A black
       smear COUNTS as local contrast, which is why the metric rose while the
       picture got worse. Daniel reported it before any harness saw it:
       *"shadow is so strong so long it really look slike its cutting
       streets"*, and *"the black point is too high, or its kind of washed out
       and lost its warth and is kind of greyish"*.

       AND THE SUN IS NOT THE CAUSE, which is the half worth writing down.
       `?sm=0` at the same camera: the cast shadows darken 15.0 % of the frame
       by a mean of 45 levels — real, visible, wanted — but the near-black
       count barely moves, 17.1 % to 16.7 %. NINETY-SEVEN PER CENT of the
       black in this frame was this term, not the shadow map.

       3 and 5 rather than 2 and 3: at 3/5 the occlusion still holds a
       building down onto its own ground (p05 57 against 73, local contrast
       30.4 against 26.2) while keeping the near-black count under one per
       cent. Harness: `scratchpad/gl-night/aolook.mjs`. */
    intensity: opts.intensity ?? 3,
    bias: opts.bias ?? 0.3,
    contactM: opts.contactM ?? 3,
    contactMinPx: opts.contactMinPx ?? 2,
    contactIntensity: opts.contactIntensity ?? 5.0,
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
  const contactR = uniform(1);
  const intensity = uniform(params.intensity);
  const contactI = uniform(params.contactIntensity);
  const bias = uniform(params.bias);

  let radiusUsedM = params.radiusM;
  let contactUsedM = params.contactM;

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

      /* ── AND THE SAME SUM AGAIN, TWO METRES ACROSS ───────────────────
         Identical arithmetic on a much smaller disc. It is written as a second
         loop rather than as a weight inside the first because the two are
         asking different questions and have to be pushed by different amounts:
         the wide one is a sky-visibility term and lives at 2.4, the near one is
         a contact term and can be pushed twice as hard without touching
         anything more than a couple of metres from the surface. */
      const near = float(0).toVar();
      if (NC > 0) {
        Loop(NC, ({ i }) => {
          const ang = float(i).mul(GOLDEN_ANGLE).add(0.5);
          const rad = contactR.mul(sqrt(float(i).add(0.5).div(NC)));
          const off = vec2(cos(ang), sin(ang)).mul(rad);
          const su = u0.add(off.mul(uvPerM));
          const sp = viewPos(su, sampleDepth(su));
          const delta = sp.sub(p0).toVar();
          const len = length(delta).add(1e-4).toVar();
          const rise = dot(n, delta).div(len);
          const r2 = contactR.mul(contactR);
          const fall = r2.div(r2.add(len.mul(len)));
          near.addAssign(max(0, rise.sub(bias)).mul(fall));
        });
      }

      const wide = occ.div(N).mul(intensity);
      const contact = NC > 0 ? near.div(NC).mul(contactI) : float(0);
      out.assign(clamp(float(1).sub(wide.add(contact)), 0, 1));
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
    get contactUsedM() {
      return contactUsedM;
    },
    setParams(p: Partial<OrthoAoParams>): void {
      if (p.radiusM !== undefined) params.radiusM = p.radiusM;
      if (p.minPx !== undefined) params.minPx = p.minPx;
      if (p.intensity !== undefined) params.intensity = p.intensity;
      if (p.bias !== undefined) params.bias = p.bias;
      if (p.contactM !== undefined) params.contactM = p.contactM;
      if (p.contactMinPx !== undefined) params.contactMinPx = p.contactMinPx;
      if (p.contactIntensity !== undefined) params.contactIntensity = p.contactIntensity;
      intensity.value = params.intensity;
      contactI.value = params.contactIntensity;
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
      radiusUsedM = Math.min(
        params.maxM,
        Math.max(params.radiusM, params.minPx * mPerPx),
      );
      radius.value = radiusUsedM;
      contactUsedM = Math.max(params.contactM, params.contactMinPx * mPerPx);
      contactR.value = contactUsedM;
    },
  };
}
