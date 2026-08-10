-- =============================================================================
-- Staging: Despesa por Credor Empenho — typed, one row per empenho × month.
--
-- Sources: raw.br_recife_despesa_credor_{2024,2025,2026} (all strings).
-- Grain:   ano × mês × empenho (credor × órgão × modalidade × movement).
--
-- Key decisions (audited live 2026-07-22):
--   - The "Grupo de Despesa" raw column is a mislabeled doc-type field
--     (constant 'EMPENHO') — NOT exposed. The transfer/subvenção cut is
--     Modalidade de Aplicação code 50 → is_subvencao.
--   - CPF/CNPJ share one column: split by digit length into doc + doc_tipo.
--     is_org = CNPJ. Privacy: person (CPF) rows are kept for budget totals
--     but marts NEVER expose CPF identities (quem_recebe filters is_org).
--   - Amounts are '.'-decimal here; pago_liquido nets the anulação de
--     pagamento (gross pagamento minus its cancellation).
-- =============================================================================

{% set years = [2024, 2025, 2026] %}

WITH unioned AS (
{% for y in years %}
    SELECT *, {{ y }} AS _src_year FROM {{ source('br_recife_raw', 'br_recife_despesa_credor_' ~ y) }}
    {% if not loop.last %}UNION ALL{% endif %}
{% endfor %}
)

SELECT
    {{ br_int('ano') }}                              AS ano,
    {{ br_int('mes') }}                              AS mes,
    {{ br_string('codigo_da_unidade') }}             AS unidade_codigo,
    {{ br_string('unidade') }}                       AS unidade,
    {{ br_string('codigo_do_orgao') }}               AS orgao_codigo,
    {{ br_string('orgao') }}                         AS orgao,
    {{ br_digits('cpf_cnpj') }}                      AS doc,
    {{ br_doc_tipo('cpf_cnpj') }}                    AS doc_tipo,
    {{ br_doc_tipo('cpf_cnpj') }} = 'cnpj'           AS is_org,
    {{ br_string('nome_do_credor') }}                AS nome_credor,
    {{ br_string('codigo_de_tipo_de_licitacao') }}   AS tipo_licitacao_codigo,
    {{ br_string('tipo_de_licitacao') }}             AS tipo_licitacao,
    {{ br_string('modadlidade_do_empenho') }}        AS tipo_empenho,
    {{ br_string('poder') }}                         AS poder,
    {{ br_string('codigo_de_modalidade') }}          AS modalidade_aplicacao_codigo,
    {{ br_string('modalidade') }}                    AS modalidade_aplicacao,
    {{ br_string('codigo_de_modalidade') }} = '50'   AS is_subvencao,
    {{ br_date('data_do_empenho') }}                 AS data_empenho,
    {{ br_amount('empenhado') }}                     AS empenhado,
    {{ br_amount('liquidacao') }}                    AS liquidado,
    {{ br_amount('pagamento') }}                     AS pago,
    {{ br_amount('anulacao_empenho') }}              AS anulacao_empenho,
    {{ br_amount('anulacao_liquidacao') }}           AS anulacao_liquidacao,
    {{ br_amount('anulacao_pagamento') }}            AS anulacao_pagamento,
    {{ br_amount('pagamento') }} - COALESCE({{ br_amount('anulacao_pagamento') }}, 0)
                                                     AS pago_liquido,
    {{ br_amount('dotacao_inicial') }}               AS dotacao_inicial,
    {{ br_amount('dotacao_atualizada') }}            AS dotacao_atualizada,
    _synced_at
FROM unioned
