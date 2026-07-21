import "server-only";
import { readDataJson } from "@/lib/data/read";

/**
 * Server-side loaders for the /us/city/sf/budget exports
 * (public/data/us/sf/*, written by pipeline/scripts/export/export_us_sf.py).
 *
 * Mirrors lib/fusion-data.ts, but reads through the shared memoized
 * public/data entry point (lib/data/read.ts) instead of a local fs helper.
 * No arithmetic beyond reshaping — every number rendered comes from the
 * pipeline (rollups are dbt marts, identity-tested).
 */

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

// ─── budget_by_year.json ────────────────────────────────────────────────────

export type SfExecutionStatus =
  | "closed"
  | "recently_closed_preliminary"
  | "in_progress"
  | "adopted_only";

export type SfBudgetYearPoint = {
  fiscal_year: number;
  total_usd: number;
  transfer_adjustment_usd: number;
  n_lines: number;
  per_resident_usd: number | null;
  population_year: number | null;
  is_fiscal_year_complete: boolean;
  execution_status: SfExecutionStatus;
};

export type SfSourceBlock = {
  name: string;
  dataset_id: string;
  source_url: string;
  attribution: string;
  rows_updated_at: string | null;
};

export type SfBudgetByYear = {
  generated_at: string;
  source_pipeline: string;
  as_of: string | null;
  source: SfSourceBlock;
  population: {
    value: number;
    year: number;
    as_of: string | null;
    source: string;
    source_url: string;
    note: string;
  };
  perimeter: string;
  sides: {
    spending: { points: SfBudgetYearPoint[]; n_points: number };
    revenue: { points: SfBudgetYearPoint[]; n_points: number };
  };
  notes: string;
};

// ─── budget_breakdown_{fy}.json ─────────────────────────────────────────────

export type SfOrgGroupRow = {
  code: string;
  label: string;
  total_usd: number;
  transfer_adjustment_usd: number;
  share_of_side: number;
  n_departments: number;
};

export type SfDeptRow = {
  code: string;
  label: string;
  display_name: string | null;
  org_group_code: string;
  total_usd: number;
  transfer_adjustment_usd: number;
  share_of_side: number;
  n_characters: number;
};

export type SfCharacterRow = {
  code: string;
  label: string;
  gloss: string | null;
  display_category: "standard" | "internal" | "adjustment" | "offset";
  total_usd: number;
  share_of_side: number;
  n_departments: number;
  is_transfer_adjustment: boolean;
};

/** [department_code, character_code, amount_usd, is_transfer_adjustment(0|1)] */
export type SfCellRow = [string, string, number, number];

export type SfBudgetBreakdown = {
  generated_at: string;
  source_pipeline: string;
  fiscal_year: number;
  execution_status: SfExecutionStatus;
  as_of: string | null;
  source: SfSourceBlock;
  perimeter: string;
  chart_of_accounts: "modern" | "legacy";
  drill: { available: boolean; reason: string | null };
  totals: {
    spending: SfBreakdownTotals;
    revenue: SfBreakdownTotals;
  };
  org_groups: { spending: SfOrgGroupRow[]; revenue: SfOrgGroupRow[] };
  departments: { spending: SfDeptRow[]; revenue: SfDeptRow[] };
  dept_characters: {
    columns: string[];
    spending: SfCellRow[];
    revenue: SfCellRow[];
  };
  characters: { spending: SfCharacterRow[]; revenue: SfCharacterRow[] };
  program_strip: {
    available: boolean;
    note: string;
    rows: { program: string; total_usd: number; share_of_side: number }[];
  };
  funds: {
    spending: { fund_type: string; fund_category: string; total_usd: number; n_funds: number }[];
    revenue: { fund_type: string; fund_category: string; total_usd: number; n_funds: number }[];
  };
  notes: string;
};

export type SfBreakdownTotals = {
  total_usd: number;
  transfer_adjustment_usd: number;
  n_lines: number;
  per_resident_usd: number | null;
  population_year: number | null;
};

// ─── budget_vs_actual.json (citywide spine) ────────────────────────────────

export type SfBvaPoint = {
  fiscal_year: number;
  budget_net_usd: number | null;
  actual_all_usd: number | null;
  is_fiscal_year_complete?: boolean;
  operating_comparison: {
    budget_usd: number | null;
    actual_usd: number | null;
    residual_usd: number | null;
    residual_pct: number | null;
  };
};

