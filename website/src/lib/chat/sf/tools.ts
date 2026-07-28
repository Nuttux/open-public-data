import { createScopedReader } from "../scopedRead";
import { CHAT_SCOPES } from "../scopes";
import { GENERATED_SF_INVENTORY as INV } from "./dataContext.generated";

// Toolset for the "sf" scope. The reader is bound to us/sf/ at construction,
// so nothing here can reach another city's exports, and no tool takes a `city`
// argument the model could redirect.
const loadJson = createScopedReader(CHAT_SCOPES.sf);

const isValidYear = (y: unknown): y is number => Number.isInteger(y);
const round0 = (v: number | undefined | null) => (typeof v === "number" ? Math.round(v) : v);

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const queryTokens = (q: string) => fold(q).split(/\s+/).filter((t) => t.length >= 2);
const matchesAll = (hay: string, toks: string[]) => toks.every((t) => hay.includes(t));

// ---------- shared export envelope ----------

/**
 * Every us/sf export carries the same provenance envelope. Lifting it verbatim
 * into each tool result is what lets the model cite a dataset id and a
 * source_url for any figure it quotes, instead of inventing an attribution.
 */
type Envelope = {
  unit?: string;
  as_of?: string;
  perimeter?: string;
  notes?: string;
  source?: { name?: string; dataset_id?: string; source_url?: string; attribution?: string };
  sources?: Record<string, { source_url?: string; rows_updated_at?: string }>;
};

/** Socrata dataset ids are the last segment of a /d/<id> portal URL. */
const idFromUrl = (url?: string) => url?.match(/\/d\/([a-z0-9]{4}-[a-z0-9]{4})/i)?.[1];

function cite(d: Envelope | null) {
  if (!d) return undefined;
  const url = d.source?.source_url;
  return {
    dataset: d.source?.name,
    // Some exports carry only the URL on secondary sources; the id is in it,
    // and a citation without a dataset id is not one we want to serve.
    dataset_id: d.source?.dataset_id ?? idFromUrl(url),
    source_url: url,
    publisher: d.source?.attribution ?? "City and County of San Francisco open data portal",
    as_of: d.as_of,
  };
}

// ---------- data shapes ----------

type BudgetSidePoint = {
  fiscal_year: number;
  total_usd?: number;
  transfer_adjustment_usd?: number;
  n_lines?: number;
  per_resident_usd?: number | null;
  population_year?: number | null;
  is_fiscal_year_complete?: boolean;
  execution_status?: string;
};
type BudgetByYearFile = Envelope & {
  population?: { value?: number; year?: number; source?: string; source_url?: string };
  sides?: Record<string, { points?: BudgetSidePoint[] }>;
};

type DimRow = {
  code?: string;
  label?: string;
  display_name?: string;
  gloss?: string;
  org_group_code?: string;
  fund_type?: string;
  fund_category?: string;
  total_usd?: number;
  share_of_side?: number;
  n_departments?: number;
  n_characters?: number;
  n_funds?: number;
};
type BreakdownFile = Envelope & {
  fiscal_year: number;
  execution_status?: string;
  totals?: Record<string, { total_usd?: number; per_resident_usd?: number | null; n_lines?: number }>;
  org_groups?: Record<string, DimRow[]>;
  departments?: Record<string, DimRow[]>;
  characters?: Record<string, DimRow[]>;
  funds?: Record<string, DimRow[]>;
  dept_characters?: { columns?: string[]; spending?: unknown[][]; revenue?: unknown[][] };
};

type DeptDetailFile = Envelope & {
  fiscal_year: number;
  budget_source?: Envelope["source"];
  vouchers_source?: Envelope["source"];
  cells?: Record<
    string,
    {
      side?: string;
      objects?: { code?: string; label?: string; amount_usd?: number }[];
      payments?: { vendor?: string; paid_usd?: number; n_vouchers?: number }[] | null;
    }
  >;
};

type VsActualPoint = {
  fiscal_year: number;
  budget_net_usd?: number | null;
  actual_all_usd?: number | null;
  actual_excl_related_govt_units_usd?: number | null;
  operating_comparison?: Record<string, number | null> | null;
  is_fiscal_year_complete?: boolean;
};
type VsActualFile = Envelope & {
  comparable_perimeter?: string;
  sides?: Record<string, { points?: VsActualPoint[] }>;
};

type ContractsOverviewFile = Envelope & {
  hero?: Record<string, Record<string, number>>;
  landscape?: { by_type?: { contract_type?: string; n_contracts?: number; agreed_usd?: number; paid_usd?: number }[] };
  departments?: { department?: string; department_code?: string; n_contracts?: number; agreed_usd?: number; paid_usd?: number }[];
  non_profit?: Record<string, unknown>;
  sole_source?: Record<string, unknown>;
  data_quality?: Record<string, unknown>;
};

