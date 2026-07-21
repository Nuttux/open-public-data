/**
 * Types for the SF payroll exports (public/data/us/sf/payroll_*.json) and
 * the slimmed payloads the server page hands to the client. Only fields
 * the page consumes are typed — the JSON files carry more (full data
 * contract: source blocks, notes, privacy rule) and stay authoritative.
 */

export type PayrollSource = {
  name: string;
  dataset_id: string;
  source_url: string;
  attribution: string | null;
  rows_updated_at: string | null;
};

export type PayrollPrivacy = {
  rule: string;
  measured_cost: string;
  count_only_disclosures: string;
};

export type PayrollYearPoint = {
  fiscal_year: number;
  salaries_usd: number;
  overtime_usd: number;
  other_salaries_usd: number;
  total_salary_usd: number;
  retirement_usd: number;
  health_and_dental_usd: number;
  other_benefits_usd: number;
  total_benefits_usd: number;
  total_compensation_usd: number;
  ot_share_of_comp: number;
  n_employees: number;
  avg_total_comp_usd: number;
  median_total_comp_usd: number;
  per_resident_usd: number | null;
  employees_per_1k_residents: number | null;
  population: number | null;
  population_year: number | null;
};

export type PayrollByYear = {
  generated_at: string;
  source_pipeline: string;
  as_of: string | null;
  source: PayrollSource;
  fiscal_year_note: string;
  perimeter: string;
  median_note: string;
  ot_counter_note: string;
  ot_salary_floor_usd: number;
  population: {
    value: number | null;
    year: number | null;
    source: string | null;
    source_url: string | null;
    note: string;
  };
  privacy: PayrollPrivacy;
  points: PayrollYearPoint[];
};

export type PayrollDeptSeriesPoint = {
  fiscal_year: number;
  total_compensation_usd: number;
  salaries_usd: number;
  overtime_usd: number;
  other_salaries_usd: number;
  total_benefits_usd: number;
  ot_share_of_comp: number;
  n_employees: number;
  median_total_comp_usd: number;
};

export type PayrollDept = {
  department_code: string;
  department: string;
  organization_group_code: string;
  organization_group: string;
  series: PayrollDeptSeriesPoint[];
};

export type PayrollByDept = {
  as_of: string | null;
  source: PayrollSource;
  keying_note: string;
  fold_note: string;
  privacy: PayrollPrivacy;
  organization_groups: Array<{
    organization_group_code: string;
    organization_group: string;
    years: Record<string, {
      total_compensation_usd: number;
      overtime_usd: number;
      n_employees_listed: number;
      n_departments: number;
    }>;
  }>;
  departments: PayrollDept[];
  n_departments: number;
};

export type HistogramBucket = {
  floor_usd: number;
  ceiling_usd: number | null; // null = open top bucket
  n_employees: number;
};

export type DistributionPoint = {
  fiscal_year: number;
  n_employees: number;
  p25_usd: number;
  p50_usd: number;
  p75_usd: number;
  p90_usd: number;
  p99_usd: number;
  n_above_200k: number;
  n_above_300k: number;
  n_above_400k: number;
  n_above_500k: number;
  n_negative_comp: number;
  histogram: HistogramBucket[];
};

export type PayrollDistribution = {
  as_of: string | null;
  source: PayrollSource;
  bucket_width_usd: number;
  percentile_note: string;
  histogram_note: string;
  high_earners: {
    fiscal_year: number | null;
    threshold_usd: number | null;
    note: string;
    titles: Array<{
      job_title: string;
      display_family: string | null;
      n_employees: number;
      is_remainder: boolean;
    }>;
  };
  privacy: PayrollPrivacy;
  points: DistributionPoint[];
};

export type PayrollOvertime = {
  as_of: string | null;
  source: PayrollSource;
  framing_note: string;
  dept_series_note: string;
  counter_note: string;
  titles_note: string;
  ot_salary_floor_usd: number;
  privacy: PayrollPrivacy;
  citywide: Array<{
    fiscal_year: number;
    overtime_usd: number;
    total_compensation_usd: number;
    ot_share_of_comp: number;
    n_ot_exceeds_salary_naive: number;
    n_ot_exceeds_salary_floored: number;
  }>;
  departments: Array<{
    department_code: string;
    department: string;
    organization_group: string;
    series: Array<{
      fiscal_year: number;
      overtime_usd: number;
      total_compensation_usd: number;
      ot_share_of_comp: number;
      n_employees: number;
    }>;
  }>;
  top_titles: Array<{
    fiscal_year: number;
    job_title: string;
    display_family: string | null;
    n_employees: number;
    n_ot_earners: number;
    overtime_usd: number;
    avg_ot_per_ot_earner_usd: number;
  }>;
};

export type PayrollFamilyRow = {
  display_family: string;
  n_employees: number;
  salaries_usd: number;
  overtime_usd: number;
  other_salaries_usd: number;
  total_benefits_usd: number;
  total_compensation_usd: number;
  ot_share_of_comp: number;
};

export type PayrollByFamilyCitywide = {
  as_of: string | null;
  source: PayrollSource;
  grain: string;
  privacy: PayrollPrivacy;
  years: Record<string, PayrollFamilyRow[]>;
  n_rows: number;
};
