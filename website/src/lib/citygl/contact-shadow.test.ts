import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  CONTACT_DEPTH,
  CONTACT_FEATHER,
  CONTACT_LEAN,
  CONTACT_R_CROWN,
  CONTACT_R_MASS,
  CONTACT_SCREEN_TO_GROUND,
  CONTACT_SIDES_CROWN,
  CONTACT_SIDES_MASS,
  contactCentre,
  contactDisc,
  contactMaterial,
  contactTris,
} from "./contact-shadow";

/**
 * WHAT THIS TEST IS FOR.
 *
 * A contact disc is drawn 246,207 times, is about eight pixels across, and
 * carries an alpha of a fifth — which means EVERY failure mode here is one a
 * screenshot absorbs. A disc at the wrong radius is a shadow that is slightly
 * too big, and nothing on the page ever says so. A disc whose alpha ramp is
 * upside down is a dark RING with a hole in it, and at eight pixels that is a
 * dark blob. A disc built at the wrong depth rung disappears under the road
 * and reads as a layer that did not load. A disc leaning the wrong way is a
 * shadow on the sunny side, which nobody sees and everybody feels.
 *
 * So what is checked is: the ground convention the caller composes against,
 * the four ratios read off the reference (against the reference's own numbers,
 * so a typo cannot survive), the ramp's direction, the winding, the triangle
 * budget, and the material's four load-bearing clauses.
 */

const EPS = 1e-6;

function attr(sides: number, name: string): Float32Array {
  const g = contactDisc({ sides });
  const a = g.getAttribute(name);
  if (!a) throw new Error(`no ${name}`);
  return a.array as Float32Array;
}

