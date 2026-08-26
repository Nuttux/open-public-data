import { describe, expect, it, vi } from "vitest";

import {
  CURVE,
  buildFilm,
  createFilm,
  filmStateAt,
  frameOf,
  resolveFrames,
  segAt,
  waveFits,
  type FilmFrameCtx,
  type FilmHost,
  type FilmScript,
  type FilmState,
} from "./film";

/* ═══════════════════════════════════════════════════════════════════════
   The script under test is SYNTHETIC and deliberately so: `film.ts` takes
   its shot list as a parameter precisely because a shot list is one city's
   data, and a test that had to name a city to prove the player works would
   be evidence that the parameter is not doing its job.

   Its SHAPE is the published film's, though, because that is what has to be
   supported: a title card, a shot with no move (a match cut), a run, a shot
   that cuts to a second framing mid-shot, a build, holds, an end card, and
   a `shotMs` on every shot so the timing assertion is exercised.
   ═══════════════════════════════════════════════════════════════════════ */

const SCRIPT: FilmScript = {
  titleMs: 3200,
  endMs: 3000,
  openYear: 1900,
  shots: [
    {
      id: "one",
      cam: { z: 3, ox: -0.16, oy: 0.12, at: [2000, 2000] },
      moveMs: 0,
      shotMs: 4000,
      acts: [
        { k: "build", ms: 1400, what: "line", curve: "enter" },
        { k: "hold", ms: 2600 },
      ],
    },
    {
      id: "two",
      cam: { z: 3, ox: -0.16, oy: 0.12, at: [2000, 2000] },
      moveMs: 0,
      shotMs: 5600,
      acts: [{ k: "run", ms: 5600, to: 1909, curve: "even" }],
    },
    {
      id: "three",
      cam: { z: 12, ox: 0.1, oy: 0.1, at: [5000, 4000] },
      cam2: { z: 6, ox: 0.06, oy: -0.04, at: [-3500, 6500] },
      moveMs: 1200,
      shotMs: 6800,
      acts: [
        { k: "run", ms: 1400, to: 1930, curve: "even" },
        { k: "build", ms: 1400, what: "deck", curve: "travel" },
        { k: "hold", ms: 1400 },
        { k: "run", ms: 1000, to: 1931, curve: "even", cam: 2 },
        { k: "hold", ms: 400, cam: 2 },
      ],
    },
    {
      id: "four",
      /* no `at`: the fitted whole-city framing, which two of the published
         eleven shots use */
      cam: { z: 1.1, ox: 0, oy: 0 },
      moveMs: 1200,
      shotMs: 3200,
      acts: [{ k: "run", ms: 1000, to: 1960, curve: "even" }, { k: "hold", ms: 1000 }],
    },
  ],
};

/* a flat, tilted plane standing in for terrain: an elevation that VARIES with
   the target is what makes the `gz` term visible at all, and a constant one
   would let a bug that dropped it pass */
const ELEV = (x: number, y: number): number => 20 + x / 1000 + y / 500;
/* a similarity, which is what the real projection is at zero elevation */
const PROJ = (x: number, y: number): readonly [number, number] => [0.8 * x + 0.2 * y, 0.3 * x + 0.6 * y];

const ZEX = [3.3, 2.6, 2.0] as const;
const STEP_FOR = (z: number): number => (z < 1.6 ? 0 : z < 3.2 ? 1 : 2);

const CTX: FilmFrameCtx = {
  fit: { base: 0.04, bx: 1234, by: 5678 },
  W: 1200,
  H: 800,
  proj: PROJ,
  elev: ELEV,
  stepFor: STEP_FOR,
};

const frames = () => resolveFrames(SCRIPT, CTX);
const zexOf = (step: number): number => ZEX[Math.min(step, ZEX.length - 1)];

