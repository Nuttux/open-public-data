import { describe, expect, it } from "vitest";

import {
  themeMarksLayer,
  CARPET_BLOCKS,
  WINDOW_YEARS,
  THEME_INK,
  type ThemeMarksFile,
} from "./theme-marks";

/* ═══════════════════════════════════════════════════════════════════════
   THE FOUR THINGS THIS LAYER CAN GET WRONG WITHOUT LOOKING WRONG.

   A mark layer fails quietly. Too few dots looks like a quiet decade; dots
   in the wrong decade looks like history; a subject that silently vanishes
   past bit 31 looks like a subject with no records. None of those raise, and
   none of them are visible in a screenshot unless you already know the
   number. So they are asserted here.

     1. the window is a WINDOW, not a prefix — 1912 must not light 1998
     2. bits past 31 survive — JavaScript's `>>` is int32 and the fiche's
        vocabulary is 41 subjects long
     3. the carpet switch aggregates by BLOCK and conserves the record —
        every mark in the window is still represented, just not one dot each
     4. nothing is lit until something is selected — the default view is all
        decisions, and a filter that opens lit would be claiming the eight
        cover the city
     5. the END OF THE RAIL is the present, not all time. The engine spells
        the present `undefined` and broadcasts it straight to `onYear`; this
        layer reads `year: undefined` as EVERY year. That lit the whole
        century over a present-day city. It was fixed once in the React
        effect that calls `setFilter` and NOT on this path, so it survived
        on the path a reader actually uses — a scrub to the last year, and
        the film reaching its end. Hence a test on `onYear` itself.
   ═══════════════════════════════════════════════════════════════════════ */

const OPTS = {
  elevAt: () => 0,
  zex: 1,
  colours: THEME_INK,
  bits: 8,
};

/** n marks on n distinct blocks, all in one year, all on one subject bit */
function spread(n: number, bit: number, yr: number): ThemeMarksFile {
  return {
    sources: [{ i: 0, id: "t", label: "t", open: "block", n }],
    s: Array.from({ length: n }, () => 0),
    b: Array.from({ length: n }, (_, i) => i),
    r: Array.from({ length: n }, () => 0),
    x: Array.from({ length: n }, (_, i) => i),
    y: Array.from({ length: n }, () => 0),
    yr: Array.from({ length: n }, () => yr),
    m: Array.from({ length: n }, () => 2 ** bit),
  };
}

