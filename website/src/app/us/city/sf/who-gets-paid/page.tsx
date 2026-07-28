import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfBudgetBreakdown,
} from "@/lib/us/sf-budget-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { loadSfSpendingSection } from "@/lib/us/sf-spending";
import { loadSfPaymentBreakdowns } from "@/lib/us/sf-payment-breakdowns";
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
  title: "San Francisco — Payees",
  description:
    "Every payment through San Francisco's financial system, ranked and classified: service providers, nonprofits, fiscal agents, grant-funded dollars — from the Controller's weekly vendor-payments ledger.",
};

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

/** The ONE predicate — mirrored in PayeesExplorer, and the reason a chip that
 *  survives here cannot come back empty when clicked. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Curated shortlist — homelessness, education, utilities, health, transit,
 *  food security. Curation picks the candidates; the corpus decides which
 *  survive. */
const SEED_CANDIDATES = [
  "Tenderloin Housing",
  "Five Keys",
  "Catholic Charities",
  "Kaiser",
  "Siemens",
  "Pacific Gas",
  "Meals on Wheels",
  "Food Bank",
];

/**
 * Two tiers, both validated against the live search index:
 *   · the curated candidates that actually match something;
 *   · the biggest payees of the year, as concrete names to try.
 * Same shape as the contracts search seeds (SfContractsSearch), which is
 * curated + computed-from-corpus.
 */
function buildSearchSeeds(fy: number): string[] {
  const payload = readDataJsonOrNull<{ data?: { name: string; bucket: string | null }[] }>(
    "us/sf/payees_search.json",
  );
  const names = (payload?.data ?? []).filter((p) => p.bucket !== "person").map((p) => p.name);
  if (names.length === 0) return [];
  const norms = names.map(normName);
  const alive = (s: string) => {
    const toks = normName(s).split(" ").filter(Boolean);
    return norms.some((n) => toks.every((tok) => n.includes(tok)));
  };

  const curated = SEED_CANDIDATES.filter(alive).slice(0, 5);
  const takenNorms = curated.map(normName);
  const doc = readJson<WgpFile>("top_payees.json");
  const year = doc.years[String(fy)];
  // Never suggest what the default view hides. The computed tier first
  // produced "THE DEPOSITORY" and "THE BANK" — bond trustees and paying
  // agents, which the page deliberately keeps behind the pass-through
  // toggle. A suggestion that lands on a hidden row is a worse dead end
  // than one that returns nothing.
  const hidden = new Set(doc.default_view.excluded_buckets);
  const computed = (year?.payees ?? [])
    .filter(
      (p) =>
        p.bucket !== "person" && !p.is_aggregation_line && !hidden.has(p.bucket ?? ""),
    )
    .map((p) => p.vendor)
    // Two words is enough to be a useful query and short enough to be a chip;
    // a leading "THE" wastes one of them.
    .map((v) => v.replace(/^THE\s+/i, "").split(/\s+/).slice(0, 2).join(" "))
    .map((v) =>
      // Raw vendor strings are ALL CAPS; chips are read, not queried by eye.
      v
        .split(" ")
        .map((w) => (w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w))
        .join(" "),
    )
    .filter((v) => {
      const n = normName(v);
      return n.length > 3 && !takenNorms.some((c) => n.includes(c) || c.includes(n));
    })
    .filter(alive)
    .slice(0, Math.max(0, 7 - curated.length));

  return [...curated, ...[...new Set(computed)]];
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


  // Department fiche hrefs, validated against the budget breakdown — the
  // materiality cards named a department in plain text with nowhere to go.
  const budgetFy = defaultFiscalYear(loadSfBudgetByYear());
  const deptHrefs: Record<string, string> = {};
  for (const dep of loadSfBudgetBreakdown(budgetFy)?.departments.spending ?? []) {
    deptHrefs[dep.code] = `/us/city/sf/budget/dept/${deptSlug(dep.code)}?year=${budgetFy}`;
  }

  // Search suggestions, validated HERE rather than in the client.
  //
  // The no-dead-suggestions rule says every chip is checked at runtime against
  // the exact corpus it queries, with the same predicate as the search. The
  // client cannot do that: the 2.3MB index is lazy and does not exist until
  // someone types, so chips would either be shown unvalidated (a dead chip is
  // exactly what the rule forbids) or validated against the top-100 only,
  // which would hide good suggestions that live in the tail.
  //
  // The server has no such constraint — it reads the same index the search
  // will query, checks each candidate, and ships ~7 strings.
  const searchSeeds = buildSearchSeeds(fy);

  // "What the City buys" — the whole purchasing side of the ledger, sliced to
  // this year server-side (the export is ~1.5MB; the client gets ~12 rows).
  const spending = loadSfSpendingSection(fy);
  // The same year's payments by department / service area / payee kind.
  const breakdowns = loadSfPaymentBreakdowns(fy);

  return (
    <WhoGetsPaidClient
      fy={fy}
      spending={spending}
      breakdowns={breakdowns}
      deptHrefs={deptHrefs}
      yearData={yearData}
      years={years}
      meta={meta}
      materiality={file.materiality}
      vendorSlugMap={vendorSlugMap}
      searchSeeds={searchSeeds}
    />
  );
}
