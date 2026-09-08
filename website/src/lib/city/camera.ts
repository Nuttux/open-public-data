/* ═══════════════════════════════════════════════════════════════════════
   src/lib/city/camera.ts — the CAMERA, with no DOM in it.

   Everything here is pure arithmetic over a small state object, which is the
   point: the parts that are easy to get wrong (zoom-toward-pointer, the pan
   clamp, the LOD band, where a rasterised buffer lands) are the parts that
   can be asserted headlessly, and they are, in camera.test.ts.

   THE ONE EQUATION the whole file rests on. projection.ts maps world → plane
   once (proj(), which depends on the bearing, the tilt and ZEX and nothing
   else), and then puts the plane on screen with

       sx = (p0 − cam.cx) · cam.scale + W/2
       sy = H/2 − (p1 − cam.cy) · cam.scale

   That second step is a pure similarity transform. So for a FIXED
   projection, any two camera states differ by a scale and a translation —
   which is exactly what drawImage() does for free. That is why panning and
   zooming can be a blit rather than a re-render, and it is why the LOD band
   is frozen during a gesture (see freezeBand): the moment ZEX moves, proj()
   moves, and the blit stops being the truth.

   Ported from scratchpad/sf-city-anim/nav/camera.js, nav/nav.js and
   nav/glue.js. WHAT IS NOT HERE: the DOM half — pointer/wheel/key listeners,
   canvas allocation, requestAnimationFrame — which belongs to the React shell
   (P4). What is here is every number those listeners feed and every decision
   they make, so the shell is wiring and not judgement.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  Projection,
  ZEX_BY_STEP,
  type Plane,
  type ViewCamera,
} from "./projection";

/* ═══ the zoom ladder ═════════════════════════════════════════════════ */

/** The three named stops the piece shipped with. They stay — as PRESETS and
 *  as snap targets — but they are no longer the only reachable scales. */
export const ZSTEPS: readonly number[] = [1, 2.9, 7.2];

/* Zoom range, in multiples of cam.base (base = "whole city fits the strip").
   MINZ is 1 and not less: below the fit there is nothing to see but surround,
   and every pixel spent on empty bay is a pixel not spent on San Francisco.
   MAXZ is 12 rather than ZSTEPS[2] = 7.2 because a reader who has found a
   block wants to lean in on it; past ~8× no new detail arrives and it is
   honest magnification, not fake detail. */
export const MINZ = 1;
export const MAXZ = 12;

/* ── THE DETAIL CEILING ───────────────────────────────────────────────
   MAXZ is a multiple of the FIT, and the fit depends on the viewport. The
   record does not. So the real ceiling is an absolute px-per-world-unit, and
   MAXZ survives only as a floor under it on a very small screen.

   DETAIL_PXM = 2.0 px per world unit = 2.454 CSS px per published metre
   across the screen (proj() is axis-aligned at 315° and the across-screen
   factor is cos(30°)·√2 = 1.2247). At 1440 × 940 that is z = 35.9.

   MEASURED, not chosen — zoomlabels/citydetail.py renders the city into a
   blank canvas at a ladder of zooms and counts Sobel edge LENGTH inside a
   fixed 240 m square of world, divided by that square's world area. The
   number is scale-free: flat means the same published edges drawn larger,
   rising means edges that were not resolved before. On three unlike frames it
   climbs to a peak between z = 20 and z = 44 and falls after it. z = 36 is
   the deepest zoom at which all three are within 5 % of their own peak.

   Two things agree with it. One metre is the shipped file's quantum
   (bldg/build_bldg.py QUANT = 1.0), so at the ceiling the quantum is 2.45 px
   — resolved and no finer. And the encoding error was measured against the
   published rings for 4,000 footprints: median 1.01 m, p95 1.65 m, which at
   the ceiling is 2.5 px on a building drawn 37 px wide.

   ── WHAT THE FOURTH STOP MEANS, DECIDED ───────────────────────────────
   STREET is a fixed CLOSENESS and not a fixed amount of city: 2.0 px per
   world unit, 2.454 CSS px per published metre, on every screen. A bigger
   window shows more of San Francisco at that closeness; it does not show it
   any finer, because the file has nothing finer in it. Measured on this
   build through the real button, `.parity/v1shot.py`:

     1600 x 1000   base 0.067134   fourth stop z 29.79x   scale 2.0
      768 x 1024   base 0.039298   fourth stop z 50.89x   scale 2.0
      390 x  844   base 0.019956   fourth stop z 100.22x  scale 2.0

   The z column is the thing that varies, and it is not the ceiling moving:
   it is one constant divided by three different fits. The alternative —
   a fixed multiple of the fit, which is what MAXZ was — makes the RECORD's
   own limit a function of the browser window, so the same press draws a
   building 37 px wide on a desktop and 13 px wide on a phone, and a link
   sent from one screen lands at a different closeness on another. The
   footprints are shipped on a one-metre lattice (`encode_city_chunks.py`:
   "integer world metres, BLDG.q = 1.0"), so at this stop one quantum is
   2.45 px — resolved, and no finer.

   THIS IS A CLAMP. It is not in any layer key and it must never be: the
   jumpy-zoom bug was a continuous function of cam.scale inside a cache key.
   See `quantiseForKey`. */
export const DETAIL_PXM = 2.0;

/* LOD BAND BOUNDARIES — geometric midpoints of ZSTEPS, so a band change lands
   halfway between two presets in log space rather than at one of them.
   √(1·2.9) = 1.703, √(2.9·7.2) = 4.569. The band drives cam.step, which drives
   ZEX, the lot pattern, the street inset and the haze — i.e. it drives the
   PROJECTION, so it must change as rarely as possible and never during a
   gesture. */
