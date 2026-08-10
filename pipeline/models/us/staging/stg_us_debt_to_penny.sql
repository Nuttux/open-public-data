-- =============================================================================
-- Staging: Debt to the Penny — daily total public debt outstanding
--
-- Source: raw.us_fiscaldata_debt_to_penny (all strings, "null" = missing)
-- Grain:  record_date (one row per business day since 1993-04-01)
--
-- Amounts in DOLLARS. tot_pub_debt_out_amt = debt_held_public_amt +
-- intragov_hold_amt (Treasury's own decomposition; intragov includes FFB
-- debt per the dataset's notes_and_known_limitations).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_debt_to_penny') }}
)

SELECT
    {{ us_fd_date('record_date') }}                 AS record_date,
    {{ us_fd_amount('debt_held_public_amt') }}      AS debt_held_public_amt,
    {{ us_fd_amount('intragov_hold_amt') }}         AS intragov_hold_amt,
    {{ us_fd_amount('tot_pub_debt_out_amt') }}      AS tot_pub_debt_out_amt,
    {{ us_fd_int('src_line_nbr') }}                 AS src_line_nbr,
    {{ us_fd_int('record_fiscal_year') }}           AS fiscal_year,
    {{ us_fd_int('record_calendar_year') }}         AS calendar_year,
    {{ us_fd_int('record_calendar_month') }}        AS calendar_month,
    _synced_at
FROM source
