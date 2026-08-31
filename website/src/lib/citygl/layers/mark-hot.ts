/* ══ THE RING THAT SAYS "THIS ONE" ═════════════════════════════════════════
 *
 * The record panel lists the decisions of a year and the marks layer draws the
 * same decisions as dots. They are one set shown twice, which is the whole
 * design of the page — and a reader could not tell which line went with which
 * dot, so it was two lists that happened to agree.
 *
 * This is the wire between them: hover a row, and a ring lands on every place
 * that decision names.
 *
 * ── WHY IT IS NOT PART OF THE MARKS LAYER ─────────────────────────────────
 * `theme-marks.ts` owns 16,547 instances, a filter, a picker and two draw
 * modes, and its instance colours are the SUBJECT's. A highlight is not a
 * property of a mark — it is a property of what the reader is pointing at, it
 * outlives no frame, and it has to work whether the mark under it is drawn as
 * a dot or folded into a density puck. So it is its own object with its own
 * short life, and neither file has to know how the other draws.
 *
 * ── A DECISION IS OFTEN IN SEVERAL PLACES AT ONCE ─────────────────────────
 * The marks file holds 2.11 dots per decision: an ordinance naming twenty-four
 * addresses is one act of the Board and twenty-four marks. So this takes a
 * LIST of points, not one, and the reader hovering *"Ordering Improvement of
 * Clement Street and Fulton Avenue"* sees the whole of what it touched light
 * up at once — which is the answer to a question the list alone cannot give.
 *
 * `CAP` is the most it will draw. 24 is the largest a decision reaches in the
 * shipped corpus; the cap is above it and stated so a future record with more
 * degrades by drawing fewer rings rather than by allocating without bound.
 * ═══════════════════════════════════════════════════════════════════════ */

import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
} from "three";
import type { CityLayer } from "../engine";

export interface MarkHotOptions {
  scene: Scene;
  elevAt: (x: number, y: number) => number;
  zex: number;
}

/* ── §A RING IS A SCREEN OBJECT, NOT A WORLD ONE ───────────────────────────
   Built first at a fixed 34 m radius. MEASURED at the whole-city camera, where
   the map spans about 14 km over 1,150 px: that is 2.8 px across, and hovering
   a row moved **139 pixels of 942,016 — 0.015 % of the frame**. Correct, and
   invisible, which is the same as not built.

   A highlight is not a thing in the city with a size; it is a pointer, and a
   pointer is worth the same number of PIXELS at every camera. So the radius is
   per zoom band, derived from each band's own metres-per-pixel — 14 km, 4.2 km
   and 1.4 km across the same strip — to hold the ring near 22 px wherever the
   reader is standing. The geometry is unit-sized and the instance matrix
   carries the scale, so changing bands costs a matrix write and no rebuild. */
const R_UNIT_OUTER = 1;
const R_UNIT_INNER = 0.74;
/** world metres of ring radius per band: whole city, district, closer */
const R_BY_STEP = [240, 74, 26];
/** clear of the marks, which sit just off the ground */
const LIFT_M = 1.2;
/** the most places one decision may light at once — see the header */
const CAP = 48;
const RUNG = 9.2;
const SEAT_M = 12;

export interface MarkHotLayer extends CityLayer {
  /** ring these world points, or clear the ring with `null` */
  setAt(points: readonly (readonly [number, number])[] | null, hex?: number): void;
}

export function markHotLayer(o: MarkHotOptions): MarkHotLayer {
  const g = new RingGeometry(R_UNIT_INNER, R_UNIT_OUTER, 36);
  /* flat on the ground: `RingGeometry` is built in the XY plane and the map's
     ground is XZ, so it is laid down once here rather than rotated per frame */
  g.rotateX(-Math.PI / 2);
  const mat = new MeshBasicMaterial({
    /* it is a pointer, not a thing in the city: it does not take the sun and
       it is never hidden by what it is pointing at. Near-black rather than
       white, because this map's ground is pale and a white ring on it is a
       ring you have to hunt for — which is what it was built to stop. */
    color: 0x14131a, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false, side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new InstancedMesh(g, mat, CAP);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = RUNG;
  mesh.userData.wash = true;
  mesh.userData.washM = SEAT_M;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  let zex = o.zex;
  mesh.scale.y = zex;
  o.scene.add(mesh);

  const m = new Matrix4();
  const col = new Color();
  /* held so a change of band can re-place the rings without the panel
     having to hover again */
  let at: readonly (readonly [number, number])[] | null = null;
  let radius = R_BY_STEP[0];

  const place = (): void => {
    if (!at || !at.length) {
      mesh.count = 0;
      mesh.visible = false;
      return;
    }
    const n = Math.min(at.length, CAP);
    for (let i = 0; i < n; i++) {
      const [x, z] = at[i];
      /* the ring is flat, so the y scale must be 1 in the instance and the
         mesh's own `scale.y` carries the band's exaggeration */
      m.makeScale(radius, 1, radius);
      m.setPosition(x, o.elevAt(x, z) + LIFT_M, z);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = true;
  };

  return {
    name: "mark-hot",
    setAt(points, hex) {
      at = points ?? null;
      if (hex !== undefined) {
        col.setHex(hex);
        mat.color.copy(col);
      } else {
        mat.color.setHex(0x14131a);
      }
      place();
    },
    onStep(step: number, z: number): void {
      zex = z;
      mesh.scale.y = zex;
      radius = R_BY_STEP[step < 0 ? 0 : step > 2 ? 2 : step];
      place();
    },
    dispose(): void {
      o.scene.remove(mesh);
      g.dispose();
      mat.dispose();
    },
  };
}