export const BANDS: readonly number[] = [
  Math.sqrt(ZSTEPS[0] * ZSTEPS[1]),
  Math.sqrt(ZSTEPS[1] * ZSTEPS[2]),
];

export function bandOf(z: number): number {
  return z < BANDS[0] ? 0 : z < BANDS[1] ? 1 : 2;
}

/* ── the snap ─────────────────────────────────────────────────────────
   Free zoom that can never land exactly on a preset makes the three named
   stops unreachable by wheel, and the aria-pressed state on the zoom buttons
   permanently false. So on SETTLE (never mid-gesture — a snap you can feel
   while still moving reads as the map grabbing back) a scale within ±4.5 % of
   a preset is pulled onto it. 4.5 % is under a third of the gap between the
   closest pair of presets in log space, so the snap can never skip a stop. */
export const SNAP = 0.045;

/* ── the clamp ────────────────────────────────────────────────────────
   "sensible bounds so the city cannot be lost off-screen" is two different
   rules depending on whether the city currently fits:

     · it FITS (zoomed out)   → the camera may still roam, but only within the
       slack: the WHOLE city stays on screen. fitCity() fills the strip to 86 %
       (FILL), so there is real slack there and it is worth having — the first
       version of this locked the axis to the fitted centre, and the measured
       consequence was that a drag at whole-city zoom did nothing at all. A
       control that does nothing is worse than one that does a little: the
       reader learns "this map does not drag" and stops trying.
     · it does NOT fit (zoomed in) → the camera centre may roam, but only far
       enough that the city's own bounding box still covers the visible strip.
       You can reach the edge of the Sunset; you cannot reach open ocean.

   PAD is the slack that makes the zoomed-in edge not feel like a wall: 8 % of
   the city past the frame edge, so a block on the waterfront can sit in the
   middle of the screen instead of being pinned to it.

   This is Leaflet's maxBounds + maxBoundsViscosity:1 with the same intent as
   PlacesMap's `clampToBounds` for Paris — and here it is unconditional,
   because unlike SF-in-PlacesMap there is nothing outside the frame to reach. */
export const PAD = 0.08;

export function clampAxis(
  c: number,
  lo: number,
  hi: number,
  half: number,
  pad: number,
): number {
  /* fits → every part of the city stays inside the frame */
  if (hi - lo <= 2 * half) return Math.min(lo + half, Math.max(hi - half, c));
  /* does not fit → the city must still cover the frame, plus PAD of overshoot */
  return Math.min(hi + pad - half, Math.max(lo - pad + half, c));
}

/* ═══ where San Francisco IS ══════════════════════════════════════════ */

/** [lo0, lo1, hi0, hi1] on the projection plane. */
export type BBox = [number, number, number, number];

/** The ground the fit and the clamp are computed from. `data.ts` supplies it;
 *  a test supplies four corners. Sampling is the caller's business — the
 *  shipped renderer walks every third DEM node inside the coastline mask. */
export interface CityExtent {
  forEachGroundSample(visit: (x: number, y: number, z: number) => void): void;
  /** The tallest published built height in metres. Buildings stand ON the
   *  terrain, and downtown adds ~200 m × ZEXB of projected height, so fitting
   *  the terrain alone guillotines the skyline off the top edge. */
  maxBuiltHeightM: number;
}

/** 1.05: five per cent of headroom over the tallest building, so the ridge of
 *  the tallest roof is not exactly on the frame edge. */
const BUILT_HEADROOM = 1.05;

/**
 * The city's projected bounding box, at ONE projection.
 *
 * ── ONE FUNCTION, NOT TWO COPIES ──────────────────────────────────────
 * The mock had this arithmetic written twice — once in fitCity() and once in
 * nav/glue.js's BBOX — and the second copy was an IIFE, so the pan clamp's
 * idea of where San Francisco is was computed ONCE, at load. It is per-band
 * because it depends on ZEX, and it depends on sA and ZEXB in exactly the
 * same way, which the IIFE could not express. Changing the tilt therefore
 * left the clamp holding the old city: zoomAt() calls clamp(), clamp() pulled
 * the camera toward a box that no longer existed, and the thing under the
 * reader's cursor slid 67 px out from under it (functional.py §27, TI4).
 *
 * It did not throw and it did not draw wrong. That is why the fix is
 * STRUCTURAL: the fit and the clamp read the same function, so a box that is
 * stale for one is stale for both and there is no silent half.
 */
export function cityBBox(p: Projection, ext: CityExtent): BBox {
  const lo: [number, number] = [1e9, 1e9];
  const hi: [number, number] = [-1e9, -1e9];
  ext.forEachGroundSample((x, y, z) => {
    const q = p.proj(x, y, z);
    if (q[0] < lo[0]) lo[0] = q[0];
    if (q[1] < lo[1]) lo[1] = q[1];
    if (q[0] > hi[0]) hi[0] = q[0];
    if (q[1] > hi[1]) hi[1] = q[1];
  });
  hi[1] += ext.maxBuiltHeightM * p.zexb * BUILT_HEADROOM;
  return [lo[0], lo[1], hi[0], hi[1]];
}

/**
 * The box the pan clamp holds, one per LOD band — `NAV.rebuildBBOX()`.
 *
 * MUST BE CALLABLE AGAIN, not baked at load: see cityBBox. It is computed
 * against scratch projections that share the live dials rather than by
 * mutating the shared instance and restoring it, so a listener cannot observe
 * a projection that was only ever a temporary.
 */
export function cityBBoxByBand(p: Projection, ext: CityExtent): BBox[] {
  return ZEX_BY_STEP.map((zex) =>
    cityBBox(
      new Projection({
        rotDeg: p.rotDeg,
        sA: p.sA,
        zex,
        zexb: p.zexb,
      }),
      ext,
    ),
  );
}

