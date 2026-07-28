import "server-only";
import { readDataJsonOrNull } from "@/lib/data/read";
import { defaultFiscalYear, loadSfBudgetByYear, loadSfBudgetBreakdown } from "@/lib/us/sf-budget-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";

/**
 * The link maps the payee-side surfaces need in order to be navigable:
 * raw vendor string → payee-fiche slug, department code → budget-fiche href,
 * and sub-object code → category-fiche slug.
 *
 * Extracted because each is needed from more than one route — the category
 * fiche renders from both the full page and the intercepted drawer, and the
 * payee fiche does the same. Building them per route lets the two drift: a
 * link live in the drawer and dead on a hard load, which nobody notices until
 * a shared URL lands somewhere.
 *
 * Every map is VALIDATED against a real source: a vendor absent from the slug
 * map is not keyed and must render as plain text, a department absent from the
 * budget breakdown gets no href, and a category with no fiche gets no slug.
 * None of them ever fabricates a URL.
 */

export function loadSfVendorSlugMap(): Record<string, string> {
  return readDataJsonOrNull<Record<string, string>>("us/sf/payees/_vendor_slug_map.json") ?? {};
}

export function loadSfDeptHrefs(): Record<string, string> {
  const budgetFy = defaultFiscalYear(loadSfBudgetByYear());
  const deptHrefs: Record<string, string> = {};
  for (const dep of loadSfBudgetBreakdown(budgetFy)?.departments.spending ?? []) {
    deptHrefs[dep.code] = `/us/city/sf/budget/dept/${deptSlug(dep.code)}?year=${budgetFy}`;
  }
  return deptHrefs;
}

/**
 * Sub-object code → category-fiche slug, for the categories that HAVE a fiche.
 * Mirrors sfCategorySlugs(): only a category the export gave a drill list to
 * is reachable, so a payee's rarest category renders as text rather than as a
 * link to a page that would 404 at build time.
 */
type MinimalSpendingFile = {
  years: Record<string, { code: string; label: string; top_payees?: unknown[] }[]>;
};

export function loadSfCategorySlugMap(): Record<string, string> {
  const file = readDataJsonOrNull<MinimalSpendingFile>("us/sf/spending_subobjects.json");
  if (!file) return {};

  // Same ambiguity rule as sf-spending.categoryIndex: append the accounting
  // code only where two codes share a label.
  const codesByLabel = new Map<string, Set<string>>();
  for (const rows of Object.values(file.years)) {
    for (const r of rows) {
      const key = r.label ?? r.code;
      if (!codesByLabel.has(key)) codesByLabel.set(key, new Set());
      codesByLabel.get(key)!.add(r.code);
    }
  }

  const out: Record<string, string> = {};
  for (const rows of Object.values(file.years)) {
    for (const r of rows) {
      if (!(r.top_payees?.length ?? 0)) continue; // no fiche → no link
      const key = r.label ?? r.code;
      const base = key
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70);
      out[r.code] =
        (codesByLabel.get(key)?.size ?? 1) > 1 ? `${base}-${r.code.toLowerCase()}` : base;
    }
  }
  return out;
}

export function loadSfCategoryLinks(): {
  vendorSlugMap: Record<string, string>;
  deptHrefs: Record<string, string>;
} {
  return { vendorSlugMap: loadSfVendorSlugMap(), deptHrefs: loadSfDeptHrefs() };
}
