/* ═══════════════════════════════════════════════════════════════════════
   src/lib/city/projection.ts — the PROJECTION.

   World metres → a flat "plane" in world units → screen pixels. Two steps,
   and the split is load-bearing:

     1. proj(x,y,z)          world → plane.  Depends on the bearing, the tilt
                             and the two vertical exaggerations, and on
                             NOTHING about the viewport or the camera.
     2. SX(p,W,cam) / SY     plane → screen. A pure similarity transform:
                             one scale and one translation.

   Because step 2 is a similarity, ANY TWO CAMERA STATES AT A FIXED
   PROJECTION DIFFER BY A SCALE AND A TRANSLATION — which is exactly what
   drawImage() does for free. That single fact is why panning and zooming can
   be a blit of an already-painted buffer rather than a re-render, and it is
   why the LOD band (which moves ZEX, which moves proj) is frozen for the
   duration of a gesture. See camera.ts §the raster-and-blit path.

   Ported from scratchpad/sf-city-anim/gen/part3.html §projection. The
   comments are the project's institutional memory: every number below was
   found the hard way and the reasoning travels with it.
   ═══════════════════════════════════════════════════════════════════════ */

/** A point on the projection plane, in world units. */
export type Plane = [number, number];

/** The minimum a caller needs to place the plane on screen. `Camera`
 *  satisfies it; so does a plain object in a test. */
export interface ViewCamera {
  cx: number;
  cy: number;
  scale: number;
}

/* ── THE BEARING: NORTH-UP ─────────────────────────────────────────────
   screen-up = compass (ROT + 45°), screen-right = compass (ROT + 135°).
   At 315° north is exactly straight up and east is exactly screen-right:
   proj(0,1,0) = (0, +√2·sA) and proj(1,0,0) = (+√2·cA, 0), verified against
   this function rather than derived on paper. The other root of the same
   equation, 135°, is the wrong branch — it points north DOWN.

   WHY, given that RENDER-TECH §1.4 argued for 210°. 210° is the Currier &
   Ives camera — Parsons 1878, "from the bay looking south-west" — and it
   composes the wide shot better, with the waterfront and the burned district
   in front. It also makes San Francisco unidentifiable: at 210° screen-up is
   255° WSW and screen-right is 345° NNW, so the peninsula everybody has seen
   ten thousand times on a north-up map arrives rotated 105° and reads as a
   beige blob. Recognition beat composition. See scratchpad/sf-city-anim/orient/.

   WHAT IT COSTS, measured over all 166,166 real footprints (orient/sliver.py):
   the city has two street grids, and 315° trades one against the other.
     downtown, −134.7°  walls render at 0.703 / 0.711 of full width
                        (0.505 / 0.863 at 210° — squarer corners now)
     cardinal,   −1.5°  walls render at 1.000 / 0.026
                        (0.284 / 0.959 at 210°)
   0.026 is the price: the Sunset, the Richmond, the Mission and Bayview are
   built 1.5° off true north, and at this bearing their side walls are
   slivers, so those houses read as front elevations rather than as boxes.
   Total painted wall goes UP (0.2921 → 0.3062 per metre of perimeter); what
   is lost on the cardinal grid is the CORNER, not the paint. Downtown, which
   is where the record is, gets better.

   AND THE CONSEQUENCE THAT EVERY OTHER MODULE RELIES ON: at 315° the
   projection is AXIS-ALIGNED. cR + sR = 0 and cR − sR = √2, so

       screen-x = √2·cA·x          — world y does not appear
       screen-y = √2·sA·y + z·ZEX  — world x does not appear
       depth    = √2·y             — depth() reduces to world y

   A building therefore shows its roof and exactly ONE wall, facing
   down-screen. Anything that sorts, buckets or marches along the view
   direction is marching along world y. Do not re-derive this by hand at some
   other bearing: `isAxisAligned()` below is the check, and projection.test.ts
   asserts the property rather than the numbers. */
export const ROT_DEG = 315;