/* ── the fit ──────────────────────────────────────────────────────────
   The ledger is an opaque 288 px panel sitting ON the canvas, and the HUD
   headline occupies the top-left. Fitting the city to the raw canvas width
   put a quarter of San Francisco behind the ledger and the rest under the
   title — mock finding #1. The camera fits to the strip the reader can
   actually see, and fills it: the surround takes the corners. */
/* 360, from 288 (2026-09-09): the record panel's paragraphs were 12 px in a
   221 px column, which the desktop audit called the hardest thing on the
   page to read. A quarter of a 1440 screen gives 16 px type a 300 px
   measure — about 55 characters, which is where a paragraph starts to read. */
export const LEDGER_W = 360;

/** The width below which the ledger stacks below the map instead of over it,
 *  so the whole canvas is the visible strip. */
export const NARROW_W = 820;

/** 0.86, not 1.0: San Francisco stays the subject, but the frame has to hold
 *  enough of the far shore that the Golden Gate reads as a strait and not as
 *  a bridge to nowhere. */
export const FILL = 0.86;

export interface Fit {
  /** the scale at which the whole city fits the visible strip */
  base: number;
  /** the home camera centre */
  bx: number;
  by: number;
}

export function fitCity(
  bbox: BBox,
  W: number,
  H: number,
  ledgerW: number = LEDGER_W,
): Fit {
  const narrow = W < NARROW_W;
  const vw = narrow ? W : W - ledgerW; // visible stage width
  const base = Math.min(
    (vw * FILL) / (bbox[2] - bbox[0]),
    (H * FILL) / (bbox[3] - bbox[1]),
  );
  // centre San Francisco in the visible strip, not in the canvas
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  return {
    base,
    bx: cx + (narrow ? 0 : ledgerW / 2) / base,
    by: cy - (bbox[3] - bbox[1]) * 0.04,
  };
}

/* ═══ Camera ══════════════════════════════════════════════════════════ */

export type NavMode = "idle" | "drag" | "zoom" | "inertia" | "glide" | "keypan";

export class Camera implements ViewCamera {
  cx = 0; // world-plane centre of the viewport
  cy = 0;
  scale = 1; // px per world-plane unit
  base = 1; // scale at which the whole city fits
  step = 0; // LOD band, 0|1|2 — what the renderer reads
  bx = 0; // the home camera, from fitCity()
  by = 0;
  bbox: BBox | null = null; // where San Francisco is, in plane units
  follow = true; // is the camera still the STORY's camera?
  frozenStep: number | null = null; // band held still for a whole gesture

  /** Zoom, as a multiple of the fit. */
  z(): number {
    return this.base > 0 ? this.scale / this.base : 1;
  }

  /** The deepest scale the camera may reach. Absolute, with the old relative
   *  ceiling kept as a floor so a very narrow viewport is never held ABOVE
   *  the fit-relative depth it had before. */
  maxScale(): number {
    return Math.max(this.base * MAXZ, DETAIL_PXM);
  }

  /** The named stops, by index. The fourth is the ceiling itself, so it
   *  carries no number of its own and it is the same closeness on a phone as
   *  on a desktop. cam.step is untouched by it: the LOD band is still
   *  bandOf(), still 0|1|2, and ZEX_BY_STEP is still three long. */
  presetScale(i: number): number {
    return i >= ZSTEPS.length ? this.maxScale() : this.base * ZSTEPS[i];
  }

  presetCount(): number {
    return ZSTEPS.length + 1;
  }

  /* ── WHICH STOP THE READER IS STANDING ON ─────────────────────────────
     Compared on the ABSOLUTE scale, one stop at a time, because the four
     stops are not all in the same unit: the first three are multiples of the
     fit and the fourth is a fixed closeness. A single fit-relative test can
     therefore not answer this question, and the one that shipped —
     `z > 11.5`, MAXZ + a rounding — said STREET from z 11.5 up. On this
     build the ceiling is z 29.8 at 1600 x 1000 and z 100.2 at 390 x 844, so
     on a phone the button claimed the reader was at Street while they were
     still eight times short of it.

     Deepest stop first, so that on a viewport where two stops land within
     SNAP of each other — possible only where base x 7.2 is already at the
     ceiling — the button that reads pressed is the one that cannot go any
     further. Returns −1 when the camera is between stops, which is where a
     wheel leaves it and is the honest answer. */
  pressedPreset(): number {
    for (let i = this.presetCount() - 1; i >= 0; i--) {
      const s = this.presetScale(i);
      if (s > 0 && Math.abs(Math.log(this.scale / s)) < SNAP) return i;
    }
    return -1;
  }

  /** The visible strip, not the canvas. The ledger is an opaque panel sitting
   *  ON the canvas, so clamping to the canvas would let a third of San
   *  Francisco slide underneath it and count as "on screen". Returns
   *  half-extents in WORLD units plus the strip's centre offset. */
  strip(
    W: number,
    H: number,
    ledgerW = 0,
  ): { halfW: number; halfH: number; offX: number } {
    const narrow = W < NARROW_W; // phone: the ledger stacks below
    const lw = narrow ? 0 : ledgerW;
    return {
      halfW: (W - lw) / (2 * this.scale),
      halfH: H / (2 * this.scale),
      offX: lw / (2 * this.scale), // strip centre sits left of canvas centre
    };
  }

  clamp(W: number, H: number, ledgerW = 0): void {
    if (!this.bbox) return;
    const b = this.bbox;
    const s = this.strip(W, H, ledgerW);
    const padX = (b[2] - b[0]) * PAD;
    const padY = (b[3] - b[1]) * PAD;
    /* The camera centre is the CANVAS centre; the strip centre is offX to its
       left. Clamp the strip, then convert back. */
    const sc = clampAxis(this.cx - s.offX, b[0], b[2], s.halfW, padX);
    this.cx = sc + s.offX;
    this.cy = clampAxis(this.cy, b[1], b[3], s.halfH, padY);
  }