type ContractRow = {
  contract_no?: string;
  title?: string;
  title_plain?: string;
  prime?: string;
  department?: string;
  contract_type?: string;
  sole_source?: boolean;
  non_profit?: boolean;
  agreed_usd?: number;
  paid_usd?: number;
  start?: string;
  end?: string;
};
type ContractsActiveFile = Envelope & { n_rows?: number; rows?: ContractRow[] };

type PayeeRow = {
  rank?: number;
  vendor?: string;
  vouchers_paid_usd?: number;
  share_of_fy_paid?: number;
  n_vouchers?: number;
  is_non_profit?: boolean;
  top_department?: string;
  n_departments?: number;
  bucket?: string;
};
type TopPayeesFile = Envelope & {
  metric?: string;
  ranking_caveat?: string;
  years?: Record<
    string,
    {
      totals?: Record<string, number>;
      n_vendors?: number;
      execution_status?: string;
      payees?: PayeeRow[];
    }
  >;
};

type PayeeSearchRow = {
  name?: string;
  totalAmount?: number;
  byYear?: Record<string, number>;
  lastActiveYear?: number;
  nFys?: number;
  np?: boolean;
  bucket?: string;
  topDepartment?: string;
  nDepartments?: number;
  isAggregationLine?: boolean;
};
type PayeesSearchFile = Envelope & { person_note?: string; years?: number[]; count?: number; data?: PayeeSearchRow[] };

type PayrollPoint = {
  fiscal_year: number;
  total_compensation_usd?: number;
  total_salary_usd?: number;
  overtime_usd?: number;
  total_benefits_usd?: number;
  ot_share_of_comp?: number;
  n_employees?: number;
  avg_total_comp_usd?: number;
  median_total_comp_usd?: number;
  per_resident_usd?: number;
  employees_per_1k_residents?: number;
};
type PayrollByYearFile = Envelope & {
  fiscal_year_note?: string;
  median_note?: string;
  privacy?: Record<string, unknown>;
  points?: PayrollPoint[];
};

type PayrollDeptFile = Envelope & {
  privacy?: Record<string, unknown>;
  departments?: {
    department_code?: string;
    department?: string;
    organization_group?: string;
    series?: (PayrollPoint & { salaries_usd?: number })[];
  }[];
};

type PayrollDistFile = Envelope & {
  percentile_note?: string;
  high_earners?: Record<string, unknown>;
  points?: {
    fiscal_year: number;
    n_employees?: number;
    p25_usd?: number;
    p50_usd?: number;
    p75_usd?: number;
    p90_usd?: number;
    p99_usd?: number;
    n_above_200k?: number;
    n_above_300k?: number;
  }[];
};

type PayrollOvertimeFile = Envelope & {
  framing_note?: string;
  counter_note?: string;
  ot_salary_floor_usd?: number;
  citywide?: {
    fiscal_year: number;
    overtime_usd?: number;
    total_compensation_usd?: number;
    ot_share_of_comp?: number;
    n_ot_exceeds_salary_floored?: number;
  }[];
  departments?: { department?: string; organization_group?: string; series?: Record<string, unknown>[] }[];
  top_titles?: {
    fiscal_year: number;
    job_title?: string;
    display_family?: string;
    n_employees?: number;
    n_ot_earners?: number;
    overtime_usd?: number;
    avg_ot_per_ot_earner_usd?: number;
  }[];
};

type PayrollFamilyFile = Envelope & {
  privacy?: Record<string, unknown>;
  years?: Record<
    string,
    Record<
      string,
      {
        family_label?: string;
        display_family?: string;
        is_pooled?: boolean;
        n_employees?: number;
        salaries_usd?: number;
        overtime_usd?: number;
        total_compensation_usd?: number;
      }[]
    >
  >;
};

// ---------- helpers ----------

/** Resolves a fuzzy department name to the codes used across SF exports. */
function matchDepartment<T extends { code?: string; label?: string; display_name?: string; department?: string; department_code?: string }>(
  rows: T[],
  query: string,
): T | undefined {
  const toks = queryTokens(query);
  if (!toks.length) return undefined;
  const hay = (r: T) => fold([r.code, r.department_code, r.label, r.display_name, r.department].filter(Boolean).join(" "));
  return rows.find((r) => matchesAll(hay(r), toks)) ?? rows.find((r) => hay(r).includes(fold(query)));
}

type Side = "spending" | "revenue";
const asSide = (s: unknown): Side => (s === "revenue" ? "revenue" : "spending");

// ---------- tool implementations ----------

