-- =============================================================================
-- Staging: Historical Debt Outstanding — fiscal-year-end debt since 1790
--
-- Source: raw.us_fiscaldata_debt_outstanding (all strings, "null" = missing)
-- Grain:  record_date (one row per fiscal-year end, annual since 1790)
--
-- Amounts in DOLLARS. No public/intragov breakout in this dataset (TPDO
-- includes FFB debt per the dataset's notes).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_debt_outstanding') }}
)

SELECT
    {{ us_fd_date('record_date') }}             AS record_date,
    {{ us_fd_amount('debt_outstanding_amt') }}  AS debt_outstanding_amt,
    {{ us_fd_int('src_line_nbr') }}             AS src_line_nbr,
    {{ us_fd_int('record_fiscal_year') }}       AS fiscal_year,
    _synced_at
FROM source
