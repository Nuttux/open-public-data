-- BLOCK 3 GUARD (SF-BUILD-PLAN cross-cutting rule 3): consumed_amt /
-- remaining_amt are measured garbage (remaining sums to −$83.5B; one rec
-- center shows $83.35B consumed on a $140.3M award) and must NEVER surface
-- as a column of any contract mart. This introspects the built marts'
-- actual columns — if anyone ever selects the source columns through, the
-- test fails regardless of aliasing discipline in the SQL.
{{ config(tags=['us', 'referential_integrity']) }}

SELECT
    table_name,
    column_name
FROM `{{ ref('mart_us_sf_contracts_summary').database }}.{{ ref('mart_us_sf_contracts_summary').schema }}`.INFORMATION_SCHEMA.COLUMNS
WHERE table_name IN (
        '{{ ref('mart_us_sf_contracts_summary').identifier }}',
        '{{ ref('mart_us_sf_contract_spend_by_fy').identifier }}',
        '{{ ref('mart_us_sf_contract_team').identifier }}'
    )
  AND (
        LOWER(column_name) LIKE '%consumed%'
        OR LOWER(column_name) LIKE '%remaining_amt%'
        OR LOWER(column_name) LIKE '%remaining_src%'
  )
