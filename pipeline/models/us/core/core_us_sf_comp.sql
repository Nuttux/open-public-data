-- =============================================================================
-- Core: SF Employee Compensation OBT — row-level comp records, BOTH year types
--
-- Source: stg_us_sf_comp (~1.1M rows)
-- Grain:  pseudonymous employee_identifier × year × year_type × job × dept.
--
-- year_type ('Calendar' | 'Fiscal') is DELIBERATELY kept in core with the
-- field exposed — the same compensation appears under both accountings and
-- filtering is mart business (mart_us_sf_comp_by_year takes 'Fiscal').
-- Anything summing this table without a year_type predicate double-counts
-- (docs/us/API-RECON.md §A.5 — the dataset's #1 trap, tested in
-- tests/us/assert_us_sf_comp_year_type_split.sql).
-- =============================================================================

SELECT *
FROM {{ ref('stg_us_sf_comp') }}
