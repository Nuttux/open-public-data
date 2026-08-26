import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  CANOPY_MASS_MAX_R,
  CANOPY_MASS_RISE,
  CANOPY_MASS_SPREAD,
  CANOPY_MASS_TRIS,
  canopyMass,
  CROWN_BROADLEAF,
  CROWN_CONIFER,
  CROWN_FAMILIES,
  CROWN_MAX_R,
  CROWN_PALM,
  CROWN_TRIS,
  CROWN_UNCLASSED,
  crownSet,
  crownYaw,
  setCrownYaw,
} from "./tree-geometry";

/**
 * WHAT THIS TEST IS FOR.
 *
 * A crown is drawn 195,310 times and is about forty pixels across at the
 * camera anybody looks at it from, which means every failure mode here is
 * one that a screenshot ABSORBS. A crown wound inside out is invisible and
 * looks like a layer that did not load. A crown whose foot is not on y = 0
 * is a canopy floating a metre over the pavement, or buried, and at forty
 * pixels either passes for a shadow. A crown three per cent wider than the
 * published diameter is a claim about a register, and nothing on screen ever
 * says so.
 *
 * So the four things that cannot be checked by eye are checked here: the
 * ground convention, the published width, the triangle budget the caller is
 * paying, and the winding.
 */

const EPS = 1e-6;

interface Box {
  min: Vector3;
  max: Vector3;
}

function boxOf(i: number, set = crownSet()): Box {
  const g = set.geometries[i];
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b) throw new Error("no bounding box");
  return { min: b.min.clone(), max: b.max.clone() };
}

