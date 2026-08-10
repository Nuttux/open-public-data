-- =============================================================================
-- Staging: SF City Facilities — typed, one-to-one with raw
--
-- Source: raw.us_sf_city_facilities (dataset nc68-ngbr, all strings)
-- Grain:  one row per city facility (facility_id is the stable key).
--
-- Block 6 (lieux) structured-location backbone (docs/us/block-studies/6-lieux.md).
-- The money tables (contracts/vouchers/budget/comp) carry NO geography; this
-- registry is where a place gets a canonical address + APN (block_lot) + geom,
-- and it resolves the neighborhood-name collision structurally (e.g. the
-- Chinatown Branch Library is one facility_id, cleanly separate from the
-- Chinatown health/child-dev centers that share the "Chinatown" token).
--
-- Typing notes:
--   - block_lot is the Assessor APN as a 10-char string (block4 + lot3, e.g.
--     "0191004"); kept as a normalized string (never numeric — leading zeros
--     are significant) and re-exposed split into apn_block / apn_lot for the
--     Building Permits join (block+lot are separate columns there).
--   - latitude/longitude arrive as strings; cast to FLOAT64 for the spatial
--     join. geom (Socrata point) is kept as the raw string for later parsing.
--   - owned_leased ∈ {Own, Lease}; a boolean is_city_owned is exposed.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_city_facilities') }}
)

SELECT
    {{ us_sf_int('facility_id') }}                    AS facility_id,
    {{ us_sf_string('common_name') }}                AS common_name,
    {{ us_sf_string('address') }}                    AS address,
    {{ us_sf_string('city') }}                       AS city,
    {{ us_sf_string('zip_code') }}                   AS zip_code,
    {{ us_sf_string('block_lot') }}                  AS block_lot,
    -- Split the APN for the Building Permits join (block + lot are separate
    -- columns in i98e-djp9). Block is the first 4 chars, lot the remainder.
    CASE WHEN LENGTH(TRIM(block_lot)) >= 5
         THEN SUBSTR(TRIM(block_lot), 1, 4) END      AS apn_block,
    CASE WHEN LENGTH(TRIM(block_lot)) >= 5
         THEN SUBSTR(TRIM(block_lot), 5) END         AS apn_lot,
    {{ us_sf_string('owned_leased') }}               AS owned_leased,
    UPPER(COALESCE(TRIM(owned_leased), '')) = 'OWN'  AS is_city_owned,
    {{ us_sf_int('dept_id') }}                        AS dept_id,
    {{ us_sf_string('department_name') }}            AS department_name,
    {{ us_sf_int('gross_sq_ft') }}                    AS gross_sq_ft,
    SAFE_CAST(NULLIF(TRIM(latitude), '') AS FLOAT64)  AS latitude,
    SAFE_CAST(NULLIF(TRIM(longitude), '') AS FLOAT64) AS longitude,
    {{ us_sf_string('geom') }}                        AS geom,
    {{ us_sf_int('supervisor_district') }}            AS supervisor_district,
    {{ us_sf_string('city_tenants') }}               AS city_tenants,
    {{ us_sf_int('land_id') }}                        AS land_id,
    {{ us_sf_date('data_last_updated') }}             AS data_last_updated,
    {{ us_sf_date('data_as_of') }}                    AS data_as_of,
    {{ us_sf_date('data_loaded_at') }}                AS data_loaded_at,
    _synced_at
FROM source
