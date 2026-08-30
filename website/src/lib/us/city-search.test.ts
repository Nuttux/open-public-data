import { describe, expect, it } from "vitest";

import {
  blockForAddress,
  groupHits,
  prepare,
  prepareAddresses,
  searchCity,
  streetForAddress,
  type AddressFace,
  type CitySearchFile,
} from "./city-search";

/**
 * The resolver behind the search box.
 *
 * What it must never do is guess. Every hit is one of three explainable
 * things — the label IS the query, the label STARTS WITH it, or every word of
 * the query begins a word of the label — and the tests below are written
 * against the four kinds' real behaviour on the shipped index, not against
 * toy strings: `castro`, `mission` and `coit` are the queries that decide
 * whether the ranking rule is the right one.
 */

/** a miniature of the shipped file: the columns join by position */
function file(): CitySearchFile {
  const l = [
    // hood 0..1
    "Castro/Upper Market",
    "Mission",
    // street 2..4
    "Castro St",
    "Mission St",
    "16th St",
    // place 5..6
    "Coit Tower",
    "Castro Mission Health Center",
    // addr 7..9
    "400 Castro St",
    "429 Castro St",
    "3400 16th St",
  ];
  return {
    kinds: { hood: [0, 2], street: [2, 5], place: [5, 7], addr: [7, 10] },
    l,
    n: [1559, 3074, 120, 120, 120, 5, 0, 1, 1, 1],
    b: ["3538", "3610", "3538", "3610", "3573", "0084", "3565", "3538", "3538", "3573"],
    to: ["2", "18", "CASTRO|ST", "MISSION|ST", "16TH|ST", "coit-tower",
         "castro-mission-health-center", "", "", ""],
    ay0: [1909, 1912, 1931],
    ay1: [1909, 1928, 1931],
    sub: { "5": "1 Telegraph Hill Blvd" },
    sum: [0, 1],
  };
}

const ix = prepare(file());

describe("searchCity", () => {
  it("says nothing until there is something to say", () => {
    expect(searchCity(ix, "")).toEqual([]);
    expect(searchCity(ix, "c")).toEqual([]);
    expect(searchCity(null, "castro")).toEqual([]);
  });

  /* THE RANKING RULE, on the query that decides it. A bare name should reach
     the biggest thing that goes by it: the division, then the street, then a
     place that merely contains the word, then the doors. */
  it("puts the division above the street above the doors", () => {
    expect(searchCity(ix, "castro").map((h) => `${h.kind}:${h.label}`)).toEqual([
      "hood:Castro/Upper Market",
      "street:Castro St",
      "place:Castro Mission Health Center",
      "addr:400 Castro St",
      "addr:429 Castro St",
    ]);
  });

  /* KIND BEFORE SIZE, and this is why. Coit Tower holds five documents. Under
     a size-first rule every street in the city would outrank it. */
  it("does not bury a small place under big streets", () => {
    expect(searchCity(ix, "coit").map((h) => h.label)).toEqual(["Coit Tower"]);
  });

  it("prefers an exact label to one that merely starts with the query", () => {
    const hits = searchCity(ix, "mission");
    expect(hits[0].label).toBe("Mission");
    expect(hits[0].kind).toBe("hood");
  });

  /* every word of the query has to begin a word of the label, so a house
     number narrows to the door and drops the street it is on */
  it("narrows to a door when the query carries its number", () => {
    expect(searchCity(ix, "400 castro").map((h) => h.label)).toEqual([
      "400 Castro St",
    ]);
  });

  it("matches a numbered street either way round", () => {
    expect(searchCity(ix, "16th").map((h) => h.label)).toEqual([
      "16th St",
      "3400 16th St",
    ]);
  });

  /* A PLACE IS ALSO FINDABLE BY ITS ADDRESS, and the hit says which of the two
     matched — otherwise a result reading `Coit Tower` for the query
     `telegraph hill` looks like the search inventing a connection. */
  it("finds a place by the address under its name", () => {
    const hits = searchCity(ix, "telegraph hill");
    expect(hits.map((h) => h.label)).toEqual(["Coit Tower"]);
    expect(hits[0].via).toBe("sub");
    expect(hits[0].sub).toBe("1 Telegraph Hill Blvd");
  });

  /* the name always wins over an address: an address is how you recognise a
     place, not what it is called */
  it("never lets an address outrank a name", () => {
    const hits = searchCity(ix, "castro");
    expect(hits.every((h) => h.via !== "sub")).toBe(true);
  });

  it("does not guess at a misspelling", () => {
    expect(searchCity(ix, "guerreo")).toEqual([]);
    expect(searchCity(ix, "coyt tower")).toEqual([]);
  });

  /* every hit has to be able to move the map, and a door has no id of its own
     — the fiche derives its doors from the block, so the block is what a door
     result travels on */
  it("gives every hit a block to send the map to", () => {
    for (const h of searchCity(ix, "castro")) expect(h.block).toBeTruthy();
    const door = searchCity(ix, "400 castro")[0];
    expect(door.to).toBe("");
    expect(door.block).toBe("3538");
  });

  it("carries the years a door was named, and the paragraph flag", () => {
    expect(searchCity(ix, "429 castro")[0]).toMatchObject({ y0: 1912, y1: 1928 });
    expect(searchCity(ix, "mission")[0].sum).toBe(true);
  });
});

