-- Enrichment-seed coverage for character glosses: every modern-era
-- (FY2019+) side × character_code with budget activity must carry a gloss
-- (half the character labels are accounting jargon — an unglossed one
-- renders raw and misleads, e.g. "Charges for Services" without the
-- enterprise-billing explanation). A new character appearing in a future
-- AAO fails here → write its gloss consciously.
{{ config(tags=['us', 'enrichment']) }}

SELECT
    fiscal_year,
    side,
    character_code,
    character,
    total_usd
FROM {{ ref('mart_us_sf_budget_character') }}
WHERE fiscal_year >= 2019
  AND character_gloss IS NULL