  /* ── zoom toward a point ──────────────────────────────────────────────
     Keeps the world point under (mx,my) — canvas pixels — nailed to (mx,my).
     Centre-zoom was the thing the brief called broken and it is: on a map,
     the thing you are pointing at is the thing you mean, and centre-zoom
     slides it out from under the cursor at a rate proportional to how far
     off-centre it was, which is why it feels like the map is fighting you.

     THE PROMISE HERE IS THE ARITHMETIC, NOT THE FINAL POSITION. This ends in
     clamp(), and the clamp is a separate rule — the city cannot be lost
     off-screen — which binds whenever the camera reaches the city's edge.
     Measured on the unpatched build with nothing varied but the viewport:
     1440×940 and 1440×1100 held the pointer to 0.00 px, and 1440×800 drifted
     28.13 px at (520,560), against the BOTTOM bound. The two clauses are
     therefore asserted separately (camera.test.ts): the arithmetic is exact
     with the bound taken out, and the whole of any residual is the bound. */
  zoomAt(
    newScale: number,
    mx: number,
    my: number,
    W: number,
    H: number,
    ledgerW = 0,
  ): boolean {
    const s0 = this.scale;
    const s1 = Math.min(
      this.maxScale(),
      Math.max(this.base * MINZ, newScale),
    );
    if (s1 === s0) return false;
    /* world point currently under the pointer */
    const wx = this.cx + (mx - W / 2) / s0;
    const wy = this.cy + (H / 2 - my) / s0;
    this.scale = s1;
    this.cx = wx - (mx - W / 2) / s1;
    this.cy = wy - (H / 2 - my) / s1;
    this.clamp(W, H, ledgerW);
    return true;
  }

  /** Drag: dx,dy in canvas px. Inverted, because grabbing the map means the
   *  map goes WITH the hand, not against it. */
  panBy(dxPx: number, dyPx: number, W: number, H: number, ledgerW = 0): void {
    this.cx -= dxPx / this.scale;
    this.cy += dyPx / this.scale;
    this.clamp(W, H, ledgerW);
  }

  /** Centre on a plane point, biased 10 % down the frame so the HUD headline
   *  is not sitting on the subject. */
  centreOn(p: Plane, W: number, H: number, ledgerW = 0): void {
    const s = this.strip(W, H, ledgerW);
    this.cx = p[0] + s.offX;
    this.cy = p[1] + (H * 0.1) / this.scale;
    this.clamp(W, H, ledgerW);
  }

  /* ── A CUT ────────────────────────────────────────────────────────────
     The stop the glide would have arrived at, arrived at now. This is the
     reduced-motion path for the four camera buttons: a 520 ms flight that
     crosses 14x of zoom on a phone is exactly the large-field motion
     `prefers-reduced-motion` is asking us not to make. Nothing else is
     subtracted — the same stop, the same clamp, the same band. */
  cutTo(scale: number, W: number, H: number, ledgerW = 0): void {
    this.scale = Math.min(this.maxScale(), Math.max(this.base * MINZ, scale));
    this.thawBand();
    this.clamp(W, H, ledgerW);
  }

  home(W: number, H: number, ledgerW = 0): void {
    this.scale = this.base * ZSTEPS[0];
    this.cx = this.bx;
    this.cy = this.by;
    this.follow = true;
    this.clamp(W, H, ledgerW);
  }

  /** The preset a settled camera should be pulled onto, or −1. */
  snapTarget(): number {
    const z = this.z();
    for (let i = 0; i < ZSTEPS.length; i++) {
      if (Math.abs(Math.log(z / ZSTEPS[i])) < SNAP) return i;
    }
    return -1;
  }

  /** The band the renderer should use. During a gesture it is FROZEN: a band
   *  change is a projection change, and a projection change invalidates the
   *  blit that is making the gesture cheap in the first place. Frozen bands
   *  are released on settle, which is also when we can afford the one full
   *  re-rasterisation the new band needs. */
  syncStep(): number {
    this.step = this.frozenStep !== null ? this.frozenStep : bandOf(this.z());
    return this.step;
  }

  freezeBand(): void {
    if (this.frozenStep === null) this.frozenStep = bandOf(this.z());
  }

  thawBand(): number {
    this.frozenStep = null;
    return this.syncStep();
  }

  /** Does the band the renderer is currently painting still match the camera? */
  bandStale(): boolean {
    return bandOf(this.z()) !== this.step;
  }
}

/* ═══ NO CONTINUOUS CAMERA TERM IN A CACHE KEY ════════════════════════
   THE SINGLE MOST RE-BROKEN RULE IN THIS PROJECT.

   Every cached layer has a key. cam.step is safe in one: it takes three
   values. cam.scale is NOT, and anything that is a continuous function of it
   is not either — the LOD tier ramp, a sprite size, a dissolve fraction. Put
   one in and every frame of a wheel zoom is a fresh key, a cache miss and a
   full re-render, which is the jumpy-zoom bug this renderer shipped with
   twice.

   The rule is: quantise, coarsely enough that a whole gesture crosses only a
   handful of values. A 32nd is what the shipped keys use for the tier ramp.

   AND THE OTHER HALF OF THE RULE: quantise the KEY, never the VALUE. A pixel
   floor on the drawn quantity is a STEP IN THE FIRST DERIVATIVE — flat, then
   abruptly proportional — and every float and lurch bug in this project's
   history was one: the landmark sprite float, and the `gszV` floor that drew
   46 m as 89.8 m and RELEASED at cam.scale 0.1087, a scale sitting strictly
   between the whole-city and district presets so a wheel zoom passed straight
   through it. What is drawn stays a continuous curve of the camera; only the
   string used to look up the cache is stepped. (wonder/BLOCK-WONDER.md §3.1.) */
