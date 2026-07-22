-- =============================================================================
-- Staging: CNPJ org-profile enrichment (Receita Federal via BrasilAPI).
-- Additive — LEFT-joined onto the credor spine; never overwrites raw.
-- =============================================================================

WITH source AS (
    SELECT * FROM {{ source('br_recife_raw', 'br_recife_enrich_cnpj') }}
)

SELECT
    {{ br_digits('cnpj') }}              AS cnpj,
    {{ br_string('razao_social') }}      AS razao_social_oficial,
    {{ br_string('nome_fantasia') }}     AS nome_fantasia,
    {{ br_string('cnae_codigo') }}       AS cnae_codigo,
    {{ br_string('cnae_descricao') }}    AS cnae_descricao,
    {{ br_string('cnae_secao') }}        AS cnae_secao,
    {{ br_string('porte') }}             AS porte,
    {{ br_string('natureza_juridica') }} AS natureza_juridica,
    {{ br_string('situacao') }}          AS situacao,
    {{ br_string('municipio') }}         AS municipio,
    {{ br_string('uf') }}                AS uf,
    {{ br_string('data_inicio_atividade') }} AS data_inicio_atividade
FROM source
QUALIFY ROW_NUMBER() OVER (PARTITION BY {{ br_digits('cnpj') }} ORDER BY _synced_at DESC) = 1
