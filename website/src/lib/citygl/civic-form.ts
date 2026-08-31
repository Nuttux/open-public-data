/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/civic-form.ts — THE FIVE FORMS A NAMED BUILDING MAY TAKE.

   `civic.ts` says WHICH buildings get one of these and where that comes from.
   This file is the drawing, and it is authored exactly the way the house form
   is — `roof-form.ts` §A HOUSE, DRAWN AS A HOUSE:

     *"the record decides WHICH buildings get it ... and how big it is, from
     the published footprint and height. The FORM is a design, and the numbers
     below are art direction, not findings."*

   Every one of them is built in the plan's OWN frame — `gablePlan`, whose own
   note has the measurement — because San Francisco's grid runs 25 to 30
   degrees off and a form laid out on the projection's axes comes out twice
   the size of the building it belongs to.

   ── AND SOME OF THEM STAND ABOVE THE PUBLISHED HEIGHT ────────────────────
   A church tower and a hose tower do, and that has to be said plainly. The
   fabric's height is the MEDIAN LIDAR return over the footprint, and
   `base/heroes.json` already states what that number is and is not, about the
   Transamerica: *"exactly right for a flat-roofed box and exactly wrong for a
   spire, because most of a tapering tower's footprint lies under its wide
   base."* A parish church is the same shape of problem — most of its area is
   nave, so the median is the nave and the tower is invisible in it.

   The difference from the Transamerica, and it is the honest one: that hero
   has a PUBLISHED top, 853 ft from the Tall Building Inventory, and its
   drawing uses it. These 78 buildings have none. So the tower's height here
   is a proportion of the building under it and is declared as art direction,
   like the house's pitch. What is measured is the footprint, the height of
   the mass, and that the building is a church at all.
   ═══════════════════════════════════════════════════════════════════════ */

import type { CivicForm } from "./civic";
import {
  gableHalf,
  gablePlan,
  shadeRGB,
  EAVE_FASCIA_M,
  RIDGE_HALF_M,
  RIDGE_LIFT_M,
  type FormRing,
  type FormSink,
  type RGB,
} from "./roof-form";

/** murmur3's finaliser — `roof-form.ts` keeps its own, and for the same
 *  reason: a gid is spatially ordered and an unmixed hash lays a gradient
 *  down a street instead of breaking it up. */
function mix32(x: number): number {
  let v = x | 0;
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b);
  v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
  v ^= v >>> 16;
  return v >>> 0;
}

/* ── the numbers, all of them art direction and all of them stated ───────── */

/** a church roof is steeper than a house's 24-34 — this is a nave, not a bungalow */
const CHURCH_PITCH_DEG = 44;
/**
 * AND ITS RISE IS NOT CAPPED AT A HOUSE'S.
 *
 * `HOUSE_MAX_HALFRISE_M` is 3.2 and is right for what it is named for. A nave
 * is routinely 25 m across, which at 44 degrees wants 12 m of rise, and the
 * house's ceiling flattened every cathedral in this city to the same lid its
 * neighbours have. 14 m of half-rise is a 28 m ridge over the eave, which is
 * about what the nave of a large parish church has, and it binds only on a
 * plan over 29 m across.
 *
 * AND IT IS ALSO BOUNDED BY THE WALL IT HAS TO LEAVE. The roof rises `half`
 * above the published plane and its eave drops `half` below it, which is
 * F2.4 and is what keeps the DRAWN median equal to the published one. On a
 * building whose published height is low for what it is, that eats the wall:
 * Grace Cathedral's median LIDAR return is 12.4 m over a 25 m span, so a
 * 44-degree roof wants 12.1 m of rise and leaves 30 cm of wall under it —
 * a roof sitting on the pavement. `CHURCH_WALL_KEEP` is the share of the
 * height that stays wall, so the eave can never come down past it.
 */
const CHURCH_MAX_HALF_M = 14;
const CHURCH_WALL_KEEP = 0.55;
/** the ceiling actually applied, which is the smaller of the two */
function churchHalfCap(hM: number): number {
  return Math.min(CHURCH_MAX_HALF_M, hM * (1 - CHURCH_WALL_KEEP));
}
/** a shed is long and low and its own pitch keeps it there; this is a backstop */
const SHED_MAX_HALF_M = 5;
/** the tower's side, as a fraction of the plan's short axis, and its bounds */
const TOWER_SHARE = 0.30;
const TOWER_MIN_M = 2.6;
const TOWER_MAX_M = 7.0;
/** how far the tower stands over the building under it, and the ceiling on it */
const TOWER_RISE_LO = 0.95;
const TOWER_RISE_HI = 2.00;
const TOWER_RISE_MAX_M = 34;
/** the spire, as a multiple of the tower's own width. Under about 1.2 it is a
 *  pyramidal cap and over about 2.2 it is a needle; this is the range between */
