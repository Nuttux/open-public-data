/**
 * Types for /us/city/sf/who-gets-paid — mirror of the export contract in
 * pipeline/scripts/export/export_us_sf.py (top_payees.json +
 * payees_search.json). Amounts are USD floats straight from BigQuery.
 */

export type WgpSource = {
  name: string;
  dataset_id: string;
  source_url: string;
  attribution: string | null;
  rows_updated_at: string | null;
};

export type WgpPayee = {
  rank: number;
  vendor: string;
  vouchers_paid_usd: number;
  share_of_fy_paid: number | null;
  n_vouchers: number;
  is_non_profit: boolean;
  top_department: string | null;
  n_departments: number;
  objects_top3: string[];
  grant_funded_usd: number | null;
  bucket: string | null;
  bucket_note: string | null;
  is_aggregation_line: boolean;
};

export type WgpNonprofitRow = {
  rank: number;
  community_rank: number | null;
  in_community_ranking: boolean;
  vendor: string;
  vouchers_paid_usd: number;
  grant_funded_usd: number | null;
  share_of_fy_nonprofit: number | null;
  n_vouchers: number;
  n_departments: number;
  top_department: string | null;
  bucket: string | null;
  bucket_note: string | null;
};

export type WgpYear = {
  totals: {
    all_usd: number;
    city_usd: number;
    related_govt_units_usd: number;
    related_share_of_total: number | null;
  };
  related_top_departments: { department: string; usd: number }[];
  n_vendors: number;
  n_vouchers: number;
  execution_status: "closed" | "recently_closed_preliminary" | "in_progress";
  bucket_coverage_pct: number | null;
  grants: { total_usd: number; nonprofit_usd: number } | null;
  nonprofit: {
    total_usd: number;
    n_vendors: number;
    share_of_total: number | null;
    top_department: { name: string | null; usd: number | null };
    top: WgpNonprofitRow[];
  } | null;
  payees: WgpPayee[];
};

export type WgpMaterialityItem = {
  slug: string;
  label: string;
  editorial_note: string | null;
  vendor: string;
  department: string;
  object: string | null;
  sub_object: string;
  fiscal_year: number;
  amount_usd: number;
  execution_status: string;
};

export type WgpFile = {
  generated_at: string;
  source_pipeline: string;
  unit: string;
  as_of: string | null;
  source: WgpSource;
  metric: string;
  perimeter: string;
  ranking_caveat: string;
  classification: {
    method: string;
    classified_at: string | null;
    seed: string;
    coverage: string;
    bucket_definitions: Record<string, string>;
  };
  default_view: { excluded_buckets: string[]; note: string };
  grant_lens_definition: string;
  fy2018_note: string;
  nonprofit_floor_note: string;
  top_n: number;
  years: Record<string, WgpYear>;
  materiality: { note: string; items: WgpMaterialityItem[] };
  notes: string;
};

/** Slim payload the server page hands the client (one year only). */
export type WgpMeta = {
  as_of: string | null;
  generated_at: string;
  source_pipeline: string;
  source: WgpSource;
  perimeter: string;
  ranking_caveat: string;
  classification: WgpFile["classification"];
  default_view: WgpFile["default_view"];
  grant_lens_definition: string;
  nonprofit_floor_note: string;
  notes: string;
  top_n: number;
};

export type WgpYearStatus = {
  fy: number;
  status: WgpYear["execution_status"];
};

/** payees_search.json entries (lazy index). */
export type SearchPayee = {
  name: string;
  totalAmount: number;
  byYear: Record<string, number>;
  lastActiveYear: number;
  nFys: number;
  np: boolean;
  bucket: string | null;
  topDepartment: string | null;
  nDepartments: number | null;
  isAggregationLine: boolean;
};

export type SearchPayload = {
  count: number;
  years: number[];
  data: SearchPayee[];
};