export function list_datasets() {
  return {
    scope: "San Francisco (City and County), all funds unless a tool says otherwise",
    fiscal_year_note:
      "SF fiscal year N runs July 1 (N-1) to June 30 (N). Every figure below is fiscal-year accounting.",
    budget: { fiscal_years: INV.budget.years, note: "adopted budget (Annual Appropriation Ordinance)" },
    budget_breakdown: { fiscal_years: INV.breakdown.years, dimensions: ["departments", "characters", "org_groups", "funds"] },
    budget_department_detail: { fiscal_years: INV.deptDetail.years, note: "budget line objects + vendor payments per department × character" },
    budget_vs_actual: { fiscal_years: INV.vsActual.years },
    contracts: { note: "supplier contract register + contracts active today" },
    vendor_payments: { fiscal_years: INV.payees.years },
    payroll: { fiscal_years: INV.payroll.years },
  };
}

export function get_budget_by_year({ side }: { side?: string } = {}) {
  const d = loadJson<BudgetByYearFile>("budget_by_year.json");
  if (!d) return { error: "budget_by_year export missing" };
  const s = asSide(side);
  const points = d.sides?.[s]?.points ?? [];
  return {
    side: s,
    source: cite(d),
    perimeter: d.perimeter,
    population: d.population,
    note: d.notes,
    points: points.map((p) => ({
      fiscal_year: p.fiscal_year,
      total_usd: round0(p.total_usd),
      per_resident_usd: round0(p.per_resident_usd),
      execution_status: p.execution_status,
      is_fiscal_year_complete: p.is_fiscal_year_complete,
    })),
  };
}

export function get_budget_breakdown({
  fiscal_year,
  dimension = "departments",
  side,
  limit = 12,
}: {
  fiscal_year: number;
  dimension?: string;
  side?: string;
  limit?: number;
}) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.breakdown.years };
  const d = loadJson<BreakdownFile>(`budget_breakdown_${fiscal_year}.json`);
  if (!d) return { error: `no budget breakdown for FY${fiscal_year}`, fiscal_years: INV.breakdown.years };
  const s = asSide(side);
  const dim = ["departments", "characters", "org_groups", "funds"].includes(dimension) ? dimension : "departments";
  const rows = ((d as unknown as Record<string, Record<string, DimRow[]>>)[dim]?.[s] ?? []).slice();
  rows.sort((a, b) => (b.total_usd ?? 0) - (a.total_usd ?? 0));
  return {
    fiscal_year: d.fiscal_year,
    side: s,
    dimension: dim,
    execution_status: d.execution_status,
    source: cite(d),
    perimeter: d.perimeter,
    total_usd: round0(d.totals?.[s]?.total_usd),
    per_resident_usd: round0(d.totals?.[s]?.per_resident_usd),
    rows: rows.slice(0, Math.min(limit, 30)).map((r) => ({
      label: r.display_name ?? r.label ?? r.fund_type,
      code: r.code,
      gloss: r.gloss,
      fund_category: r.fund_category,
      total_usd: round0(r.total_usd),
      share_of_side: r.share_of_side,
    })),
  };
}

export function get_department_budget({
  fiscal_year,
  department,
  side,
}: {
  fiscal_year: number;
  department: string;
  side?: string;
}) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.breakdown.years };
  const d = loadJson<BreakdownFile>(`budget_breakdown_${fiscal_year}.json`);
  if (!d) return { error: `no budget breakdown for FY${fiscal_year}`, fiscal_years: INV.breakdown.years };
  const s = asSide(side);
  const depts = d.departments?.[s] ?? [];
  const hit = matchDepartment(depts, department);
  if (!hit)
    return {
      error: `no department matching "${department}" in FY${fiscal_year}`,
      departments_available: depts.map((r) => r.display_name ?? r.label).slice(0, 60),
    };
  const cols = d.dept_characters?.columns ?? [];
  const iDept = cols.indexOf("department_code");
  const iChar = cols.indexOf("character_code");
  const iAmt = cols.indexOf("amount_usd");
  const chars = d.characters?.[s] ?? [];
  const charLabel = new Map(chars.map((c) => [c.code, c.label]));
  const charGloss = new Map(chars.map((c) => [c.code, c.gloss]));
  const cells = ((d.dept_characters as unknown as Record<string, unknown[][]>)?.[s] ?? [])
    .filter((row) => row[iDept] === hit.code)
    .map((row) => ({
      character: charLabel.get(row[iChar] as string) ?? (row[iChar] as string),
      gloss: charGloss.get(row[iChar] as string),
      amount_usd: round0(row[iAmt] as number),
    }))
    .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0));
  return {
    fiscal_year: d.fiscal_year,
    side: s,
    department: hit.display_name ?? hit.label,
    department_code: hit.code,
    source: cite(d),
    perimeter: d.perimeter,
    total_usd: round0(hit.total_usd),
    share_of_city_side: hit.share_of_side,
    by_character: cells,
  };
}

