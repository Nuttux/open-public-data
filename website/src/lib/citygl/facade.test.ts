import { describe, expect, it } from "vitest";

import {
  FA_HMAX_F,
  FA_TYPES,
  ROLE_BACK,
  ROLE_FRONT,
  ROLE_PARTY,
  faGlassy,
  faVocab,
  ST_SATURATED,
  storeysRead,
} from "@/lib/city/facades";
import {
  FACADE_BAND_M,
  FACADE_COLS,
  FACADE_ROWS,
  FACADE_TILES,
  FACADE_TINT_H,
  FACADE_TINT_MAX,
  FACADE_TINT_UNCLASSED,
  FACADE_TINT_V,
  TILE_BLANK,
  TILE_CURTAIN,
  TILE_DECK,
  TILE_PLAIN,
  TILE_PUNCHED,
  TILE_SASH,
  TILE_SHED,
  TILE_SHOPFRONT,
  facadeAtlas,
  facadeGroundTile,
  facadeModuleM,
  facadeTile,
  facadeTileUV,
  wallFacade,
  wallJitter,
  wallTint,
  type FacadeKey,
} from "./facade";

/**
 * WHAT THIS TEST IS FOR.
 *
 * The complaint was *"all buildings look kind of the same"*, and the failure
 * that caused it was invisible to every green suite there was: one texture,
 * handed to 166,166 walls, with nothing published anywhere near it. A picture
 * catches that and arithmetic does not — so what is asserted here is the three
 * properties that, if they hold, mean the picture cannot regress to it:
 *
 *  1. **the selection is a function of published columns and of nothing else**
 *     — same columns, same tile, every time and in any order;
 *  2. **every published class reaches a tile, and every tile is reached** —
 *     a vocabulary nothing selects is a cell of the atlas that is never drawn,
 *     and a class that falls through to a default is a building drawn as
 *     something the record did not say it was;
 *  3. **the colour spread is bounded by a number the renderer already
 *     declares** — a jitter that can reach the next entry of the material
 *     table has stopped being a spread and become a claim.
 */

const ERAS = [-1, 0, 1, 2, 3, 4] as const;
const ROLES = [ROLE_BACK, ROLE_FRONT, ROLE_PARTY] as const;

function key(o: Partial<FacadeKey> & { type: number; era: number }): FacadeKey {
  return {
    type: o.type,
    era: o.era,
    storeys: o.storeys ?? 3,
    shop: o.shop ?? false,
    role: o.role ?? ROLE_BACK,
    glassy: o.glassy ?? (o.era >= 0 && faGlassy(o.type, o.era)),
  };
}

/** every combination of published columns the two chunks can actually ship */
function everyKey(): FacadeKey[] {
  const out: FacadeKey[] = [];
  for (let type = 0; type < FA_TYPES.length; type++) {
    for (const era of ERAS) {
      for (const role of ROLES) {
        for (const shop of [false, true]) {
          for (const storeys of [0, 1, 3, 15]) {
            out.push(key({ type, era, role, shop, storeys }));
          }
        }
      }
    }
  }
  return out;
}

describe("facadeTile — the selection is the published columns", () => {
  it("is deterministic", () => {
    for (const k of everyKey()) {
      const first = facadeTile(k);
      for (let i = 0; i < 8; i++) expect(facadeTile(k)).toBe(first);
      /* and it does not depend on the object, only on its values */
      expect(facadeTile({ ...k })).toBe(first);
    }
  });

  it("maps every published type, in every era, to a real tile", () => {
    for (const k of everyKey()) {
      const t = facadeTile(k);
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(FACADE_TILES.length);
    }
  });

  it("gives every one of the ten published types a tile on a plain wall", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of [0, 1, 2, 3, 4]) {
        const t = facadeTile(key({ type, era, role: ROLE_FRONT }));
        expect(t, `${FA_TYPES[type]} era ${era}`).not.toBe(TILE_BLANK);
        expect(t).toBeLessThan(FACADE_TILES.length);
      }
    }
  });

  it("leaves no cell of the atlas unreachable", () => {
    const seen = new Set<number>();
    for (const k of everyKey()) {
      seen.add(facadeTile(k));
      const gr = facadeGroundTile(k);
      if (gr >= 0) seen.add(gr);
    }
    for (let i = 0; i < FACADE_TILES.length; i++) {
      expect(seen.has(i), `${FACADE_TILES[i]} is never selected`).toBe(true);
    }
  });

  it("holds the whole atlas in its declared grid", () => {
    expect(FACADE_COLS * FACADE_ROWS).toBeGreaterThanOrEqual(FACADE_TILES.length);
  });
});