/** A host that records everything the player pushes at it. */
function fakeHost(): FilmHost & {
  cams: { cx: number; cy: number; scale: number }[];
  years: (number | undefined)[];
  steps: number[];
} {
  let step = 0;
  const h = {
    cams: [] as { cx: number; cy: number; scale: number }[],
    years: [] as (number | undefined)[],
    steps: [] as number[],
    getCamera: () => h.cams[h.cams.length - 1] ?? { cx: 0, cy: 0, scale: 1 },
    setCamera: (c: { cx: number; cy: number; scale: number }) => {
      h.cams.push({ ...c });
    },
    getStep: () => step,
    setStep: (s: number) => {
      step = s;
      h.steps.push(s);
    },
    setYear: (y: number | undefined) => {
      h.years.push(y);
    },
    invalidate: () => {},
    zex: () => zexOf(step),
    viewport: { W: 1200, H: 800, dpr: 2 },
  };
  return h;
}

/** A hand-cranked clock and loop: the player takes both, so nothing here waits
 *  on a real frame and every test is deterministic. */
function rig(script: SCRIPTLike = SCRIPT, o: { interruptOn?: EventTarget } = {}) {
  const host = fakeHost();
  let now = 1000;
  let pending: ((t: number) => void) | null = null;
  const states: FilmState[] = [];
  const stops: { reason: string; t: number }[] = [];
  const film = createFilm(host, script, {
    frames: resolveFrames(script, CTX),
    interruptOn: o.interruptOn,
    now: () => now,
    raf: (cb) => {
      pending = cb;
      return 1;
    },
    cancelRaf: () => {
      pending = null;
    },
    onState: (s) => states.push(s),
    onStop: (reason, s) => stops.push({ reason, t: s.t }),
  });
  /** advance the wall clock by `ms` and run the one frame that was queued */
  const step = (ms: number): void => {
    now += ms;
    const cb = pending;
    pending = null;
    cb?.(now);
  };
  return { host, film, states, stops, step, queued: () => pending !== null };
}
type SCRIPTLike = FilmScript;

// ── the timeline ────────────────────────────────────────────────────────────

describe("buildFilm", () => {
  const tl = buildFilm(SCRIPT);

  it("lays the whole film out as one flat segment list with absolute starts", () => {
    /* title 3200 + shots (4000 + 5600 + 6800 + 3200) + end 3000 */
    expect(tl.total).toBe(3200 + 4000 + 5600 + 6800 + 3200 + 3000);
    expect(tl.segs[0].k).toBe("title");
    expect(tl.segs[tl.segs.length - 1].k).toBe("end");
    for (let i = 1; i < tl.segs.length; i++) {
      expect(tl.segs[i].t0).toBe(tl.segs[i - 1].t0 + tl.segs[i - 1].ms);
    }
  });

  it("gives each shot a start and an end that agree with the segments", () => {
    expect(tl.shotT0).toEqual([3200, 7200, 12800, 19600]);
    expect(tl.shotEnd).toEqual([7200, 12800, 19600, 22800]);
  });

  it("emits a move segment only where the shot has one", () => {
    const moves = tl.segs.filter((s) => s.k === "move");
    /* shots three and four; one and two are cuts, which is what a match cut is */
    expect(moves.map((m) => m.si)).toEqual([2, 3]);
    expect(moves.map((m) => m.ms)).toEqual([1200, 1200]);
  });

  it("carries the shot's opening year across its move", () => {
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 2);
    /* shot two closed on 1909, so the travel into shot three happens at 1909
       and not at NaN, which is what the Canvas film shipped with */
    expect(mv?.yFrom).toBe(1909);
    expect(mv?.yTo).toBe(1909);
  });

  it("refuses a shot whose acts do not sum to its stated running time", () => {
    const bad: FilmScript = {
      ...SCRIPT,
      shots: [{ ...SCRIPT.shots[0], shotMs: 4001 }],
    };
    expect(() => buildFilm(bad)).toThrow(/acts sum to 4000 ms, the script says 4001/);
  });

  it("refuses a run that walks the year backward", () => {
    const bad: FilmScript = {
      ...SCRIPT,
      shots: [
        SCRIPT.shots[0],
        { ...SCRIPT.shots[1], acts: [{ k: "run", ms: 5600, to: 1890, curve: "even" }] },
      ],
    };
    expect(() => buildFilm(bad)).toThrow(/BACKWARD/);
  });
});

// ── the framings ────────────────────────────────────────────────────────────

