-- MTS monthly long-series self-check: published 'Deficit/Surplus (-)'
-- = Outlays − Receipts per record_date (source sign convention, millions).
-- Tolerance ±$2M (values are rounded to millions).
--
-- Two documented SOURCE anomalies are excluded (verified live 2026-07-15
-- against api.fiscaldata.treasury.gov — the published deficit disagrees
-- with outlays − receipts in the source itself, not in our pipeline):
--   - 2024-03-31: off by $270M
--   - 2022-09-30: off by  $10M
-- Every other month across 1980-10 → 2026-06 agrees within $1M.
{{ config(tags=['us', 'accounting_balance']) }}

WITH pivoted AS (
    SELECT
        record_date,
        SUM(CASE WHEN amt_category = 'Receipts' THEN mil_amt END)            AS receipts,
        SUM(CASE WHEN amt_category = 'Outlays' THEN mil_amt END)             AS outlays,
        SUM(CASE WHEN amt_category = 'Deficit/Surplus (-)' THEN mil_amt END) AS deficit_published
    FROM {{ ref('stg_us_mts_receipts_outlays_deficit_surplus') }}
    WHERE record_date NOT IN (DATE '2024-03-31', DATE '2022-09-30')  -- documented source anomalies
    GROUP BY record_date
)

SELECT
    record_date,
    receipts,
    outlays,
    deficit_published,
    (outlays - receipts) - deficit_published AS diff_millions
FROM pivoted
WHERE receipts IS NULL
   OR outlays IS NULL
   OR deficit_published IS NULL
   OR ABS((outlays - receipts) - deficit_published) > 2
