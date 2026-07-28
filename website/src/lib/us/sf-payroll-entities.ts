import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { areaSlug, familySlug, payrollDeptSlug, roleSlug } from "@/lib/us/sf-payroll-slugs";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfBudgetBreakdown,
} from "@/lib/us/sf-budget-data";
import type {
  PayrollByDept,
  PayrollByYear,
  PayrollDept,
  PayrollDeptSeriesPoint,
  PayrollSource,
} from "@/app/us/city/sf/payroll/payroll-types";

/**
 * The two payroll facets the page needed and did not have: a DEPARTMENT and a
 * SERVICE AREA you can open inside payroll.
 *
 * Before this, clicking a department on the payroll page opened its BUDGET
 * fiche — a different register answering a different question, exactly the
 * cross-register jump SfDeptContractsFiche was built to stop on the contracts
 * side. A department row inside payroll now answers the payroll question (what
 * it pays, to how many people, how much of it is overtime, which kinds of work)
 * and offers the budget as one labelled link out.
 *
 * Both loaders are SERVER-ONLY: the dept × job-family grain
 * (payroll_by_family_year.json, ~3MB) is read here and reduced to one entity's
 * slice, so the client never receives the file. Its rows are already
 * privacy-pooled in the mart (no dollar aggregate under 5 employees).
 */

/** years[fy][dept_code] → rows at department × source-family grain. */
type FamilyGrainFile = {
  years: Record<string, Record<string, FamilyGrainRow[]>>;
  privacy: { rule: string };
  source: PayrollSource;
};

type FamilyGrainRow = {
  family_code: string;
  family_label: string;
  display_family: string;
  is_pooled: boolean;
  n_employees: number;
  overtime_usd: number;
  total_compensation_usd: number;
};

/** A kind of work inside a department or a service area. */
export type PayrollFamilySlice = {
  display_family: string;
  n_employees: number;
  overtime_usd: number;
  total_compensation_usd: number;
  /** Null for the pooled "Other roles" bucket, which has no fiche. */
  href: string | null;
};

export type SfPayrollDeptData = {
  kind: "dept";
  code: string;
  slug: string;
  name: string;
  organizationGroup: string;
  /** The service area this department belongs to. */
  areaHref: string;
  fiscalYear: number;
  latest: PayrollDeptSeriesPoint;
  first: PayrollDeptSeriesPoint;
  series: PayrollDeptSeriesPoint[];
  /** This department's share of all city compensation in the latest year. */
  shareOfCityPayroll: number | null;
  /** Citywide median, to place this department's own median against it. */
  cityMedianUsd: number | null;
  families: PayrollFamilySlice[];
  /** The budget fiche for the same code — null when the budget has no such code. */
  budgetHref: string | null;
  keyingNote: string;
  privacyRule: string;
  source: PayrollSource;
};

export type SfPayrollAreaData = {
  kind: "area";
  code: string;
  slug: string;
  name: string;
  fiscalYear: number;
  latest: { total_compensation_usd: number; overtime_usd: number; n_employees_listed: number; n_departments: number };
  first: { fiscal_year: number; total_compensation_usd: number; n_employees_listed: number };
  series: Array<{ fiscal_year: number; total_compensation_usd: number; n_employees_listed: number }>;
  shareOfCityPayroll: number | null;
  /** Departments in this area, biggest payroll first. */
  departments: Array<{
    code: string;
    name: string;
    href: string;
    n_employees: number;
    median_total_comp_usd: number;
    ot_share_of_comp: number;
    total_compensation_usd: number;
  }>;
  families: PayrollFamilySlice[];
  foldNote: string;
  privacyRule: string;
  source: PayrollSource;
};

function readByDept(): PayrollByDept {
  return readDataJson<PayrollByDept>("us/sf/payroll_by_dept_year.json");
}

/** Latest fiscal year present in the department file. */
function latestFy(byDept: PayrollByDept): number {
  let fy = 0;
  for (const d of byDept.departments) {
    for (const p of d.series) if (p.fiscal_year > fy) fy = p.fiscal_year;
  }
  return fy;
}

