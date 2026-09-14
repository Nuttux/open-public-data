import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * ── THE SITE'S OWN HONESTY CLAIM, AND IT HAD NEVER BEEN RE-TAKEN ─────────
 *
 * `/usa/san-francisco/the-city` prints one sentence about how well the map places a
 * decision, and it is the sentence that exists to say the map is not
 * overstating itself. On 2026-08-26 it read:
 *
 *   > *"Placement was checked against 906 decisions that print their own block
 *   > number: 84.8 % landed on it."*
 *
 * `git log` on `blocks/accuracy.json` returned exactly one commit — the
 * original port, 2026-08-23. The shards it scores had been rebuilt three times
 * since; the answer key was more than three times 906; and the honest figure
 * was **88.5 %**. The number was wrong in the project's favour, on the one
 * sentence that cannot be.
 *
 * ── AND THE SCRIPT'S OWN GUARD COULD NOT FIRE ────────────────────────────
 *
 * `blocks/measure_accuracy.py` asserts that `locate()` reproduces a published
 * index before it writes. It compared against `$BLOCKS_OUT/block-index.json` —
 * a file written by the same build, in the same directory, going stale in the
 * same direction. It passed on an index that had moved 3,358 → 4,534 stated
 * links underneath it. **A guard that reads a stale input to decide whether it
 * is stale is not a guard.** It now reads the PUBLISHED index, which is a
 * separate act from running the script.
 *
 * That fixes half of it. The other half is that a script which is never run
 * asserts nothing at all, and this is that half: the file records the
 * `precision_counts` of the index it scored, and this re-reads them off the
 * index actually shipped. A rebuild that leaves the accuracy figure behind
 * fails `npm test` instead of reaching a journalist.
 *
 * The fix is never to edit the number here. It is
 * `python3 blocks/measure_accuracy.py`, then publish what it wrote.
 */

const DATA = path.resolve(__dirname, "../../../public/data/us/sf/city");
const have = existsSync(path.join(DATA, "blocks/accuracy.json"));
const d = have ? describe : describe.skip;

interface Accuracy {
  n: number;
  exact: number;
  key_items?: number;
  index?: {
    precision_counts: Record<string, number>;
    n_decisions_placed: number;
    n_blocks: number;
  };
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

d("accuracy.json describes the index it is printed beside", () => {
  const acc = json<Accuracy>("blocks/accuracy.json");
  const meta = json<{
    meta: { precision_counts: Record<string, number>; n_decisions_placed: number; n_blocks: number };
  }>("blocks/block-index.json").meta;

  it("says which index it scored", () => {
    expect(acc.index).toBeDefined();
  });

  it("scored the index that is published", () => {
    expect(acc.index?.precision_counts).toEqual(meta.precision_counts);
    expect(acc.index?.n_decisions_placed).toBe(meta.n_decisions_placed);
    expect(acc.index?.n_blocks).toBe(meta.n_blocks);
  });

  it("scores fewer decisions than print their own block, and says both", () => {
    // The page prints both now. `key_items` is how many decisions state their
    // own block; `n` is how many of those the blind join also placed at block
    // precision and could therefore be scored. The old sentence printed `n`
    // under the words "decisions that print their own block number", which is
    // the second quantity wearing the first one's description.
    expect(acc.key_items).toBeDefined();
    expect(acc.n).toBeGreaterThan(0);
    expect(acc.key_items!).toBeGreaterThanOrEqual(acc.n);
  });

  it("is a percentage, and one the corpus can support", () => {
    expect(acc.exact).toBeGreaterThan(0);
    expect(acc.exact).toBeLessThanOrEqual(100);
    // `measure_accuracy.py` refuses to write under 50 ground-truth placements.
    // Asserted here too: a rate over a handful of rows is not a rate.
    expect(acc.n).toBeGreaterThanOrEqual(50);
  });
});
