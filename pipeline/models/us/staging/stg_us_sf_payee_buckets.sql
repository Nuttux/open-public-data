-- =============================================================================
-- Staging: SF payee bucket classification — one-to-one with seed
--
-- Source: seed_us_sf_payee_buckets (manual classification of the top ~40
--         FY2025 payees, dated in the seed's classified_at column)
--
-- Why this exists (docs/us/API-RECON.md §A.3): the top of a naive voucher
-- ranking is banks and fiscal agents (JPMorgan, BNY Mellon, DTC, US Bank —
-- debt service and pass-throughs), NOT service providers. A "who receives"
-- view must bucket/annotate these or it misleads. Buckets are a DISPLAY
-- categorization, not numbers — amounts always come from the voucher data.
-- =============================================================================

SELECT
    vendor,
    bucket,
    classification_note,
    classification_method,
    classified_at
FROM {{ ref('seed_us_sf_payee_buckets') }}