export function get_department_line_items({
  fiscal_year,
  department_code,
  character_code,
}: {
  fiscal_year: number;
  department_code: string;
  character_code: string;
}) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.deptDetail.years };
  const d = loadJson<DeptDetailFile>(`budget_dept_detail_${fiscal_year}.json`);
  if (!d) return { error: `no department detail for FY${fiscal_year}`, fiscal_years: INV.deptDetail.years };
  const key = `${String(department_code).toUpperCase()}|${String(character_code).toUpperCase()}`;
  const cell = d.cells?.[key];
  if (!cell) return { error: `no cell ${key} in FY${fiscal_year}`, note: "use get_department_budget first to get the exact department and character codes" };
  return {
    fiscal_year: d.fiscal_year,
    cell: key,
    side: cell.side,
    budget_source: cite({ source: d.budget_source } as Envelope),
    payments_source: cite({ source: d.vouchers_source } as Envelope),
    note: d.notes,
    // Two source-distinct blocks — the export never blends them and neither should the answer.
    budget_objects: (cell.objects ?? []).slice(0, 15).map((o) => ({ label: o.label, code: o.code, amount_usd: round0(o.amount_usd) })),
    vendor_payments: (cell.payments ?? [])?.slice(0, 15).map((p) => ({ vendor: p.vendor, paid_usd: round0(p.paid_usd), n_vouchers: p.n_vouchers })) ?? null,
  };
}

export function get_budget_vs_actual({ fiscal_year, side }: { fiscal_year?: number; side?: string } = {}) {
  const d = loadJson<VsActualFile>("budget_vs_actual.json");
  if (!d) return { error: "budget_vs_actual export missing" };
  const s = asSide(side);
  const points = (d.sides?.[s]?.points ?? []).filter((p) => p.budget_net_usd != null || p.actual_all_usd != null);
  const shape = (p: VsActualPoint) => ({
    fiscal_year: p.fiscal_year,
    adopted_budget_usd: round0(p.budget_net_usd),
    actual_all_funds_usd: round0(p.actual_all_usd),
    actual_excl_related_govt_units_usd: round0(p.actual_excl_related_govt_units_usd),
    is_fiscal_year_complete: p.is_fiscal_year_complete,
  });
  if (fiscal_year == null) {
    return { side: s, source: cite(d), comparable_perimeter: d.comparable_perimeter, note: d.notes, points: points.map(shape) };
  }
  const m = points.find((p) => p.fiscal_year === fiscal_year);
  if (!m) return { error: `no comparison for FY${fiscal_year}`, fiscal_years: points.map((p) => p.fiscal_year) };
  return { side: s, source: cite(d), comparable_perimeter: d.comparable_perimeter, note: d.notes, ...shape(m), operating_comparison: m.operating_comparison };
}

export function get_contracts_overview() {
  const d = loadJson<ContractsOverviewFile>("contracts_overview.json");
  if (!d) return { error: "contracts_overview export missing" };
  return {
    source: cite(d),
    perimeter: d.perimeter,
    hero: d.hero,
    by_type: d.landscape?.by_type?.slice(0, 10),
    top_departments: d.departments?.slice(0, 10),
    non_profit: d.non_profit,
    sole_source: d.sole_source,
    data_quality: d.data_quality,
  };
}

export function search_contracts({
  query,
  min_usd = 0,
  limit = 12,
}: {
  query: string;
  min_usd?: number;
  limit?: number;
}) {
  const toks = queryTokens(query);
  if (!toks.length) return { error: "query too short" };
  const d = loadJson<ContractsActiveFile>("contracts_active.json");
  if (!d) return { error: "contracts_active export missing" };
  const hits = (d.rows ?? []).filter(
    (r) =>
      (r.agreed_usd ?? 0) >= min_usd &&
      matchesAll(fold(`${r.title_plain ?? ""} ${r.title ?? ""} ${r.prime ?? ""} ${r.department ?? ""}`), toks),
  );
  hits.sort((a, b) => (b.agreed_usd ?? 0) - (a.agreed_usd ?? 0));
  return {
    query,
    source: cite(d),
    perimeter: d.perimeter,
    scope_note:
      "ACTIVE contracts only (term not yet ended). Expired contracts are in the register but not in this search — say so rather than implying a complete history.",
    n_matches: hits.length,
    sum_agreed_usd: round0(hits.reduce((s, r) => s + (r.agreed_usd ?? 0), 0)),
    amount_note: "agreed_usd is the contract CEILING over its whole term, not annual spending. paid_usd is what has actually been disbursed so far.",
    results: hits.slice(0, Math.min(limit, 20)).map((r) => ({
      contract_no: r.contract_no,
      title: r.title_plain ?? r.title,
      prime: r.prime,
      department: r.department,
      contract_type: r.contract_type,
      sole_source: r.sole_source,
      non_profit: r.non_profit,
      agreed_usd: round0(r.agreed_usd),
      paid_usd: round0(r.paid_usd),
      term: [r.start, r.end].filter(Boolean).join(" → "),
    })),
  };
}

