import path from "node:path";
import { readDataJson } from "@/lib/data/read";
import type {
  SfActiveRow,
  SfContractFiche,
  SfContractsActive,
  SfContractsOverview,
} from "./us-sf-contracts-types";
import { FAMILY_LABELS, typeSlug } from "./us-sf-contracts-types";
import type { SfContractTypeData } from "@/components/us/SfContractTypeFiche";
import type { SfDeptContractsData } from "@/components/us/SfDeptContractsFiche";
import type { SfAuthorityData } from "@/components/us/SfAuthorityFiche";
import { contractPrimePayeeSlug } from "@/lib/us/sf-payees-data";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfBudgetBreakdown,
} from "@/lib/us/sf-budget-data";
import { deptSlug, deptCodeFromSlug } from "@/lib/us/sf-budget-slugs";

/**
 * Server-side loaders for the SF contracts exports, reading through the
 * shared memoized public/data entry point (lib/data/read.ts). Fiches are
 * one JSON per contract_no (a true key — Paris never had this luxury); a
 * missing file means the contract is outside the exported corpus
 * (active ∪ sole-source ∪ top-500) and the route 404s.
 */

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

export function loadSfContractsOverview(): SfContractsOverview {
  return readJson<SfContractsOverview>("contracts_overview.json");
}

export function loadSfContractsActive(): SfContractsActive {
  return readJson<SfContractsActive>("contracts_active.json");
}

export function loadSfContractFiche(contractNo: string): SfContractFiche | null {
  // contract_no values are numeric strings (verified over the register) —
  // reject anything else before touching the filesystem.
  if (!/^[0-9]{1,12}$/.test(contractNo)) return null;
  try {
    return readJson<SfContractFiche>(path.join("contracts", "fiche", `${contractNo}.json`));
  } catch {
    return null;
  }
}

/**
 * A contract type as a navigable facet — register aggregate + the active
 * contracts carrying it, ranked by agreed amount. Returns null for an
 * unknown slug so the route 404s instead of rendering an empty fiche.
 */
export function loadSfContractType(slug: string): SfContractTypeData | null {
  const overview = loadSfContractsOverview();
  const row = overview.landscape.by_type.find((r) => typeSlug(r.contract_type) === slug);
  if (!row) return null;
  const active = loadSfContractsActive()
    .rows.filter((r) => r.contract_type === row.contract_type)
    .sort((a, b) => b.agreed_usd - a.agreed_usd);
  return {
    raw: row.contract_type,
    register: {
      n_contracts: row.n_contracts,
      agreed_usd: row.agreed_usd,
      paid_usd: row.paid_usd,
      share_of_register_agreed: row.share_of_register_agreed,
    },
    active,
    n_active: active.length,
    activeAgreedUsd: active.reduce((s, r) => s + r.agreed_usd, 0),
    nSoleSource: active.filter((r) => r.sole_source).length,
    source: { name: overview.source.name, source_url: overview.source.source_url },
  };
}

/** Every contract-type slug — for generateStaticParams and link validation. */
export function sfContractTypeSlugs(): string[] {
  return loadSfContractsOverview().landscape.by_type.map((r) => typeSlug(r.contract_type));
}

/* ── Suppliers ─────────────────────────────────────────────────────────── */

export type SfPrimeRow = {
  /** The register's own supplier string, verbatim (never re-spelled). */
  name: string;
  n_contracts: number;
  agreed_usd: number;
  paid_usd: number;
  n_sole: number;
  lbe: boolean;
  /** Biggest active contract of this prime — always a live link. */
  top_contract_no: string;
  /** Keyed recipient fiche when this prime is one of the top ~200 payees. */
  payee_slug: string | null;
};

export type SfPrimesData = {
  rows: SfPrimeRow[];
  /** Distinct named primes holding a contract active today. */
  n_primes: number;
  /** Agreed under contracts active today — the denominator of the shares. */
  active_agreed_usd: number;
  /** Share of that held by the ten biggest primes. */
  top10_share: number;
};

