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
     the shadow map           1,024 instead of 2,048 — a quarter of the
                              texels, and a shadow edge at that size is
                              already softer than the penumbra it stands for.
     the canopy               crowns stop being drawn one camera earlier.
     antialiasing             off on the low tier; the DPR cap does more for
                              the same money.

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
}

const HIGH: QualitySettings = {
  tier: "high",
  maxDpr: 2,
  shadowMap: 2048,
  antialias: true,
  canopyFromStep: 1,
  ao: true,
  aoSamples: 12,
  aoRadiusM: 12,
};

const LOW: QualitySettings = {
  tier: "low",
  maxDpr: 2,
  shadowMap: 1024,
  antialias: false,
  canopyFromStep: 2,
  ao: true,
  aoSamples: 8,
  aoRadiusM: 12,
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
 * cannot be compared. `?aa=0|1`, `?ao=0|1` and `?aos=N` override one setting
 * each on top of the chosen tier, which is what an A/B needs: a tier switch
 * moves five things at once and proves nothing about any one of them.
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
