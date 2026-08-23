import { describe, expect, it } from "vitest";
import {
  CA,
  DEM_CELL_M,
  HIT_STEP_M,
  Projection,
  ROT_DEG,
  SA_DEFAULT,
  SA_FRAMING_FLOOR,
  SX,
  SY,
  ZEXB_DEFAULT,
  ZEX_BY_STEP,
  screenToPlane,
  type Plane,
} from "./projection";

/* A deterministic point cloud standing in for the published rings. The mock's
   own TI2 ran over every pre-projected ring vertex on the page; here the count
   is the same order and the generator is seeded, so a failure is reproducible
   without shipping 3 MB of footprints into a unit test. */
function points(n: number): Array<[number, number, number]> {
  let s = 0x2f6e2b1 >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Array<[number, number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = [
      (rnd() - 0.5) * 12000,
      (rnd() - 0.5) * 12000,
      rnd() * 280,
    ];
  }
  return out;
}

describe("the bearing", () => {
  it("is 315° — north is straight up and east is straight right", () => {
    const p = new Projection();
    expect(p.rotDeg).toBe(315);
    expect(ROT_DEG).toBe(315);
    const north = p.proj(0, 1, 0);
    const east = p.proj(1, 0, 0);
    // north moves the point straight UP the plane, and not sideways at all
    expect(north[0]).toBeCloseTo(0, 12);
    expect(north[1]).toBeCloseTo(Math.SQRT2 * SA_DEFAULT, 12);
    // east moves it straight ACROSS, unforeshortened up to one overall scale
    expect(east[0]).toBeCloseTo(Math.SQRT2 * CA, 12);
    expect(east[1]).toBeCloseTo(0, 12);
  });

  it("makes the projection axis-aligned: screen-x is world-x, screen-y is world-y", () => {
    const p = new Projection();
    expect(p.isAxisAligned()).toBe(true);
    // moving in y must not touch the projected x, at any x
    for (const x of [-5000, -13.5, 0, 271, 9000]) {
      const a = p.proj(x, -4000, 0)[0];
      for (const y of [-4000, -1, 0, 88, 6100]) {
        // absolute tolerance: these are metres, and 1e-9 m is not a pixel
        expect(Math.abs(p.proj(x, y, 0)[0] - a)).toBeLessThan(1e-9);
      }
    }
  });

  it("...so depth() reduces to world y, which is the axis everything marches along", () => {
    const p = new Projection();
    for (const y of [-3000, -12, 0, 44, 7000]) {
      const d = p.depth(0, y);
      expect(d).toBeCloseTo(Math.SQRT2 * y, 9);
      for (const x of [-9000, -3, 0, 17, 4200]) {
        expect(p.depth(x, y)).toBeCloseTo(d, 9);
      }
    }
  });

  it("...and a bearing of 135° is the wrong branch — it points north DOWN", () => {
    const p = new Projection({ rotDeg: 135 });
    expect(p.isAxisAligned()).toBe(true); // same equation, other root
    expect(p.proj(0, 1, 0)[1]).toBeLessThan(0);
  });

  it("is not axis-aligned at the rejected 210° camera", () => {
    expect(new Projection({ rotDeg: 210 }).isAxisAligned()).toBe(false);
  });
});

