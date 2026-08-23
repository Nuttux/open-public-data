import type { Metadata } from "next";
import "@/app/fusion.css";
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

import TheCityClient, { type TheCityPageData } from "./TheCityClient";

/**
 * /us/city/sf/the-city — server component (ADR-0010 D3, EN-only), on the same
 * shape as every other page in this section: the server reads the export, does
 * the arithmetic that is not a render, and hands a SLIM payload to the client.
 *
 * The slim payload matters more here than anywhere else on the site. The map's
 * own record is 12.5 MB of binary chunks and it does NOT come through the page:
 * it is fetched by the camera, chunk by chunk, from `public/data/us/sf/city/`.
 * What is read here is the manifest's own catalogue — the counts, the byte
 * totals and the provenance table — so the page can say what it is about to
 * fetch and where every field came from without fetching any of it.
 *
 * `title.absolute`: no France brand template on US routes.
 */
export const metadata: Metadata = {
  title: "San Francisco — The city, drawn from its own record",
  description:
    "166,166 buildings, 5,404 assessor blocks, 22,191 streets and 195,310 street trees, drawn from San Francisco's published record — and for every block, what the Board of Supervisors decided there, linked to the page of the scan.",
};

interface ManifestShape {
  buildings: { n: number; nSolo: number };
  streets: { n: number };
  trees?: unknown;
  tiers: Record<string, { chunks: number; bytes: number; gzipBytes: number; minZ: number }>;
  sources: Record<
    string,
    { dataset?: string; publisher?: string; what?: string; url?: string; retrieved?: string }
  >;
  kinds: Record<string, { provenance?: Record<string, string> }>;
  chunks: { k: string; tier: string; b: number; gz: number; n?: number }[];
}

function readJson<T>(rel: string): T {
  const p = path.join(process.cwd(), "public", rel);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

export default function SfTheCityPage() {
  const m = readJson<ManifestShape>("data/us/sf/city/manifest.json");
  const blockIndex = readJson<{
    meta: {
      n_blocks: number;
      n_decisions_placed: number;
      n_unplaced: number;
      precision_counts: Record<string, number>;
      leaf_mapped_volumes: string[];
    };
    n: number[];
    ns: number[];
  }>("data/us/sf/city/blocks/block-index.json");
  const accuracy = readJson<{
    n: number;
    exact: number;
    within_one_block_face: number;
    within_250m: number;
    over_600m: number;
    street_tier_note: string;
  }>("data/us/sf/city/blocks/accuracy.json");

  const base = m.tiers.base;

  /* THE FIRST-PAINT NUMBER IS MEASURED HERE, not quoted.
     `DATA.md` §13 states 681,661 bytes gzipped for the twelve base chunks plus
     the manifest, and that table was true when it was written — the encoder has
     been re-run since and the manifest has grown. So the page gzips the files
     it is actually going to serve, at build time, and prints that. A byte
     count nobody re-measured is exactly the kind of claim this project has
     been bitten by. */
  const root = path.join(process.cwd(), "public", "data/us/sf/city");
  const gz = (rel: string): number =>
    gzipSync(readFileSync(path.join(root, rel)), { level: 9 }).byteLength;
  const manifestBytes = statSync(path.join(root, "manifest.json")).size;
  const manifestGzip = gz("manifest.json");
  const baseChunkGzip = m.chunks
    .filter((c) => c.tier === "base")
    .reduce((a, c) => a + gz(`${c.k}.qc`), 0);
  const sidecarGzip = gz("base/heroes.json") + gz("base/marks.json") + gz("base/blocks-id.json");

  const whole = Object.values(m.tiers).reduce(
    (a, t) => ({ chunks: a.chunks + t.chunks, bytes: a.bytes + t.bytes, gz: a.gz + t.gzipBytes }),
    { chunks: 0, bytes: 0, gz: 0 },
  );

  // clickable = the record places at least one BLOCK-precision decision there.
  // ns > 0 with n === 0 is clickable too, but can only say "on these streets".
  let clickable = 0;
  let streetOnly = 0;
  let empty = 0;
  for (let i = 0; i < blockIndex.n.length; i++) {
    if (blockIndex.n[i] > 0) clickable++;
    else if (blockIndex.ns[i] > 0) streetOnly++;
    else empty++;
  }

  const data: TheCityPageData = {
    buildings: m.buildings.n,
    solos: m.buildings.nSolo,
    blocks: blockIndex.meta.n_blocks,
    streets: m.streets.n,
    baseChunks: base.chunks,
    baseGzip: baseChunkGzip,
    manifestBytes,
    manifestGzip,
    sidecarGzip,
    firstPaintGzip: baseChunkGzip + manifestGzip,
    wholeRecordChunks: whole.chunks,
    wholeRecordBytes: whole.bytes,
    tiers: Object.entries(m.tiers).map(([k, v]) => ({
      tier: k,
      chunks: v.chunks,
      gzipBytes: v.gzipBytes,
      minZ: v.minZ,
    })),
    decisions: blockIndex.meta.n_decisions_placed,
    unplaced: blockIndex.meta.n_unplaced,
    volumes: blockIndex.meta.leaf_mapped_volumes.length,
    precisionCounts: blockIndex.meta.precision_counts,
    clickableBlocks: clickable,
    streetOnlyBlocks: streetOnly,
    emptyBlocks: empty,
    accuracy,
    sources: Object.entries(m.sources)
      .map(([key, s]) => ({
        key,
        dataset: s.dataset ?? null,
        publisher: s.publisher ?? null,
        what: s.what ?? null,
        url: s.url ?? null,
      }))
      .sort((a, b) => (a.publisher ?? "").localeCompare(b.publisher ?? "")),
  };

  return <TheCityClient data={data} />;
}
