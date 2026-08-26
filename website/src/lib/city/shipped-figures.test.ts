import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { decodeChunk, reconcileTiers, type CityManifest } from "./data";
import { UNDATED, undatedTotal } from "./time";
import { KIND_WORDING } from "@/components/us/city/block-records";

/**
 * ── EVERY FIGURE THE SOURCE STATES ABOUT THE SHIPPED DATA, RE-TAKEN ──────
 *
 * The four shapes `pipeline/docs/sf_data_audit.md` was written about are all
 * one thing: **a number that was correct when written and became false as the
 * data moved under it.** Nobody edits these. They rot.
 *
 * `time.ts` §UNDATED is the clearest case on the site, because one of its four
 * rows was wired to the payload and three were typed, and the wired one is the
 * one that did not rot. On 2026-08-26:
 *
 *     row        source said      the chunks said   out by
 *     trees      125,234/195,310  125,234/195,310   —
 *     streets      424/4,895        1,929/4,895     4.5x
 *     buildings  23,487/166,166    23,487/166,166   — (derived from the payload)
 *     places       116/1,243          790/2,199     6.8x on n, 1.8x on of
 *
 * and the caption printing their sum told a reader that **128,690** things on
 * this map are drawn in every year when the files said **70,633**.
 *
 * So the figures stay where they are — a constant a reader can find beside the
 * sentence it feeds is worth more than a lazy fetch — and this re-derives every
 * one of them from the bytes the browser actually downloads. It is the assert
 * `.parity/m1flags.py` was for the buildings row, moved into the build so that
 * running it is not a thing anyone has to remember.
 */

const DATA = path.resolve(__dirname, "../../../public/data/us/sf/city");
const have = existsSync(path.join(DATA, "manifest.json"));
const d = have ? describe : describe.skip;

const json = <T>(rel: string): T =>
  JSON.parse(readFileSync(path.join(DATA, rel), "utf8")) as T;

const chunk = (key: string) => {
  const b = readFileSync(path.join(DATA, `${key}.qc`));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return decodeChunk(buf, key).fields;
};

const row = (key: string) => UNDATED.find((c) => c.key === key)!;

d("time.ts §UNDATED, re-derived from the chunks", () => {
  const manifest = json<CityManifest>("manifest.json");

  it("trees: `yr === 0`, and `syr` decides which of those draw in every year", () => {
    let n = 0;
    let undated = 0;
    let everyYear = 0;
    let chunks = 0;
    let withSyr = 0;
    for (const e of manifest.chunks) {
      if (e.kind !== "tree") continue;
      chunks++;
      const f = chunk(e.k);
      const yr = f.yr as Uint8Array;
      const syr = f.syr as Uint8Array | undefined;
      if (syr) withSyr++;
      n += yr.length;
      for (let i = 0; i < yr.length; i++) {
        if (yr[i] !== 0) continue;
        undated++;
        // an undated tree standing in an undated right of way has no gate
        if (!syr || syr[i] === 0) everyYear++;
      }
    }
    // `syr` is on every tree chunk. `citygl/layers/trees.ts` read it on none of
    // them until 2026-08-26 and floored the whole cohort at 1955 instead.
    expect(withSyr).toBe(chunks);
    expect(row("trees").of).toBe(n);
    expect(row("trees").n).toBe(undated);
    expect(row("trees").everyYear).toBe(everyYear);
  });

  it("streets: `yr === 0` over both centreline chunks, and the manifest agrees", () => {
    let n = 0;
    let undated = 0;
    for (const key of ["base/street-lines", "strt/street-lines-2"]) {
      const yr = chunk(key).yr as Uint16Array;
      n += yr.length;
      for (const y of yr) if (y === 0) undated++;
    }
    expect(row("streets").of).toBe(n);
    expect(row("streets").n).toBe(undated);
    // The same quantity from the other side, and it has been in the manifest
    // the whole time the source said 424.
    const c = manifest.centrelines as { n: number; dated: number };
    expect(c.n - c.dated).toBe(undated);
  });

  it("buildings: bits 3 and 4 of the `u` byte, solos included", () => {
    let n = 0;
    let blockYear = 0;
    let noYear = 0;
    // `base/solo` is itself a `bldg`-kind chunk — the 15,265 buildings drawn
    // as themselves at every zoom — so the filter already has it and adding it
    // again counts them twice.
    const keys = manifest.chunks.filter((e) => e.kind === "bldg").map((e) => e.k);
    for (const key of keys) {
      const u = chunk(key).u as Uint8Array;
      n += u.length;
      for (const b of u) {
        if ((b >> 3) & 1) blockYear++;
        if ((b >> 4) & 1) noYear++;
      }
    }
    expect(row("buildings").of).toBe(n);
    expect(row("buildings").n).toBe(blockYear + noYear);
    // only FLAG_NOYEAR has no year gate; FLAG_BLOCKYEAR arrives once, on a
    // year that is not its own
    expect(row("buildings").everyYear).toBe(noYear);
  });

  it("places: `yr === 65535`, and none of them is drawn on a dated frame", () => {
    const yr = chunk("base/places").yr as Uint16Array;
    let undated = 0;
    for (const y of yr) if (y === 65535) undated++;
    expect(row("places").of).toBe(yr.length);
    expect(row("places").n).toBe(undated);
    // `labels.ts` §NOYEAR HOLDS these off every dated year — the opposite of
    // the caption's claim, which is why this is 0 and not omitted.
    expect(row("places").everyYear).toBe(0);
  });

  it("the caption's two totals are the table's own sums", () => {
    const t = undatedTotal();
    expect(t.n).toBe(UNDATED.reduce((a, c) => a + c.n, 0));
    expect(t.of).toBe(UNDATED.reduce((a, c) => a + c.of, 0));
    expect(t.everyYear).toBe(
      UNDATED.reduce((a, c) => a + (c.everyYear ?? c.n), 0),
    );
    // "drawn in every year" is a SUBSET of "carries no date", never the whole
    // of it and never larger. It was printed larger than the truth by 58,057.
    expect(t.everyYear).toBeLessThan(t.n);
  });
});