export const KEY_QUANTUM = 32;

export function quantiseForKey(v: number, quantum = KEY_QUANTUM): number {
  return Math.round(v * quantum);
}

/* ═══ THE RASTER-AND-BLIT PATH ════════════════════════════════════════
   ── THE PERFORMANCE PROBLEM, STATED HONESTLY ─────────────────────────
   The renderer is fast because almost nothing is live: the city is painted
   into a cached layer whose key is [step, cx, cy, year, marks]. A held frame
   costs nothing because that key does not change.

   Panning changes cam.cx every frame. Zooming changes cam.scale every frame.
   Both terms are IN THE KEY, so naive navigation is a cache miss per frame,
   and a cache miss is a full re-render. MEASURED on the frozen mock,
   1440×659 at DPR 2: the city alone is 24.7 ms at whole-city. Plus terrain,
   that is a ~30 fps drag on a laptop. This is not a tuning problem; the
   architecture has to change.

   ── THE FIX ──────────────────────────────────────────────────────────
     1. Rasterise terrain+city ONCE into an offscreen buffer LARGER than the
        viewport (margin M — a ring of city that is off-screen but painted).
     2. Every pan/zoom frame is one drawImage() of that buffer.
        Sub-millisecond, and independent of how much is in it.
     3. Re-rasterise only when the blit stops being the truth: the camera has
        eaten the margin, the LOD band changed, or the content moved on. On a
        settle, at full device resolution; mid-gesture, at reduced resolution.

   ── COST WHEN UNUSED ─────────────────────────────────────────────────
   Zero. Until the reader actually grabs the map none of this runs, and a
   PARKED camera hands the frame back to the plain render path — which is not
   a fallback but the design: running every engaged frame through the buffer
   meant the animated cohort pass never ran, and broke 8 of the renderer's own
   assertions. A settled navigated camera must behave exactly like the
   un-navigated product. */

/* ── the two margins, and why they are different ─────────────────────
   The SETTLED buffer has no margin at all (1.0). It looked obvious that it
   should have one — a big pre-painted ring around the viewport is the whole
   trick — but the margin's only job is to absorb MOTION, and the first
   pointer move of any gesture switches to the motion buffer anyway. So the
   margin on the settled buffer was 2.25× the pixels and 2.25× the culled
   geometry, paid on every settle, for nothing. MEASURED: dropping it took the
   settle rasterisation at district zoom from 92 ms to 40 ms, and the settle is
   the hitch a reader actually notices, because it lands the instant they stop.

   The MOTION buffer keeps its margin, because there its cost buys something
   real: fewer rasterisations per unit of pan. */
export const M_SETTLED = 1.0;
/** motion margin: ±21 % of the viewport of pre-painted city in every
 *  direction, ±300 px at 1440 wide. */
export const M_DESK = 1.42;
/** phones have less memory and a smaller stage. */
export const M_PHONE = 1.24;

/* ── THE ZOOM BUFFER, AND WHY IT IS NOT THE PAN BUFFER ────────────────
   A pan and a zoom eat the buffer in different directions, so they want
   different buffers.
   A PAN slides the viewport across a fixed image, so what buys validity is
   PIXELS AROUND THE EDGE — the M_DESK margin.
   A ZOOM does not slide, it changes scale. Zooming IN magnifies a buffer that
   already covers the frame, so an edge margin buys nothing at all and costs
   2.0× the pixels and 2.0× the geometry culled in. Zooming OUT shrinks it, and
   an edge margin buys a fixed 1.42× of zoom-out before it uncovers — which the
   SCALE LEAD below buys for the same money at half the pixels.
   MEASURED, 1.8 s of continuous zoom at 1440×940 DPR 2, margin 1.42 → 1.0:
   worst frame 116 → 90 ms at whole city, 83 → 58 at district, 102 → 58 at
   block. The same change WITHOUT the scale lead took zoom-out from 8
   rasterisations to 38 and the frame rate to 22 fps, which is what the lead is
   for. M_ZOOM keeps a thin ring because a wheel zoom is anchored under the
   POINTER, not at the centre, so the camera translates a little as it scales. */
export const M_ZOOM = 1.08;

/** How far AHEAD of the camera, in scale, a mid-zoom rasterisation is taken.
 *  Zooming out, the buffer is painted at 0.62× of the current scale, so it
 *  holds 1.6× more world than the viewport needs and stays valid through 1.6×
 *  of zoom-out instead of uncovering on the next frame. Zooming in it is 1.0 —
 *  a magnified buffer always covers, and leading the other way would paint a
 *  buffer SMALLER than the frame it has to fill. */
export const ZOOM_LEAD = 0.62;

/** When a magnified blit stops being worth looking at. One raster per 1.85× of
 *  magnification, floored by RERASTER_MIN. Bounded and explicit, instead of
 *  being an accidental side effect of a sprite crossing a pixel threshold —
 *  which is how a 1 → 12× zoom-in became one raster magnified twelve times. */
export const ZOOM_K_MAX = 1.85;

