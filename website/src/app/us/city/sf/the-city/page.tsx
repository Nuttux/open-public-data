import type { Metadata } from "next";
import "@/app/fusion.css";
import { readFileSync } from "node:fs";
import path from "node:path";

import TheCityClient, { type TheCityPageData } from "./TheCityClient";
import { SERIES_LAST_YEAR } from "@/components/us/city/block-records";

/**
 * /us/city/sf/the-city — server component (ADR-0010 D3, EN-only), on the same
 * shape as every other page in this section: the server reads the export, does
 * the arithmetic that is not a render, and hands a SLIM payload to the client.
 *
 * The slim payload matters more here than anywhere else on the site. The map's
 * own record is 12.5 MB of binary chunks and it does NOT come through the
 * page: it is fetched by the camera from `public/data/us/sf/city/`. What is
 * read here is the manifest's own catalogue — the counts and the provenance —
 * so the page can say what it is drawn from without fetching any of it.
 *
 * Everything below is a number a READER is shown or a name a reader reads.
 * The byte totals, the tier table and the field-by-field source list used to
 * be on this page too; they are engineering facts, they are in `manifest.json`
 * — linked and downloadable at the foot of the page — and they are no longer
 * printed in prose.
 */
export const metadata: Metadata = {
  title: "San Francisco — The city, drawn from its own record",
  description:
    "San Francisco drawn from the record the city publishes: every building at the height the city measured, and for every block what the Board of Supervisors decided there, linked to the page of the scan.",
};

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
  const p = path.join(process.cwd(), "public", rel);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

/** A publisher stops being a source the moment it is us. */
const OURS = "this project";

export default function SfTheCityPage() {
  const m = readJson<ManifestShape>("data/us/sf/city/manifest.json");
  const blockIndex = readJson<BlockIndexShape>("data/us/sf/city/blocks/block-index.json");
  const accuracy = readJson<{ n: number; exact: number }>(
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
    // THE SPAN IS THE SERIES, NOT THE MAXIMUM. `max(y1)` is 2013 and it is
    // carried by SEVEN rows: the Board's decades run 4,185 in the 1990s, then
    // 26 and 49. All 142 Journal volumes end in 1998-99, so the scanned series
    // ends at SERIES_LAST_YEAR and the handful of later rows are DPW annual
    // reports, not the Board's proceedings. Printing "1906-2013" over that
    // tells a reader the record reaches 2013, and the fourteen years it
    // implies are almost entirely empty. The record does not stop in 1999 —
    // it moves to Legistar, 30,428 matters for 2000-2018 — but Legistar
    // carries no location and is not in this pipeline, which is the thing the
    // page has to say rather than paper over.
    span: `${first}–${Math.min(last, SERIES_LAST_YEAR)}`,
    accuracy: { n: accuracy.n, exact: accuracy.exact },
    publishers: [...byPublisher.entries()]
      .map(([name, v]) => ({ name, datasets: v.datasets.size, url: v.url }))
      .sort((a, b) => b.datasets - a.datasets || a.name.localeCompare(b.name)),
  };

  return <TheCityClient data={data} />;
}
