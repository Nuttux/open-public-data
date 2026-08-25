import { describe, expect, it } from "vitest";
import {
  blockLead,
  blockShape,
  blockSubjects,
  decadeGroups,
  printedHeading,
  railItems,
  railSilence,
  stripTruncation,
  isPrintableLine,
  streetLabel,
  type BlockDecision,
} from "./block-records";

/**
 * The three readings of `d[]` the fiche depends on are pure, and each of them
 * makes a claim in the reader's language that has to stay true:
 *
 *   · `decadeGroups`  — the shape, including the decades that hold nothing
 *   · `blockShape`    — "the {decade}s hold the most of them" and "nothing
 *                        lands here after {y}"
 *   · `blockSubjects` — "{n} decisions the volume heads “{label}”"
 *
 * The last is the one worth guarding hardest: it prints a count of the
 * record's own words, and a fold that merged two different printed headings
 * would put a number under a heading the volume never gave those items.
 */

let seq = 0;
function row(p: Partial<BlockDecision> & { y: number }): BlockDecision {
  seq += 1;
  return {
    y: p.y,
    d: p.d ?? "",
    k: p.k ?? "R",
    p: p.p ?? 4,
    f: p.f ?? 2,
    a: p.a ?? 0,
    u: p.u ?? `journalofproceed25sanfrich/${seq}`,
    t: p.t ?? "A line the volume prints.",
    ...(p.g ? { g: p.g } : {}),
  };
}

