/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/camera.ts — THE SAME PROJECTION, AS A REAL CAMERA.

   The Canvas renderer projects by hand: `lib/city/projection.ts` maps world
   metres to a flat "plane", and `SX`/`SY` place the plane on screen with one
   scale and one translation. The GPU cannot be handed that; it wants a camera
   matrix. This file builds the camera matrix that produces THE SAME PIXELS,
   and `camera.test.ts` asserts it against `proj()` rather than trusting the
   derivation below.

   ── SCENE COORDINATES ─────────────────────────────────────────────────────
   three.js is Y-up, so the scene is

       X = world x (metres, east)
       Y = the VERTICAL CONTRIBUTION, already exaggerated — a ground point at
           elevation e is at `e * zex`, a building top at `e * zex + h * zexb`.
           The exaggeration lives in the vertex shaders (two uniforms), never
           here, so a camera step can change it without rebuilding geometry.
       Z = world y (metres, north)

   The projection is then exactly what `projection.ts` says it is:

       planeX = ax * X + ay * Z
       planeY = bx * X + by * Z + Y

   ── WHY AN ORTHOGRAPHIC CAMERA REPRODUCES IT EXACTLY ──────────────────────
   Both plane coordinates are LINEAR in the scene point, so each is a dot
   product with a fixed vector:

       planeX = dot(p, Rraw),  Rraw = (ax, 0, ay)
       planeY = dot(p, Uraw),  Uraw = (bx, 1, by)

   An orthographic camera does the same thing with its own orthonormal right
   and up vectors. `Rraw . Uraw = ax*bx + ay*by`, which is 0 for any bearing
   this projection supports — the two are the images of orthogonal world axes
   — so normalising them gives a valid camera basis, and the lengths |Rraw|
   and |Uraw| come back as the frustum's half-extents:

       halfW = W / (2 * scale * |Rraw|)
       halfH = H / (2 * scale * |Uraw|)

   The camera looks along -forward, forward = normalize(cross(R, U)), and its
   position is the plane centre lifted out along that axis by half the depth
   range, so nothing is clipped.

   ── WHAT THIS BUYS THAT THE CANVAS PATH CANNOT HAVE ───────────────────────
   A depth buffer. The Canvas renderer sorts 166,166 footprints back to front
   every rasterisation and still approximates every overlap; here the depth is
   the camera's own and every overlap is exact, including a tower crown behind
   a nearer roof, which painter's order gets wrong by construction.
   ═══════════════════════════════════════════════════════════════════════ */

import { OrthographicCamera, Vector3 } from "three";

import type { Projection } from "@/lib/city/projection";

/** What the Canvas camera carries, and all this needs: a centre and a scale. */
export interface PlaneCamera {
  /** plane units, the point the viewport is centred on */
  cx: number;
  cy: number;
  /** screen pixels per plane unit */
  scale: number;
}

/** the basis of one projection, cached: it moves only when the band does */
export interface AxonBasis {
  /** unit right, unit up, unit forward (the camera looks along -forward) */
  R: Vector3;
  U: Vector3;
  F: Vector3;
  /** |Rraw| and |Uraw| — the frustum's own scale factors */
  kR: number;
  kU: number;
}

/**
 * The basis for a projection's current coefficients.
 *
 * `coeffs()` is read once here rather than per vertex — the whole reason
 * `projection.ts` exposes it — and the result is a pure function of the
 * bearing and the tilt, so a caller may cache it until `onRebuild` fires.
 */
