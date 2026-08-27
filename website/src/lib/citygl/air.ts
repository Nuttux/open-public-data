/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/air.ts — THE FRAME'S OWN ATMOSPHERE, LENS AND PRINT.

   The occlusion in `ao.ts` answers a question about a POINT. This file
   answers four questions about the FRAME, and every one of them is a thing
   the published Canvas page does that this port did not:

       the air     how far away is this fragment, and what does the distance
                   take out of it
       the lens    where is the plane of focus — a model on a table is sharp
                   in a band and soft above and below it
       the barrel  a frame has a middle, and a lens is darker at its corners
       the print   one last decision about colour, so the image is a choice
                   rather than the arithmetic sum of thirty layers

   They are together in one file because they share one thing — the frame —
   and because splitting them would mean four sets of the same three uniforms
   and four passes over the same texture. They are separately switchable
   (`quality.ts`: `?haze=`, `?tilt=`, `?vig=`, `?grade=`), because a change
   that cannot be isolated cannot be judged.

   ═══════════════════════════════════════════════════════════════════════
   1. THE AIR, AND HOW IT RELATES TO THE PUBLISHED RULE
   ═══════════════════════════════════════════════════════════════════════
   The Canvas page's rule is `TerrainField.hazeAt`, and `water.ts`
   `drawDepthHaze` paints the same ramp over the bay as one radial fill:

       hz = clamp((|w - downtown| - 3400) / 15000, 0, WA.hazecap)   toward HAZE

   It is a WORLD RADIUS measured from one fixed point in the city. It is
   baked, here, into the vertex colours of the ground (`TerrainField.node`),
   the surround (`layers/surround.ts` reads `hazeAt` per node) and the bay
   texture (`layers/water.ts`), so it is already in the frame and this file
   must not do it twice.

   ── SO IT WAS MEASURED FIRST, AND THE MEASUREMENT IS THE ARGUMENT ───────
   The published rule was evaluated at the ground under five points of the
   frame at each of the four camera stops (1440 x 666, the shipped framings).
   `r` is the world distance from downtown in metres, `baked` is `hazeAt`:

       stop       frame top          frame centre       frame bottom
       city       r  5821  0.161     r  3739  0.023     r  9744  0.423
       district   r  1809  0.000     r   425  0.000     r  2483  0.000
       block      r   710  0.000     r     1  0.000     r   711  0.000
       street     r   212  0.000     r     1  0.000     r   214  0.000

   TWO THINGS FALL OUT OF THAT TABLE.

   First: at three of the four cameras the published haze is IDENTICALLY
   ZERO over the whole frame. Every ground point at the district, block and
   street stops is inside the 3,400 m dead zone, so nothing recedes because
   nothing was ever asked to. There is nothing to double up with there.

   Second: at the city stop it hazes the BOTTOM of the frame (0.423) nearly
   three times as hard as the top (0.161) — because that camera is centred
   3.7 km from downtown and the near edge of its frame is 9.7 km out on the
   far side. A radius from a fixed point is not a distance from the eye, and
   at this camera the two rules point in OPPOSITE directions.

   ── AND THERE IS NOW A SECOND WORLD-RADIUS TERM, WHICH IS NOT THIS ──────
   `citygl/sky.ts` pays out the part of that same ramp the 0.45 cap withheld,
   as a world-baked quad, from 10,150 m to 18,400 m from the anchor. It is
   the same axis as `hazeAt` and it is subject to the same two facts above:
   it is zero everywhere inside 10.15 km, so at the district, block and
   street stops it too is identically zero over the whole frame, and where it
   is not zero it is still a circle on the ground rather than a distance from
   the eye. The two files are answering different questions — theirs is
   *"why does the far shore stop receding?"*, this one's is *"why does
   nothing recede at all?"* — and at the one camera where both are non-zero
   they compose in the same direction on the far corners, which is what the
   shipped `HAZE_CAP` was chosen against.

   ── WHAT THIS FILE DOES INSTEAD ─────────────────────────────────────────
   A depth buffer knows the one thing a world radius cannot: how far a
   fragment is FROM THE CAMERA. So the rule here is extinction along the view
   axis, anchored at the reader's own focal plane:

       air = 1 - exp(-max(0, depth - depthOfGroundUnderTheFrameCentre) / L)
       c   = mix(c, paper, cap * air)

   Three things about it, in order of how much they matter.

   THE ANCHOR NEEDS NO CITY. The published rule needs a dead zone because its
   anchor is a place the camera may be nowhere near; this one is anchored on
   what the reader has centred, so the near half of the frame is untouched by
   construction and the ramp starts exactly where the eye is resting. The
   anchor is derived, not passed in: the camera sits at `centre + F*(far/2)`,
   `centre` is the only point of `span(R,U)` with the frame's plane
   coordinates, and the ground plane is scene Y = 0 — so the ground under the
   frame centre is `far/2 - (-centre.y / F.y)` deep. MEASURED against the
   ground-plane depth computed independently at screen (0.5, 0.5): equal to
   the tenth of a metre at all four stops (201023.5, 202579.3, 202870.8,
   202870.8). It is off by the terrain's own height under that point — up to
   about 280 m of elevation at 3.3x exaggeration over `F.y` = 0.511, so
   ~1.8 km of depth on the steepest hill — which is a fifth of `L` and inside
   the noise of a look.

   IT IS BEER-LAMBERT, NOT A CLAMPED RAMP. `1 - exp(-d/L)` is what extinction
   actually is, and it has no cap edge: there is no distance at which the
   haze visibly stops, which a `clamp(..., 0, cap)` ramp does have and which
   is why the published version needs its cap to sit far outside the frame.

   IT IS A GRADIENT UP THE FRAME, NOT A CIRCLE ON THE GROUND. Under an
   orthographic camera at a fixed bearing, depth is an affine function of
   screen position and height, so iso-depth lines on the ground are
   HORIZONTAL lines on the glass — MEASURED, the ground-plane depth at the
   top-left and top-right corners agrees to the metre at every stop. The far
   half of the frame recedes and the near half does not, which is the thing
   the brief asked for and the thing a radius cannot give. A tower is an
   exception in the right direction: its top is nearer the camera than its
   own base by `height * F.y`, so it stands out of the haze as it rises.

   ── THE NUMBERS, AND WHAT THEY COME TO ON THE FRAME ─────────────────────
   MEASURED off the live frustum at 1440 x 666, the depth from the anchor to
   the top edge of the frame is 6,106 m (city), 1,832 (district), 611
   (block), 183 (street). At `L` = 6,000 m that is `air` = 0.639, 0.263,
   0.097 and 0.030 at the top edge of each frame — a real recession at the
   two wide cameras, a whisper at the block, nothing at the street. That
   ordering is the whole point: a street corner has no aerial perspective and
   should not be given one.

   `cap` is how far the far field may wash toward the paper — see `HAZE_CAP`,
   which carries the sweep it was chosen from.

   ── WHAT IT COMES TO ON THE GLASS ───────────────────────────────────────
   MEASURED at the shipped settings, the frame in ten horizontal strips,
   luminance of 255, against the same frame with the term off:

       stop        top of frame  ->                              foot
       city       +15.1 +16.0 +12.6  +9.3  +2.5  0.0  0.0  0.0  0.0  0.0
       district   +10.0  +8.1  +5.3  +2.5  +0.6  0.0  0.0  0.0  0.0  0.0
       block       +1.4  +0.5  +0.2  +0.0  +0.0  0.0  0.0  0.0  0.0  0.0
       street       0.0   0.0   0.0   0.0   0.0  0.0  0.0  0.0  0.0  0.0

   The bottom HALF of every frame moves by exactly zero, which is the anchor
   doing its job rather than a tuned falloff. And the whole ordering is what
   this was for: a real recession at the two wide cameras, a whisper at the
   block, nothing at all at the street.

   ── THE ONE THING TO KNOW ABOUT IT: IT FOLLOWS THE PAN ──────────────────
   Because the anchor is the frame's own centre, panning re-anchors: a block
   that was hazed at the top of the frame comes forward as the reader brings
   it down. MEASURED at the district stop, panning along the screen's
   vertical, the anchor moves 1,447.5 m of depth per 1,000 plane units and
   does so LINEARLY — five pans, no step, nothing that swims.

   That is a stated property and not a compromise. A world-anchored rule is
   what `hazeAt` and `sky.ts` already are, and the whole finding above is that
   a world-anchored rule is zero at three of the four cameras; an eye-relative
   rule that did not follow the eye would not be eye-relative. The tilt-shift
   below is frame-relative for the same reason and slides the same way on the
   published page, so the two agree rather than fighting.

   ── AND THE TARGET IS THE PAPER, NOT A COLD BLUE ────────────────────────
   Real aerial perspective is Rayleigh scattering and is cold. This one mixes
   toward the descriptor's own `look.haze` — the colour the frame is CLEARED
   to and the colour the ground, the surround and the bay already recede
   toward. Anything else would put an edge between the far city and the paper
   it is drawn on, which is the one thing a receding city may not have. The
   cooling the brief asks for is in §4, where it is a stated decision about
   the whole image rather than a second haze colour nothing else agrees with.

   ═══════════════════════════════════════════════════════════════════════
   2. THE LENS — TILT-SHIFT
   ═══════════════════════════════════════════════════════════════════════
   `film-draw.ts` `drawTiltShift` is the published rule, and it is five
   self-blits through a CSS `blur()` at bands of the frame's height:

       [0.00, 0.09] 3.6 px    [0.84, 0.91] 1.0 px
       [0.09, 0.17] 2.0 px    [0.91, 1.00] 2.4 px
       [0.17, 0.24] 0.9 px

   CSS `blur(r)` is a Gaussian of STANDARD DEVIATION r, so the widest band is
   a sigma of 3.6 CSS px — a kernel about 22 px across, which is far too wide
   to gather in the composite shader one tap at a time.

   So it is one separable Gaussian (three's own `GaussianBlurNode`, two quad
   passes) and the frame is a MIX between the sharp texture and that one
   blurred texture. The band profile then comes out of the mix weight, and
   the conversion is exact rather than eyeballed: the point-spread function
   of `(1-w).delta + w.G(sigma)` has second moment `w.sigma^2`, so the
   equivalent Gaussian is `sigma_eff = sigma * sqrt(w)` and therefore

       w = (sigma_band / sigma_max)^2

   A power ramp through those weights, `w = t^1.5` with `t` the fraction of
   the way from the sharp band's edge to the frame's edge, reproduces them:

       y      published sigma   this file's sigma_eff
       0.000       3.6                3.60
       0.045       3.6                3.08
       0.130       2.0                2.00
       0.205       0.9                0.85
       0.240       0                  0
       0.875       1.0                0.77
       0.955       2.4                1.89
       1.000       2.4                2.41

   The two interior anchors land on the published values; the topmost band is
   taken to 3.6 only at the very edge instead of being held flat across the
   top 9 %, which is the *"no hard line where the focus ends"* its own
   comment asks for. MEASURED off the `"tilt"` debug frame at the city
   camera, the rendered weight at those heights is 1.000, 0.305, 0.053 and
   0.403 (at y = 1) — every one of them within 0.006 of the derivation.

   THE SHARP BAND IS MIXED AT WEIGHT EXACTLY ZERO. Not "nearly zero": the
   ramp is a `clamp` and the middle of the frame is outside both ends of it.
   MEASURED, the same frame with the tilt-shift on and off, over 0.26 to 0.82
   of its height: `max |dRGB| = 0` at all four cameras. The 1-px facade
   window lines are bit-for-bit untouched. And what it does take out where it
   is meant to, as the mean absolute Laplacian of luminance:

       stop       top band       middle       foot band
       city       -21.3 %        +0.00 %      -14.5 %
       district   -29.3 %        +0.00 %      -14.8 %
       block      -35.0 %        +0.00 %      -14.8 %
       street     -38.3 %        +0.00 %      -15.3 %

   ── THE BLUR RUNS AT A FIXED SIZE IN CSS PIXELS ─────────────────────────
   `GaussianBlurNode`'s kernel is a compile-time constant in TEXELS of its
   own render target, and its render target is the input texture scaled by
   `resolutionScale` — which is in DEVICE pixels and therefore moves with the
   device pixel ratio. A kernel baked for one ratio would be half as wide in
   CSS px on a 2x screen. So the scale is `0.5 / dpr` (floored, see
   `MIN_BLUR_SCALE`): one blur texel is then 2 CSS px whatever the device,
   the kernel is constant in the units the published bands are written in,
   and nothing has to be rebuilt when a window moves between screens.

   The coefficients `GaussianBlurNode` builds are the Gaussian's own values
   and are NOT normalised — over the taps it takes they sum to 0.99806 per
   pass, 0.99612 over the two, so a blurred pixel comes back 0.39 % dark.
   That is a visible 1 level of 255 at the top of the frame where the mix
   weight is 1, and it is corrected by the reciprocal, computed here from the
   same formula rather than measured off a frame.

   ── ORDER, AND ONE APPROXIMATION IT MAKES ───────────────────────────────
   The blur is taken from the RAW scene colour, and the occlusion, the air,
   the vignette and the grade are applied to the MIXED result. For the air
   and the occlusion that is exact: both are per-fragment scalars applied to
   a linear mix, and `f*mix(a,b,w) == mix(f*a, f*b, w)`. What it does NOT do
   is blur the occlusion or the haze themselves — at a silhouette inside a
   soft band the colour is soft and the occlusion edge under it is not. At a
   sigma of 3.6 CSS px on a term that is already smooth over 12 m, that has
   not been visible in any capture; it is written down because the cheaper
   order is the reason it is possible at all.

   ═══════════════════════════════════════════════════════════════════════
   3. THE BARREL — THE VIGNETTE
   ═══════════════════════════════════════════════════════════════════════
   The published explorer draws one, and this port had none:
   `renderer.ts` calls `drawCinematic(g, W, H, 0.55, 0.6)` under `LOOK.vig`,
   *"the explorer keeps a light vignette so the frame has a middle"*. That is
   a radial gradient in rgb(52,38,22) from 0.55 R to 1.08 R, R being half the
   frame's diagonal, with alpha 0 / 0.10 / 0.26 at the stops 0 / 0.6 / 1,
   all scaled by 0.55.

   ── THE ONE CONVERSION IT NEEDS, AND WHY IT IS A SINGLE NUMBER ──────────
   A 2D canvas composites in sRGB code values. This chain runs on the pass's
   half-float target in LINEAR working space, and the same alpha there
   darkens LESS, because the vignette colour is dark and the transfer curve
   is not linear. Solved once, at an sRGB 200 background — a bright roof at
   the corner of the frame, which is where a vignette is judged:

       sRGB   0.784 -> 0.7011  (a = 0.143)          the published result
       linear 0.5772 -> 0.4496 needs a = 0.2351     to land on the same pixel

   so the alphas are multiplied by 0.2351 / 0.143 = 1.644. That factor is
   fitted at ONE anchor, so it was checked at another: at an sRGB 130
   background — a shadowed street — the published rule gives 118.8 and this
   one gives 117.3, 1.5 of 255 apart.

   And then checked against the rule itself, on the frame. MEASURED at the
   city camera, mean luminance by radius, this term against `drawCinematic`
   evaluated on the SAME pixels:

       q            frame    this file    the published rule    apart
       0.00-0.55   144.10     144.10          144.10             0.00
       0.55-0.70   157.58     156.13          156.03            +0.11
       0.70-0.85   169.46     164.74          164.38            +0.36
       0.85-1.00   179.86     170.90          170.24            +0.66

   One scalar reproduces the published vignette to two thirds of one level of
   255 at the corner, which is why it is a number and not a curve.

   ═══════════════════════════════════════════════════════════════════════
   4. THE PRINT — ONE GRADE
   ═══════════════════════════════════════════════════════════════════════
   The brief: warm the highlights, cool the shadows, shape the saturation,
   and keep it ONE STATED TRANSFORM rather than a stack of tweaks. It is:

       Lp   = luma(c) ^ (1/2.2)              how bright this pixel READS
       w    = smoothstep(lo, hi, Lp)         0 in the shadows, 1 in the light
       gain = mix(COOL, WARM, w)             a per-channel gain that walks
                                             from one illuminant to the other
       c    = c * mix(1, gain, strength)
       c    = mix(luma(c), c, sat)           chroma, about the new luma

   ── AND THE TWO COLOURS ARE NOT INVENTED ────────────────────────────────
   `terrain.ts` §the light is two colours already ships them, and `light.ts`
   next door already imports them for the rig:

       SUNC = [1.054, 0.9998, 0.8949]      SKYC = [0.9427, 0.9924, 1.1355]

   both normalised to Rec.709 luminance 1.000, *"so on a neutral base they
   change hue and nothing else"*. `skylitN` applies them per SURFACE, weighted
   by which way the face is turned. This applies the same pair per PIXEL,
   weighted by how bright the pixel reads — which reaches everything that has
   no `skylitN` at all: the streets, the markings, the trees, the water and
   the paper. Same two colours, one last time, at the frame.

   THEY ARE CONVERTED FIRST. Those numbers multiply sRGB code values;
   multiplying linear light by 1.054 is a 1.024 change in code value, less
   than half the published tilt. So they are raised to 2.2 and renormalised
   to luminance 1 here, which makes the linear multiply land on the published
   display-space ratio:

       WARM = [1.1114, 0.9896, 0.7747]     COOL = [0.8912, 0.9978, 1.3420]

   `strength` is then a plain fraction of the published tilt, and `QWARM`
   — the strength the Canvas page uses for the same pair at the vertex level
   — is 0.6, which is the ceiling this should never approach: `light.ts`
   §the second sunset is the standing warning about stacking illuminants.

   ── THE KNEES ARE THE FRAME'S OWN QUANTILES ─────────────────────────────
   `lo` and `hi` are not round numbers, they are where this picture's
   shadows and highlights actually are. See `GRADE_LO` / `GRADE_HI`.

   ── WHAT IT COMES TO ON THE GLASS ───────────────────────────────────────
   MEASURED at the shipped strength, R minus B in code values, over the
   frame's own darkest and brightest tenth, against the same frame ungraded:

       stop        shadows p<10        highlights p>90     frame luminance
       city       +14.14 -> +11.70     +8.23 -> +16.89        -0.09
       district    +9.10 ->  +5.62    +15.60 -> +24.25        -0.07
       block       +2.74 ->  -1.26    +20.65 -> +29.60        -0.01
       street      -2.40 ->  -6.50    +13.70 -> +21.88        -0.01

   The shadows go blue by 2.4 to 4.1 and the highlights go gold by 7.5 to
   8.7, at every camera, in the same direction — and the frame's luminance
   moves by at most 0.09 of 255, which is the transform being a HUE tilt and
   not a curve. The value ladder the layers built is left exactly alone.

   ── DEAD ENDS, BOTH OF THEM THE SAME MISTAKE ────────────────────────────
   This chain runs in LINEAR working space and two constants went into it as
   sRGB code values. `new Color(hex)` already returns the linear value
   (`ColorManagement` is on), so a `convertSRGBToLinear()` on top of it took
   the paper from 0.839 to 0.672 and the far field receded toward a colour a
   fifth darker than the one the frame is cleared to. And `52/255` for the
   vignette put a code value straight into a linear mix, which cost the
   vignette 0.72 of its strength — VARYING with the background from 0.49 to
   0.76, because the error is a transfer curve and not a scale, which is
   exactly why it read as "about right" and had to be caught by solving the
   two frames for the alpha they differ by rather than by looking.
   ═══════════════════════════════════════════════════════════════════════ */