const SPIRE_LO = 1.9;
const SPIRE_HI = 3.1;
/** a hose tower is slender and short — it is for hanging hose, not for bells */
const HOSE_SIDE_M = 2.3;
const HOSE_RISE_LO = 0.5;
const HOSE_RISE_HI = 1.0;
const HOSE_RISE_MAX_M = 12;
/** a pier shed's roof: shallow, because a 200 m shed at a house's pitch is a barn */
const SHED_PITCH_DEG = 14;
/** the monument's attic: how much of the plan it covers and how high it stands */
const ATTIC_SHARE = 0.56;
const ATTIC_RISE_K = 0.16;
const ATTIC_MIN_M = 2.2;
/** the school's entrance bay: the share of the frontage, and how proud it stands */
const ENTRY_SHARE = 0.30;
const ENTRY_PROUD_M = 0.8;
const ENTRY_RISE_M = 1.6;

/** how much of a building's height the drawn form may add before it is refused */
const MIN_PLAN_M = 4;

/**
 * A prism on the plan's own frame, from `z0` to `z1`, with a flat cap.
 * Every one of these forms is made of two or three of these.
 */
function shaft(
  sink: FormSink, elevM: number,
  ox: number, oy: number, ux: number, uy: number, nx: number, ny: number,
  a: number, b: number, half: number, z0: number, z1: number,
  side: RGB, cap: RGB,
): void {
  const V = (da: number, db: number, z: number, c: RGB): number =>
    sink.vertex(ox + ux * (a + da) + nx * (b + db),
                oy + uy * (a + da) + ny * (b + db), elevM, z, c[0], c[1], c[2]);
  const d: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const lo: number[] = [], hi: number[] = [], top: number[] = [];
  for (const [da, db] of d) {
    lo.push(V(da, db, z0, side));
    hi.push(V(da, db, z1, side));
    top.push(V(da, db, z1, cap));
  }
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) & 3;
    sink.tri(lo[k], lo[m], hi[m]); sink.tri(lo[k], hi[m], hi[k]);
  }
  sink.tri(top[0], top[1], top[2]); sink.tri(top[0], top[2], top[3]);
}

/** a four-sided spire standing on a square of side `2*half` */
function spire(
  sink: FormSink, elevM: number,
  ox: number, oy: number, ux: number, uy: number, nx: number, ny: number,
  a: number, b: number, half: number, z0: number, z1: number, c: RGB,
): void {
  const lit = shadeRGB(c, 1.06), dark = shadeRGB(c, 0.84);
  const V = (da: number, db: number, z: number, col: RGB): number =>
    sink.vertex(ox + ux * (a + da) + nx * (b + db),
                oy + uy * (a + da) + ny * (b + db), elevM, z, col[0], col[1], col[2]);
  const d: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) & 3;
    const col = k === 1 || k === 2 ? lit : dark;
    const p0 = V(d[k][0], d[k][1], z0, col);
    const p1 = V(d[m][0], d[m][1], z0, col);
    const pk = V(0, 0, z1, col);
    sink.tri(p0, p1, pk);
  }
}

/**
 * A CHURCH: a steep nave and a tower at one end.
 *
 * The nave is a gable at 44 degrees down the plan's long axis, which is what
 * a nave is; the tower stands on the same axis at the end the house form
 * calls the front, and carries a spire between 1.25 and 2.1 of its own width.
 *
 * The nave's ridge rises and its eave drops by the same amount, so the DRAWN
 * surface's median is the published one — `roof-form.ts` §F2.4. The tower is
 * the exception the header states and states the reason for.
 */
function churchForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  roof: RGB, wall: RGB, gid: number,
): boolean {
  const P = gablePlan(ring, hM, gid, CHURCH_PITCH_DEG, churchHalfCap(hM));
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv, half } = P;
  if (2 * hv < MIN_PLAN_M) return false;
  const eaveH = hM - half, ridge = hM + half;
  const h = mix32(gid ^ 0x51ed270b);
  const u = (k: number): number => ((h >>> k) & 1023) / 1023;

  const V = (a: number, b: number, z: number, c: RGB): number =>
    sink.vertex(ox + ux * a + nx * b, oy + uy * a + ny * b, elevM, z, c[0], c[1], c[2]);
  const rl = shadeRGB(roof, 1.05), rd = shadeRGB(roof, 0.84);

  /* the nave, ridge along the long axis, with a small eave on the free ends */
  const ov = 0.35;
  const ru = hu + ov, rv = hv + 0.12;
  const a0 = V(-ru, -rv, eaveH, rd), a1 = V(ru, -rv, eaveH, rd);
  const b1 = V(ru, rv, eaveH, rl), b0 = V(-ru, rv, eaveH, rl);
  const r0 = V(-ru, 0, ridge, rl), r1 = V(ru, 0, ridge, rl);
  sink.tri(a0, a1, r1); sink.tri(a0, r1, r0);
  sink.tri(b0, r0, r1); sink.tri(b0, r1, b1);
  /* the gable ends, on the wall */
  sink.tri(V(-hu, -hv, eaveH, wall), V(-hu, hv, eaveH, wall), V(-hu, 0, ridge, wall));
  sink.tri(V(hu, hv, eaveH, wall), V(hu, -hv, eaveH, wall), V(hu, 0, ridge, wall));
  /* the fascia, so the roof has a thickness — `roof-form.ts` §THE ROOF HAS A
     THICKNESS, and the same six quads round the boundary */
  {
    const fc = shadeRGB(roof, 0.44);
    const loop: [number, number, number][] = [
      [-ru, -rv, eaveH], [ru, -rv, eaveH], [ru, 0, ridge],
      [ru, rv, eaveH], [-ru, rv, eaveH], [-ru, 0, ridge]];
    for (let k = 0; k < 6; k++) {
      const S = loop[k], E = loop[(k + 1) % 6];
      const t0 = V(S[0], S[1], S[2], fc), t1 = V(E[0], E[1], E[2], fc);
      const c0 = V(S[0], S[1], S[2] - EAVE_FASCIA_M, fc);
      const c1 = V(E[0], E[1], E[2] - EAVE_FASCIA_M, fc);
      sink.tri(t0, t1, c1); sink.tri(t0, c1, c0);
    }
    const rcp = shadeRGB(roof, 0.72), z = ridge + RIDGE_LIFT_M;
    const q0 = V(-ru, -RIDGE_HALF_M, z, rcp), q1 = V(ru, -RIDGE_HALF_M, z, rcp);
    const q2 = V(ru, RIDGE_HALF_M, z, rcp), q3 = V(-ru, RIDGE_HALF_M, z, rcp);
    sink.tri(q0, q1, q2); sink.tri(q0, q2, q3);
  }

  /* THE TOWER, at the front end, on the axis */
  const side = Math.max(TOWER_MIN_M, Math.min(TOWER_MAX_M, 2 * hv * TOWER_SHARE));
  const th = side / 2;
  const rise = Math.min(TOWER_RISE_MAX_M,
    hM * (TOWER_RISE_LO + (TOWER_RISE_HI - TOWER_RISE_LO) * u(0)));
  const topZ = ridge + rise;
  const tw = shadeRGB(wall, 1.02), tc = shadeRGB(wall, 0.78);
  shaft(sink, elevM, ox, oy, ux, uy, nx, ny, -hu + th, 0, th, 0, topZ, tw, tc);
  spire(sink, elevM, ox, oy, ux, uy, nx, ny, -hu + th, 0, th * 1.04, topZ,
        topZ + side * (SPIRE_LO + (SPIRE_HI - SPIRE_LO) * u(10)), shadeRGB(roof, 0.9));
  return true;
}

/**
 * A FIRE STATION: the hose tower.
 *
 * A San Francisco fire house has a slender shaft for hanging hose to dry, and
 * from overhead it is the one thing that separates a fire station from the
 * shop next door. The rest of the building is left to the fabric — a station
 * IS a flat-roofed box with a big door, and drawing it as anything else would
 * be inventing.
 */
function firehouseForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  _roof: RGB, wall: RGB, gid: number,
): boolean {
  const P = gablePlan(ring, hM, gid, 20);
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv } = P;
  if (2 * hv < MIN_PLAN_M || 2 * hu < MIN_PLAN_M) return false;
  const h = mix32(gid ^ 0x2c1b3c6d);
  const u = (k: number): number => ((h >>> k) & 1023) / 1023;
  const th = Math.min(HOSE_SIDE_M, hv * 0.6, hu * 0.6) / 2;
  if (!(th > 0.5)) return false;
  const rise = Math.min(HOSE_RISE_MAX_M,
    Math.max(3.5, hM * (HOSE_RISE_LO + (HOSE_RISE_HI - HOSE_RISE_LO) * u(0))));
  /* at the back, off the centre line — a hose tower is in the yard corner,
     not on the street front */
  const a = hu - th * 1.6;
  const b = (hv - th * 1.6) * (((h >>> 20) & 1) === 1 ? 1 : -1);
  shaft(sink, elevM, ox, oy, ux, uy, nx, ny, a, b, th,
        hM - 1.5, hM + rise, shadeRGB(wall, 0.96), shadeRGB(wall, 0.7));
  return true;
}

/**
 * A MONUMENT: civic, arts and library.
 *
 * The Opera House, Davies Symphony Hall, the Asian Art Museum, the Main
 * Library, Bill Graham. What they share as SHAPE, whatever their style, is a
 * heavy top and something standing back behind it — an attic storey, a
 * clerestory over the hall, a raised roof over the auditorium. That is what
 * is drawn: one inset block over the middle of the plan. The cornice itself
 * is the fabric's, and it is already deeper on these than on a house.
 */
function monumentForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  roof: RGB, wall: RGB, gid: number,
): boolean {
  const P = gablePlan(ring, hM, gid, 20);
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv } = P;
  if (2 * hv < 10 || 2 * hu < 14) return false;
  const rise = Math.max(ATTIC_MIN_M, hM * ATTIC_RISE_K);
  const au = hu * ATTIC_SHARE, av = hv * ATTIC_SHARE;
  const sideC = shadeRGB(wall, 1.03), capC = shadeRGB(roof, 0.94);
  const V = (a: number, b: number, z: number, c: RGB): number =>
    sink.vertex(ox + ux * a + nx * b, oy + uy * a + ny * b, elevM, z, c[0], c[1], c[2]);
  const d: [number, number][] = [[-au, -av], [au, -av], [au, av], [-au, av]];
  const lo: number[] = [], hi: number[] = [], top: number[] = [];
  for (const [a, b] of d) {
    lo.push(V(a, b, hM - 0.2, sideC));
    hi.push(V(a, b, hM + rise, sideC));
    top.push(V(a, b, hM + rise, capC));
  }
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) & 3;
    sink.tri(lo[k], lo[m], hi[m]); sink.tri(lo[k], hi[m], hi[k]);
  }
  sink.tri(top[0], top[1], top[2]); sink.tri(top[0], top[2], top[3]);
  return true;
}

/**
 * A SHED: the piers, and the works buildings shaped like them.
 *
 * 47 of the 51 rows the register calls `port` are literally named
 * `Pier NN - Shed`. A pier shed is one long low gable down the pier's own
 * axis, and this is the least authored of the five: it is what those
 * buildings are. The pitch is shallow because a 200 m shed drawn at a
 * house's 30 degrees is a barn the size of a hill.
 */
function shedForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  roof: RGB, wall: RGB, gid: number,
): boolean {
  const P = gablePlan(ring, hM, gid, SHED_PITCH_DEG, SHED_MAX_HALF_M);
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv, half } = P;
  if (2 * hv < MIN_PLAN_M) return false;
  const eaveH = hM - half, ridge = hM + half;
  const V = (a: number, b: number, z: number, c: RGB): number =>
    sink.vertex(ox + ux * a + nx * b, oy + uy * a + ny * b, elevM, z, c[0], c[1], c[2]);
  const rl = shadeRGB(roof, 1.04), rd = shadeRGB(roof, 0.87);
  const ru = hu + 0.25, rv = hv + 0.25;
  const a0 = V(-ru, -rv, eaveH, rd), a1 = V(ru, -rv, eaveH, rd);
  const b1 = V(ru, rv, eaveH, rl), b0 = V(-ru, rv, eaveH, rl);
  const r0 = V(-ru, 0, ridge, rl), r1 = V(ru, 0, ridge, rl);
  sink.tri(a0, a1, r1); sink.tri(a0, r1, r0);
  sink.tri(b0, r0, r1); sink.tri(b0, r1, b1);
  sink.tri(V(-hu, -hv, eaveH, wall), V(-hu, hv, eaveH, wall), V(-hu, 0, ridge, wall));
  sink.tri(V(hu, hv, eaveH, wall), V(hu, -hv, eaveH, wall), V(hu, 0, ridge, wall));
  const fc = shadeRGB(roof, 0.5);
  for (const s of [-1, 1]) {
    const t0 = V(-ru, s * rv, eaveH, fc), t1 = V(ru, s * rv, eaveH, fc);
    const c0 = V(-ru, s * rv, eaveH - EAVE_FASCIA_M, fc);
    const c1 = V(ru, s * rv, eaveH - EAVE_FASCIA_M, fc);
    sink.tri(t0, t1, c1); sink.tri(t0, c1, c0);
  }
  return true;
}

