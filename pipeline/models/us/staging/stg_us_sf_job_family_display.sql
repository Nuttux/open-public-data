-- =============================================================================
-- Staging: SF payroll display-family map — one-to-one with seed
--
-- Source: seed_us_sf_job_family_display (60 rows: the source's 59 native
--         job-family codes + the synthetic ELEC family created by
--         seed_us_sf_job_reclass for elected/appointed officials), mapped
--         by hand in-session to 16 citizen-readable display families
--         (docs/us/block-studies/4-payroll.md — the native taxonomy is
--         100% populated, so this is a GROUPING, not a classification).
--
-- Display grouping only — amounts always come from the comp data itself.
-- =============================================================================

SELECT
    job_family_code,
    canonical_label,
    display_family,
    classification_method,
    classified_at
FROM {{ ref('seed_us_sf_job_family_display') }}
