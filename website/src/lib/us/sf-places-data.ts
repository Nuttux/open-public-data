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
  snippet: string;
  url: string;
  deep_link: string;
  source_label: string;
};

export type SfPlaceContract = {
  contract_no: string;
  title: string;
  prime: string | null;
  department_code: string | null;
  agreed_usd: number | null;
  paid_usd: number | null;
  evidence: string;
};

export type SfPlaceBudgetLine = {
  code: string;
  name: string;
  total_usd: number;
  fiscal_year: number;
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
  photo: string | null;
  photo_credit: SfPlacePhotoCredit | null;
  summary_en: string | null;
  published: boolean;
  money: { budget_line: SfPlaceBudgetLine; contracts: SfPlaceContract[]; grants: unknown[] };
  documents: SfPlaceDoc[];
  dept_shelf: Array<{ identifier: string; title: string; year: number | null; pool: string; url: string }>;
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
};

type IndexFile = { count: number; places: SfPlaceIndexEntry[] };
type ReverseIndex = {
  places: string[];
  by_contract: Record<string, string>;
  by_dept: Record<string, string[]>;
};

export function loadSfPlacesIndex(): SfPlaceIndexEntry[] {
  const idx = readDataJsonOrNull<IndexFile>("us/sf/places/index.json");
  return idx?.places ?? [];
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
