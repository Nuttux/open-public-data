-- =============================================================================
-- Staging: SF Spending and Revenue (actuals) — typed, one-to-one with raw
--
-- Source: raw.us_sf_spending_revenue (dataset bpnb-jwfb, all strings)
-- Grain:  FY × related_govt_units × org group × dept × program × character
--         × object × sub_object × fund hierarchy (row-level actuals)
--
-- Notes (docs/us/API-RECON.md §A.2):
--   - FY1999-FY2027; in-progress fiscal years appear (label partial years).
--   - Actuals are GROSS where budget is net: related-govt-units rows (OCII
--     etc.) + "Transfers Out" + "Intrafund Transfers Out" characters make
--     naive budget-vs-actual off by billions. See
--     mart_us_sf_budget_vs_actual for the measured reconciliation.
--   - VERIFIED casing bug: related_govt_units ∈ {No, NO, Yes, YES} —
--     normalized here to {'No','Yes'} (tested via accepted_values).
--   - Chart-of-accounts break at FY2018: legacy numeric character/object
--     codes → PeopleSoft mnemonics. Names mostly align, codes don't.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_spending_revenue') }}
)

SELECT
    {{ us_sf_int('fiscal_year') }}                 AS fiscal_year,
    {{ us_sf_string('revenue_or_spending') }}      AS revenue_or_spending,
    CASE UPPER(TRIM(related_govt_units))
        WHEN 'YES' THEN 'Yes'
        WHEN 'NO'  THEN 'No'
    END                                            AS related_govt_units,
    {{ us_sf_string('organization_group_code') }}  AS organization_group_code,
    {{ us_sf_string('organization_group') }}       AS organization_group,
    {{ us_sf_string('department_code') }}          AS department_code,
    {{ us_sf_string('department') }}               AS department,
    {{ us_sf_string('program_code') }}             AS program_code,
    {{ us_sf_string('program') }}                  AS program,
    {{ us_sf_string('character_code') }}           AS character_code,
    {{ us_sf_string('character') }}                AS character,
    {{ us_sf_string('object_code') }}              AS object_code,
    {{ us_sf_string('object') }}                   AS object,
    {{ us_sf_string('sub_object_code') }}          AS sub_object_code,
    {{ us_sf_string('sub_object') }}               AS sub_object,
    {{ us_sf_string('fund_type_code') }}           AS fund_type_code,
    {{ us_sf_string('fund_type') }}                AS fund_type,
    {{ us_sf_string('fund_code') }}                AS fund_code,
    {{ us_sf_string('fund') }}                     AS fund,
    {{ us_sf_string('fund_category_code') }}       AS fund_category_code,
    {{ us_sf_string('fund_category') }}            AS fund_category,
    {{ us_sf_amount('amount') }}                   AS amount,
    {{ us_sf_timestamp('data_as_of') }}            AS data_as_of,
    {{ us_sf_timestamp('data_loaded_at') }}        AS data_loaded_at,
    _synced_at
FROM source