describe("facadeTile — the record's own refusals bind first", () => {
  it("gives a measured party edge a blank wall, whatever the class says", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of ERAS) {
        for (const shop of [false, true]) {
          expect(facadeTile(key({ type, era, shop, role: ROLE_PARTY }))).toBe(TILE_BLANK);
        }
      }
    }
  });

  it("gives a wall with no published and no derived rhythm a blank wall", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of ERAS) {
        expect(facadeTile(key({ type, era, storeys: 0 }))).toBe(TILE_BLANK);
      }
    }
  });

  it("sends no class and no year to the UNCLASSED row", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      expect(facadeTile(key({ type, era: -1, role: ROLE_FRONT }))).toBe(TILE_PLAIN);
    }
    for (const era of [0, 2, 4]) {
      expect(facadeTile(key({ type: -1, era }))).toBe(TILE_PLAIN);
      expect(facadeTile(key({ type: FA_TYPES.length, era }))).toBe(TILE_PLAIN);
    }
  });
});

describe("facadeTile — which column picks which vocabulary", () => {
  const T = (n: string): number => FA_TYPES.indexOf(n);

  it("splits the punched wall on the roll's own era bands", () => {
    for (const type of ["HOUSE", "FLATS", "APARTMENT", "HOTEL", "INSTITUTION"]) {
      expect(facadeTile(key({ type: T(type), era: 0 }))).toBe(TILE_SASH);
      expect(facadeTile(key({ type: T(type), era: 1 }))).toBe(TILE_SASH);
      expect(facadeTile(key({ type: T(type), era: 2 }))).toBe(TILE_PUNCHED);
      expect(facadeTile(key({ type: T(type), era: 3 }))).toBe(TILE_PUNCHED);
    }
  });

  it("gives a curtain wall exactly where faGlassy does", () => {
    /* `faGlassy`: era >= 4 of any class, or an OFFICE from 1950 on */
    expect(facadeTile(key({ type: T("OFFICE"), era: 3 }))).toBe(TILE_CURTAIN);
    expect(facadeTile(key({ type: T("OFFICE"), era: 4 }))).toBe(TILE_CURTAIN);
    expect(facadeTile(key({ type: T("OFFICE"), era: 2 }))).toBe(TILE_PUNCHED);
    for (const type of ["HOUSE", "FLATS", "APARTMENT", "RETAIL", "HOTEL", "INSTITUTION"]) {
      expect(facadeTile(key({ type: T(type), era: 4 }))).toBe(TILE_CURTAIN);
      expect(facadeTile(key({ type: T(type), era: 3 }))).toBe(TILE_PUNCHED);
    }
  });

  it("keeps a shed a shed in every era, including one faGlassy calls glassy", () => {
    for (const era of [0, 1, 2, 3, 4]) {
      expect(facadeTile(key({ type: T("INDUSTRIAL"), era }))).toBe(TILE_SHED);
      expect(facadeTile(key({ type: T("GARAGE"), era }))).toBe(TILE_DECK);
    }
    /* the departure this is guarding: faGlassy says yes and the shape still wins */
    expect(faGlassy(T("INDUSTRIAL"), 4)).toBe(true);
    expect(facadeTile(key({ type: T("INDUSTRIAL"), era: 4, glassy: true }))).toBe(TILE_SHED);
  });
});

