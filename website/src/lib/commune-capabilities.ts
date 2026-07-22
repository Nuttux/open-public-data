import fs from "fs";
import path from "path";
import overridesRaw from "@/data/commune-overrides.json";
import { communeHasBudgetNature } from "@/lib/commune-budget";
import { communeHasMarches } from "@/lib/commune-marches";
import { communeHasInvestissements } from "@/lib/commune-investissements";
import { communeHasEvolution } from "@/lib/commune-evolution";

/**
 * Capability matrix — national-source-first, DATA-DERIVED.
 *
 * A page/layer renders IFF the data for that commune actually exists on disk
 * (the pipeline produced the export). Adding a source later (e.g. ingesting a
 * town's budget PDF) flips its layer on with ZERO edits here — nothing else
 * about the town changes. The registry (`commune-overrides.json`) carries only
 * intent/overrides (hide a page, mark WIP, pin a label); it is NEVER the source
 * of truth for "does this commune have X?".
 *
 * Capabilities are additive and monotonic: ingesting more data only ever ADDS
 * layers. "Rich" is a per-page/per-layer state, never a city label.
 *
 * Block 1 wires the `budget` capability (nature layer = DGFiP balances, national;
 * fonction layer = city budget file OR PDF extraction, upgrade). Later blocks add
 * marches / dette / fiscalite / subventions / investissements the same way.
 */

const DATA_DIR = path.join(process.cwd(), "public", "data");

type OverrideEntry = {
  hide?: string[];
  wip?: string[];
  label?: Record<string, string>;
};

const OVERRIDES: Record<string, OverrideEntry> =
  (overridesRaw as { overrides?: Record<string, OverrideEntry> }).overrides ?? {};

function dataFileExists(rel: string): boolean {
  try {
    return fs.existsSync(path.join(DATA_DIR, rel));
  } catch {
    return false;
  }
}

export type BudgetCapability = {
  /** National tier — DGFiP balances comptables, axe NATURE. Fires for every
   *  commune we ingested (all of them). */
  nature: boolean;
  /** Upgrade layer — budget par FONCTION (city budget file OR PDF extraction).
   *  No national source; present only where we extracted it. */
  fonction: boolean;
};

export type CommuneCapabilities = {
  slug: string;
  budget: BudgetCapability;
  /** National tier — marchés publics (DECP). Present iff the commune published
   *  procurement ≥ 40k€ (≈12.5k of 35k communes). */
  marches: boolean;
  /** National tier — investissements (DGFiP balances, section investissement). */
  investissements: boolean;
  /** National tier — évolution pluriannuelle (OFGL, ≥2 years). */
  evolution: boolean;
  /** True if the commune has at least one renderable page/layer. */
  any: boolean;
};

/** Path where the national budget-by-nature export lives for a commune. */
export function communeBudgetDir(slug: string): string {
  return `communes-budget/${slug}`;
}

export function getCommuneCapabilities(slug: string): CommuneCapabilities {
  const ov = OVERRIDES[slug] ?? {};
  const hidden = new Set(ov.hide ?? []);

  // Nature layer (national) is DATA-DERIVED from the committed manifest (slug →
  // years). The actual budget JSON lives in the bucket; the manifest is the
  // local, instant presence check — no per-request bucket probe.
  const nature = !hidden.has("budget") && communeHasBudgetNature(slug);

  // Derived from data presence too — a future mart_budget_fonction / PDF export
  // writes this file and the layer flips on with no code or registry edit.
  const fonction =
    !hidden.has("budget-fonction") &&
    dataFileExists(`${communeBudgetDir(slug)}/budget_fonction.json`);

  const budget: BudgetCapability = { nature, fonction };
  const marches = !hidden.has("marches") && communeHasMarches(slug);
  const investissements = !hidden.has("investissements") && communeHasInvestissements(slug);
  const evolution = !hidden.has("evolution") && communeHasEvolution(slug);
  return {
    slug,
    budget,
    marches,
    investissements,
    evolution,
    any: nature || fonction || marches || investissements || evolution,
  };
}