export function get_top_payees({ fiscal_year, limit = 10 }: { fiscal_year: number; limit?: number }) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.payees.years };
  const d = loadJson<TopPayeesFile>("top_payees.json");
  if (!d) return { error: "top_payees export missing" };
  const y = d.years?.[String(fiscal_year)];
  if (!y) return { error: `no vendor payments for FY${fiscal_year}`, fiscal_years: INV.payees.years };
  return {
    fiscal_year,
    source: cite(d),
    metric: d.metric,
    perimeter: d.perimeter,
    ranking_caveat: d.ranking_caveat,
    bucket_note:
      "bucket classifies what the payee IS. fiscal_agent_debt_service / tax remittance payees are banks moving the City's own money (debt service, payroll taxes) — they are NOT suppliers of services and must not be described as 'the City's biggest contractors'.",
    execution_status: y.execution_status,
    totals: y.totals,
    n_vendors: y.n_vendors,
    payees: (y.payees ?? []).slice(0, Math.min(limit, 25)).map((p) => ({
      rank: p.rank,
      vendor: p.vendor,
      paid_usd: round0(p.vouchers_paid_usd),
      share_of_fy_paid: p.share_of_fy_paid,
      bucket: p.bucket,
      is_non_profit: p.is_non_profit,
      top_department: p.top_department,
    })),
  };
}

export function search_payee({ query, limit = 12 }: { query: string; limit?: number }) {
  const toks = queryTokens(query);
  if (!toks.length) return { error: "query too short" };
  const d = loadJson<PayeesSearchFile>("payees_search.json");
  if (!d) return { error: "payees_search export missing" };
  // 'person' bucket rows are individual payees (mostly landlords). They are
  // real public records but the project never features named individuals.
  const hits = (d.data ?? []).filter((r) => r.bucket !== "person" && matchesAll(fold(r.name ?? ""), toks));
  hits.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
  return {
    query,
    source: cite(d),
    perimeter: d.perimeter,
    fiscal_years_covered: d.years,
    n_matches: hits.length,
    note: "totalAmount is the sum across all fiscal years available; byYear breaks it down. Vendor names are unkeyed portal strings — the same institution can appear under several spellings, so check variants before concluding.",
    results: hits.slice(0, Math.min(limit, 20)).map((r) => ({
      vendor: r.name,
      total_paid_all_years_usd: round0(r.totalAmount),
      byYear: Object.fromEntries(Object.entries(r.byYear ?? {}).map(([y, v]) => [y, round0(v)])),
      bucket: r.bucket,
      is_non_profit: r.np,
      top_department: r.topDepartment,
      n_departments: r.nDepartments,
      last_active_fiscal_year: r.lastActiveYear,
    })),
  };
}

export function get_payroll_by_year({ fiscal_year }: { fiscal_year?: number } = {}) {
  const d = loadJson<PayrollByYearFile>("payroll_by_year.json");
  if (!d) return { error: "payroll_by_year export missing" };
  const points = d.points ?? [];
  const shape = (p: PayrollPoint) => ({
    fiscal_year: p.fiscal_year,
    total_compensation_usd: round0(p.total_compensation_usd),
    total_salary_usd: round0(p.total_salary_usd),
    overtime_usd: round0(p.overtime_usd),
    total_benefits_usd: round0(p.total_benefits_usd),
    n_employees: p.n_employees,
    median_total_comp_usd: round0(p.median_total_comp_usd),
    avg_total_comp_usd: round0(p.avg_total_comp_usd),
    per_resident_usd: round0(p.per_resident_usd),
  });
  const base = {
    source: cite(d),
    perimeter: d.perimeter,
    fiscal_year_note: d.fiscal_year_note,
    median_note: d.median_note,
    headcount_note: "n_employees is a headcount of everyone paid in the year, including part-year and part-time staff — NOT full-time equivalents.",
  };
  if (fiscal_year == null) return { ...base, points: points.map(shape) };
  const m = points.find((p) => p.fiscal_year === fiscal_year);
  if (!m) return { error: `no payroll for FY${fiscal_year}`, fiscal_years: points.map((p) => p.fiscal_year) };
  return { ...base, ...shape(m) };
}

export function get_payroll_by_department({
  fiscal_year,
  department,
  limit = 12,
}: {
  fiscal_year: number;
  department?: string;
  limit?: number;
}) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.payroll.years };
  const d = loadJson<PayrollDeptFile>("payroll_by_dept_year.json");
  if (!d) return { error: "payroll_by_dept_year export missing" };
  const depts = d.departments ?? [];
  const pick = (dep: (typeof depts)[number]) => {
    const y = (dep.series ?? []).find((s) => s.fiscal_year === fiscal_year);
    return (
      y && {
        department: dep.department,
        department_code: dep.department_code,
        organization_group: dep.organization_group,
        total_compensation_usd: round0(y.total_compensation_usd),
        salaries_usd: round0(y.salaries_usd),
        overtime_usd: round0(y.overtime_usd),
        n_employees: y.n_employees,
      }
    );
  };
  const base = { fiscal_year, source: cite(d), privacy: d.privacy };
  if (department) {
    const hit = matchDepartment(depts, department);
    if (!hit)
      return { error: `no department matching "${department}"`, departments_available: depts.map((x) => x.department).slice(0, 60) };
    const row = pick(hit);
    if (!row) return { error: `no FY${fiscal_year} payroll for ${hit.department}` };
    return { ...base, ...row };
  }
  const rows = depts.map(pick).filter(Boolean) as NonNullable<ReturnType<typeof pick>>[];
  rows.sort((a, b) => (b.total_compensation_usd ?? 0) - (a.total_compensation_usd ?? 0));
  return { ...base, departments: rows.slice(0, Math.min(limit, 30)) };
}

