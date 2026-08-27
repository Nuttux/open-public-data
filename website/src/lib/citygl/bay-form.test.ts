import { describe, expect, it } from "vitest";

import {
  BAY_DEPTH_M,
  BAY_FILL,
  BAY_MAX,
  BAY_MIN_EDGE_M,
  bayCountOn,
  bayForm,
  type BayEdge,
  type BaySink,
} from "./bay-form";

/**
 * WHAT THIS TEST IS FOR.
 *
 * A bay is built by setting the wall BACK from the measured ring, and the
 * direction of "back" is a sign on a normal. Get that sign wrong and the
 * frontage grows 0.75 m OUTSIDE the survey instead of receding inside it —
 * which is the one thing this whole approach exists to avoid, and which looks
 * entirely plausible in a screenshot, because a stepped frontage reads as a
 * stepped frontage whichever way it steps.
 *
 * So the sign is not looked at. Every vertex the builder places off the ring
 * is tested for being strictly INSIDE the footprint, by a point-in-polygon
 * that knows nothing about how the builder computed anything.
 *
 * The refusals are checked as hard as the geometry, with one property running
 * through all of them: a refusal must leave the sink untouched. A builder that
 * emits four vertices and then declines has already corrupted the mesh.
 */

/** a sink that records what it was handed */
function rec(): BaySink & { xs: number[]; ys: number[]; hs: number[]; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const hs: number[] = [];
  return {
    xs, ys, hs,
    get n() { return xs.length; },
    vertexUV(x, y, _elevM, hM) {
      xs.push(x);
      ys.push(y);
      hs.push(hM);
      return xs.length - 1;
    },
  };
}

/** counts quads without caring what is in them */
function quads(): { fn: (a: number, b: number, c: number, d: number) => void; n: number } {
  const o = { n: 0, fn: () => {} };
  o.fn = () => { o.n++; };
  return o;
}

/** winding-agnostic point in polygon — the ray-crossing rule */
function inside(px: number, py: number, xs: readonly number[], ys: readonly number[]): boolean {
  let hit = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (
      ys[i] > py !== ys[j] > py &&
      px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]
    ) {
      hit = !hit;
    }
  }
  return hit;
}

/**
 * THE TWO CORNER RETURNS END ON THE NEIGHBOURING EDGE, AND THAT IS THE POINT.
 *
 * The set-back wall runs the full width of the frontage, so its two ends sit
 * exactly ON the ring — at the corner, at the recess depth, which is where the
 * adjacent wall picks the surface up. A strict point-in-polygon calls a point
 * on the boundary "outside", so those two are checked as being on the boundary
 * rather than being fed to a rule that was never about them.
 */
function onRingBoundary(px: number, x0: number, x1: number): boolean {
  return Math.abs(px - x0) < 1e-9 || Math.abs(px - x1) < 1e-9;
}

/** a 20 m square, counter-clockwise, with its south edge as the frontage */
const SQ = { x: [0, 20, 20, 0], y: [0, 0, 20, 20] };

/**
 * The south edge runs west to east (0,0) -> (20,0). The footprint is to the
 * NORTH of it, so "into the building" is +y. This is stated here rather than
 * derived, so that a builder that flips it fails against a fixed expectation
 * instead of against its own arithmetic.
 */
function southEdge(over: Partial<BayEdge> = {}): BayEdge {
  return {
    ax: 0, ay: 0, bx: 20, by: 0,
    nx: 0, ny: 1,
    elevM: 12, wallH: 9,
    cBot: [0.4, 0.4, 0.4], cTop: [0.6, 0.6, 0.6],
    u0: 0, moduleM: 4, vTop: 3,
    footA: 1000, footB: 1001, topA: 1002, topB: 1003,
    ...over,
  };
}

describe("bayCountOn", () => {
  it("spans BAY_MODULE_MULT window modules a bay, not one", () => {
    /* 20 m on a 4 m window module is five WINDOW modules and therefore two
       and a half bay spans — a bay is not a window */
    expect(bayCountOn(20, 4)).toBe(3);
    expect(bayCountOn(9.3, 3.1)).toBe(2);
    /* and the standard 25 ft San Francisco lot gets exactly one */
    expect(bayCountOn(7.62, 3.1)).toBe(1);
  });

  it("refuses a frontage under BAY_MIN_EDGE_M", () => {
    expect(bayCountOn(BAY_MIN_EDGE_M - 0.01, 3.1)).toBe(0);
    expect(bayCountOn(BAY_MIN_EDGE_M + 0.01, 3.1)).toBeGreaterThan(0);
  });

  it("never returns more than BAY_MAX, however long the wall", () => {
    expect(bayCountOn(400, 3.1)).toBe(BAY_MAX);
  });

  it("gives a wall at least one bay once it is long enough", () => {
    /* a 6 m frontage on an 8 m industrial module rounds to zero, and a
       frontage that passed the length gate must not then get no bays */
    expect(bayCountOn(6, 8)).toBe(1);
  });
});

