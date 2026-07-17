-- BINDING Block-2 guard (SF-BUILD-PLAN §Block 2): bucket-classification
-- coverage in the latest non-in-progress fiscal year must stay ≥ 60% of
-- vendor-attributed dollars. Measured at seed v2 (2026-07-16): FY2025
-- 65.6%, FY2026 64.0% — vs ~26-32% pre-2018, where the page renders a
-- coverage badge instead. If a data refresh (new top vendors, renamed
-- strings) drops coverage below the floor, extend the exact-string seed —
-- do not loosen this test.
{{ config(tags=['us', 'seed_quality']) }}

WITH latest AS (
    SELECT MAX(fiscal_year) AS fy
    FROM {{ ref('mart_us_sf_payees_by_fy') }}
    WHERE execution_status != 'in_progress'
)

SELECT
    fiscal_year,
    execution_status,
    bucket_coverage_pct
FROM {{ ref('mart_us_sf_payees_by_fy') }}
WHERE fiscal_year = (SELECT fy FROM latest)
  AND (bucket_coverage_pct IS NULL OR bucket_coverage_pct < 0.60)