describe("groupHits", () => {
  it("keeps the sections in reading order and counts what it dropped", () => {
    const groups = groupHits(searchCity(ix, "castro"), 1);
    expect(groups.map((g) => g.kind)).toEqual(["hood", "street", "place", "addr"]);
    expect(groups[3].hits).toHaveLength(1);
    expect(groups[3].more).toBe(1);
  });

  it("leaves out a kind that matched nothing", () => {
    expect(groupHits(searchCity(ix, "coit")).map((g) => g.kind)).toEqual(["place"]);
  });
});

/**
 * THE ADDRESS THE RECORD NEVER NAMED — which is most of them.
 *
 * 1,052 doors against a city of some two hundred thousand addresses, so the
 * ordinary outcome of somebody typing where they live is a miss. A miss must
 * not read as "there is nothing here": the street it stands on usually holds a
 * century of decisions, and that is the next rung outward.
 */
describe("streetForAddress", () => {
  it("finds the street under an address the record does not name", () => {
    expect(searchCity(ix, "1234 castro st")).toEqual([]);
    expect(streetForAddress(ix, "1234 castro st").map((h) => h.label))
      .toEqual(["Castro St"]);
  });

  /* the suffix is folded on BOTH sides, so how the reader writes it does not
     decide whether their street is found */
  it("does not care how the suffix is written", () => {
    for (const q of ["1234 castro street", "1234 Castro St", "1234 castro"]) {
      expect(streetForAddress(ix, q).map((h) => h.label)).toEqual(["Castro St"]);
    }
  });

  it("works on a numbered street", () => {
    expect(streetForAddress(ix, "3400 16th street").map((h) => h.label))
      .toEqual(["16th St"]);
  });

  /* a bare street name is a street search and already works — this must not
     fire on it, or every query would grow a second copy of its own answer */
  it("only fires on something shaped like an address", () => {
    expect(streetForAddress(ix, "castro")).toEqual([]);
    expect(streetForAddress(ix, "castro st")).toEqual([]);
    expect(streetForAddress(ix, "1234")).toEqual([]);
  });

  it("says nothing when the street is not in the record either", () => {
    expect(streetForAddress(ix, "1234 nowhere ave")).toEqual([]);
  });
});

/**
 * THE ASSESSOR'S OWN ADDRESS-TO-BLOCK JOIN.
 *
 * This is the rung above the street. It first shipped without one, on the
 * claim that a block could not be found for an arbitrary address — which was
 * true of the shipped website data and false of the pipeline, where the parcel
 * dataset already cached publishes `from_address_num`, `to_address_num`,
 * `street_name`, `street_type` and `block_num` in the same row.
 *
 * No geocoding and no coordinates: the assessor published the join, and
 * `block_num` is the id this map draws. 17,468 faces over 1,843 streets.
 */
