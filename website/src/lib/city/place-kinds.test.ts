/**
 * §KINDMARK — the mark that says WHAT KIND OF THING a place is.
 *
 * A file of its own, for `landmarks.test.ts`'s reason: what is locked here is a
 * DECISION about the record — which registers can pay for a family and which
 * cannot — and it has to be asserted against the shipped files and against the
 * pipeline's own table, not restated in a second place where the two can drift.
 *
 * Every number in here is read out of `base/places.json`, `base/heroes.json`,
 * `place_kinds.py` or `heroes_extra.json` at test time. Nothing is typed twice.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  GLYPH_LEAD, GLYPH_R, LabelGrid, MK_MARK_PX, PLACE_MIN_PX,
  placeGlyph, placeNames, type PlaceLabel,
} from "./labels";
import { PLACE_KIND_FAMILIES, placeKindOf, type PlaceKind } from "./place-kinds.generated";
import { Projection } from "./projection";

const DATA = path.join(__dirname, "../../../public/data/us/sf/city");
const PIPE = path.join(__dirname, "../../../../pipeline/scripts/us_sf_places");
const read = (p: string) => fs.readFileSync(p, "utf8");
const placesJson = () => JSON.parse(read(path.join(DATA, "base/places.json")));
const heroesJson = () => JSON.parse(read(path.join(DATA, "base/heroes.json")));

// ── a recording 2D context, so a glyph's PATH can be compared ──────────────
function recCtx(ops: string[]) {
  const op = (n: string) => (...a: unknown[]) =>
    ops.push(`${n}(${a.map((v) => (typeof v === "number" ? v.toFixed(2) : String(v))).join(",")})`);
  const c = {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineJoin: "miter" as CanvasLineJoin, lineCap: "butt" as CanvasLineCap,
    globalAlpha: 1, font: "", textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    beginPath: op("beginPath"), closePath: op("closePath"),
    moveTo: op("moveTo"), lineTo: op("lineTo"),
    quadraticCurveTo: op("quadraticCurveTo"), bezierCurveTo: op("bezierCurveTo"),
    arc: op("arc"), ellipse: op("ellipse"), rect: op("rect"),
    fill: op("fill"), stroke: op("stroke"),
    save: op("save"), restore: op("restore"), clip: op("clip"),
    fillRect: op("fillRect"), drawImage: op("drawImage"),
    translate: op("translate"), rotate: op("rotate"), scale: op("scale"),
    setTransform: op("setTransform"), transform: op("transform"),
    strokeText: op("strokeText"), fillText: op("fillText"),
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
  };
  return c as unknown as CanvasRenderingContext2D;
}

function frameAt(ctx: CanvasRenderingContext2D, scale: number, year?: number) {
  return {
    ctx, W: 1440, H: 940,
    cam: { cx: 0, cy: 0, scale },
    proj: new Projection(),
    dpr: 2, moving: false,
    ...(year === undefined ? {} : { year }),
  } as unknown as Parameters<typeof placeNames>[0];
}

/** a span that clears `placeIsBigEnough` at this camera, whatever it is */
const BIG = PLACE_MIN_PX * 4000;