describe("decadeGroups", () => {
  const NOW_DECADE = Math.floor(new Date().getFullYear() / 10) * 10;

  it("draws the empty decades between two distant decisions", () => {
    const g = decadeGroups([row({ y: 1916 }), row({ y: 1977 })]);
    expect(g[0].decade).toBe(1900);
    const busy = g.filter((d) => d.rows.length > 0).map((d) => d.decade);
    expect(busy).toEqual([1910, 1970]);
    // the run of silence is drawn, not implied — every decade of the rail
    // except the two that hold something
    expect(g.filter((d) => d.rows.length === 0)).toHaveLength(g.length - 2);
  });

  /**
   * The rail used to stop at the 1990s, where the Board's scanned series
   * stops, and a reader saw a century of decisions simply end — which reads as
   * the city having stopped deciding. It now runs to the CURRENT decade and
   * marks everything past the series as unrecorded rather than empty.
   */
  it("runs to the present, not to the end of the record", () => {
    // The anchor is now a PARAMETER — the last year the shipped index reaches
    // — rather than a constant, because the shelf reaching 2016 and these
    // shards reaching 1999 are two different facts and the rail follows the
    // second. Passed explicitly here so the test says which one it means.
    const g = decadeGroups([row({ y: 1916 })], 1999);
    expect(g[g.length - 1].decade).toBe(NOW_DECADE);
    expect(g.find((d) => d.decade === 1990)?.afterSeries).toBe(false);
    expect(g.find((d) => d.decade === 2000)?.afterSeries).toBe(true);
  });

  it("moves the unrecorded band when the index reaches further", () => {
    // the correction the renamed volumes bought: with the minutes ingested to
    // 2016 the 2000s and 2010s are RECORDED, and only 2020 onward is outside
    const g = decadeGroups([row({ y: 1916 })], 2016);
    expect(g.find((d) => d.decade === 2000)?.afterSeries).toBe(false);
    expect(g.find((d) => d.decade === 2010)?.afterSeries).toBe(false);
    expect(g.find((d) => d.decade === 2020)?.afterSeries).toBe(true);
  });

  it("stretches past the present rather than dropping what a late row holds", () => {
    const g = decadeGroups([row({ y: NOW_DECADE + 10 })]);
    expect(g[g.length - 1].decade).toBe(NOW_DECADE + 10);
  });

  /**
   * The silence is information and it stays on the rail — the caption under
   * the rail says in words that the blank decades after 1999 are the record
   * stopping and not the city stopping. What folds is the FURNITURE: four
   * identical blank tracks saying one thing become one track saying it.
   */
  it("folds a run of empty decades into one track and leaves a lone one alone", () => {
    const items = railItems(decadeGroups([row({ y: 1916 }), row({ y: 1977 })]));
    const gap = items.find((i) => i.kind === "gap");
    expect(gap?.kind).toBe("gap");
    if (gap?.kind !== "gap") throw new Error("no gap");
    // 1900s holds nothing and 1910s does, so the first fold is 1920s–1960s
    expect(gap.run.label).toBe("1920s–1960s");
    expect(gap.run.n).toBe(5);
    // every decade still accounted for exactly once
    const covered = items.reduce(
      (n, i) => n + (i.kind === "gap" ? i.run.n : 1),
      0,
    );
    expect(covered).toBe(decadeGroups([row({ y: 1916 }), row({ y: 1977 })]).length);
    // a single empty decade is NOT a run: `1900s–1900s` is worse than `1900s`
    expect(items[0].kind).toBe("decade");
  });

  /**
   * An empty decade INSIDE the Board's scanned series is a silence the record
   * observed; one past its end is a decade the record never reached. They are
   * drawn differently on purpose, so a fold may not join them.
   */
  it("never folds across the end of the scanned series", () => {
    const items = railItems(decadeGroups([row({ y: 1916 })], 1999));
    for (const i of items) {
      if (i.kind !== "gap") continue;
      expect(i.run.from <= 1990 && i.run.to >= 2000).toBe(false);
    }
    const after = items.filter((i) => i.kind === "gap" && i.run.afterSeries);
    expect(after).toHaveLength(1);
    if (after[0]?.kind !== "gap") throw new Error("no after-series gap");
    expect(after[0].run.from).toBe(2000);
    expect(after[0].run.to).toBe(NOW_DECADE);
  });

  it("heads a decade with the Board's own printed heading over rank order", () => {
    const g = decadeGroups([
      row({ y: 1921, t: "Elser, for repaving Mission street between the…" }),
      row({ y: 1922, t: "Street Lights — Install 400 M. R. Lombard street.", g: "h" }),
    ]);
    const twenties = g.find((d) => d.decade === 1920);
    expect(twenties?.headline?.g).toBe("h");
  });

  it("reaches a quarter of the way down a busy decade for that heading", () => {
    // A busy decade ranks a printed heading fifth. The flat reach of three
    // never saw it, and block 3704's 1930s was headed by a mid-clause body
    // sentence while `Regulating Hours of Work…` sat two rows below.
    const body = (i: number) =>
      row({ y: 1930, t: `A body sentence that starts mid-clause, ${i}.` });
    const rows = [
      body(0),
      body(1),
      body(2),
      body(3),
      row({ y: 1937, t: "Regulating Hours of Work on Street Railway Tracks.", g: "h" }),
      ...Array.from({ length: 15 }, (_, i) => body(5 + i)),
    ];
    expect(decadeGroups(rows).find((d) => d.decade === 1930)?.headline?.g).toBe("h");
    // and a decade of four rows still stops at three, so a much better-ranked
    // row is never demoted for the sake of a tidier line
    expect(
      decadeGroups([body(0), body(1), body(2), rows[4]]).find((d) => d.decade === 1930)
        ?.headline?.g,
    ).toBeUndefined();
  });

  it("passes over a fragment for a whole line when neither is a heading", () => {
    const g = decadeGroups([
      row({ y: 1925, t: "Fortysixth Avenue and Irving Street." }),
      row({
        y: 1927,
        t: "Install 400 M. R. Northeast corner Forty-sixth avenue and Irving street.",
      }),
    ]);
    expect(g.find((d) => d.decade === 1920)?.headline?.y).toBe(1927);
  });

  it("never heads a decade with a row the volume prints no line for", () => {
    // the 1932 fixture grew past FRAGMENT_CHARS when `pickHeadline` started
    // gating on readability: a 35-character line is a fragment and is now
    // passed over on its own account, which would have made this pass for the
    // wrong reason.
    const g = decadeGroups([
      row({ y: 1931, t: "  " }),
      row({ y: 1932, t: "Ordering Construction of a Bond Sewer in Islais Creek Channel." }),
    ]);
    expect(g.find((d) => d.decade === 1930)?.headline?.y).toBe(1932);
  });

  it("never heads a decade with a scan a reader cannot read through", () => {
    const g = decadeGroups([
      row({
        y: 1906,
        t: '(Jranting ]»ernnssion, during the pleasure of the Board of Supervisors, to Long Syru])',
      }),
      row({ y: 1908, t: "Granting Permission to Erect and Maintain a Storage Tank on Bryant Street." }),
    ]);
    expect(g.find((d) => d.decade === 1900)?.headline?.y).toBe(1908);
  });

  it("heads a decade with nothing at all rather than with damage", () => {
    // the rows STAY in the decade — the count is still 1 and the shelf still
    // opens onto the page. What is refused is standing that line up unopened
    // as the face of a decade.
    const g = decadeGroups([
      row({
        y: 1906,
        t: '(Jranting ]»ernnssion, during the pleasure of the Board of Supervisors, to Long Syru])',
      }),
    ]);
    const d = g.find((x) => x.decade === 1900);
    expect(d?.headline).toBeNull();
    expect(d?.rows.length).toBe(1);
  });
});

