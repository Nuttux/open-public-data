-- =============================================================================
-- Staging: SF purchasing-authority families — one-to-one with seed
--
-- Source: seed_us_sf_purchasing_authority_families (93 distinct
--         purchasing_authority strings queried live 2026-07-16 → 8 display
--         families, manual in-session classification, human review pending).
--
-- Why this exists (docs/us/block-studies/3-contracts.md §Architecture): the
-- register's ~93 free-text authority strings are legible but unusable as a
-- chart axis. The family is a DISPLAY grouping of the strings only — the
-- sole-source lens is driven by the source's own sole_source_flg, and fiches
-- always render the authority string VERBATIM as the neutral "why".
-- =============================================================================

SELECT
    purchasing_authority,
    authority_family,
    classification_note,
    classification_method,
    classified_at
FROM {{ ref('seed_us_sf_purchasing_authority_families') }}