/* ══ BLOCK TILT — HOW MUCH ROOF, HOW MUCH WALL ══════════════════════════
   sA is the projection's vertical compression, and read as a camera it is the
   camera's ELEVATION ABOVE THE HORIZON written as a number. The ground
   direction across the view — (1,−1)/√2 in rotated coords — projects at
   √2·cA = 1.2247 and is therefore unforeshortened up to one overall scale;
   the direction INTO the screen, (1,1)/√2, projects at √2·sA. So

        sin(φ) = sA / cA

   and sA = 0.5 was asin(0.5774) = 35.26°, which is exactly the elevation of a
   true isometric. At that elevation a San Francisco block is mostly ROOF: the
   wall a reader sees is h·ZEXB tall and the roof is d·sA·√2 deep, so the whole
   roof-to-wall question is the one ratio ZEXB/sA. Block FACADE gave all
   166,166 footprints openings off the assessor's own storey count and almost
   none of it was on the screen.

   0.42 = asin(0.4849) = 29.01°. THE CAMERA MOVED; NOTHING WAS EXAGGERATED.
   sA does not appear in screen x at all, so a building keeps its width, its
   position and its silhouette against its neighbours and only the roof
   foreshortens. The other lever, ZEXB, would have stretched the object
   instead, and it is not free (see ZEXB below).

   AND 0.42 IS NOT A TASTE. functional.py §17 — mock finding #1, "a small pale
   plane occupying ~25 % of the frame" — requires San Francisco to fill 0.72 of
   the frame's height at whole-city zoom, and sA is the only thing in the
   projection that can compress the city vertically. Measured
   (tilt/framing.py): the terrain box fills 0.828 of the stage at 0.50, 0.738
   at 0.42 and crosses 0.72 at sA = 0.4099. The tilt is therefore the DEEPEST
   CAMERA AT WHICH THE CITY STILL FILLS ITS OWN FRAME, with 2.4 % of margin.
   tilt/BLOCK-TILT.md carries the contact sheet and the rejected neighbours.

   IT IS MUTABLE AND IT HAS A SETTER, for the reason the bearing has one:
   every pre-projected vertex table in the renderer is a function of
   (bearing, tilt), so a tilt that could not be rebuilt would be a tilt that
   could not be tested. setTilt() notifies; see `onRebuild`. */
export const SA_DEFAULT = 0.42;

/** cos(30°). The horizontal half of a 2:1 dimetric; it is a constant and has
 *  never been a dial. */
export const CA = Math.cos(Math.PI / 6);

/** The floor sA may not cross: measured in tilt/framing.py, the value at which
 *  San Francisco stops filling 0.72 of the frame's height at whole-city zoom
 *  (functional.py §17). SA_DEFAULT sits 2.4 % above it. Not used by the
 *  arithmetic — it exists so the bound is a number a test can read. */
export const SA_FRAMING_FLOOR = 0.4099;

/* ── the two vertical dials ────────────────────────────────────────────
   ZEX  exaggerates TERRAIN. San Francisco's hills are the subject of the
        wide shot and they are flattened by a 2:1 dimetric, so they are
        pushed hard (3.3 at whole city, easing to 2.0 as you zoom in).
   ZEXB exaggerates BUILT HEIGHT, and it is a different art decision. It is
        fixed at 1.6, which is the exaggeration the built city is drawn at.
        Running buildings at the terrain's 3.3 made City Hall taller than it
        is wide — no photograph of it has ever looked like that — and turned
        downtown into a field of needles.

   Verified 2026-08-20: before this split, `proj` applied ONE dial to both, and
   it applied it with the wrong sign — SY() negates p[1], so `−z·ZEX` put every
   roof BELOW its own footprint. Buildings hung downwards and were overpainted
   by whatever stood in front of them, which is most of why the wide-zoom
   fabric read as confetti. proj(0,0,100) landed 15 px lower on screen than
   proj(0,0,0). */
export const ZEX_BY_STEP: readonly number[] = [3.3, 2.6, 2.0];

