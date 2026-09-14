/**
 * TypeScript contract for the US national exports produced by
 * `pipeline/scripts/export/export_us_national.py` (PLAN.md 1.4):
 * `public/data/us/national/{daily_bread,debt_series}.json`.
 *
 * Types mirror the JSON exactly — no renaming, no unit conversion. Every
 * displayed number on /us/national must come from these fields.
 */

export type UsSourceBlock = {
  name: string;
  table?: string;
  source_url: string;
  api_endpoint: string;
  update_frequency: string;
};

export type UsPopulation = {
  value: number;
  year: number;
  as_of: string;
  source: string;
  source_url: string;
  note: string;
};

export type UsCompleteness = {
  fytd_through: string;
  months_into_fiscal_year: number;
  fiscal_year_months: number;
  fiscal_year_complete: boolean;
  note: string;
};

export type UsMoneyTotals = {
  current_month_usd: number;
  current_fytd_usd: number;
  prior_fytd_usd: number;
  yoy_fytd_pct: number;
  per_resident_fytd_usd: number;
  per_resident_month_usd: number;
};

export type UsMoneyItem = UsMoneyTotals & {
  category: string;
  line_code_nbr: string;
  /** Share of this side's FYTD total — negative for offset categories. */
  share_of_side_fytd: number;
};

export type UsDailyBread = {
  generated_at: string;
  source_pipeline: string;
  country: string;
  scale: string;
  unit: string;
  accounting_basis: string;
  as_of: string;
  fiscal_year: number;
  completeness: UsCompleteness;
  source: UsSourceBlock;
  population: UsPopulation;
  receipts: { total: UsMoneyTotals; items: UsMoneyItem[]; n_items: number };
  outlays: { total: UsMoneyTotals; items: UsMoneyItem[]; n_items: number };
  budget_balance: {
    current_fytd_usd: number;
    current_month_usd: number;
    sign_convention: string;
  };
};

export type UsDebtAnnualPoint = {
  record_date: string;
  fiscal_year: number;
  tot_pub_debt_out_usd: number;
};

export type UsDebtLatest = {
  record_date: string;
  tot_pub_debt_out_usd: number;
  debt_held_public_usd: number;
  intragov_hold_usd: number;
  per_resident_usd: number;
  source: UsSourceBlock;
};

/** Full shape of debt_series.json (month_end left untyped — unused by the page). */
export type UsDebtSeriesFile = {
  generated_at: string;
  source_pipeline: string;
  as_of: string;
  latest: UsDebtLatest;
  population: UsPopulation;
  series: {
    annual_fy_end: {
      description: string;
      source: UsSourceBlock;
      n_points: number;
      points: UsDebtAnnualPoint[];
    };
    month_end: unknown;
  };
  notes: string;
};

/** Slimmed server→client payload (drops the 400-point month_end series). */
export type UsDebtSlim = {
  as_of: string;
  latest: UsDebtLatest;
  annual: {
    description: string;
    source: UsSourceBlock;
    points: UsDebtAnnualPoint[];
  };
  notes: string;
};