describe("the tilt", () => {
  // functional.py §32 TI1, verbatim.
  it("TI1 the tilt is a stated camera elevation, and the object's own dial is untouched by it", () => {
    const p = new Projection();
    expect(p.sA).toBeGreaterThan(0.3);
    expect(p.sA).toBeLessThan(0.5);
    expect(Math.abs(p.zexb - 1.6)).toBeLessThan(1e-9);
    const phi = p.elevationDeg();
    expect(phi).toBeGreaterThan(20);
    expect(phi).toBeLessThan(33);
    // sin φ = sA / cA, and the number the page states
    expect(phi).toBeCloseTo(29.01, 2);
  });

  // functional.py §32 TI2, verbatim. The mock ran it over every pre-projected
  // ring vertex on the page and required byte-identity, not closeness.
  it("TI2 the tilt cannot move a building sideways — screen x has no sA in it", () => {
    const pts = points(922_797);
    const p = new Projection();
    const before = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) before[i] = p.proj(pts[i][0], pts[i][1], pts[i][2])[0];
    p.setTilt(0.3);
    let bad = 0;
    for (let i = 0; i < pts.length; i++) {
      if (p.proj(pts[i][0], pts[i][1], pts[i][2])[0] !== before[i]) bad++;
    }
    expect(bad).toBe(0);
  });

  // functional.py §32 TI3, verbatim. There are no pre-projected tables in this
  // module — that is P3's business — so what is asserted here is the property
  // those tables depend on: the dial is restorable, exactly, so a sweep leaves
  // nothing behind.
  it("TI3 nothing on the page keeps a projection of its own — a round trip through another tilt restores every table exactly", () => {
    const pts = points(20_000);
    const p = new Projection();
    const snap = pts.map((q) => p.projb(q[0], q[1], q[2], 40));
    p.setTilt(0.31);
    p.setTilt(0.47);
    p.setTilt(SA_DEFAULT);
    let bad = 0;
    for (let i = 0; i < pts.length; i++) {
      const q = p.projb(pts[i][0], pts[i][1], pts[i][2], 40);
      if (q[0] !== snap[i][0] || q[1] !== snap[i][1]) bad++;
    }
    expect(bad).toBe(0);
  });

  it("...and every tilt change raises a rebuild, because every pre-projected table is a function of it", () => {
    const p = new Projection();
    const seen: string[] = [];
    const off = p.onRebuild((r) => seen.push(r));
    p.setTilt(0.33);
    p.setRotation(300);
    p.setBand(2);
    off();
    p.setTilt(0.44);
    expect(seen).toEqual(["tilt", "bearing", "band"]);
  });

  it("...but a BAND change moves ZEX only, so it is raised as its own reason", () => {
    const p = new Projection();
    const seen: string[] = [];
    p.onRebuild((r) => seen.push(r));
    p.setBand(1);
    expect(p.zex).toBe(ZEX_BY_STEP[1]);
    p.setBand(1); // idempotent — no spurious invalidation
    expect(seen).toEqual(["band"]);
  });

  it("sA sits above the framing floor — it is the deepest camera at which the city still fills its own frame", () => {
    // tilt/framing.py: the terrain box fills 0.828 of the stage at sA 0.50,
    // 0.738 at 0.42, and crosses functional.py §17's 0.72 bound at 0.4099.
    expect(SA_DEFAULT).toBeGreaterThan(SA_FRAMING_FLOOR);
    expect((SA_DEFAULT - SA_FRAMING_FLOOR) / SA_FRAMING_FLOOR).toBeGreaterThan(0.02);
  });

  it("ZEXB is ZEX_ART — the vertical the thirteen hand-drawn landmarks were drawn at", () => {
    // art/iso.py ZEX_ART, art/ART-SPEC.md §1.1. Moving it stretches every dome
    // in the authored set against the city around it.
    expect(ZEXB_DEFAULT).toBe(1.6);
    expect(new Projection().zexb).toBe(1.6);
  });

  it("keeps terrain and built height on separate dials, and lifts a roof UP the screen", () => {
    const p = new Projection();
    const ground = p.projb(100, 200, 0, 0);
    const roof = p.projb(100, 200, 0, 100);
    // proj adds height POSITIVELY on the plane; SY negates, so the roof is
    // higher on screen. Getting this sign wrong hung every building downwards.
    expect(roof[1] - ground[1]).toBeCloseTo(100 * ZEXB_DEFAULT, 9);
    const cam = { cx: 0, cy: 0, scale: 1 };
    expect(SY(roof, 800, cam)).toBeLessThan(SY(ground, 800, cam));
    // and terrain uses the other dial
    const hill = p.projb(100, 200, 100, 0);
    expect(hill[1] - ground[1]).toBeCloseTo(100 * ZEX_BY_STEP[0], 9);
  });
});

describe("no pixel floor", () => {
  // A pixel floor is a STEP IN THE FIRST DERIVATIVE and is what caused every
  // float and lurch bug in this project's history — the landmark sprite float,
  // the gszV zoom lurch that released at cam.scale 0.1087, strictly between two
  // presets so a wheel zoom passed straight through it. The projection is
  // linear, and this is what keeps it that way.
  it("built height is exactly linear — d(plane y)/dh is constant at ZEXB everywhere", () => {
    const p = new Projection();
    let worst = 0;
    let prev = p.projb(500, -700, 12, 0)[1];
    for (let h = 0.05; h <= 400; h += 0.05) {
      const y = p.projb(500, -700, 12, h)[1];
      worst = Math.max(worst, Math.abs((y - prev) / 0.05 - ZEXB_DEFAULT));
      prev = y;
    }
    expect(worst).toBeLessThan(1e-6);
  });
});