d("manifest.json's tier rollup", () => {
  const manifest = json<CityManifest>("manifest.json");

  it("is re-derived from the chunk list, whatever the file states", () => {
    const fixed = reconcileTiers(manifest);
    const agg = new Map<string, { chunks: number; bytes: number; gzipBytes: number }>();
    for (const c of manifest.chunks) {
      const a = agg.get(c.tier) ?? { chunks: 0, bytes: 0, gzipBytes: 0 };
      a.chunks++;
      a.bytes += c.b ?? 0;
      a.gzipBytes += c.gz ?? 0;
      agg.set(c.tier, a);
    }
    for (const [name, t] of Object.entries(fixed.tiers)) {
      expect({ name, ...agg.get(name) }).toEqual({
        name,
        chunks: t.chunks,
        bytes: t.bytes,
        gzipBytes: t.gzipBytes,
      });
      // minZ is a rendering decision, not a count, and is taken as stated.
      expect(t.minZ).toBe(manifest.tiers[name].minZ);
    }
  });

  it("keeps every chunk's own size, which is the half that never drifted", () => {
    for (const c of manifest.chunks) {
      expect({ k: c.k, b: c.b }).toEqual({
        k: c.k,
        b: readFileSync(path.join(DATA, `${c.k}.qc`)).byteLength,
      });
    }
  });
});

d("the record's own vocabularies", () => {
  it("KIND_WORDING has a word for every `k` byte the shards ship", () => {
    // It had R O M W and the shards carry six values. 120 rows — contested
    // land-use appeals, charter amendments, closed sessions — reached the
    // panel through `?? "Item"`.
    const seen = new Map<string, number>();
    const blocks = path.join(DATA, "blocks");
    for (const f of readdirSync(blocks)) {
      if (!/^block-\d+\.json$/.test(f)) continue;
      const shard = JSON.parse(readFileSync(path.join(blocks, f), "utf8")) as Record<
        string,
        { d?: { k?: string }[] }
      >;
      for (const b of Object.values(shard))
        for (const r of b.d ?? []) if (r.k) seen.set(r.k, (seen.get(r.k) ?? 0) + 1);
    }
    const street = path.join(blocks, "street");
    for (const f of readdirSync(street)) {
      if (!f.endsWith(".json")) continue;
      const rows = JSON.parse(readFileSync(path.join(street, f), "utf8")) as { k?: string }[];
      for (const r of rows) if (r.k) seen.set(r.k, (seen.get(r.k) ?? 0) + 1);
    }
    expect(seen.size).toBeGreaterThan(0);
    const missing = [...seen].filter(([k]) => !KIND_WORDING[k]);
    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("857 places carry no published kind, and 684 is not that number", () => {
    // 684 is the Article 10 + Article 11 row count and explains four fifths of
    // them; the other 173 come from registers that DO publish a category and
    // are a gap in the join rather than a gap in the source. `labels.ts` §the
    // kind field.
    const kind = chunk("base/places").kind as Uint8Array;
    let kindless = 0;
    for (const k of kind) if (k === 0) kindless++;
    const manifest = json<CityManifest>("manifest.json");
    const places = manifest.places as { n: number; bySource: Record<string, number> };
    expect(kind.length).toBe(places.n);
    const article = places.bySource["97yj-54sx"] + places.bySource["ejht-vp5d"];
    expect(article).toBe(684);
    expect(kindless).toBe(857);
    expect(kindless - article).toBe(173);
  });
});
