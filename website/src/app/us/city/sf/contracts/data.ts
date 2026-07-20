import path from "node:path";
import { readDataJson } from "@/lib/data/read";
import type {
  SfContractFiche,
  SfContractsActive,
  SfContractsOverview,
} from "./us-sf-contracts-types";

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