describe("the inverse", () => {
  it("round-trips: plane → ground → plane, at every band", () => {
    for (const zex of ZEX_BY_STEP) {
      const p = new Projection({ zex });
      for (const [x, y, z] of points(2000)) {
        const q = p.proj(x, y, z);
        const back = p.invAt(q[0], q[1], z);
        expect(back[0]).toBeCloseTo(x, 6);
        expect(back[1]).toBeCloseTo(y, 6);
      }
    }
  });

  it("round-trips through the screen too — SX/SY and screenToPlane are exact inverses", () => {
    const p = new Projection();
    const cam = { cx: 123.4, cy: -56.7, scale: 0.317 };
    const W = 1440;
    const H = 940;
    for (const [x, y, z] of points(500)) {
      const q: Plane = p.proj(x, y, z);
      const sx = SX(q, W, cam);
      const sy = SY(q, H, cam);
      const back = screenToPlane(sx, sy, W, H, cam);
      expect(back[0]).toBeCloseTo(q[0], 6);
      expect(back[1]).toBeCloseTo(q[1], 6);
    }
  });

  it("the coefficient form and the long-hand form are the same projection", () => {
    // Pre-projection loops use the coefficients; proj() is written out in full.
    // They must not drift apart.
    for (const rotDeg of [315, 210, 45, 0]) {
      const p = new Projection({ rotDeg });
      const c = p.coeffs();
      for (const [x, y, z] of points(400)) {
        const q = p.proj(x, y, z);
        expect(c.ax * x + c.ay * y).toBeCloseTo(q[0], 9);
        expect(c.bx * x + c.by * y + z * p.zex).toBeCloseTo(q[1], 9);
      }
    }
  });

  it("larger z is always nearer the camera — d(depth)/dz is negative at every bearing", () => {
    // This is why the hit test walks z DOWNWARD from above the terrain and
    // stops at the first crossing: the first crossing is the front-most piece
    // of ground on the line, which is the piece the reader can see.
    for (const rotDeg of [315, 210, 45]) {
      const p = new Projection({ rotDeg });
      const a0 = p.invAt(0, 0, 0);
      const a1 = p.invAt(0, 0, 1);
      expect(p.depth(a1[0], a1[1]) - p.depth(a0[0], a0[1])).toBeLessThan(0);
    }
  });
});

describe("the hit test's march step", () => {
  // functional.py §32 TI6, verbatim. The step was `const dz = 2`, and the
  // comment that justified it stated the real quantity — "2 m of z is 9.3 world
  // metres along the line at ZEX 3.3, well inside one 53.8 m raster cell".
  // 9.3 m is what mattered; 2 m of z is only what produced it AT ONE TILT AND
  // ONE ZEX. THE ACCURACY IS THE SAME UNDER BOTH RULES and this does not claim
  // otherwise: what is asserted is that a constant whose own justification is a
  // function of two art dials is no longer free to drift out of the range that
  // justification argued for when one of them moves.
  it("TI6 the hit test samples the ground at a fixed WORLD distance, well inside one DEM cell, at every zoom band and every tilt", () => {
    let worst = 0;
    for (const sA of [0.3, 0.42, 0.5]) {
      for (const zex of ZEX_BY_STEP) {
        const p = new Projection({ sA, zex });
        const { speed } = p.groundLineDir();
        worst = Math.max(worst, p.marchStepZ() * speed);
      }
    }
    expect(worst).toBeLessThan(DEM_CELL_M / 3);
    expect(worst).toBeCloseTo(HIT_STEP_M, 6);
  });

  it("...and the step in z MOVES when the dials move, which is the whole point", () => {
    const shallow = new Projection({ sA: 0.32 }).marchStepZ();
    const steep = new Projection({ sA: 0.5 }).marchStepZ();
    expect(shallow).not.toBeCloseTo(steep, 3);
    // the baked constant it replaced
    expect(shallow).not.toBe(2);
    expect(steep).not.toBe(2);
  });
});