describe("theme marks", () => {
  it("draws nothing until a subject is selected", () => {
    const l = themeMarksLayer(spread(10, 0, 1950), OPTS);
    expect(l).not.toBeNull();
    expect(l!.setFilter({ bits: 0 })).toBe(0);
    expect(l!.meshes.every((m) => !m.visible)).toBe(true);
  });

  it("treats the engine's `undefined` year as the present, not all time", () => {
    /* two decades far apart, one subject. Standing at the present, only the
       present decade may light — the far one is a century away. */
    const now = { ...spread(4, 0, 2026) };
    const old = spread(4, 0, 1912);
    const f: ThemeMarksFile = {
      sources: now.sources,
      s: [...now.s, ...old.s],
      b: [...now.b, ...old.b.map((v) => v + 100)],
      r: [...now.r, ...old.r],
      x: [...now.x, ...old.x.map((v) => v + 100)],
      y: [...now.y, ...old.y],
      yr: [...now.yr, ...old.yr],
      m: [...now.m, ...old.m],
    };
    const l = themeMarksLayer(f, { ...OPTS, presentYear: 2026 })!;
    /* how many marks are actually DRAWN. The lit count comes back from
       `setFilter`, and calling it again after `onYear` would overwrite the
       state under test — the first version of this test did exactly that and
       passed with the bug in place. So the assertion reads the meshes. */
    const drawn = () => l.meshes.reduce((n, m) => n + (m.visible ? m.count : 0), 0);

    expect(l.setFilter({ bits: 1, year: 2026 })).toBe(4);
    expect(drawn()).toBe(4);

    // the engine broadcasting the present must not widen the window
    l.onYear?.(undefined);
    expect(drawn()).toBe(4);

    // and all-time is still reachable when a caller asks for it outright
    expect(l.setFilter({ bits: 1, year: undefined })).toBe(8);
    expect(drawn()).toBe(8);
  });

  it("lights only the selected subject", () => {
    const f = spread(6, 2, 1950);
    const l = themeMarksLayer(f, OPTS)!;
    expect(l.setFilter({ bits: 2 ** 2 })).toBe(6);
    expect(l.setFilter({ bits: 2 ** 3 })).toBe(0);
  });

  it("treats the year as a window and not as a prefix", () => {
    /* two records on one subject, 86 years apart. Standing on the first must
       not light the second — a prefix filter ("everything up to this year")
       would, and would read as the city having decided both at once. */
    const f: ThemeMarksFile = {
      sources: [{ i: 0, id: "t", label: "t", open: "block", n: 2 }],
      s: [0, 0],
      b: [0, 1],
      r: [0, 0],
      x: [0, 100],
      y: [0, 0],
      yr: [1912, 1998],
      m: [1, 1],
    };
    const l = themeMarksLayer(f, OPTS)!;
    expect(l.setFilter({ bits: 1, year: 1912 })).toBe(1);
    expect(l.setFilter({ bits: 1, year: 1998 })).toBe(1);
    expect(l.setFilter({ bits: 1, year: 1955 })).toBe(0);
    /* and no year at all is the whole century */
    expect(l.setFilter({ bits: 1 })).toBe(2);
  });

  it("includes both edges of the window", () => {
    const f = spread(1, 0, 1950);
    const l = themeMarksLayer(f, OPTS)!;
    const half = WINDOW_YEARS / 2;
    expect(l.setFilter({ bits: 1, year: 1950 + half })).toBe(1);
    expect(l.setFilter({ bits: 1, year: 1950 + half + 1 })).toBe(0);
  });

  it("survives a subject bit past 31", () => {
    /* THE FICHE'S VOCABULARY IS 41 SUBJECTS. `1 << 35` is 8 in JavaScript,
       so a shift-based read would light subject 3 and lose subject 35 with
       no error anywhere. */
    const bit = 35;
    const f = spread(4, bit, 1950);
    const l = themeMarksLayer(f, { ...OPTS, bits: 41 })!;
    expect(l.setFilter({ bits: 2 ** bit })).toBe(4);
    expect(l.setFilter({ bits: 2 ** 3 })).toBe(0);
  });

  it("switches to density past the carpet threshold, without losing records", () => {
    const n = CARPET_BLOCKS + 50;
    const l = themeMarksLayer(spread(n, 0, 1950), OPTS)!;
    expect(l.setFilter({ bits: 1 })).toBe(n);
    expect(l.state[0].mode).toBe("density");
    expect(l.state[0].blocks).toBe(n);
    /* every record is still counted — density aggregates the drawing, not
       the record, and the number the panel prints is the record's */
    expect(l.state[0].marks).toBe(n);

    const few = themeMarksLayer(spread(20, 0, 1950), OPTS)!;
    few.setFilter({ bits: 1 });
    expect(few.state[0].mode).toBe("dots");
  });

  it("aggregates several marks on one block into one puck", () => {
    /* five records, one block. Density must draw ONE mark there, not five
       stacked in the same pixel pretending to be five places.

       `n` has to leave the BLOCK count above the threshold after the collapse,
       not the mark count: the switch is on blocks, because blocks are what
       overlap on screen. Written with `CARPET_BLOCKS + 1` first, this test
       failed — the four blocks the collapse removed took it back under and it
       stayed, correctly, in dots. */
    const n = CARPET_BLOCKS + 10;
    const f = spread(n, 0, 1950);
    const b = f.b.slice();
    for (let i = 0; i < 5; i++) b[i] = 0;
    const l = themeMarksLayer({ ...f, b }, OPTS)!;
    l.setFilter({ bits: 1 });
    expect(l.state[0].marks).toBe(n);
    expect(l.state[0].blocks).toBe(n - 4);
    expect(l.meshes[0].count).toBe(n - 4);
  });

  it("keeps a place's marks off the assessor-block key space", () => {
    /* a source with no block carries -1, and two DIFFERENT places must not
       aggregate into one puck just because they share that -1 */
    const f: ThemeMarksFile = {
      sources: [{ i: 0, id: "p", label: "p", open: "place", n: 2, keys: ["a", "b"] }],
      s: [0, 0],
      b: [-1, -1],
      r: [0, 1],
      x: [0, 500],
      y: [0, 500],
      yr: [1950, 1950],
      m: [1, 1],
    };
    const l = themeMarksLayer(f, OPTS)!;
    l.setFilter({ bits: 1 });
    expect(l.state[0].blocks).toBe(2);
  });
});
