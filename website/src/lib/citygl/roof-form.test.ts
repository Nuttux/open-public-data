import { describe, expect, it } from "vitest";

import { DE, PITCH_MAX_HALFRISE_M, PITCH_RUN } from "@/lib/city/roofs";
import {
  capForm,
  DECK_AO_M,
  DECK_AO_V,
  gableForm,
  stepForm,
  gableHalf,
  gablePlan,
  EAVE_FASCIA_M,
  HOUSE_MAX_HALFRISE_M,
  PARTY_EAVE_M,
  corniceProjM,
  FORM_MAX_VERTS,
  HIP_MAX_VERTS,
  hipForm,
  hipPlan,
  shadeRGB,
  trayForm,
  type FormRing,
  type FormSink,
} from "./roof-form";

/**
 * WHAT THIS TEST IS FOR.
 *
 * A roof form is geometry, and geometry that is nearly right looks right in a
 * screenshot: a deck inset 0.3 m instead of 0.4, a ridge a third too low, a
 * cap that quietly threw away a third of the volume it was derived from. None
 * of those is visible by eye at any zoom this renderer has, and all three are
 * one number in a builder. So the numbers are checked here rather than looked
 * at later.
 *
 * The refusals are checked at least as hard as the geometry, and one property
 * runs through all of them: **a refusal must leave the sink untouched**. A
 * sink is append-only, so a builder that wrote half a tray before deciding it
 * could not finish would leave a corrupt mesh the caller cannot roll back —
 * and the flat roof it was supposed to fall back to would have a bowtie
 * hanging under it.
 */

interface Rec {
  sink: FormSink;
  x: number[];
  y: number[];
  h: number[];
  elev: number[];
  col: [number, number, number][];
  tris: [number, number, number][];
}

function recorder(): Rec {
  const r: Rec = {
    x: [], y: [], h: [], elev: [], col: [], tris: [],
    sink: {
      vertex(x, y, elevM, hM, cr, cg, cb) {
        r.x.push(x);
        r.y.push(y);
        r.h.push(hM);
        r.elev.push(elevM);
        r.col.push([cr, cg, cb]);
        return r.x.length - 1;
      },
      tri(a, b, c) {
        r.tris.push([a, b, c]);
      },
    },
  };
  return r;
}

function ring(pts: readonly (readonly [number, number])[]): FormRing {
  const x = new Float32Array(pts.length);
  const y = new Float32Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    x[k] = pts[k][0];
    y[k] = pts[k][1];
  }
  return { x, y, off: 0, n: pts.length };
}

/** a rectangle centred on the origin, wound counter-clockwise */
function rect(w: number, d: number): FormRing {
  return ring([
    [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
  ]);
}

/** the same ring, rotated — San Francisco's grid is not axis-aligned and a
 *  test plan that is proves nothing about a roof built on a real footprint */
function turned(r: FormRing, deg: number): FormRing {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const x = new Float32Array(r.n), y = new Float32Array(r.n);
  for (let k = 0; k < r.n; k++) {
    const px = r.x[r.off + k], py = r.y[r.off + k];
    x[k] = px * c - py * s; y[k] = px * s + py * c;
  }
  return { x, y, off: 0, n: r.n };
}

/** a regular n-gon, which is the cheapest way to a long ring */
function ngon(n: number, rad: number): FormRing {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const th = (Math.PI * 2 * k) / n;
    pts.push([rad * Math.cos(th), rad * Math.sin(th)]);
  }
  return ring(pts);
}

function sameColour(a: readonly number[], b: readonly number[]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
}

/**
 * ONE SURFACE MAY BE MORE THAN ONE COLOUR.
 *
 * The deck used to be a single flat fill and `planAreaOf(deckC)` was the
 * whole of it. It is now two bands — the parapet's shadow at its foot and the
 * open field inside that — so the surface's own invariants (its inset, its
 * area, that it closes) are properties of the UNION, and a helper that
 * matches one colour measures the field alone and reports the deck as too
 * small. These take a set, and a triangle counts when every one of its three
 * vertices carries some colour in it — which is what "this triangle is part
 * of that surface" means once the surface has a gradient across it.
 */
/** the deck's two bands: the parapet's shadow at its foot, and the field */
function deckColours(roof: readonly [number, number, number]): [number, number, number][] {
  const deckC = shadeRGB(roof, DE.deckv);
  return [deckC, shadeRGB(deckC, DECK_AO_V)];
}

function inSet(c: readonly number[], cols: readonly (readonly number[])[]): boolean {
  return cols.some((k) => sameColour(c, k));
}

/** the total plan area of the triangles whose three vertices all carry `col` */
function planAreaOf(r: Rec, col: readonly number[] | readonly (readonly number[])[]): number {
  const cols = (Array.isArray(col[0]) ? col : [col]) as readonly (readonly number[])[];
  let a = 0;
  for (const [i, j, k] of r.tris) {
    if (!inSet(r.col[i], cols) || !inSet(r.col[j], cols) || !inSet(r.col[k], cols)) continue;
    a += Math.abs(
      (r.x[j] - r.x[i]) * (r.y[k] - r.y[i]) - (r.y[j] - r.y[i]) * (r.x[k] - r.x[i]),
    ) / 2;
  }
  return a;
}

/**
 * Is the set of triangles carrying `col` a CLOSED surface patch — every
 * interior edge shared by exactly two triangles, every boundary vertex used by
 * exactly two boundary edges? That is what "the deck is closed" means, and it
 * is what a fan over a concave ring fails.
 */
