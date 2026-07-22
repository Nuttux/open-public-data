-- =============================================================================
-- Staging: theme mapping (CNAE-section / paying-agency → citizen theme, pt).
-- Deterministic, grounded — the primary theme path. From the dbt seed.
-- =============================================================================

SELECT
    chave_tipo,
    chave,
    tema,
    prioridade
FROM {{ ref('seed_mapping_tema_recife') }}
