-- =============================================================================
-- Core: Despesa por Credor Empenho — row-level OBT (2024-2026).
--
-- One materialized row per empenho × month, the beneficiary spine. Marts
-- aggregate this; nothing downstream reads the raw union directly.
-- recipient_key = the CNPJ for organisations (the stable fiche/URL id),
-- NULL for CPF individuals and unknown docs — so a mart GROUP BY
-- recipient_key can NEVER surface an individual (privacy doctrine).
-- =============================================================================

SELECT
    ano,
    mes,
    DATE(ano, GREATEST(LEAST(COALESCE(mes, 1), 12), 1), 1) AS periodo_mes,
    unidade_codigo,
    unidade,
    orgao_codigo,
    orgao,
    doc,
    doc_tipo,
    is_org,
    IF(is_org, doc, NULL)             AS recipient_key,
    nome_credor,
    tipo_licitacao,
    tipo_empenho,
    poder,
    modalidade_aplicacao_codigo,
    modalidade_aplicacao,
    is_subvencao,
    data_empenho,
    empenhado,
    liquidado,
    pago,
    pago_liquido,
    anulacao_pagamento,
    dotacao_inicial,
    dotacao_atualizada
FROM {{ ref('stg_br_recife_despesa') }}