/** ZEXB IS NOT A FREE DIAL. 1.6 is `ZEX_ART` in art/iso.py — the vertical the
 *  thirteen hand-drawn landmark sprites were DRAWN at (art/ART-SPEC.md §1.1),
 *  and the page states the number to the reader. Changing it stretches every
 *  dome in the authored set against the city around it. The tilt was taken out
 *  of sA precisely so this number would not have to move. It is also baked
 *  into the tree sprite sheet (2·ZEXB/1.2247 crown-radii per sprite), so any
 *  caller that moves it must drop that sheet — which is why setTilt() emits a
 *  rebuild event rather than quietly assigning. */
export const ZEXB_DEFAULT = 1.6;

/** The DEM's cell size in metres (260 × 260 raster over the peninsula). Read
 *  by the hit test's march-step derivation; stated here because the step is
 *  justified as a fraction of it. */
export const DEM_CELL_M = 53.8;

/** The hit test's ground-march step, as a WORLD DISTANCE in metres. See
 *  `marchStepZ`. */
export const HIT_STEP_M = 9.3;

/** Why a rebuild was raised. A `band` change moves ZEX only, so tables
 *  pre-projected at z = 0 survive it; `tilt` and `bearing` invalidate every
 *  pre-projected vertex in the renderer. */
export type RebuildReason = "bearing" | "tilt" | "band";
export type RebuildListener = (reason: RebuildReason) => void;

export interface ProjectionOptions {
  rotDeg?: number;
  sA?: number;
  zex?: number;
  zexb?: number;
}

/**
 * The projection, as an object so a test can sweep the tilt without touching
 * the singleton every other module reads.
 */
export class Projection {
  rotDeg: number;
  sA: number;
  zex: number;
  zexb: number;

  /** cos/sin of the bearing, cached — these are in every inner loop. */
  cR: number;
  sR: number;

  private listeners = new Set<RebuildListener>();

  constructor(opts: ProjectionOptions = {}) {
    this.rotDeg = opts.rotDeg ?? ROT_DEG;
    this.sA = opts.sA ?? SA_DEFAULT;
    this.zex = opts.zex ?? ZEX_BY_STEP[0];
    this.zexb = opts.zexb ?? ZEXB_DEFAULT;
    this.cR = Math.cos((this.rotDeg * Math.PI) / 180);
    this.sR = Math.sin((this.rotDeg * Math.PI) / 180);
  }

  /** cos(30°), for symmetry with `sA` at call sites. Never a dial. */
  get cA(): number {
    return CA;
  }

  /** The camera's elevation above the horizon, in degrees: asin(sA/cA).
   *  This is the number the tilt IS, and the number the page states. */
  elevationDeg(): number {
    return (Math.asin(this.sA / CA) * 180) / Math.PI;
  }

  /* ── the linear coefficients ─────────────────────────────────────────
     proj() is LINEAR in world (x,y):

         px = ax·x + ay·y
         py = bx·x + by·y + z·ZEX

     Pre-projection loops (rings, footprints, the surround) want the
     coefficients, not four trig calls per vertex. At 315° ay and bx are both
     zero, which is the axis-alignment above stated as arithmetic. */
  coeffs(): { ax: number; ay: number; bx: number; by: number } {
    const { cR, sR, sA } = this;
    return {
      ax: (cR - sR) * CA,
      ay: -(sR + cR) * CA,
      bx: (cR + sR) * sA,
      by: (cR - sR) * sA,
    };
  }

  /** True when screen-x depends only on world-x and screen-y only on world-y —
   *  i.e. at the 315° bearing this whole renderer assumes. Anything that
   *  marches along the view direction, buckets by depth, or reasons about
   *  "one wall facing down-screen" is only correct while this holds. */
  isAxisAligned(tol = 1e-12): boolean {
    const c = this.coeffs();
    return Math.abs(c.ay) < tol && Math.abs(c.bx) < tol;
  }

  /** world → plane. Terrain elevation `z` is exaggerated by ZEX. */
  proj(x: number, y: number, z = 0): Plane {
    const xr = x * this.cR - y * this.sR;
    const yr = x * this.sR + y * this.cR;
    return [(xr - yr) * CA, (xr + yr) * this.sA + z * this.zex];
  }

