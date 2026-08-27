import { describe, expect, it } from "vitest";

import { buildFilm, filmStateAt, resolveFrames, type FilmFrameCtx, type FilmScript } from "./film";
import {
  CARD_WASH,
  cardAt,
  plateAt,
  plateYearAt,
  scanFor,
  type FilmScanPage,
} from "./film-plate";

/* ═══════════════════════════════════════════════════════════════════════
   SYNTHETIC, for the reason the player's own tests are: a plate is one
   city's record and a test that had to name a city to prove the lookup
   works would be evidence that the parameter is not doing its job.

   The SHAPE is the published film's, and deliberately covers all three of
   the year rules at once — a shot that settles, a shot whose counter is the
   subject, and a shot that pins — plus a shot that holds its words back.
   ═══════════════════════════════════════════════════════════════════════ */

const SCRIPT: FilmScript = {
  titleMs: 3200,
  endMs: 3000,
  openYear: 1900,
  titleCard: { head: "a head", sub: "a sub", note: "a note" },
  endCard: { head: "the end", sub: "the sub" },
  scansUrl: "/somewhere/scans.json",
  shots: [
    {
      /* SETTLES. Its counter crosses 1900 -> 1910 and its sentence is about
         1910, so the plate must read 1910 from the shot's first frame. */
      id: "settles",
      cam: { z: 3, ox: 0, oy: 0, at: [2000, 2000] },
      moveMs: 0,
      shotMs: 4000,
      acts: [
        { k: "run", ms: 2000, to: 1910, curve: "even" },
        { k: "hold", ms: 2000 },
      ],
      plate: {
        title: "a title",
        copy: "a sentence",
        cite: { vol: "a volume", leaf: 8, url: "https://example.org/8" },
        also: [{ t: "a second source", u: "https://example.org/x", k: "data" }],
        note: "a caveat",
        scan: 1,
      },
    },
    {
      /* THE COUNTER IS THE SUBJECT, and the words wait for the first act to
         be over before they land. */
      id: "counts",
      cam: { z: 3, ox: 0, oy: 0, at: [2000, 2000] },
      moveMs: 1200,
      shotMs: 5200,
      yearRuns: true,
      sayFromAct: 1,
      acts: [
        { k: "run", ms: 2000, to: 1930, curve: "even" },
        { k: "hold", ms: 2000 },
      ],
      plate: { title: "counting", copy: "nine years" },
    },
    {
      /* PINS: two events a year apart and no year in the sentence. */
      id: "pins",
      cam: { z: 6, ox: 0, oy: 0, at: [3000, 3000] },
      moveMs: 1200,
      shotMs: 4200,
      pinYear: 1931,
      acts: [
        { k: "run", ms: 1000, to: 1933, curve: "even" },
        { k: "hold", ms: 2000 },
      ],
      plate: { title: "pinned", copy: "two events" },
    },
    {
      /* SAYS NOTHING. A film may carry a shot with no words on it. */
      id: "silent",
      cam: { z: 2, ox: 0, oy: 0 },
      moveMs: 1200,
      shotMs: 2200,
      acts: [{ k: "hold", ms: 1000 }],
    },
  ],
};

const CTX: FilmFrameCtx = {
  fit: { base: 0.02, bx: 1000, by: 800 },
  W: 1200,
  H: 800,
  proj: (x, y) => [x * 0.5 + y * 0.5, y * 0.25 - x * 0.25],
  elev: () => 0,
};

const tl = buildFilm(SCRIPT);
const ff = resolveFrames(SCRIPT, CTX);
const at = (t: number) => filmStateAt(SCRIPT, tl, ff, t, () => 3);
/** the first millisecond of a shot, and of one of its acts */
const shotT0 = (i: number) => tl.shotT0[i];
const actT0 = (id: string, ai: number) =>
  tl.segs.find((s) => s.ai === ai && SCRIPT.shots[s.si as number]?.id === id)!.t0;

describe("the still cards", () => {
  it("is up for the whole of the opening card and nowhere else in the film", () => {
    expect(cardAt(SCRIPT, tl, at(0))?.which).toBe("title");
    expect(cardAt(SCRIPT, tl, at(SCRIPT.titleMs - 1))?.which).toBe("title");
    expect(cardAt(SCRIPT, tl, at(SCRIPT.titleMs))).toBeNull();
    expect(cardAt(SCRIPT, tl, at(tl.total - 1))?.which).toBe("end");
  });

  it("washes the opening card OUT over its last stretch and the closing card IN over its first", () => {
    /* the city has to come up UNDER the words, so the opening card is fully
       opaque until the wash begins and is gone by the cut */
    expect(cardAt(SCRIPT, tl, at(0))?.alpha).toBe(1);
    expect(cardAt(SCRIPT, tl, at(SCRIPT.titleMs - CARD_WASH))?.alpha).toBe(1);
    const half = cardAt(SCRIPT, tl, at(SCRIPT.titleMs - CARD_WASH / 2))!.alpha;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(cardAt(SCRIPT, tl, at(SCRIPT.titleMs - 1))!.alpha).toBeLessThan(0.02);

    const endT0 = tl.total - SCRIPT.endMs;
    expect(cardAt(SCRIPT, tl, at(endT0))?.alpha).toBe(0);
    expect(cardAt(SCRIPT, tl, at(endT0 + CARD_WASH))?.alpha).toBe(1);
  });

  it("says nothing where the script carries no card", () => {
    const bare: FilmScript = { ...SCRIPT, titleCard: undefined, endCard: undefined };
    expect(cardAt(bare, tl, at(0))).toBeNull();
    expect(cardAt(bare, tl, at(tl.total - 1))).toBeNull();
  });
});