function cityTotals(fy: number): { total: number | null; median: number | null } {
  const byYear = readDataJsonOrNull<PayrollByYear>("us/sf/payroll_by_year.json");
  const p = byYear?.points.find((x) => x.fiscal_year === fy);
  return {
    total: p?.total_compensation_usd ?? null,
    median: p?.median_total_comp_usd ?? null,
  };
}

/**
 * Roll the dept × source-family rows of one or more departments up to display
 * families. The pooled "Other roles" rows of each department are summed into a
 * single un-clickable bucket, so a fiche never shows five separate "Other
 * roles" lines from five departments.
 */
function familiesFor(
  grain: FamilyGrainFile | null,
  fy: number,
  deptCodes: string[],
): PayrollFamilySlice[] {
  const totals = new Map<string, { n: number; ot: number; usd: number; pooled: boolean }>();
  const yearRows = grain?.years[String(fy)] ?? {};
  for (const code of deptCodes) {
    for (const r of yearRows[code] ?? []) {
      const key = r.is_pooled ? "Other roles" : r.display_family;
      const cur = totals.get(key) ?? { n: 0, ot: 0, usd: 0, pooled: r.is_pooled };
      totals.set(key, {
        n: cur.n + r.n_employees,
        ot: cur.ot + r.overtime_usd,
        usd: cur.usd + r.total_compensation_usd,
        pooled: cur.pooled || r.is_pooled,
      });
    }
  }
  return [...totals.entries()]
    .map(([display_family, v]) => ({
      display_family,
      n_employees: v.n,
      overtime_usd: v.ot,
      total_compensation_usd: v.usd,
      href: v.pooled ? null : `/us/city/sf/payroll/family/${familySlug(display_family)}`,
    }))
    .sort((a, b) => b.total_compensation_usd - a.total_compensation_usd);
}

/** Budget fiche href for a department code, or null when the budget has no
 *  such code — /budget/dept/[slug] 404s otherwise, and a payroll department is
 *  not guaranteed to be a budget department (different perimeters/vintages). */
function budgetHrefFor(code: string): string | null {
  const budgetFy = defaultFiscalYear(loadSfBudgetByYear());
  const codes = new Set(
    (loadSfBudgetBreakdown(budgetFy)?.departments.spending ?? []).map((d) => d.code),
  );
  return codes.has(code) ? `/us/city/sf/budget/dept/${deptSlug(code)}?year=${budgetFy}` : null;
}

// ───────────────────────────────────────────────────────────── departments ──

/** Every department slug carrying a row in the latest FY (generateStaticParams
 *  + link validation — the page only links slugs this returns). */
export function sfPayrollDeptSlugs(): string[] {
  const byDept = readByDept();
  const fy = latestFy(byDept);
  return byDept.departments
    .filter((d) => d.series.some((p) => p.fiscal_year === fy))
    .map((d) => payrollDeptSlug(d.department_code));
}

export function loadSfPayrollDept(slug: string): SfPayrollDeptData | null {
  const byDept = readByDept();
  const fy = latestFy(byDept);
  const dept: PayrollDept | undefined = byDept.departments.find(
    (d) => payrollDeptSlug(d.department_code) === slug,
  );
  if (!dept) return null;
  const series = [...dept.series].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const latest = series.find((p) => p.fiscal_year === fy);
  if (!latest || series.length === 0) return null;

  const city = cityTotals(fy);
  const grain = readDataJsonOrNull<FamilyGrainFile>("us/sf/payroll_by_family_year.json");

  return {
    kind: "dept",
    code: dept.department_code,
    slug,
    name: dept.department,
    organizationGroup: dept.organization_group,
    areaHref: `/us/city/sf/payroll/area/${areaSlug(dept.organization_group)}`,
    fiscalYear: fy,
    latest,
    first: series[0],
    series,
    shareOfCityPayroll:
      city.total && city.total > 0 ? latest.total_compensation_usd / city.total : null,
    cityMedianUsd: city.median,
    families: familiesFor(grain, fy, [dept.department_code]),
    budgetHref: budgetHrefFor(dept.department_code),
    keyingNote: byDept.keying_note,
    privacyRule: grain?.privacy.rule ?? byDept.privacy.rule,
    source: byDept.source,
  };
}

