import type { Metadata } from "next";
import "@/app/fusion.css";
import SfBudgetClient, { type SfBudgetPageData } from "./SfBudgetClient";
import {
  availableFiscalYears,
  defaultFiscalYear,
  loadSfBudgetBreakdown,
  loadSfBudgetByYear,
  loadSfBva,
  loadSfBvaDepartments,
} from "@/lib/us/sf-budget-data";

/**
 * /us/city/sf/budget — server component (ADR-0010 D3, EN-only). Loads the
 * pipeline exports from public/data/us/sf/ and hands a SLIM payload to the
 * client: the selected year's breakdown minus the dept×character cells
 * (those feed the server-rendered fiches, not the page) and only the
 * relevant budget-vs-actual slices.
 *
 * `title.absolute`: no France brand template on US routes (Block 0
 * precedent — the US side has no public name yet).
 */
export const metadata: Metadata = {
  title: { absolute: "San Francisco · Budget — what the City plans to spend" },
  description:
    "The San Francisco adopted budget, year by year: 7 service areas, 55 departments, spending and revenue types, and adopted-vs-executed — from the SF Controller's Annual Appropriation Ordinance database.",
};

export default async function SfBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const byYear = loadSfBudgetByYear();
  const years = availableFiscalYears(byYear);
  const fallbackYear = defaultFiscalYear(byYear);
  const requested = sp.year ? Number(sp.year) : fallbackYear;
  const year = years.includes(requested) ? requested : fallbackYear;

  const breakdown = loadSfBudgetBreakdown(year) ?? loadSfBudgetBreakdown(fallbackYear)!;

  const statuses: SfBudgetPageData["statuses"] = {};
  for (const p of byYear.sides.spending.points) {
    statuses[String(p.fiscal_year)] = p.execution_status;
  }

  // Citywide operating spine (spending side) — the honest comparison pair.
  const bva = loadSfBva();
  const spine = bva.sides.spending.points
    .filter((p) => p.operating_comparison.budget_usd != null)
    .map((p) => ({
      fiscal_year: p.fiscal_year,
      budget_usd: p.operating_comparison.budget_usd,
      actual_usd: p.operating_comparison.actual_usd,
      residual_pct: p.operating_comparison.residual_pct,
    }))
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  // Long budget-vs-actual trend (all funds): actuals reach back to FY1999,
  // adopted budget begins FY2010 — both straight from budget_vs_actual.json,
  // the one file where the two are constructed to be comparable.
  const trend = bva.sides.spending.points
    .map((p) => ({
      fiscal_year: p.fiscal_year,
      budget_net_usd: p.budget_net_usd,
      // Incomplete fiscal years carry only a partial YTD actual — drop it so
      // the line ends at the last closed year rather than plunging.
      actual_all_usd: p.is_fiscal_year_complete === false ? null : p.actual_all_usd,
    }))
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  // Department table: the selected year when covered, else the latest
  // covered (closed) year.
  let bvaTable: SfBudgetPageData["bvaTable"] = null;
  try {
    const bvaDepts = loadSfBvaDepartments();
    const covered = bvaDepts.coverage.fiscal_years.slice().sort((a, b) => b - a);
    const tableYear = covered.includes(year) ? year : covered[0];
    const rows = bvaDepts.years[String(tableYear)]?.spending ?? [];
    bvaTable = {
      fiscal_year: tableYear,
      rows,
      perimeter: bvaDepts.perimeter,
      coverage_note: bvaDepts.coverage.note,
      sources: {
        budget_url: bvaDepts.sources.budget.source_url,
        actuals_url: bvaDepts.sources.actuals.source_url,
      },
    };
  } catch {
    bvaTable = null;
  }

  // Slim the breakdown for the client: the page never renders the
  // dept×character cells (fiches assemble them server-side).
  const slimBreakdown = {
    ...breakdown,
    dept_characters: { columns: breakdown.dept_characters.columns, spending: [], revenue: [] },
  };

  const d: SfBudgetPageData = {
    year,
    years,
    statuses,
    points: {
      spending: byYear.sides.spending.points,
      revenue: byYear.sides.revenue.points,
    },
    population: {
      value: byYear.population.value,
      year: byYear.population.year,
      source: byYear.population.source,
      source_url: byYear.population.source_url,
    },
    breakdown: slimBreakdown,
    spine,
    trend,
    bvaTable,
    source: breakdown.source,
    generated_at: breakdown.generated_at,
    source_pipeline: breakdown.source_pipeline,
  };

  return <SfBudgetClient d={d} />;
}
