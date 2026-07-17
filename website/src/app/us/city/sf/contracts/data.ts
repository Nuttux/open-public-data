import fs from "node:fs";
import path from "node:path";
import type {
  SfContractFiche,
  SfContractsActive,
  SfContractsOverview,
} from "./us-sf-contracts-types";

/**
 * Server-side loaders for the SF contracts exports (same fs pattern as
 * /us/national and the France pages). Fiches are one JSON per contract_no
 * (a true key — Paris never had this luxury); a missing file means the
 * contract is outside the exported corpus (active ∪ sole-source ∪ top-500)
 * and the route 404s.
 */

const DATA_DIR = path.join(process.cwd(), "public", "data", "us", "sf");

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
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
