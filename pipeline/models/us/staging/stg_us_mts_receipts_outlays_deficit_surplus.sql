-- =============================================================================
-- Staging: MTS long series — monthly receipts / outlays / deficit-surplus
--
-- Source: raw.us_fiscaldata_mts_receipts_outlays_deficit_surplus
-- Grain:  (record_date, amt_category) — monthly since 1980-10-31
--
-- UNITS: MILLIONS of dollars (mil_amt) — the only synced Fiscal Data table
-- not in dollars. Converted to dollars in core_us_monthly_totals.
--
-- SIGN: 'Deficit/Surplus (-)' here = Outlays − Receipts (deficit POSITIVE),
-- flipped vs MTS Tables 3/5. Normalized (and documented) in core.
-- 3 categories exist for the full series; the 3 financing categories
-- (Borrowing from the Public, Reduction of Operating Cash, By Other Means)
-- start 2010-01-31.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_mts_receipts_outlays_deficit_surplus') }}
)

SELECT
    {{ us_fd_date('record_date') }}          AS record_date,
    {{ us_fd_string('amt_category') }}       AS amt_category,
    {{ us_fd_amount('mil_amt') }}            AS mil_amt,
    {{ us_fd_int('src_line_nbr') }}          AS src_line_nbr,
    {{ us_fd_int('record_fiscal_year') }}    AS fiscal_year,
    {{ us_fd_int('record_calendar_year') }}  AS calendar_year,
    {{ us_fd_int('record_calendar_month') }} AS calendar_month,
    _synced_at
FROM source