describe("facadeGroundTile — the shopfront, and the two features a tile cannot place", () => {
  const T = (n: string): number => FA_TYPES.indexOf(n);

  it("gives a shopfront to the published shop bit and to RETAIL, on a front wall", () => {
    expect(facadeGroundTile(key({ type: T("RETAIL"), era: 2, role: ROLE_FRONT })))
      .toBe(TILE_SHOPFRONT);
    for (let type = 0; type < FA_TYPES.length - 1; type++) {
      /* the shop bit is a reading of a column and overrides the class */
      expect(
        facadeGroundTile(key({ type, era: 2, shop: true, role: ROLE_FRONT })),
        FA_TYPES[type],
      ).toBe(TILE_SHOPFRONT);
    }
  });

  it("refuses a ground band on a back wall, a party wall and an undated parcel", () => {
    for (const role of [ROLE_BACK, ROLE_PARTY]) {
      expect(facadeGroundTile(key({ type: T("RETAIL"), era: 2, role }))).toBe(-1);
    }
    expect(facadeGroundTile(key({ type: T("RETAIL"), era: -1, role: ROLE_FRONT }))).toBe(-1);
    expect(facadeGroundTile(key({ type: T("RETAIL"), era: 2, role: ROLE_FRONT, storeys: 0 })))
      .toBe(-1);
  });

  it("draws no door and no garage opening, because doorBay places them in ONE bay", () => {
    for (const type of ["HOUSE", "FLATS", "APARTMENT", "OFFICE", "INSTITUTION", "HOTEL"]) {
      expect(facadeGroundTile(key({ type: T(type), era: 2, role: ROLE_FRONT }))).toBe(-1);
    }
    for (const type of ["INDUSTRIAL", "GARAGE"]) {
      expect(facadeGroundTile(key({ type: T(type), era: 2, role: ROLE_FRONT }))).toBe(-1);
    }
  });
});

describe("facadeModuleM — the bay rhythm is published, not nominal", () => {
  it("is faVocab's own module", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of ERAS) {
        const k = key({ type, era });
        expect(facadeModuleM(k)).toBe(faVocab(type, era, false).mod);
      }
    }
  });

  it("actually differs across the published classes", () => {
    const mods = new Set<number>();
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of [0, 1, 2, 3, 4]) mods.add(facadeModuleM(key({ type, era })));
    }
    /* one nominal BAY_M was the old behaviour; the published table is not one
       number, and a wall of a given length must not always take the same bays */
    expect(mods.size).toBeGreaterThan(15);
    expect(Math.min(...mods)).toBeLessThan(3.5);
    expect(Math.max(...mods)).toBeGreaterThan(7.5);
  });
});

describe("wallFacade — one call per wall", () => {
  it("agrees with its parts", () => {
    for (const k of everyKey()) {
      const f = wallFacade(k);
      expect(f.body).toBe(facadeTile(k));
      expect(f.ground).toBe(facadeGroundTile(k));
      expect(f.moduleM).toBe(facadeModuleM(k));
      expect(f.bands).toBe(k.storeys > 0 ? k.storeys : 0);
      expect(f.moduleM).toBeGreaterThan(0);
    }
  });

  it("gives a blank body wherever it reports no bands", () => {
    for (const k of everyKey()) {
      const f = wallFacade(k);
      if (f.bands === 0) expect(f.body).toBe(TILE_BLANK);
    }
  });
});

describe("FACADE_BAND_M — the tile is a fraction of its band, not a fitted storey", () => {
  it("never lets a metre cap bind, over all fifty published conventions", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of [0, 1, 2, 3, 4]) {
        const v = faVocab(type, era, false);
        const frac = FACADE_BAND_M * Math.min(FA_HMAX_F, v.hf);
        expect(frac, `${FA_TYPES[type]} era ${era}`).toBeLessThan(v.hx);
      }
    }
  });
});

