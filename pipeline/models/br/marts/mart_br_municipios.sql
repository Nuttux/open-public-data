-- =============================================================================
-- Mart: one row per município with its identity, population and the yearly
-- totals (pago, empenhado) — the manifest the site ships, and the peers'
-- denominator (pago per inhabitant, latest year).
-- =============================================================================

WITH tot AS (
    SELECT id_municipio, ano, pago, empenhado
    FROM {{ ref('core_br_municipio_despesas') }}
    WHERE funcao_codigo = '00' AND subfuncao_codigo = '000' AND pago > 0
),
agg AS (
    SELECT
        id_municipio,
        ARRAY_AGG(STRUCT(ano, pago, empenhado) ORDER BY ano) AS anos,
        MAX(ano) AS ano_mais_recente,
        MIN(ano) AS ano_inicio,
        ARRAY_AGG(pago ORDER BY ano DESC LIMIT 1)[OFFSET(0)] AS pago_recente
    FROM tot
    GROUP BY 1
)

SELECT
    m.id_municipio,
    m.nome,
    m.sigla_uf,
    m.nome_uf,
    m.nome_regiao,
    m.capital_uf,
    m.populacao,
    m.populacao_ano,
    m.slug,
    a.anos,
    a.ano_mais_recente,
    a.ano_inicio,
    a.pago_recente,
    SAFE_DIVIDE(a.pago_recente, m.populacao) AS pago_hab
FROM {{ ref('stg_br_municipios') }} m
JOIN agg a USING (id_municipio)