/**
 * Who the City buys from, among contracts active today — the register's
 * supplier column grouped by its own verbatim string. Deliberately scoped to
 * the ACTIVE portfolio (the same perimeter as the hero and the search): it is
 * the live commitment, and it is the only scope the active export supports.
 *
 * Lifetime dollars paid to a supplier are a different question with a
 * different answer, and they live on /us/city/sf/who-gets-paid.
 *
 * The register does not carry a supplier identifier, so nothing here merges
 * name variants — "MCKESSON CORPORATION" and "MCKESSON PLASMA AND BIOLOGICS
 * LLC" stay two rows, as the source has them.
 */
export function loadSfContractPrimes(topN = 12): SfPrimesData {
  const rows = loadSfContractsActive().rows;
  const byName = new Map<string, SfPrimeRow>();
  let activeAgreed = 0;
  for (const r of rows) {
    activeAgreed += r.agreed_usd;
    const name = (r.prime ?? "").trim();
    if (!name) continue;
    const cur = byName.get(name);
    if (!cur) {
      byName.set(name, {
        name,
        n_contracts: 1,
        agreed_usd: r.agreed_usd,
        paid_usd: r.paid_usd,
        n_sole: r.sole_source ? 1 : 0,
        lbe: r.lbe_prime,
        top_contract_no: r.contract_no,
        payee_slug: null,
      });
      continue;
    }
    cur.n_contracts += 1;
    cur.agreed_usd += r.agreed_usd;
    cur.paid_usd += r.paid_usd;
    if (r.sole_source) cur.n_sole += 1;
    if (r.lbe_prime) cur.lbe = true;
  }
  // Biggest single contract per prime, resolved in one pass over the rows
  // already sorted by agreed amount (the export guarantees that order).
  const biggest = new Map<string, string>();
  for (const r of rows) {
    const name = (r.prime ?? "").trim();
    if (!name || biggest.has(name)) continue;
    biggest.set(name, r.contract_no);
  }

  const ranked = [...byName.values()].sort((a, b) => b.agreed_usd - a.agreed_usd);
  const top = ranked.slice(0, topN).map((p) => {
    const contractNo = biggest.get(p.name) ?? p.top_contract_no;
    return {
      ...p,
      top_contract_no: contractNo,
      // Reverse-resolved through the payee export's prime-joined
      // contracts_held — no name matching, so no wrong link.
      payee_slug: contractPrimePayeeSlug(contractNo),
    };
  });

  const top10 = ranked.slice(0, 10).reduce((s, p) => s + p.agreed_usd, 0);
  return {
    rows: top,
    n_primes: byName.size,
    active_agreed_usd: activeAgreed,
    top10_share: activeAgreed > 0 ? top10 / activeAgreed : 0,
  };
}

/* ── Signature scene ───────────────────────────────────────────────────── */

export type SfSignatureItem = {
  kind: "biggest" | "overrun" | "sole";
  row: SfActiveRow;
  /** Dollars paid beyond the agreed amount (`overrun` only). */
  overrun_usd: number | null;
};

/**
 * Three real contracts, picked by fixed rules over the active portfolio —
 * the Paris `MarchesSignature` move: materiality before percentages. No
 * editorial choice is made here; each pick is an argmax, and a contract
 * already shown never appears twice (the biggest commitment also carries the
 * biggest overrun, so the overrun slot falls through to the next one).
 */
export function loadSfContractsSignature(): SfSignatureItem[] {
  const rows = loadSfContractsActive().rows;
  const out: SfSignatureItem[] = [];
  const taken = new Set<string>();

  const pick = (
    kind: SfSignatureItem["kind"],
    pool: SfActiveRow[],
    score: (r: SfActiveRow) => number,
  ) => {
    let best: SfActiveRow | null = null;
    let bestScore = -Infinity;
    for (const r of pool) {
      if (taken.has(r.contract_no)) continue;
      const s = score(r);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }
    if (!best) return;
    taken.add(best.contract_no);
    out.push({
      kind,
      row: best,
      overrun_usd: kind === "overrun" ? best.paid_usd - best.agreed_usd : null,
    });
  };

  pick("biggest", rows, (r) => r.agreed_usd);
  pick(
    "overrun",
    rows.filter((r) => r.paid_exceeds_agreed),
    (r) => r.paid_usd - r.agreed_usd,
  );
  pick(
    "sole",
    rows.filter((r) => r.sole_source),
    (r) => r.agreed_usd,
  );
  return out;
}