function boundaryLoop(r: Rec, col: readonly number[] | readonly (readonly number[])[]): number[] {
  const cols = (Array.isArray(col[0]) ? col : [col]) as readonly (readonly number[])[];
  const seen = new Map<string, number>();
  for (const [i, j, k] of r.tris) {
    if (!inSet(r.col[i], cols) || !inSet(r.col[j], cols) || !inSet(r.col[k], cols)) continue;
    for (const [a, b] of [[i, j], [j, k], [k, i]] as const) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const use = new Map<number, number>();
  const boundary: string[] = [];
  for (const [key, n] of seen) {
    expect(n, `edge ${key} shared by ${n} triangles`).toBeLessThanOrEqual(2);
    if (n !== 1) continue;
    boundary.push(key);
    for (const s of key.split(":")) {
      const v = Number(s);
      use.set(v, (use.get(v) ?? 0) + 1);
    }
  }
  for (const [v, n] of use) expect(n, `vertex ${v} on ${n} boundary edges`).toBe(2);
  return [boundary.length, use.size];
}

// ── the tray ────────────────────────────────────────────────────────────────

describe("trayForm", () => {
  const H = 8;

  it("insets the deck by the declared thickness and drops it by the declared parapet", () => {
    const r = recorder();
    expect(trayForm(r.sink, rect(20, 20), 12, H, [0.5, 0.5, 0.5])).toBe(true);

    const deckH = H - DE.parapet;
    const low = r.h.map((h, i) => [h, i] as const).filter(([h]) => Math.abs(h - deckH) < 1e-6);
    expect(low.length).toBeGreaterThan(0);
    /* the deck plane carries TWO rings: its outer edge at the parapet's inner
       face, and the inner edge of the shadow that parapet casts on it */
    const edge = 10 - DE.thick, field = 10 - DE.thick - DECK_AO_M;
    for (const [, i] of low) {
      const ax = Math.abs(r.x[i]), ay = Math.abs(r.y[i]);
      expect(Math.min(Math.abs(ax - edge), Math.abs(ax - field))).toBeLessThan(1e-5);
      expect(Math.min(Math.abs(ay - edge), Math.abs(ay - field))).toBeLessThan(1e-5);
    }
    // F2.4, made strictly stronger: the coping sits AT the published height and
    // NO vertex of the roof stands above the measured top.
    for (const h of r.h) expect(h).toBeLessThanOrEqual(H + 1e-9);
    expect(Math.max(...r.h)).toBeCloseTo(H, 6);
  });

  it("closes the deck, and its area is the inset square's", () => {
    const r = recorder();
    const roof: [number, number, number] = [0.5, 0.4, 0.3];
    expect(trayForm(r.sink, rect(20, 20), 0, H, roof)).toBe(true);
    const deck = deckColours(roof);
    const side = 2 * (10 - DE.thick);
    expect(planAreaOf(r, deck)).toBeCloseTo(side * side, 4);
    const [edges, verts] = boundaryLoop(r, deck);
    expect(edges).toBe(4);
    expect(verts).toBe(4);
  });

  it("closes the deck of a CONCAVE plan, where a fan would span the notch", () => {
    // an L: a fan from vertex 0 lays a triangle across the missing quadrant
    const r = recorder();
    const roof: [number, number, number] = [0.5, 0.4, 0.3];
    const L = ring([
      [0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20],
    ]);
    expect(trayForm(r.sink, L, 0, H, roof)).toBe(true);
    const deck = deckColours(roof);
    const t = DE.thick;
    // the L, offset inward by `t` on every edge: 20x8 + 8x12 shrinks by t all round
    const want = (20 - 2 * t) * (8 - 2 * t) + (8 - 2 * t) * (20 - 8);
    expect(planAreaOf(r, deck)).toBeCloseTo(want, 3);
    const [edges, verts] = boundaryLoop(r, deck);
    expect(edges).toBe(6);
    expect(verts).toBe(6);
  });

  /* ── THE FASCIA ────────────────────────────────────────────────────────
     The band is the one thing in the tray that stands OUTSIDE the plan, and
     a sign error on the miter would put it inside — where it would be hidden
     by the wall in every frame and would look, from a screenshot, like a
     fascia that simply is not drawn. So the sign is asserted, not eyeballed. */
  it("builds the fascia OUTSIDE the plan, a parapet tall, at the declared value", () => {
    const r = recorder();
    const roof: [number, number, number] = [0.5, 0.4, 0.3];
    expect(trayForm(r.sink, rect(20, 20), 5, H, roof, { fascia: true })).toBe(true);

    const want = shadeRGB(roof, DE.outerv);
    const band = r.col
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.every((v, k) => Math.abs(v - want[k]) < 1e-9))
      .map(([, i]) => i);
    /* THREE rings of four now, not two: the band became a CORNICE, and the
       third ring is the soffit that closes its underside. `roof-form.ts`
       §CORNICE_PROJ_M has the argument. */
    expect(band.length).toBe(12);
    for (const i of band) expect(r.elev[i]).toBe(5);

    /* Eight of the twelve stand `CORNICE_PROJ_M` OUTSIDE the plan — the
       cornice's own face, head and foot. A sign error here would put the
       cornice inside the wall, where it is hidden in every frame and looks,
       from a screenshot, exactly like a cornice that is not drawn. That is
       not hypothetical: it is what shipped for one commit, because the offset
       and the winding were BOTH passed wrong and cancelled into a silent
       refusal that left this assertion passing at the old position. */
    const out = band.filter((i) => Math.abs(r.x[i]) > 10 + 1e-6);
    expect(out.length).toBe(8);
    for (const i of out) {
      expect(Math.abs(r.x[i])).toBeCloseTo(10 + corniceProjM(H), 6);
      expect(Math.abs(r.y[i])).toBeCloseTo(10 + corniceProjM(H), 6);
    }

    /* and the other four sit EXACTLY on the plan: the soffit meets the wall
       it grows out of. Off by any amount and the cornice either floats clear
       of the building — a gap a reader can see straight through at this
       bearing — or buries its inner edge in the wall. */
    const inn = band.filter((i) => Math.abs(r.x[i]) <= 10 + 1e-6);
    expect(inn.length).toBe(4);
    for (const i of inn) {
      expect(Math.abs(r.x[i])).toBeCloseTo(10, 6);
      expect(Math.abs(r.y[i])).toBeCloseTo(10, 6);
      expect(r.h[i]).toBeCloseTo(H - DE.parapet, 9);
    }
    // and it spans exactly the declared parapet, head at the published top
    const hs = [...new Set(band.map((i) => Number(r.h[i].toFixed(9))))].sort((a, b) => a - b);
    expect(hs).toEqual([Number((H - DE.parapet).toFixed(9)), H]);
  });

  it("does not build the fascia unless it is asked for", () => {
    const roof: [number, number, number] = [0.5, 0.4, 0.3];
    const want = shadeRGB(roof, DE.outerv);
    const has = (r: Rec): boolean =>
      r.col.some((c) => c.every((v, k) => Math.abs(v - want[k]) < 1e-9));
    const off = recorder();
    expect(trayForm(off.sink, rect(20, 20), 0, H, roof)).toBe(true);
    expect(has(off)).toBe(false);
    const on = recorder();
    expect(trayForm(on.sink, rect(20, 20), 0, H, roof, { fascia: true })).toBe(true);
    expect(has(on)).toBe(true);
    /* and it is exactly THREE rings and two quads an edge more. This guard is
       the reason the cornice is the coping ring moved outward rather than a
       slab hung outside it: the slab wanted three NEW rings and six triangles
       an edge on all 151,379 flat roofs, and this way the only new surface is
       the soffit. Retargeted from 8/8, not widened — a cornice that quietly
       doubled the tray is still the thing this test exists to catch. */
    expect(on.x.length - off.x.length).toBe(12);
    expect(on.tris.length - off.tris.length).toBe(16);
  });

  it("oversails the wall with the coping itself, so the silhouette changes", () => {
    /* THE PROPERTY THE CORNICE EXISTS FOR, and neither test above catches it.
       Both of those are about the fascia band's own vertices; this is about
       the COPING — the raw-coloured band at the published top, which is the
       edge a reader actually sees against the sky. If the cornice were built
       as a separate slab and the coping left on the plan, every assertion
       above would still pass and the building's outline would be unchanged,
       which is the whole complaint. */
    const r = recorder();
    const roof: [number, number, number] = [0.5, 0.4, 0.3];
    expect(trayForm(r.sink, rect(20, 20), 0, H, roof, { fascia: true })).toBe(true);
    const coping = r.col
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.every((v, k) => Math.abs(v - roof[k]) < 1e-9))
      .map(([, i]) => i)
      .filter((i) => Math.abs(r.h[i] - H) < 1e-9);
    /* its outer edge is a cornice's projection clear of the plan */
    const far = coping.filter((i) => Math.abs(r.x[i]) > 10 + 1e-6);
    expect(far.length).toBe(4);
    for (const i of far) {
      expect(Math.abs(r.x[i])).toBeCloseTo(10 + corniceProjM(H), 6);
    }
    /* and nothing is built above the published height, which is the promise
       `trayForm` makes and the cornice must not break */
    for (const h of r.h) expect(h).toBeLessThanOrEqual(H + 1e-9);
  });

  it("carries the ramp weight into BOTH the inset and the drop, with no floor", () => {
    const r = recorder();
    expect(trayForm(r.sink, rect(20, 20), 0, H, [0.5, 0.5, 0.5], { w: 0.5 })).toBe(true);
    const deckH = H - DE.parapet * 0.5;
    const low = r.h.filter((h) => Math.abs(h - deckH) < 1e-6);
    expect(low.length).toBeGreaterThan(0);
    const inner = r.h
      .map((h, i) => [h, i] as const)
      .filter(([h]) => Math.abs(h - deckH) < 1e-6)
      .map(([, i]) => Math.abs(r.x[i]));
    /* the ramp scales the parapet's SHADOW too, and it has to: the band's
       width is the parapet's own height, so a parapet drawn at half weight
       casts half the band. Both rings on the deck plane, and nothing between. */
    const edge = 10 - DE.thick * 0.5;
    const field = edge - DECK_AO_M * 0.5;
    for (const v of inner) {
      expect(Math.min(Math.abs(v - edge), Math.abs(v - field))).toBeLessThan(1e-5);
    }
    expect(inner.some((v) => Math.abs(v - edge) < 1e-5)).toBe(true);
    expect(inner.some((v) => Math.abs(v - field) < 1e-5)).toBe(true);
  });

  it("refuses, and leaves the sink untouched", () => {
    for (const [why, run] of [
      ["a ring longer than the scratch", (s: FormSink) =>
        trayForm(s, ngon(FORM_MAX_VERTS + 1, 30), 0, H, [0.5, 0.5, 0.5])],
      ["fewer than three vertices", (s: FormSink) =>
        trayForm(s, ring([[0, 0], [10, 0]]), 0, H, [0.5, 0.5, 0.5])],
      ["a closed ramp", (s: FormSink) =>
        trayForm(s, rect(20, 20), 0, H, [0.5, 0.5, 0.5], { w: 0 })],
      ["a parapet taller than the building", (s: FormSink) =>
        trayForm(s, rect(20, 20), 0, DE.parapet * 0.5, [0.5, 0.5, 0.5])],
      ["an inset that eats the plan", (s: FormSink) =>
        trayForm(s, rect(0.5, 20), 0, H, [0.5, 0.5, 0.5])],
      ["a degenerate ring", (s: FormSink) =>
        trayForm(s, ring([[0, 0], [0, 0], [0, 0], [0, 0]]), 0, H, [0.5, 0.5, 0.5])],
    ] as const) {
      const r = recorder();
      expect(run(r.sink), why).toBe(false);
      expect(r.x.length, `${why}: wrote ${r.x.length} vertices`).toBe(0);
      expect(r.tris.length, why).toBe(0);
    }
  });

  it("still builds the 64-vertex ring the scratch is sized for", () => {
    const r = recorder();
    expect(trayForm(r.sink, ngon(FORM_MAX_VERTS, 30), 0, H, [0.5, 0.5, 0.5])).toBe(true);
    /* SIX rings, not five: the deck's own inner edge is the sixth — see
       `trayForm` §THE PARAPET THROWS A SHADOW. The point of the assertion is
       unchanged, that the scratch is sized for the longest ring this file
       accepts and every ring of it is built. */
    expect(r.x.length).toBe(FORM_MAX_VERTS * 6);
  });
});

