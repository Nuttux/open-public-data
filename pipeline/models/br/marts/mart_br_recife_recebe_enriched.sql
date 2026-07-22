-- =============================================================================
-- Mart: enriched recipient profiles (recipient grain, orgs only).
--
-- Additive enrichment over mart_br_recife_quem_recebe: all `ode_*` columns are
-- LEFT-joined in and NEVER overwrite the raw credor totals. Recipients with no
-- enrichment yet keep NULL ode_* (partial enrichment is honest, not lossy).
--
--   ode_razao_social / ode_cnae_* / ode_porte / ode_situacao  ← Receita Federal
--   ode_tema           ← COALESCE(CNAE-section seed, paying-agency regex seed,
--                          'Outros') — deterministic, grounded
--   ode_resumo / ode_o_que_financia  ← plain-pt LLM vulgarization (tail)
--
-- ode_* = "open-data-enrichment" (same convention as core_subventions).
-- =============================================================================

WITH base AS (
    SELECT
        cnpj,
        ANY_VALUE(nome)                                          AS nome,
        SUM(total_pago)                                          AS total_pago,
        SUM(total_empenhado)                                     AS total_empenhado,
        SUM(subvencao_pago)                                      AS subvencao_pago,
        LOGICAL_OR(is_subvencao_any)                             AS is_subvencao,
        ARRAY_AGG(principal_orgao ORDER BY ano DESC LIMIT 1)[OFFSET(0)] AS principal_orgao,
        ANY_VALUE(source_name)                                   AS source_name,
        ANY_VALUE(source_url)                                    AS source_url,
        MAX(source_rows_updated_at)                              AS source_rows_updated_at
    FROM {{ ref('mart_br_recife_quem_recebe') }}
    GROUP BY cnpj
),

cnpj AS (
    SELECT * FROM {{ ref('stg_br_recife_enrich_cnpj') }}
),

vulgar AS (
    SELECT * FROM {{ ref('stg_br_recife_enrich_vulgar') }}
),

tema_cnae AS (
    SELECT b.cnpj, m.tema
    FROM base b
    JOIN cnpj c            ON c.cnpj = b.cnpj
    JOIN {{ ref('stg_br_recife_tema_map') }} m
        ON m.chave_tipo = 'cnae_secao' AND m.chave = c.cnae_secao
),

tema_orgao AS (
    SELECT cnpj, ARRAY_AGG(tema ORDER BY prioridade LIMIT 1)[OFFSET(0)] AS tema
    FROM (
        SELECT b.cnpj, m.tema, m.prioridade
        FROM base b
        JOIN {{ ref('stg_br_recife_tema_map') }} m
            ON m.chave_tipo = 'orgao_regex'
            AND b.principal_orgao IS NOT NULL
            AND REGEXP_CONTAINS(b.principal_orgao, m.chave)
    )
    GROUP BY cnpj
)

SELECT
    b.cnpj,
    b.nome,
    b.total_pago,
    b.total_empenhado,
    b.subvencao_pago,
    b.is_subvencao,
    b.principal_orgao,
    -- Receita Federal profile (additive)
    c.razao_social_oficial      AS ode_razao_social,
    c.cnae_codigo               AS ode_cnae_codigo,
    c.cnae_descricao            AS ode_cnae_descricao,
    c.cnae_secao                AS ode_cnae_secao,
    c.porte                     AS ode_porte,
    c.natureza_juridica         AS ode_natureza_juridica,
    c.situacao                  AS ode_situacao,
    c.municipio                 AS ode_municipio,
    c.uf                        AS ode_uf,
    -- theme (deterministic cascade)
    COALESCE(tc.tema, to_.tema, 'Outros')  AS ode_tema,
    CASE
        WHEN tc.tema IS NOT NULL THEN 'cnae'
        WHEN to_.tema IS NOT NULL THEN 'orgao'
        ELSE 'default'
    END                         AS ode_tema_fonte,
    -- plain-language (LLM)
    v.resumo                    AS ode_resumo,
    v.o_que_financia            AS ode_o_que_financia,
    v.model                     AS ode_resumo_model,
    'BRL'                       AS unit,
    b.source_name,
    b.source_url,
    b.source_rows_updated_at
FROM base b
LEFT JOIN cnpj c        ON c.cnpj = b.cnpj
LEFT JOIN vulgar v      ON v.cnpj = b.cnpj
LEFT JOIN tema_cnae tc  ON tc.cnpj = b.cnpj
LEFT JOIN tema_orgao to_ ON to_.cnpj = b.cnpj
