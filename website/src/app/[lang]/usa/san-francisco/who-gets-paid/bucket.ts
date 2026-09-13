/**
 * Bucket → color and label-key map for who-gets-paid.
 *
 * Categorical identity palette, validated 2026-07-16 with the dataviz
 * six-checks script against the fusion light surface (#fafaf7), all-pairs
 * mode: worst CVD ΔE 13.0, worst normal-vision ΔE 16.3 — PASS. The two
 * sub-3:1-contrast hues (magenta, yellow) are legal under the relief rule:
 * every mark carries its bucket as a text chip, so color is never the
 * identity channel. fiscal_agent and payroll_passthrough share one violet
 * deliberately — same "money passing through" family, both excluded from
 * the default view, distinguished by their text labels.
 *
 * Color follows the BUCKET (the entity's class), never rank or view —
 * toggling the pass-through filter must not repaint surviving rows.
 */

export const BUCKET_COLOR: Record<string, string> = {
  supplier: "#2a78d6",
  nonprofit: "#008300",
  healthcare: "#e87ba4",
  other: "#eda100",
  fiscal_agent_debt_service: "#4a3aa7",
  payroll_passthrough: "#4a3aa7",
  person: "#9099a6",
};

export const UNCLASSIFIED_COLOR = "#9099a6";

export function bucketColor(bucket: string | null | undefined): string {
  if (!bucket) return UNCLASSIFIED_COLOR;
  return BUCKET_COLOR[bucket] ?? UNCLASSIFIED_COLOR;
}

export function bucketLabelKey(bucket: string): string {
  return `us.sf.wgp.bucket.${bucket}`;
}

/** Strip DataSF's leading department code ("HOM Homelessness Services" →
 *  "Homelessness Services") for display. Pure label cosmetics — amounts
 *  and keys always use the raw string. */
export function deptDisplay(department: string | null | undefined): string {
  if (!department) return "—";
  return department.replace(/^[A-Z]{2,4}\s+/, "");
}
