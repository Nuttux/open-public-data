/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/up-face.ts — WHAT THIS RIG RETURNS FOR A SURFACE POINTING UP.

   One question, asked of a scene rather than of a table: *if I put a Lambert
   surface of albedo 1 here, face up, what comes out?*

   ── WHY THE QUESTION HAS TO BE ASKED AND NOT ANSWERED IN ADVANCE ─────────
   A roof is drawn at the value the record publishes for it — `palette.ts` §39
   is the argument, and `roofTone` is written on top of it. That only holds if
   the rig returns 1.0 for an up normal. It does not, and the amount by which
   it does not is `light.ts`'s to decide and is being decided while this is
   written. A constant transcribed here would be a second source of truth for
   a number that already has one.

   So the caller hands over the object its own meshes were added to and gets
   the rig's own answer, recomputed whenever the caller thinks the lights may
   have moved. Nothing here names a light, an intensity or a colour.

   ── THE ARITHMETIC IS THREE'S OWN, AND EACH LINE IS ITS SHADER ───────────
   In the non-legacy lighting three has shipped since r155:

     ambient        irradiance += color * intensity
     hemisphere     irradiance += mix(ground, sky, 0.5 * dot(n, up) + 0.5)
                                  * intensity, where `up` is the light's own
                                  position direction — a hemisphere light aims
                                  by where it stands, not by a target
     directional    irradiance += color * intensity * max(0, dot(n, L))
     Lambert        out = albedo * irradiance / PI

   Colours are read in the renderer's WORKING space (`Color.r/g/b` after
   three's own colour management has decoded the hex), which is the space the
   shader multiplies in, so no conversion happens here.

   ── WHAT IT CANNOT SEE, STATED ──────────────────────────────────────────
   A `scene.environment`, an image-based light, a light probe, or any term a
   post pass adds after the fact. Those are not lights in the scene graph and
   this returns no answer for them. The caller clamps the reciprocal, so an
   unseen term makes the compensation too large by exactly its own share and
   never unbounded — and `upFaceTransfer` returns `null` where it finds no
   lights at all, which is the honest answer to *there is no rig yet* and is
   not the same as *the rig returns nothing*.
   ═══════════════════════════════════════════════════════════════════════ */

import type { Object3D } from "three";

/** three's own light shapes, read structurally so this imports no class */
interface AnyLight extends Object3D {
  isLight?: boolean;
  isAmbientLight?: boolean;
  isHemisphereLight?: boolean;
  isDirectionalLight?: boolean;
  intensity?: number;
  color?: { r: number; g: number; b: number };
  groundColor?: { r: number; g: number; b: number };
  target?: Object3D;
}

/** Rec.709 luminance, the weighting three's own tone stack works in */
function lum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The diffuse transfer this scene's lights give a Lambert surface of albedo 1
 * whose normal is +Y — 1.0 where the rig is calibrated to paint a table
 * value, under 1 where it is darker than the table.
 *
 * Returns null when the object is not in a scene yet or the scene carries no
 * light: there is nothing to compensate for and a caller must not invent one.
 */
/**
 * ── AND THE SAME THING PER CHANNEL, WHICH IS WHAT A ROOF ACTUALLY NEEDS ────
 * `upFaceTransfer` collapses every light to LUMINANCE, so its reciprocal can
 * only ever correct a roof's LEVEL. The rig is not neutral: the sun is warm
 * and the sky is not, and a scalar leaves that cast on every up face in the
 * city. MEASURED over the same warehouse roof, the published page against
 * this one — 178.5/177.2/176.3, which is neutral, against 204.8/200.7/190.5,
 * which is 26 levels brighter and 14 warmer.
 *
 * `layers/buildings.ts` §AND WHAT THE RIG RETURNS FOR A SURFACE POINTING
 * STRAIGHT UP says the rig's job on a roof is to return 1.0 — that has to
 * mean 1.0 on each channel, or the roof paints something the record never
 * published. Same walk, same weights, three accumulators.
 */
export function upFaceTransferRGB(
  root: Object3D | null | undefined,
): { r: number; g: number; b: number } | null {
  const perChannel = upFaceWalk(root, true);
  return perChannel as { r: number; g: number; b: number } | null;
}

export function upFaceTransfer(root: Object3D | null | undefined): number | null {
  const v = upFaceWalk(root, false);
  return v as number | null;
}

function upFaceWalk(
  root: Object3D | null | undefined,
  rgb: boolean,
): number | { r: number; g: number; b: number } | null {
  if (!root) return null;
  let scene: Object3D = root;
  while (scene.parent) scene = scene.parent;

  let irr = 0;
  let iR = 0;
  let iG = 0;
  let iB = 0;
  let found = 0;
  scene.traverse((o) => {
    const l = o as AnyLight;
    if (!l.isLight || !l.visible) return;
    const I = l.intensity ?? 0;
    if (!(I > 0)) return;
    const c = l.color;
    if (!c) return;

    if (l.isAmbientLight) {
      irr += lum(c.r, c.g, c.b) * I;
      iR += c.r * I;
      iG += c.g * I;
      iB += c.b * I;
      found++;
      return;
    }
    if (l.isHemisphereLight) {
      /* A HEMISPHERE LIGHT AIMS BY WHERE IT STANDS. three's `WebGLLights`
         takes `direction` from the light's world POSITION and normalises it,
         and the shader's weight is `dot(n, direction) * 0.5 + 0.5`. A light
         left at the origin has no direction at all and three's own normalise
         of the zero vector gives (0,0,0), which weights 0.5 — the exact
         midpoint of sky and ground, which is what this then computes. */
      l.updateWorldMatrix(true, false);
      const e = l.matrixWorld.elements;
      const len = Math.hypot(e[12], e[13], e[14]);
      const uy = len > 0 ? e[13] / len : 0;
      const w = uy * 0.5 + 0.5;
      const g = l.groundColor ?? c;
      irr += (lum(g.r, g.g, g.b) + (lum(c.r, c.g, c.b) - lum(g.r, g.g, g.b)) * w) * I;
      iR += (g.r + (c.r - g.r) * w) * I;
      iG += (g.g + (c.g - g.g) * w) * I;
      iB += (g.b + (c.b - g.b) * w) * I;
      found++;
      return;
    }
    if (l.isDirectionalLight) {
      /* the direction the light TRAVELS FROM: three's shader uses
         `normalize(lightPosition - targetPosition)` and the surface's own
         `dot(n, L)`, clamped at zero */
      l.updateWorldMatrix(true, false);
      const t = l.target;
      t?.updateWorldMatrix(true, false);
      const e = l.matrixWorld.elements;
      const te = t?.matrixWorld.elements;
      const dx = e[12] - (te ? te[12] : 0);
      const dy = e[13] - (te ? te[13] : 0);
      const dz = e[14] - (te ? te[14] : 0);
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 0)) return;
      const nl = dy / len;
      if (nl > 0) {
        irr += lum(c.r, c.g, c.b) * I * nl;
        iR += c.r * I * nl;
        iG += c.g * I * nl;
        iB += c.b * I * nl;
      }
      found++;
      return;
    }
    /* a light shape this does not model — a point, a spot, an area. Counted
       so the caller is not told "no rig", but contributing nothing, because
       guessing a falloff would be worse than under-reporting one. */
    found++;
  });

  if (!found) return null;
  /* the same `/ PI` the luminance path applies — it is the diffuse transfer,
     not a colour convention, so it belongs on every channel alike */
  return rgb
    ? { r: iR / Math.PI, g: iG / Math.PI, b: iB / Math.PI }
    : irr / Math.PI;
}
