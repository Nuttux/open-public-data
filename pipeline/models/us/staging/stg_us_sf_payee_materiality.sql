-- =============================================================================
-- Staging: SF payee materiality picks — one-to-one with seed
--
-- Source: seed_us_sf_payee_materiality (curated in-session, Block 2).
-- Grain:  one row per featured "what a payment buys" line, keyed slug.
--
-- The seed carries ONLY the choice of line (vendor × department ×
-- sub_object × fiscal_year) and the editorial label. The dollar amount is
-- computed downstream in mart_us_sf_payee_materiality from the voucher
-- data itself — no hardcoded numbers (zero-hardcode doctrine). A seed row
-- that stops matching the vouchers fails
-- tests/us/assert_us_sf_materiality_rows_match.sql.
-- =============================================================================

SELECT
    slug,
    vendor,
    department,
    sub_object,
    fiscal_year,
    label,
    editorial_note,
    method,
    added_at
FROM {{ ref('seed_us_sf_payee_materiality') }}