describe("the year the plate prints", () => {
  it("is the year the shot SETTLES on, from the shot's first frame — not the counter", () => {
    /* THE BUG THIS EXISTS TO PREVENT: the counter is at 1900 here and the
       sentence is about 1910. A plate reading 1900 over it is a wrong claim,
       not a rounding. */
    const t = shotT0(0);
    expect(at(t).year).toBe(1900);
    expect(plateYearAt(SCRIPT, tl, at(t))).toBe(1910);
    expect(plateYearAt(SCRIPT, tl, at(t + 3999))).toBe(1910);
  });

  it("counts with the counter where the shot says the climb is the subject", () => {
    const t0 = actT0("counts", 0);
    expect(plateYearAt(SCRIPT, tl, at(t0))).toBe(1910);
    expect(plateYearAt(SCRIPT, tl, at(t0 + 1000))).toBe(1920);
    expect(plateYearAt(SCRIPT, tl, at(t0 + 1999))).toBe(1929);
    /* and it holds where the shot holds */
    expect(plateYearAt(SCRIPT, tl, at(t0 + 2000))).toBe(1930);
    expect(plateYearAt(SCRIPT, tl, at(t0 + 3999))).toBe(1930);
  });

  it("prints the stated year where the shot pins one, whatever the counter is doing", () => {
    const t0 = shotT0(2);
    for (const dt of [0, 500, 1500, 4000]) {
      expect(plateYearAt(SCRIPT, tl, at(t0 + dt))).toBe(1931);
    }
    /* the FABRIC is still on the counter — the two are different questions */
    expect(at(t0 + 4000).year).toBe(1933);
  });

  it("falls back to the counter on the two cards, which sit outside every shot", () => {
    expect(plateYearAt(SCRIPT, tl, at(0))).toBe(1900);
    expect(plateYearAt(SCRIPT, tl, at(tl.total - 1))).toBe(1933);
  });
});

describe("which words are up", () => {
  it("cuts the words in at the same instant the camera cuts, travel included", () => {
    /* the rule the published film shipped the opposite of: for the whole of a
       camera move the plate carried a year and nothing to read */
    const move = tl.segs.find((s) => s.k === "move" && s.si === 2)!;
    expect(move.ms).toBeGreaterThan(0);
    expect(plateAt(SCRIPT, tl, at(move.t0))?.title).toBe("pinned");
    expect(plateAt(SCRIPT, tl, at(move.t0 + move.ms - 1))?.title).toBe("pinned");
  });

  it("holds them back through the travel and the named acts where the shot asks", () => {
    const move = tl.segs.find((s) => s.k === "move" && s.si === 1)!;
    expect(plateAt(SCRIPT, tl, at(move.t0))).toBeNull();
    expect(plateAt(SCRIPT, tl, at(actT0("counts", 0)))).toBeNull();
    expect(plateAt(SCRIPT, tl, at(actT0("counts", 0) + 1999))).toBeNull();
    expect(plateAt(SCRIPT, tl, at(actT0("counts", 1)))?.title).toBe("counting");
  });

  it("says nothing under a card, and nothing on a shot with no plate", () => {
    expect(plateAt(SCRIPT, tl, at(0))).toBeNull();
    expect(plateAt(SCRIPT, tl, at(tl.total - 1))).toBeNull();
    expect(plateAt(SCRIPT, tl, at(shotT0(3) + 1500))).toBeNull();
  });

  it("hands back the script's own object, so nothing here can rewrite a citation", () => {
    expect(plateAt(SCRIPT, tl, at(shotT0(0)))).toBe(SCRIPT.shots[0].plate);
  });
});

describe("the scanned page", () => {
  const page: FilmScanPage = {
    n: 1,
    src: "/somewhere/1.jpg",
    w: 1432,
    h: 1141,
    url: "https://example.org/8",
    vol: "a volume",
    page: "721",
    when: "a date",
    alt: "a page",
    hl: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.04 }],
  };

  it("stands beside the shot that names its number", () => {
    expect(scanFor([page], SCRIPT.shots[0].plate!)).toBe(page);
  });

  it("is absent where the shot names no page, where nobody cropped one, and with no words up", () => {
    expect(scanFor([page], SCRIPT.shots[1].plate!)).toBeNull();
    expect(scanFor([], SCRIPT.shots[0].plate!)).toBeNull();
    expect(scanFor(null, SCRIPT.shots[0].plate!)).toBeNull();
    expect(scanFor([page], null)).toBeNull();
  });
});
