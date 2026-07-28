-- =============================================================================
-- Staging: SF sub-object spend classification — one-to-one with seed
--
-- Source: seed_us_sf_subobject_class (generated 2026-07-28, reviewable).
-- Grain:  one row per sub_object_code.
--
-- WHY THIS EXISTS. "What a payment buys" cannot be answered by ranking the
-- accounting taxonomy directly: the FY2025 object ranking opens on
-- $3.4B "Professional/Specialized Svcs" and includes federal tax withholding
-- ($635M), bond redemption and unearned revenue. The voucher file is the
-- City's ledger, and most of its top is internal flow, not purchasing.
--
-- So each sub-object carries a class:
--   purchase   — goods and services bought from outside the City
--   obligation — debt service, benefit plans, tax withholding, payments to
--                other governments: real money out, but not a purchase
--   ledger     — balance-sheet and revenue lines that appear in the payments
--                file without being a payment for anything
--   unclear    — not confidently classified (1.6% of dollars); folded, never
--                presented as if it were known
--
-- `basis` records HOW each row was classified (label_rule > code_range) and
-- `needs_review` flags the material rows that only got a code-range default —
-- the classification is editorial and must stay auditable.
-- =============================================================================

SELECT
    sub_object_code,
    sub_object,
    spend_class,
    basis,
    needs_review,
    classified_at
FROM {{ ref('seed_us_sf_subobject_class') }}
