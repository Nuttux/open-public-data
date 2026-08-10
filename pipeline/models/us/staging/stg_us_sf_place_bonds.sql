-- =============================================================================
-- Staging: place↔GO-bond crosswalk — one-to-one with the reviewed seed
--
-- Source: seed_us_sf_place_bonds (build_sf_place_bonds.py, reviewed)
-- Grain:  place_slug × source_kind × item_name.
--
-- Block 6B. bond_item rows carry the place's EXACT bond $ (latest cumulative
-- expended); bond_project rows name bond-funded work (program-level $). Feeds
-- mart_us_sf_place_capital, which labels the measure and never sums across
-- ledgers (bond expended = the same money that pays the contracts).
-- =============================================================================

SELECT
    place_slug,
    source_kind,
    bond_program,
    item_name,
    expended_usd,
    revised_budget_usd,
    voter_approved_date,
    component,
    match_evidence
FROM {{ ref('seed_us_sf_place_bonds') }}