  /** world → plane for BUILT height: ground elevation at ZEX, built height on
   *  top of it at ZEXB. The two dials are different art decisions and this is
   *  the only function that carries both. */
  projb(x: number, y: number, zg = 0, h = 0): Plane {
    const xr = x * this.cR - y * this.sR;
    const yr = x * this.sR + y * this.cR;
    return [
      (xr - yr) * CA,
      (xr + yr) * this.sA + zg * this.zex + h * this.zexb,
    ];
  }

  /** Painter's-order depth. Larger is NEARER the camera. At 315° this is √2·y
   *  and nothing else — see the bearing note. It is written out in full so
   *  that changing the bearing still means something. */
  depth(x: number, y: number): number {
    return (
      x * this.cR - y * this.sR + (x * this.sR + y * this.cR)
    );
  }

  /* ── the inverse ──────────────────────────────────────────────────────
     SX/SY and proj() are both LINEAR in world (x,y), so the inverse is a 2×2
     solve and not a search:

       px = cA·(A·x − B·y)          A = cos−sin, B = cos+sin  at this bearing
       py = sA·(B·x + A·y) + z·ZEX  A² + B² = 2

     `z` is the height of the ground plane the pixel is being read against;
     the caller supplies it because it is the thing the caller is looking for.
     The hit test settles it by marching (see marchStepZ). */
  invAt(px: number, py: number, z = 0): Plane {
    const A = this.cR - this.sR;
    const B = this.cR + this.sR;
    const u = px / CA;
    const v = (py - z * this.zex) / this.sA;
    return [(A * u + B * v) / 2, (A * v - B * u) / 2];
  }

  /* ── THE PIXEL IS A LINE ──────────────────────────────────────────────
     Height moves a point up the screen, so the set of world points that could
     project to ONE pixel is a straight line in z. This is its direction:
     d(x,y)/dz, in world metres per unit of z. Differentiating the inverse
     gives d(depth)/dz = −ZEX/sA at EVERY bearing, so larger z is always
     nearer the camera — which is why the hit test walks z downward from above
     the terrain and stops at the first crossing of the drawn surface. */
  groundLineDir(): { rx: number; ry: number; speed: number } {
    const a0 = this.invAt(0, 0, 0);
    const a1 = this.invAt(0, 0, 1);
    const rx = a1[0] - a0[0];
    const ry = a1[1] - a0[1];
    return { rx, ry, speed: Math.hypot(rx, ry) };
  }

  /* ── TI: THE STEP IS A WORLD DISTANCE, NOT A HEIGHT ───────────────────
     The hit test's march step read `const dz = 2`, and the comment that
     justified it was already stating the real quantity: "2 m of z is 9.3
     world metres along the line at ZEX 3.3, well inside one 53.8 m raster
     cell, so no ridge is stepped over". 9.3 m is the number that matters and
     2 m of z is only the number that produced it AT ONE TILT AND ONE ZEX.
     The line's world speed is |d(x,y)/dz| = ZEX/sA · |(cR−sR, cR+sR)|/2, so at
     ZEX 3.3 it is 4.67 m per unit z at sA 0.50 and 5.56 at sA 0.42 — the same
     dz would sample 11.1 m apart, and at block zoom (ZEX 2.0) it was already
     over-sampling at 5.7 m. Holding the WORLD step fixed instead makes the
     sampling density independent of both dials, which is what the comment
     asked for in the first place.

     WHAT THIS IS AND IS NOT, MEASURED (tilt/hitscore.py, the same page scored
     under both rules):

        sA     dz = 2                 world step 9.3 m
        0.50   98.7 %   step  7.35 m  98.7 %
        0.46   98.9 %   step  7.99 m  98.9 %
        0.42   98.4 %   step  8.75 m  98.4 %
        0.38   97.6 %   step  9.68 m  97.4 %
        0.32   96.2 %   step 11.49 m  96.2 %

     THE ACCURACY IS THE SAME. This is not a fix for a wrong answer and it is
     not claimed as one — the drop across that column is honest occlusion, more
     ground behind hills at a lower camera. It is a fix for a CONSTANT WHOSE
     JUSTIFICATION WAS A FUNCTION: two art dials were free to move it out of
     the range its own comment argued for, and one of them just did.

     The cap at 4 is the other end: at a very shallow line the derived step
     would take arbitrarily large jumps in z, so it is bounded. */
  marchStepZ(stepM: number = HIT_STEP_M, capZ = 4): number {
    return Math.min(capZ, stepM / Math.max(1e-6, this.groundLineDir().speed));
  }

