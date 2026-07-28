import { readDataJsonOrNull } from "@/lib/data/read";

/**
 * "What the City buys" — the sub-object spending mart, sliced to one year.
 *
 * The export is a few MB (400 sub-objects × 10 fiscal years, the top purchase
 * categories carrying their drill list) and is read SERVER-SIDE only; the
 * client receives the handful of rows the section shows. Same pattern as the
 * payroll dept × family grain.
 */

export type SpendClass = "purchase" | "obligation" | "ledger" | "unclear";

export type SubObjectPayee = {
  vendor: string;
  department: string | null;
  department_code: string | null;
  amount_usd: number;
};

export type SubObjectRow = {
  code: string;
  label: string;
  spend_class: SpendClass;
  paid_usd: number;
  n_vendors: number;
  n_departments: number;
  share_of_year: number;
  share_of_class: number;
  exemplar: SubObjectPayee | null;
  /** Drill list behind a clicked category — the same ranking as the exemplar,
   *  which is by construction its first row, so the panel can never
   *  contradict the segment above it. Emitted only for the top purchase
   *  categories (the only ones the page lets a reader open). */
  top_payees: SubObjectPayee[];
  /** Payees ranked in this category BEFORE the top-8 cut, so the panel states
   *  what it is not showing instead of implying the list is complete. */
  n_payees_ranked: number;
};

type SpendingFile = {
  perimeter: string;
  class_definitions: Record<SpendClass, string>;
  classification_note: string;
  exemplar_note: string;
  source: { name: string | null; source_url: string | null };
  class_totals: Record<string, Partial<Record<SpendClass, number>>>;
  years: Record<string, SubObjectRow[]>;
};

export type SfSpendingSection = {
  fiscalYear: number;
  /** Purchase categories, biggest first, each carrying the slug of its fiche.
   *  The slug is resolved HERE and not in the client: whether a label needs
   *  its accounting code appended depends on whether another code shares that
   *  label anywhere in the file, which a component holding one year's rows
   *  cannot know — it would mint a 404 for exactly the ambiguous cases. */
  purchases: (SubObjectRow & { slug: string })[];
  nPurchaseCategories: number;
  totals: Partial<Record<SpendClass, number>>;
  totalAll: number;
  classDefinitions: Record<SpendClass, string>;
  perimeter: string;
  classificationNote: string;
  exemplarNote: string;
  source: { name: string | null; source_url: string | null };
};

/**
 * Fiscal years whose books are CLOSED, from the payees export's own
 * execution_status enum. The spending file carries no status of its own, and
 * a category fiche must not default to a year that is two weeks old.
 */
function sfClosedFiscalYears(): Set<number> {
  const file = readDataJsonOrNull<{
    years: Record<string, { execution_status: string }>;
  }>("us/sf/top_payees.json");
  const out = new Set<number>();
  for (const [fy, y] of Object.entries(file?.years ?? {})) {
    if (y.execution_status === "closed") out.add(Number(fy));
  }
  return out;
}

/* ── Category facet ────────────────────────────────────────────────────────
   A spending category is a place you can navigate INTO, the way a contract
   type is (/contracts/type/[slug] → SfContractTypeFiche). Before this, a
   category was a row that dead-ended: the reader could see that the City
   spent $1.6B on construction contracts and had nowhere to click. */

/** URL slug for a category. Label-based like contracts' typeSlug, with the
 *  accounting code appended only where two codes share a label — so the
 *  common case stays readable and the rare collision stays addressable. */
export function categorySlug(label: string, code: string, ambiguous = false): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return ambiguous ? `${base}-${code.toLowerCase()}` : base;
}

export type SfCategoryData = {
  slug: string;
  code: string;
  label: string;
  spendClass: SpendClass;
  classDefinition: string;
  fiscalYear: number;
  paidUsd: number;
  shareOfClass: number;
  shareOfYear: number;
  nVendors: number;
  nDepartments: number;
  topPayees: SubObjectPayee[];
  nPayeesRanked: number;
  /** FY → paid, every year this category exists (FY2018+). */
  series: { year: number; value: number }[];
  perimeter: string;
  classificationNote: string;
  exemplarNote: string;
  source: { name: string | null; source_url: string | null };
};

/** Build slug → (code) once per process; labels are stable within FY2018+. */
function categoryIndex(file: SpendingFile): Map<string, string> {
  const labelCounts = new Map<string, Set<string>>();
  for (const rows of Object.values(file.years)) {
    for (const r of rows) {
      const key = r.label ?? r.code;
      if (!labelCounts.has(key)) labelCounts.set(key, new Set());
      labelCounts.get(key)!.add(r.code);
    }
  }
  const out = new Map<string, string>();
  for (const rows of Object.values(file.years)) {
    for (const r of rows) {
      const key = r.label ?? r.code;
      const ambiguous = (labelCounts.get(key)?.size ?? 1) > 1;
      out.set(categorySlug(key, r.code, ambiguous), r.code);
    }
  }
  return out;
}

