-- =============================================================================
-- Staging: SF Building Permits — typed view over raw (all strings)
--
-- Source: raw.us_sf_building_permits (dataset i98e-djp9, ~1.29M rows)
-- Grain:  one row per permit_number (× revision line where present).
--
-- Block 6D. block || lot IS the Assessor APN — the structured key that joins
-- to the City Facilities registry (stg_us_sf_city_facilities.block_lot) at
-- ~100% precision, giving "construction on this parcel" for every place.
-- estimated_cost / revised_cost is the applicant's DECLARED construction value
-- (a permit measure, NOT city spend) — mart_us_sf_place_capital labels it as
-- such and never sums it with contract paid or bond expended.
--
-- Kept as a view (no storage cost over the 1.29M raw); the place-permits mart
-- filters to gazetteer parcels via the APN join.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_building_permits') }}
)

SELECT
    {{ us_sf_string('permit_number') }}          AS permit_number,
    {{ us_sf_string('block') }}                  AS apn_block,
    {{ us_sf_string('lot') }}                    AS apn_lot,
    CONCAT(TRIM(block), TRIM(lot))               AS block_lot,
    TRIM(CONCAT(COALESCE(street_number, ''), ' ',
                COALESCE(street_name, ''), ' ',
                COALESCE(street_suffix, '')))    AS street_address,
    {{ us_sf_string('description') }}            AS description,
    {{ us_sf_string('permit_type_definition') }} AS permit_type,
    {{ us_sf_amount('estimated_cost') }}         AS estimated_cost_usd,
    {{ us_sf_amount('revised_cost') }}           AS revised_cost_usd,
    {{ us_sf_string('status') }}                 AS status,
    {{ us_sf_date('issued_date') }}              AS issued_date,
    {{ us_sf_date('filed_date') }}               AS filed_date,
    {{ us_sf_date('completed_date') }}           AS completed_date,
    _synced_at
FROM source
WHERE block IS NOT NULL AND lot IS NOT NULL
