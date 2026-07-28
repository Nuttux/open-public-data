import "server-only";
import { readDataJsonOrNull } from "@/lib/data/read";

/**
 * Server-side loader for payment_breakdowns.json — one fiscal year's payments
 * cut by paying department, service area and kind of payee.
 *
 * The export holds every fiscal year; the client is handed ONE, the same way
 * the page already slices top_payees.json. Every dimension shares the fiscal
 * year's total as its denominator, so the page's lens toggle re-cuts a single
 * total rather than changing what is measured.
 */

export type BreakdownRow = {
  key: string;
  label: string;
  usd: number;
  nPayees: number;
  shareOfFy: number;
};

export type SfPaymentBreakdowns = {
  fiscalYear: number;
  totalUsd: number;
  dimensions: Record<"department" | "org_group" | "kind", BreakdownRow[]>;
  dimensionNotes: Record<"department" | "org_group" | "kind", string>;
  denominatorNote: string;
};

type RawRow = {
  key: string;
  label: string;
  usd: number;
  n_payees: number;
  share_of_fy: number;
};

type File = {
  dimension_notes: Record<string, string>;
  denominator_note: string;
  years: Record<
    string,
    { total_usd: number; dimensions: Record<string, RawRow[]> }
  >;
};

const DIMENSIONS = ["department", "org_group", "kind"] as const;

export function loadSfPaymentBreakdowns(fy: number): SfPaymentBreakdowns | null {
  const file = readDataJsonOrNull<File>("us/sf/payment_breakdowns.json");
  const year = file?.years[String(fy)];
  if (!file || !year) return null;

  const dimensions = {} as SfPaymentBreakdowns["dimensions"];
  const dimensionNotes = {} as SfPaymentBreakdowns["dimensionNotes"];
  for (const d of DIMENSIONS) {
    dimensions[d] = (year.dimensions[d] ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      usd: r.usd,
      nPayees: r.n_payees,
      shareOfFy: r.share_of_fy,
    }));
    dimensionNotes[d] = file.dimension_notes[d] ?? "";
  }

  return {
    fiscalYear: fy,
    totalUsd: year.total_usd,
    dimensions,
    dimensionNotes,
    denominatorNote: file.denominator_note,
  };
}
