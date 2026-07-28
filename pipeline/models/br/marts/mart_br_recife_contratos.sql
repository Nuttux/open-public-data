-- =============================================================================
-- Mart: Contratos — one row per contract, with provenance.
--
-- Source: core_br_recife_contratos. Exposes org contractors by name; CPF
-- individuals keep doc_tipo='cpf' with razao_social masked downstream (the
-- exporter/fiche renders "pessoa física" instead of the name). is_ativo
-- flags contracts whose vigência covers today AND whose situação is not
-- cancelled/closed (date alone let 3 CANCELADO/ENCERRADO rows read as live).
--
-- valor_implausivel — plausibility guard on the source amount (added
-- 2026-07-25). The portal publishes at least one contract whose stated value
-- exceeds the ENTIRE annual municipal budget: 3101.1007/2023 (ARIES) carries
-- R$ 15.3 bn against a ~R$ 9.2 bn/yr budget, while the payments actually
-- recorded against that CNPJ are ~R$ 2.8 M (2024) and ~R$ 3.5 M (2025). A
-- single contract worth more than everything the city commits in a year
-- cannot be taken at face value, so we flag it rather than silently ranking
-- on it. The ceiling is DERIVED from the budget data (no hardcoded constant),
-- so it travels to other years and cities. Flagged rows are kept and shown —
-- with the amount suppressed and the reason stated — never deleted.
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
),

-- Largest single-year committed spend on record = the plausibility ceiling
-- for any one contract's stated value.
teto AS (
    SELECT MAX(empenhado_ano) AS teto_anual
    FROM (
        SELECT ano, SUM(empenhado) AS empenhado_ano
        FROM {{ ref('stg_br_recife_funcional') }}
        GROUP BY ano
    )
)

SELECT
    c.contrato_id,
    c.numero_contrato,
    c.numero_contrato_publicavel,
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
        AND COALESCE(c.situacao, '') NOT IN ('CANCELADO', 'ENCERRADO')
    )                                AS is_ativo,
    (c.valor_contrato IS NOT NULL AND c.valor_contrato > t.teto_anual)
                                     AS valor_implausivel,
    t.teto_anual                     AS valor_teto_plausibilidade,
    'BRL'                            AS unit,
    p.source_name,
    p.source_url,
    p.source_portal,
    p.source_license,
    p.rows_updated_at                AS source_rows_updated_at
FROM {{ ref('core_br_recife_contratos') }} c
CROSS JOIN provenance p
CROSS JOIN teto t
