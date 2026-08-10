-- =============================================================================
-- Staging: place↔City-Facilities crosswalk — one-to-one with the seed
--
-- Source: seed_us_sf_place_facilities (build_sf_place_facilities.py, reviewed)
-- Grain:  place_slug × facility_id (a place is often a campus of buildings).
--
-- The reviewed crosswalk that anchors each SF place to its facility_id(s) in
-- the City Facilities registry (Block 6 lieux). Identity only — no money.
-- =============================================================================

SELECT
    place_slug,
    facility_id,
    common_name,
    address,
    block_lot,
    apn_block,
    apn_lot,
    is_city_owned,
    gross_sq_ft,
    department_name,
    is_primary,
    match_method,
    match_evidence,
    distance_m
FROM {{ ref('seed_us_sf_place_facilities') }}