export type SfBva = {
  as_of: string | null;
  sources: {
    budget: { source_url: string; rows_updated_at: string | null };
    actuals: { source_url: string; rows_updated_at: string | null };
  };
  comparable_perimeter: string;
  notes: string;
  sides: {
    spending: { points: SfBvaPoint[] };
    revenue: { points: SfBvaPoint[] };
  };
};

// ─── budget_vs_actual_departments.json ─────────────────────────────────────

export type SfBvaDeptRow = {
  code: string;
  label: string;
  display_name: string | null;
  org_group_code: string;
  budget_usd: number | null;
  actual_usd: number | null;
  residual_usd: number | null;
  residual_pct: number | null;
  is_comparable: boolean;
  is_structural_outlier: boolean;
  outlier_note: string | null;
};

export type SfBvaDepartments = {
  as_of: string | null;
  sources: {
    budget: { source_url: string; rows_updated_at: string | null };
    actuals: { source_url: string; rows_updated_at: string | null };
  };
  perimeter: string;
  coverage: { fiscal_years: number[]; note: string };
  structural_outliers_note: string;
  years: Record<string, { spending: SfBvaDeptRow[]; revenue: SfBvaDeptRow[] }>;
};

// ─── Loaders ────────────────────────────────────────────────────────────────

export function loadSfBudgetByYear(): SfBudgetByYear {
  return readJson<SfBudgetByYear>("budget_by_year.json");
}

export function loadSfBudgetBreakdown(fy: number): SfBudgetBreakdown | null {
  try {
    return readJson<SfBudgetBreakdown>(`budget_breakdown_${fy}.json`);
  } catch {
    return null;
  }
}

export function loadSfBva(): SfBva {
  return readJson<SfBva>("budget_vs_actual.json");
}

export function loadSfBvaDepartments(): SfBvaDepartments {
  return readJson<SfBvaDepartments>("budget_vs_actual_departments.json");
}

/** Newest fiscal year whose execution is closed — the page's default year
 *  (Paris pattern: default to the last executed exercice). */
export function defaultFiscalYear(byYear: SfBudgetByYear): number {
  const closed = byYear.sides.spending.points
    .filter((p) => p.execution_status === "closed")
    .map((p) => p.fiscal_year);
  return Math.max(...closed);
}

export function availableFiscalYears(byYear: SfBudgetByYear): number[] {
  return byYear.sides.spending.points.map((p) => p.fiscal_year).sort((a, b) => a - b);
}

// ─── Fiche assembly (dept / character drawers) ──────────────────────────────

import { characterCodeFromSlug, deptCodeFromSlug } from "./sf-budget-slugs";

export type SfSide = "spending" | "revenue";

export type SfDeptFicheData = {
  fiscal_year: number;
  execution_status: SfExecutionStatus;
  code: string;
  label: string;
  display_name: string | null;
  org_group_code: string;
  org_group_label: string | null;
  spending: SfDeptSideBlock | null;
  revenue: SfDeptSideBlock | null;
  bva: (SfBvaDeptRow & { fiscal_year: number }) | null;
  source: SfSourceBlock;
  as_of: string | null;
};

export type SfDeptSideBlock = {
  total_usd: number;
  transfer_adjustment_usd: number;
  share_of_side: number;
  /** Positive standard/internal cells, sorted desc — safe for bars. */
  characters: { code: string; label: string; gloss: string | null; amount_usd: number }[];
  /** Negative cells + transfer-adjustment lines — offsets block only. */
  offsets: { code: string; label: string; gloss: string | null; amount_usd: number; is_transfer_adjustment: boolean }[];
};

function sideBlock(
  bd: SfBudgetBreakdown,
  side: SfSide,
  deptCode: string,
): SfDeptSideBlock | null {
  const deptRow = bd.departments[side].find((d) => d.code === deptCode);
  if (!deptRow) return null;
  const charIndex = new Map(bd.characters[side].map((c) => [c.code, c]));
  const cells = bd.dept_characters[side].filter((c) => c[0] === deptCode);
  const positive: SfDeptSideBlock["characters"] = [];
  const offsets: SfDeptSideBlock["offsets"] = [];
  for (const [, code, amount, isTa] of cells) {
    const meta = charIndex.get(code);
    const item = {
      code,
      label: meta?.label ?? code,
      gloss: meta?.gloss ?? null,
      amount_usd: amount,
    };
    if (isTa === 1 || amount < 0) {
      offsets.push({ ...item, is_transfer_adjustment: isTa === 1 });
    } else {
      positive.push(item);
    }
  }
  positive.sort((a, b) => b.amount_usd - a.amount_usd);
  offsets.sort((a, b) => a.amount_usd - b.amount_usd);
  return {
    total_usd: deptRow.total_usd,
    transfer_adjustment_usd: deptRow.transfer_adjustment_usd,
    share_of_side: deptRow.share_of_side,
    characters: positive,
    offsets,
  };
}