export function get_payroll_by_family({ fiscal_year, department }: { fiscal_year: number; department?: string }) {
  if (!isValidYear(fiscal_year)) return { error: `invalid fiscal year: ${fiscal_year}`, fiscal_years: INV.payroll.years };
  const d = loadJson<PayrollFamilyFile>(department ? "payroll_by_family_year.json" : "payroll_by_family_citywide.json");
  if (!d) return { error: "payroll_by_family export missing" };
  const year = d.years?.[String(fiscal_year)];
  if (!year) return { error: `no job-family payroll for FY${fiscal_year}`, fiscal_years: INV.payroll.years };
  const shape = (rows: NonNullable<PayrollFamilyFile["years"]>[string][string]) =>
    rows
      .map((r) => ({
        family: r.display_family ?? r.family_label,
        n_employees: r.n_employees,
        total_compensation_usd: round0(r.total_compensation_usd),
        overtime_usd: round0(r.overtime_usd),
        is_pooled: r.is_pooled,
      }))
      .sort((a, b) => (b.total_compensation_usd ?? 0) - (a.total_compensation_usd ?? 0));
  const base = { fiscal_year, source: cite(d), privacy: d.privacy };
  if (!department) {
    const flat = Object.values(year).flat();
    return { ...base, scope: "citywide", families: shape(flat).slice(0, 20) };
  }
  const codes = Object.keys(year);
  const code = codes.find((c) => fold(c) === fold(department)) ?? matchDepartment(codes.map((c) => ({ code: c })), department)?.code;
  if (!code) return { error: `no department matching "${department}"`, department_codes: codes.slice(0, 60) };
  return { ...base, scope: code, families: shape(year[code]).slice(0, 20) };
}

export function get_payroll_distribution({ fiscal_year }: { fiscal_year?: number } = {}) {
  const d = loadJson<PayrollDistFile>("payroll_distribution.json");
  if (!d) return { error: "payroll_distribution export missing" };
  const points = d.points ?? [];
  const shape = (p: (typeof points)[number]) => ({
    fiscal_year: p.fiscal_year,
    n_employees: p.n_employees,
    p25_usd: round0(p.p25_usd),
    median_usd: round0(p.p50_usd),
    p75_usd: round0(p.p75_usd),
    p90_usd: round0(p.p90_usd),
    p99_usd: round0(p.p99_usd),
    n_above_200k: p.n_above_200k,
    n_above_300k: p.n_above_300k,
  });
  const base = { source: cite(d), perimeter: d.perimeter, percentile_note: d.percentile_note };
  if (fiscal_year == null) return { ...base, points: points.map(shape) };
  const m = points.find((p) => p.fiscal_year === fiscal_year);
  if (!m) return { error: `no distribution for FY${fiscal_year}`, fiscal_years: points.map((p) => p.fiscal_year) };
  return { ...base, ...shape(m) };
}

export function get_payroll_overtime({ fiscal_year }: { fiscal_year?: number } = {}) {
  const d = loadJson<PayrollOvertimeFile>("payroll_overtime.json");
  if (!d) return { error: "payroll_overtime export missing" };
  return {
    source: cite(d),
    framing_note: d.framing_note,
    counter_note: d.counter_note,
    citywide: (d.citywide ?? []).map((c) => ({
      fiscal_year: c.fiscal_year,
      overtime_usd: round0(c.overtime_usd),
      ot_share_of_comp: c.ot_share_of_comp,
      n_employees_ot_above_salary: c.n_ot_exceeds_salary_floored,
    })),
    top_titles: (d.top_titles ?? [])
      .filter((t) => fiscal_year == null || t.fiscal_year === fiscal_year)
      .slice(0, 10)
      .map((t) => ({
        fiscal_year: t.fiscal_year,
        job_title: t.job_title,
        family: t.display_family,
        // Deux comptes distincts : sans n_ot_earners, le modèle décrivait
        // l'effectif du titre comme « les agents payés en heures sup ».
        n_employees_in_title: t.n_employees,
        n_who_earned_overtime: t.n_ot_earners,
        overtime_usd: round0(t.overtime_usd),
        avg_ot_per_ot_earner_usd: round0(t.avg_ot_per_ot_earner_usd),
      })),
  };
}