// ── the hip ─────────────────────────────────────────────────────────────────

describe("hipForm", () => {
  const H = 6;

  it("takes the run off the plan and the rise off the declared pitch", () => {
    // 10 x 20: area/per = 3.333, and only the 1.3 multiplier survives the
    // inradius of 5 — 1.95 and 1.6 turn the offset ring inside out.
    const plan = hipPlan(rect(10, 20));
    expect(plan).not.toBeNull();
    const run = (200 / 60) * 1.3;
    expect(plan!.runM).toBeCloseTo(run, 5);
    expect(plan!.halfRiseM).toBeCloseTo(run / PITCH_RUN / 2, 5);
    expect(plan!.halfRiseM).toBeLessThanOrEqual(PITCH_MAX_HALFRISE_M);
  });

  it("takes the rise off a MEASURED slope when the scan has one", () => {
    /* the plan still owns the horizontal geometry; only the angle changes.
       rise = run * tan(theta), so half = run * tan(theta) / 2. */
    const run = (200 / 60) * 1.3;
    for (const deg of [12, 22, 35]) {
      const plan = hipPlan(rect(10, 20), deg);
      expect(plan).not.toBeNull();
      expect(plan!.runM).toBeCloseTo(run, 5);
      /* ...and the ceiling still applies over it: 35 degrees on this plan
         wants 1.517 m of half-rise and the cap allows 1.3. */
      expect(plan!.halfRiseM).toBeCloseTo(
        Math.min((run * Math.tan((deg * Math.PI) / 180)) / 2,
                 PITCH_MAX_HALFRISE_M), 5,
      );
    }
  });

  it("a measured slope still moves both ends of F2.4 together", () => {
    /* the whole reason a pitched cap is allowed: the drawn surface's median
       must remain the published median, whoever chose the angle. */
    const plan = hipPlan(rect(10, 20), 28)!;
    const r = recorder();
    expect(hipForm(r.sink, rect(10, 20), 30, H, [0.4, 0.4, 0.4],
                   { slopeDeg: 28 })).toBe(true);
    expect(Math.min(...r.h)).toBeCloseTo(H - plan.halfRiseM, 6);
    expect(Math.max(...r.h)).toBeCloseTo(H + plan.halfRiseM, 6);
  });

  it("clamps a measured slope at 60 degrees and at the half-rise ceiling", () => {
    /* `roofscan` already refuses over 60 — the cell at a footprint's edge
       straddles roof and pavement and differentiates to near-vertical — and
       this is the second net under it. */
    const steep = hipPlan(rect(10, 20), 89)!;
    const sixty = hipPlan(rect(10, 20), 60)!;
    expect(steep.halfRiseM).toBeCloseTo(sixty.halfRiseM, 6);
    expect(hipPlan(rect(60, 60), 45)!.halfRiseM).toBe(PITCH_MAX_HALFRISE_M);
  });

  it("caps the half-rise on a large plan, so a corner store is not a barn", () => {
    const plan = hipPlan(rect(60, 60));
    expect(plan).not.toBeNull();
    // the plan supports 29.25 / 2.4 / 2 = 6.09 m of half-rise; it gets 1.3
    expect(plan!.runM / PITCH_RUN / 2).toBeGreaterThan(PITCH_MAX_HALFRISE_M);
    expect(plan!.halfRiseM).toBe(PITCH_MAX_HALFRISE_M);
  });

  it("hangs the eave below the published plane and the apex the same distance above", () => {
    const r = recorder();
    const plan = hipPlan(rect(10, 20))!;
    expect(hipForm(r.sink, rect(10, 20), 30, H, [0.4, 0.4, 0.4])).toBe(true);
    const half = plan.halfRiseM;
    expect(Math.min(...r.h)).toBeCloseTo(H - half, 6);
    expect(Math.max(...r.h)).toBeCloseTo(H + half, 6);
    /* THE STATISTIC THE ROOF IS DRAWN FROM DOES NOT MOVE: the published median
       is mid-slope on a pitched surface, so the eave drops by exactly what the
       apex rises. */
    expect(Math.max(...r.h) - H).toBeCloseTo(H - Math.min(...r.h), 9);

    // the ridge platform is the plan offset by the run, and it is FILLED
    const apex = r.h.map((h, i) => [h, i] as const).filter(([h]) => h > H);
    expect(apex.length).toBe(4);
    for (const [, i] of apex) {
      expect(Math.abs(r.x[i])).toBeCloseTo(5 - plan.runM, 4);
      expect(Math.abs(r.y[i])).toBeCloseTo(10 - plan.runM, 4);
    }
    // four slopes of two triangles, plus two for the ridge
    expect(r.tris.length).toBe(4 * 2 + 2);
  });

  it("lets a long plan collapse its own ridge onto the centreline", () => {
    /* THE PLAN DECIDES, AND NOTHING ELSE DOES. `area / perimeter` tends to the
       inradius as a plan gets longer, so a 6 x 600 strip takes the 1.0
       multiplier and its offset ring lands 3 cm off its own centreline: a
       gable with hipped ends, arrived at by arithmetic rather than by a flag.
       A 10 x 20 house on the same code keeps a 1.3 m ridge platform. */
    const r = recorder();
    const plan = hipPlan(rect(6, 600))!;
    expect(plan.runM).toBeCloseTo(3600 / 1212, 5);
    expect(hipForm(r.sink, rect(6, 600), 0, H, [0.4, 0.4, 0.4])).toBe(true);
    const apexX = r.h
      .map((h, i) => [h, i] as const)
      .filter(([h]) => h > H)
      .map(([, i]) => Math.abs(r.x[i]));
    for (const x of apexX) expect(x).toBeLessThan(0.05);
    expect(r.tris.length).toBe(8 + 2);
  });

  it("refuses, and leaves the sink untouched", () => {
    const roof: [number, number, number] = [0.4, 0.4, 0.4];
    for (const [why, run] of [
      ["a plan of more than twelve vertices", (s: FormSink) =>
        hipForm(s, ngon(HIP_MAX_VERTS + 1, 8), 0, H, roof)],
      ["fewer than three vertices", (s: FormSink) =>
        hipForm(s, ring([[0, 0], [8, 0]]), 0, H, roof)],
      ["a degenerate plan", (s: FormSink) =>
        hipForm(s, ring([[0, 0], [0, 0], [0, 0]]), 0, H, roof)],
      ["a rise under the caller's own floor", (s: FormSink) =>
        hipForm(s, rect(10, 20), 0, H, roof, { minRiseM: 4 })],
      ["an eave below the ground", (s: FormSink) =>
        hipForm(s, rect(60, 60), 0, 1, roof)],
    ] as const) {
      const r = recorder();
      expect(run(r.sink), why).toBe(false);
      expect(r.x.length, `${why}: wrote ${r.x.length} vertices`).toBe(0);
      expect(r.tris.length, why).toBe(0);
    }
  });

  it("refuses at thirteen vertices where the tray still builds", () => {
    const thirteen = ngon(HIP_MAX_VERTS + 1, 12);
    expect(hipPlan(thirteen)).toBeNull();
    const r = recorder();
    expect(trayForm(r.sink, thirteen, 0, H, [0.4, 0.4, 0.4])).toBe(true);
  });

  it("survives a concave plan, which is where refusing outright was wrong", () => {
    const L = ring([[0, 0], [16, 0], [16, 7], [7, 7], [7, 16], [0, 16]]);
    const plan = hipPlan(L);
    expect(plan).not.toBeNull();
    const r = recorder();
    expect(hipForm(r.sink, L, 0, H, [0.4, 0.4, 0.4])).toBe(true);
    // and the offset ring did not bowtie: every offset edge runs the way its
    // plan edge ran, which is what the builder tested before it wrote anything
    const apex = r.h.map((h, i) => [h, i] as const).filter(([h]) => h > H).map(([, i]) => i);
    expect(apex.length).toBe(6);
    let a2 = 0;
    for (let k = 0; k < apex.length; k++) {
      const k1 = (k + 1) % apex.length;
      a2 += r.x[apex[k]] * r.y[apex[k1]] - r.x[apex[k1]] * r.y[apex[k]];
    }
    expect(a2).toBeGreaterThan(0);
  });
});

