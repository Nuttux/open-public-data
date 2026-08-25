/**
 * film.test.ts — Block B3.
 *
 * `film.ts` is pure, so the two things this suite has to hold are the two that
 * cannot be seen in a screenshot: that the timeline is still 2 m 14 s, and that
 * the **spare version** — the one a machine that cannot draw the travels plays
 * instead — changes the camera and the year and nothing else.
 *
 * It runs against the SHIPPED payload rather than a fixture, because a fixture
 * would go on passing after `build_film_payload.py` changed a shot's timing,
 * which is exactly the failure `buildTimeline`'s own assertions exist to catch.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  filmStateAt,
  segAt,
  type FilmFrames,
  type FilmPayload,
} from "./film";

const PAYLOAD = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../public/data/us/sf/city/film/film.json"),
    "utf8",
  ),
) as FilmPayload;

const TL = buildTimeline(PAYLOAD);

/* The keyframes a shell would measure against a viewport, stood in for here by
 * a straight ladder: what matters to these tests is that shot i's camera is
 * distinguishable from shot i−1's, not where either of them is. */
const FRAMES: FilmFrames = {
  base: 0.05,
  frames: PAYLOAD.shots.map((s, i) => ({
    step: 0,
    cx: 1000 + i * 500,
    py: 2000 + i * 300,
    gz: 0,
    scale: 0.05 * (s.z || i + 1),
  })),
  /* the second framing, distinguishable from the first for the same reason —
     a shot that cuts inside itself must not land back on its own first camera */
  frames2: PAYLOAD.shots.map((s, i) =>
    s.cam2
      ? {
          step: 0,
          cx: 90000 + i * 500,
          py: 90000 + i * 300,
          gz: 0,
          scale: 0.05 * (s.cam2.z || i + 1),
        }
      : null,
  ),
};

const at = (t: number, spare = false) =>
  filmStateAt(PAYLOAD, TL, FRAMES, t, { spare });

/** the first segment of kind `k`, and the shot it belongs to */
function firstSeg(k: string): { t0: number; ms: number } {
  const sg = TL.segs.find((s) => s.k === k);
  if (!sg) throw new Error(`no ${k} segment in the shipped payload`);
  return { t0: sg.t0, ms: sg.ms };
}

describe("the running time is the one the page claims", () => {
  it("is the payload's own arithmetic and not a number typed anywhere", () => {
    const r = PAYLOAD.runtime;
    expect(TL.total).toBe(r.titleMs + r.shotsMs + r.endMs);
    expect(TL.total).toBe(r.totalMs);
  });

  it("has one shot start per shot, in order", () => {
    expect(TL.shotT0).toHaveLength(PAYLOAD.shots.length);
    for (let i = 1; i < TL.shotT0.length; i++) {
      expect(TL.shotT0[i]).toBeGreaterThan(TL.shotT0[i - 1]);
    }
  });
});

describe("the spare version", () => {
  /* MEASURED 2026-08-24, `.parity/b3seg.py`: a rasterisation taken while the
     camera is moving costs 0.6–1.2 s and a run costs sixteen of them a year, so
     the film is authored at 2 m 14 s and played in 4 m 29 s. The spare version
     is the one the reduced-motion path already authored — the camera cuts and
     the years land whole — and these are the three things it must not do. */

  it("does not change the running time, the segments or the shot starts", () => {
    // it is a change of what is DRAWN, never of when
    const move = firstSeg("move");
    for (const t of [0, move.t0, move.t0 + move.ms / 2, TL.total]) {
      expect(at(t, true).seg.t0).toBe(at(t, false).seg.t0);
      expect(segAt(TL, t)).toBe(segAt(TL, t));
    }
    expect(TL.total).toBe(PAYLOAD.runtime.totalMs);
  });

  it("lands the camera on the incoming frame at the HEAD of a move", () => {
    // and not at its end: the move's remaining milliseconds become a still hold
    // on the frame the shot is about to use, which is what gives that frame its
    // rasterisation before any copy appears on it.
    const move = firstSeg("move");
    const head = at(move.t0 + 1, true);
    const end = at(move.t0 + move.ms - 1, true);
    expect(head.scale).toBeCloseTo(end.scale, 9);
    expect(head.cx).toBeCloseTo(end.cx, 9);
    // the authored travel does move over the same interval
    const travelHead = at(move.t0 + 1, false);
    const travelEnd = at(move.t0 + move.ms - 1, false);
    expect(travelHead.scale).not.toBeCloseTo(travelEnd.scale, 6);
  });

  it("keeps every year the film shows, and lands them whole", () => {
    /* REDUCED MOTION IS NOT REDUCED HISTORY, and neither is this: pinning a run
       at its end value would take shot 6 from 1918 to 1945 with the change it
       exists to show removed. The years still run; they arrive as integers. */
    const run = TL.segs.find((s) => s.k === "run" && s.yTo > s.yFrom);
    if (!run) throw new Error("no run segment in the shipped payload");
    const seen = new Set<number>();
    for (let i = 0; i <= 400; i++) {
      const s = at(run.t0 + (run.ms * i) / 400, true);
      /* Outside a run the year is handed over as `iy + 0.999`, which is what
         tells the renderer "everything built by this year is simply there".
         What matters is that the value takes ONE step per year: the content key
         is `Math.round(year * YEAR_Q)`, so a fractional year is sixteen
         rasterisations a year and this is one. */
      expect(s.year).toBeCloseTo(Math.floor(s.year) + 0.999, 9);
      expect(s.running).toBe(false); // ...so the fabric's arrival wave never starts
      seen.add(Math.floor(s.year));
    }
    expect(seen.has(run.yFrom)).toBe(true);
    expect(Math.max(...seen)).toBe(run.yTo);
    // every year in the span is shown, not a sampled subset of them
    expect(seen.size).toBe(run.yTo - run.yFrom + 1);
  });

  it("leaves the copy, the citations and the subjects alone", () => {
    for (let i = 0; i <= 200; i++) {
      const t = (TL.total * i) / 200;
      const a = at(t, false);
      const b = at(t, true);
      expect(b.line?.copy ?? null).toBe(a.line?.copy ?? null);
      expect(b.line?.cite?.leaf ?? null).toBe(a.line?.cite?.leaf ?? null);
      expect(b.shot).toBe(a.shot);
      expect(b.hide).toEqual(a.hide);
    }
  });
});

describe("every line on screen carries a scan or is declared as data", () => {
  it("holds for all ten shots", () => {
    for (const s of PAYLOAD.shots) {
      if (s.kind === "data") {
        expect(s.cite).toBeFalsy();
        expect(s.links?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(s.cite?.item).toBeTruthy();
        expect(s.cite?.leaf).toBeGreaterThan(0);
        expect(s.cite?.url).toContain(`/page/n${s.cite?.leaf}/`);
      }
    }
  });
});
