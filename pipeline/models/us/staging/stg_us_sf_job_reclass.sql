-- =============================================================================
-- Staging: SF payroll junk-title reclassification — one-to-one with seed
--
-- Source: seed_us_sf_job_reclass (103 job codes the source files under the
--         "Untitled" (0000) / "Unassigned" (__UNASSIGNED__) families:
--         the Superior Court's own xxC job scheme, mayoral staff grades,
--         sworn police ranks, commissioners/board members, OCII codes —
--         $782M of compensation across 2013-2025, reclassified by hand
--         in-session, docs/us/block-studies/4-payroll.md).
--
-- Applied ONLY where the native job_family_code is junk — a real source
-- family value is never overridden (mart_us_sf_payroll_by_family_year).
-- =============================================================================

SELECT
    job_code,
    job_title_ref,
    reclass_family_code,
    reclass_family,
    note,
    classification_method,
    classified_at
FROM {{ ref('seed_us_sf_job_reclass') }}