type OversightDoc = {
  identifier?: string;
  title?: string;
  creator?: string | null;
  year?: number | null;
  pool?: string;
  source_label?: string;
  url?: string;
  is_city_oversight_body?: boolean;
  subjects?: string[];
};
type OversightFile = Envelope & { usage_constraint?: string; n_documents?: number; documents?: OversightDoc[] };

/**
 * Points at documents the City's own oversight bodies produced. This is the
 * ONE tool that returns something other than measured data, and it returns no
 * document text at all — the export carries none, by design, because OCR on
 * these scans mangles numeric tables. There is therefore no figure here for
 * the model to misread: it can name a document and link to it, nothing else.
 */
export function find_oversight_documents({ topic, limit = 5 }: { topic: string; limit?: number }) {
  const d = loadJson<OversightFile>("oversight_documents.json");
  if (!d) return { error: "oversight_documents export missing" };
  const toks = queryTokens(topic);
  if (!toks.length) return { error: "topic too short" };
  const hits = (d.documents ?? []).filter((r) =>
    matchesAll(fold(`${r.title ?? ""} ${r.creator ?? ""} ${(r.subjects ?? []).join(" ")}`), toks),
  );
  // Recent first, but undated documents last rather than treated as year 0.
  hits.sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
  // The archive holds several scans of the same publication under different
  // identifiers. Listing one report three times reads as noise, so collapse
  // by title and keep the first — the count is reported, nothing is hidden.
  const seen = new Map<string, OversightDoc & { copies: number }>();
  for (const r of hits) {
    const key = fold((r.title ?? "").replace(/[^\p{L}\p{N}]+/gu, " ")).trim();
    const prior = seen.get(key);
    if (prior) prior.copies += 1;
    else seen.set(key, { ...r, copies: 1 });
  }
  const unique = [...seen.values()];
  return {
    topic,
    perimeter: d.perimeter,
    usage_constraint: d.usage_constraint,
    n_matches: unique.length,
    documents: unique.slice(0, Math.min(limit, 10)).map((r) => ({
      title: r.title,
      author: r.creator,
      year: r.year,
      // Doctrine: the label comes from the pipeline, never composed here.
      source: r.source_label,
      link: r.url,
      // Explicit, so a consultant's report is never credited to the City.
      author_is_city_oversight_body: r.is_city_oversight_body ?? false,
      ...(r.copies > 1 ? { note: `${r.copies} scanned copies of this report are held` } : {}),
    })),
  };
}

// ---------- registry & schemas ----------

