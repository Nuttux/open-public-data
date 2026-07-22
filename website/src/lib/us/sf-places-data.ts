import "server-only";
import { readDataJsonOrNull } from "@/lib/data/read";

/**
 * Server-side loaders for the SF places feature (public/data/us/sf/places/*,
 * written by export_sf_places.py). The SF analogue of lib/lieux-data.ts.
 *
 * Publication guard (the "pas de suggestions mortes" doctrine): a place is
 * only ever linked or listed if it is in index.json AND its fiche file exists
 * — the same predicate the route's 404 uses. reverse_index.json maps money
 * entities (contracts, departments) to PUBLISHED places only, so a chip on a
 * contract or budget page renders only when its target place truly ships.
 */

export type SfPlacePhotoCredit = {
  source: string;
  file_url: string;
  license: string;
  license_url: string;
  author: string;
};

export type SfPlaceDoc = {
  identifier: string;
  title: string;
  creator: string | null;
  year: number | null;
  pool: "sfpl" | "dl";
  url: string;
  deep_link: string;
  source_label: string;
  /** One-line, OCR-grounded "what this scan shows about this place", written by
   *  the summary step (apply_sf_place_summaries.py) from the document's own OCR
   *  passages — the curated replacement for the old raw 280-char snippet. */
  gloss?: string | null;
  /** Narrative bucket assigned by export_sf_places.py's curate_documents(). */
  group: string;
  /** Top-salience rows shown without expanding "see all documents". */
  salient: boolean;
  /** e.g. "4 editions cited (1920–2005)" when repeat editions were collapsed. */
  variant_note?: string;
};

export type SfPlaceContractTeamMember = {
  supplier: string;
  role: string;
  lbe: boolean;
  attached_usd: number | null;
};

export type SfPlaceContract = {
  contract_no: string;
  title: string;
  prime: string | null;
  department_code: string | null;
  agreed_usd: number | null;
  paid_usd: number | null;
  evidence: string;
  /** Prime + subcontractors, lifted from the contract's own fiche — the
   *  payee linkage. Absent when that contract has no fiche (coverage gap,
   *  not a false negative). Attached amounts live inside the contract's own
   *  agreed/paid — never additive, never a place's own money total. */
  team?: SfPlaceContractTeamMember[] | null;
};

export type SfPlaceBudgetLine = {
  code: string;
  name: string;
  total_usd: number;
  fiscal_year: number;
} | null;

/** The owning department's citywide payroll — never this place's own staff
 *  (the comp dataset has no field finer than department_code). Same
 *  structural-link framing as budget_line. */
export type SfPlacePayrollLine = {
  code: string;
  name: string;
  total_compensation_usd: number;
  n_employees: number;
  fiscal_year: number;
} | null;

/** Structured facility identity (Block 6A) — from the SF City Facilities
 *  registry via the reviewed place↔facility crosswalk. Identity, not money:
 *  canonical address, APN (block_lot), ownership, floor area, campus size. */
export type SfPlaceFacility = {
  primary_name: string | null;
  primary_address: string | null;
  primary_city: string | null;
  primary_zip: string | null;
  primary_block_lot: string | null;
  primary_department_name: string | null;
  primary_is_city_owned: boolean | null;
  primary_gross_sq_ft: number | null;
  primary_latitude: number | null;
  primary_longitude: number | null;
  supervisor_district: number | null;
  n_facilities: number;
  total_gross_sq_ft: number | null;
  n_owned: number;
  n_leased: number;
  apn_list: string[];
  facilities: Array<{
    facility_id: number;
    common_name: string | null;
    block_lot: string | null;
    gross_sq_ft: number | null;
    is_city_owned: boolean | null;
  }>;
} | null;

/** Capital & construction (Block 6B+) — the unified, NO-SUM capital model.
 *  Each item carries an amount_measure so dollars are labeled by ledger and
 *  never summed across sources (bond expended = the money that pays the
 *  contracts). measure_totals is per-ledger only. */