export function axonBasis(projection: Projection): AxonBasis {
  const c = projection.coeffs();
  const Rraw = new Vector3(c.ax, 0, c.ay);
  const Uraw = new Vector3(c.bx, 1, c.by);
  const kR = Rraw.length();
  const kU = Uraw.length();
  const R = Rraw.clone().divideScalar(kR);
  const U = Uraw.clone().divideScalar(kU);
  /* ── THE PROJECTION IS LEFT-HANDED, AND THAT IS WHY THIS IS NEGATED ──
     `R x U` comes out as (0, -0.51, +0.86) — an eye BELOW the ground and
     NORTH of the city, looking up and south. That is not where this picture
     is drawn from: north is up-screen, so a point 6 km north sits higher on
     the frame than a 260 m tower at the origin, which is the view from ABOVE
     and SOUTH. Both eyes produce the same two dot products — the projection
     is a linear map and does not care — but they order depth OPPOSITE ways,
     and only one of them agrees with `projection.depth()`.

     The cause is that (R, U, R x U) is a MIRROR of the frame this projection
     was written in: `SY` flips the screen's y itself (`H/2 - ...`), so the
     handedness was absorbed there and never had to be stated. A GPU cannot
     absorb it — the depth buffer is real — so it is stated here: the eye goes
     to -(R x U), which is above and south, `up` goes to -U to keep the camera
     frame right-handed, and `applyAxonCamera` inverts the frustum's top and
     bottom so the picture comes back the right way up. Three sign flips that
     cancel to the same pixels and the correct depth; `camera.test.ts` asserts
     both halves of that sentence. */
  const F = new Vector3().crossVectors(R, U).normalize().negate();
  return { R, U, F, kR, kU };
}

/**
 * Point a three.js orthographic camera at what the plane camera is looking at.
 *
 * `depthSpan` is how deep the scene is along the view axis, in scene units. It
 * is not measured per frame: the city's own bounding box gives a bound once,
 * and the near/far planes are set symmetrically around the centre so nothing
 * clips at any camera. A generous span costs nothing in an orthographic
 * projection — depth precision is linear, not hyperbolic, so unlike a
 * perspective camera there is no z-fighting price for slack.
 */