describe("frameOf", () => {
  it("reads z as a multiple of the fit and offsets by a fraction of the viewport", () => {
    const f = frameOf({ z: 3, ox: -0.16, oy: 0.12, at: [2000, 2000] }, CTX);
    const scale = 0.04 * 3;
    const p = PROJ(2000, 2000);
    expect(f.scale).toBeCloseTo(scale, 12);
    expect(f.cx).toBeCloseTo(p[0] - (-0.16 * 1200) / scale, 9);
    expect(f.py).toBeCloseTo(p[1] - (0.12 * 800) / scale, 9);
    expect(f.gz).toBeCloseTo(ELEV(2000, 2000), 9);
    expect(f.step).toBe(1);
  });

  it("takes the fitted centre where the framing names no target, with no elevation term", () => {
    const f = frameOf({ z: 1.1, ox: 0, oy: 0 }, CTX);
    expect(f.cx).toBeCloseTo(1234, 12);
    expect(f.py).toBeCloseTo(5678, 12);
    expect(f.gz).toBe(0);
    expect(f.step).toBe(0);
  });

  it("resolves the second framing only for the shot that has one", () => {
    const ff = frames();
    expect(ff.frames2.map((f) => f !== null)).toEqual([false, false, true, false]);
  });
});

// ── the camera ──────────────────────────────────────────────────────────────

describe("the camera", () => {
  const tl = buildFilm(SCRIPT);
  const ff = frames();
  const at = (t: number) => filmStateAt(SCRIPT, tl, ff, t, zexOf);

  /** what a framing's camera is, once its elevation term is applied at the
   *  step that framing sits in — the thing a shot is supposed to settle on */
  const settled = (i: number, second = false) => {
    const f = (second ? ff.frames2[i] : ff.frames[i]) as NonNullable<
      (typeof ff.frames2)[number]
    >;
    return { cx: f.cx, cy: f.py + zexOf(f.step) * f.gz, scale: f.scale };
  };

  it("hits a move's start camera exactly on its first frame", () => {
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 2)!;
    const s = at(mv.t0);
    /* shot two ended on its own framing, and that is where the travel starts */
    const a = settled(1);
    expect(s.cam.cx).toBeCloseTo(a.cx, 9);
    expect(s.cam.cy).toBeCloseTo(a.cy, 9);
    expect(s.cam.scale).toBeCloseTo(a.scale, 12);
  });

  it("hits a move's end camera exactly on its last frame", () => {
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 2)!;
    const b = settled(2);
    for (const t of [mv.t0 + mv.ms - 1e-9, mv.t0 + mv.ms]) {
      const s = at(t);
      expect(s.cam.cx).toBeCloseTo(b.cx, 6);
      expect(s.cam.cy).toBeCloseTo(b.cy, 6);
      expect(s.cam.scale).toBeCloseTo(b.scale, 9);
    }
  });

  it("interpolates the scale in log space, not linearly", () => {
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 2)!;
    /* `travel` is symmetric about (0.5, 0.5) — its two control points are each
       other's reflection — so the halfway TIME is the halfway PROGRESS, and a
       geometric interpolation there is the geometric mean of the two scales. */
    expect(CURVE.travel(0.5)).toBeCloseTo(0.5, 5);
    const a = ff.frames[1].scale;
    const b = ff.frames[2].scale;
    const s = at(mv.t0 + mv.ms / 2);
    expect(s.cam.scale).toBeCloseTo(Math.sqrt(a * b), 6);
    /* and it is NOT the arithmetic mean, which is what a linear lerp gives */
    expect(Math.abs(s.cam.scale - (a + b) / 2)).toBeGreaterThan(0.01 * b);
  });

  it("holds a locked frame perfectly still for the whole act", () => {
    const build = tl.segs.find((s) => s.k === "build" && s.si === 2)!;
    const first = at(build.t0);
    for (const t of [build.t0 + 1, build.t0 + build.ms / 2, build.t0 + build.ms - 1]) {
      const s = at(t);
      expect(s.cam.cx).toBe(first.cam.cx);
      expect(s.cam.cy).toBe(first.cam.cy);
      expect(s.cam.scale).toBe(first.cam.scale);
    }
  });

  it("cuts to the second framing on the act that asks for it, and back never", () => {
    const segs = tl.segs.filter((s) => s.si === 2);
    const beforeCut = segs.find((s) => s.k === "hold" && s.a?.cam !== 2)!;
    const afterCut = segs.find((s) => s.a?.cam === 2)!;
    const one = settled(2);
    const two = settled(2, true);
    const b = at(beforeCut.t0 + 10);
    const a = at(afterCut.t0 + 10);
    expect(b.cam.scale).toBeCloseTo(one.scale, 12);
    expect(a.cam.scale).toBeCloseTo(two.scale, 12);
    expect(a.cam.cx).toBeCloseTo(two.cx, 9);

    /* and the NEXT shot's travel starts from the framing this shot ENDED on,
       which is the second one — not the one it opened with */
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 3)!;
    expect(at(mv.t0).cam.scale).toBeCloseTo(two.scale, 12);
  });

  it("reads the step back off the interpolated scale, never lerping the ladder", () => {
    const mv = tl.segs.find((s) => s.k === "move" && s.si === 3)!;
    /* shot three sits at z 6 (step 2) and shot four at z 1.1 (step 0), so this
       travel crosses BOTH thresholds and the step must only ever be one of the
       three integers the ladder defines */
    const seen = new Set<number>();
    for (let k = 0; k <= 40; k++) seen.add(at(mv.t0 + (mv.ms * k) / 40).step);
    expect([...seen].sort()).toEqual([0, 1, 2]);
    for (const s of seen) expect(Number.isInteger(s)).toBe(true);
    expect(at(mv.t0 + mv.ms).step).toBe(0);
  });

  it("applies the exaggeration of the step it is on, so a fixed point is not baked", () => {
    /* the same framing read at two different exaggerations must differ by
       exactly Δzex × elevation — that is the whole reason `py` and `gz` are
       carried apart */
    const f = ff.frames[2];
    const lo = filmStateAt(SCRIPT, tl, ff, tl.shotT0[2] + 2000, () => 2.0);
    const hi = filmStateAt(SCRIPT, tl, ff, tl.shotT0[2] + 2000, () => 3.3);
    expect(hi.cam.cy - lo.cam.cy).toBeCloseTo((3.3 - 2.0) * f.gz, 9);
  });
});

