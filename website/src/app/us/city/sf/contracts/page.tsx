import type { Metadata } from "next";
import "@/app/fusion.css";
import SfContractsClient from "./SfContractsClient";
import { loadSfContractsActive, loadSfContractsOverview } from "./data";

/**
 * /us/city/sf/contracts — server component. Loads the pipeline exports and
 * hands them to the client. EN-only (ADR-0010 D3); `title.absolute` because
 * the US side has no public brand yet.
 */
export const metadata: Metadata = {
  title: "San Francisco — Contracts",
  description:
    "San Francisco's supplier-contract register: what's active today, grants the City gives out, the sole-source lens, LBE participation and per-contract payment curves — from the SF Controller's open data.",
};

export default function SfContractsPage() {
  const overview = loadSfContractsOverview();
  const active = loadSfContractsActive();
  return <SfContractsClient overview={overview} active={active} />;
}