describe("contactDisc", () => {
  it("is flat on y = 0, because it lies on the ground and takes no height", () => {
    for (const sides of [CONTACT_SIDES_CROWN, CONTACT_SIDES_MASS]) {
      const pos = attr(sides, "position");
      for (let i = 1; i < pos.length; i += 3) expect(pos[i]).toBe(0);
    }
  });

  it("puts its CORE ring at exactly r = 1, so the caller scales by the radius", () => {
    const pos = attr(CONTACT_SIDES_CROWN, "position");
    const col = attr(CONTACT_SIDES_CROWN, "color");
    /* the full-alpha vertices are the core; the centre is at r = 0 and every
       other one of them has to be at r = 1 exactly, or the caller's `scale =
       the disc's ground radius` is a different radius than it says */
    let onCore = 0;
    for (let v = 0; v < pos.length / 3; v++) {
      if (col[v * 4 + 3] < 1 - EPS) continue;
      const r = Math.hypot(pos[v * 3], pos[v * 3 + 2]);
      if (r < EPS) continue;
      expect(r).toBeCloseTo(1, 6);
      onCore++;
    }
    expect(onCore).toBe(CONTACT_SIDES_CROWN);
  });

  it("puts the feather OUTSIDE the core and fades it to nothing", () => {
    const pos = attr(CONTACT_SIDES_MASS, "position");
    const col = attr(CONTACT_SIDES_MASS, "color");
    let rim = 0;
    for (let v = 0; v < pos.length / 3; v++) {
      if (col[v * 4 + 3] > EPS) continue;
      /* zero alpha means the feather ring, and it is at `1 + feather` — not
         inside the core, which would make the disc SMALLER than the reference
         ellipse it is sized from rather than softer than it */
      expect(Math.hypot(pos[v * 3], pos[v * 3 + 2])).toBeCloseTo(1 + CONTACT_FEATHER, 6);
      rim++;
    }
    expect(rim).toBe(CONTACT_SIDES_MASS);
  });

  it("carries the ramp in ALPHA and leaves rgb alone — the tone is the caller's", () => {
    const col = attr(CONTACT_SIDES_CROWN, "color");
    expect(col.length % 4).toBe(0);
    for (let v = 0; v < col.length / 4; v++) {
      /* a vertex colour multiplies `vec4(diffuse, opacity)` whole, so white
         rgb is what makes the material's own colour survive unchanged */
      expect(col[v * 4]).toBe(1);
      expect(col[v * 4 + 1]).toBe(1);
      expect(col[v * 4 + 2]).toBe(1);
      expect(col[v * 4 + 3]).toBeGreaterThanOrEqual(0);
      expect(col[v * 4 + 3]).toBeLessThanOrEqual(1);
    }
  });

  it("is opaque in the MIDDLE and clear at the RIM, not the other way round", () => {
    /* the ring-with-a-hole failure: at eight pixels an inverted ramp is a dark
       blob and passes, and it is wrong everywhere the disc overlaps another */
    const pos = attr(CONTACT_SIDES_MASS, "position");
    const col = attr(CONTACT_SIDES_MASS, "color");
    let inner = 0;
    let outer = 0;
    for (let v = 0; v < pos.length / 3; v++) {
      const r = Math.hypot(pos[v * 3], pos[v * 3 + 2]);
      const a = col[v * 4 + 3];
      if (r <= 1 + EPS) inner += a;
      else outer += a;
    }
    expect(inner).toBeGreaterThan(0);
    expect(outer).toBe(0);
  });

  it("spends the triangles it says it spends", () => {
    for (const sides of [CONTACT_SIDES_CROWN, CONTACT_SIDES_MASS]) {
      const g = contactDisc({ sides });
      const idx = g.getIndex();
      expect(idx).not.toBeNull();
      expect(idx!.count / 3).toBe(contactTris(sides));
    }
    /* 24 for a street tree and 36 for a canopy mass, against the 20 of the
       icosahedron this scene used to draw everything as. At 195,310 crowns and
       50,897 masses that is 6.5 M triangles if every one of them were in the
       frustum, and the frustum is what keeps it honest — see the layers. */
    expect(contactTris(CONTACT_SIDES_CROWN)).toBe(24);
    expect(contactTris(CONTACT_SIDES_MASS)).toBe(36);
  });

  it("winds every face upward, so a disc on the ground faces the camera", () => {
    /* the signed area in the x/z plane, with `y` up: a ring wound the other
       way is back-facing, and this material is DoubleSide so nothing on screen
       would say so — which is exactly why it is asserted here */
    const g = contactDisc({ sides: CONTACT_SIDES_CROWN });
    const pos = g.getAttribute("position").array as Float32Array;
    const idx = g.getIndex()!.array as ArrayLike<number>;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    let area = 0;
    for (let t = 0; t < idx.length; t += 3) {
      a.fromArray(pos, idx[t] * 3);
      b.fromArray(pos, idx[t + 1] * 3);
      c.fromArray(pos, idx[t + 2] * 3);
      /* the y component of (b - a) x (c - a); positive is counter-clockwise
         seen from above, which is what an up-facing triangle is */
      area += (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    }
    expect(area).toBeGreaterThan(0);
  });

  it("points every normal straight up, and does not compute them", () => {
    const n = attr(CONTACT_SIDES_CROWN, "normal");
    for (let v = 0; v < n.length / 3; v++) {
      expect(n[v * 3]).toBe(0);
      expect(n[v * 3 + 1]).toBe(1);
      expect(n[v * 3 + 2]).toBe(0);
    }
  });

  it("has no NaN anywhere in any attribute", () => {
    const g = contactDisc();
    for (const name of ["position", "color", "normal"]) {
      const arr = g.getAttribute(name).array as Float32Array;
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("the four ratios, against the reference's own two calls", () => {
  /*
   * `lib/city/trees.ts` §buildSpriteSheet, verbatim:
   *   a crown  ellipse(-R*0.30, AY - R*0.06, R*0.92, R*0.40)  alpha 0.20
   *   a mass   ellipse(-R*0.26, AY - R*0.30, R*1.02, R*0.44)  alpha 0.22
   * and `lib/city/streets.ts` §ST_KPROJ: world metres reach the screen at
   * 1.2247 across and 0.9306 at an unknown bearing. Every constant in
   * `contact-shadow.ts` is one of those numbers put through the other, so the
   * assertions below are the arithmetic and not a restatement of the answer.
   */
  it("converts a screen semi-major into a ground radius by the projection", () => {
    expect(CONTACT_SCREEN_TO_GROUND).toBeCloseTo(0.9306 / 1.2247, 6);
  });

  it("sizes a crown's disc at the reference's own 0.92 R", () => {
    expect(CONTACT_R_CROWN).toBeCloseTo(0.92 * CONTACT_SCREEN_TO_GROUND, 3);
  });

  it("sizes a mass's disc at the reference's own 1.02 R", () => {
    expect(CONTACT_R_MASS).toBeCloseTo(1.02 * CONTACT_SCREEN_TO_GROUND, 3);
  });

  it("leans by the mean of the reference's two across-screen offsets", () => {
    /* 0.30 of a crown's sprite radius and 0.26 of a mass's, expressed against
       each disc's OWN radius so one number serves both; the header shows the
       two land at 0.40 and 0.36 and the split is under 0.02 of a crown radius */
    expect(0.3 / CONTACT_R_CROWN).toBeCloseTo(0.43, 2);
    expect(0.26 / CONTACT_R_MASS).toBeCloseTo(0.34, 2);
    expect(CONTACT_LEAN).toBeGreaterThan(0.26 / CONTACT_R_MASS);
    expect(CONTACT_LEAN).toBeLessThan(0.3 / CONTACT_R_CROWN);
  });

  it("keeps a mass's disc INSIDE its dome in plan, as the reference does", () => {
    /* the mass's silhouette is `CANOPY_MASS_SPREAD` = 1.26 of `blobRadius` and
       its shadow 1.02 in the same unit, so the disc is 0.615 of the plan
       radius and what shows is the crescent the dome's own height leaves. A
       disc WIDER than its dome would be a saucer and not a shadow. */
    expect(CONTACT_R_MASS / 1.26).toBeCloseTo(0.615, 2);
    expect(CONTACT_R_MASS).toBeLessThan(1.26);
  });
});

describe("contactCentre", () => {
  it("leans the disc AWAY from the sun, not toward it", () => {
    const out: [number, number] = [0, 0];
    /* a sun bearing of +x: the shadow has to go to -x */
    contactCentre(100, 200, 10, 1, 0, out);
    expect(out[0]).toBeLessThan(100);
    expect(out[1]).toBeCloseTo(200, 6);
  });

  it("leans by the disc's own radius, so a big shadow leans further", () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, 0];
    contactCentre(0, 0, 10, 0, 1, a);
    contactCentre(0, 0, 20, 0, 1, b);
    expect(Math.hypot(a[0], a[1])).toBeCloseTo(10 * CONTACT_LEAN, 6);
    expect(Math.hypot(b[0], b[1])).toBeCloseTo(20 * CONTACT_LEAN, 6);
  });

  it("normalises the bearing, so a light vector's LENGTH cannot scale it", () => {
    /* `SUN_SCENE` is normalised in three dimensions, which means its
       horizontal part is NOT a unit vector — hand it through unnormalised and
       every shadow in the city leans by the sine of the sun's elevation */
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, 0];
    contactCentre(0, 0, 10, 0.24, 0.63, a);
    contactCentre(0, 0, 10, 2.4, 6.3, b);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(Math.hypot(a[0], a[1])).toBeCloseTo(10 * CONTACT_LEAN, 6);
  });

  it("puts the disc on the foot where nothing is casting", () => {
    const out: [number, number] = [0, 0];
    contactCentre(7, 9, 10, 0, 0, out);
    expect(out).toEqual([7, 9]);
  });
});

describe("contactMaterial", () => {
  it("blends rather than baking, because what is under it varies", () => {
    const m = contactMaterial("#3b3222", 0.22);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBeCloseTo(0.22, 6);
    expect(m.vertexColors).toBe(true);
    m.dispose();
  });

  it("writes NO depth, so a shadow can never occlude anything", () => {
    const m = contactMaterial("#3b3222", 0.2);
    expect(m.depthWrite).toBe(false);
    /* and it is still TESTED, which is what hides the middle of every disc
       under its own crown */
    expect(m.depthTest).toBe(true);
    m.dispose();
  });

  it("takes the rung after the last thing the ground draws", () => {
    /* `layers/streets.ts` §ONE DEPTH LADDER: 0 ground, -1 block tint, -2 right
       of way, -3 carriageway, -4 contrast, -5 kerbs, -6 crossings. A shadow
       falls across all of them, so it is -7 and the sign is what matters —
       a POSITIVE factor pushes a coplanar surface away and buries it. */
    expect(CONTACT_DEPTH).toBe(-7);
    const m = contactMaterial("#3b3222", 0.2);
    expect(m.polygonOffset).toBe(true);
    expect(m.polygonOffsetFactor).toBe(-7);
    expect(m.polygonOffsetUnits).toBe(-7);
    m.dispose();
  });

  it("is unlit, because brightening a shadow in the sun is backwards", () => {
    const m = contactMaterial("#3b3222", 0.2);
    expect(m.type).toBe("MeshBasicMaterial");
    m.dispose();
  });
});
