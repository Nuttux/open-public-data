import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import { familySlug, payrollDeptSlug, roleSlug } from "@/lib/us/sf-payroll-slugs";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollByFamilyCitywide,
  PayrollFamilyDistribution,
  PayrollFamilyRow,
} from "@/app/us/city/sf/payroll/payroll-types";

/**
 * Job-family facet — the payroll counterpart of the contract-type fiche
 * (and of Recife's modalidade/tema): a family you can navigate INTO, with
 * its trajectory, the departments that employ it and the source job codes
 * it groups.
 *
 * The dept × family grain (payroll_by_family_year.json, ~3MB) is read
 * SERVER-SIDE ONLY and reduced to one family's slice here — the client
 * never receives the file. Rows in that export are already privacy-pooled
 * (no dollar aggregate under 5 employees, see its `privacy` block).
 */

/** years[fy][dept_code] → rows at department × source-family grain. */
type FamilyGrainFile = {
  years: Record<string, Record<string, FamilyGrainRow[]>>;
  privacy: { rule: string };
  source: { name: string; source_url: string };
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

export type SfPayrollFamilyData = {
  family: string;
  fiscalYear: number;
  /** Citywide trajectory of this family, oldest first. */
  series: Array<{ fiscal_year: number; total_compensation_usd: number; n_employees: number }>;
  latest: PayrollFamilyRow;
  /** This family's share of all city compensation in the latest year. */
  shareOfCityPayroll: number | null;
  /**
   * What this work pays PER PERSON — exact percentiles from the family cut of
   * the distribution. The fiche had no per-person figure at all: it could say
   * a family cost $1.1B without ever saying what one of those jobs pays.
   * Null when the family carries no percentile row (under the threshold).
   */
  pay: {
    n_people: number;
    p25_usd: number;
    p50_usd: number;
    p75_usd: number;
    p90_usd: number;
    /** Citywide median in the same year, to place this family against it. */
    cityMedianUsd: number | null;
  } | null;
  /** Departments employing it, biggest payroll first. */
  departments: Array<{
    code: string;
    name: string;
    n_employees: number;
    overtime_usd: number;
    total_compensation_usd: number;
    href: string;
  }>;
  /** The source's own job families grouped under this display family. Each is
   *  an entity you can open — `href` is null only for the pooled bucket, which
   *  is not a code and has no fiche. */
  roles: Array<{
    label: string;
    n_employees: number;
    total_compensation_usd: number;
    pooled: boolean;
    href: string | null;
  }>;
  privacyRule: string;
  source: { name: string; source_url: string };
};

function readCitywide(): PayrollByFamilyCitywide {
  return readDataJson<PayrollByFamilyCitywide>("us/sf/payroll_by_family_citywide.json");
}

/** Every display-family slug — for generateStaticParams and link validation. */
export function sfPayrollFamilySlugs(): string[] {
  const cw = readCitywide();
  const latest = String(Math.max(...Object.keys(cw.years).map(Number)));
  return (cw.years[latest] ?? []).map((r) => familySlug(r.display_family));
}

export function loadSfPayrollFamily(slug: string): SfPayrollFamilyData | null {
  const cw = readCitywide();
  const years = Object.keys(cw.years).map(Number).sort((a, b) => a - b);
  const fy = years[years.length - 1];
  const latestRows = cw.years[String(fy)] ?? [];
  const latest = latestRows.find((r) => familySlug(r.display_family) === slug);
  if (!latest) return null;
  const family = latest.display_family;

  const series = years
    .map((y) => {
      const row = (cw.years[String(y)] ?? []).find((r) => r.display_family === family);
      return row
        ? {
            fiscal_year: y,
            total_compensation_usd: row.total_compensation_usd,
            n_employees: row.n_employees,
          }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Share of the whole city payroll in the same year.
  const byYear = readDataJsonOrNull<PayrollByYear>("us/sf/payroll_by_year.json");
  const cityTotal =
    byYear?.points.find((p) => p.fiscal_year === fy)?.total_compensation_usd ?? null;
  const shareOfCityPayroll =
    cityTotal && cityTotal > 0 ? latest.total_compensation_usd / cityTotal : null;

  // Department names, keyed on code (labels break in early years — the
  // payroll export's own keying_note says to key on department_code).
  const byDept = readDataJsonOrNull<PayrollByDept>("us/sf/payroll_by_dept_year.json");
  const deptName = new Map(
    (byDept?.departments ?? []).map((d) => [d.department_code, d.department]),
  );

  // What this work pays per person, from the family cut of the distribution.
  const famDist = readDataJsonOrNull<PayrollFamilyDistribution>(
    "us/sf/payroll_family_distribution.json",
  );
  const distRow = (famDist?.years[String(fy)] ?? []).find(
    (r) => !r.is_pooled && r.display_family === family,
  );
  const pay =
    distRow && distRow.n_people != null && distRow.p50_usd != null
      ? {
          n_people: distRow.n_people,
          p25_usd: distRow.p25_usd as number,
          p50_usd: distRow.p50_usd as number,
          p75_usd: distRow.p75_usd as number,
          p90_usd: distRow.p90_usd as number,
          cityMedianUsd:
            byYear?.points.find((p) => p.fiscal_year === fy)?.median_total_comp_usd ?? null,
        }
      : null;

  const grain = readDataJsonOrNull<FamilyGrainFile>("us/sf/payroll_by_family_year.json");
  const departments: SfPayrollFamilyData["departments"] = [];
  const roleTotals = new Map<string, { n: number; usd: number; pooled: boolean }>();

  for (const [code, rows] of Object.entries(grain?.years[String(fy)] ?? {})) {
    const mine = rows.filter((r) => r.display_family === family);
    if (mine.length === 0) continue;
    departments.push({
      code,
      name: deptName.get(code) ?? code,
      n_employees: mine.reduce((s, r) => s + r.n_employees, 0),
      overtime_usd: mine.reduce((s, r) => s + r.overtime_usd, 0),
      total_compensation_usd: mine.reduce((s, r) => s + r.total_compensation_usd, 0),
      // The department's PAYROLL fiche, not its budget one — a department
      // clicked from inside payroll answers the payroll question.
      href: `/us/city/sf/payroll/dept/${payrollDeptSlug(code)}`,
    });
    for (const r of mine) {
      const cur = roleTotals.get(r.family_label) ?? { n: 0, usd: 0, pooled: false };
      roleTotals.set(r.family_label, {
        n: cur.n + r.n_employees,
        usd: cur.usd + r.total_compensation_usd,
        pooled: cur.pooled || r.is_pooled,
      });
    }
  }
  departments.sort((a, b) => b.total_compensation_usd - a.total_compensation_usd);

  const roles = [...roleTotals.entries()]
    .map(([label, v]) => ({
      label,
      n_employees: v.n,
      total_compensation_usd: v.usd,
      pooled: v.pooled,
      href: v.pooled ? null : `/us/city/sf/payroll/role/${roleSlug(label)}`,
    }))
    .sort((a, b) => b.total_compensation_usd - a.total_compensation_usd);

  return {
    family,
    fiscalYear: fy,
    series,
    latest,
    shareOfCityPayroll,
    pay,
    departments,
    roles,
    privacyRule: grain?.privacy.rule ?? "",
    source: cw.source,
  };
}