// ── the year ────────────────────────────────────────────────────────────────

describe("the year", () => {
  const tl = buildFilm(SCRIPT);
  const ff = frames();
  const at = (t: number) => filmStateAt(SCRIPT, tl, ff, t, zexOf);

  it("is exactly the sequence the shot list says", () => {
    /* the script's runs, in order: 1900 -> 1909, 1909 -> 1930, 1930 -> 1931,
       1931 -> 1960. Read at each shot's last frame. */
    expect(at(0).year).toBe(1900);
    expect(at(tl.shotEnd[0] - 1).year).toBe(1900);
    expect(at(tl.shotEnd[1] - 1e-9).year).toBeCloseTo(1909, 6);
    expect(at(tl.shotEnd[2] - 1e-9).year).toBeCloseTo(1931, 6);
    expect(at(tl.shotEnd[3] - 1e-9).year).toBeCloseTo(1960, 6);
    expect(at(tl.total).year).toBe(1960);
  });

  it("never goes backward at any millisecond of the film", () => {
    let prev = -Infinity;
    for (let t = 0; t <= tl.total; t += 25) {
      const y = at(t).year;
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it("runs the year linearly under an act's `even` curve", () => {
    const run = tl.segs.find((s) => s.k === "run" && s.si === 1)!;
    /* 1900 -> 1909 over 5600 ms. A counter, not a camera: the record does not
       say one year took longer than the next. */
    expect(at(run.t0).year).toBeCloseTo(1900, 6);
    expect(at(run.t0 + run.ms / 3).year).toBeCloseTo(1903, 4);
    expect(at(run.t0 + run.ms / 2).year).toBeCloseTo(1904.5, 4);
  });

  it("hands a year-gated layer the fraction only while something reads it", () => {
    const run = tl.segs.find((s) => s.k === "run" && s.si === 1)!;
    /* 9 years over 5600 ms is 622 ms a year, over the 520 ms stagger, so the
       wave runs and the fraction is live */
    expect(waveFits(9, 5600)).toBe(true);
    const live = at(run.t0 + 100);
    expect(live.running).toBe(true);
    expect(live.yearOut).toBe(live.year);

    /* past YEAR_LIVE inside the same year, nothing on screen changes again
       until the next integer, so the year is pinned */
    const q = 1904.8;
    const tq = run.t0 + ((q - 1900) / 9) * run.ms;
    const pinned = at(tq);
    expect(pinned.year).toBeCloseTo(q, 4);
    expect(pinned.yearOut).toBeCloseTo(1904.999, 6);
  });

  it("pins the year on every act that is not a run", () => {
    const hold = tl.segs.find((s) => s.k === "hold" && s.si === 0)!;
    const s = at(hold.t0 + 500);
    expect(s.running).toBe(false);
    expect(s.yearOut).toBeCloseTo(1900.999, 6);
  });

  it("does not claim a wave on a run too fast to have one", () => {
    const run = tl.segs.find((s) => s.k === "run" && s.si === 2 && s.a?.k === "run")!;
    /* 21 years over 1400 ms is 67 ms a year, well under the 520 ms stagger */
    expect(waveFits(21, 1400)).toBe(false);
    expect(at(run.t0 + 200).running).toBe(false);
  });
});

// ── the act, reported ───────────────────────────────────────────────────────

describe("the live act", () => {
  const tl = buildFilm(SCRIPT);
  const ff = frames();
  const at = (t: number) => filmStateAt(SCRIPT, tl, ff, t, zexOf);

  it("reports which shot and act is live, and its own eased progress", () => {
    const build = tl.segs.find((s) => s.k === "build" && s.si === 0)!;
    const s = at(build.t0 + build.ms / 2);
    expect(s.shot).toBe("one");
    expect(s.kind).toBe("build");
    expect(s.act).toEqual({ k: "build", ms: 1400, what: "line", curve: "enter" });
    expect(s.u0).toBeCloseTo(0.5, 6);
    /* `enter` is the drawer slide, which is well past half at half — an object
       arriving is allowed to ease where a camera is not */
    expect(s.u).toBeCloseTo(CURVE.enter(0.5), 6);
    expect(s.u).toBeGreaterThan(0.7);
  });

  it("names no shot on the two cards", () => {
    expect(at(0).shot).toBeNull();
    expect(at(0).kind).toBe("title");
    expect(at(tl.total).shot).toBeNull();
    expect(at(tl.total).kind).toBe("end");
  });

  it("puts the title card on the first shot's own framing", () => {
    /* the film opens ALREADY THERE — the first shot has no move, so there is
       nothing for the card to sit in front of but the frame it opens on */
    expect(at(0).cam.scale).toBeCloseTo(ff.frames[0].scale, 12);
    expect(at(0).cam.cx).toBeCloseTo(ff.frames[0].cx, 9);
  });
});

// ── segAt ───────────────────────────────────────────────────────────────────

describe("segAt", () => {
  const tl = buildFilm(SCRIPT);
  it("agrees with a linear scan at every boundary and either side of it", () => {
    const scan = (t: number): number => {
      let k = 0;
      for (let i = 0; i < tl.segs.length; i++) if (tl.segs[i].t0 <= t) k = i;
      return k;
    };
    for (const sg of tl.segs) {
      for (const t of [sg.t0 - 1, sg.t0, sg.t0 + 1, sg.t0 + sg.ms - 1]) {
        if (t < 0) continue;
        expect(segAt(tl, t)).toBe(scan(t));
      }
    }
  });
});

// ── the player ──────────────────────────────────────────────────────────────

describe("the player", () => {
  it("clocks off wall time and not off frames", () => {
    const r = rig();
    r.film.play();
    /* three frames, wildly uneven — a dropped frame must cost the film no
       time, which is the entire reason this is a delta and not a counter */
    r.step(16);
    r.step(240);
    r.step(16);
    expect(r.film.t).toBe(16 + 50 + 16);
    /* 240 ms is capped at MAX_DT: a backgrounded tab hands back seconds, and
       integrating that would skip whole shots on the frame the reader returns */
  });

  it("never runs the clock backward, whatever the frame times are", () => {
    const r = rig();
    r.film.play();
    let prev = -1;
    for (let k = 0; k < 400; k++) {
      r.step(k % 7 === 0 ? 40 : 16);
      expect(r.film.t).toBeGreaterThanOrEqual(prev);
      prev = r.film.t;
    }
    const years = r.states.map((s) => s.year);
    for (let i = 1; i < years.length; i++) expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
  });

  it("pushes a camera, a step and a year at the host on every frame", () => {
    const r = rig();
    r.film.play();
    r.step(16);
    expect(r.host.cams.length).toBe(2); // the frame `play` paints, then the tick
    expect(r.host.years.length).toBe(2);
    expect(r.host.years[0]).toBeCloseTo(1900.999, 6);
    /* the step is only pushed when it CHANGES — the engine's own setter is a
       no-op otherwise, and re-setting it would rebuild every layer's uniforms */
    expect(r.host.steps).toEqual([1]);
  });

  it("stops itself at the end and reports it once", () => {
    const r = rig();
    const total = r.film.total;
    r.film.play();
    for (let k = 0; k < Math.ceil(total / 50) + 10 && r.queued(); k++) r.step(50);
    expect(r.film.t).toBe(total);
    expect(r.film.running).toBe(false);
    expect(r.stops).toEqual([{ reason: "end", t: total }]);
    expect(r.states[r.states.length - 1].done).toBe(true);
  });

  it("stops WHERE IT IS on a pointer, a wheel or a key, and hands the camera back untouched", () => {
    for (const kind of ["pointerdown", "wheel", "keydown"]) {
      const el = new EventTarget();
      const r = rig(SCRIPT, { interruptOn: el });
      r.film.play();
      r.step(16);
      r.step(16);
      const t = r.film.t;
      const cam = r.host.cams[r.host.cams.length - 1];

      el.dispatchEvent(new Event(kind));

      expect(r.film.running).toBe(false);
      expect(r.stops).toEqual([{ reason: "interrupt", t }]);
      /* nothing moved on the way out: the frame the reader interrupted is the
         frame the reader keeps */
      expect(r.host.cams[r.host.cams.length - 1]).toEqual(cam);
      expect(r.film.t).toBe(t);

      /* and the loop is genuinely dead — a queued frame must not resurrect it */
      const before = r.host.cams.length;
      r.step(16);
      expect(r.host.cams.length).toBe(before);
    }
  });

  it("unbinds its listeners when it stops, so a second gesture is not its problem", () => {
    const el = new EventTarget();
    const spy = vi.spyOn(el, "removeEventListener");
    const r = rig(SCRIPT, { interruptOn: el });
    r.film.play();
    r.step(16);
    el.dispatchEvent(new Event("pointerdown"));
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(["keydown", "pointerdown", "wheel"]);
    el.dispatchEvent(new Event("pointerdown"));
    expect(r.stops.length).toBe(1);
  });

  it("seeks to exactly the frame playback would have produced", () => {
    const r = rig();
    const tl = buildFilm(SCRIPT);
    const t = tl.shotT0[2] + 600;
    r.film.seek(t);
    const seeked = r.states[r.states.length - 1];
    const looked = r.film.stateAt(t);
    expect(seeked.cam).toEqual(looked.cam);
    expect(seeked.year).toBe(looked.year);
    expect(seeked.step).toBe(looked.step);
  });

  it("replays from the top rather than sitting on its last frame", () => {
    const r = rig();
    r.film.seek(r.film.total);
    r.film.play();
    expect(r.film.t).toBe(0);
  });

  it("re-measures its framings when the viewport changes", () => {
    const r = rig();
    r.film.seek(4000);
    const before = r.host.cams[r.host.cams.length - 1].cx;
    /* `ox`/`oy` are fractions of the viewport, so a narrower frame puts the
       target somewhere else in plane units — that is what has to be redone */
    r.film.setFrames(resolveFrames(SCRIPT, { ...CTX, W: 600 }));
    const after = r.host.cams[r.host.cams.length - 1].cx;
    expect(after).not.toBe(before);
    expect(after).toBeCloseTo(
      frameOf(SCRIPT.shots[0].cam, { ...CTX, W: 600 }).cx,
      9,
    );
  });

  it("is inert after dispose", () => {
    const r = rig();
    r.film.play();
    r.step(16);
    r.film.dispose();
    const n = r.host.cams.length;
    r.film.play();
    expect(r.film.running).toBe(false);
    expect(r.host.cams.length).toBe(n);
  });
});
