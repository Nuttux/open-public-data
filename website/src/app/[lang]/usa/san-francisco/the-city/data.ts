import { readFileSync, readdirSync } from "node:fs";
import { untracedPath } from "@/lib/untraced-path";

/**
 * THE SERVER HALF OF THE CITY PAGE — read once, by both renderers.
 *
 * ── WHY THIS IS A MODULE AND NOT A PARAGRAPH IN TWO FILES ────────────────
 *
 * It was a paragraph in two files. `/the-city/page.tsx` and
 * `/the-city-gl/page.tsx` each read the same three files, did the same
 * arithmetic and built the same payload, and the GL page's own header said so:
 * *"The server half is the Canvas page's, deliberately … a port that computed
 * its own counts could differ from the published page by a number a reader can
 * see."* The intent was right and the mechanism was a copy.
 *
 * By 2026-08-26 the copy had already drifted: the Canvas page carried a
 * fourteen-line comment explaining why the record's span is the maximum again,
 * and the GL page carried the same comment with three of its paragraphs' first
 * lines deleted, leaving sentences that begin mid-clause. Nothing a reader
 * sees was wrong yet. **Two independent statements of one quantity, allowed to
 * drift, is the third of the four shapes `sf_data_audit.md` was written about**
 * — and a comment losing its meaning is how that starts, not something
 * separate from it.
 *
 * So there is one statement of it, and the two pages differ in exactly what
 * they were built to differ in: the renderer.
 */
interface ManifestShape {
  buildings: { n: number };
  streets: { n: number };
  trees: { n: number };
  sources: Record<
    string,
    { dataset?: string; publisher?: string; what?: string; url?: string }
  >;
}

interface BlockIndexShape {
  meta: {
    n_blocks: number;
    n_decisions_placed: number;
    n_unplaced: number;
    precision_counts: Record<string, number>;
    leaf_mapped_volumes: string[];
  };
  /** decisions placed on the block itself */
  n: number[];
  /** decisions placed on a street the block fronts */
  ns: number[];
  /** first and last year the record places on the block, 0 for neither */
  y0: number[];
  y1: number[];
}