/** Only categories a reader can actually reach get a page: the export carries
 *  the drill list for the top purchase categories, and a facet with no payees
 *  to show would be an empty room. */
export function sfCategorySlugs(): string[] {
  const file = readDataJsonOrNull<SpendingFile>("us/sf/spending_subobjects.json");
  if (!file) return [];
  const index = categoryIndex(file);
  const drillable = new Set<string>();
  for (const rows of Object.values(file.years)) {
    for (const r of rows) if ((r.top_payees?.length ?? 0) > 0) drillable.add(r.code);
  }
  return [...index.entries()].filter(([, code]) => drillable.has(code)).map(([slug]) => slug);
}

export function loadSfCategory(slug: string, requestedFy?: number): SfCategoryData | null {
  const file = readDataJsonOrNull<SpendingFile>("us/sf/spending_subobjects.json");
  if (!file) return null;
  const code = categoryIndex(file).get(slug);
  if (!code) return null;

  const years = Object.keys(file.years).map(Number).sort((a, b) => a - b);
  const series: { year: number; value: number }[] = [];
  const rowByFy = new Map<number, SubObjectRow>();
  for (const fy of years) {
    const row = (file.years[String(fy)] ?? []).find((r) => r.code === code);
    if (!row) continue;
    series.push({ year: fy, value: row.paid_usd });
    rowByFy.set(fy, row);
  }
  if (rowByFy.size === 0) return null;

  // Year selection, in order:
  //   1. the year the caller asked for — the one the reader was looking at
  //      when they clicked. Without this the fiche silently answered about a
  //      different year: a row reading $1.6B (FY2025) opened a fiche headed
  //      $19.5M, because the newest year carrying a drill list was FY2027,
  //      two weeks into a fiscal year that has barely started.
  //   2. the latest CLOSED fiscal year, so a direct URL never lands on a
  //      part-year total presented as a year.
  //   3. the last year with any data at all.
  const closed = sfClosedFiscalYears();
  const fallback =
    [...rowByFy.keys()].filter((fy) => closed.has(fy)).pop() ?? [...rowByFy.keys()].pop()!;
  const fy = requestedFy != null && rowByFy.has(requestedFy) ? requestedFy : fallback;
  const row = rowByFy.get(fy)!;

  return {
    slug,
    code: row.code,
    label: row.label ?? row.code,
    spendClass: row.spend_class,
    classDefinition: file.class_definitions[row.spend_class],
    fiscalYear: fy,
    paidUsd: row.paid_usd,
    shareOfClass: row.share_of_class,
    shareOfYear: row.share_of_year,
    nVendors: row.n_vendors,
    nDepartments: row.n_departments,
    topPayees: row.top_payees ?? [],
    nPayeesRanked: row.n_payees_ranked ?? 0,
    series,
    perimeter: file.perimeter,
    classificationNote: file.classification_note,
    exemplarNote: file.exemplar_note,
    source: file.source,
  };
}

/** Latest fiscal year present, or the requested one when it exists. */
export function loadSfSpendingSection(
  requestedFy?: number,
  topN = 12,
): SfSpendingSection | null {
  const file = readDataJsonOrNull<SpendingFile>("us/sf/spending_subobjects.json");
  if (!file) return null;
  const years = Object.keys(file.years).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return null;
  const fy =
    requestedFy != null && years.includes(requestedFy) ? requestedFy : years[years.length - 1];
  const rows = file.years[String(fy)] ?? [];
  const slugByCode = new Map([...categoryIndex(file)].map(([slug, code]) => [code, slug]));
  const purchases = rows
    .filter((r) => r.spend_class === "purchase")
    .sort((a, b) => b.paid_usd - a.paid_usd)
    .map((r) => ({ ...r, slug: slugByCode.get(r.code) ?? categorySlug(r.label ?? r.code, r.code) }));
  const totals = file.class_totals[String(fy)] ?? {};
  return {
    fiscalYear: fy,
    purchases: purchases.slice(0, topN),
    nPurchaseCategories: purchases.length,
    totals,
    totalAll: Object.values(totals).reduce((s, v) => s + (v ?? 0), 0),
    classDefinitions: file.class_definitions,
    perimeter: file.perimeter,
    classificationNote: file.classification_note,
    exemplarNote: file.exemplar_note,
    source: file.source,
  };
}
