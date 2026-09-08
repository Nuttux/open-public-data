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

export default function SfContractsPage() {
  const overview = loadSfContractsOverview();
  const active = loadSfContractsActive();

  return (
    <SfContractsClient
      overview={overview}
      active={active}
      primes={loadSfContractPrimes()}
      deptBars={loadSfContractDeptBars()}
    />
  );
}