describe("bayForm", () => {
  it("sets the wall back INSIDE the measured footprint, never outside", () => {
    const s = rec();
    const q = quads();
    expect(bayForm(s, q.fn, southEdge())).toBe(true);
    /* every vertex the builder made is either ON the ring's own edge (the bay
       faces) or strictly inside the footprint (everything set back) */
    let onRing = 0;
    let within = 0;
    for (let i = 0; i < s.n; i++) {
      if (Math.abs(s.ys[i]) < 1e-9) onRing++;
      else if (!onRingBoundary(s.xs[i], 0, 20)) {
        expect(inside(s.xs[i], s.ys[i], SQ.x, SQ.y)).toBe(true);
        within++;
      }
    }
    expect(onRing).toBeGreaterThan(0);
    expect(within).toBeGreaterThan(0);
    /* and nothing at all landed on the wrong side of the frontage */
    expect(Math.min(...s.ys)).toBe(0);
    expect(Math.max(...s.ys)).toBeCloseTo(BAY_DEPTH_M, 9);
  });

  it("puts the bay faces on the ring and the recess exactly BAY_DEPTH_M in", () => {
    const s = rec();
    expect(bayForm(s, quads().fn, southEdge())).toBe(true);
    const depths = new Set(s.ys.map((v) => Math.round(v * 1e6) / 1e6));
    expect([...depths].sort((a, b) => a - b)).toEqual([0, BAY_DEPTH_M]);
  });

  it("builds each bay at BAY_FILL of its bay span", () => {
    const s = rec();
    /* 20 m on a 4 m window module is three bays over 20/3 m each */
    expect(bayForm(s, quads().fn, southEdge())).toBe(true);
    const faces = [...new Set(s.xs.filter((_, i) => s.ys[i] === 0 && s.hs[i] === 0))].sort(
      (a, b) => a - b,
    );
    expect(faces.length).toBe(6); // three bays, two ends each
    for (let j = 0; j < 3; j++) {
      expect(faces[j * 2 + 1] - faces[j * 2]).toBeCloseTo((20 / 3) * BAY_FILL, 9);
    }
  });

  it("emits the wall, both corner returns and four quads a bay", () => {
    const q = quads();
    expect(bayForm(rec(), q.fn, southEdge())).toBe(true);
    /* 1 set-back wall + 2 returns + 4 per bay x 3 bays */
    expect(q.n).toBe(1 + 2 + 4 * 3);
  });

  it("carries the wall's own foot and head heights, and nothing between", () => {
    const s = rec();
    expect(bayForm(s, quads().fn, southEdge({ wallH: 9 }))).toBe(true);
    expect([...new Set(s.hs)].sort((a, b) => a - b)).toEqual([0, 9]);
  });

  it("works the same on a clockwise ring, given that ring's own normal", () => {
    /* the caller derives the normal from the shoelace sign; here the same
       frontage is walked the other way and handed the normal that follows */
    const s = rec();
    expect(bayForm(s, quads().fn, southEdge({
      ax: 20, ay: 0, bx: 0, by: 0, nx: 0, ny: 1,
    }))).toBe(true);
    for (let i = 0; i < s.n; i++) {
      if (Math.abs(s.ys[i]) > 1e-9 && !onRingBoundary(s.xs[i], 0, 20)) {
        expect(inside(s.xs[i], s.ys[i], SQ.x, SQ.y)).toBe(true);
      }
    }
    /* and the recess still went the one way that matters */
    expect(Math.min(...s.ys)).toBe(0);
  });

  describe("refuses, and leaves the sink untouched", () => {
    const refused: [string, Partial<BayEdge>][] = [
      ["a frontage under the length gate", { bx: BAY_MIN_EDGE_M - 0.5 }],
      ["a wall shorter than twice the recess", { wallH: BAY_DEPTH_M * 2 }],
      ["an edge of no length at all", { bx: 0, by: 0 }],
      ["a module that is not a module", { moduleM: 0 }],
    ];
    for (const [why, over] of refused) {
      it(why, () => {
        const s = rec();
        const q = quads();
        expect(bayForm(s, q.fn, southEdge(over))).toBe(false);
        expect(s.n).toBe(0);
        expect(q.n).toBe(0);
      });
    }
  });

  it("reuses the ring's own vertices for the corners", () => {
    /* the returns must close onto the survey's corner, not onto a copy of it
       — a copy would be a seam that the ink outline draws over */
    const seen: number[] = [];
    const e = southEdge();
    expect(bayForm(rec(), (a, b, c, d) => { seen.push(a, b, c, d); }, e)).toBe(true);
    for (const v of [e.footA, e.footB, e.topA, e.topB]) {
      expect(seen).toContain(v);
    }
  });
});
