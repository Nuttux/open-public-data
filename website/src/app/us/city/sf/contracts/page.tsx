import type { Metadata } from "next";
import "@/app/fusion.css";
import SfContractsClient from "./SfContractsClient";
import {
  loadSfContractDeptBars,
  loadSfContractPrimes,
  loadSfContractsActive,
  loadSfContractsOverview,
} from "./data";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { contractLabel } from "./us-sf-contracts-types";

/**
 * /us/city/sf/contracts — server component. Loads the pipeline exports and
 * the server-side aggregates over them (suppliers, departments, the three
 * signature contracts) and hands them to the client. EN-only (ADR-0010 D3);
 * `title.absolute` because the US side has no public brand yet.
 */
export const metadata: Metadata = {
  ...sectionAlternates("/us/city/sf/contracts", "en"),
  title: "San Francisco — Contracts",
  description:
    "San Francisco's supplier-contract register: what's active today, who the City buys from, what it buys, which departments sign, the sole-source lens and per-contract payment curves — from the SF Controller's open data.",
};

/**
 * What the page needs from the 5 000 active rows, summed here once. The rows
 * themselves (3.3 MB) used to travel inline in the HTML as a prop — 2.9 MB
 * pages that crawlers give up on. Now the search box fetches the JSON
 * export in the browser, and the server hands the client this digest.
 */
export type SfActiveDigest = {
  n_rows: number;
  rowsUrl: string;
  types: { raw: string; amount: number; count: number }[];
  authorities: { raw: string; amount: number; count: number }[];
  top: { contract_no: string; label: string; prime: string | null; agreed_usd: number }[];
  n_paid_exceeds_agreed: number;
  n_paid_exceeds_agreed_reconciled: number;
  n_title_clear: number;
};

function digest(active: ReturnType<typeof loadSfContractsActive>): SfActiveDigest {
  const sum = (key: (r: (typeof active.rows)[number]) => string | null | undefined) => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const r of active.rows) {
      const k = key(r);
      if (!k) continue;
      const cur = by.get(k) ?? { amount: 0, count: 0 };
      cur.amount += r.agreed_usd;
      cur.count += 1;
      by.set(k, cur);
    }
    return [...by.entries()].map(([raw, v]) => ({ raw, ...v }));
  };
  const top = [...active.rows].sort((a, b) => b.agreed_usd - a.agreed_usd).slice(0, 8);
  return {
    n_rows: active.n_rows,
    rowsUrl: "/data/us/sf/contracts_active.json",
    types: sum((r) => r.contract_type),
    authorities: sum((r) => r.authority_family),
    top: top.map((r) => ({ contract_no: r.contract_no, label: contractLabel(r), prime: r.prime ?? null, agreed_usd: r.agreed_usd })),
    n_paid_exceeds_agreed: active.rows.filter((r) => r.paid_exceeds_agreed).length,
    n_paid_exceeds_agreed_reconciled: active.rows.filter((r) => r.paid_exceeds_agreed && r.src_arithmetic_consistent === true).length,
    n_title_clear: active.rows.filter((r) => r.title_clear).length,
  };
}

export default function SfContractsPage() {
  const overview = loadSfContractsOverview();
  const active = digest(loadSfContractsActive());

  return (
    <SfContractsClient
      overview={overview}
      active={active}
      primes={loadSfContractPrimes()}
      deptBars={loadSfContractDeptBars()}
    />
  );
}