// ──────────────────────────────────────────────────────────── service areas ──

export function sfPayrollAreaSlugs(): string[] {
  const byDept = readByDept();
  return byDept.organization_groups.map((g) => areaSlug(g.organization_group));
}

export function loadSfPayrollArea(slug: string): SfPayrollAreaData | null {
  const byDept = readByDept();
  const group = byDept.organization_groups.find(
    (g) => areaSlug(g.organization_group) === slug || g.organization_group_code === slug,
  );
  if (!group) return null;
  const fy = latestFy(byDept);
  const latest = group.years[String(fy)];
  if (!latest) return null;

  const series = Object.entries(group.years)
    .map(([y, v]) => ({
      fiscal_year: Number(y),
      total_compensation_usd: v.total_compensation_usd,
      n_employees_listed: v.n_employees_listed,
    }))
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  const depts = byDept.departments
    .filter((d) => d.organization_group_code === group.organization_group_code)
    .map((d) => {
      const p = d.series.find((s) => s.fiscal_year === fy);
      return p ? { d, p } : null;
    })
    .filter((x): x is { d: PayrollDept; p: PayrollDeptSeriesPoint } => x !== null)
    .sort((a, b) => b.p.total_compensation_usd - a.p.total_compensation_usd);

  const city = cityTotals(fy);
  const grain = readDataJsonOrNull<FamilyGrainFile>("us/sf/payroll_by_family_year.json");

  return {
    kind: "area",
    code: group.organization_group_code,
    slug,
    name: group.organization_group,
    fiscalYear: fy,
    latest,
    first: series[0],
    series,
    shareOfCityPayroll:
      city.total && city.total > 0 ? latest.total_compensation_usd / city.total : null,
    departments: depts.map(({ d, p }) => ({
      code: d.department_code,
      name: d.department,
      href: `/us/city/sf/payroll/dept/${payrollDeptSlug(d.department_code)}`,
      n_employees: p.n_employees,
      median_total_comp_usd: p.median_total_comp_usd,
      ot_share_of_comp: p.ot_share_of_comp,
      total_compensation_usd: p.total_compensation_usd,
    })),
    families: familiesFor(grain, fy, depts.map(({ d }) => d.department_code)),
    foldNote: byDept.fold_note,
    privacyRule: grain?.privacy.rule ?? byDept.privacy.rule,
    source: byDept.source,
  };
}

// ─────────────────────────────────────────────────────────────────── roles ──

/**
 * A ROLE — the source's own job-family code ("Park & Zoo", "Library",
 * "Agriculture & Horticulture"), the rung below the citizen-readable display
 * family this site groups them into.
 *
 * The family fiche already listed these codes; they were dead text. This makes
 * each one an entity you can open and see split the other ways the data allows:
 * across departments, across years, and against its sibling codes in the same
 * family.
 */
export type SfPayrollRoleData = {
  kind: "role";
  label: string;
  slug: string;
  /** The display family it is grouped under, and its fiche. */
  family: string;
  familyHref: string;
  fiscalYear: number;
  latest: { n_employees: number; overtime_usd: number; total_compensation_usd: number };
  first: { fiscal_year: number; n_employees: number; total_compensation_usd: number };
  series: Array<{ fiscal_year: number; n_employees: number; total_compensation_usd: number }>;
  /** Share of its display family's compensation in the latest year. */
  shareOfFamily: number | null;
  departments: Array<{
    code: string;
    name: string;
    href: string;
    n_employees: number;
    overtime_usd: number;
    total_compensation_usd: number;
  }>;
  /** The other source codes grouped under the same display family. */
  siblings: Array<{ label: string; href: string; total_compensation_usd: number; n_employees: number }>;
  privacyRule: string;
  source: PayrollSource;
};

