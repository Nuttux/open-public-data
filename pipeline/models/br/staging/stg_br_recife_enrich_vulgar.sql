-- =============================================================================
-- Staging: plain-pt vulgarization enrichment (resumo + o_que_financia per CNPJ).
-- Additive — LEFT-joined onto quem_recebe; never overwrites raw.
-- =============================================================================

WITH source AS (
    SELECT * FROM {{ source('br_recife_raw', 'br_recife_enrich_vulgar') }}
)

SELECT
    {{ br_digits('cnpj') }}          AS cnpj,
    {{ br_string('resumo') }}        AS resumo,
    {{ br_string('o_que_financia') }} AS o_que_financia,
    {{ br_string('model') }}         AS model
FROM source
QUALIFY ROW_NUMBER() OVER (PARTITION BY {{ br_digits('cnpj') }} ORDER BY _synced_at DESC) = 1