// ── the published second solid ──────────────────────────────────────────────

describe("capForm", () => {
  const BASE = 15.2;
  const TOP = 71.4;
  const roof: [number, number, number] = [0.5, 0.5, 0.5];

  it("stands on the plane already drawn and reaches the measured top", () => {
    const r = recorder();
    expect(capForm(r.sink, { cx: 100, cy: -50, baseM: BASE, topM: TOP, rad: 6, ang: 0.3 }, 20, roof))
      .toBe(true);
    expect(Math.min(...r.h)).toBeCloseTo(BASE, 6);
    expect(Math.max(...r.h)).toBeCloseTo(TOP, 6);
    for (const h of r.h) expect(h).toBeLessThanOrEqual(TOP + 1e-9);
    for (const e of r.elev) expect(e).toBe(20);
  });

  it("trays its own top plate, by the same two declared numbers", () => {
    const r = recorder();
    const rad = 6;
    expect(capForm(r.sink, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad, ang: 0 }, 0, roof)).toBe(true);
    const deckC = shadeRGB(roof, DE.deckv);
    const deck = r.h
      .map((h, i) => [h, i] as const)
      .filter(([h, i]) => Math.abs(h - (TOP - DE.parapet)) < 1e-6 && sameColour(r.col[i], deckC));
    expect(deck.length).toBe(8);
    // an edge moved in by `DE.thick` moves the circumradius in by
    // `DE.thick / cos(pi/N)` — the apothem is what an edge offset acts on
    const apo = rad * Math.cos(Math.PI / 8);
    const want = rad * (1 - DE.thick / apo);
    for (const [, i] of deck) expect(Math.hypot(r.x[i], r.y[i])).toBeCloseTo(want, 4);
  });

  it("keeps the measured VOLUME when the profile carves the cylinder", () => {
    // a cone: ∫s² du = 1/3, so the radius comes back sqrt(3) wider and the
    // solid of revolution has the volume the published mean measured
    const r = recorder();
    const rad = 5;
    expect(capForm(
      r.sink,
      { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad, ang: 0, profile: { u: [0, 1], s: [1, 0] } },
      0, roof,
    )).toBe(true);
    let widest = 0;
    for (let i = 0; i < r.x.length; i++) widest = Math.max(widest, Math.hypot(r.x[i], r.y[i]));
    expect(widest).toBeCloseTo(rad * Math.sqrt(3), 5);
    // and it closes to a point, so there is no plate to tray
    const top = r.h.map((h, i) => [h, i] as const).filter(([h]) => Math.abs(h - TOP) < 1e-6);
    expect(top.length).toBe(8);
    for (const [, i] of top) expect(Math.hypot(r.x[i], r.y[i])).toBeCloseTo(0, 9);
  });

  it("is the cylinder again when the caller closes the form ramp", () => {
    const r = recorder();
    const rad = 5;
    expect(capForm(
      r.sink,
      { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad, ang: 0, profile: { u: [0, 1], s: [1, 0] } },
      0, roof, { form: 0 },
    )).toBe(true);
    let widest = 0;
    for (let i = 0; i < r.x.length; i++) widest = Math.max(widest, Math.hypot(r.x[i], r.y[i]));
    expect(widest).toBeCloseTo(rad, 5);
  });

  it("refuses, and leaves the sink untouched", () => {
    for (const [why, run] of [
      ["no lift over the plane already drawn", (s: FormSink) =>
        capForm(s, { cx: 0, cy: 0, baseM: 20, topM: 20, rad: 5, ang: 0 }, 0, roof)],
      ["no radius", (s: FormSink) =>
        capForm(s, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 0, ang: 0 }, 0, roof)],
      ["a lift under the caller's floor", (s: FormSink) =>
        capForm(s, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 5, ang: 0 }, 0, roof, { minLiftM: 80 })],
      ["a width under the caller's floor", (s: FormSink) =>
        capForm(s, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 5, ang: 0 }, 0, roof, { minWidthM: 40 })],
      ["a plan that is not a polygon", (s: FormSink) =>
        capForm(s, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 5, ang: 0, n: 2 }, 0, roof)],
    ] as const) {
      const r = recorder();
      expect(run(r.sink), why).toBe(false);
      expect(r.x.length, `${why}: wrote ${r.x.length} vertices`).toBe(0);
      expect(r.tris.length, why).toBe(0);
    }
  });

  it("declines the plate's tray rather than drawing an inside-out deck", () => {
    // a 0.5 m plate cannot carry a 0.4 m parapet: `ngonInsetScale` returns 0
    const r = recorder();
    expect(capForm(r.sink, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 0.5, ang: 0 }, 0, roof)).toBe(true);
    for (const h of r.h) {
      expect(Math.abs(h - (TOP - DE.parapet))).toBeGreaterThan(1e-6);
    }
    expect(Math.max(...r.h)).toBeCloseTo(TOP, 6);
  });

  /* ── §winding ──────────────────────────────────────────────────────────
     THE PROPERTY A ONE-SIDED MATERIAL RESTS ON, AND IT IS NOT SELF-EVIDENT.

     `layers/caps.ts` draws these with three's default front-facing material
     rather than a two-sided one, which is only correct while every triangle
     here is wound to be seen from the side it is meant to be seen from. That
     is a property of `quad`'s winding argument at four call sites, and
     getting one of them backwards would show up as a cap with a face missing
     — from SOME bearings only, which is exactly the kind of bug a screenshot
     from one camera does not catch.

     A cap is a solid of revolution about a vertical axis, so "correct" has an
     arithmetic form: a side band's normal must point AWAY from the axis, the
     coping and the deck must point UP, and the parapet's inner ring is the
     one thing that must point IN, because it bounds the tray's void. Nothing
     may point DOWN — there is no underside; `capForm` builds no bottom face.

     Swept over every branch `capForm` has, not just the happy one. */
  function faces(r: Rec) {
    let outward = 0, inward = 0, up = 0, down = 0, degenerate = 0;
    for (const [a, b, c] of r.tris) {
      // the plan is (x, y) and the height is `h`, so the triangle in the
      // renderer's own axes is (x, h, y) — the same swap `layers/caps.ts` bakes
      const A = [r.x[a], r.h[a], r.y[a]];
      const B = [r.x[b], r.h[b], r.y[b]];
      const C = [r.x[c], r.h[c], r.y[c]];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const len = Math.hypot(n[0], n[1], n[2]);
      /* a band whose two rings have collapsed to the same point contributes
         one zero-area triangle per side — a spire closing to its finial. It
         rasterises to nothing and has no normal to check. */
      if (len < 1e-9) { degenerate++; continue; }
      n[0] /= len; n[1] /= len; n[2] /= len;
      if (Math.abs(n[1]) > 0.999) { if (n[1] > 0) up++; else down++; continue; }
      // the centroid's own outward direction, in the plan
      const cx = (A[0] + B[0] + C[0]) / 3;
      const cz = (A[2] + B[2] + C[2]) / 3;
      const rl = Math.hypot(cx, cz);
      if ((n[0] * cx + n[2] * cz) / (rl || 1) > 0) outward++;
      else inward++;
    }
    return { outward, inward, up, down, degenerate };
  }

  /** every published profile is a list of levels; these are shapes, not data */
  const SHAPES: readonly (readonly [string, { u: number[]; s: number[] } | null])[] = [
    ["the prism — no profile at all", null],
    ["a profile that closes to a point, so the last band is a cone",
      { u: [0, 0.52, 0.76, 0.94, 1], s: [1, 1, 0.87, 0.5, 0] }],
    ["a profile that steps OUT and back, which is what two-sided was for",
      { u: [0, 0.74, 0.78, 0.84, 0.86, 1], s: [0.9, 0.9, 1, 1, 0.86, 0.1] }],
    ["a profile that steps IN and holds",
      { u: [0, 0.62, 0.66, 0.86, 0.9, 1], s: [1, 1, 0.8, 0.8, 0.62, 0.62] }],
  ];

  it("winds every face to be seen from its own side, on every branch", () => {
    const cases: [string, Rec][] = [];
    for (const [why, profile] of SHAPES) {
      const r = recorder();
      expect(capForm(r.sink,
        { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 8, ang: 0.3, profile }, 0, roof)).toBe(true);
      cases.push([why, r]);
    }
    // and the branches that are about SIZE rather than shape
    const small = recorder();
    expect(capForm(small.sink,
      { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 0.5, ang: 0 }, 0, roof)).toBe(true);
    cases.push(["a plate too small for its own tray", small]);

    const low = recorder();
    // a lift under `DE.parapet`: the deck would drop below the plane drawn
    expect(capForm(low.sink,
      { cx: 0, cy: 0, baseM: 10, topM: 10.5, rad: 8, ang: 0 }, 0, roof)).toBe(true);
    cases.push(["a lift under the parapet's own drop", low]);

    const noTray = recorder();
    expect(capForm(noTray.sink,
      { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 8, ang: 0 }, 0, roof, { tray: 0 })).toBe(true);
    cases.push(["the caller closed the tray ramp", noTray]);

    const flat = recorder();
    expect(capForm(flat.sink,
      { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 8, ang: 0,
        profile: { u: [0, 0.52, 1], s: [1, 1, 0] } }, 0, roof, { form: 0 })).toBe(true);
    cases.push(["the caller closed the form ramp back to the cylinder", flat]);

    for (const [why, r] of cases) {
      const f = faces(r);
      expect(f.down, `${why}: ${f.down} triangles face DOWN and a cap has no underside`).toBe(0);
      expect(f.outward, `${why}: no outward face at all`).toBeGreaterThan(0);
      /* the parapet's inner ring is the ONLY thing allowed to face inward, and
         it is two triangles a side. Anything else inward is a backwards band. */
      expect(f.inward % 2, `${why}: ${f.inward} inward faces is not a whole ring`).toBe(0);
      expect(f.inward, `${why}: ${f.inward} inward faces is more than one ring`)
        .toBeLessThanOrEqual(16);
    }
  });

  it("faces the parapet's inner ring in, and the coping and deck up", () => {
    /* the shape of the claim above, pinned on the one case that has all four
       kinds of face at once: a plain prism with a full tray on its plate.
       8 sides: 16 side triangles out, 16 coping + 6 deck fan up, 16 inner in. */
    const r = recorder();
    expect(capForm(r.sink, { cx: 0, cy: 0, baseM: BASE, topM: TOP, rad: 8, ang: 0 }, 0, roof))
      .toBe(true);
    expect(faces(r)).toEqual({ outward: 16, inward: 16, up: 22, down: 0, degenerate: 0 });
  });
});

