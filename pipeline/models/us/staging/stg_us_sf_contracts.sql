-- =============================================================================
-- Staging: SF Supplier Contracts — typed, one-to-one with raw
--
-- Source: raw.us_sf_supplier_contracts (dataset cqi5-hm2d, all strings)
-- Grain:  contract × project-team member — summing agreed_amt DOUBLE-COUNTS
--         (48,350 rows vs 31,935 distinct contract_no; dedupe on contract_no
--         or filter project_team_constituent = 'Prime Contractor').
--         Encoded as tests/us/assert_us_sf_contracts_grain.sql.
--
-- Data-quality handling (docs/us/API-RECON.md §A.4):
--   - Placeholder end dates (2200-12-31 and similar far-future values):
--     term_end_date is NULLed at the 2100-01-01 cap, the published value
--     stays in term_end_date_published + a boolean flag.
--   - contract_no missing on some rows; junk titles ("x", "Unspecified")
--     kept as published (display concerns are mart business).
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_supplier_contracts') }}
)

SELECT
    {{ us_sf_string('contract_no') }}                AS contract_no,
    {{ us_sf_string('contract_title') }}             AS contract_title,
    {{ us_sf_date('term_start_date') }}              AS term_start_date,
    -- Cap placeholder far-future end dates (2200-12-31 observed)
    CASE
        WHEN {{ us_sf_date('term_end_date') }} >= DATE '2100-01-01' THEN NULL
        ELSE {{ us_sf_date('term_end_date') }}
    END                                              AS term_end_date,
    {{ us_sf_date('term_end_date') }}                AS term_end_date_published,
    COALESCE({{ us_sf_date('term_end_date') }} >= DATE '2100-01-01', FALSE)
                                                     AS term_end_date_is_placeholder,
    {{ us_sf_string('contract_type') }}              AS contract_type,
    {{ us_sf_string('purchasing_authority') }}       AS purchasing_authority,
    {{ us_sf_string('sole_source_flg') }}            AS sole_source_flg,
    {{ us_sf_string('department_code') }}            AS department_code,
    {{ us_sf_string('department') }}                 AS department,
    {{ us_sf_string('prime_contractor') }}           AS prime_contractor,
    {{ us_sf_string('project_team_supplier') }}      AS project_team_supplier,
    {{ us_sf_string('project_team_lbe_status') }}    AS project_team_lbe_status,
    {{ us_sf_string('non_profit') }}                 AS non_profit,
    {{ us_sf_string('project_team_constituent') }}   AS project_team_constituent,
    {{ us_sf_string('scope_of_work') }}              AS scope_of_work,
    {{ us_sf_amount('agreed_amt') }}                 AS agreed_amt,
    {{ us_sf_amount('consumed_amt') }}               AS consumed_amt,
    {{ us_sf_amount('pmt_amt') }}                    AS pmt_amt,
    {{ us_sf_amount('remaining_amt') }}              AS remaining_amt,
    {{ us_sf_timestamp('data_as_of') }}              AS data_as_of,
    {{ us_sf_timestamp('data_loaded_at') }}          AS data_loaded_at,
    _synced_at
FROM source