describe("crownSet", () => {
  it("builds one geometry per published family, in form-byte order", () => {
    const set = crownSet();
    expect(set.geometries).toHaveLength(CROWN_FAMILIES);
    expect(CROWN_FAMILIES).toBe(4);
    /* the form byte's own order, so `geometries[form & 3]` needs no table */
    expect(set.geometries.map((g) => g.name)).toEqual([
      "crown:broadleaf",
      "crown:conifer",
      "crown:palm",
      "crown:unclassed",
    ]);
    expect(CROWN_BROADLEAF).toBe(0);
    expect(CROWN_CONIFER).toBe(1);
    expect(CROWN_PALM).toBe(2);
    expect(CROWN_UNCLASSED).toBe(3);
    set.dispose();
  });

  it("a family byte in 0..255 always selects a geometry through `& 3`", () => {
    const set = crownSet();
    for (let form = 0; form < 256; form++) {
      expect(set.geometries[form & 3]).toBeDefined();
    }
    set.dispose();
  });

  // ── the budget ────────────────────────────────────────────────────────────

  it("spends the triangles it says it spends", () => {
    const set = crownSet();
    const built = set.geometries.map((g) => {
      const idx = g.getIndex();
      if (!idx) throw new Error("a crown must be indexed");
      expect(idx.count % 3).toBe(0);
      return idx.count / 3;
    });
    /* THE DOCUMENTED BUDGET AND THE BUILT ONE ARE THE SAME NUMBER, so the
       header cannot quietly drift away from the geometry under it. */
    expect(built).toEqual([...CROWN_TRIS]);
    set.dispose();
  });

  it("stays inside the 24..60 triangles a crown drawn 195,310 times can have", () => {
    for (const t of CROWN_TRIS) {
      expect(t).toBeGreaterThanOrEqual(24);
      expect(t).toBeLessThanOrEqual(60);
    }
    /* the whole canopy at the most expensive family, which is the number the
       caller is actually deciding about */
    expect(Math.max(...CROWN_TRIS) * 195310).toBe(9570190);
    expect(Math.min(...CROWN_TRIS) * 195310).toBe(6835850);
  });

  it("uploads four geometries and not 195,310 — the budget is not memory", () => {
    const set = crownSet();
    let floats = 0;
    for (const g of set.geometries) {
      for (const name of Object.keys(g.attributes)) {
        floats += g.getAttribute(name).array.length;
      }
    }
    // under 4 KB of vertex data for the entire canopy of the city
    expect(floats * 4).toBeLessThan(4096);
    set.dispose();
  });

  it("raises the count with `detail` and leaves the default alone", () => {
    const d0 = crownSet();
    const d1 = crownSet({ detail: 1 });
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const a = d0.geometries[i].getIndex()!.count;
      const b = d1.geometries[i].getIndex()!.count;
      expect(b).toBeGreaterThan(a);
    }
    expect(d0.geometries.map((g) => g.getIndex()!.count / 3)).toEqual([...CROWN_TRIS]);
    d0.dispose();
    d1.dispose();
  });

  // ── the ground convention ─────────────────────────────────────────────────

  it("stands every family ON the ground: y = 0 is the foot, nothing below it", () => {
    const set = crownSet();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const g = set.geometries[i];
      const pos = g.getAttribute("position");
      let minY = Infinity;
      let maxY = -Infinity;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      /* the documented convention: the trunk's foot ring sits ON y = 0, so
         the caller's `position` is the ground point and not the crown's
         centre. Nothing may hang below it. */
      expect(minY).toBeCloseTo(0, 9);
      expect(maxY).toBeGreaterThan(1);
      const b = boxOf(i, set);
      expect(b.min.y).toBeCloseTo(0, 9);
    }
    set.dispose();
  });

  it("is centred on the crown's own axis and reaches the published radius exactly", () => {
    const set = crownSet();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const pos = set.geometries[i].getAttribute("position");
      let maxR = 0;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const z = pos.getZ(v);
        maxR = Math.max(maxR, Math.hypot(x, z));
      }
      /* EXACTLY 1, not about 1: the caller scales by the crown radius the
         register publishes, so a family that peaked at 0.96 would be drawing
         a diameter no file gives it. The lobes only ever cut inward and
         azimuth 0 is always their crest, which is what makes this hold. */
      expect(maxR).toBeCloseTo(CROWN_MAX_R, 9);
      expect(maxR).toBeLessThanOrEqual(CROWN_MAX_R + EPS);
      const b = boxOf(i, set);
      expect(Math.abs(b.max.x)).toBeLessThanOrEqual(CROWN_MAX_R + EPS);
      expect(Math.abs(b.min.x)).toBeLessThanOrEqual(CROWN_MAX_R + EPS);
      expect(Math.abs(b.max.z)).toBeLessThanOrEqual(CROWN_MAX_R + EPS);
      expect(Math.abs(b.min.z)).toBeLessThanOrEqual(CROWN_MAX_R + EPS);
    }
    set.dispose();
  });

  it("gives each family its own silhouette and not one shape at four sizes", () => {
    const set = crownSet();
    const h = set.geometries.map((_, i) => boxOf(i, set).max.y);
    // a palm is the shortest thing here and a conifer the tallest
    expect(h[CROWN_PALM]).toBeLessThan(h[CROWN_BROADLEAF]);
    expect(h[CROWN_BROADLEAF]).toBeLessThan(h[CROWN_UNCLASSED]);
    expect(h[CROWN_UNCLASSED]).toBeLessThan(h[CROWN_CONIFER]);
    // and no two families are the same solid
    const sig = new Set(h.map((v) => v.toFixed(4)));
    expect(sig.size).toBe(CROWN_FAMILIES);
    set.dispose();
  });

  // ── the two tones ─────────────────────────────────────────────────────────

  it("carries a lit top and a shaded underside in one attribute", () => {
    const set = crownSet();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const g = set.geometries[i];
      const col = g.getAttribute("color");
      const pos = g.getAttribute("position");
      expect(col).toBeDefined();
      expect(col.itemSize).toBe(3);
      expect(col.count).toBe(pos.count);

      /* the crown's own vertices are a neutral multiplier, so the family's
         published green arrives per instance and is not in this file */
      let lo = Infinity;
      let hi = -Infinity;
      let topShade = 0;
      let botShade = 0;
      let topY = -Infinity;
      let botY = Infinity;
      for (let v = 0; v < col.count; v++) {
        const r = col.getX(v);
        const gg = col.getY(v);
        const b = col.getZ(v);
        if (Math.abs(r - gg) < EPS && Math.abs(gg - b) < EPS) {
          // a crown vertex: neutral, so it only scales the instance's green
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
          const y = pos.getY(v);
          if (y > topY) { topY = y; topShade = r; }
          if (y < botY) { botY = y; botShade = r; }
        }
      }
      expect(lo).toBeLessThan(1); // a shaded underside
      expect(hi).toBeGreaterThan(1); // a lit top
      expect(topShade).toBeGreaterThan(botShade);
    }
    set.dispose();
  });

  it("gives the trunk a warm, green-starved triple so one draw call is enough", () => {
    const set = crownSet();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const g = set.geometries[i];
      const col = g.getAttribute("color");
      const pos = g.getAttribute("position");
      // the foot ring is on the ground and is the trunk's
      let found = 0;
      for (let v = 0; v < col.count; v++) {
        if (pos.getY(v) > EPS) continue;
        found++;
        const r = col.getX(v);
        const gg = col.getY(v);
        const b = col.getZ(v);
        // warm: more red than green, so a green instance colour goes brown
        expect(r).toBeGreaterThan(gg);
        expect(b).toBeGreaterThan(gg);
      }
      expect(found).toBe(3); // the three-sided stem
    }
    set.dispose();
  });

  it("`tone` scales the spread and 0 leaves the crown flat", () => {
    const flat = crownSet({ tone: 0 });
    const full = crownSet({ tone: 1 });
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const spread = (s: ReturnType<typeof crownSet>): number => {
        const col = s.geometries[i].getAttribute("color");
        const pos = s.geometries[i].getAttribute("position");
        let lo = Infinity;
        let hi = -Infinity;
        for (let v = 0; v < col.count; v++) {
          if (pos.getY(v) <= EPS) continue; // skip the trunk's foot
          const r = col.getX(v);
          if (Math.abs(r - col.getY(v)) > EPS) continue; // skip the trunk
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
        }
        return hi - lo;
      };
      expect(spread(flat)).toBeCloseTo(0, 9);
      expect(spread(full)).toBeGreaterThan(1);
    }
    flat.dispose();
    full.dispose();
  });

  // ── the winding, and no NaN ───────────────────────────────────────────────

  it("winds every face outward, which back-face culling does not forgive", () => {
    const set = crownSet();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const g = set.geometries[i];
      const pos = g.getAttribute("position");
      const idx = g.getIndex()!;
      /* THE SIGNED VOLUME IS THE WHOLE WINDING TEST IN ONE NUMBER: sum the
         tetrahedra each triangle makes with the origin and a consistently
         outward mesh comes out positive. The trunk's foot is left open, and
         that is exactly why the origin is the right apex — the missing cap
         lies in the plane y = 0, which passes through the origin, so its
         tetrahedra are degenerate and contribute nothing. */
      let vol = 0;
      for (let t = 0; t < idx.count; t += 3) {
        a.fromBufferAttribute(pos, idx.getX(t));
        b.fromBufferAttribute(pos, idx.getX(t + 1));
        c.fromBufferAttribute(pos, idx.getX(t + 2));
        vol += a.dot(b.clone().cross(c)) / 6;
      }
      expect(vol).toBeGreaterThan(0);
    }
    set.dispose();
  });

  it("has no NaN anywhere in any attribute", () => {
    const set = crownSet();
    for (const g of set.geometries) {
      for (const name of Object.keys(g.attributes)) {
        const arr = g.getAttribute(name).array;
        for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
    set.dispose();
  });

  it("disposes what it built", () => {
    const set = crownSet();
    let disposed = 0;
    for (const g of set.geometries) g.addEventListener("dispose", () => disposed++);
    set.dispose();
    expect(disposed).toBe(CROWN_FAMILIES);
    expect(set.geometries).toHaveLength(0);
  });
});