/* ── Departments as a contracts facet ──────────────────────────────────── */

/** Departments buying today, ranked by agreed dollars on active contracts. */
export type SfDeptBar = {
  code: string;
  name: string;
  n_contracts: number;
  agreed_usd: number;
  paid_usd: number;
  n_sole: number;
};

type DeptAgg = SfDeptBar & { rows: SfActiveRow[] };

/**
 * Groups the active portfolio by the register's department CODE. The code is
 * the identity: the register carries two spellings for DPW ("DPW Public
 * Works", "DPW GSA - Public Works") and they are the same department.
 */
function activeByDept(): Map<string, DeptAgg> {
  const out = new Map<string, DeptAgg>();
  const nameVotes = new Map<string, Map<string, number>>();
  for (const r of loadSfContractsActive().rows) {
    const code = r.department_code;
    // UNMAPPED_DEPTS is the source's own catch-all bucket, not a department:
    // it gets no facet page. Its contracts stay searchable and keep their
    // own fiches — only the department lens skips them.
    if (!code || code === "UNMAPPED_DEPTS") continue;
    const cur = out.get(code);
    if (!cur) {
      out.set(code, {
        code,
        name: r.department ?? code,
        n_contracts: 1,
        agreed_usd: r.agreed_usd,
        paid_usd: r.paid_usd,
        n_sole: r.sole_source ? 1 : 0,
        rows: [r],
      });
    } else {
      cur.n_contracts += 1;
      cur.agreed_usd += r.agreed_usd;
      cur.paid_usd += r.paid_usd;
      if (r.sole_source) cur.n_sole += 1;
      cur.rows.push(r);
    }
    if (r.department) {
      const votes = nameVotes.get(code) ?? new Map<string, number>();
      votes.set(r.department, (votes.get(r.department) ?? 0) + 1);
      nameVotes.set(code, votes);
    }
  }
  // Most frequent spelling wins, so the merged code shows one stable label.
  for (const [code, votes] of nameVotes) {
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const agg = out.get(code);
    if (agg && best) agg.name = best[0];
  }
  return out;
}

export function loadSfContractDeptBars(topN = 10): SfDeptBar[] {
  return [...activeByDept().values()]
    .map(({ rows: _rows, ...bar }) => bar)
    .sort((a, b) => b.agreed_usd - a.agreed_usd)
    .slice(0, topN);
}

/** Budget fiche href for a department code, or null when the budget breakdown
 *  has no such department (the two registers do not cover the same list). */
export function sfDeptBudgetHref(code: string): string | null {
  const fy = defaultFiscalYear(loadSfBudgetByYear());
  const breakdown = loadSfBudgetBreakdown(fy);
  const hit = breakdown?.departments.spending.find((d) => d.code === code);
  return hit ? `/usa/san-francisco/budget/dept/${deptSlug(hit.code)}?year=${fy}` : null;
}

/**
 * A department as a CONTRACTS facet — what it buys, from whom, and how much
 * of it was signed without a bid. Sibling of `loadSfContractType`; the point
 * is that clicking a department inside the contracts page stays inside
 * contracts, and the department's budget is one clearly-labelled link away
 * rather than the destination.
 */
