-- =============================================================================
-- Core: SF Vendor Payments OBT — row-level voucher distribution lines
--
-- Source: stg_us_sf_vouchers (~8.07M rows)
-- Grain:  voucher × accounting distribution line — kept row-level per
--         ADR-0001 (core = row-level OBT; the FY × vendor rollup is
--         mart_us_sf_top_payees' business).
--
-- `vendor` stays the portal's unkeyed display string here — name
-- normalization/bucketing is a display concern handled in the mart via
-- seed_us_sf_payee_buckets (same philosophy as the Paris association
-- name-normalization enrichment, docs/us/API-RECON.md §D.3.6).
-- =============================================================================

WITH vouchers AS (
    SELECT *
    FROM {{ ref('stg_us_sf_vouchers') }}
)

SELECT
    *,
    related_govt_units = 'Yes'  AS is_related_govt_unit,
    CURRENT_DATE('America/Los_Angeles') > DATE(fiscal_year, 6, 30)
                                AS is_fiscal_year_complete
FROM vouchers
