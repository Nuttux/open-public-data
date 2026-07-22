-- =============================================================================
-- Core: Contratos — row-level OBT, one row per contract.
--
-- contrato_id = URL-safe id derived from numero_contrato ("2901.0339/2004"
-- has a slash) so the fiche route can key off it. recipient_key = the CNPJ
-- for org contractors (NULL for CPF individuals — never exposed by identity).
-- =============================================================================

SELECT
    numero_contrato,
    REGEXP_REPLACE(LOWER(numero_contrato), r'[^a-z0-9]+', '-') AS contrato_id,
    ano_contrato,
    orgao_contratante,
    objeto,
    modalidade,
    doc,
    doc_tipo,
    is_org,
    IF(is_org, doc, NULL)   AS recipient_key,
    razao_social,
    bairro,
    cidade,
    uf,
    vigencia_inicio,
    vigencia_fim,
    valor_contrato,
    valor_contrato_2,
    situacao
FROM {{ ref('stg_br_recife_contratos') }}
WHERE numero_contrato IS NOT NULL