export function loadSfDeptFiche(slug: string, fy: number): SfDeptFicheData | null {
  const bd = loadSfBudgetBreakdown(fy);
  if (!bd || !bd.drill.available) return null;
  const code = deptCodeFromSlug(slug);
  const deptRow =
    bd.departments.spending.find((d) => d.code === code) ??
    bd.departments.revenue.find((d) => d.code === code);
  if (!deptRow) return null;
  const orgGroup =
    bd.org_groups.spending.find((g) => g.code === deptRow.org_group_code) ??
    bd.org_groups.revenue.find((g) => g.code === deptRow.org_group_code);

  // Latest closed-year budget-vs-actual row for this department (Spending).
  let bva: SfDeptFicheData["bva"] = null;
  try {
    const bvaDepts = loadSfBvaDepartments();
    const years = bvaDepts.coverage.fiscal_years.slice().sort((a, b) => b - a);
    const bvaFy = years.includes(fy) ? fy : years[0];
    const row = bvaDepts.years[String(bvaFy)]?.spending.find((d) => d.code === code);
    if (row) bva = { ...row, fiscal_year: bvaFy };
  } catch {
    /* bva export absent — fiche renders without the execution block */
  }

  return {
    fiscal_year: fy,
    execution_status: bd.execution_status,
    code,
    label: deptRow.label,
    display_name: deptRow.display_name,
    org_group_code: deptRow.org_group_code,
    org_group_label: orgGroup?.label ?? null,
    spending: sideBlock(bd, "spending", code),
    revenue: sideBlock(bd, "revenue", code),
    bva,
    source: bd.source,
    as_of: bd.as_of,
  };
}

export type SfCharacterFicheData = {
  fiscal_year: number;
  execution_status: SfExecutionStatus;
  side: SfSide;
  code: string;
  label: string;
  gloss: string | null;
  display_category: SfCharacterRow["display_category"];
  total_usd: number;
  share_of_side: number;
  n_departments: number;
  /** Positive per-department amounts, sorted desc — safe for bars. */
  departments: { code: string; label: string; display_name: string | null; amount_usd: number }[];
  /** Negative per-department cells (e.g. Overhead) — offsets block only. */
  negatives: { code: string; label: string; display_name: string | null; amount_usd: number }[];
  source: SfSourceBlock;
  as_of: string | null;
};

// ─── budget_dept_detail_{fy}.json (third drill level: dept × character) ───

export type SfDeptCharacterObjectRow = {
  code: string;
  label: string;
  amount_usd: number;
  is_transfer_adjustment: boolean;
};

export type SfDeptCharacterVendorRow = {
  vendor: string;
  amount_usd: number;
  n_vouchers: number;
  is_non_profit: boolean;
  is_related_govt_unit: boolean;
  bucket: string | null;
  is_aggregation_line: boolean;
};

type SfDeptCharacterPaymentsRaw = {
  total_usd: number;
  n_vendors: number;
  vendors: SfDeptCharacterVendorRow[];
  other_vendors_usd: number;
  other_vendors_n: number;
  execution_status: SfExecutionStatus;
};

type SfBudgetDeptDetailFile = {
  generated_at: string;
  source_pipeline: string;
  fiscal_year: number;
  budget_source: { source_url: string; rows_updated_at: string | null } | null;
  vouchers_source: SfSourceBlock | null;
  notes: string;
  cells: Record<
    string,
    { side: "Spending" | "Revenue"; objects: SfDeptCharacterObjectRow[]; payments: SfDeptCharacterPaymentsRaw | null }
  >;
};