export function loadSfContractDept(slug: string): SfDeptContractsData | null {
  if (!/^[a-z0-9-]{1,12}$/.test(slug)) return null;
  const code = deptCodeFromSlug(slug);
  const agg = activeByDept().get(code);
  if (!agg) return null;

  const overview = loadSfContractsOverview();
  // The overview's department list is a top-N with one row per spelling —
  // sum every row carrying this code, or report nothing when it is absent.
  const registerRows = overview.departments.filter((d) => d.department_code === code);
  const register = registerRows.length
    ? {
        n_contracts: registerRows.reduce((s, d) => s + d.n_contracts, 0),
        agreed_usd: registerRows.reduce((s, d) => s + d.agreed_usd, 0),
        paid_usd: registerRows.reduce((s, d) => s + d.paid_usd, 0),
      }
    : null;
  const soleRow = overview.sole_source.by_department.find((d) => d.department_code === code) ?? null;

  const active = agg.rows.slice().sort((a, b) => b.agreed_usd - a.agreed_usd);
  const primeAgg = new Map<string, { name: string; n_contracts: number; agreed_usd: number }>();
  for (const r of active) {
    const name = (r.prime ?? "").trim();
    if (!name) continue;
    const cur = primeAgg.get(name);
    if (cur) {
      cur.n_contracts += 1;
      cur.agreed_usd += r.agreed_usd;
    } else {
      primeAgg.set(name, { name, n_contracts: 1, agreed_usd: r.agreed_usd });
    }
  }

  return {
    code,
    slug,
    name: agg.name,
    register,
    sole: soleRow
      ? {
          n_sole: soleRow.n_sole,
          sole_agreed_usd: soleRow.sole_agreed_usd,
          share_of_dept_contracts: soleRow.share_of_dept_contracts,
          share_of_dept_agreed: soleRow.share_of_dept_agreed,
        }
      : null,
    active,
    n_active: active.length,
    activeAgreedUsd: agg.agreed_usd,
    activePaidUsd: agg.paid_usd,
    nSoleActive: agg.n_sole,
    primes: [...primeAgg.values()].sort((a, b) => b.agreed_usd - a.agreed_usd).slice(0, 6),
    budgetHref: sfDeptBudgetHref(code),
    source: { name: overview.source.name, source_url: overview.source.source_url },
  };
}

/* ── Purchasing authority as a facet ───────────────────────────────────── */

/** Display labels live in us-sf-contracts-types (FAMILY_LABELS); this is the
 *  server-side lookup that turns a family key into a fiche. */
export function loadSfContractAuthority(family: string): SfAuthorityData | null {
  if (!/^[a-z_]{1,40}$/.test(family)) return null;
  const overview = loadSfContractsOverview();
  const row = overview.authority_families.families.find((f) => f.family === family);
  if (!row) return null;
  const totalAgreed = overview.authority_families.families.reduce((s, f) => s + f.agreed_usd, 0);

  const active = loadSfContractsActive()
    .rows.filter((r) => r.authority_family === family)
    .sort((a, b) => b.agreed_usd - a.agreed_usd);

  // The register's own wordings for this family, read off the fiche corpus so
  // the reader can see exactly what was grouped together.
  const strings = new Set<string>();
  for (const r of active.slice(0, 400)) {
    const fiche = loadSfContractFiche(r.contract_no);
    const s = fiche?.contract.purchasing_authority?.trim();
    if (s) strings.add(s);
  }

  return {
    family,
    label: FAMILY_LABELS[family] ?? family,
    register: {
      n_contracts: row.n_contracts,
      agreed_usd: row.agreed_usd,
      share_of_register: totalAgreed > 0 ? row.agreed_usd / totalAgreed : 0,
    },
    strings: [...strings].sort(),
    active,
    n_active: active.length,
    activeAgreedUsd: active.reduce((s, r) => s + r.agreed_usd, 0),
    source: { name: overview.source.name, source_url: overview.source.source_url },
  };
}

export function sfAuthorityFamilies(): string[] {
  return loadSfContractsOverview().authority_families.families.map((f) => f.family);
}

/** Every department slug with an active contract — generateStaticParams. */
export function sfContractDeptSlugs(): string[] {
  return [...activeByDept().keys()].map(deptSlug);
}

/**
 * Href of a department's contracts fiche, or null when that department holds
 * no contract active today (the facet is built on the active portfolio, so
 * an expired contract's department may have no page). Validated against the
 * same map the route reads — no dead link can be rendered.
 */
export function sfContractDeptHref(code: string | null | undefined): string | null {
  if (!code || !activeByDept().has(code)) return null;
  return `/usa/san-francisco/contracts/dept/${deptSlug(code)}`;
}