export function applyAxonCamera(
  camera: OrthographicCamera,
  basis: AxonBasis,
  cam: PlaneCamera,
  W: number,
  H: number,
  depthSpan: number,
): void {
  const { R, U, F, kR, kU } = basis;
  const s = Math.max(1e-9, cam.scale);
  const halfW = W / (2 * s * kR);
  const halfH = H / (2 * s * kU);

  camera.left = -halfW;
  camera.right = halfW;
  /* INVERTED ON PURPOSE — see `axonBasis` §the projection is left-handed. The
     camera's up is -U, so the frustum has to be flipped back. */
  camera.top = -halfH;
  camera.bottom = halfH;

  /* The scene point whose plane coordinates are (cx, cy). `dot(p, R)` is
     `planeX / kR` and `dot(p, U)` is `planeY / kU`, so the centre is that
     pair read back along the basis — there is no third component to choose,
     which is why the camera can then be pushed anywhere along F. */
  const centre = R.clone().multiplyScalar(cam.cx / kR)
    .add(U.clone().multiplyScalar(cam.cy / kU));

  const back = depthSpan;
  camera.position.copy(centre).addScaledVector(F, back);
  camera.up.copy(U).negate();
  camera.lookAt(centre);
  camera.near = 0;
  camera.far = back * 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * ── THE CAMERA THE FRAME IS DRAWN FROM, ON THE PIXEL GRID ───────────────
 * The camera the READER moves is continuous; the camera the frame is
 * RASTERISED from is quantised to whole device pixels. Those are allowed to
 * be different, and here they have to be.
 *
 * WHY, and it is the whole reason this exists. The published Canvas
 * renderer does not re-draw the city while you drag it — it rasterises once
 * into a slot and BLITS that bitmap around (`rasters`, `curSlot`,
 * `paintedStep`, `snapCv` on that renderer are all this one idea). Nothing
 * re-samples during motion, so nothing can crawl. This renderer re-draws
 * every frame, so on an unsnapped camera every thin thing in the city — the
 * ink outlines, the window rows, the kerbs, the roof edges — lands on a
 * different sub-pixel phase each frame and shimmers. That is the
 * scintillation, reported as *"mostly roofs shaking but also the streets"*.
 *
 * IT IS NOT AN ANTIALIASING PROBLEM, and that was worth measuring before
 * writing this. The frame already carries 4x MSAA (`renderer.samples` is 4,
 * and 4 is this browser's `MAX_SAMPLES`). Rendering the same sweep at 4x
 * and box-filtering down — a near-perfectly antialiased reference — only
 * took the flicker from 3.85% of pixels to 2.29%, and left single pixels
 * still swinging 136 levels for an EIGHTH of a pixel of camera movement.
 * Sharper sampling cannot fix a picture that is re-sampled from scratch on
 * a new grid every frame; only landing on the same grid can.
 *
 * An orthographic camera at a fixed bearing is what makes that legal: a pan
 * is a pure screen translation, so a whole-pixel step reproduces the
 * identical rasterisation, shifted. `scale * dpr` is device pixels per
 * plane unit, and both plane axes share it — the frustum is `W / (2 s kR)`
 * across and `H / (2 s kU)` down, and the centre is read back along the
 * same `kR`, `kU`, so one screen pixel is `1/s` in both `cx` and `cy`.
 *
 * ZOOM IS DELIBERATELY NOT SNAPPED. Changing `scale` re-samples the city
 * whatever the centre does, and the published renderer re-rasterises on a
 * zoom too — it is a different act, and it is allowed to cost a redraw.
 *
 * `this.cam` stays exact: `getCamera`, the hit test and the controls'
 * inertia all read the continuous value. Only the frame is on the grid.
 */
/**
 * ── AND THE SCALE LANDS ON A LADDER, FOR THE SAME REASON ────────────────────
 * Snapping the CENTRE to whole pixels only helps while the scale holds still.
 * It does not, and that turned out to be the rest of the defect.
 *
 * `controls.ts` does not apply a wheel notch, it sets a TARGET and eases the
 * scale toward it — which is right, it is what makes a zoom glide instead of
 * jerk. But on a trackpad, where a scroll IS a zoom, the ease runs on after
 * the fingers lift, and every frame of it is drawn at a scale nothing else
 * shares. MEASURED, from a single four-event gesture: 21 frames, 21 DISTINCT
 * SCALES, the scale still walking 1.5 % after the gesture had ended. A new
 * scale re-samples every edge in the city, so the whole picture crawls until
 * the ease lands and then stops by itself — which is exactly how it was
 * reported: *"the shimmer happens when i move and after i settle but then it
 * stops after a point."*
 *
 * So the scale the frame is RASTERISED at is quantised, geometrically, because
 * zoom is geometric: a step of the same RATIO has to feel the same at every
 * scale. Twenty-four rungs to a doubling is a step of 2.9 % — under what reads
 * as a jump, and coarse enough that the whole 1.5 % tail of an ease usually
 * falls inside one rung and costs no redraw at all.
 *
 * The camera the READER holds keeps its exact scale: `getCamera`, the hit
 * test, the zoom ladder and the controls all read the continuous value. Only
 * the frame is on the ladder.
 */
export function snapCameraScale(
  cam: PlaneCamera,
  rungsPerDoubling = 24,
): PlaneCamera {
  if (!Number.isFinite(cam.scale) || cam.scale <= 0) return cam;
  const k = rungsPerDoubling;
  const rung = Math.round(Math.log2(cam.scale) * k) / k;
  return { ...cam, scale: 2 ** rung };
}

export function snapCameraToPixels(
  cam: PlaneCamera,
  dpr: number,
  /* THE GRID IS COARSER FOR SOME READERS OF IT. The frame is rasterised on
     the device grid, one pixel; the TYPE is placed on a much coarser one so
     that a pan does not re-run the label competition — `overlay.ts` §THE TYPE
     IS PLACED ON A SHEET. One function so there is one place where "on the
     grid" is defined, and so the two grids are commensurate: the coarse cell
     is a whole number of device pixels, which is what lets the type's sheet
     be blitted as a copy rather than resampled. */
  cellDevicePx = 1,
): PlaneCamera {
  const q = cam.scale * dpr;
  if (!Number.isFinite(q) || q <= 0) return cam;
  const cell = Math.max(1, Math.round(cellDevicePx));
  const snap = (v: number): number => (Math.round((v * q) / cell) * cell) / q;
  return { ...cam, cx: snap(cam.cx), cy: snap(cam.cy) };
}

/**
 * The scene point for a world point — the one conversion every layer does.
 *
 * `yUp` is the ALREADY EXAGGERATED vertical: ground is `elevM * zex`, a built
 * top is `elevM * zex + hM * zexb`. Kept explicit rather than folded in here
 * because the shaders do it per vertex with uniforms, and a helper that
 * quietly applied one exaggeration would be a second source of truth.
 */
export function scenePoint(x: number, y: number, yUp: number): Vector3 {
  return new Vector3(x, yUp, y);
}