// ── the colour round trip ───────────────────────────────────────────────────

describe("shadeRGB", () => {
  it("applies the value the way the 2D renderer's shade() does, not linearly", () => {
    // `shade` multiplies sRGB BYTES; a vertex colour is linear. The naive
    // multiply darkens by a third of what the declared value asks for.
    const linear = 0.216; // ~ sRGB 0.5
    const [r] = shadeRGB([linear, linear, linear], DE.deckv);
    const enc = (x: number) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    expect(enc(r) / enc(linear)).toBeCloseTo(DE.deckv, 6);
    expect(r / linear).not.toBeCloseTo(DE.deckv, 2);
  });

  it("leaves a value of 1 exactly alone — the coping is the raw palette entry", () => {
    const c: [number, number, number] = [0.31, 0.42, 0.17];
    expect(shadeRGB(c, 1)).toEqual(c);
  });
});


// ── the house ───────────────────────────────────────────────────────────────

/**
 * THE FAULT THIS BLOCK EXISTS FOR, AND IT HAS NOW HAPPENED TWICE.
 *
 * `hipForm` had it first: the caller sized the wall by calling `hipPlan` and
 * the builder re-derived its own plan, so a slope passed to one and not the
 * other built the wall to one pitch and drew the roof at another. It came
 * back on the gable in a new costume — `gableHalf` took `min(w, d)` as the
 * span while `gableForm` chose its span from `alongX`, which `houseVary`
 * flips on one house in four. On those the eave landed BELOW the wall top and
 * the building's flat deck showed all round the roof as a pale apron.
 *
 * Neither version was visible in a unit test that only checked the geometry
 * one call produced. What catches it is the AGREEMENT between the two calls,
 * so that is what is asserted, over enough ids to hit every branch of the
 * variation.
 */