export const SF_TOOL_SCHEMAS = [
  {
    name: "list_datasets",
    description: "Inventory of the San Francisco datasets available with their fiscal years. Call it if unsure about coverage before answering 'no data'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_budget_by_year",
    description: "Adopted budget totals per fiscal year (FY2010+), with per-resident figures. Optional side ('spending' default, or 'revenue'). Call it for 'how big is the budget', 'is the budget growing'.",
    input_schema: { type: "object", properties: { side: { type: "string", enum: ["spending", "revenue"] } }, required: [] },
  },
  {
    name: "get_budget_breakdown",
    description: "One fiscal year's adopted budget split by dimension: departments, characters (Salaries, Benefits, Capital Outlay…), org_groups, or funds. Call it for 'where does the money go', 'biggest departments', 'how much on salaries'.",
    input_schema: {
      type: "object",
      properties: {
        fiscal_year: { type: "integer" },
        dimension: { type: "string", enum: ["departments", "characters", "org_groups", "funds"], default: "departments" },
        side: { type: "string", enum: ["spending", "revenue"] },
        limit: { type: "integer", default: 12 },
      },
      required: ["fiscal_year"],
    },
  },
  {
    name: "get_department_budget",
    description: "One department's adopted budget for a fiscal year, broken down by character (what the money is spent ON). Accepts a fuzzy department name ('police', 'public health', 'MTA'). Call it for 'how much does the police department get'.",
    input_schema: {
      type: "object",
      properties: { fiscal_year: { type: "integer" }, department: { type: "string" }, side: { type: "string", enum: ["spending", "revenue"] } },
      required: ["fiscal_year", "department"],
    },
  },
  {
    name: "get_department_line_items",
    description: "Deepest drill: budget line objects AND the vendor payments that funded one department × character cell. Needs the exact codes from get_department_budget (e.g. department_code 'POL', character_code 'SALARIES').",
    input_schema: {
      type: "object",
      properties: { fiscal_year: { type: "integer" }, department_code: { type: "string" }, character_code: { type: "string" } },
      required: ["fiscal_year", "department_code", "character_code"],
    },
  },
  {
    name: "get_budget_vs_actual",
    description: "Adopted budget compared with actual spending/revenue per fiscal year. Without fiscal_year: the full series. Call it for 'does SF spend what it budgets', 'was the budget overspent'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" }, side: { type: "string", enum: ["spending", "revenue"] } }, required: [] },
  },
  {
    name: "get_contracts_overview",
    description: "The supplier contract register at a glance: totals agreed vs paid, contracts active today, breakdown by contract type and department, non-profit / sole-source / local-business shares. Call it for 'how much is under contract', 'who does the City contract with'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_contracts",
    description: "Search contracts ACTIVE TODAY by keyword in title, prime contractor or department. Call it for a supplier name, a subject ('homeless', 'street', 'software'), a service type.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, min_usd: { type: "number", default: 0 }, limit: { type: "integer", default: 12 } },
      required: ["query"],
    },
  },
  {
    name: "get_top_payees",
    description: "Largest vendors actually PAID in a fiscal year (voucher payments), with a bucket saying what each payee is. Call it for 'who gets paid the most', 'biggest vendors'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" }, limit: { type: "integer", default: 10 } }, required: ["fiscal_year"] },
  },
  {
    name: "search_payee",
    description: "Search a vendor by name across all fiscal years of payments, returning the all-years total and the per-year breakdown. Call it whenever an organisation name is mentioned.",
    input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", default: 12 } }, required: ["query"] },
  },
  {
    name: "get_payroll_by_year",
    description: "Citywide payroll per fiscal year: total compensation, salaries, overtime, benefits, headcount, median and average pay, per-resident cost. Call it for 'how much does the City spend on staff', 'how many employees'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_payroll_by_department",
    description: "Payroll for one fiscal year by department (or one named department). Call it for 'which department has the biggest payroll', 'what does the fire department cost in staff'.",
    input_schema: {
      type: "object",
      properties: { fiscal_year: { type: "integer" }, department: { type: "string" }, limit: { type: "integer", default: 12 } },
      required: ["fiscal_year"],
    },
  },
  {
    name: "get_payroll_by_family",
    description: "Payroll by job family (Police, Nursing, Transit Operators, Engineering…), citywide or within one department code. Call it for 'what do nurses cost', 'which kinds of jobs'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" }, department: { type: "string" } }, required: ["fiscal_year"] },
  },
  {
    name: "get_payroll_distribution",
    description: "Pay distribution across employees: percentiles (p25/median/p75/p90/p99) and counts above $200k/$300k, per fiscal year. Call it for 'what does a typical City employee earn', 'how many earn over 200k'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" } }, required: [] },
  },
  {
    name: "get_payroll_overtime",
    description: "Overtime: citywide series (dollars, share of compensation) and the job titles with the most overtime. Call it for 'how much overtime', 'which jobs get the most overtime'.",
    input_schema: { type: "object", properties: { fiscal_year: { type: "integer" } }, required: [] },
  },
  {
    name: "find_oversight_documents",
    description:
      "Find documents the City's OWN oversight bodies published on a topic (Controller's City Services Auditor, Board of Supervisors' Budget Analyst, Civil Grand Jury, named investigations), held at the Internet Archive. Returns titles, authors, years and links — NO document text. Call it when the data cannot answer WHY something happened, to point the user at the public record. Try the plain subject ('overtime', 'transit', 'homelessness', 'contracting').",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" }, limit: { type: "integer", default: 5 } },
      required: ["topic"],
    },
  },
] as const;

type ToolArgs = Record<string, unknown>;

export const SF_DISPATCH: Record<string, (args: ToolArgs) => unknown> = {
  list_datasets,
  get_budget_by_year: (a) => get_budget_by_year(a as { side?: string }),
  get_budget_breakdown: (a) => get_budget_breakdown(a as { fiscal_year: number; dimension?: string; side?: string; limit?: number }),
  get_department_budget: (a) => get_department_budget(a as { fiscal_year: number; department: string; side?: string }),
  get_department_line_items: (a) => get_department_line_items(a as { fiscal_year: number; department_code: string; character_code: string }),
  get_budget_vs_actual: (a) => get_budget_vs_actual(a as { fiscal_year?: number; side?: string }),
  get_contracts_overview,
  search_contracts: (a) => search_contracts(a as { query: string; min_usd?: number; limit?: number }),
  get_top_payees: (a) => get_top_payees(a as { fiscal_year: number; limit?: number }),
  search_payee: (a) => search_payee(a as { query: string; limit?: number }),
  get_payroll_by_year: (a) => get_payroll_by_year(a as { fiscal_year?: number }),
  get_payroll_by_department: (a) => get_payroll_by_department(a as { fiscal_year: number; department?: string; limit?: number }),
  get_payroll_by_family: (a) => get_payroll_by_family(a as { fiscal_year: number; department?: string }),
  get_payroll_distribution: (a) => get_payroll_distribution(a as { fiscal_year?: number }),
  get_payroll_overtime: (a) => get_payroll_overtime(a as { fiscal_year?: number }),
  find_oversight_documents: (a) => find_oversight_documents(a as { topic: string; limit?: number }),
};
