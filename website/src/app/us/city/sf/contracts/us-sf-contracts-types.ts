/**
 * TypeScript contract for the SF contracts exports produced by
 * `pipeline/scripts/export/export_us_sf_contracts.py`:
 * `public/data/us/sf/contracts_overview.json`, `contracts_active.json`
 * and `contracts/fiche/<contract_no>.json`.
 *
 * Types mirror the JSON exactly — no renaming, no unit conversion. Every
 * displayed number on /us/city/sf/contracts comes from these fields.
 */

export type SfSourceBlock = {
  name: string;
  dataset_id: string;
  source_url: string;
  attribution: string;
  rows_updated_at: string | null;
};

export type SfContractsMeta = {
  generated_at: string;
  source_pipeline: string;
  country: string;
  scale: string;
  place: string;
  unit: string;
  as_of: string | null;
  source: SfSourceBlock;
};

export type SfTypeRow = {
  contract_type: string;
  n_contracts: number;
  agreed_usd: number;
  paid_usd: number;
  share_of_register_agreed: number;
};

export type SfDeptRow = {
  department: string;
  department_code: string | null;
  n_contracts: number;
  agreed_usd: number;
  paid_usd: number;
};

export type SfSoleDeptRow = {
  department: string;
  department_code: string | null;
  n_sole: number;
  sole_agreed_usd: number;
  n_contracts: number;
  dept_agreed_usd: number;
  share_of_dept_contracts: number;
  share_of_dept_agreed: number | null;
};

export type SfSoleYearRow = {
  year: number;
  n_contracts: number;
  n_sole: number;
  share_sole: number;
};

export type SfSoleTopRow = {
  contract_no: string;
  title: string;
  title_plain: string | null;
  prime_contractor: string | null;
  department: string | null;
  agreed_usd: number;
  paid_usd: number;
  purchasing_authority: string | null;
  authority_family: string;
  is_active: boolean | null;
};

export type SfFamilyRow = {
  family: string;
  n_contracts: number;
  agreed_usd: number;
  n_sole_flagged: number;
};

export type SfContractsOverview = SfContractsMeta & {
  export_date_pacific: string;
  perimeter: string;
  hero: {
    active: { n_contracts: number; agreed_usd: number; paid_usd: number };
    register: {
      n_contracts: number;
      agreed_usd: number;
      paid_usd: number;
      n_expired: number;
      n_unknown_end: number;
    };
    active_definition: string;
    paid_definition: string;
  };
  landscape: {
    by_type: SfTypeRow[];
    grants: {
      n_contracts: number;
      agreed_usd: number;
      paid_usd: number;
      share_of_register_agreed: number;
    } | null;
  };
  departments: SfDeptRow[];
  non_profit: {
    n_contracts: number;
    agreed_usd: number;
    paid_usd: number;
    flag_definition: string;
  };
  sole_source: {
    n_contracts: number;
    agreed_usd: number;
    paid_usd: number;
    share_of_contracts: number;
    share_of_agreed: number;
    active: { n_contracts: number; agreed_usd: number };
    flag_definition: string;
    by_department: SfSoleDeptRow[];
    by_start_year: SfSoleYearRow[];
    stability: {
      min_starts_floor: number;
      year_from: number;
      year_to: number;
      share_min: number;
      share_max: number;
      note: string;
    } | null;
    top_contracts: SfSoleTopRow[];
  };
  lbe: {
    prime: { n_contracts: number; agreed_usd: number; perimeter: string };
    team: {
      n_member_rows: number;
      n_contracts: number;
      attached_usd: number;
      perimeter: string;
    };
  };
  authority_families: {
    families: SfFamilyRow[];
    classification: {
      method: string;
      classified_at: string;
      seed: string;
      note: string;
    };
  };
  data_quality: {
    n_paid_exceeds_agreed: number;
    n_multi_prime_row_contracts: number;
    n_sub_only_contracts_excluded: number;
    share_src_arithmetic_consistent: number;
    n_placeholder_end_dates: number;
    voucher_join: {
      voucher_contract_numbers: number;
      matched_in_register: number;
      matched_dollar_share: number;
      coverage_floor: string;
    };
    notes: string;
  };
};

