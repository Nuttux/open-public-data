-- =============================================================================
-- Mart: Contratos — one row per contract, with provenance.
--
-- Source: core_br_recife_contratos. Exposes org contractors by name; CPF
-- individuals keep doc_tipo='cpf' with razao_social masked downstream (the
-- exporter/fiche renders "pessoa física" instead of the name). is_ativo
-- flags contracts whose vigência covers today (best-effort — many rows have
-- placeholder end dates).
-- =============================================================================

WITH provenance AS (
    SELECT
        ANY_VALUE(dataset_title)     AS source_name,
        ANY_VALUE(dataset_page_url)  AS source_url,
        ANY_VALUE(portal_name)       AS source_portal,
        ANY_VALUE(license_title)     AS source_license,
        MAX(rows_updated_at)         AS rows_updated_at
    FROM {{ ref('stg_br_recife_catalog') }}
    WHERE source_id = 'contratos'
)

SELECT
    c.contrato_id,
    c.numero_contrato,
    c.ano_contrato,
    c.orgao_contratante,
    c.objeto,
    c.modalidade,
    c.doc,
    c.doc_tipo,
    c.is_org,
    c.razao_social,
    c.cidade,
    c.uf,
    c.vigencia_inicio,
    c.vigencia_fim,
    c.valor_contrato,
    c.valor_contrato_2,
    c.situacao,
    (c.vigencia_inicio IS NOT NULL
        AND c.vigencia_inicio <= CURRENT_DATE()
        AND (c.vigencia_fim IS NULL OR c.vigencia_fim >= CURRENT_DATE())
    )                                AS is_ativo,
    'BRL'                            AS unit,
    p.source_name,
    p.source_url,
    p.source_portal,
    p.source_license,
    p.rows_updated_at                AS source_rows_updated_at
FROM {{ ref('core_br_recife_contratos') }} c
CROSS JOIN provenance p
