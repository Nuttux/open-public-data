import "server-only";
import { readDataJsonOrNull } from "@/lib/data/read";

/**
 * Server-side loaders for the normalized SF payees (public/data/us/sf/payees/*,
 * written by export_us_sf_payees.py from mart_us_sf_payees). Only the top ~200 payees by lifetime
 * dollars are keyed; everything else stays an unkeyed string and must render
 * as plain text, never a link (the do-not-promise rule).
 */

export type SfPayeeContract = {
  contract_no: string;
  title: string | null;
  department: string | null;
  department_code: string | null;
  agreed_usd: number | null;
  paid_usd: number | null;
  sole_source: boolean | null;
};

export type SfPayeeVariant = { name: string; total: number };
export type SfPayeeMerge = { variant: string; reason: string };

/**
 * Who a payee IS — the slot Paris fills from SIRENE (activity label, legal
 * form, head office) and SF cannot, because the Controller's voucher file
 * carries no vendor identifier of any kind.
 *
 * Two methods, never blended:
 *   irs_bmf      — matched to an IRS-recognized exempt organization via the
 *                  ProPublica Nonprofit Explorer API. A registry fact: legal
 *                  name, EIN, NTEE activity code, city. Cited to the filing.
 *   grounded_llm — a web-searched one-liner for payees no registry covers
 *                  (for-profit suppliers). Carries its own sources and is
 *                  shown only above the confidence floor, exactly like the
 *                  Paris beneficiaire cascade.
 *
 * `method` travels to the UI so the fiche can label a registry fact as a
 * registry fact and a searched description as a searched description.
 */
export type SfPayeeIdentity = {
  /** One line on what this organization is or does. */
  description: string;
  method: "irs_bmf" | "grounded_llm";
  /** 0-1. Below the fiche's floor the identity is not rendered at all. */
  confidence: number;
  legal_name?: string | null;
  ein?: string | null;
  ntee_code?: string | null;
  ntee_label?: string | null;
  city?: string | null;
  state?: string | null;
  source_label: string;
  source_url?: string | null;
  /** Web sources the grounded pass actually cited. */
  sources?: { title: string | null; url: string }[];
  checked_at: string;
};

/** purchase / obligation / ledger / unclear — see stg_us_sf_subobject_class. */
export type SfSpendClass = "purchase" | "obligation" | "ledger" | "unclear";

/**
 * What the City pays a payee FOR — the rollups mart_us_sf_payee_profile
 * derives from the account coding on the payee's own voucher lines, summed
 * across every spelling seed_us_sf_payee_identity merged into this entity.
 *
 * This is the SF answer to the slot Paris fills from SIRENE: SF vendors carry
 * no registry id, so the City's own department + sub-object coding is the only
 * description of a payee available from the source itself.
 */
export type SfPayeeProfile = {
  /** Voucher count across every merged spelling. Summed, not maxed: a voucher
   *  belongs to exactly one spelling, so the variants partition it. */
  n_vouchers: number;
  departments: {
    department: string;
    department_code: string | null;
    usd: number;
    n_vouchers: number;
  }[];
  n_departments: number;
  categories: {
    code: string;
    label: string;
    spend_class: SfSpendClass;
    usd: number;
    n_vouchers: number;
  }[];
  n_categories: number;
  /** True when >1 spelling was merged: the counts above are then a FLOOR,
   *  because each variant reports its own distinct count and the union
   *  cannot be recovered from the truncated lists. */
  counts_are_floor: boolean;
  /** Most recently CLOSED fiscal year this payee was paid in. The voucher
   *  file has no payment date, only a fiscal year — a dated ledger is not
   *  derivable from this source. */
  recent_fy: number | null;
  recent_total_usd: number;
  n_recent_lines: number;
  recent_lines: {
    department: string;
    department_code: string | null;
    label: string;
    spend_class: SfSpendClass;
    usd: number;
    n_vouchers: number;
  }[];
};

export type SfPayeePaperTrail = {
  identifier: string;
  title: string;
  year: number | null;
  pool: "sfpl" | "dl";
  /** Raw OCR match fragment. Retained in the data, NEVER rendered — the archive
   *  presentation contract puts no raw archive text in front of a reader. */
  snippet: string;
  url: string;
  deep_link: string;
  source_label: string;
  /** One line on what this document says, when one has been written. */
  gloss?: string | null;
  /** Minutes/agendas/calendars/notices — counted on the shelf, not listed.
   *  Same DOC_TYPES rule as the place fiches (export_sf_places.py). */
  procedural?: boolean;
};

export type SfPayeeFicheData = {
  slug: string;
  name: string;
  kind: string;
  is_non_profit: boolean;
  total_paid_usd: number;
  n_years: number;
  first_year: number | null;
  last_year: number | null;
  by_year: Record<string, number>;
  top_departments: string[];
  /** null when the profiles intermediate was absent at build time. */
  profile?: SfPayeeProfile | null;
  /** Registry / grounded identity — who this payee IS. Written by
   *  enrich_sf_payee_identity.py, absent until that pass has run. */
  identity?: SfPayeeIdentity | null;
  contracts_held: SfPayeeContract[];
  n_contracts_held: number;
  variants: SfPayeeVariant[];
  n_variants: number;
  merges: SfPayeeMerge[];
  paper_trail?: SfPayeePaperTrail[];
  /** fiscal year → execution status, so a year still in progress is drawn
   *  as provisional instead of looking like a collapse in payments. */
  year_status?: Record<string, "closed" | "recently_closed_preliminary" | "in_progress">;
  as_of?: string;
  source?: { name?: string; source_url?: string };
};