export type SfActiveRow = {
  contract_no: string;
  title: string;
  title_plain?: string;
  prime: string | null;
  department: string | null;
  department_code: string | null;
  contract_type: string | null;
  sole_source: boolean;
  lbe_prime: boolean;
  non_profit: boolean;
  agreed_usd: number;
  paid_usd: number;
  paid_exceeds_agreed: boolean;
  start: string | null;
  end: string | null;
};

export type SfContractsActive = SfContractsMeta & {
  perimeter: string;
  n_rows: number;
  rows: SfActiveRow[];
};

export type SfSpendPoint = {
  fiscal_year: number;
  vouchers_paid_usd: number;
  n_vouchers: number;
  execution_status: "closed" | "recently_closed_preliminary" | "in_progress";
};

export type SfTeamMember = {
  supplier: string | null;
  role: "Prime Contractor" | "Subcontractor" | "Joint Venture Constituent";
  lbe: boolean;
  attached_usd: number | null;
};

export type SfContractFiche = {
  generated_at: string;
  source_pipeline: string;
  unit: string;
  as_of: string | null;
  contract: {
    contract_no: string;
    title: string;
    title_plain: string | null;
    contract_type: string | null;
    purchasing_authority: string | null;
    authority_family: string;
    department: string | null;
    department_code: string | null;
    prime_contractor: string | null;
    term_start: string | null;
    term_end: string | null;
    term_end_is_placeholder: boolean;
    is_active: boolean | null;
    sole_source: boolean;
    non_profit: boolean;
    lbe_prime: boolean;
    agreed_usd: number;
    paid_usd: number;
    remaining_calc_usd: number;
    src_arithmetic_consistent: boolean;
    paid_exceeds_agreed: boolean;
    n_prime_rows: number;
  };
  spend_by_fy: { points: SfSpendPoint[]; note: string };
  team: SfTeamMember[];
  team_note: string;
  source: SfSourceBlock & { raw_rows_url: string };
};

/** Plain-English relabels for the register's contract_type strings (display
 *  only — the raw string is always available in a tooltip). Anything not in
 *  the map renders its raw string. */
export const TYPE_LABELS: Record<string, string> = {
  "Grant Contracts (City as Grantor, previously named ‘Grants’)": "Grants the City gives out",
  "Professional Services and P-Form Contracts (Charter Authority)": "Professional services (Charter authority)",
  "Non-Purchasing Contract (Rents, etc.)": "Rents & other non-purchasing agreements",
  "Professional Services and P-Form Contracts": "Professional services",
  "Construction Contracts": "Construction",
  "Construction Contracts - Unilateral": "Construction — change orders (unilateral)",
  "Purchasing Contract": "Purchasing (goods & equipment)",
  "Purchasing Contract - Term Contract Commodities": "Term commodities",
  "Purchasing Contract – OCA Approval NOT Required": "Purchasing — OCA-exempt",
  "Professional Services - Chapter 6": "Professional services (public works)",
  "Purchasing Contract - Term Contract General Services": "Term general services",
  "Supplier Contract used to track MOU Agreement": "MOU agreements",
  "Construction Contracts - Modification": "Construction — modification",
  "Construction Contracts - Change Order": "Construction — change order",
  "Grant Contract AP Dept Approval Required": "Grants — AP approval required",
  "(not specified)": "Not specified",
};

export function typeLabel(raw: string | null): string {
  if (!raw) return TYPE_LABELS["(not specified)"];
  return TYPE_LABELS[raw] ?? raw;
}

/** Display labels for the seeded purchasing-authority families. */
export const FAMILY_LABELS: Record<string, string> = {
  competitive_bid: "Competitive bid",
  grant: "Grant-making authorities",
  sole_source_waiver: "Sole-source waivers",
  government_agreement: "Agreements with public agencies",
  rent_real_estate: "Rents & real estate",
  emergency: "Emergency procurement",
  legacy_none: "Legacy system (no authority recorded)",
  other: "Other special authorities",
};