describe("wallTint — a spread, never a claim", () => {
  const HASHES = 4000;

  it("is bounded on every channel", () => {
    for (let h = 0; h < HASHES; h++) {
      for (const k of [
        key({ type: 0, era: 0 }),
        key({ type: 4, era: 4 }),
        key({ type: -1, era: 2 }),
        key({ type: 3, era: -1 }),
      ]) {
        const t = wallTint(k, h);
        for (const c of [t.r, t.g, t.b]) {
          expect(Math.abs(c - 1)).toBeLessThanOrEqual(FACADE_TINT_MAX);
          expect(c).toBeGreaterThan(0);
        }
        /* the value alone is inside its own constant, and the tilt inside its */
        expect(Math.abs(t.g - 1)).toBeLessThanOrEqual(FACADE_TINT_V);
        const tilt = (t.r - t.b) / (2 * t.g);
        expect(Math.abs(tilt)).toBeLessThanOrEqual(FACADE_TINT_H + 1e-12);
      }
    }
  });

  it("stays under one RSHADE step between two neighbours at opposite extremes", () => {
    /* `materials.ts` gives a roof four shades of its own colour so two
       neighbours do not read as one roof; RSHADE's smallest adjacent step is
       0.958 - 0.875 = 0.083, and that is the ceiling this may not reach. */
    expect(2 * FACADE_TINT_V).toBeLessThan(0.083);
  });

  it("is deterministic and independent of call order", () => {
    const a = wallTint(key({ type: 2, era: 1 }), 123456789);
    for (let i = 0; i < 100; i++) wallTint(key({ type: 5, era: 3 }), i);
    const b = wallTint(key({ type: 2, era: 1 }), 123456789);
    expect(b).toEqual(a);
    expect(wallTint(key({ type: 2, era: 1 }), 0)).toEqual(
      wallTint(key({ type: 2, era: 1 }), 0),
    );
  });

  it("adds no systematic shift — the material table is still the mean", () => {
    let sum = 0;
    let sr = 0;
    let sb = 0;
    const k = key({ type: 1, era: 2 });
    for (let h = 0; h < HASHES; h++) {
      const t = wallTint(k, h);
      sum += t.g;
      sr += t.r;
      sb += t.b;
    }
    expect(Math.abs(sum / HASHES - 1)).toBeLessThan(0.002);
    expect(Math.abs(sr / HASHES - 1)).toBeLessThan(0.002);
    expect(Math.abs(sb / HASHES - 1)).toBeLessThan(0.002);
  });

  it("actually separates neighbours — consecutive ids do not share a value", () => {
    const k = key({ type: 1, era: 2 });
    const seen = new Set<string>();
    for (let h = 1000; h < 3000; h++) seen.add(wallTint(k, h).g.toFixed(4));
    expect(seen.size).toBeGreaterThan(400);
    /* consecutive gids are neighbours on the ground: their tints must not be
       a ramp, which is what an unmixed hash would give */
    let rising = 0;
    for (let h = 0; h < 500; h++) {
      if (wallTint(k, h + 1).g > wallTint(k, h).g) rising++;
    }
    expect(rising).toBeGreaterThan(180);
    expect(rising).toBeLessThan(320);
  });

  it("gives a footprint the roll does not class a tighter spread", () => {
    let classed = 0;
    let none = 0;
    for (let h = 0; h < HASHES; h++) {
      classed += Math.abs(wallTint(key({ type: 1, era: 2 }), h).g - 1);
      none += Math.abs(wallTint(key({ type: -1, era: 2 }), h).g - 1);
    }
    expect(none / classed).toBeGreaterThan(FACADE_TINT_UNCLASSED - 0.05);
    expect(none / classed).toBeLessThan(FACADE_TINT_UNCLASSED + 0.05);
  });
});

describe("facadeAtlas", () => {
  it("returns null where there is no document, so a server render cannot throw", () => {
    expect(typeof document).toBe("undefined");
    expect(facadeAtlas()).toBeNull();
    expect(facadeAtlas(2)).toBeNull();
  });
});

