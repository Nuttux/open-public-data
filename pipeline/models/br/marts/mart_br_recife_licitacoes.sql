-- =============================================================================
-- Mart: Licitações — one row per procurement (concluída or em andamento).
--
-- Source: stg_br_recife_licitacoes. economia = estimado − homologado (savings
-- vs the reference price) on concluídas. Feeds the contratos page's
-- procurement context (modalidade mix, savings, in-progress pipeline).
-- =============================================================================

WITH provenance AS (
    SELECT
        ANY_VALUE(dataset_title)     AS source_name,
        ANY_VALUE(dataset_page_url)  AS source_url,
        ANY_VALUE(portal_name)       AS source_portal,
        ANY_VALUE(license_title)     AS source_license,
        MAX(rows_updated_at)         AS rows_updated_at
    FROM {{ ref('stg_br_recife_catalog') }}
    WHERE source_id LIKE 'licitacoes_%'
)

SELECT
    l.status,
    l.processo_numero,
    l.processo_ano,
    l.lote,
    l.modalidade,
    l.orgao,
    l.objeto,
    l.doc,
    l.doc_tipo,
    l.razao_social,
    l.valor_estimado,
    l.valor_homologado,
    l.economia,
    l.data_conclusao,
    'BRL'                            AS unit,
    p.source_name,
    p.source_url,
    p.source_portal,
    p.source_license,
    p.rows_updated_at                AS source_rows_updated_at
FROM {{ ref('stg_br_recife_licitacoes') }} l
CROSS JOIN provenance p
