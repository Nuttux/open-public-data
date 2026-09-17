import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson } from "@/lib/data/read";
import PayrollClient, { type SfPayrollDoors } from "./PayrollClient";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
  PayrollByFamilyCitywide,
  PayrollFamilyDistribution,
  PayrollFamilyDistRow,
} from "./payroll-types";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfPayrollHub, SfHubJsonLd } from "@/lib/seo/sections/sf";
import { defaultFiscalYear, loadSfBudgetBreakdown, loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import { loadSfLieux } from "@/lib/us/sf-lieux-section";
import type { WgpFile } from "@/app/[lang]/usa/san-francisco/who-gets-paid/wgp-types";

/**
 * /usa/san-francisco/payroll — server component. Loads the payroll exports
 * from public/data/us/sf/ at render time and hands them to the client, with
 * the fiscal year the address asks for (?year=, the Paris budget pattern).
 * EN-only (ADR-0010 D3).
 *
 * payroll_by_family_year.json (the dept × job-family drill grain, ~2.9MB)
 * is published alongside these files but deliberately NOT loaded here —
 * the page renders citywide/department altitudes only; the drill file
 * exists for the fiches.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfPayrollHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

export default async function SfPayrollPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const byYear = readJson<PayrollByYear>("payroll_by_year.json");
  const byDept = readJson<PayrollByDept>("payroll_by_dept_year.json");
  const distribution = readJson<PayrollDistribution>("payroll_distribution.json");
  const overtime = readJson<PayrollOvertime>("payroll_overtime.json");
  // Citywide display_family × year roll-up (~72KB) — powers the scene.
  const byFamily = readJson<PayrollByFamilyCitywide>("payroll_by_family_citywide.json");

  const years = byYear.points.map((p) => p.fiscal_year).sort((a, b) => a - b);
  const requested = Number(sp.year);
  const fy = years.includes(requested) ? requested : years[years.length - 1];

  // The distribution cut by job family (~420KB on disk) — the pay ladder and
  // the "who is paid in this band" panel. Slimmed here to the fields the
  // client actually renders.
  const famDistFile = readJson<PayrollFamilyDistribution>("payroll_family_distribution.json");
  const familyDistribution: Record<string, PayrollFamilyDistRow[]> = {};
  for (const [fyKey, rows] of Object.entries(famDistFile.years)) {
    familyDistribution[fyKey] = rows.map((r) => ({
      display_family: r.display_family,
      is_pooled: r.is_pooled,
      n_people: r.n_people,
      total_compensation_usd: r.total_compensation_usd,
      p25_usd: r.p25_usd,
      p50_usd: r.p50_usd,
      p75_usd: r.p75_usd,
      p90_usd: r.p90_usd,
      n_in_histogram: r.n_in_histogram,
      histogram: r.histogram,
    }));
  }

  // The doors carry the other sections' figures.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors: SfPayrollDoors = {
    budget: safe(() => {
      const bfy = defaultFiscalYear(loadSfBudgetByYear());
      const bd = loadSfBudgetBreakdown(bfy);
      return bd ? { fy: bfy, total: bd.totals.spending.total_usd } : null;
    }),
    payees: safe(() => {
      const file = readDataJson<WgpFile>("us/sf/top_payees.json");
      const ys = Object.entries(file.years).map(([k, y]) => ({ fy: Number(k), status: y.execution_status, total: y.totals.all_usd })).sort((a, b) => a.fy - b.fy);
      const pick = ys.filter((y) => y.status === "closed").at(-1) ?? ys.at(-1);
      return pick ? { fy: pick.fy, total: pick.total } : null;
    }),
    places: safe(() => {
      const s = loadSfLieux().section;
      return { total: s.total, n: s.withMoney };
    }),
  };

  return (
    <>
      <SfHubJsonLd hub={sfPayrollHub()} />
      <PayrollClient
        fy={fy}
        years={years}
        byYear={byYear}
        byDept={byDept}
        distribution={distribution}
        overtime={overtime}
        byFamily={byFamily}
        familyDistribution={familyDistribution}
        familyDistNotes={{ ladder: famDistFile.ladder_note, attribution: famDistFile.attribution_note }}
        doors={doors}
      />
    </>
  );
}