function faces(): AddressFace {
  return {
    streets: ["Guerrero St", "16th St", "Dr Carlton B Goodlett Pl"],
    //         Guerrero 100-999 | Guerrero 1000-1499 | 16th 3300-3499 | City Hall
    s: [0, 0, 1, 2],
    lo: [100, 1000, 3300, 1],
    hi: [999, 1499, 3499, 99],
    b: ["3610", "6512", "3558", "0787"],
  };
}
const aix = prepareAddresses(faces());

describe("blockForAddress", () => {
  it("puts a house number on the right block, not merely the right street", () => {
    expect(blockForAddress(aix, "1234 Guerrero St")?.block).toBe("6512");
    expect(blockForAddress(aix, "400 Guerrero St")?.block).toBe("3610");
  });

  it("does not care how the reader writes the suffix", () => {
    for (const q of ["1234 guerrero street", "1234 Guerrero St", "1234 guerrero"]) {
      expect(blockForAddress(aix, q)?.block).toBe("6512");
    }
  });

  it("tidies the label to the assessor's own spelling of the street", () => {
    expect(blockForAddress(aix, "1234 guerrero street")).toMatchObject({
      label: "1234 Guerrero St",
      street: "Guerrero St",
    });
  });

  it("works on a numbered street and on a long name", () => {
    expect(blockForAddress(aix, "3400 16th st")?.block).toBe("3558");
    expect(blockForAddress(aix, "1 Dr Carlton B Goodlett Pl")?.block).toBe("0787");
  });

  /* NULL IS A REAL ANSWER AND IS NOT GUESSED AROUND. Landing a reader on the
     wrong block while telling them it is theirs is worse than stopping. */
  it("refuses a number off the end of a real street", () => {
    expect(blockForAddress(aix, "99999 Guerrero St")).toBeNull();
    expect(blockForAddress(aix, "12 Guerrero St")).toBeNull();
  });

  it("refuses a street the assessor does not name", () => {
    expect(blockForAddress(aix, "1234 Nowhere Ave")).toBeNull();
  });

  /* ── A HALF-TYPED STREET IS NOT AN UNKNOWN STREET ────────────────────
     `680 HAIG` was told the city's property records could not place it, and
     the reader had simply not finished the word. A prefix that leaves one
     street standing is that street; two and it stops. */
  it("accepts a street name the reader has not finished typing", () => {
    expect(blockForAddress(aix, "1234 guerr")?.block).toBe("6512");
    expect(blockForAddress(aix, "1234 guerrero")?.block).toBe("6512");
  });

  it("refuses a prefix that leaves more than one street standing", () => {
    const two = prepareAddresses({
      streets: ["Sutter St", "Sutro Ct"],
      s: [0, 1],
      lo: [1, 1],
      hi: [999, 999],
      b: ["a", "b"],
    });
    expect(blockForAddress(two, "100 sut")).toBeNull();
    expect(blockForAddress(two, "100 sutter")?.block).toBe("a");
  });

  it("only fires on something shaped like an address", () => {
    expect(blockForAddress(aix, "guerrero")).toBeNull();
    expect(blockForAddress(aix, "guerrero st")).toBeNull();
    expect(blockForAddress(null, "1234 Guerrero St")).toBeNull();
  });

  /* ranges can overlap where two blocks meet at a corner; the tighter one is
     the better claim about a single house number */
  it("takes the tighter range when two faces cover the number", () => {
    const overlap = prepareAddresses({
      streets: ["Guerrero St"],
      s: [0, 0],
      lo: [100, 1],
      hi: [199, 9999],
      b: ["tight", "loose"],
    });
    expect(blockForAddress(overlap, "150 Guerrero St")?.block).toBe("tight");
  });
});
