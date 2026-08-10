-- =============================================================================
-- Staging: SF department display names — one-to-one with seed
--
-- Source: seed_us_sf_dept_names (Block 1 in-session enrichment, 2026-07-16)
--
-- Provenance-flagged DISPLAY layer (docs/us/block-studies/1-budget.md §AI
-- enrichment Tier 1): modern-era (FY2019+) department codes mapped to
-- citizen-readable names — code prefix stripped, vowel-dropped abbreviations
-- expanded ("Wrkfrce Dvlpmnt" → "Workforce Development"), source typos fixed
-- ("Communtiy", "Accountabilty", the CHF semicolon). The source label is kept
-- verbatim in source_label and NEVER overwritten in models — marts carry both.
-- Legacy-era (FY2010–2017) department labels are not covered: they render
-- as published.
-- =============================================================================

SELECT
    department_code,
    source_label,
    display_name,
    provenance,
    enriched_at
FROM {{ ref('seed_us_sf_dept_names') }}