/* ── THE FILM'S BUFFER IS NOT A MOTION BUFFER ─────────────────────────
   MOTION_DPR is right for a GESTURE — a drag is a scrub, the renderer is
   already dropping to its cheapest silhouette tier for it, and a 55 % image
   that is moving under your own finger is not something a reader can see. It
   is wrong for the FILM, which is the thing being played to a room: a composed
   travel is watched, not scrubbed, and the blit on top of it is magnified by
   up to EXT_K_MAX = 1.70 — so the picture during a camera move was a 55 %
   raster blown up as much as 3.1×.

   AND IT IS 1.00, WHICH IS ONE DEVICE SAMPLE AT PAINT TIME. MEASURED
   2026-08-23, res/filmdpr.py, the same frozen film millisecond for every row,
   headless Chromium at DPR 2 (CPU raster, so the ratios are the point):

     filmDPR   picture vs 1.70      worst mid-move frame
     0.55      mean 4.31 / 255      729 ms      ← shipped, and mush
     1.00      mean 1.91           1036 ms
     1.25      mean 1.47          ~1250 ms
     1.70      reference           1630 ms

   0.55 → 1.00 is the whole of the visible gain. 1.00 → 1.70 is a further 1.91
   of 255 and costs 58 % more on the WORST FRAME of a camera move, and a
   mid-move rasterisation is a frozen frame: freezing for 1.6 s in the middle
   of a 2.0 s travel is not a sharper picture, it is a stopped one. */
export const FILM_DPR = 1.0;

/** LOD during motion: mid-gesture rasters run at 55 % of device resolution —
 *  ≈3× cheaper on the fill-bound half — and are replaced by a full-resolution
 *  raster on settle. A moving image at 55 % is not something a reader can see;
 *  a 90 ms hitch is. */
export const MOTION_DPR = 0.55;

/** px before a pointerdown becomes a drag rather than a click. Below it the
 *  landmark button underneath keeps its click, which is how hit-testing
 *  survives the camera being anywhere at all. */
export const DRAG_THRESH = 4;
/** quiet time after the last wheel event before the gesture is over and we
 *  pay for a full raster. */
export const SETTLE_MS = 110;
/** s. Exponential ease toward the wheel's target. */
export const ZOOM_TAU = 0.075;

/* Inertia, tuned by measurement in both directions. At TAU 0.19 / STOP 24 a
   flick coasted ~200 ms and read as the map being yanked out of your hand. At
   TAU 0.34 / STOP 11 it coasted 2.1 s and read as ice.
   The lever that matters is not the decay, it is the LAUNCH: coast distance is
   v0·TAU, and v0 off a hard flick is several thousand px/s, so the useful cap
   is on v0. 2400 px/s × 0.28 s ≈ 670 px of travel — about 45 % of the stage,
   which is a flick you can aim. STOP is deliberately coarse: below ~38 px/s
   the map is not moving, it is creeping, and creep reads as a bug. */
export const INERT_VMAX = 2400;
export const INERT_TAU = 0.28;
export const INERT_STOP = 38;

/** ms cross-fade when the LOD band changes. The three preset buttons ship with
 *  a hard cut; a dissolve costs one extra drawImage per frame for 170 ms. */
export const BAND_FADE = 170;
/** ms floor between two mid-gesture rasterisations, so a violent flick of the
 *  wheel cannot ask for more than eight of them a second. */
export const RERASTER_MIN = 120;
/** arrow key = 12 % of the viewport; Shift = 40 %. */
export const KEY_PAN = 0.12;
export const KEY_PAN_BIG = 0.4;
export const KEY_ZOOM = 1.35;

/** How far a buffer may be stretched before it is repainted, on the
 *  externally-driven (film) path. K_MAX is the magnification ceiling — a blit
 *  blown up past this is visibly soft; K_MIN guards the other direction, where
 *  a buffer painted much sharper than the frame it fills is a waste of the
 *  raster it cost. */
export const EXT_K_MAX = 1.7;
export const EXT_K_MIN = 0.42;

/** The motion margin for this viewport. */
export function margin(W: number): number {
  return W < NARROW_W ? M_PHONE : M_DESK;
}

export interface SlotSize {
  W: number;
  H: number;
}

/**
 * The size of an offscreen buffer, in CSS px.
 *
 * THE MARGIN IS FORCED EVEN so that a settled buffer lands at dx = (W−bw)/2,
 * an integer, and therefore on the device-pixel grid. Half a pixel of offset
 * would make drawImage resample the entire city through a bilinear filter —
 * every hairline street edge softened, on a still frame, for nothing.
 */
export function slotSize(W: number, H: number, m: number): SlotSize {
  return {
    W: W + 2 * Math.ceil((W * (m - 1)) / 2),
    H: H + 2 * Math.ceil((H * (m - 1)) / 2),
  };
}

/** What a rasterisation produced: the buffer's size in CSS px, and the camera
 *  it was painted for. */
export interface Rastered {
  W: number;
  H: number;
  scale: number;
  cx: number;
  cy: number;
  step: number;
  key: string;
}

export interface Placement {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** magnification of the blit: >1 means the buffer is being blown up. */
  k: number;
}

/**
 * Where a buffer lands on the visible canvas for the CURRENT camera.
 * This is the one equation from the header, run backwards.
 *
 * `snap`: settled and at native scale → land exactly on the device grid.
 * Mid-gesture the sub-pixel placement is KEPT: it is what makes a slow drag
 * glide rather than ratchet in whole-pixel steps.
 */
export function place(
  b: Rastered,
  cam: ViewCamera,
  W: number,
  H: number,
  DPR: number,
  snap: boolean,
): Placement {
  const k = cam.scale / b.scale;
  const sx = (b.cx - cam.cx) * cam.scale + W / 2; // screen pos of buffer centre
  const sy = H / 2 - (b.cy - cam.cy) * cam.scale;
  const dw = b.W * k;
  const dh = b.H * k;
  let dx = sx - dw / 2;
  let dy = sy - dh / 2;
  if (snap && Math.abs(k - 1) < 1e-9) {
    dx = Math.round(dx * DPR) / DPR;
    dy = Math.round(dy * DPR) / DPR;
  }
  return { dx, dy, dw, dh, k };
}

