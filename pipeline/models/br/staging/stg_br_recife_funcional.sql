-- =============================================================================
-- Staging: Despesa Funcional Programática — typed, budget by function.
--
-- Sources: raw.br_recife_funcional_{2024,2025,2026} (all strings).
-- Grain:   ano × mês × função × subfunção × programa × ação × fonte.
--
-- Grain note (verified live 2026-07-22): "Pago"/"Empenhado" are MONTHLY
-- INCREMENTAL movements (values swing up and down month to month — not YTD
-- cumulative), so summing across months is correct. mês=0 rows carry the
-- opening dotação with pago=0. 2024 Σpago = R$8.97 bn — the full executed
-- municipal spend (the credor spine is a R$5.14 bn subset: identified
-- creditors only).
-- =============================================================================

{% set years = [2024, 2025, 2026] %}

WITH unioned AS (
{% for y in years %}
    SELECT * FROM {{ source('br_recife_raw', 'br_recife_funcional_' ~ y) }}
    {% if not loop.last %}UNION ALL{% endif %}
{% endfor %}
)

SELECT
    {{ br_int('ano') }}                     AS ano,
    {{ br_int('mes') }}                     AS mes,
    {{ br_string('codigo_da_funcao') }}     AS funcao_codigo,
    {{ br_string('funcao') }}               AS funcao,
    {{ br_string('codigo_de_sub_funcao') }} AS subfuncao_codigo,
    {{ br_string('sub_funcao') }}           AS subfuncao,
    {{ br_string('codigo_de_programa') }}   AS programa_codigo,
    {{ br_string('programa') }}             AS programa,
    {{ br_string('codigo_da_acao') }}       AS acao_codigo,
    {{ br_string('acao') }}                 AS acao,
    {{ br_string('codigo_da_fonte') }}      AS fonte_codigo,
    {{ br_string('fonte') }}                AS fonte,
    {{ br_amount('dotacao_inicial') }}      AS dotacao_inicial,
    {{ br_amount('dotacao_atualizada') }}   AS dotacao_atualizada,
    {{ br_amount('empenhado') }}            AS empenhado,
    {{ br_amount('liquidado') }}            AS liquidado,
    {{ br_amount('pago') }}                 AS pago,
    _synced_at
FROM unioned
