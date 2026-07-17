-- =============================================================================
-- Staging: SF payee bucket classification — one-to-one with seed
--
-- Source: seed_us_sf_payee_buckets. Two batches, both manual/in-session:
--   - 2026-07-16 (Block 1 prep): top ~40 FY2025 payees;
--   - 2026-07-16 (Block 2): the measured per-FY top-30 union + all-time
--     top-200 (docs/us/block-studies/2-payees.md §1.1), incl. a `person`
--     bucket for individual landlords (never featured in the UI) and
--     is_aggregation_line for the Controller's aggregated vendor lines.
--
-- Why this exists (docs/us/API-RECON.md §A.3): the top of a naive voucher
-- ranking is banks and fiscal agents (JPMorgan, BNY Mellon, DTC, US Bank —
-- debt service and pass-throughs), NOT service providers. A "who receives"
-- view must bucket/annotate these or it misleads. Buckets are a DISPLAY
-- categorization, not numbers — amounts always come from the voucher data.
-- The mart joins on the exact vendor string: one classified string carries
-- its bucket into EVERY fiscal year it appears in (the "rule layer" of the
-- two-layer strategy; case-insensitive matching was measured to add zero
-- coverage, so the join stays byte-exact).
-- =============================================================================

SELECT
    vendor,
    bucket,
    classification_note,
    classification_method,
    classified_at,
    COALESCE(is_aggregation_line, FALSE) AS is_aggregation_line
FROM {{ ref('seed_us_sf_payee_buckets') }}
