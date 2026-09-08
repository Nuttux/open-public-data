import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson } from "@/lib/data/read";
import SfRecordsClient, {
  type RecordsSchema,
  type RecordsStats,
} from "./SfRecordsClient";
import { sectionAlternates } from "@/lib/seo/page-answer";

/**
 * /us/city/sf/records — the Board of Supervisors record table, as a dataset.
 *
 * WHY THIS PAGE EXISTS. Until now the map's internals WERE the public data:
 * 256 shards of bitmasks and single-letter keys, a transport format nobody
 * could read, with no coordinate column in it at all. The table this page
 * describes is the row-level dataset those shards should always have been a
 * projection of — and a dataset with no page explaining its columns is a
 * puzzle, not an open record.
 *
 * BOTH NUMBERS ARE COUNTED AT BUILD, NOT HERE. `stats.json` is written by
 * `build_core_table.py` over the same rows it publishes, so the figure on the
 * page and the figure in the file cannot drift. A page that counted for itself
 * would eventually disagree with the download it is describing.
 */
export const metadata: Metadata = {
  ...sectionAlternates("/us/city/sf/records", "en"),
  title: "San Francisco — the Board's records, as data",
  description:
    "Every decision the San Francisco Board of Supervisors recorded between 1906 and 2026, as one downloadable table — what each column means, how much of it has been classified, and what the record cannot tell you.",
};

export default function SfRecordsPage() {
  const schema = readDataJson<RecordsSchema>("us/sf/city/records/schema.json");
  const stats = readDataJson<RecordsStats>("us/sf/city/records/stats.json");
  return <SfRecordsClient schema={schema} stats={stats} />;
}
