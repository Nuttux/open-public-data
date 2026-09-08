/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/quality.ts — WHAT A PHONE GETS, AND WHY IT IS NOT LESS CITY.

   The temptation on a small device is to draw less of the place: fewer
   buildings, no trees, a coarser ground. That is the wrong axis. What a phone
   is short of is FILL RATE and MEMORY BANDWIDTH — pixels and megabytes —
   not triangles. A modern phone will happily push five million triangles; it
   will not happily shade twelve million fragments at device pixel ratio 3
   with a 2,048 shadow map sampled nine times each.

   So the tier moves the things a reader cannot name and leaves the city
   whole:

     the device pixel ratio   the single largest lever there is. Rendering at
                              3x on a 6-inch screen is nine times the
                              fragments of 1x for a difference nobody can see
                              at arm's length. Capped at 2.
     the shadow map           2,048 instead of 4,096 — a quarter of the
                              texels, and 33 MB of them instead of 134.
                              MEASURED with the light-space fit in
                              `light.ts`, the box at the closest camera is
                              1,759 m across, so a low-tier texel is 0.86 m
                              against a screen pixel of 0.31 — soft, and
                              softer than the penumbra it stands for.
     the tree shadows         off — ONCE SOMETHING PASSES IT. `treeShadow`
                              below is read by nobody yet: the canopy layer
                              is built in `CityGLMap` and takes its own
                              default. One line wires it, and it is written
                              out on the setting itself. Measured, casting
                              costs 0.4 ms at a phone's own frame on THIS
                              GPU, so this is a caution about handset
                              silicon and not a fix for a number.
     the canopy               crowns stop being drawn one camera earlier.
     the occlusion taps       8 instead of 12 on the disc — the term is
                              smoother with more, and nothing else changes.

   ── AND FOUR THINGS THE PHONE KEEPS WHOLE ───────────────────────────────
   The aerial haze, the tilt-shift, the vignette and the grade (`air.ts`) are
   the same on both tiers, and that is a measurement rather than a wish.

   MEASURED as a paired interleaved A/B — one page load, the cases in
   rotation, the median over rounds, `--disable-gpu-vsync` (without it every
   number is 16.7 ms and nothing is being measured but the compositor), a
   1-pixel `readPixels` as the fence:

       frame                          chain off   +haze,vig,grade   +tilt-shift
       1440 x 666  dpr 1  city          20.70          20.80           21.20
       1440 x 666  dpr 2  block         31.40          31.40           32.50
       390 x 557   dpr 2  block         12.20          11.90           12.70

   The three arithmetic terms are inside the run-to-run spread at every
   frame size — they are a handful of instructions on a fragment the
   composite was already writing. The tilt-shift is two separable quad
   passes on a target that is a QUARTER of the drawing buffer's area at any
   device pixel ratio (`air.ts` §the blur runs at a fixed size in CSS
   pixels), and it costs 0.4 to 1.1 ms.

   Two honest caveats. The absolute numbers are high for this machine — the
   documented profile for the same frames is 15.9 and 9.5 ms — because three
   workstreams were rebuilding this tree while it ran; the PAIRED differences
   are what the interleaving is for and they are what is quoted. And the
   phone row is a phone's FRAME on this machine's GPU, not phone silicon,
   exactly as the antialiasing caveat above is. `?tilt=0` turns it off there
   without a rebuild.

   A tier that took these away would not be a cheaper city, it would be a
   flatter one.

   ── AND ONE THING THE LOW TIER NO LONGER GIVES UP: ANTIALIASING ─────────
   It used to be off here, on the argument that "the DPR cap does more for the
   same money". Both halves of that were tested and the second half is wrong.

   MEASURED, at a phone's own frame (an emulated iPhone 13, canvas 390 CSS px,
   drawing buffer 780 x 876), block camera: 9.6 ms with MSAA off, 9.7 ms with
   4x MSAA on. And MEASURED at 1440 x 666 against a 16-sample supersampled
   reference, the difference it makes is not small: RMSE over the edge band
   falls from 11.41 to 7.54, a third of the aliasing gone.

   The honest caveat: that 0.1 ms was measured on this machine's GPU with a
   phone-sized frame, NOT on phone silicon. Multisampling is the one form of
   antialiasing a tile-based mobile GPU resolves inside tile memory, which is
   why it is the right bet rather than a post-process resolve — but it is a
   bet until someone runs it on a handset. `?aa=0` turns it off there without
   a rebuild.

   NOTHING here removes a published thing. Every building, every street and
   every tree the record puts on the ground is still on the ground.
   ═══════════════════════════════════════════════════════════════════════ */

export type QualityTier = "low" | "high";