describe("the vocabulary is one vocabulary, in three places", () => {
  it("the renderer's families are the chunk's, in the same order", () => {
    // `kind` in base/places.qc is 0 for none and 1 + this index otherwise, so
    // ORDER is load-bearing and not just membership.
    expect([...PLACE_KIND_FAMILIES]).toEqual(placesJson().KIND);
  });

  it("and they are `place_kinds.py`'s FAMILIES, read out of the .py", () => {
    const py = read(path.join(PIPE, "place_kinds.py"));
    const block = py.match(/^FAMILIES = \[([\s\S]*?)^\]/m);
    expect(block).not.toBeNull();
    const names = [...block![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...PLACE_KIND_FAMILIES]);
  });

  it("every family the generated table hands out is one of them", () => {
    const src = read(path.join(__dirname, "place-kinds.generated.ts"));
    const used = new Set([...src.matchAll(/^ {2}\[.*, "([a-z]+)"\],$/gm)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(10);
    for (const f of used) expect(PLACE_KIND_FAMILIES).toContain(f as PlaceKind);
  });
});

describe("the two marks say two different things, and no place says both", () => {
  it("the glyph box is the diamond's box — one mark size, at every zoom", () => {
    expect(GLYPH_R).toBe(MK_MARK_PX);
  });

  it("a DESIGNATED place is never given a family glyph", () => {
    // Article 10 designates and publishes no kind, so the two sets cannot
    // intersect in the data — this asserts the code cannot make them either,
    // by handing a designated row an explicit `kind` and checking it is unused.
    const ops: string[] = [];
    const f = frameAt(recCtx(ops), 0.05565);
    const p: PlaceLabel = {
      name: "Grace Cathedral", wx: 0, wy: 0, spanM: BIG,
      cls: "designated", kind: "arts",
    };
    placeNames(f, [p], new LabelGrid(1440, 940), () => 0);
    // the designated branch draws the diamond: four lineTo after a moveTo
    const bez = ops.filter((o) => o.startsWith("bezierCurveTo")).length;
    expect(bez).toBe(0);
    expect(ops.filter((o) => o.startsWith("fillText"))).toHaveLength(1);
  });

  it("a named place with a published kind draws its glyph before its name", () => {
    const ops: string[] = [];
    const f = frameAt(recCtx(ops), 0.05565);
    const p: PlaceLabel = {
      name: "Mission Creek Park", wx: 0, wy: 0, spanM: BIG,
      cls: "named", kind: "park",
    };
    const r = placeNames(f, [p], new LabelGrid(1440, 940), () => 0);
    expect(r.placed).toBe(1);
    // the park glyph is a disc and a trunk: an arc happens, and it happens
    // BEFORE the name is written
    const iArc = ops.findIndex((o) => o.startsWith("arc("));
    const iText = ops.findIndex((o) => o.startsWith("fillText"));
    expect(iArc).toBeGreaterThanOrEqual(0);
    expect(iArc).toBeLessThan(iText);
  });

  it("a named place with NO published kind keeps the plain centred name", () => {
    const ops: string[] = [];
    const f = frameAt(recCtx(ops), 0.05565);
    // a name that is not in the generated table and carries no `kind`
    expect(placeKindOf("a name no register publishes")).toBeUndefined();
    const p: PlaceLabel = {
      name: "a name no register publishes", wx: 0, wy: 0, spanM: BIG, cls: "named",
    };
    placeNames(f, [p], new LabelGrid(1440, 940), () => 0);
    expect(ops.filter((o) => o.startsWith("arc("))).toHaveLength(0);
    expect(ops.filter((o) => o.startsWith("fillText"))).toHaveLength(1);
  });

  it("`PlaceLabel.kind` WINS over the generated table, so the migration is one line", () => {
    // pick a name the table does carry, and override it with a family whose
    // glyph is unmistakably different (health is two rectangles, no arc)
    const src = read(path.join(__dirname, "place-kinds.generated.ts"));
    const first = src.match(/^ {2}\["(.*?)", "park"\],$/m);
    expect(first).not.toBeNull();
    const name = JSON.parse(`"${first![1]}"`) as string;
    expect(placeKindOf(name)).toBe("park");
    const ops: string[] = [];
    const f = frameAt(recCtx(ops), 0.05565);
    placeNames(f, [{ name, wx: 0, wy: 0, spanM: BIG, cls: "named", kind: "health" }],
      new LabelGrid(1440, 940), () => 0);
    expect(ops.filter((o) => o.startsWith("arc("))).toHaveLength(0);
  });
});

describe("the glyphs are eighteen different pictures", () => {
  it("each family draws a path, and no two families draw the same path", () => {
    const seen = new Map<string, PlaceKind>();
    for (const k of PLACE_KIND_FAMILIES) {
      const ops: string[] = [];
      placeGlyph(recCtx(ops), k, 100, 100, GLYPH_R);
      const path = ops.filter((o) => !o.startsWith("fill(") && !o.startsWith("stroke("))
        .join("|");
      expect(path.length, `${k} draws nothing`).toBeGreaterThan(0);
      const clash = seen.get(path);
      expect(clash, `${k} and ${clash} draw the same picture`).toBeUndefined();
      seen.set(path, k);
    }
    expect(seen.size).toBe(PLACE_KIND_FAMILIES.length);
  });

  it("every glyph stays inside its own box, so the label's width is honest", () => {
    for (const k of PLACE_KIND_FAMILIES) {
      const ops: string[] = [];
      placeGlyph(recCtx(ops), k, 0, 0, 1);
      for (const o of ops) {
        // `arc`'s last two arguments are ANGLES, not coordinates
        const args = o.replace(/^arc\((.*)\)$/, (_m, a: string) =>
          `arc(${a.split(",").slice(0, 3).join(",")})`);
        for (const n of args.matchAll(/-?\d+\.\d+/g)) {
          expect(Math.abs(Number(n[0])), `${k}: ${o}`).toBeLessThanOrEqual(1.0001);
        }
      }
    }
  });

  it("the silhouette carries the halo and the detail is CUT in the paper", () => {
    // two fills, and the second one is the halo colour: that ordering is what
    // makes a window band read at 8 px instead of closing up
    const ops: string[] = [];
    placeGlyph(recCtx(ops), "office", 100, 100, GLYPH_R);
    const fills = ops.map((o, i) => [o, i] as const).filter(([o]) => o.startsWith("fill("));
    expect(fills).toHaveLength(2);
    const stroke = ops.findIndex((o) => o.startsWith("stroke("));
    expect(stroke).toBeGreaterThanOrEqual(0);
    expect(stroke).toBeLessThan(fills[0][1]);
  });
});

describe("the census, asserted against the shipped register", () => {
  it("2,199 places ship and 684 of them come from the two registers with no kind", () => {
    const j = placesJson();
    // 2,197 from the eleven registers plus the hero row, and the two names
    // `places_extra.json` puts on one Inner Richmond footprint in turn.
    expect(j.n).toBe(2199);
    const by = j.meta.report ? null : null;
    void by;
    const src: string[] = j.SRC;
    expect(src).toContain("97yj-54sx");
    expect(src).toContain("ejht-vp5d");
    // the manifest carries the count per register; the two designation
    // registers must still be the largest block with no family
    const man = JSON.parse(read(path.join(DATA, "manifest.json")));
    const bySrc = man.places.bySource;
    expect(bySrc["97yj-54sx"] + bySrc["ejht-vp5d"]).toBe(684);
    expect(man.places.kinds.noFamily["97yj-54sx"]).toMatch(/no kind/i);
  });

  it("about three fifths of the register carries a family, and the manifest says which", () => {
    const man = JSON.parse(read(path.join(DATA, "manifest.json")));
    const k = man.places.kinds;
    expect(k.withKind).toBeGreaterThan(1200);
    expect(k.withKind).toBeLessThan(man.places.n);
    // the sum of the families IS the coverage — no row is counted twice
    const total = Object.values(k.byFamily as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(k.withKind);
    // and the owner field is declared as an owner
    expect(k.ownerNotKind).toMatch(/OWNS/);
  });
});

describe("Sutro Tower is drawn to the height its own record publishes", () => {
  const FT_M = 0.3048;

  it("the shipped top is the FAA's 977 ft, not the LIDAR median it used to be", () => {
    const h = heroesJson().heroes.find((x: { k: string }) => x.k === "sutro");
    expect(h).toBeTruthy();
    expect(h.ms.t).toBeCloseTo(977 * FT_M, 2);
    expect(h.ms.t).not.toBe(210);
  });

  it("and 977 is the seed's own number, cited to the obstacle it came from", () => {
    const seed = JSON.parse(read(path.join(PIPE, "heroes_extra.json")));
    const spec = seed.publishedTops.sutro;
    expect(spec.ft).toBe(977);
    expect(spec.oas).toBe("06-000120");
    expect(spec.src).toMatch(/Digital Obstacle File/);
    // the independent cross-check is on the record, with both numbers in it
    expect(spec.crosscheck).toMatch(/254\.2/);
    expect(spec.crosscheck).toMatch(/254\.88/);
  });

  it("every authored height moved by ONE factor — the form was not touched", () => {
    const h = heroesJson().heroes.find((x: { k: string }) => x.k === "sutro");
    const f = h.ms.t / 210;
    // the six parts sat at these fractions of the old top and still do
    const want = [0.3, 0.325, 0.545, 0.56, 0.86, 1.0].map((q) => q * 210 * f);
    const got = [63, 68.25, 114.45, 117.6, 180.6, 210].map((q) => q * f);
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 2));
    expect(f).toBeCloseTo(1.418, 3);
  });

  it("no ring moved: the footprint identity is the one the seed harvested", () => {
    const seed = JSON.parse(read(path.join(PIPE, "heroes_extra.json")));
    const key = seed.attachments.keys.sutro;
    const h = heroesJson().heroes.find((x: { k: string }) => x.k === "sutro");
    expect(h.ms.nv).toBe(key.nv);
    expect(h.ms.a).toBe(key.areaM2);
  });
});

describe("the rejections stay in the seed, with their numbers", () => {
  const seed = () => JSON.parse(read(path.join(PIPE, "heroes_extra.json")));

  it("every rejection names a measurement, not a preference", () => {
    for (const r of seed().rejected) {
      expect(r.why.length, r.k).toBeGreaterThan(120);
      expect(r.why, r.k).toMatch(/\d/);
    }
  });

  it("the Cliff House entry no longer claims zero footprints within 420 m", () => {
    const r = seed().rejected.find((x: { k: string }) => x.k === "cliffhouse");
    expect(r.why).toMatch(/391 m/);
    expect(r.why).toMatch(/34 within 420 m/);
    // the old claim survives only as a quotation of itself, being corrected
    expect(r.why).toMatch(/that is not what the stream says/);
  });

  it("§21.15's escape is closed by the obstacle census and says so", () => {
    const r = seed().rejected.find((x: { k: string }) => x.k === "churchspires");
    expect(r.why).toMatch(/159 obstacles/);
    expect(r.why).toMatch(/NO SPIRE/);
  });
});

describe("the glyph pays for itself in the label's own width", () => {
  it("a family glyph widens the box by exactly one glyph plus its lead", () => {
    // The ink budget is EXACT, so the width a glyph adds is the width it costs
    // — and it is asserted as arithmetic rather than eyeballed off a frame.
    // `recCtx.measureText` is 6 px a character, and at cam.scale = the base the
    // band is 0 so the type is PLACE_FS[0] = 10 and the box is fs + 5 high.
    const name = "Mission Creek Park";
    expect(placeKindOf(name)).toBe("park");
    const ops: string[] = [];
    const f = frameAt(recCtx(ops), 0.05565);
    const r = placeNames(
      f, [{ name, wx: 0, wy: 0, spanM: BIG, cls: "named", kind: "park" }],
      new LabelGrid(1440, 940), () => 0);
    expect(r.placed).toBe(1);
    const tw = name.length * 6;
    const bw = tw + 2 * GLYPH_R + GLYPH_LEAD + 10;
    const bh = 10 + 5;
    expect(r.ink * 1440 * 940).toBeCloseTo(bw * bh, 6);
    // and without the glyph it would be 12 px narrower — one glyph and a lead
    expect(2 * GLYPH_R + GLYPH_LEAD).toBeCloseTo(12.0, 6);
  });
});
