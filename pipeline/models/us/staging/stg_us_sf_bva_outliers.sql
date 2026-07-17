-- =============================================================================
-- Staging: SF budget-vs-actual structural outliers — one-to-one with seed
--
-- Source: seed_us_sf_bva_outliers (Block 1, 2026-07-16)
--
-- GEN (+73.2% FY2024) and PUC (−42.4% FY2024) dominate a naive dept-level
-- budget-vs-actual table, but both deviations are PERIMETER ARTIFACTS
-- (citywide unallocated bucket / fund structure), not execution stories —
-- measured live on mart_us_sf_budget_vs_actual_dept, 2026-07-16 (see
-- docs/us/block-studies/1-budget.md §4). Without the annotation the top
-- rows of the table discredit the page.
-- =============================================================================

SELECT
    department_code,
    side,
    is_structural_outlier,
    outlier_note,
    provenance,
    noted_at
FROM {{ ref('seed_us_sf_bva_outliers') }}