/** Aggregate the dept × source-family grain of one fiscal year by family_label. */
function rolesInYear(grain: FamilyGrainFile | null, fy: number) {
  const byLabel = new Map<
    string,
    {
      label: string;
      display_family: string;
      n: number;
      ot: number;
      usd: number;
      depts: Map<string, { n: number; ot: number; usd: number }>;
    }
  >();
  for (const [code, rows] of Object.entries(grain?.years[String(fy)] ?? {})) {
    for (const r of rows) {
      // The pooled bucket is not a code and has no fiche.
      if (r.is_pooled) continue;
      const cur =
        byLabel.get(r.family_label) ??
        {
          label: r.family_label,
          display_family: r.display_family,
          n: 0,
          ot: 0,
          usd: 0,
          depts: new Map(),
        };
      cur.n += r.n_employees;
      cur.ot += r.overtime_usd;
      cur.usd += r.total_compensation_usd;
      const d = cur.depts.get(code) ?? { n: 0, ot: 0, usd: 0 };
      cur.depts.set(code, {
        n: d.n + r.n_employees,
        ot: d.ot + r.overtime_usd,
        usd: d.usd + r.total_compensation_usd,
      });
      byLabel.set(r.family_label, cur);
    }
  }
  return byLabel;
}

export function sfPayrollRoleSlugs(): string[] {
  const byDept = readByDept();
  const fy = latestFy(byDept);
  const grain = readDataJsonOrNull<FamilyGrainFile>("us/sf/payroll_by_family_year.json");
  return [...rolesInYear(grain, fy).keys()].map(roleSlug);
}

export function loadSfPayrollRole(slug: string): SfPayrollRoleData | null {
  const byDept = readByDept();
  const fy = latestFy(byDept);
  const grain = readDataJsonOrNull<FamilyGrainFile>("us/sf/payroll_by_family_year.json");
  const latestRoles = rolesInYear(grain, fy);
  const mine = [...latestRoles.values()].find((r) => roleSlug(r.label) === slug);
  if (!mine) return null;

  const years = Object.keys(grain?.years ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const series = years
    .map((y) => {
      const row = rolesInYear(grain, y).get(mine.label);
      return row
        ? { fiscal_year: y, n_employees: row.n, total_compensation_usd: row.usd }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const deptName = new Map(
    byDept.departments.map((d) => [d.department_code, d.department]),
  );

  const familyTotal = [...latestRoles.values()]
    .filter((r) => r.display_family === mine.display_family)
    .reduce((s, r) => s + r.usd, 0);

  return {
    kind: "role",
    label: mine.label,
    slug,
    family: mine.display_family,
    familyHref: `/us/city/sf/payroll/family/${familySlug(mine.display_family)}`,
    fiscalYear: fy,
    latest: { n_employees: mine.n, overtime_usd: mine.ot, total_compensation_usd: mine.usd },
    first: series[0] ?? { fiscal_year: fy, n_employees: mine.n, total_compensation_usd: mine.usd },
    series,
    shareOfFamily: familyTotal > 0 ? mine.usd / familyTotal : null,
    departments: [...mine.depts.entries()]
      .map(([code, v]) => ({
        code,
        name: deptName.get(code) ?? code,
        href: `/us/city/sf/payroll/dept/${payrollDeptSlug(code)}`,
        n_employees: v.n,
        overtime_usd: v.ot,
        total_compensation_usd: v.usd,
      }))
      .sort((a, b) => b.total_compensation_usd - a.total_compensation_usd),
    siblings: [...latestRoles.values()]
      .filter((r) => r.display_family === mine.display_family && r.label !== mine.label)
      .map((r) => ({
        label: r.label,
        href: `/us/city/sf/payroll/role/${roleSlug(r.label)}`,
        total_compensation_usd: r.usd,
        n_employees: r.n,
      }))
      .sort((a, b) => b.total_compensation_usd - a.total_compensation_usd),
    privacyRule: grain?.privacy.rule ?? byDept.privacy.rule,
    source: byDept.source,
  };
}
