-- =============================================================================
-- Staging: MTS Table 5 — outlays by agency / bureau / account
--
-- Source: raw.us_fiscaldata_mts_table_5 (all strings, "null" = missing)
-- Grain:  (record_date, src_line_nbr) — ~802 rows per month since 2015-03-31
--
-- 5-level hierarchy:
--   record_type_cd : C=agency, B=bureau, P=program/account, A=allowance,
--                    SL=summary line, UOR/UORG=undistributed offsetting rcpts
--   data_type_cd   : D=detail / S=header ("null" amounts) / T=total
-- Verified 2026-07-15: agency totals = T|C rows, always sequence_level_nbr=2,
-- 29 per month; Σ(T|C) + 'Total--Undistributed Offsetting Receipts' SL row
-- = 'Total Outlays' SL row to the penny (encoded as singular tests).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_mts_table_5') }}
)

SELECT
    {{ us_fd_date('record_date') }}                          AS record_date,
    {{ us_fd_string('classification_desc') }}                AS classification_desc,
    data_type_cd,
    record_type_cd,
    sequence_number_cd,
    {{ us_fd_int('sequence_level_nbr') }}                    AS sequence_level_nbr,
    line_code_nbr,
    {{ us_fd_int('src_line_nbr') }}                          AS src_line_nbr,
    {{ us_fd_int('print_order_nbr') }}                       AS print_order_nbr,
    parent_id,
    classification_id,

    -- Amounts in DOLLARS: gross outlays / applicable receipts / net outlays
    {{ us_fd_amount('current_month_gross_outly_amt') }}      AS current_month_gross_outlay_amt,
    {{ us_fd_amount('current_month_app_rcpt_amt') }}         AS current_month_applicable_receipt_amt,
    {{ us_fd_amount('current_month_net_outly_amt') }}        AS current_month_net_outlay_amt,
    {{ us_fd_amount('current_fytd_gross_outly_amt') }}       AS current_fytd_gross_outlay_amt,
    {{ us_fd_amount('current_fytd_app_rcpt_amt') }}          AS current_fytd_applicable_receipt_amt,
    {{ us_fd_amount('current_fytd_net_outly_amt') }}         AS current_fytd_net_outlay_amt,
    {{ us_fd_amount('prior_fytd_gross_outly_amt') }}         AS prior_fytd_gross_outlay_amt,
    {{ us_fd_amount('prior_fytd_app_rcpt_amt') }}            AS prior_fytd_applicable_receipt_amt,
    {{ us_fd_amount('prior_fytd_net_outly_amt') }}           AS prior_fytd_net_outlay_amt,

    {{ us_fd_int('record_fiscal_year') }}                    AS fiscal_year,
    {{ us_fd_int('record_calendar_year') }}                  AS calendar_year,
    {{ us_fd_int('record_calendar_month') }}                 AS calendar_month,
    _synced_at
FROM source
