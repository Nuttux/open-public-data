import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { decodeChunk } from "@/lib/city/data";

/**
 * ── THE ROLLUP HAS TO STILL BE A ROLLUP ──────────────────────────────────
 *
 * `blocks/hood-facts.json` states its own contract in its own `note`: *"A
 * rollup, not a new measurement. Every figure here is a sum over the
 * block-level files already shipped."* Nothing enforced it, and on 2026-08-26
 * it had not been true for three commits:
 *
 *     total decisions on blocks      91,391  file    101,662  shards   −10.1 %
 *     neighbourhoods disagreeing on n     —            39 of 41
 *     neighbourhoods whose last year is too early      38 of 41, median 24 yr
 *     neighbourhoods printing a last year before 2000  21
 *     Treasure Island   "The Board's record places nothing in it."  5 decisions
 *
 * Every one of those is a sentence a reader was shown, beside a decade rail
 * that reads `y1` LIVE off `block-index.json` and drew a 2020s rung next to
 * *"between 1906 and 2002"*. The panel contradicted itself on one screen and
 * the half that was wrong was the half that reads like a fact about San
 * Francisco.
 *
 * ── WHY THIS TEST AND NOT A `generated_at` CHECK ─────────────────────────
 *
 * The file has carried a `generated_at` the whole time. A timestamp records
 * when a number was taken; it cannot say whether the thing it counted has
 * moved since, and no rule about comparing it to anything can be enforced by
 * the file itself.
 *
 * So this re-derives the rollup from a DIFFERENT INSTRUMENT — `block-index.json`,
 * written by `blocks/build_index.py`, which publishes `n`, `y0` and `y1` per
 * block and is rebuilt with the shards every time. Rolled up over the same
 * `hood` bytes `base/blocks.qc` publishes, it is the same four quantities read
 * a second way. Measured when this was written: the index rollup and a full
 * walk of all 256 shards agree on all 41 neighbourhoods, element for element.
 *
 * **This fires the moment the shards are rebuilt without re-running
 * `build_hood_facts.py`, which is exactly the failure it exists for.** The fix
 * is never to edit a number here: it is
 * `python3 pipeline/scripts/us_sf_city/build_hood_facts.py --build`.
 */

const DATA = path.resolve(__dirname, "../../../../public/data/us/sf/city");
const have = existsSync(path.join(DATA, "blocks/hood-facts.json"));
const d = have ? describe : describe.skip;

interface HoodFacts {
  hoods: { i: number; name: string; record: { n: number; blocks: number; y0: number; y1: number } }[];
  coverage: { hoods: number; hoods_with_a_record: number };
  inputs?: { shards: number; decisions_on_blocks: number; index?: { links_on_blocks?: number } };
}

interface BlockIndex {
  meta: { n_blocks: number };
  b: string[];
  n: number[];
  y0: number[];
  y1: number[];
}


/**
 * ── POINTING THE GUARD AT A BUILD THAT IS NOT PUBLISHED YET ──────────────
 *
 * `SF_CITY_DATA=<dir>` makes any file present in `<dir>` win over the
 * published tree, per file. That is not a test convenience: it is how a build
 * gets CHECKED BEFORE it is published rather than after, which is the whole
 * discipline this guard exists to enforce. `build_hood_facts.py --out DIR` and
 * `measure_accuracy.py` both write beside the published tree for the same
 * reason.
 *
 *     SF_CITY_DATA=scratchpad/audit-fix/hood-out npx vitest run
 */
const STAGE = process.env.SF_CITY_DATA;
const pick = (rel: string): string => {
  if (STAGE) {
    const c = path.resolve(STAGE, path.basename(rel));
    if (existsSync(c)) return c;
  }
  return path.join(DATA, rel);
};

const json = <T>(rel: string): T =>
  JSON.parse(readFileSync(pick(rel), "utf8")) as T;

/** the `hood` byte per block, straight out of the chunk the map itself draws */
function hoodBytes(): Uint8Array {
  const b = readFileSync(path.join(DATA, "base/blocks.qc"));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return decodeChunk(buf, "base/blocks").fields.hood as Uint8Array;
}

d("hood-facts.json is a rollup of the index it ships beside", () => {
  const file = json<HoodFacts>("blocks/hood-facts.json");
  const idx = json<BlockIndex>("blocks/block-index.json");
  const ids = json<{ id: string[]; hoodNames: string[] }>("base/blocks-id.json");
  const hood = hoodBytes();

  it("joins on the membership the map publishes, and only that one", () => {
    // A name comparison would be a SECOND membership able to disagree with the
    // first, which is how a guard passes on a bad row. Array position or
    // nothing.
    expect(hood.length).toBe(ids.id.length);
    expect(idx.b).toEqual(ids.id);
    expect(file.hoods.length).toBe(ids.hoodNames.length);
    expect(file.hoods.map((h) => h.name)).toEqual(ids.hoodNames);
    expect(file.hoods.map((h) => h.i)).toEqual(ids.hoodNames.map((_, i) => i));
  });

  it("states, per neighbourhood, what block-index.json states per block", () => {
    const want = file.hoods.map(() => ({ n: 0, blocks: 0, y0: 0, y1: 0 }));
    for (let i = 0; i < ids.id.length; i++) {
      const n = idx.n[i];
      if (!n) continue;
      const a = want[hood[i]];
      a.n += n;
      a.blocks++;
      if (idx.y0[i]) a.y0 = a.y0 ? Math.min(a.y0, idx.y0[i]) : idx.y0[i];
      if (idx.y1[i]) a.y1 = Math.max(a.y1, idx.y1[i]);
    }
    // Named rather than indexed, so a failure says WHICH neighbourhood is
    // stale and by how much — the point of the exercise is the number, not
    // the red.
    const say = (rs: typeof want) =>
      Object.fromEntries(file.hoods.map((h, i) => [h.name, rs[i]]));
    // the four quantities the index states, and only those — `record` also
    // carries the decade histogram, which the index has no per-block form of
    expect(
      say(file.hoods.map((h) => ({
        n: h.record.n, blocks: h.record.blocks, y0: h.record.y0, y1: h.record.y1,
      }))),
    ).toEqual(say(want));
  });

  it("counts a neighbourhood as having a record when it has one", () => {
    // `coverage.hoods_with_a_record` read 40 while Treasure Island held five
    // decisions on two blocks and the panel told a reader the Board had
    // recorded nothing there.
    const live = file.hoods.filter((h) => h.record.n > 0).length;
    expect(file.coverage.hoods_with_a_record).toBe(live);
    expect(file.coverage.hoods).toBe(file.hoods.length);
  });

  it("carries a fingerprint of what it summed, and it is the shipped index", () => {
    // `--build` writes this; a file from before it existed fails here rather
    // than passing quietly, because "no fingerprint" is the state the three
    // stale publishes were in.
    expect(file.inputs).toBeDefined();
    expect(file.inputs?.shards).toBe(256);
    const links = idx.n.reduce((a, b) => a + b, 0);
    expect(file.inputs?.decisions_on_blocks).toBe(links);
    expect(file.inputs?.index?.links_on_blocks).toBe(links);
  });
});