/** Does the buffer still cover the whole viewport? One pixel of slack, because
 *  the alternative is a hairline of unpainted canvas at the frame edge. */
export function covers(p: Placement, W: number, H: number): boolean {
  return p.dx <= 1 && p.dy <= 1 && p.dx + p.dw >= W - 1 && p.dy + p.dh >= H - 1;
}

export interface RasterDecision {
  need: boolean;
  /** why, for the stats panel and for the tests: "" when the blit stands. */
  why: "" | "nobuf" | "band" | "margin" | "content" | "sharpen" | "zoomlod";
}

export interface DecideInput {
  cur: Rastered | null;
  placement: Placement | null;
  camStep: number;
  /** the content key for the frame we are about to show */
  key: string;
  moving: boolean;
  /** are we allowed to show a reduced-resolution buffer this frame? */
  lowRes: boolean;
  /** is the valid buffer the full-resolution slot? */
  isHiSlot: boolean;
  mode: NavMode;
  now: number;
  lastRaster: number;
  W: number;
  H: number;
}

/**
 * Can we get away with a blit? The gesture path's decision ladder, ported
 * whole. Order matters: the cheap structural reasons come first, and the two
 * quality reasons are gated on RERASTER_MIN so a fast gesture cannot ask for
 * more rasters than it can pay for.
 */
export function decideRaster(i: DecideInput): RasterDecision {
  const p = i.placement;
  if (!p || !i.cur) return { need: true, why: "nobuf" };
  /* a band change is a proj() change, which is the one thing a blit cannot
     represent */
  if (i.cur.step !== i.camStep) return { need: true, why: "band" };
  if (!covers(p, i.W, i.H)) return { need: true, why: "margin" };
  if (i.cur.key !== i.key) {
    // the city moved on
    const need = !i.moving || i.now - i.lastRaster > RERASTER_MIN;
    if (need) return { need: true, why: "content" };
    return { need: false, why: "" };
  }
  if (!i.lowRes && (!i.isHiSlot || Math.abs(p.k - 1) > 0.004)) {
    return { need: true, why: "sharpen" }; // a full-resolution frame is wanted
  }
  /* the magnified blit has stretched past what it can carry */
  if (
    i.lowRes &&
    i.mode === "zoom" &&
    p.k > ZOOM_K_MAX &&
    i.now - i.lastRaster > RERASTER_MIN
  ) {
    return { need: true, why: "zoomlod" };
  }
  return { need: false, why: "" };
}

/**
 * The same decision for an EXTERNALLY DRIVEN camera — the film.
 *
 * The whole of this rests on one fact: for a fixed projection, two camera
 * states differ by a pure scale and a translation, so one drawImage of a
 * buffer painted at camera A is EXACTLY the frame camera B would have painted
 * — not an approximation of it. Nothing in that fact cares who moved the
 * camera. It was written for a reader's finger; the film's rails are the same
 * camera moving on somebody else's clock.
 *
 * What differs is only the last clause: a film knows its own trajectory, so
 * instead of guessing from velocity it is repainted on a magnification
 * ceiling. That is why a move can cost six rasterisations instead of 240.
 */
export function decideRasterExternal(
  i: Pick<DecideInput, "cur" | "placement" | "camStep" | "key" | "W" | "H"> & {
    kMax?: number;
  },
): RasterDecision {
  const p = i.placement;
  if (!p || !i.cur) return { need: true, why: "nobuf" };
  if (i.cur.step !== i.camStep) return { need: true, why: "band" };
  if (!covers(p, i.W, i.H)) return { need: true, why: "margin" };
  if (i.cur.key !== i.key) return { need: true, why: "content" };
  if (p.k > (i.kMax || EXT_K_MAX) || p.k < EXT_K_MIN) {
    return { need: true, why: "sharpen" };
  }
  return { need: false, why: "" };
}

/**
 * The buffer's centre, biased along the current pan velocity so a raster taken
 * mid-flick is centred where the camera is ABOUT to be rather than where it
 * is — which roughly doubles how long that raster stays valid.
 *
 * THE LEAD IS CAPPED at 45 % of the margin's own slack. Uncapped, a fast
 * flick's velocity moved the buffer's centre further than the buffer's own
 * overhang, so the freshly-painted buffer did not cover the viewport it was
 * painted for — and the next frame rasterised again, and the next, at every
 * frame. MEASURED as an intermittent collapse to 19 fps with 35 rasterisations
 * in 1.8 s, on exactly the runs that followed a flick.
 */
export function leadCentre(
  cam: ViewCamera,
  slot: SlotSize,
  W: number,
  H: number,
  vx: number,
  vy: number,
): { cx: number; cy: number } {
  const slackX = ((slot.W - W) / 2) * 0.45;
  const slackY = ((slot.H - H) / 2) * 0.45;
  const lx = Math.max(-slackX, Math.min(slackX, vx * 0.13));
  const ly = Math.max(-slackY, Math.min(slackY, vy * 0.13));
  return { cx: cam.cx - lx / cam.scale, cy: cam.cy + ly / cam.scale };
}

/**
 * THE SCALE LEAD. Paint the buffer at the scale the zoom is HEADING toward
 * rather than at the scale the camera is at right now.
 *
 * Lead on DIRECTION, not on distance-to-target. Keying it to
 * zTarget/cam.scale looked right and did nothing: the 75 ms exponential ease
 * keeps the camera within a few per cent of its target for the whole of a
 * continuous wheel stream, so the ratio is ~0.97 and the lead was three per
 * cent. MEASURED: zoom-out stayed at 8 "margin" rasterisations per gesture
 * with it. A zoom-out is a zoom-out — paint the buffer a fixed 1.6× wider in
 * world and it survives 1.6× of it.
 */