/**
 * A SCHOOL: the entrance bay, and nothing on the roof.
 *
 * 217 rows, the largest family, and therefore the one where a wrong form is
 * most visible — so this is the mildest of the five. A San Francisco school
 * building almost always presents a raised centre bay to its street front,
 * standing a little proud of the wall and carrying its parapet higher. That
 * is all this draws. Nothing is put on the roof of 217 buildings on the
 * strength of a register that says only "school".
 */
function schoolForm(
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  roof: RGB, wall: RGB, gid: number,
): boolean {
  const P = gablePlan(ring, hM, gid, 20);
  if (!P) return false;
  const { ox, oy, ux, uy, nx, ny, hu, hv } = P;
  if (2 * hv < 8 || 2 * hu < 12) return false;
  const bw = hv * ENTRY_SHARE;
  const p = ENTRY_PROUD_M;
  const sideC = shadeRGB(wall, 1.05), capC = shadeRGB(roof, 0.97);
  const V = (a: number, b: number, z: number, c: RGB): number =>
    sink.vertex(ox + ux * a + nx * b, oy + uy * a + ny * b, elevM, z, c[0], c[1], c[2]);
  const d: [number, number][] = [
    [-hu, -bw], [-hu, bw], [-hu - p, bw], [-hu - p, -bw]];
  const lo: number[] = [], hi: number[] = [], top: number[] = [];
  for (const [a, b] of d) {
    lo.push(V(a, b, 0, sideC));
    hi.push(V(a, b, hM + ENTRY_RISE_M, sideC));
    top.push(V(a, b, hM + ENTRY_RISE_M, capC));
  }
  for (let k = 0; k < 4; k++) {
    const m = (k + 1) & 3;
    sink.tri(lo[k], lo[m], hi[m]); sink.tri(lo[k], hi[m], hi[k]);
  }
  sink.tri(top[0], top[1], top[2]); sink.tri(top[0], top[2], top[3]);
  return true;
}

/**
 * Draw `form` on this footprint. Returns whether the drawn form REPLACES the
 * ordinary roof: a church and a shed carry their own, and the other three are
 * additions the fabric's flat roof still sits under.
 */
export function civicForm(
  form: CivicForm,
  sink: FormSink, ring: FormRing, elevM: number, hM: number,
  roof: RGB, wall: RGB, gid: number,
): { drew: boolean; roofed: boolean } {
  switch (form) {
    case "church":
      return { drew: churchForm(sink, ring, elevM, hM, roof, wall, gid), roofed: true };
    case "shed":
      return { drew: shedForm(sink, ring, elevM, hM, roof, wall, gid), roofed: true };
    case "firehouse":
      return { drew: firehouseForm(sink, ring, elevM, hM, roof, wall, gid), roofed: false };
    case "monument":
      return { drew: monumentForm(sink, ring, elevM, hM, roof, wall, gid), roofed: false };
    case "school":
      return { drew: schoolForm(sink, ring, elevM, hM, roof, wall, gid), roofed: false };
    default:
      return { drew: false, roofed: false };
  }
}

/** does this form REPLACE the roof the fabric would otherwise build? */
export function civicRoofs(form: CivicForm): boolean {
  return form === "church" || form === "shed";
}


/**
 * HOW FAR THE WALL STOPS SHORT OF THE PUBLISHED TOP, for a form that carries
 * its own roof.
 *
 * The caller needs this BEFORE it builds the wall, and the form needs the
 * same number again when it draws — which is the fault `gablePlan`'s own note
 * records twice over, so it is one call to the same plan and not a second
 * derivation. Zero for the three forms that are additions rather than roofs:
 * their fabric roof is still the flat one and the wall still reaches it.
 */
export function civicEaveDrop(
  form: CivicForm, ring: FormRing, hM: number, gid: number,
): number {
  if (form === "church") return gableHalf(ring, hM, gid, CHURCH_PITCH_DEG, churchHalfCap(hM));
  if (form === "shed") return gableHalf(ring, hM, gid, SHED_PITCH_DEG, SHED_MAX_HALF_M);
  return 0;
}
