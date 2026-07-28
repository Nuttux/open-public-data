/**
 * URL slug helpers for SF payroll entities — isomorphic (no fs), so the
 * payroll CLIENT can build links without pulling the loader (and node:fs)
 * into the browser bundle. Same split as sf-budget-slugs.ts.
 *
 * Family: slugified display family ("Health & Hospitals" ⇄ health-and-hospitals).
 * Dept:   the source's department code, lowercased ("POL" ⇄ "pol") — the same
 *         convention the budget uses, because both registers key on those
 *         codes (the payroll's department LABELS break at FY2017).
 * Area:   slugified service-area label; the source's organization_group_code
 *         is a bare ordinal ("01") that would make an unreadable URL.
 */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function familySlug(displayFamily: string): string {
  return slugify(displayFamily);
}

export const payrollDeptSlug = (code: string) => code.toLowerCase();
export const payrollDeptCodeFromSlug = (slug: string) => slug.toUpperCase();

export function areaSlug(organizationGroup: string): string {
  return slugify(organizationGroup);
}

/** A source job-family code's own label ("Park & Zoo" ⇄ park-and-zoo) — the
 *  rung below a display family, and the level the source actually codes on. */
export function roleSlug(familyLabel: string): string {
  return slugify(familyLabel);
}
