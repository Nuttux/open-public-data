import { describe, expect, it, vi } from "vitest";

// Mock the JSON before importing the SUT — methodology.ts evaluates module-
// level constants (PARIS_POPULATION, etc.) at import time, so the mock has
// to be in place before we import.
vi.mock("@/data/methodology.json", () => ({
  default: {
    generated_at: "2026-01-01T00:00:00Z",
    source_pipeline: "test",
    audit_promise: "test",
    city: {
      paris_population: { value: 2_100_000, unit: "habitants", date_reference: "2024" },
      paris_superficie_km2: { value: 105.4, unit: "km2", date_reference: "2024" },
      paris_nb_arrondissements: { value: 20, unit: "count", date_reference: "2024" },
      paris_sru_ratio: { value: 24.5, unit: "pct", date_reference: "2024-12-31" },
      paris_sru_target: { value: 25, unit: "pct", date_reference: "2013-01-18" },
      paris_sru_year: { value: 2024, unit: "year", date_reference: "2024-12-31" },
      paris_sru_stock_total: { value: 258400, unit: "logements", date_reference: "2024-12-31" },
      paris_bailleur_share_paris_habitat: { value: 49, unit: "pct", date_reference: "2024-12-31" },
      paris_bailleur_share_rivp: { value: 18, unit: "pct", date_reference: "2024-12-31" },
      paris_bailleur_share_elogie_siemp: { value: 14, unit: "pct", date_reference: "2024-12-31" },
      paris_bailleur_share_icf_habitat: { value: 7, unit: "pct", date_reference: "2024-12-31" },
      paris_bailleur_share_3f_residences: { value: 6, unit: "pct", date_reference: "2024-12-31" },
      paris_bailleur_share_autres: { value: 6, unit: "pct", date_reference: "2024-12-31" },
    },
    legal_thresholds: {
      capacite_desendettement_alerte_ans: { value: 10, unit: "années", date_reference: "2024" },
      capacite_desendettement_critique_ans: { value: 12, unit: "années", date_reference: "2024" },
      leverage_recettes_max: { value: 1.0, unit: "ratio", date_reference: "2024" },
      borrow_ratio_max: { value: 1.2, unit: "ratio", date_reference: "2024" },
    },
    editorial_params: {
      timeline_axis_start: { value: 2010, unit: "year", date_reference: "2024" },
      timeline_axis_end: { value: 2026, unit: "year", date_reference: "2024" },
    },
    paris_debt_snapshots: {
      description: "test snapshots",
      unit: "années",
      by_year: {
        "2018": { value_crc_ans: 7.2, source_crc: "CRC 2018", source_url_crc: "https://x", date_reference: "2018-12-31" },
        "2020": { value_crc_ans: 9.5, source_crc: "CRC 2020", source_url_crc: "https://y", date_reference: "2020-12-31" },
        "2023": { value_crc_ans: 14.0, source_crc: "CRC 2023", source_url_crc: "https://z", date_reference: "2023-12-31" },
      },
    },
  },
}));

const { parisCrcDebtYearsFor } = await import("./methodology");

describe("parisCrcDebtYearsFor", () => {
  it("returns the exact-match snapshot when the year is present", () => {
    expect(parisCrcDebtYearsFor(2020)?.value_crc_ans).toBe(9.5);
    expect(parisCrcDebtYearsFor(2023)?.source_crc).toBe("CRC 2023");
  });

  it("falls back to the most recent year ≤ requested when missing", () => {
    // 2022 not in the map → should return 2020 (the closest year ≤ 2022).
    expect(parisCrcDebtYearsFor(2022)?.value_crc_ans).toBe(9.5);
    // 2025 not in the map → should return 2023.
    expect(parisCrcDebtYearsFor(2025)?.value_crc_ans).toBe(14.0);
  });

  it("returns null when no snapshot is older or equal", () => {
    // 2010 is before any snapshot in the map.
    expect(parisCrcDebtYearsFor(2010)).toBeNull();
  });
});