describe("gablePlan is the only plan", () => {
  it("gableHalf equals the rise gableForm actually draws, for every id", () => {
    /* turned off the projection's axes on purpose — an axis-aligned test
       plan would never have caught the frame bug this file now guards */
    const R = turned(rect(9, 22), 25);
    const H = 9;
    let crossed = 0;
    for (let gid = 1; gid <= 400; gid++) {
      const half = gableHalf(R, H, gid);
      const P = gablePlan(R, H, gid);
      expect(P, `gid ${gid}`).not.toBeNull();
      expect(half).toBeCloseTo(P!.half, 10);
      /* the ridge really does turn on some of them, which is the branch the
         old code disagreed on — a test that never crossed would prove nothing */
      if (!P!.alongU) crossed++;
      const r = recorder();
      expect(gableForm(r.sink, R, 0, H, [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], { gid })).toBe(true);
      /* the eave is the wall top the caller sized, and nothing the builder
         drew may sit below it */
      const lowest = Math.min(...r.h);
      expect(lowest, `gid ${gid} drew below its own eave`)
        .toBeGreaterThanOrEqual(-EAVE_FASCIA_M - 1e-6);
      /* and the ridge is exactly one half-rise above it */
      expect(Math.max(...r.h)).toBeGreaterThan(half);
    }
    expect(crossed, "no id turned its ridge — the branch is untested")
      .toBeGreaterThan(20);
  });

  it("keeps the roof over its own footprint, at every street bearing", () => {
    /* THE BUG THIS IS FOR. Both halves used to work off min/max of x and y,
       which is a rectangle aligned to the PROJECTION and has nothing to do
       with the building. On the Sunset's own 25-degree bearing that box is
       2.15x the area of a 25 x 65 ft lot and twice as wide, so every roof
       oversailed both neighbours by metres and the row interpenetrated.

       What is asserted is the plan area of everything drawn against the
       footprint's own. An axis-aligned roof over a turned lot fails this by
       roughly the ratio in `gablePlan`'s table; a framed one clears it at
       every bearing by the eave alone. */
    for (const deg of [0, 10, 20, 25, 30, 45, 70]) {
      const R = turned(rect(7.6, 20), deg);
      const r = recorder();
      expect(gableForm(r.sink, R, 0, 9, [0.5, 0.5, 0.5], [0.8, 0.8, 0.8],
                       { gid: 31, eave: 1.7, hip: 0 })).toBe(true);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      const t = (deg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
      for (let k = 0; k < r.x.length; k++) {
        /* back into the lot's own frame */
        const a = r.x[k] * c + r.y[k] * sn, b = -r.x[k] * sn + r.y[k] * c;
        if (a < u0) u0 = a; if (a > u1) u1 = a;
        if (b < v0) v0 = b; if (b > v1) v1 = b;
      }
      /* ACROSS the lot is the party side and the tight one — a roof may not
         oversail a wall it shares, and this is the assertion the frame bug
         failed by a factor of two */
      expect(u1 - u0, `bearing ${deg} across the lot`)
        .toBeLessThan(7.6 + 2 * PARTY_EAVE_M + 0.01);
      /* ALONG it the two ends are free: the eave at both, and the bay
         standing proud at the front. `houseVary` bounds the eave at 0.70 of
         the family's own multiplier and the projection at 1.15 m. */
      const maxEave = 0.70 * 1.7;
      expect(v1 - v0, `bearing ${deg} along the lot`)
        .toBeLessThan(20 + maxEave + Math.max(maxEave, 1.15) + 0.01);
    }
  });

  it("refuses a plan it cannot roof, and leaves the sink untouched", () => {
    const r = recorder();
    /* under 2 m on a side is not a house */
    expect(gableForm(r.sink, rect(1.5, 30), 0, 9, [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], { gid: 7 }))
      .toBe(false);
    expect(gableHalf(rect(1.5, 30), 9, 7)).toBe(0);
    /* and a building shorter than its own roof would be */
    expect(gableForm(r.sink, rect(20, 20), 0, 0.4, [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], { gid: 7 }))
      .toBe(false);
    expect(r.x.length).toBe(0);
    expect(r.tris.length).toBe(0);
  });

  it("draws the pitch it declares, and caps the rise rather than the angle", () => {
    /* 30 degrees over a 10 m span is 10/2 * tan(30) = 2.887 m of rise. The
       0.5 this used to carry drew it at 1.44, which is 16 degrees — under
       `houseVary`'s own stated floor of 22. */
    const half = gableHalf(rect(10, 40), 12, 0, 30);
    expect(half).toBeCloseTo(5 * Math.tan(Math.PI / 6), 4);
    /* the cap binds on a wide plan and nowhere else */
    expect(gableHalf(rect(60, 80), 30, 0, 30)).toBe(HOUSE_MAX_HALFRISE_M);
  });
});


describe("stepForm's wall channel", () => {
  it("puts the sides on the wall and the cap on the roof", () => {
    /* THE FAULT. Everything this file builds goes through `FormSink`, and the
       caller puts everything that comes through it in the ROOF mesh, which
       carries a gravel stipple and no facade. Right for a tray, a hip and a
       gable. Wrong for the side of a massing step, which is the same office
       wall that carries windows forty feet below it — and every stepped tower
       downtown was drawing its setbacks as blank prisms because of it. */
    const roof = recorder();
    const wall = recorder();
    const uv: [number, number][] = [];
    const wtri: [number, number, number][] = [];
    const ok = stepForm(
      roof.sink, rect(30, 40), 0, 0, 0.6, 0, 20, 60,
      [0.8, 0.8, 0.8], [0.4, 0.4, 0.4],
      {
        vertexUV: (x, y, e, h, r, g, b, u, v) => {
          uv.push([u, v]);
          return wall.sink.vertex(x, y, e, h, r, g, b);
        },
        tri: (a, b, c) => { wtri.push([a, b, c]); },
        bayM: 5,
        vPerM: 0.3,
      },
    );
    expect(ok).toBe(true);
    expect(uv.length).toBeGreaterThan(0);
    /* four sides, two triangles each, all on the wall */
    expect(wtri.length).toBe(8);
    /* and the cap — a fan over four corners is two triangles — on the roof */
    expect(roof.tris.length).toBe(2);
  });

  it("continues the wall's own rhythm rather than restarting it", () => {
    const roof = recorder();
    const uv: [number, number][] = [];
    stepForm(
      roof.sink, rect(30, 40), 0, 0, 0.25, 0, 20, 60,
      [0.8, 0.8, 0.8], [0.4, 0.4, 0.4],
      {
        vertexUV: (_x, _y, _e, _h, _r, _g, _b, u, v) => { uv.push([u, v]); return uv.length - 1; },
        tri: () => {},
        bayM: 5,
        vPerM: 0.3,
      },
    );
    /* `v` is storeys off the GROUND, so a level 20-60 m up lands where the
       wall below it would have — not at zero */
    const vs = uv.map((p) => p[1]);
    expect(Math.min(...vs)).toBeCloseTo(20 * 0.3, 6);
    expect(Math.max(...vs)).toBeCloseTo(60 * 0.3, 6);
    /* and `u` counts BAYS around the INSET ring at the building's own
       module. A 0.25 share is a half-scale inset of the 30 x 40 plan, so its
       edges are 15, 20, 15 and 20 m and at a 5 m bay they advance u by
       3, 4, 3, 4. The last vertex therefore reads 10 and the closing edge
       wraps back to 0 — the same seam the base wall's own uv carries, and
       the same convention: `u` is the run REACHED, not the run remaining. */
    const us = [...new Set(uv.map((p) => p[0]))].sort((a, b) => a - b);
    expect(us).toEqual([0, 3, 7, 10]);
  });
});