// ── the canopy mass ─────────────────────────────────────────────────────────

/**
 * WHAT THESE ARE FOR.
 *
 * A canopy mass is drawn 50,897 times and the failure that shipped was one a
 * screenshot absorbed for weeks: a detail-0 icosahedron squashed flat reads,
 * from a camera looking down at it, as a HEXAGON — and fifty thousand of them
 * at one orientation tile a park with a hex pattern that looks deliberate. So
 * the two things that cannot be checked by eye at map scale are checked here:
 * the silhouette is round enough to be a silhouette, and the solid carries a
 * value gradient at all rather than one flat tone.
 *
 * The rest is the crown's own contract, which the caller depends on in the
 * same way: y = 0 is the ground and the widest ring is r = 1.
 */
describe("canopyMass", () => {
  it("stands ON the ground, with nothing below y = 0", () => {
    const g = canopyMass();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.y).toBeGreaterThanOrEqual(-EPS);
    expect(b.min.y).toBeLessThan(0.2);
    g.dispose();
  });

  it("is as tall as its own widest radius, so one scale drives both ratios", () => {
    const g = canopyMass();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    /* the caller multiplies x/z by `CANOPY_MASS_SPREAD` and y by
       `CANOPY_MASS_RISE`, both in units of the published `blobRadius` — which
       only works if the geometry itself is 1 by 1 */
    expect(b.max.y).toBeCloseTo(1, 6);
    expect(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)).toBeCloseTo(CANOPY_MASS_MAX_R, 6);
    expect(CANOPY_MASS_SPREAD).toBeGreaterThan(1);
    expect(CANOPY_MASS_RISE).toBeGreaterThan(CANOPY_MASS_SPREAD);
  });

  it("spends the triangles it says it spends", () => {
    const g = canopyMass();
    expect(g.getIndex()!.count / 3).toBe(CANOPY_MASS_TRIS);
    g.dispose();
  });

  it("has no stem — a canopy cell is the mass, not a tree under one", () => {
    const g = canopyMass();
    const col = g.getAttribute("color");
    /* every vertex is a NEUTRAL multiplier. The crown's trunk is the one
       place this file emits a coloured triple, and a mass has no trunk, so a
       non-neutral vertex here means `buildDome` grew one back. */
    for (let v = 0; v < col.count; v++) {
      expect(Math.abs(col.getX(v) - col.getY(v))).toBeLessThan(EPS);
      expect(Math.abs(col.getY(v) - col.getZ(v))).toBeLessThan(EPS);
    }
    g.dispose();
  });

  it("reads as a solid and not as a plate: a lit crest over a dark underside", () => {
    const g = canopyMass();
    const col = g.getAttribute("color");
    const pos = g.getAttribute("position");
    let topShade = 0;
    let botShade = 0;
    let topY = -Infinity;
    let botY = Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    for (let v = 0; v < col.count; v++) {
      const c = col.getX(v);
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
      const y = pos.getY(v);
      if (y > topY) { topY = y; topShade = c; }
      if (y < botY) { botY = y; botShade = c; }
    }
    expect(topShade).toBeGreaterThan(botShade);
    /* THE ONE THAT WOULD HAVE CAUGHT THE HEXAGONS. The solid this replaced
       had a single instance colour and no `color` attribute at all, so its
       whole range was 1 to 1 — the numeric form of "a pattern printed on the
       grass". Half a stop either side of the mid is the least that reads as
       volume at the camera these are drawn at. */
    expect(hi / lo).toBeGreaterThan(1.5);
    g.dispose();
  });

  it("is round enough that its silhouette is not a polygon", () => {
    const g = canopyMass();
    const pos = g.getAttribute("position");
    /* count the distinct azimuths on the widest ring: an icosahedron gives
       six and reads as a hexagon from above */
    const az = new Set<number>();
    for (let v = 0; v < pos.count; v++) {
      const r = Math.hypot(pos.getX(v), pos.getZ(v));
      if (r < 0.5) continue;
      az.add(Math.round((Math.atan2(pos.getZ(v), pos.getX(v)) * 180) / Math.PI));
    }
    expect(az.size).toBeGreaterThanOrEqual(9);
    g.dispose();
  });

  it("`gain` moves the whole ramp, mid included, and 1 leaves it alone", () => {
    const flat = canopyMass({ tone: 0 });
    const c0 = flat.getAttribute("color");
    for (let v = 0; v < c0.count; v++) expect(c0.getX(v)).toBeCloseTo(1, 6);
    flat.dispose();

    const a = canopyMass();
    const b = canopyMass({ gain: 2 });
    const ca = a.getAttribute("color");
    const cb = b.getAttribute("color");
    expect(cb.count).toBe(ca.count);
    for (let v = 0; v < ca.count; v++) expect(cb.getX(v)).toBeCloseTo(ca.getX(v) * 2, 5);
    a.dispose();
    b.dispose();
  });

  it("winds every face outward, which back-face culling does not forgive", () => {
    const g = canopyMass();
    const pos = g.getAttribute("position");
    const idx = g.getIndex()!;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    let vol = 0;
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      vol += a.dot(b.clone().cross(c)) / 6;
    }
    expect(vol).toBeGreaterThan(0);
    g.dispose();
  });

  it("has no NaN anywhere in any attribute", () => {
    const g = canopyMass();
    for (const name of Object.keys(g.attributes)) {
      const arr = g.getAttribute(name).array;
      for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
    }
    g.dispose();
  });
});