function readJson<T>(rel: string): T {
  const p = untracedPath("public", rel);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

/** one row of a block or street shard, as far as provenance is concerned */
interface ShardRow {
  y?: number;
  /** the citation shape — "b" is a Board PDF the Clerk posts; absent is a scan */
  c?: string;
  /** the archive leaf or the Clerk's file, "<source>/<leaf>" */
  u?: string;
}

export interface RecordProvenance {
  archive: { sources: number; from: number; to: number; rows: number };
  clerk: { sources: number; from: number; to: number; rows: number };
}

/**
 * The slim payload the server hands the client — every number a reader is
 * shown on the page. It lived in `TheCityClient.tsx` while there were two
 * renderers and the Canvas one owned the shell; it belongs here, beside the
 * function that builds it, now that the page has one renderer.
 */
export interface TheCityPageData {
  buildings: number;
  blocks: number;
  streets: number;
  trees: number;
  /** decisions the record places on a block or on a street it fronts */
  decisions: number;
  /** decisions that name a street and nothing narrower */
  streetOnly: number;
  /** decisions in the corpus that name no place we could resolve */
  unplaced: number;
  /** blocks the record says something about */
  blocksWithRecord: number;
  /** scanned volumes the decisions were read from */
  volumes: number;
  /** first and last year the record places on a block, e.g. "1906\u20132013" */
  span: string;
  /** the TWO record systems behind that span, counted off the rows themselves */
  record: RecordProvenance;
  accuracy: { n: number; key: number; exact: number };
  /** who publishes what this map is drawn from, out of the manifest */
  publishers: { name: string; datasets: number; url: string | null }[];
}

let PROVENANCE: RecordProvenance | null = null;

/**
 * ── WHERE THE DECISIONS ACTUALLY COME FROM, COUNTED OFF THE ROWS ─────────
 *
 * The note used to say the whole record was *"read from {volumes} scanned
 * volumes … held by the Internet Archive"*, with `{volumes}` =
 * `meta.leaf_mapped_volumes.length` = 329 and the span beside it running to
 * 2026. **Zero of those 329 entries are the Clerk's PDFs.** The bound volumes
 * stop at 2016; the ten years the span advertises are files the City Clerk
 * posts on sfbos.org and no library has accessioned, and 5,221 rows of this map
 * cite them. `sf_data_audit.md` A3.
 *
 * The span was un-clamped on 2026-08-25 for good reasons recorded below. The
 * sentence around it was not, and the result was a claim of provenance that is
 * false for the most recent decade of the record — a born-digital city file
 * attributed to an archive that does not hold it. That is the same shape as the
 * 1999 error MINUTES.md §1 calls the worst class this project can ship, pointed
 * the other way: a fact about our own corpus printed as a fact about the world.
 *
 * So both halves are DERIVED, from the rows themselves, at build time:
 * `c === "b"` is the Clerk's citation shape and its absence is the Archive's,
 * and `u`'s stem is the volume or the file. Nothing here is typed, so the
 * sentence cannot outlive another sweep.
 *
 * MEASURED on the shipped tree, 2026-08-26 — and note that 313 volumes carry a
 * placed decision against the 329 whose leaves were mapped, so `{volumes}` was
 * never quite this number either:
 *
 *     Internet Archive   313 volumes   1906–2016   145,652 rows
 *     Clerk of the Board 363 files     2016–2026     5,221 rows
 *
 * COST, AND WHERE IT IS NOW PAID: 52 MB across 2,204 files. That is a BUILD
 * cost — `scripts/gen-sf-record-provenance.mjs` writes `blocks/provenance.json`
 * and the render reads that one file. See §THE WALK IS A BUILD STEP below for
 * what happened when the render did the walk itself. Still memoised at module
 * scope, because `generateMetadata` reads `searchParams` and so opts this page
 * out of static rendering.
 */
function recordProvenance(): RecordProvenance {
  if (PROVENANCE) return PROVENANCE;

  /* ── §THE WALK IS A BUILD STEP, NOT A RENDER ONE ───────────────────────
     This counted the rows by opening 2,204 files across 52 MB. That is fine
     on a laptop and fatal on a deployed function: `next.config.ts` excludes
     `public/data/us/sf/city/**` from every `/usa/**` route on purpose — the
     map is fetched by the BROWSER, tier by tier — and names the three files
     the server genuinely opens. The shards are not among them, so
     `readdirSync` found a directory that had not been traced and the page
     returned a Server Components render error on the live site.

     Two ways out and only one of them is right. Adding 52 MB of shards to
     the trace pays it into every cold start of a route whose whole point is
     that it reads almost nothing, and walks back toward the 250 MB ceiling
     that put those excludes there in the first place. So the walk moves to
     where it belongs: `scripts/gen-sf-record-provenance.mjs` writes the
     answer next to the shards it counted, and this reads one small file.

     The walk stays as the fallback, so a tree without the generated file
     still renders — a laptop, a fresh checkout, a city that has not run the
     script — and cannot quietly print a different set of numbers than the
     one the shards say. */
  try {
    PROVENANCE = readJson<RecordProvenance>(
      "data/us/sf/city/blocks/provenance.json",
    );
    return PROVENANCE;
  } catch {
    /* fall through to the walk */
  }

  const A = { sources: new Set<string>(), from: Infinity, to: 0, rows: 0 };
  const C = { sources: new Set<string>(), from: Infinity, to: 0, rows: 0 };
  const eat = (rows: readonly ShardRow[]): void => {
    for (const r of rows) {
      const a = r.c === "b" ? C : A;
      a.rows++;
      if (r.y) {
        if (r.y < a.from) a.from = r.y;
        if (r.y > a.to) a.to = r.y;
      }
      if (r.u) a.sources.add(r.u.slice(0, r.u.indexOf("/")));
    }
  };
  // A shard is `block-<digits>.json` — a shape, not a blacklist, so a catalogue
  // file dropped in this directory later cannot join the walk.
  for (const f of readdirSync(untracedPath("public", "data/us/sf/city/blocks"))) {
    if (!/^block-\d+\.json$/.test(f)) continue;
    const shard = JSON.parse(readFileSync(untracedPath("public", "data/us/sf/city/blocks", f), "utf8")) as Record<
      string,
      { d?: ShardRow[] }
    >;
    for (const b of Object.values(shard)) eat(b.d ?? []);
  }
  for (const f of readdirSync(untracedPath("public", "data/us/sf/city/blocks", "street"))) {
    if (!f.endsWith(".json")) continue;
    eat(JSON.parse(readFileSync(untracedPath("public", "data/us/sf/city/blocks", "street", f), "utf8")) as ShardRow[]);
  }
  PROVENANCE = {
    archive: { sources: A.sources.size, from: A.from, to: A.to, rows: A.rows },
    clerk: { sources: C.sources.size, from: C.from, to: C.to, rows: C.rows },
  };
  return PROVENANCE;
}

/** A publisher stops being a source the moment it is us. */
const OURS = "this project";

export function theCityPageData(): TheCityPageData {
  const m = readJson<ManifestShape>("data/us/sf/city/manifest.json");
  const blockIndex = readJson<BlockIndexShape>("data/us/sf/city/blocks/block-index.json");
  /* `key_items` is how many decisions print their own block number; `n` is how
     many of those the blind join ALSO placed at block precision and could
     therefore be scored. The published sentence conflated them for three
     rebuilds — it said "checked against 906 decisions", 906 being the scored
     count, against a key that was already larger. Both go out now.
     `key_items` is optional so a file written before it existed still renders,
     and `accuracy.test.ts` is what stops one shipping. */
  const accuracy = readJson<{ n: number; exact: number; key_items?: number }>(
    "data/us/sf/city/blocks/accuracy.json",
  );

  // A block "has something" when the record places a decision on the block
  // itself or on a street it fronts. Both open the panel; the panel is what
  // keeps the two apart.
  let withRecord = 0;
  let first = Infinity;
  let last = 0;
  for (let i = 0; i < blockIndex.n.length; i++) {
    if (blockIndex.n[i] > 0 || blockIndex.ns[i] > 0) withRecord++;
    const y0 = blockIndex.y0[i];
    const y1 = blockIndex.y1[i];
    if (y0 > 0 && y0 < first) first = y0;
    if (y1 > last) last = y1;
  }

  // Who publishes what the map is drawn from. Read off the manifest rather
  // than typed here, so it cannot drift from the data; our own derived layers
  // are not a source and do not appear.
  const byPublisher = new Map<string, { datasets: Set<string>; url: string | null }>();
  for (const s of Object.values(m.sources)) {
    const raw = s.publisher;
    if (!raw || raw.includes(OURS)) continue;
    // "Esri World Imagery (ArcGIS Online public tiles)" → "Esri World Imagery"
    const name = raw.replace(/\s*\(.*\)\s*$/, "").trim();
    const entry = byPublisher.get(name) ?? { datasets: new Set<string>(), url: null };
    if (s.dataset) entry.datasets.add(s.dataset);
    if (!entry.url && s.url) entry.url = s.url;
    byPublisher.set(name, entry);
  }

  const data: TheCityPageData = {
    buildings: m.buildings.n,
    blocks: blockIndex.meta.n_blocks,
    streets: m.streets.n,
    trees: m.trees.n,
    decisions: blockIndex.meta.n_decisions_placed,
    streetOnly: blockIndex.meta.precision_counts.street ?? 0,
    unplaced: blockIndex.meta.n_unplaced,
    blocksWithRecord: withRecord,
    volumes: blockIndex.meta.leaf_mapped_volumes.length,
    // THE SPAN IS THE MAXIMUM AGAIN, BECAUSE THE TAIL IS REAL NOW.
    //
    // It was clamped to SERIES_LAST_YEAR, and that was right at the time: the
    // largest year in the index was 2013 and it was carried by SEVEN rows,
    // against 4,185 in the 1990s. Printing "1906-2013" over that told a reader
    // the record reached 2013 and implied fourteen years that were empty.
    //
    // The clamp outlived its reason. The Clerk's own PDFs are swept, placed
    // and published, and every year to 2026 carries hundreds of decisions —
    // 2019: 324, 2022: 208, 2025: 319, 2026: 109 so far. Clamping now commits
    // the opposite error of the one it was written to prevent: it hides ten
    // years the map actually draws, and it contradicts the decade rail beside
    // it, which shows a 2020s rung.
    //
    // SERIES_LAST_YEAR stays 2016 and stays true — it is where the Internet
    // Archive's bound volumes end. It is simply no longer where the record
    // ends, and this line was the last place still treating those as one fact.
    span: `${first}–${last}`,
    record: recordProvenance(),
    accuracy: {
      n: accuracy.n,
      key: accuracy.key_items ?? accuracy.n,
      exact: accuracy.exact,
    },
    publishers: [...byPublisher.entries()]
      .map(([name, v]) => ({ name, datasets: v.datasets.size, url: v.url }))
      .sort((a, b) => b.datasets - a.datasets || a.name.localeCompare(b.name)),
  };

  return data;
}
