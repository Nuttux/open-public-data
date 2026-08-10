-- =============================================================================
-- Staging: place↔contract crosswalk — one-to-one with the reviewed seed
--
-- Source: seed_us_sf_place_contracts (build_sf_place_contracts.py, reviewed)
-- Grain:  place_slug × contract_no.
--
-- Block 6C. Prime contracts whose title names the place (phrase match + weak-
-- alias/builder-dept guard). Feeds contract capital rows and the payee chain
-- (join to core_us_sf_vouchers on contract_no → vendor + paid $).
-- =============================================================================

SELECT
    place_slug,
    contract_no,
    contract_title,
    department_code,
    prime_contractor,
    agreed_usd,
    paid_usd,
    match_evidence
FROM {{ ref('seed_us_sf_place_contracts') }}
