-- =============================================================================
-- Core: SF Supplier Contracts OBT — row-level contract × team-member rows
--
-- Source: stg_us_sf_contracts
-- Grain:  contract × project-team member (AS PUBLISHED — 48,350 rows for
--         31,935 distinct contract_no). Summing agreed_amt across rows
--         double-counts: consumers must either dedupe on contract_no or
--         filter is_prime_contractor_row. The grain fact is encoded as
--         tests/us/assert_us_sf_contracts_grain.sql.
-- =============================================================================

WITH contracts AS (
    SELECT *
    FROM {{ ref('stg_us_sf_contracts') }}
)

SELECT
    *,
    project_team_constituent = 'Prime Contractor'  AS is_prime_contractor_row
FROM contracts