export interface QualitySettings {
  tier: QualityTier;
  /** ceiling on the device pixel ratio */
  maxDpr: number;
  /** shadow map edge, texels; 0 turns the shadow pass off entirely */
  shadowMap: number;
  /** antialias the main frame */
  antialias: boolean;
  /** the camera step from which street trees are drawn */
  canopyFromStep: number;
  /** run the ambient-occlusion post chain at all */
  ao: boolean;
  /** taps on the occlusion disc — the whole cost of the term is this number */
  aoSamples: number;
  /** the occlusion disc on the ground, world metres */
  aoRadiusM: number;
  /**
   * DO THE STREET TREES CAST?
   *
   * A crown that casts nothing does not sit on the ground — it hovers. What
   * kept it off was a measurement: with the shadow camera fitted in world x/z
   * the BLOCK frame cost 991 ms with the canopy casting, because that box was
   * 3,484 m across and caught nearly every tree chunk in the city, and an
   * `InstancedMesh` re-renders every crown in a chunk whether or not it is on
   * screen. Re-MEASURED against the light-space fit, which halves the box, it
   * is free — `layers/trees.ts` §and they cast again has the three runs.
   *
   * ── AND IT IS WIRED NOW, WHICH THIS USED TO DENY ────────────────────────
   * This said "NOT WIRED YET" and gave the line that would wire it. That line
   * is in the tree: `components/us/citygl/CityGLMap.tsx` passes
   * `castShadow: engine.quality.treeShadow` to `treesLayer`. The note went
   * stale and kept telling readers the setting did nothing.
   *
   * VERIFIED rather than assumed, which is the only reason this correction is
   * trustworthy — `?treecast=0` against `?treecast=1` in the Inner Richmond,
   * fresh page per case, accumulation off:
   *
   *     block camera    2.2 % of the frame moves, max 65 of 255
   *     street camera   3.1 %                     max 69
   *
   * So this setting is live, and the consequence is real: the LOW tier sets it
   * false, so a phone now genuinely loses its tree shadows where before it
   * kept them whatever this said. `?treecast=0|1` overrides either tier.
   */
  treeShadow: boolean;
  /* ── THE FOUR `air.ts` TREATMENTS, EACH ITS OWN SWITCH ────────────────
     Separate rather than one `air` flag because the whole reason they exist
     as four is that they are four decisions, and a decision that cannot be
     turned off on its own cannot be judged on its own. `?haze=`, `?tilt=`,
     `?vig=`, `?grade=` move one each; `?air=` moves all four. */
  /** depth-based aerial perspective toward the paper */
  haze: boolean;
  /** the soft band at the top and foot of the frame */
  tiltShift: boolean;
  /** the light vignette that gives the frame a middle */
  vignette: boolean;
  /** the one final colour decision */
  grade: boolean;
  /**
   * The lens glow over the frame's brightest surfaces.
   *
   * Unlike the four above it is NOT a port of anything the Canvas page does —
   * a sheet of paper has no lens and cannot bloom. It is here because this
   * renderer has a real HDR frame and nothing was reading the top of it: the
   * brightest roofs, the sun's specular on water and metal all clipped to the
   * same white as a plain pale wall. Bloom is what makes a bright thing read
   * as BRIGHT rather than as light-coloured.
   */
  bloom: boolean;
}

const HIGH: QualitySettings = {
  tier: "high",
  maxDpr: 2,
  shadowMap: 4096,
  antialias: true,
  canopyFromStep: 1,
  ao: true,
  aoSamples: 12,
  aoRadiusM: 12,
  treeShadow: true,
  haze: false, // off since 2026-09-02 — no haze anywhere; `?haze=1` for the A/B
  tiltShift: true,
  vignette: true,
  grade: true,
  bloom: true,
};

const LOW: QualitySettings = {
  tier: "low",
  maxDpr: 2,
  shadowMap: 2048,
  antialias: true,
  canopyFromStep: 2,
  ao: true,
  aoSamples: 8,
  aoRadiusM: 12,
  treeShadow: false,
  haze: false, // off since 2026-09-02 — no haze anywhere; `?haze=1` for the A/B
  tiltShift: true,
  vignette: true,
  grade: true,
  bloom: true,
};

/**
 * WHICH TIER, AND THE TEST IS NOT "IS THIS A PHONE".
 *
 * A user agent string is a guess about a device; what actually decides
 * whether this renderer is comfortable is how many pixels it has been asked
 * to shade and how much parallelism it has to shade them with. So the test is
 * the two numbers that matter — the pixel budget and the core count — plus
 * `pointer: coarse`, which is the one honest signal that a screen is being
 * held rather than sat in front of.
 *
 * `?q=low` / `?q=high` overrides it, because a tier that cannot be forced
 * cannot be compared. `?aa=0|1`, `?ao=0|1`, `?aos=N`, `?haze=0|1`,
 * `?tilt=0|1`, `?vig=0|1`, `?grade=0|1` and `?air=0|1` override one setting
 * each on top of the chosen tier, which is what an A/B needs: a tier switch
 * moves nine things at once and proves nothing about any one of them.
 */
export function detectQuality(search = ""): QualitySettings {
  const forced = /(?:\?|&)q=(low|high)/.exec(search)?.[1];
  const base =
    forced === "low"
      ? { ...LOW }
      : forced === "high" || typeof window === "undefined"
        ? { ...HIGH }
        : autoTier();
  return withOverrides(base, search);
}