// ── the orientation ─────────────────────────────────────────────────────────

describe("crownYaw", () => {
  it("is deterministic from the index and never random", () => {
    for (const i of [0, 1, 7, 1000, 195309]) expect(crownYaw(i)).toBe(crownYaw(i));
    expect(crownYaw(0)).not.toBe(crownYaw(1));
  });

  it("spreads 195,310 crowns over the whole circle", () => {
    const bins = new Array<number>(12).fill(0);
    for (let i = 0; i < 195310; i++) {
      const y = crownYaw(i);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(Math.PI * 2 + EPS);
      bins[Math.min(11, Math.floor((y / (Math.PI * 2)) * 12))]++;
    }
    // no bin starved and none hogging: a flat-ish twelfth each
    for (const n of bins) {
      expect(n).toBeGreaterThan(195310 / 12 / 1.2);
      expect(n).toBeLessThan((195310 / 12) * 1.2);
    }
  });

  it("composes a FINITE matrix, which a `{x,y,z,w}` literal does not", () => {
    /* THE BUG THIS PINS. `Matrix4.compose` reads a quaternion's private
       `_x/_y/_z/_w`; an object literal cast to the type compiles, runs,
       throws nothing, and writes NaN into all nine rotation-and-scale
       components — 195,310 crowns at a valid position with a NaN size, none
       of them drawn and nothing said about it. `setCrownYaw` takes a real
       `Quaternion` so that cannot be spelled. */
    const rot = new Quaternion();
    const pos = new Vector3(1, 2, 3);
    const scl = new Vector3(3.3, 3.3, 3.3);
    const m = new Matrix4();
    for (const i of [0, 1, 42, 195309]) {
      const out = setCrownYaw(i, rot);
      expect(out).toBe(rot);
      expect(rot.length()).toBeCloseTo(1, 12); // a unit quaternion
      expect(rot.x).toBe(0); // yaw only: no tilt to shear a non-uniform scale
      expect(rot.z).toBe(0);
      m.compose(pos, rot, scl);
      for (const e of m.elements) expect(Number.isFinite(e)).toBe(true);
      // and the scale survives the round trip
      const s = new Vector3();
      m.decompose(new Vector3(), new Quaternion(), s);
      expect(s.x).toBeCloseTo(3.3, 9);
    }
  });

  it("keeps the crown's foot on the ground through the yaw", () => {
    /* a yaw is about the vertical axis through the foot, so the ground
       convention survives it — which is what lets the caller pass the terrain
       sample straight in as `position`. */
    const set = crownSet();
    const rot = new Quaternion();
    const m = new Matrix4();
    const v = new Vector3();
    for (let i = 0; i < CROWN_FAMILIES; i++) {
      const pos = set.geometries[i].getAttribute("position");
      setCrownYaw(i * 977 + 13, rot);
      m.compose(new Vector3(0, 0, 0), rot, new Vector3(5, 5, 5));
      let minY = Infinity;
      for (let p = 0; p < pos.count; p++) {
        v.fromBufferAttribute(pos, p).applyMatrix4(m);
        minY = Math.min(minY, v.y);
      }
      expect(minY).toBeCloseTo(0, 9);
    }
    set.dispose();
  });
});