describe("blockShape", () => {
  it("names a busiest decade only when one decade actually holds more", () => {
    const even = blockShape([row({ y: 1911 }), row({ y: 1921 })]);
    expect(even?.busiest).toBeNull();
    const clear = blockShape([row({ y: 1911 }), row({ y: 1912 }), row({ y: 1921 })]);
    expect(clear?.busiest?.decade).toBe(1910);
  });

  it("says a block went quiet only when it falls short of what the index reaches", () => {
    // a block whose last decision is the last year the index carries has not
    // fallen silent, the corpus has — so the anchor is passed in, not assumed
    expect(blockShape([row({ y: 1999 })], 1999)?.quietAfter).toBeNull();
    expect(blockShape([row({ y: 1947 })], 1999)?.quietAfter).toBe(1947);
    // and it moves with the index rather than with the shelf
    expect(blockShape([row({ y: 1999 })], 2016)?.quietAfter).toBe(1999);
  });

  it("returns null when nothing carries a year", () => {
    expect(blockShape([])).toBeNull();
  });
});

describe("printedHeading", () => {
  it("reads the label the volume prints before its own dash", () => {
    expect(
      printedHeading(row({ y: 1926, g: "h", t: "Street Lights — Install 400 M. R." })),
    ).toBe("Street Lights");
  });

  it("refuses a body sentence, whatever punctuation it carries", () => {
    expect(
      printedHeading(row({ y: 1926, t: "John Shea, No. 1830 Folsom street — nineteen horses." })),
    ).toBeNull();
  });

  it("refuses a label that is too long to be a heading or has no word in it", () => {
    expect(printedHeading(row({ y: 1926, g: "h", t: `${"x".repeat(70)} — a line` }))).toBeNull();
    expect(printedHeading(row({ y: 1926, g: "h", t: "1909 — a line" }))).toBeNull();
  });
});

describe("blockSubjects", () => {
  const rows = [
    row({ y: 1913, g: "h", t: "Oil and Boiler Permits — Standard Glass Works." }),
    row({ y: 1928, g: "p", t: "Oil and Boiler Permits, — Mrs. Emma Ingham." }),
    row({ y: 1915, g: "h", t: "Stable Permits — Koerber Coal Co., for 4 horses." }),
    row({ y: 1915, g: "h", t: "STABLE PERMIT — John Cuddihy, two horses." }),
    row({ y: 1917, g: "h", t: "Oil Permits — Green Valley Bakery." }),
    row({ y: 1931, t: "2147 Folsom street, 27 feet — H. Friedrichs." }),
  ];

  it("counts a printed heading only where the volume prints it here again", () => {
    const s = blockSubjects(rows);
    expect(s.map((x) => x.label)).toEqual(["Oil and Boiler Permits", "Stable Permits"]);
    expect(s[0].rows).toHaveLength(2);
    expect(s[0].firstYear).toBe(1913);
    expect(s[0].lastYear).toBe(1928);
  });

  it("folds case, spacing, trailing punctuation and a plural, and nothing else", () => {
    const s = blockSubjects(rows);
    // `Stable Permits` and `STABLE PERMIT` are one subject…
    expect(s[1].rows).toHaveLength(2);
    // …and `Oil Permits` is NOT folded into `Oil and Boiler Permits`, which
    // would be a judgement about what two permits have in common
    expect(s.some((x) => x.label === "Oil Permits")).toBe(false);
  });

  it("shows the form the volume prints most often here", () => {
    const s = blockSubjects([
      row({ y: 1915, g: "h", t: "Stable Permits — one." }),
      row({ y: 1916, g: "h", t: "Stable Permits — two." }),
      row({ y: 1917, g: "h", t: "STABLE PERMIT — three." }),
    ]);
    expect(s[0].label).toBe("Stable Permits");
    expect(s[0].rows).toHaveLength(3);
  });

  it("says nothing at all rather than something thin", () => {
    expect(blockSubjects([rows[4], rows[5]])).toEqual([]);
  });

  it("keeps the most-printed first and caps the list", () => {
    const many = [1, 2, 3, 4, 5].flatMap((i) =>
      [0, 1].map((k) => row({ y: 1910 + i, g: "h", t: `Subject ${i} — item ${k}.` })),
    );
    const s = blockSubjects(many, 4);
    expect(s).toHaveLength(4);
  });
});

describe("streetLabel", () => {
  it("spells a street key the way a reader writes it", () => {
    expect(streetLabel("PINE|ST")).toBe("Pine St");
    expect(streetLabel("GOLDEN GATE|AVE")).toBe("Golden Gate Ave");
  });
});