describe("facadeTileUV — the atlas is addressable, and the flip is accounted for", () => {
  const CELL = FACADE_COLS * FACADE_ROWS;

  it("gives every tile a rectangle inside the sheet", () => {
    for (let i = 0; i < FACADE_TILES.length; i++) {
      const r = facadeTileUV(i);
      expect(r.sx).toBeCloseTo(1 / FACADE_COLS, 12);
      expect(r.sy).toBeCloseTo(1 / FACADE_ROWS, 12);
      expect(r.ox).toBeGreaterThanOrEqual(0);
      expect(r.oy).toBeGreaterThanOrEqual(0);
      expect(r.ox + r.sx).toBeLessThanOrEqual(1 + 1e-12);
      expect(r.oy + r.sy).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it("gives no two tiles the same rectangle, so a cell addresses one vocabulary", () => {
    const seen = new Set<string>();
    for (let i = 0; i < CELL; i++) {
      const r = facadeTileUV(i);
      seen.add(`${r.ox},${r.oy}`);
    }
    expect(seen.size).toBe(CELL);
  });

  it("lays the cells out in FACADE_TILES order across, and flips the row for uv space", () => {
    for (let i = 0; i < CELL; i++) {
      const r = facadeTileUV(i);
      const col = i % FACADE_COLS;
      const row = Math.floor(i / FACADE_COLS);
      expect(r.ox).toBeCloseTo(col / FACADE_COLS, 12);
      /* row 0 is drawn at the TOP of the canvas and flipY puts it at the TOP
         of uv space, which is the HIGHEST oy — not the lowest. Getting this
         backwards would draw every building as the tile two cells away. */
      expect(r.oy).toBeCloseTo((FACADE_ROWS - 1 - row) / FACADE_ROWS, 12);
    }
    expect(facadeTileUV(0).oy).toBeGreaterThan(facadeTileUV(CELL - 1).oy);
  });

  it("maps an in-cell point back into that cell and nowhere else", () => {
    for (let i = 0; i < CELL; i++) {
      const r = facadeTileUV(i);
      for (const [u, v] of [[0.001, 0.001], [0.5, 0.5], [0.999, 0.999], [3.25, 7.75]] as const) {
        const su = r.ox + (u - Math.floor(u)) * r.sx;
        const sv = r.oy + (v - Math.floor(v)) * r.sy;
        expect(Math.floor(su * FACADE_COLS)).toBe(i % FACADE_COLS);
        expect(Math.floor((1 - sv) * FACADE_ROWS)).toBe(Math.floor(i / FACADE_COLS));
      }
    }
  });

  it("degrades an out-of-range index to the blank wall, never to another vocabulary", () => {
    for (const bad of [-1, CELL, CELL + 9, 1.5, NaN]) {
      expect(facadeTileUV(bad)).toEqual(facadeTileUV(TILE_BLANK));
    }
  });

  it("addresses a real cell for every tile facadeTile can return", () => {
    for (const k of everyKey()) {
      const r = facadeTileUV(facadeTile(k));
      expect(Number.isFinite(r.ox) && Number.isFinite(r.oy)).toBe(true);
    }
  });

  it("returns plain numbers, not something shaped like a Vector2", () => {
    const r = facadeTileUV(TILE_PUNCHED);
    for (const n of [r.ox, r.oy, r.sx, r.sy]) expect(typeof n).toBe("number");
  });
});

describe("wallJitter — a bounded, deterministic multiplier", () => {
  const IDS = Array.from({ length: 4000 }, (_, i) => i);

  it("is bounded by the magnitude it declares", () => {
    for (const gid of IDS) {
      const j = wallJitter(gid);
      expect(j).toBeGreaterThanOrEqual(1 - FACADE_TINT_V);
      expect(j).toBeLessThanOrEqual(1 + FACADE_TINT_V);
    }
  });

  it("stays under one RSHADE step between two walls at opposite extremes", () => {
    /* the renderer's own smallest adjacent roof shade step: two neighbours
       may not be pushed further apart than the gap it already calls one
       material. */
    const RSHADE_MIN_STEP = 0.083;
    expect(2 * FACADE_TINT_V).toBeLessThan(RSHADE_MIN_STEP);
    let lo = Infinity;
    let hi = -Infinity;
    for (const gid of IDS) {
      const j = wallJitter(gid);
      lo = Math.min(lo, j);
      hi = Math.max(hi, j);
    }
    expect(hi - lo).toBeLessThan(RSHADE_MIN_STEP);
  });

  it("is deterministic and independent of call order", () => {
    const fwd = IDS.map(wallJitter);
    const back = [...IDS].reverse().map(wallJitter).reverse();
    expect(back).toEqual(fwd);
    expect(IDS.map(wallJitter)).toEqual(fwd);
  });

  it("actually separates neighbours — consecutive ids do not share a value", () => {
    let same = 0;
    for (let i = 1; i < IDS.length; i++) {
      if (wallJitter(IDS[i]) === wallJitter(IDS[i - 1])) same++;
    }
    expect(same).toBe(0);
  });

  it("does not lay a gradient across a block — consecutive ids are not monotone", () => {
    let up = 0;
    for (let i = 1; i < 200; i++) if (wallJitter(i) > wallJitter(i - 1)) up++;
    expect(up).toBeGreaterThan(60);
    expect(up).toBeLessThan(140);
  });

  it("adds no systematic shift — the material table is still the mean", () => {
    let sum = 0;
    for (const gid of IDS) sum += wallJitter(gid);
    expect(sum / IDS.length).toBeCloseTo(1, 3);
  });

  it("is exactly wallTint's value axis for a classed footprint", () => {
    for (let type = 0; type < FA_TYPES.length; type++) {
      for (const era of [0, 1, 2, 3, 4]) {
        const k = key({ type, era });
        if (FA_TYPES[type] === "UNCLASSED") continue;
        for (const gid of [0, 1, 7, 4242, 166165]) {
          expect(wallTint(k, gid).g).toBeCloseTo(wallJitter(gid), 12);
        }
      }
    }
  });

  it("survives the ids the chunk can actually ship, including 0 and the last", () => {
    for (const gid of [0, 1, 166165, 2 ** 31 - 1, -1]) {
      expect(Number.isFinite(wallJitter(gid))).toBe(true);
      expect(Math.abs(wallJitter(gid) - 1)).toBeLessThanOrEqual(FACADE_TINT_V);
    }
  });
});

describe("storeysRead — the roll's four-bit storey column saturates", () => {
  /* `roof-data.js` packs `st` as min(15, round(number_of_stories)) in a
     nibble, so 15 is "fifteen or more" and 255 footprints carry it. Read as
     an exact count it stretched the facade tile over the real wall — 6.4 m
     per drawn storey median, 17.3 m on a 260 m tower. */
  it("passes every exact published count straight through", () => {
    for (let st = 0; st < ST_SATURATED; st++) {
      expect(storeysRead(st, 200, 3.4)).toBe(st);
    }
  });

  it("leaves a genuine fifteen-storey building at fifteen", () => {
    /* about 48 m: round(48 / 3.4) is 14, under the saturation value */
    expect(storeysRead(ST_SATURATED, 48, 3.4)).toBe(ST_SATURATED);
  });

  it("reads the measured height where the count has saturated", () => {
    expect(storeysRead(ST_SATURATED, 148, 3.4)).toBe(44);
    expect(storeysRead(ST_SATURATED, 260, 3.4)).toBe(76);
  });

  it("never returns fewer than the roll's own floor", () => {
    /* the roll still says "at least fifteen"; a short measured height must
       not be allowed to contradict a published count downward */
    expect(storeysRead(ST_SATURATED, 10, 3.4)).toBe(ST_SATURATED);
  });

  it("refuses to divide by a height or a storey it does not have", () => {
    expect(storeysRead(ST_SATURATED, 0, 3.4)).toBe(ST_SATURATED);
    expect(storeysRead(ST_SATURATED, 148, 0)).toBe(ST_SATURATED);
  });
});

describe("the published UNCLASSED class takes the UNCLASSED row", () => {
  /* `FA_TYPES` carries "UNCLASSED" at index 9 — what build_facade.py writes
     for a parcel with no building class, 8,356 of 166,166. It is INSIDE
     FA_TYPES.length, so the out-of-range tests never caught it and every one
     of those footprints was given a classed sash or punched window grid. */
  const U = FA_TYPES.indexOf("UNCLASSED");

  const key = (over: Partial<FacadeKey> = {}): FacadeKey => ({
    type: U, era: 0, storeys: 3, shop: false, role: ROLE_FRONT, glassy: false, ...over,
  });

  it("gives it the plain tile in every era, not sash or punched", () => {
    for (let era = 0; era <= 4; era++) {
      expect(facadeTile(key({ era }))).toBe(TILE_PLAIN);
    }
  });

  it("still gives a CLASSED building of the same era its classed tile", () => {
    const flats = FA_TYPES.indexOf("FLATS");
    expect(facadeTile(key({ type: flats, era: 0 }))).toBe(TILE_SASH);
    expect(facadeTile(key({ type: flats, era: 3 }))).toBe(TILE_PUNCHED);
  });

  it("keeps the rules that outrank a class — a party wall and no storeys", () => {
    expect(facadeTile(key({ role: ROLE_PARTY }))).toBe(TILE_BLANK);
    expect(facadeTile(key({ storeys: 0 }))).toBe(TILE_BLANK);
  });

  it("matches what the published page's own vocabulary reaches", () => {
    /* `faVocab` looks its row up BY NAME, so index 9 already lands on the
       UNCLASSED row there. This is the test that the two agree. */
    expect(faVocab(U, 0, false).mod).toBe(faVocab(-1, -1, false).mod);
  });
});
