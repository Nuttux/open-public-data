-- =============================================================================
-- Core: US federal outlays by agency (row-level OBT)
--
-- Source: stg_us_mts_table_5, agency-total recipe verified live 2026-07-15
--         (docs/us/API-RECON.md §B.2): data_type_cd = 'T' AND
--         record_type_cd = 'C' — always sequence_level_nbr = 2 and exactly
--         29 rows per month across the full 2015-03+ history. The level
--         guard is kept as a belt-and-braces filter against the documented
--         caveat that C rows can appear below level 1 in the hierarchy.
--         Note (deviation from API-RECON §B.2 as written): the
--         'Independent Agencies' D|C header with "null" amount exists, but
--         a proper 'Total--Independent Agencies' T|C row also exists —
--         this model captures it; nothing is dropped.
-- Grain:  (record_date, agency_desc) — monthly since 2015-03-31.
--
-- Amounts are CASH outlays in DOLLARS (gross / applicable receipts / net).
-- Agency net outlays do NOT sum to total outlays alone: the
-- 'Total--Undistributed Offsetting Receipts' SL row must be added
-- (identity encoded in tests/us/).
-- =============================================================================

WITH t5 AS (
    SELECT *
    FROM {{ ref('stg_us_mts_table_5') }}
    WHERE data_type_cd = 'T'
      AND record_type_cd = 'C'
      AND sequence_level_nbr = 2
)

SELECT
    record_date,
    fiscal_year,
    calendar_year,
    calendar_month,
    MOD(calendar_month + 2, 12) + 1                        AS months_into_fiscal_year,
    REGEXP_REPLACE(classification_desc, '^Total--', '')    AS agency_desc,
    classification_desc,
    sequence_number_cd,
    src_line_nbr,
    current_month_gross_outlay_amt,
    current_month_applicable_receipt_amt,
    current_month_net_outlay_amt,
    current_fytd_gross_outlay_amt,
    current_fytd_applicable_receipt_amt,
    current_fytd_net_outlay_amt,
    prior_fytd_gross_outlay_amt,
    prior_fytd_applicable_receipt_amt,
    prior_fytd_net_outlay_amt,
    'USD'                                                  AS unit,
    _synced_at
FROM t5
