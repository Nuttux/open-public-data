-- =============================================================================
-- Mart: civic places (facilities directory) — one row per geolocated facility.
--
-- Identity/geo only (Phase 1). Money-on-map (contract/obra crosswalk) is a
-- later enrichment. Feeds the shared PlacesExplorer via the Recife adapter.
-- Slug is readable + unique (suffixed only on name collision).
-- =============================================================================

WITH valid AS (
    SELECT
        nome, familia, tipo, lat, lon, bairro, endereco, detalhe,
        NULLIF(REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(NORMALIZE(nome, NFD)), r'\p{Mn}', ''),
            r'[^a-z0-9]+', '-'), '') AS base_slug
    FROM {{ ref('stg_br_recife_places') }}
    WHERE lat IS NOT NULL AND lon IS NOT NULL AND nome IS NOT NULL
),

slugged AS (
    SELECT *,
        CASE WHEN COUNT(*) OVER (PARTITION BY base_slug) > 1
             THEN CONCAT(base_slug, '-', CAST(ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY lat, lon) AS STRING))
             ELSE base_slug END AS slug
    FROM valid
    WHERE base_slug IS NOT NULL
),

obras AS (
    SELECT slug, obras_total, n_obras
    FROM {{ source('br_recife_raw', 'br_recife_place_obras') }}
)

SELECT
    s.slug,
    s.nome,
    s.familia,
    s.tipo,
    s.lat,
    s.lon,
    s.bairro,
    s.endereco,
    s.detalhe,
    -- additive obra crosswalk (evidence-based; NULL when no matched obra)
    o.obras_total                                                AS ode_obras_total,
    o.n_obras                                                    AS ode_n_obras,
    'Dados Abertos da Prefeitura do Recife'                      AS source_name,
    'https://dados.recife.pe.gov.br/dataset?tags=Equipamentos'  AS source_url,
    'BRL'                                                        AS unit
FROM slugged s
LEFT JOIN obras o ON o.slug = s.slug