export type SfPlaceCapitalItem = {
  source: "bond" | "contract" | "permit" | "dpw";
  source_kind: string;
  item_name: string;
  bond_program: string | null;
  component: string | null;
  voter_approved_date: string | null;
  amount_usd: number | null;
  amount_measure: "bond_expended" | "contract_paid" | "permit_declared" | null;
  budget_usd: number | null;
  contract_no: string | null;
  status: string | null;
  match_evidence: string | null;
};
export type SfPlacePayee = {
  vendor: string;
  paid_usd: number;
  n_contracts: number;
  first_fiscal_year: number | null;
  last_fiscal_year: number | null;
};
export type SfPlacePermit = {
  description: string | null;
  permit_type: string | null;
  declared_cost_usd: number | null;
  status: string | null;
  permit_date: string | null;
  permit_year: number | null;
};
export type SfPlaceCapital = {
  n_items: number;
  measure_totals: Partial<Record<"bond_expended" | "contract_paid" | "permit_declared", number>>;
  bond_programs: string[];
  items: SfPlaceCapitalItem[];
  payees: SfPlacePayee[];
  n_payees: number;
  payees_total_paid: number;
  permits: SfPlacePermit[];
  n_permits: number;
  permits_total_declared: number;
  permits_by_year: Array<{ year: number; declared_usd: number }>;
} | null;

export type SfPlaceFicheData = {
  slug: string;
  name: string;
  kind: string;
  family: string;
  address: string | null;
  lat: number;
  lon: number;
  owning_dept: { name: string; code: string };
  facility: SfPlaceFacility;
  capital: SfPlaceCapital;
  photo: string | null;
  photo_credit: SfPlacePhotoCredit | null;
  summary_en: string | null;
  published: boolean;
  money: {
    budget_line: SfPlaceBudgetLine;
    payroll_line: SfPlacePayrollLine;
    contracts: SfPlaceContract[];
    grants: unknown[];
  };
  documents: SfPlaceDoc[];
  dept_shelf: Array<{ identifier: string; title: string; year: number | null; pool: string; url: string }>;
  /** Real name of the archive collection dept_shelf is drawn from — never the
   *  owning department's name when that's a fallback substitute (see
   *  export_sf_places.py DEPT_ARCHIVE_SLUG). */
  dept_shelf_label: string;
  /** Count of additional dept_shelf items held back beyond the cap. */
  dept_shelf_more: number;
  sources: Array<{ label: string; note: string }>;
};

export type SfPlaceIndexEntry = {
  slug: string;
  name: string;
  kind: string;
  family: string;
  lat: number;
  lon: number;
  photo: string | null;
  owning_dept_code: string;
  n_documents: number;
  n_contracts: number;
  /** Public dollars paid to vendors for work at this place (contract payments,
   *  from _capital.json → payees_total_paid). The one quantified, single-source,
   *  non-double-counted money figure per place; 0 when none is recorded. */
  funds_usd: number;
};

type IndexFile = { count: number; places: SfPlaceIndexEntry[] };
type CapitalFile = { places?: Record<string, { payees_total_paid?: number }> };
type ReverseIndex = {
  places: string[];
  by_contract: Record<string, string>;
  by_dept: Record<string, string[]>;
};

export function loadSfPlacesIndex(): SfPlaceIndexEntry[] {
  const idx = readDataJsonOrNull<IndexFile>("us/sf/places/index.json");
  const places = idx?.places ?? [];
  // Join the per-place contract-payment total (already computed upstream) so
  // the list can rank by public money without re-aggregating anything here.
  const capital = readDataJsonOrNull<CapitalFile>("us/sf/places/_capital.json");
  const paidBySlug = capital?.places ?? {};
  return places.map((p) => ({
    ...p,
    funds_usd: Math.max(0, paidBySlug[p.slug]?.payees_total_paid ?? 0),
  }));
}

export function loadSfPlace(slug: string): SfPlaceFicheData | null {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const fiche = readDataJsonOrNull<SfPlaceFicheData>(`us/sf/places/${slug}.json`);
  // Guard: only serve a place that is actually published.
  if (!fiche || !fiche.published) return null;
  return fiche;
}

function reverseIndex(): ReverseIndex {
  return (
    readDataJsonOrNull<ReverseIndex>("us/sf/places/reverse_index.json") ?? {
      places: [],
      by_contract: {},
      by_dept: {},
    }
  );
}

const published = (): Set<string> => new Set(reverseIndex().places);

/** The place a contract belongs to — only if that place is published. */
export function placeForContract(contractNo: string): SfPlaceIndexEntry | null {
  const slug = reverseIndex().by_contract[contractNo];
  if (!slug || !published().has(slug)) return null;
  return loadSfPlacesIndex().find((p) => p.slug === slug) ?? null;
}

/** Published places operated by a department (for a dept fiche's place shelf). */
export function placesForDept(deptCode: string): SfPlaceIndexEntry[] {
  const slugs = new Set(reverseIndex().by_dept[deptCode] ?? []);
  return loadSfPlacesIndex().filter((p) => slugs.has(p.slug));
}
