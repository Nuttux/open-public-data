import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import WhoGetsPaidClient from "./WhoGetsPaidClient";
import type { WgpFile, WgpMeta, WgpYearStatus } from "./wgp-types";

/**
 * /us/city/sf/who-gets-paid — server component. Loads the pipeline export
 * (public/data/us/sf/top_payees.json, 21 fiscal years) and hands the client
 * ONE year's payload plus the year list — the YearPicker navigates with
 * ?year= (the Paris budget pattern), so the RSC payload stays ~40KB instead
 * of 1.5MB. EN-only (ADR-0010).
 *
 * Default year = the latest CLOSED fiscal year (execution_status enum from
 * the export — recently-closed years are selectable but banner-labeled as
 * preliminary while the Controller's close runs).
 */
export const metadata: Metadata = {
  title: { absolute: "US · San Francisco — Payees" },
  description:
    "Every payment through San Francisco's financial system, ranked and classified: service providers, nonprofits, fiscal agents, grant-funded dollars — from the Controller's weekly vendor-payments ledger.",
};

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

export default async function WhoGetsPaidPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const file = readJson<WgpFile>("top_payees.json");
  // Raw vendor string → normalized payee slug, so a top-payee row can open
  // its fiche (only for the keyed top ~200; everything else stays plain text).
  const vendorSlugMap =
    readDataJsonOrNull<Record<string, string>>("us/sf/payees/_vendor_slug_map.json") ?? {};
  const sp = await searchParams;

  const years: WgpYearStatus[] = Object.entries(file.years)
    .map(([fy, y]) => ({ fy: Number(fy), status: y.execution_status }))
    .sort((a, b) => a.fy - b.fy);

  const latestClosed = years.filter((y) => y.status === "closed").at(-1);
  const fallbackFy = latestClosed?.fy ?? years.at(-1)!.fy;

  const requested = Number(sp.year);
  const fy = years.some((y) => y.fy === requested) ? requested : fallbackFy;
  const yearData = file.years[String(fy)];

  const meta: WgpMeta = {
    as_of: file.as_of,
    generated_at: file.generated_at,
    source_pipeline: file.source_pipeline,
    source: file.source,
    perimeter: file.perimeter,
    ranking_caveat: file.ranking_caveat,
    classification: file.classification,
    default_view: file.default_view,
    grant_lens_definition: file.grant_lens_definition,
    nonprofit_floor_note: file.nonprofit_floor_note,
    notes: file.notes,
    top_n: file.top_n,
  };

  return (
    <WhoGetsPaidClient
      fy={fy}
      yearData={yearData}
      years={years}
      meta={meta}
      materiality={file.materiality}
      vendorSlugMap={vendorSlugMap}
    />
  );
}