export type SfPayeeIndexEntry = {
  slug: string;
  name: string;
  kind: string;
  total_paid_usd: number;
  n_variants: number;
  n_contracts_held: number;
  last_year: number | null;
};

type IndexFile = { count: number; payees: SfPayeeIndexEntry[] };

export function loadSfPayeesIndex(): SfPayeeIndexEntry[] {
  return readDataJsonOrNull<IndexFile>("us/sf/payees/index.json")?.payees ?? [];
}

/** A payee fiche — only for the keyed top ~200. null ⇒ render as plain text. */
export function loadSfPayee(slug: string): SfPayeeFicheData | null {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const fiche = readDataJsonOrNull<SfPayeeFicheData>(`us/sf/payees/${slug}.json`);
  if (!fiche) return null;
  const trail = readDataJsonOrNull<{ documents: SfPayeePaperTrail[]; matched_alias?: string }>(
    `enrichment/us_sf_payee_documents/payee-${slug}.json`,
  );
  // Defence in depth against OCR letter-noise: an alias with no token of 4+
  // characters ("A P X") matches scanned gibberish, so a stale file from
  // before the pipeline gate must not render as this vendor's evidence.
  // Mirrors alias_is_specific() in pipeline/scripts/enrich/link_sf_payees.py.
  const aliasIsSpecific = (alias?: string) =>
    !alias || (alias.match(/[A-Za-z0-9]+/g) ?? []).some((tok) => tok.length >= 4);
  // Substance gate, mirroring has_substance() in link_sf_payees.py: a generic
  // document type ("Minutes", "Resolution", "Agenda") plus a bare name match
  // is a hit, not evidence. Keep it only if the title describes the document
  // or the snippet carries enough words to read as a statement.
  const GENERIC_TITLE = /^(minutes|resolution|agenda|meeting minutes|notice of meeting|calendar)\b/i;
  const hasSubstance = (d: SfPayeePaperTrail) => {
    const words = (d.snippet ?? "")
      .replace(/«[^»]*»/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2).length;
    return !GENERIC_TITLE.test((d.title ?? "").trim()) || words >= 8;
  };
  const docs = (trail?.documents ?? []).filter(hasSubstance);
  const withTrail =
    docs.length > 0 && aliasIsSpecific(trail?.matched_alias)
      ? { ...fiche, paper_trail: docs }
      : fiche;
  return { ...withTrail, year_status: payeeYearStatus() };
}

/** Is this normalized-name keyed? Used to decide link vs plain text. */
const keyedSlugs = (): Set<string> => new Set(loadSfPayeesIndex().map((p) => p.slug));

export function payeeSlugIfKeyed(slug: string): string | null {
  return keyedSlugs().has(slug) ? slug : null;
}

/**
 * Inverse of every keyed payee's `contracts_held`: contract_no → payee slug.
 * `contracts_held` is joined on the contract's prime-contractor core (see
 * build_sf_payee_identity.py), so this resolves a contract to its keyed PRIME
 * payee — a confident reverse link with no name-matching guesswork. Built
 * once per build/dev process and memoized (≈200 small reads, one time).
 */
let _contractPrime: Map<string, string> | null = null;
export function contractPrimePayeeSlug(contractNo: string): string | null {
  if (!_contractPrime) {
    _contractPrime = new Map();
    for (const p of loadSfPayeesIndex()) {
      const fiche = readDataJsonOrNull<SfPayeeFicheData>(`us/sf/payees/${p.slug}.json`);
      if (!fiche) continue;
      for (const c of fiche.contracts_held) {
        // First keyed payee wins; contracts_held is prime-joined, so this is
        // the contract's prime. Ties (shared JV cores) are both valid primes.
        if (!_contractPrime.has(c.contract_no)) _contractPrime.set(c.contract_no, p.slug);
      }
    }
  }
  return _contractPrime.get(contractNo) ?? null;
}


/**
 * Fiscal-year execution status from the payees export. FY2027 carries
 * $1.2B on 14.5k vouchers against ~$16.8B on ~500k for a closed year — it is
 * a year in progress, not a collapse, and a payee's bar chart must say so.
 * Memoized: one read per process, tiny derived map.
 */
let yearStatusCache: Record<string, "closed" | "recently_closed_preliminary" | "in_progress"> | null = null;
function payeeYearStatus() {
  if (yearStatusCache) return yearStatusCache;
  const file = readDataJsonOrNull<{
    years: Record<string, { execution_status: "closed" | "recently_closed_preliminary" | "in_progress" }>;
  }>("us/sf/top_payees.json");
  const out: Record<string, "closed" | "recently_closed_preliminary" | "in_progress"> = {};
  for (const [fy, y] of Object.entries(file?.years ?? {})) out[fy] = y.execution_status;
  yearStatusCache = out;
  return out;
}
