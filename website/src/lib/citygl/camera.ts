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
