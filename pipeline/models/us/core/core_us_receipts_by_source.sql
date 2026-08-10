-- =============================================================================
-- Core: US federal receipts by source (row-level OBT)
--
-- Source: stg_us_mts_table_9 section 1, extraction recipe verified in
--         docs/us/API-RECON.md §B.1/B.3: data_type_cd = 'D' AND
--         record_type_cd = 'RSG' (9 detail rows per month — the three
--         social-insurance components are separate D rows under an S
--         header; Table 4 is NOT used: its hierarchy is inconsistent
--         about where amounts live).
-- Grain:  (record_date, source_desc) — monthly since 2015-03-31.
--
-- Amounts are CASH receipts in DOLLARS.
-- Identity guaranteed by tests/us/: Σ(this model per record_date)
-- = Table 9 receipts T-row (sequence 1.8).
-- =============================================================================

WITH t9 AS (
    SELECT *
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'D'
      AND record_type_cd = 'RSG'
)

SELECT
    record_date,
    fiscal_year,
    calendar_year,
    calendar_month,
    MOD(calendar_month + 2, 12) + 1     AS months_into_fiscal_year,
    classification_desc                 AS source_desc,
    line_code_nbr,
    src_line_nbr,
    current_month_amt                   AS current_month_receipt_amt,
    current_fytd_amt                    AS current_fytd_receipt_amt,
    prior_fytd_amt                      AS prior_fytd_receipt_amt,
    'USD'                               AS unit,
    _synced_at
FROM t9
