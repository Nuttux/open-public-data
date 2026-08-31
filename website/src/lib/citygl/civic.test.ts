import { describe, expect, it } from "vitest";

import { civicFormOf, civicIndex, isChurchName } from "./civic";

/**
 * WHAT THIS TEST IS FOR.
 *
 * Every name below is a real row in the shipped `base/marks.json`. The rule
 * this file guards is a REGEX over names people wrote, which is the kind of
 * rule that works on the twenty examples it was written from and then puts a
 * steeple on a block of flats. So the cases are the actual collisions, taken
 * from the file rather than imagined.
 */
describe("who gets a steeple", () => {
  it("finds the churches, synagogues and chapels", () => {
    for (const n of [
      "Grace Cathedral",
      "First Unitarian Church",
      "Calvary Presbyterian Church",
      "St. Joseph's Church and Complex",
      "Old St. Mary's Church",
      "Sacred Heart Parish Complex",
      "St. Brigid's Church",
      "Trinity Episcopal Church",
      "Temple Sherith Israel",
      "Ohabai Shalome/Bush Street Temple",
      "Saint Patrick's Church",
      "St. John's Presbyterian Church",
      "First Congregational Church",
      "Christian Science Church",
    ]) expect(isChurchName(n), n).toBe(true);
  });

  it("refuses the buildings that share the words", () => {
    /* every one of these is in the shipped file and not one has a steeple */
    for (const n of [
      "Cathedral Apartments",
      "Cathedral Hill Tower",
      "Shriners' Hospital for Crippled Children",
      "MASONIC TEMPLE",
      "ODD FELLOWS TEMPLE",
      "San Francisco Labor Temple",
      "Islam Temple (Alcazar Theater)",
      "Golden Gate Commandery of the Knights Templar (Macedonia Baptist)",
      "Orders of Foresters / Baha'I Temple",
    ]) expect(isChurchName(n), n).toBe(false);
  });

  it("a church beats its register family, and the families map as declared", () => {
    /* a church that also lands in a family is still a church */
    expect(civicFormOf("St. Ignatius Church", "school")).toBe("church");
    expect(civicFormOf("Fire Station #4", "fire")).toBe("firehouse");
    expect(civicFormOf("Davies Symphony Hall", "arts")).toBe("monument");
    expect(civicFormOf("San Francisco Main Library", "library")).toBe("monument");
    expect(civicFormOf("Bill Graham Civic Auditorium", "civic")).toBe("monument");
    expect(civicFormOf("Pier 48 - Shed A", "port")).toBe("shed");
    expect(civicFormOf("Lowell High", "school")).toBe("school");
    /* and the families the drawing has nothing to say about are left alone */
    for (const k of ["works", "transit", "police", "health", "home", "hotel", "office", "park"] as const) {
      expect(civicFormOf("Some Building", k), k).toBeNull();
    }
  });
});

describe("civicIndex", () => {
  /** build a marks-shaped input the way the shipped file is encoded */
  function marks(rows: [string, number, number][], KIND: string[]) {
    const bi = new Int32Array(rows.length);
    const kb = new Uint8Array(rows.length);
    rows.forEach(([, b, k], i) => { bi[i] = b; kb[i] = k; });
    const enc = (u: Uint8Array): string => {
      let s = ""; for (const v of u) s += String.fromCharCode(v);
      return btoa(s);
    };
    return {
      t: rows.map((r) => r[0]),
      b: enc(new Uint8Array(bi.buffer)),
      k: enc(kb),
      KIND,
    };
  }
  const KIND = ["park", "garden", "plaza", "water", "sport", "library", "school",
    "fire", "police", "transit", "port", "health", "arts", "civic", "works",
    "home", "hotel", "office"];

  it("reads the ONE-BASED kind byte", () => {
    /* the byte for `fire` is 8, not 7. Read as a plain index every row comes
       back as the family before its own — fire as police, school as fire —
       and the census still adds up, which is why this is asserted. */
    const m = marks([["Fire Station #4", 100, 8], ["Lowell High", 101, 7]], KIND);
    const idx = civicIndex(m);
    expect(idx.get(100)).toBe("firehouse");
    expect(idx.get(101)).toBe("school");
  });

  it("skips places that are not on a footprint, and keeps the first of a pair", () => {
    const m = marks([
      ["Golden Gate Park", -1, 1],
      ["Grace Cathedral", 200, 0],
      ["Grace Cathedral Close", 200, 14],
    ], KIND);
    const idx = civicIndex(m);
    expect(idx.size).toBe(1);
    expect(idx.get(200)).toBe("church");
  });
});