describe("blockLead — the line the fiche opens on", () => {
  const row = (t: string, extra: Partial<BlockDecision> = {}): BlockDecision => ({
    y: 1920, d: "", k: "R", p: 3, f: 0, a: 0, u: "vol/1", t, ...extra,
  });

  it("passes over the Journal's own machinery, however early it is ranked", () => {
    const lead = blockLead([
      row("On recommendation of the Streets Committee, the same was adopted."),
      row("Granting Laundry Permit, James R. Kenny, 388-390 Eddy Street.", { g: "h" }),
    ]);
    expect(lead?.t).toContain("Laundry Permit");
  });

  it("passes over a line a reader cannot read through", () => {
    const lead = blockLead([
      row("1,588.11 December (I, 11)07 — To the Barber Asphalt l*avinjr Company"),
      row("Ordering Construction of a Bond Sewer in Islais Creek Channel.", { g: "h" }),
    ]);
    expect(lead?.t).toContain("Islais Creek");
  });

  it("returns null rather than a fragment when the block has nothing that stands alone", () => {
    expect(blockLead([row("Fortysixth Avenue and Irving Street.")])).toBeNull();
    expect(blockLead([])).toBeNull();
  });

  it("keeps a surname and a scanning wart the reader reads straight past", () => {
    // the gate is on characters, not on a dictionary: `Sciiool` is legible.
    expect(
      blockLead([row("Accepting Deed to Lands Required for the Sciiool on Noriega Street.")])?.t,
    ).toContain("Sciiool");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE MODERN ERA — the rungs the ingest of `Meeting minutes` added, and the
 * two things about them that are not the same as the Journal's.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("DecadeGroup.partialTo — the rung the index stops inside", () => {
  it("marks the decade holding the last indexed year, and only that one", () => {
    const g = decadeGroups([row({ y: 1916 }), row({ y: 2004 }), row({ y: 2013 })], 2016);
    const marked = g.filter((d) => d.partialTo !== null);
    expect(marked.map((d) => d.decade)).toEqual([2010]);
    expect(marked[0].partialTo).toBe(2016);
  });

  it("marks nothing when the index stops on a decade's own last year", () => {
    // 2019 completes the 2010s; there is nothing to warn a reader about.
    const g = decadeGroups([row({ y: 2013 })], 2019);
    expect(g.every((d) => d.partialTo === null)).toBe(true);
  });

  it("marks the rung even where this block has nothing on it", () => {
    // The truncation is a fact about the rail, not about the block; the panel
    // decides separately whether there is a bar for the caption to qualify.
    const g = decadeGroups([row({ y: 1916 })], 2016);
    expect(g.find((d) => d.decade === 2010)?.partialTo).toBe(2016);
  });
});

describe("railSilence — why a decade shows no quotation", () => {
  const WHOLE =
    "Ordering the Improvement of Madera Street between Bryant and York Streets.";
  const DAMAGED =
    "1,588.11 December (I, 11)07 — To the Barber Asphalt l*avinjr Company";

  it("says no line at all when the builder printed none", () => {
    expect(railSilence([row({ y: 2004, t: "" }), row({ y: 2004, t: "   " })])).toBe(
      "no_line",
    );
  });

  it("says the lines are cut short when OUR ellipsis is the whole of the damage", () => {
    expect(
      railSilence([
        row({ y: 2004, t: "Designating 451 Jersey Street, the Carnegie Noe Valley Branch…" }),
        row({ y: 2004, t: "Enacting angle parking on the east side of Castro Street, between…" }),
      ]),
    ).toBe("truncated");
  });

  it("still says the scan is damaged when one row on the rung really is", () => {
    // Claimed conservatively: one broken row and the reader is told the truth
    // about the page rather than a tidier half-truth about the index.
    expect(
      railSilence([row({ y: 2010, t: "Designating 451 Jersey Street, the Carnegie…" }), row({ y: 2010, t: DAMAGED })]),
    ).toBe("damaged");
  });

  it("is never consulted where a decade has a face — the whole line passes", () => {
    expect(isPrintableLine(WHOLE)).toBe(true);
  });
});

describe("stripTruncation — the ellipsis is ours, and it does not relax the gate", () => {
  it("removes the marker the builder appends and nothing else", () => {
    expect(stripTruncation("Lease of Real Property - 1455 Market Street…")).toBe(
      "Lease of Real Property - 1455 Market Street",
    );
    expect(stripTruncation("  a line with no marker  ")).toBe("a line with no marker");
  });

  /**
   * THE REGRESSION THIS LOCKS DOWN. Stripping `…` before `isPrintableLine`
   * was measured over all 5,089 blocks and moves 1,101 pre-1999 decade faces,
   * most of them onto fragments and vote tallies — a line ending in `…` is by
   * construction a cut one, and the ellipsis gate has been an accidental
   * truncation gate all along. `railSilence` may read the stripped line; the
   * gate may not.
   */
  it("leaves a truncated line unquotable as the face of a decade", () => {
    const cut = "Designating 451 Jersey Street, the Carnegie Noe Valley Branch…";
    expect(isPrintableLine(cut)).toBe(false);
    expect(isPrintableLine(stripTruncation(cut))).toBe(true);
  });
});