export function zoomLeadScale(scale: number, zTarget: number): number {
  return zTarget > 0 && zTarget < scale * 0.999 ? scale * ZOOM_LEAD : scale;
}

/**
 * The wheel's gain.
 *
 * The gain is chosen by the SIZE of the delta, not by the ctrl modifier. A
 * trackpad pinch and a Ctrl+wheel from a mouse are indistinguishable by
 * modifier — the browser sends ctrlKey for both — but not by magnitude: a
 * pinch streams many small deltas, a wheel sends one notch of ~100. Keying the
 * gain off ctrlKey meant a single Ctrl+wheel notch multiplied the zoom by
 * 3.5×. MEASURED: two wheel events took the camera from 1.6× to 11.5×, i.e.
 * from the whole peninsula to one block, in a fifth of a second. Clamped so
 * one violent flick cannot cross the whole range either.
 */
export function wheelFactor(deltaY: number): number {
  const mag = Math.abs(deltaY);
  return Math.exp(
    -Math.max(-260, Math.min(260, deltaY)) * (mag < 50 ? 0.0115 : 0.0021),
  );
}

/** The exponential ease toward a wheel zoom's target, per frame. Continuous in
 *  dt, so a dropped frame lands in the same place a smooth one would. */
export function easeZoom(scale: number, target: number, dt: number): number {
  return scale + (target - scale) * (1 - Math.exp(-dt / ZOOM_TAU));
}

/** Ease-out cubic — the glide the preset buttons and `home` use. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ═══ the buffer plan ═════════════════════════════════════════════════
   FOUR PERSISTENT CANVASES, allocated once per viewport size and never
   resized in the hot path:

     hi  full device resolution — what a settled camera is shown through, and
         what the pixel test proves is identical to a direct render.
     lo  MOTION_DPR of that — what a moving camera is shown through, and the
         scratch surface the band cross-fade dissolves from.
     zo  the zoom buffer: a thin ring, because a zoom does not slide.
     fi  the film's buffer: device resolution at the pan margin.

   ALLOCATED ONCE IS THE FINDING. The first version sized ONE canvas on
   demand, so every motion↔settle transition reassigned canvas.width on a
   4320×1978 surface. MEASURED: that reallocation, not the drawing, was the
   hitch — every zoom row cost ~77 ms per rasterisation at EVERY zoom level,
   including 11×, where a full render of the whole frame is 5.3 ms. A cost
   that does not vary with the amount of work is not the work.

   THE SHELL ALLOCATES; THIS DECIDES. Two things the shell must carry that
   are not arithmetic and so are not here:

     · `getContext("2d", {alpha:false})`, and it is NOT an optimisation, it is
       correctness. The visible canvas is opaque. Compositing a globalAlpha
       band into a TRANSPARENT buffer and then flattening that buffer onto an
       opaque canvas rounds premultiplied alpha one more time than compositing
       straight onto the opaque canvas does. MEASURED: 10.3 % of pixels off by
       exactly 1 level at band 0, across the whole bay.
     · the surround colour is filled BEFORE the blit on every frame. A
       magnified blit leaves nothing outside itself, and this is what stops a
       fast flick from showing raw canvas at the frame edge.

   AND ONE THING ANY FUTURE MEASUREMENT MUST CARRY. CANVAS 2D IS DEFERRED.
   Timing a draw into a detached canvas measures the JS only and has fooled
   three agents on this project into shipping a regression as a win — the
   worst of them reported raising a cull threshold as an 8× gain when rAF
   counting said it was a regression, 291 → 373 ms. Either count rAF, or force
   a flush with `getImageData(0, 0, 1, 1)` INSIDE the timed region. */

export interface SlotPlan {
  name: "hi" | "lo" | "zo" | "fi";
  /** CSS px */
  W: number;
  H: number;
  /** device samples per CSS px for this buffer */
  dpr: number;
}

export interface SlotTune {
  motionDPR?: number;
  filmDPR?: number;
  mDesk?: number;
  mPhone?: number;
  mZoom?: number;
}

/**
 * DEV-ONLY. The film's two buffer dials, reachable from a probe — the same
 * idiom `terrain.ts` uses for `__cityWA`, and for the same reason: the film
 * buffer's resolution and its margin are a cost-against-sharpness trade whose
 * two sides have to be measured against each other, and a constant that can
 * only be changed by editing the file gets measured once and argued about
 * afterwards. `planSlots` runs on a stage resize, so a probe sets a dial and
 * resizes the stage.
 */
export const FDIALS: { dpr: number; margin: number } = {
  dpr: FILM_DPR,
  margin: 0, // 0 = whatever `margin(W)` says
};
if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityFDIALS?: typeof FDIALS }).__cityFDIALS = FDIALS;
}

export function planSlots(
  W: number,
  H: number,
  DPR: number,
  tune: SlotTune = {},
): SlotPlan[] {
  const mMotion = W < NARROW_W ? (tune.mPhone ?? M_PHONE) : (tune.mDesk ?? M_DESK);
  const mFilm = FDIALS.margin > 0 ? FDIALS.margin : mMotion;
  const spec: Array<[SlotPlan["name"], number, number]> = [
    ["hi", DPR, M_SETTLED],
    ["lo", Math.max(1, DPR * (tune.motionDPR ?? MOTION_DPR)), mMotion],
    ["fi", Math.max(1, DPR * (tune.filmDPR ?? FDIALS.dpr)), mFilm],
    ["zo", Math.max(1, DPR * (tune.motionDPR ?? MOTION_DPR)), tune.mZoom ?? M_ZOOM],
  ];
  return spec.map(([name, dpr, m]) => {
    const s = slotSize(W, H, m);
    return { name, W: s.W, H: s.H, dpr };
  });
}