  /* ── setters, and why they exist ─────────────────────────────────────
     Every pre-projected vertex table in the renderer is a function of
     (bearing, tilt), and a dial that could not be rebuilt would be a dial
     that could not be tested. So each setter raises a rebuild event and the
     modules that hold derived tables subscribe. Three things the tilt setter
     is responsible for, each one found broken by changing sA and looking:
       · the city is RE-FIT, because cam.base is fitCity() of the projected
         bounding box and the projected box is precisely what changed;
       · the pan clamp's per-band world box is REBUILT — it was computed once
         at load and left stale the clamp pulled the camera on every zoom, so
         zoom-toward-the-pointer missed by 67 px (functional.py §27 / TI4);
       · the tree sprite sheet is DROPPED — it bakes 2·ZEXB/1.2247 crown-radii
         into its own pixels, so a caller that moves ZEXB must not silently
         leave the trees behind.
     None of those three live in this file. That is the point of the event. */

  setRotation(deg: number): void {
    this.rotDeg = deg;
    this.cR = Math.cos((deg * Math.PI) / 180);
    this.sR = Math.sin((deg * Math.PI) / 180);
    this.emit("bearing");
  }

  setTilt(sA?: number, zexb?: number): void {
    if (typeof sA === "number" && sA > 0) this.sA = sA;
    if (typeof zexb === "number" && zexb > 0) this.zexb = zexb;
    this.emit("tilt");
  }

  /** The LOD band moves ZEX and nothing else. Tables pre-projected at z = 0
   *  survive it; terrain, layer caches and the pan clamp's box do not. */
  setBand(step: number): void {
    const z = ZEX_BY_STEP[Math.max(0, Math.min(ZEX_BY_STEP.length - 1, step))];
    if (this.zex === z) return;
    this.zex = z;
    this.emit("band");
  }

  onRebuild(fn: RebuildListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(reason: RebuildReason): void {
    for (const fn of this.listeners) fn(reason);
  }
}

/** The city's projection. One camera, one city, one instance; modules that
 *  hold pre-projected tables subscribe to `onRebuild`. Tests that sweep the
 *  tilt should build their own `new Projection()` instead. */
export const projection = new Projection();

/* Free functions over the singleton, so ported render code reads the way the
   mock read (`proj(x,y,z)`) instead of threading an object through every
   inner loop. */
export const proj = (x: number, y: number, z = 0): Plane =>
  projection.proj(x, y, z);
export const projb = (x: number, y: number, zg = 0, h = 0): Plane =>
  projection.projb(x, y, zg, h);
export const depth = (x: number, y: number): number => projection.depth(x, y);
export const invAt = (px: number, py: number, z = 0): Plane =>
  projection.invAt(px, py, z);

/* ── plane → screen ───────────────────────────────────────────────────
   The similarity transform, and the whole of it. Note SY NEGATES p[1]:
   screen y grows downward and the plane's y grows upward, which is why a
   height added in proj() has to be POSITIVE to lift a roof up the screen. */
export const SX = (p: Plane, W: number, cam: ViewCamera): number =>
  (p[0] - cam.cx) * cam.scale + W / 2;
export const SY = (p: Plane, H: number, cam: ViewCamera): number =>
  H / 2 - (p[1] - cam.cy) * cam.scale;

/** screen px → plane. The exact inverse of SX/SY, and the first half of any
 *  hit test: turn the pixel into a plane point, then `invAt` it onto ground. */
export const screenToPlane = (
  sx: number,
  sy: number,
  W: number,
  H: number,
  cam: ViewCamera,
): Plane => [
  (sx - W / 2) / cam.scale + cam.cx,
  cam.cy - (sy - H / 2) / cam.scale,
];
