-- =============================================================================
-- Core: US federal outlays by budget function (row-level OBT)
--
-- Source: stg_us_mts_table_9, extraction recipe verified in
--         docs/us/API-RECON.md §B.1: data_type_cd = 'D' AND record_type_cd = 'F'
--         (19 budget functions per month; S headers carry no amounts and
--         T totals double-count if summed with D).
-- Grain:  (record_date, function_desc) — monthly since 2015-03-31.
--
-- Amounts are CASH outlays in DOLLARS (official deficit math — do not mix
-- with USAspending obligations). Negative rows are real (offsetting
-- receipts, e.g. 'Undistributed Offsetting Receipts', and occasionally
-- 'Commerce and Housing Credit').
--
-- Identity guaranteed by tests/us/: Σ(this model per record_date)
-- = Table 9 outlays T-row = Table 5 'Total Outlays' SL row.
-- =============================================================================

WITH t9 AS (
    SELECT *
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'D'
      AND record_type_cd = 'F'
)

SELECT
    record_date,
    fiscal_year,
    calendar_year,
    calendar_month,
    -- Month position inside the US fiscal year (Oct=1 ... Sep=12):
    -- FYTD figures through this record_date cover this many months.
    MOD(calendar_month + 2, 12) + 1     AS months_into_fiscal_year,
    classification_desc                 AS function_desc,
    line_code_nbr,
    src_line_nbr,
    current_month_amt                   AS current_month_outlay_amt,
    current_fytd_amt                    AS current_fytd_outlay_amt,
    prior_fytd_amt                      AS prior_fytd_outlay_amt,
    'USD'                               AS unit,
    _synced_at
FROM t9