import { Color, Vector2, type OrthographicCamera } from "three";
import type { ShaderNodeObject } from "three/tsl";
import type { TextureNode } from "three/webgpu";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import {
  Fn,
  clamp,
  dot,
  exp,
  float,
  length,
  max,
  min,
  mix,
  pow,
  screenUV,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";

import { SKYC, SUNC } from "@/lib/city/terrain";

/** whatever TSL hands back — named once, as `ao.ts` names it */
type AnyNode = ReturnType<TextureNode["sample"]>;
/** a pass's own texture, which is what carries `.rgb` and `.a` */
type PassTex = ShaderNodeObject<TextureNode>;
type BlurNode = ReturnType<typeof gaussianBlur>;

/* ── the frame's own luminance, Rec.709 ─────────────────────────────────
   Written out rather than taken from TSL's `luminance()` so that this file
   and `terrain.ts` §luminance are provably using the same three numbers. */
const LUM: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/* ══ 1. the air ══════════════════════════════════════════════════════════ */

/**
 * How far the far field may wash toward the paper.
 *
 * The published cap is `WA.hazecap` = 0.45, and this is lower for a stated
 * reason: at the city stop, the one camera where the published rule is not
 * identically zero, the far ground is ALREADY at that cap before this term
 * touches it, so the two stack. MEASURED at 1440 x 666, over the top quarter
 * of the frame, against the same frame with the term off:
 *
 *     cap    city: luma / rms contrast     district: luma / rms
 *     0      +0.00 / 22.00                 +0.00  / 20.01
 *     0.22  +11.93 / 17.60                 +6.20  / 18.64
 *     0.28  +14.93 / 16.59                 +7.82  / 18.32
 *     0.34  +17.83 / 15.65                 +9.40  / 18.02
 *     0.45  +22.95 / 14.08                +12.24  / 17.52
 *
 * and the bottom quarter of the frame moves by EXACTLY 0.00 at every one of
 * them, which is the anchor doing its job. 0.34 was the first pick and 0.28
 * is the shipped one: at 0.45 the far city dissolves rather than recedes, at
 * 0.34 it holds but the far shore is close to it, and the standing preference
 * on the published page's own cap — lowered from 0.62 on 2026-08-26 — is for
 * the far city to keep its contrast.
 */
const HAZE_CAP = 0.28;

/**
 * The extinction length, metres of VIEW DEPTH — the distance over which
 * `1 - exp(-d/L)` reaches 63 % of the cap. 6,000 m is chosen off the
 * measured depth of the frame at each stop (see the header): it puts the
 * city stop's top edge at 0.639 of the cap, the district's at 0.263, the
 * block's at 0.097 and the street's at 0.030.
 */
const HAZE_LEN_M = 6000;

/* ══ 2. the lens ═════════════════════════════════════════════════════════ */

/**
 * The widest blur, as a Gaussian sigma in CSS PIXELS — `drawTiltShift`'s own
 * top band. Everything else in the ramp is a fraction of it.
 */
/* ── THE TILT IS HALF WHAT IT WAS, BECAUSE ONLY ONE END SHOWS ────────────
   The published page's radii were ported exactly, and on its own framing they
   are right. On this one they are not: the camera sits high enough that the
   FOOT of the frame is the near ground and rarely holds anything a reader is
   looking at, so the treatment only ever registers at the TOP — and a blur at
   one end of a frame is not a tilt-shift, it is a smear. Daniel: *"i just see
   the top of my frame looking blurry but not much else."*

   Halving the sigma and narrowing the top band keeps the depth cue — the far
   edge still softens, which is what stops the city reading as a flat sheet —
   without announcing itself as an effect. */
const TILT_SIGMA_PX = 1.8;

/** how far the soft band reaches down from the top / up from the foot, as a
 *  fraction of the frame — `drawTiltShift`'s 0.24 and 1 - 0.84 */
const TILT_TOP = 0.13;
const TILT_BOTTOM = 0.16;

/**
 * The foot of the frame is soft in the published bands but not as soft as
 * the top: its widest is 2.4 px against 3.6, and `(2.4/3.6)^2` = 0.444 is
 * the mix weight that reproduces it.
 */
const TILT_BOTTOM_AMP = 0.444;

/** the ramp's exponent — fitted to the published bands, see the header */
const TILT_POW = 1.5;

/**
 * One blur texel, in CSS pixels. The kernel is baked at build; holding the
 * texel at a constant size in CSS px is what keeps the blur the same width
 * on the glass at every device pixel ratio.
 */
const BLUR_TEXEL_CSS = 2;

/**
 * ...but the render target may not fall below this fraction of the drawing
 * buffer, or a 3x phone would blur a sixth-resolution target and the
 * upsample would start to show as facets rather than as softness. At the
 * floor a 3x screen's texel is 1.67 CSS px and the blur comes out at sigma
 * 3.0 rather than 3.6 — 17 % narrow, on the treatment that is least visible
 * on the smallest screen.
 */
const MIN_BLUR_SCALE = 0.2;

/**
 * `GaussianBlurNode`'s `sigma` argument is not a sigma: it sets
 * `kernelSize = 3 + 2 * sigma` and the kernel's real standard deviation is
 * `kernelSize / 3` TEXELS. 1.2 gives a kernel of 5.4 and therefore 1.8
 * texels, which at `BLUR_TEXEL_CSS` = 2 is exactly `TILT_SIGMA_PX`.
 */
const BLUR_SIGMA_ARG = (TILT_SIGMA_PX / BLUR_TEXEL_CSS) * 1.5 - 1.5;

/** the kernel's real standard deviation, in texels of its own target */
const BLUR_SIGMA_TEXELS = (3 + 2 * BLUR_SIGMA_ARG) / 3;

/**
 * What one pass of that kernel sums to, inverted, twice over for the
 * separable pair. The node's coefficients are the Gaussian's own values and
 * are never normalised, so a blurred pixel comes back 0.39 % dark — a
 * visible level of 255 at the top of the frame, where the mix weight is 1.
 * Computed from the node's own formula rather than measured off a frame.
 */
const BLUR_GAIN = (() => {
  const kernel = 3 + 2 * BLUR_SIGMA_ARG;
  const sigma = kernel / 3;
  let sum = 0;
  for (let i = 0; i < kernel; i++) {
    const c = (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma;
    sum += i === 0 ? c : 2 * c;
  }
  return 1 / (sum * sum);
})();

/* ══ 3. the barrel ═══════════════════════════════════════════════════════ */

/**
 * `drawCinematic`'s own gradient colour, rgb(52,38,22).
 *
 * THROUGH `Color`, NOT THROUGH `/255`. `ColorManagement` is on, so `new
 * Color("#342616")` already RETURNS the linear value — writing the three
 * bytes over 255 puts an sRGB code value into a linear multiply and the
 * vignette comes out at 0.72 of its intended strength, varying with the
 * background because the error is a transfer curve and not a scale.
 * MEASURED, before the fix, by solving the two frames for the alpha they
 * differ by: 0.49 of intended at the inner edge of the ring and 0.76 at the
 * corner, against 1.00 after it.
 */
const VIG_COLOR = new Color(
  (52 << 16) | (38 << 8) | 22,
);
/** ...its inner and outer radii, as a fraction of half the frame's diagonal */
const VIG_R0 = 0.55;
const VIG_R1 = 1.08;
/** ...and its two alpha stops, at 0.6 and 1 of the way between those radii */
const VIG_A1 = 0.1;
const VIG_A2 = 0.26;
const VIG_KNEE = 0.6;
/** the strength `renderer.ts` passes for the explorer — *"half the film's"* */
const VIG_STRENGTH = 0.55;
/** sRGB alpha -> linear alpha, solved at an sRGB 200 corner; see the header */
const VIG_LINEAR = 1.644;

/* ══ 4. the print ════════════════════════════════════════════════════════ */

/**
 * The two published illuminants, raised to 2.2 and renormalised to Rec.709
 * luminance 1 — see the header §they are converted first. Derived here so
 * that a change to `SUNC` or `SKYC` upstream carries through rather than
 * being silently out of date.
 */
function toLinearGain(c: readonly [number, number, number]): [number, number, number] {
  const g: [number, number, number] = [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];
  const l = LUM[0] * g[0] + LUM[1] * g[1] + LUM[2] * g[2];
  return [g[0] / l, g[1] / l, g[2] / l];
}
const WARM = toLinearGain(SUNC);
const COOL = toLinearGain(SKYC);

/**
 * The knees of the shadow-to-highlight walk, in perceptual (code-value)
 * luminance.
 *
 * They are the FRAME'S OWN QUANTILES, not round numbers. MEASURED on the
 * ungraded frame at 1440 x 666 at the four camera stops, luminance as a
 * fraction of 255:
 *
 *     stop        p10     p50     p90
 *     city       0.378   0.592   0.771
 *     district   0.273   0.448   0.659
 *     block      0.254   0.404   0.573
 *     street     0.242   0.354   0.525
 *     mean       0.287   0.449   0.632
 *
 * so the walk spends its whole travel across the range this picture actually
 * occupies: the darkest tenth of the frame sits at the cool end, the
 * brightest tenth at the warm end, and the median at 0.53 of the way. The
 * pair that shipped first, 0.32 and 0.74, put the high knee ABOVE the 90th
 * percentile of every camera — nine tenths of the frame never reached the
 * warm end and the grade did most of its work on the few brightest roofs.
 *
 * They are FIXED rather than per-camera on purpose. A grade whose knees
 * followed the frame would make the same roof a different colour at two
 * zooms of the same city, which is a bug that looks like a decision.
 */
const GRADE_LO = 0.287;
const GRADE_HI = 0.632;

/**
 * How much of the published tilt the frame gets, on top of the per-surface
 * tilt the layers already carry. `QWARM` — the Canvas page's own strength
 * for the same pair, per surface — is 0.6; this is a quarter of it, and
 * `light.ts` §the second sunset is why it is not more.
 */
const GRADE_STRENGTH = 0.25;

/**
 * Chroma, about the graded luma. Above 1 because the two treatments before
 * it both take colour out: the haze pulls the far field toward a paper of
 * saturation 0.068 and the vignette pulls the corners toward a near-neutral
 * brown.
 *
 * MEASURED, whole-frame mean saturation with all four terms on against all
 * four off: 0.205 -> 0.181 at the city stop, where the haze still wins
 * because most of that frame is far field; 0.175 -> 0.177 at the district;
 * 0.090 -> 0.106 at the block and 0.069 -> 0.090 at the street, where the
 * haze is nearly zero and this is the whole of the change. So it is a
 * compensation at the wide cameras and a lift at the tight ones.
 *
 * 1.12 and 1.20 were both on the glass beside it. They are not wrong — the
 * clipped fraction of the frame goes 0.018 % to 0.022 % over that whole
 * range, so there is headroom — but the palette is a gouache and 1.06 is
 * where the blue glass stops announcing itself.
 */
const GRADE_SAT = 1.06;

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * THE DERIVED CONSTANTS, READABLE.
 *
 * Everything in this record is computed above from a published number or
 * from `GaussianBlurNode`'s own kernel formula, and every one of them is a
 * thing a later edit could silently break — the two illuminants stop being
 * luminance-1, the blur's gain stops matching the kernel it corrects.
 * `air.test.ts` holds them; a harness prints them.
 */
export const AIR_DERIVED = {
  /** the widest blur this frame can carry, CSS px of Gaussian sigma */
  tiltSigmaPx: TILT_SIGMA_PX,
  /** what `GaussianBlurNode` is asked for, and what that makes its kernel */
  blurSigmaArg: BLUR_SIGMA_ARG,
  blurSigmaTexels: BLUR_SIGMA_TEXELS,
  /** the reciprocal of the unnormalised kernel's sum, over the two passes */
  blurGain: BLUR_GAIN,
  /** `SUNC` and `SKYC`, in linear light, at Rec.709 luminance 1 */
  warm: WARM,
  cool: COOL,
} as const;

/**
 * The tilt-shift mix weight at a height of the frame, 0 being the top.
 *
 * A MIRROR of `tiltOf` below, which is TSL and cannot be run on a CPU. What
 * ties the two together is not this function: it is the `"tilt"` debug frame,
 * which puts the shader's own weight on the glass and was MEASURED against
 * this ramp at the city camera — 1.000, 0.305, 0.053 and 0.403 at y = 0,
 * 0.13, 0.205 and 1, every one within 0.006. This exists so `air.test.ts`
 * can hold the ramp to the published band radii without a GPU.
 */
export function tiltWeight(y: number): number {
  const top = Math.min(1, Math.max(0, 1 - y / TILT_TOP));
  const bot = Math.min(1, Math.max(0, (y - (1 - TILT_BOTTOM)) / TILT_BOTTOM));
  return Math.max(top ** TILT_POW, bot ** TILT_POW * TILT_BOTTOM_AMP);
}

/** the live dials — every one of these is a uniform, none needs a rebuild */
export interface AirParams {
  /** how far the far field may wash toward the paper, 0..1 */
  hazeCap: number;
  /** extinction length, metres of view depth */
  hazeLenM: number;
  /** the tilt-shift mix, 1 = the published band profile */
  tilt: number;
  /** the vignette, 1 = `drawCinematic`'s own strength for the explorer */
  vignette: number;
  /** the illuminant tilt, as a fraction of the published pair */
  gradeStrength: number;
  /** chroma about the graded luma */
  gradeSat: number;
}

/** which of the four are compiled in at all — see `quality.ts` */
export interface AirSwitches {
  haze: boolean;
  tiltShift: boolean;
  vignette: boolean;
  grade: boolean;
}

export interface AirOptions extends Partial<AirParams> {
  /** the paper this frame recedes toward — the descriptor's `look.haze` */
  paper: string;
  /** which terms are compiled in; anything omitted is on */
  on?: Partial<AirSwitches>;
  /**
   * The blur's render target, as a fraction of the drawing buffer. Left
   * undefined it follows the device pixel ratio so one texel is
   * `BLUR_TEXEL_CSS` CSS px; a tier that wants a cheaper blur pins it lower.
   */
  blurScale?: number;
}

export interface CityAir {
  /**
   * The finished frame. `base` is the scene colour, `ao` the occlusion term
   * (or `null` when the occlusion is off) — everything else is this file's.
   */
  compose(base: PassTex, ao: AnyNode | null): AnyNode;
  /** the tilt weight alone, as a frame — for an A/B capture */
  debugTilt(): AnyNode;
  /** the extinction term alone, as a frame — for an A/B capture */
  debugAir(): AnyNode;
  readonly params: Readonly<AirParams>;
  setParams(p: Partial<AirParams>): void;
  /**
   * This frame's camera and buffer. Must be called before the frame renders:
   * the anchor is read off the frustum, which moved.
   */
  update(camera: OrthographicCamera, bufferW: number, bufferH: number, dpr: number): void;
  /** what the anchor came out as this frame, metres of view depth */
  readonly anchorDepthM: number;
  /** the blur's effective sigma this frame, CSS px — 0 when it is off */
  readonly blurSigmaPx: number;
  dispose(): void;
}

export function cityAir(depthTex: TextureNode, opts: AirOptions): CityAir {
  const on: AirSwitches = {
    haze: opts.on?.haze ?? true,
    tiltShift: opts.on?.tiltShift ?? true,
    vignette: opts.on?.vignette ?? true,
    grade: opts.on?.grade ?? true,
  };

  const params: AirParams = {
    hazeCap: opts.hazeCap ?? HAZE_CAP,
    hazeLenM: opts.hazeLenM ?? HAZE_LEN_M,
    tilt: opts.tilt ?? 1,
    vignette: opts.vignette ?? 1,
    gradeStrength: opts.gradeStrength ?? GRADE_STRENGTH,
    gradeSat: opts.gradeSat ?? GRADE_SAT,
  };

  /* ── the uniforms, one line each ────────────────────────────────────── */
  /** the anchor, as a NORMALISED depth — the ramp is then one subtract */
  const dRef = uniform(0.5);
  /** the depth span over the extinction length, so the exp needs no divide */
  const spanOverL = uniform(1);
  const hazeCap = uniform(params.hazeCap);
  /* `new Color(hex)` is ALREADY the linear value — `ColorManagement` is on,
     and this is the same call `engine.ts` makes for the clear colour. A
     `convertSRGBToLinear()` on top of it is a SECOND conversion: it turns the
     paper from 0.839 to 0.672 and the far field then recedes toward a colour
     a fifth darker than the one the frame is cleared to. */
  const paper = uniform(new Color(opts.paper));
  const tiltK = uniform(params.tilt);
  /** (W, H) of the drawing buffer — the vignette needs the frame's aspect */
  const frame = uniform(new Vector2(1, 1));
  const vigK = uniform(params.vignette);
  const gradeK = uniform(params.gradeStrength);
  const satK = uniform(params.gradeSat);

  let anchorDepthM = 0;
  let lastDpr = 1;
  let blur: BlurNode | null = null;
  /** `1 / (BLUR_TEXEL_CSS * dpr)`, floored — set every frame in `update` */
  let blurScale = opts.blurScale ?? 1 / BLUR_TEXEL_CSS;
  const pinnedScale = opts.blurScale;

  const luma = (c: AnyNode): AnyNode => dot(c, vec3(LUM[0], LUM[1], LUM[2]));

  /** `1 - exp(-max(0, d - anchor) * span / L)` — the extinction term */
  const airOf = (): AnyNode =>
    float(1).sub(exp(max(depthTex.sample(uv()).r.sub(dRef), 0).mul(spanOverL).negate()));

  /**
   * The mix weight at this height of the frame. `screenUV` follows the
   * WebGPU convention on BOTH backends — `ScreenNode.generate` flips
   * `gl_FragCoord` itself where it has to — so y = 0 is the top of the
   * picture and the two ends of the ramp cannot come out swapped.
   */
  const tiltOf = (): AnyNode => {
    const y = screenUV.y;
    const tTop = clamp(float(1).sub(y.div(TILT_TOP)), 0, 1);
    const tBot = clamp(y.sub(1 - TILT_BOTTOM).div(TILT_BOTTOM), 0, 1);
    return max(pow(tTop, TILT_POW), pow(tBot, TILT_POW).mul(TILT_BOTTOM_AMP)).mul(tiltK);
  };

  /** `drawCinematic`'s radial gradient, as its own two-stop piecewise ramp */
  const vigOf = (): AnyNode => {
    const q = length(screenUV.sub(0.5).mul(frame)).div(length(frame).mul(0.5));
    const u = clamp(q.sub(VIG_R0).div(VIG_R1 - VIG_R0), 0, 1);
    const a = min(u, VIG_KNEE)
      .div(VIG_KNEE)
      .mul(VIG_A1)
      .add(
        max(u.sub(VIG_KNEE), 0)
          .div(1 - VIG_KNEE)
          .mul(VIG_A2 - VIG_A1),
      );
    return a.mul(VIG_STRENGTH * VIG_LINEAR).mul(vigK);
  };

  return {
    compose(base: PassTex, ao: AnyNode | null): AnyNode {
      /* the blur is over the COLOUR, so it can only be built here — and in
         its own `try`, because a backend that cannot give this chain must
         lose the tilt-shift and keep the city */
      let soft: AnyNode | null = null;
      if (on.tiltShift) {
        try {
          const g = gaussianBlur(base, null, BLUR_SIGMA_ARG);
          g.resolutionScale = blurScale;
          blur = g;
          soft = g.rgb.mul(BLUR_GAIN);
        } catch (e) {
          console.warn("citygl: no tilt-shift on this backend —", e);
          blur = null;
          soft = null;
        }
      }

      return Fn(() => {
        const c = (soft ? mix(base.rgb, soft, tiltOf()) : base.rgb).toVar();
        if (ao) c.mulAssign(ao);
        if (on.haze) c.assign(mix(c, paper, airOf().mul(hazeCap)));
        if (on.vignette) c.assign(mix(c, vec3(VIG_COLOR.r, VIG_COLOR.g, VIG_COLOR.b), vigOf()));
        if (on.grade) {
          const w = smoothstep(GRADE_LO, GRADE_HI, pow(max(luma(c), 0), 1 / 2.2));
          const gain = mix(vec3(COOL[0], COOL[1], COOL[2]), vec3(WARM[0], WARM[1], WARM[2]), w);
          c.assign(c.mul(mix(vec3(1, 1, 1), gain, gradeK)));
          c.assign(mix(vec3(luma(c)), c, satK));
        }
        /* the alpha stays 1 — multiplying it would make the canvas
           translucent and let the page's own background through the
           darkest corners */
        return vec4(c, base.a);
      })() as AnyNode;
    },

    debugTilt(): AnyNode {
      return Fn(() => {
        const w = tiltOf().toVar();
        return vec4(w, w, w, 1);
      })() as AnyNode;
    },

    debugAir(): AnyNode {
      return Fn(() => {
        const a = airOf().mul(hazeCap).toVar();
        return vec4(a, a, a, 1);
      })() as AnyNode;
    },

    get params() {
      return params;
    },
    get anchorDepthM() {
      return anchorDepthM;
    },
    get blurSigmaPx() {
      return blur ? BLUR_SIGMA_TEXELS / (blurScale * lastDpr) : 0;
    },

    setParams(p: Partial<AirParams>): void {
      if (p.hazeCap !== undefined) params.hazeCap = p.hazeCap;
      if (p.hazeLenM !== undefined) params.hazeLenM = p.hazeLenM;
      if (p.tilt !== undefined) params.tilt = p.tilt;
      if (p.vignette !== undefined) params.vignette = p.vignette;
      if (p.gradeStrength !== undefined) params.gradeStrength = p.gradeStrength;
      if (p.gradeSat !== undefined) params.gradeSat = p.gradeSat;
      hazeCap.value = params.hazeCap;
      tiltK.value = params.tilt;
      vigK.value = params.vignette;
      gradeK.value = params.gradeStrength;
      satK.value = params.gradeSat;
    },

    update(camera: OrthographicCamera, bufferW: number, bufferH: number, dpr: number): void {
      lastDpr = Math.max(1, dpr);
      frame.value.set(Math.max(1, bufferW), Math.max(1, bufferH));

      /* ── THE ANCHOR — see the header §the anchor needs no city ────────
         The camera looks along -F, F being its own world Z axis. Take the
         point at the CENTRE of its near face, march along -F until the
         ground plane (scene Y = 0), and the distance marched is the depth
         the middle of the frame is resting at:

             o.y  = position.y + right.y * cx + up.y * cy
             dist = o.y / F.y

         where (cx, cy) is the frustum's own centre — zero for the symmetric
         frustum `camera.ts` builds, written out anyway so this holds for any
         frustum and needs no agreement with how the camera was set up.
         MEASURED against the ground-plane depth computed independently at
         screen (0.5, 0.5): equal to the tenth of a metre at all four stops. */
      const e = camera.matrixWorld.elements;
      const fy = e[9];
      const oy =
        e[13] +
        e[1] * ((camera.left + camera.right) / 2) +
        e[5] * ((camera.top + camera.bottom) / 2);
      /* a camera looking ALONG the ground plane never crosses it; the guard
         is what stops a division by zero from becoming a NaN frame */
      anchorDepthM = Math.abs(fy) > 1e-6 ? oy / fy : (camera.far - camera.near) / 2;

      const span = Math.max(1e-6, camera.far - camera.near);
      dRef.value = (anchorDepthM - camera.near) / span;
      spanOverL.value = span / Math.max(1, params.hazeLenM);

      blurScale = pinnedScale ?? Math.max(MIN_BLUR_SCALE, 1 / (BLUR_TEXEL_CSS * lastDpr));
      if (blur) blur.resolutionScale = blurScale;
    },

    dispose(): void {
      blur?.dispose();
      blur = null;
    },
  };
}
