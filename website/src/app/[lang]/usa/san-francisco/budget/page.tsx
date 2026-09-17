import type { Metadata } from "next";
import "@/app/fusion.css";
import SfBudgetClient, { type SfBudgetPageData, type SfSpark } from "./SfBudgetClient";
import {
  availableFiscalYears,
  defaultFiscalYear,
  loadSfBudgetBreakdown,
  loadSfBudgetByYear,
  loadSfBva,
} from "@/lib/us/sf-budget-data";
import { loadSfContractsOverview } from "@/app/[lang]/usa/san-francisco/contracts/data";
import type { WgpFile } from "@/app/[lang]/usa/san-francisco/who-gets-paid/wgp-types";
import type { PayrollByYear } from "@/app/[lang]/usa/san-francisco/payroll/payroll-types";
import { readDataJson } from "@/lib/data/read";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfBudgetHub, SfHubJsonLd } from "@/lib/seo/sections/sf";

/**
 * /usa/san-francisco/budget — server component (ADR-0010 D3, EN-only). Loads
 * the pipeline exports from public/data/us/sf/ and hands a SLIM payload to
 * the client: the selected year's breakdown minus the dept×character cells
 * (those feed the server-rendered fiches, not the page), the small curves of
 * every service area and type across the years, the citywide adopted-vs-
 * actual spine, the long trend, and the figures of the other sections' doors.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfBudgetHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

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

  // The small curve of each line across the years : service areas survive
  // the FY2018 chart-of-accounts break, types only exist on the modern
  // chart (FY2019 on) — compared across the break they would be artefacts.
  const sparks: SfSpark = { services: {}, spending: {}, revenue: {} };
  const push = (into: Record<string, { year: number; value: number }[]>, key: string, fy: number, value: number) => {
    (into[key] ??= []).push({ year: fy, value });
  };
  for (const fy of years) {
    const bd = loadSfBudgetBreakdown(fy);
    if (!bd || !bd.drill.available) continue;
    for (const g of bd.org_groups.spending) push(sparks.services, g.label, fy, g.total_usd);
    if (bd.chart_of_accounts !== breakdown.chart_of_accounts) continue;
    for (const c of bd.characters.spending) push(sparks.spending, c.code, fy, c.total_usd);
    for (const c of bd.characters.revenue) push(sparks.revenue, c.code, fy, c.total_usd);
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

  // The doors carry the other sections' figures.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const payees = safe(() => {
    const file = readDataJson<WgpFile>("us/sf/top_payees.json");
    const ys = Object.entries(file.years).map(([k, y]) => ({ fy: Number(k), status: y.execution_status, total: y.totals.all_usd })).sort((a, b) => a.fy - b.fy);
    const pick = ys.filter((y) => y.status === "closed").at(-1) ?? ys.at(-1);
    return pick ? { fy: pick.fy, total: pick.total } : null;
  });
  const contracts = safe(() => {
    const o = loadSfContractsOverview();
    return { n: o.hero.active.n_contracts, agreed: o.hero.active.agreed_usd };
  });
  const payroll = safe(() => {
    const p = readDataJson<PayrollByYear>("us/sf/payroll_by_year.json");
    const last = [...p.points].sort((a, b) => a.fiscal_year - b.fiscal_year).at(-1);
    return last ? { fy: last.fiscal_year, total: last.total_compensation_usd, n: last.n_employees } : null;
  });

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
    sparks,
    spine,
    trend,
    doors: { payees, contracts, payroll },
    source: breakdown.source,
    generated_at: breakdown.generated_at,
  };

  return (
    <>
      <SfHubJsonLd hub={sfBudgetHub()} />
      <SfBudgetClient d={d} />
    </>
  );
}
