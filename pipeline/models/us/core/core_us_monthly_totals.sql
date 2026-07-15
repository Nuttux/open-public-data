-- =============================================================================
-- Core: US monthly receipts / outlays / budget balance since FY1981 (OBT)
--
-- Source: stg_us_mts_receipts_outlays_deficit_surplus (monthly, 1980-10-31+)
-- Grain:  (record_date, category_src).
--
-- UNIT CONVERSION: the source is in MILLIONS of dollars (the only synced
-- Fiscal Data table not in dollars) → amt_usd = mil_amt × 1,000,000.
--
-- SIGN CONVENTION (normalized here, per docs/us/API-RECON.md §B.6.2):
--   - As published, 'Deficit/Surplus (-)' = Outlays − Receipts
--     (deficit POSITIVE — flipped vs MTS Tables 3/5).
--   - `amt_usd` flips that row so category 'budget_balance'
--     = Receipts − Outlays: SURPLUS POSITIVE / DEFICIT NEGATIVE,
--     matching the MTS Table 5 'Total Surplus (+) or Deficit (-)' SL line.
--   - All other categories keep their published sign.
--   - `amt_millions_as_published` always keeps the source value untouched.
--
-- Known source anomalies (verified live 2026-07-15, encoded in the
-- tests/us/ deficit-identity test): published deficit ≠ outlays − receipts
-- by $270M on 2024-03-31 and $10M on 2022-09-30; every other month agrees
-- within $1M (millions rounding).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ ref('stg_us_mts_receipts_outlays_deficit_surplus') }}
)

SELECT
    record_date,
    fiscal_year,
    calendar_year,
    calendar_month,
    MOD(calendar_month + 2, 12) + 1     AS months_into_fiscal_year,
    amt_category                        AS category_src,
    CASE amt_category
        WHEN 'Receipts'                    THEN 'receipts'
        WHEN 'Outlays'                     THEN 'outlays'
        WHEN 'Deficit/Surplus (-)'         THEN 'budget_balance'
        WHEN 'Borrowing from the Public'   THEN 'borrowing_from_public'
        WHEN 'Reduction of Operating Cash' THEN 'reduction_of_operating_cash'
        WHEN 'By Other Means'              THEN 'by_other_means'
    END                                 AS category,
    mil_amt                             AS amt_millions_as_published,
    CASE
        WHEN amt_category = 'Deficit/Surplus (-)'
            THEN -mil_amt * 1000000  -- normalize: surplus positive
        ELSE mil_amt * 1000000
    END                                 AS amt_usd,
    'USD'                               AS unit,
    _synced_at
FROM source
