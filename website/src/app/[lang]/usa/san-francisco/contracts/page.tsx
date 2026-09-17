import type { Metadata } from "next";
import "@/app/fusion.css";
import SfContractsClient, { type SfContractsDoors } from "./SfContractsClient";
import {
  loadSfContractDeptBars,
  loadSfContractPrimes,
  loadSfContractsActive,
  loadSfContractsOverview,
} from "./data";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfContractsHub, SfHubJsonLd } from "@/lib/seo/sections/sf";
import { contractLabel } from "./us-sf-contracts-types";
import { readDataJson } from "@/lib/data/read";
import { defaultFiscalYear, loadSfBudgetBreakdown, loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import type { WgpFile } from "@/app/[lang]/usa/san-francisco/who-gets-paid/wgp-types";
import type { PayrollByYear } from "@/app/[lang]/usa/san-francisco/payroll/payroll-types";

/**
 * /usa/san-francisco/contracts — server component. Loads the pipeline
 * exports and the server-side aggregates over them (suppliers, departments,
 * the digest of the active rows) and hands them to the client. EN-only
 * (ADR-0010 D3).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfContractsHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

/** How many start years the rail shows : the contracts running today were
 *  mostly signed in the last decade ; older starts are counted in the number
 *  and said in the note. */
const RAIL_YEARS = 15;
const TOP = 20;

/**
 * What the page needs from the 5 000 active rows, summed here once. The rows
 * themselves (3.3 MB) used to travel inline in the HTML as a prop — 2.9 MB
 * pages that crawlers give up on. Now the search fetches the JSON export in
 * the browser on the first keystroke, and the server hands the client this digest.
 */
export type SfActiveDigest = {
  n_rows: number;
  rowsUrl: string;
  types: { raw: string; amount: number; count: number }[];
  authorities: { raw: string; amount: number; count: number }[];
  /** Every department signing today, for the filter menu. */
  departments: { code: string; name: string }[];
  top: { contract_no: string; label: string; prime: string | null; department: string | null; agreed_usd: number; paid_usd: number; sole_source: boolean; paid_exceeds_agreed: boolean; end: string | null }[];
  /** Agreed amounts of the contracts running today, by the year their term started. */
  byStartYear: { year: number; amount: number }[];
  /** Agreed on the contracts that started before the rail's first year. */
  beforeRail: { year: number; amount: number } | null;
  n_paid_exceeds_agreed: number;
  n_paid_exceeds_agreed_reconciled: number;
  n_title_clear: number;
};

function digest(active: ReturnType<typeof loadSfContractsActive>): SfActiveDigest {
  const sum = (key: (r: (typeof active.rows)[number]) => string | null | undefined) => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const r of active.rows) {
      const k = key(r);
      if (!k) continue;
      const cur = by.get(k) ?? { amount: 0, count: 0 };
      cur.amount += r.agreed_usd;
      cur.count += 1;
      by.set(k, cur);
    }
    return [...by.entries()].map(([raw, v]) => ({ raw, ...v }));
  };
  const top = [...active.rows].sort((a, b) => b.agreed_usd - a.agreed_usd).slice(0, TOP);
  // Departments by code : the register spells DPW two ways, the code is the identity.
  const names = new Map<string, Map<string, number>>();
  for (const r of active.rows) {
    if (!r.department_code || r.department_code === "UNMAPPED_DEPTS" || !r.department) continue;
    const votes = names.get(r.department_code) ?? new Map<string, number>();
    votes.set(r.department, (votes.get(r.department) ?? 0) + 1);
    names.set(r.department_code, votes);
  }
  const departments = [...names.entries()]
    .map(([code, votes]) => ({ code, name: [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byYear = new Map<number, number>();
  for (const r of active.rows) {
    const y = r.start ? Number(r.start.slice(0, 4)) : NaN;
    if (Number.isFinite(y) && y > 1900) byYear.set(y, (byYear.get(y) ?? 0) + r.agreed_usd);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const lastYear = years[years.length - 1] ?? new Date().getFullYear();
  const firstRail = Math.max(years[0] ?? lastYear, lastYear - RAIL_YEARS + 1);
  const byStartYear: { year: number; amount: number }[] = [];
  for (let y = firstRail; y <= lastYear; y++) byStartYear.push({ year: y, amount: byYear.get(y) ?? 0 });
  const before = years.filter((y) => y < firstRail);
  const beforeRail = before.length ? { year: before[before.length - 1], amount: before.reduce((s, y) => s + (byYear.get(y) ?? 0), 0) } : null;
  return {
    n_rows: active.n_rows,
    rowsUrl: "/data/us/sf/contracts_active.json",
    types: sum((r) => r.contract_type),
    authorities: sum((r) => r.authority_family),
    departments,
    top: top.map((r) => ({ contract_no: r.contract_no, label: contractLabel(r), prime: r.prime ?? null, department: r.department ?? null, agreed_usd: r.agreed_usd, paid_usd: r.paid_usd, sole_source: r.sole_source, paid_exceeds_agreed: r.paid_exceeds_agreed, end: r.end ?? null })),
    byStartYear,
    beforeRail,
    n_paid_exceeds_agreed: active.rows.filter((r) => r.paid_exceeds_agreed).length,
    n_paid_exceeds_agreed_reconciled: active.rows.filter((r) => r.paid_exceeds_agreed && r.src_arithmetic_consistent === true).length,
    n_title_clear: active.rows.filter((r) => r.title_clear).length,
  };
}

export default function SfContractsPage() {
  const overview = loadSfContractsOverview();
  const active = digest(loadSfContractsActive());

  // The doors carry the other sections' figures.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors: SfContractsDoors = {
    payees: safe(() => {
      const file = readDataJson<WgpFile>("us/sf/top_payees.json");
      const ys = Object.entries(file.years).map(([k, y]) => ({ fy: Number(k), status: y.execution_status, total: y.totals.all_usd })).sort((a, b) => a.fy - b.fy);
      const pick = ys.filter((y) => y.status === "closed").at(-1) ?? ys.at(-1);
      return pick ? { fy: pick.fy, total: pick.total } : null;
    }),
    budget: safe(() => {
      const fy = defaultFiscalYear(loadSfBudgetByYear());
      const bd = loadSfBudgetBreakdown(fy);
      return bd ? { fy, total: bd.totals.spending.total_usd } : null;
    }),
    payroll: safe(() => {
      const p = readDataJson<PayrollByYear>("us/sf/payroll_by_year.json");
      const last = [...p.points].sort((a, b) => a.fiscal_year - b.fiscal_year).at(-1);
      return last ? { fy: last.fiscal_year, total: last.total_compensation_usd, n: last.n_employees } : null;
    }),
  };

  return (
    <>
      <SfHubJsonLd hub={sfContractsHub()} />
      <SfContractsClient
        overview={overview}
        active={active}
        primes={loadSfContractPrimes()}
        deptBars={loadSfContractDeptBars()}
        doors={doors}
      />
    </>
  );
}
