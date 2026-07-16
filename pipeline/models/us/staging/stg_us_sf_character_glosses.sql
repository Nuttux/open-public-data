-- =============================================================================
-- Staging: SF budget character glosses — one-to-one with seed
--
-- Source: seed_us_sf_character_glosses (Block 1 in-session enrichment,
--         2026-07-16)
--
-- One-line explanations of the modern-era (FY2019+) accounting characters,
-- both sides. Half the character labels are accounting jargon ("Mandatory
-- Fringe Benefits", "Unappropriated Rev-Designated") — the gloss says what
-- each one actually is. display_category drives WHERE the UI renders a
-- character:
--   standard   → ranked bars / breakdown lists
--   internal   → "internal mechanics" block (IntraFund Transfers In,
--                Expenditure Recovery — money that never leaves the City)
--   adjustment → transfer-adjustment lines (ELU/ELS), carried as labeled
--                lines, never inside share/length visuals
--   offset     → Overhead and Allocations (negative at dept level where a
--                dept recovers overhead) — offsets block only
-- Source labels kept verbatim in source_label, never overwritten.
-- =============================================================================

SELECT
    side,
    character_code,
    source_label,
    gloss,
    display_category,
    provenance,
    enriched_at
FROM {{ ref('seed_us_sf_character_glosses') }}
