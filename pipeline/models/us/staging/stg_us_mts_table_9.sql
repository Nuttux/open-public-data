-- =============================================================================
-- Staging: MTS Table 9 — receipts by source + outlays by function
--
-- Source: raw.us_fiscaldata_mts_table_9 (all strings, "null" = missing)
-- Grain:  (record_date, src_line_nbr) — 33 rows per month since 2015-03-31
--
-- Transformations:
--   - "null" → NULL, amounts → NUMERIC (dollars), dates → DATE, ints → INT64
--   - `section` derived from sequence_number_cd (1.x = receipts, 2.x = outlays)
--   - line types kept as-is: data_type_cd D=detail / S=header / T=total,
--     record_type_cd RSG=receipt source / F=function / SL=section line.
--     Core models select the clean detail predicates; tests assert T = Σ D.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_mts_table_9') }}
)

SELECT
    {{ us_fd_date('record_date') }}                          AS record_date,
    {{ us_fd_string('classification_desc') }}                AS classification_desc,
    data_type_cd,
    record_type_cd,
    CASE SPLIT(sequence_number_cd, '.')[OFFSET(0)]
        WHEN '1' THEN 'receipts'
        WHEN '2' THEN 'outlays'
    END                                                      AS section,
    sequence_number_cd,
    {{ us_fd_int('sequence_level_nbr') }}                    AS sequence_level_nbr,
    line_code_nbr,
    {{ us_fd_int('src_line_nbr') }}                          AS src_line_nbr,
    {{ us_fd_int('print_order_nbr') }}                       AS print_order_nbr,
    parent_id,
    classification_id,

    -- Amounts in DOLLARS (per the Fiscal Data catalog labels)
    {{ us_fd_amount('current_month_rcpt_outly_amt') }}       AS current_month_amt,
    {{ us_fd_amount('current_fytd_rcpt_outly_amt') }}        AS current_fytd_amt,
    {{ us_fd_amount('prior_fytd_rcpt_outly_amt') }}          AS prior_fytd_amt,

    {{ us_fd_int('record_fiscal_year') }}                    AS fiscal_year,
    {{ us_fd_int('record_calendar_year') }}                  AS calendar_year,
    {{ us_fd_int('record_calendar_month') }}                 AS calendar_month,
    _synced_at
FROM source