export type SfDeptCharacterDetailData = {
  fiscal_year: number;
  execution_status: SfExecutionStatus;
  dept: { code: string; label: string; display_name: string | null };
  character: { code: string; label: string; gloss: string | null };
  side: SfSide;
  /** This dept × character cell's adopted-budget amount (from the breakdown mart). */
  amount_usd: number;
  /** Raw budget line items — same dataset as the rest of the page. */
  objects: SfDeptCharacterObjectRow[];
  /** Vendor payments (vouchers) matched to this cell — null where no voucher activity exists. */
  payments: (SfDeptCharacterPaymentsRaw & { matched_pct: number | null }) | null;
  budget_source: SfSourceBlock;
  vouchers_source: SfSourceBlock | null;
  as_of: string | null;
};

function loadSfBudgetDeptDetail(fy: number): SfBudgetDeptDetailFile | null {
  try {
    return readJson<SfBudgetDeptDetailFile>(`budget_dept_detail_${fy}.json`);
  } catch {
    return null;
  }
}

/**
 * Third drill level: department → character → this. Cross-references the
 * already-loaded breakdown (for the cell's budget amount and labels) with
 * the lazily-read detail file (raw object line items + vendor payments).
 * `matched_pct` is a ratio of two exported values, computed here — same
 * doctrine as the page's execution-rate arithmetic, not a new rollup.
 */
export function loadSfDeptCharacterDetail(
  deptSlug: string,
  charSlug: string,
  fy: number,
  sideHint?: SfSide,
): SfDeptCharacterDetailData | null {
  const bd = loadSfBudgetBreakdown(fy);
  if (!bd || !bd.drill.available) return null;
  const deptCode = deptCodeFromSlug(deptSlug);
  const charCode = characterCodeFromSlug(charSlug);
  const sides: SfSide[] = sideHint ? [sideHint] : ["spending", "revenue"];

  for (const side of sides) {
    const cellRow = bd.dept_characters[side].find((c) => c[0] === deptCode && c[1] === charCode);
    if (!cellRow) continue;
    const deptRow = bd.departments[side].find((d) => d.code === deptCode);
    const charRow = bd.characters[side].find((c) => c.code === charCode);
    if (!deptRow || !charRow) continue;

    const amount = cellRow[2];
    const detail = loadSfBudgetDeptDetail(fy);
    const cell = detail?.cells[`${deptCode}|${charCode}`];
    const payments = cell?.payments
      ? { ...cell.payments, matched_pct: amount > 0 ? cell.payments.total_usd / amount : null }
      : null;

    return {
      fiscal_year: fy,
      execution_status: bd.execution_status,
      dept: { code: deptCode, label: deptRow.label, display_name: deptRow.display_name },
      character: { code: charCode, label: charRow.label, gloss: charRow.gloss },
      side,
      amount_usd: amount,
      objects: cell?.objects ?? [],
      payments,
      budget_source: bd.source,
      vouchers_source: detail?.vouchers_source ?? null,
      as_of: bd.as_of,
    };
  }
  return null;
}

export function loadSfCharacterFiche(
  slug: string,
  fy: number,
  sideHint?: SfSide,
): SfCharacterFicheData | null {
  const bd = loadSfBudgetBreakdown(fy);
  if (!bd || !bd.drill.available) return null;
  const code = characterCodeFromSlug(slug);
  const sides: SfSide[] = sideHint
    ? [sideHint]
    : ["spending", "revenue"];
  for (const side of sides) {
    const row = bd.characters[side].find((c) => c.code === code);
    if (!row) continue;
    const deptIndex = new Map(bd.departments[side].map((d) => [d.code, d]));
    const positives: SfCharacterFicheData["departments"] = [];
    const negatives: SfCharacterFicheData["negatives"] = [];
    for (const [deptCode, charCode, amount] of bd.dept_characters[side]) {
      if (charCode !== code) continue;
      const dept = deptIndex.get(deptCode);
      const item = {
        code: deptCode,
        label: dept?.label ?? deptCode,
        display_name: dept?.display_name ?? null,
        amount_usd: amount,
      };
      (amount < 0 ? negatives : positives).push(item);
    }
    positives.sort((a, b) => b.amount_usd - a.amount_usd);
    negatives.sort((a, b) => a.amount_usd - b.amount_usd);
    return {
      fiscal_year: fy,
      execution_status: bd.execution_status,
      side,
      code,
      label: row.label,
      gloss: row.gloss,
      display_category: row.display_category,
      total_usd: row.total_usd,
      share_of_side: row.share_of_side,
      n_departments: row.n_departments,
      departments: positives,
      negatives,
      source: bd.source,
      as_of: bd.as_of,
    };
  }
  return null;
}
