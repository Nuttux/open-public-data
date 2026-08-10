-- =============================================================================
-- Staging: SF GO Bond Program Spending & Status — typed, one-to-one with raw
--
-- Source: raw.us_sf_go_bond_spending (dataset m793-kis4, all strings)
-- Grain:  bond program × program item × reporting year (year is the report
--         snapshot; the latest per item is the current cumulative position).
--
-- Block 6B (lieux capital). The voter-approved capital LEDGER: `expended` is
-- actual dollars spent out of the bond fund — which is what pays the very
-- contracts a place also shows, so bond $ and contract $ are the SAME money in
-- different ledgers and are never summed (mart_us_sf_place_capital enforces).
-- ~29 items are single named facilities (exact place $); the rest are program
-- categories (place gets program context + its project list from bond_projects).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_go_bond_spending') }}
)

SELECT
    {{ us_sf_string('bondprogram') }}          AS bond_program,
    {{ us_sf_int('year') }}                     AS report_year,
    {{ us_sf_string('component_programitem') }} AS program_item,
    {{ us_sf_amount('bondauthamount') }}        AS bond_authorized_usd,
    {{ us_sf_amount('revisedbudget') }}         AS revised_budget_usd,
    {{ us_sf_amount('issuedtodate') }}          AS issued_to_date_usd,
    {{ us_sf_amount('expended') }}              AS expended_usd,
    {{ us_sf_amount('encumbrance') }}           AS encumbrance_usd,
    {{ us_sf_amount('remaining_balance') }}     AS remaining_balance_usd,
    {{ us_sf_int('fiscal_year') }}              AS fiscal_year,
    {{ us_sf_date('voter_approved_date') }}     AS voter_approved_date,
    {{ us_sf_date('originalenddate') }}         AS original_end_date,
    {{ us_sf_date('projectedenddate') }}        AS projected_end_date,
    {{ us_sf_date('actualenddate') }}           AS actual_end_date,
    {{ us_sf_date('data_as_of') }}              AS data_as_of,
    {{ us_sf_date('data_loaded_at') }}          AS data_loaded_at,
    _synced_at
FROM source
