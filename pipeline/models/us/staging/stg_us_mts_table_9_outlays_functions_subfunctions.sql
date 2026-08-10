-- =============================================================================
-- Staging: MTS Table 9A — outlays by function × subfunction
--
-- Source: raw.us_fiscaldata_mts_table_9_outlays_functions_subfunctions
-- Grain:  (record_date, src_line_nbr) — ~76 rows per month since 2015-03-31
--
-- No data_type_cd in this table. Verified live 2026-07-15: rows are clean
-- detail (no embedded totals) — SUM(all rows) per record_date equals the
-- Table 9 outlays T-row to the penny (encoded as a singular test).
-- Functions with a single subfunction repeat the function name in
-- sub_function_desc (e.g. Medicare).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_mts_table_9_outlays_functions_subfunctions') }}
)

SELECT
    {{ us_fd_date('record_date') }}                    AS record_date,
    {{ us_fd_string('function_desc') }}                AS function_desc,
    {{ us_fd_string('sub_function_desc') }}            AS sub_function_desc,
    sequence_number_cd,
    line_code_nbr,
    {{ us_fd_int('src_line_nbr') }}                    AS src_line_nbr,
    {{ us_fd_int('print_order_nbr') }}                 AS print_order_nbr,

    -- Amounts in DOLLARS
    {{ us_fd_amount('current_month_outly_amt') }}      AS current_month_amt,
    {{ us_fd_amount('current_fytd_outly_amt') }}       AS current_fytd_amt,
    {{ us_fd_amount('prior_fytd_outly_amt') }}         AS prior_fytd_amt,

    {{ us_fd_int('record_fiscal_year') }}              AS fiscal_year,
    {{ us_fd_int('record_calendar_year') }}            AS calendar_year,
    {{ us_fd_int('record_calendar_month') }}           AS calendar_month,
    _synced_at
FROM source
