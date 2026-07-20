import "server-only";
import { readDataJsonOrNull } from "@/lib/data/read";

/**
 * Server-side loaders for the normalized SF payees (public/data/us/sf/payees/*,
 * written by normalize_sf_payees.py). Only the top ~200 payees by lifetime
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

export type SfPayeePaperTrail = {
  identifier: string;
  title: string;
  year: number | null;
  pool: "sfpl" | "dl";
  snippet: string;
  url: string;
  deep_link: string;
  source_label: string;
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
  contracts_held: SfPayeeContract[];
  n_contracts_held: number;
  variants: SfPayeeVariant[];
  n_variants: number;
  merges: SfPayeeMerge[];
  paper_trail?: SfPayeePaperTrail[];
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
  const trail = readDataJsonOrNull<{ documents: SfPayeePaperTrail[] }>(
    `us/sf/dl_documents/payee-${slug}.json`,
  );
  return trail?.documents ? { ...fiche, paper_trail: trail.documents } : fiche;
}

/** Is this normalized-name keyed? Used to decide link vs plain text. */
const keyedSlugs = (): Set<string> => new Set(loadSfPayeesIndex().map((p) => p.slug));

export function payeeSlugIfKeyed(slug: string): string | null {
  return keyedSlugs().has(slug) ? slug : null;
}