function withOverrides(q: QualitySettings, search: string): QualitySettings {
  const aa = /(?:\?|&)aa=([01])/.exec(search)?.[1];
  if (aa) q.antialias = aa === "1";
  const ao = /(?:\?|&)ao=([01])/.exec(search)?.[1];
  if (ao) q.ao = ao === "1";
  const aos = /(?:\?|&)aos=(\d+)/.exec(search)?.[1];
  if (aos) q.aoSamples = Math.max(4, Number(aos));
  /* `?air=` first, so `?air=0&haze=1` reads as "none of it except the haze"
     rather than depending on which the regexes happened to run first */
  const air = /(?:\?|&)air=([01])/.exec(search)?.[1];
  if (air) {
    const v = air === "1";
    q.haze = v;
    q.tiltShift = v;
    q.vignette = v;
    q.grade = v;
  }
  const haze = /(?:\?|&)haze=([01])/.exec(search)?.[1];
  if (haze) q.haze = haze === "1";
  const tilt = /(?:\?|&)tilt=([01])/.exec(search)?.[1];
  if (tilt) q.tiltShift = tilt === "1";
  const vig = /(?:\?|&)vig=([01])/.exec(search)?.[1];
  if (vig) q.vignette = vig === "1";
  const bloom = /(?:\?|&)bloom=([01])/.exec(search)?.[1];
  if (bloom) q.bloom = bloom === "1";
  const grade = /(?:\?|&)grade=([01])/.exec(search)?.[1];
  if (grade) q.grade = grade === "1";
  /* the shadow map's edge, so the crispness/cost curve can be walked without a
     rebuild — and `?sm=0` is the honest control for "what is the sun worth",
     because it removes the pass rather than the light. Powers of two only. */
  const sm = /(?:\?|&)sm=(\d+)/.exec(search)?.[1];
  if (sm !== undefined) q.shadowMap = Math.max(0, Number(sm));
  const tc = /(?:\?|&)treecast=([01])/.exec(search)?.[1];
  if (tc) q.treeShadow = tc === "1";
  return q;
}

function autoTier(): QualitySettings {

  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;
  /* the fragment budget the device is ASKING for, before any cap */
  const px = window.innerWidth * window.innerHeight * dpr * dpr;

  const low = coarse || cores <= 4 || px > 6_000_000;
  return low ? { ...LOW } : { ...HIGH };
}

/* ── ADAPTIVE: WHAT A SLOW GPU GIVES UP, AND IN WHAT ORDER ───────────────
   The tier above is decided at construction from what the device SAYS it
   is. This is decided from what it DOES: the engine samples the interval
   between consecutive painted frames while the reader is moving the camera
   or the film is running, and when the median of a window is slow it steps
   down one rung. Never back up — a session that has proved slow once is not
   asked to prove it again on every hill.

   MEASURED on this GPU (`scripts/probes/rungs.mjs`, vsync off, dpr 2):

       camera        as is   bldg shadows off   dpr 1   shadow map off
       whole city    66 fps        86            67           94
       district      65            76            75          104
       street        85           112            85          141

   So the rungs are the two that moved the number: the buildings' and caps'
   shadow casting first (the picture keeps its sun and the ground's own
   shade), then the shadow map altogether. Dropping the device pixel ratio
   bought nothing here and is not a rung until a fill-rate-bound GPU shows
   it should be. */

/** a frame slower than this is one the reader felt: three 60 Hz vsyncs,
 *  20 fps. MEASURED: at 34 ms this machine's own dpr-2 whole-city drive
 *  stepped down twice while a render ran in the background — a bar that a
 *  good GPU under load clears is the wrong bar. */
export const SLOW_FRAME_MS = 50;
/** slow windows in a row before a rung is taken — one is a moment */
export const ADAPT_SLOW_WINDOWS = 2;
/** consecutive painted frames judged together */
export const ADAPT_WINDOW = 24;
/** a frame asked for later than this after the last one ended follows a
 *  pause, not a drive, and is not a sample — `engine.ts` §A SLOW FRAME AND A
 *  PAUSE LOOK THE SAME. Or later than two of the last frame's own draw
 *  times, whichever is longer: a throttled browser hands the next frame
 *  back late in proportion to how long the last one took. */
export const ADAPT_MAX_GAP_MS = 100;
/** a sample is capped here: a tab that lost its frames is not a slow GPU */
export const ADAPT_GAP_CAP_MS = 1000;
/** how many rungs there are to step down */
export const ADAPT_RUNGS = 2;

/** the median of a full window, or null while the window is short */
export function windowMedian(gaps: readonly number[], window = ADAPT_WINDOW): number | null {
  if (gaps.length < window) return null;
  const w = gaps.slice(-window).sort((a, b) => a - b);
  return w[Math.floor(w.length / 2)];
}

/** whether a window of frame gaps says the GPU is behind */
export function framesAreSlow(gaps: readonly number[], slowMs = SLOW_FRAME_MS, window = ADAPT_WINDOW): boolean {
  const m = windowMedian(gaps, window);
  return m !== null && m > slowMs;
}
