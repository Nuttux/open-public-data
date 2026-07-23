import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson } from "@/lib/data/read";
import {
  defaultFiscalYear,
  loadSfBudgetBreakdown,
  loadSfBudgetByYear,
  loadSfBvaDepartments,
} from "@/lib/us/sf-budget-data";
import { loadSfContractsOverview } from "../contracts/data";
import type { WgpFile, WgpMeta } from "../who-gets-paid/wgp-types";
import type { PayrollByYear } from "../payroll/payroll-types";
import SfSourcesClient, { type SfSourcesPageData } from "./SfSourcesClient";

/**
 * /us/city/sf/sources — server component (ADR-0010 D3, EN-only). The single
 * home for the SF section's sources & methodology. It loads the four content
 * datasets through the SAME loaders their own pages use and hands the client
 * ONLY the slices the moved footer blocks render — no page-level payload.
 *
 * Full pages under app/us inherit the layout locale, so no ForcedLocale
 * (that is only for the root-level @drawer intercepts). `title.absolute`:
 * no France brand template on US routes.
 */
export const metadata: Metadata = {
  title: { absolute: "US · San Francisco — Sources" },
  description:
    "Where every figure on San Francisco's budget, payees, contracts and payroll pages comes from — the source datasets, perimeters, privacy rules and methodology, in one place.",
};

export default function SfSourcesPage() {
  // ── Budget: default to the latest closed year (the budget page's default). ──
  const byYear = loadSfBudgetByYear();
  const fy = defaultFiscalYear(byYear);
  const breakdown = loadSfBudgetBreakdown(fy)!;
  // The comparison table's actuals dataset — surfaced as an extra source link
  // exactly as the budget footer does when the dept table is covered.
  let actualsUrl: string | null = null;
  try {
    actualsUrl = loadSfBvaDepartments().sources.actuals.source_url;
  } catch {
    actualsUrl = null;
  }

  // ── Payees: same WgpMeta the who-gets-paid page builds from top_payees.json. ──
  const wgp = readDataJson<WgpFile>("us/sf/top_payees.json");
  const payees: WgpMeta = {
    as_of: wgp.as_of,
    generated_at: wgp.generated_at,
    source_pipeline: wgp.source_pipeline,
    source: wgp.source,
    perimeter: wgp.perimeter,
    ranking_caveat: wgp.ranking_caveat,
    classification: wgp.classification,
    default_view: wgp.default_view,
    grant_lens_definition: wgp.grant_lens_definition,
    nonprofit_floor_note: wgp.nonprofit_floor_note,
    notes: wgp.notes,
    top_n: wgp.top_n,
  };

  // ── Contracts ──
  const overview = loadSfContractsOverview();

  // ── Payroll ──
  const payroll = readDataJson<PayrollByYear>("us/sf/payroll_by_year.json");

  const d: SfSourcesPageData = {
    budget: {
      perimeter: breakdown.perimeter,
      status: breakdown.execution_status,
      fy,
      as_of: breakdown.as_of,
      population: {
        value: byYear.population.value,
        year: byYear.population.year,
        source: byYear.population.source,
        source_url: byYear.population.source_url,
      },
      source: breakdown.source,
      actualsUrl,
      generated_at: breakdown.generated_at,
      source_pipeline: breakdown.source_pipeline,
    },
    payees,
    contracts: {
      source: overview.source,
      as_of: overview.as_of,
      dq: overview.data_quality,
      n_unknown_end: overview.hero.register.n_unknown_end,
    },
    payroll,
  };

  return <SfSourcesClient d={d} />;
}
