-- =============================================================================
-- Staging: Contratos administrativos — typed, one row per contract.
--
-- Source: raw.br_recife_contratos (all strings, full history back to 2004).
-- Grain:  one row per (numerocontrato). Separate CNPJ + CPF columns (unlike
--         the credor file's shared column). Amounts are '.'-decimal.
--
-- valorcontrato1 vs valorcontrato2: valorcontrato1 is the headline contract
-- value; valorcontrato2 is a secondary/monthly figure on some rows (e.g.
-- leases). We expose both, use valorcontrato1 as valor_contrato downstream.
-- Privacy: CPF contractors (individuals) get doc_tipo='cpf' and are never
-- exposed by identity in marts (contratos mart filters/masks to orgs).
-- =============================================================================

WITH source AS (
    SELECT * FROM {{ source('br_recife_raw', 'br_recife_contratos') }}
)

SELECT
    {{ br_string('numerocontrato') }}                AS numero_contrato,
    {{ br_int('anocontrato') }}                      AS ano_contrato,
    {{ br_string('orgaocontratante') }}              AS orgao_contratante,
    {{ br_string('objetocontrato') }}                AS objeto,
    {{ br_string('origemcontrato') }}                AS modalidade,
    {{ br_string('sequencialcompra') }}              AS sequencial_compra,
    COALESCE({{ br_digits('cnpjcontratado') }}, {{ br_digits('cpfcontratado') }})
                                                     AS doc,
    CASE
        WHEN {{ br_digits('cnpjcontratado') }} IS NOT NULL THEN 'cnpj'
        WHEN {{ br_digits('cpfcontratado') }} IS NOT NULL THEN 'cpf'
        ELSE 'outro'
    END                                              AS doc_tipo,
    {{ br_digits('cnpjcontratado') }} IS NOT NULL    AS is_org,
    {{ br_string('razaonomecontratado') }}           AS razao_social,
    {{ br_string('bairroendcontratado') }}           AS bairro,
    {{ br_string('cidadeendcontratado') }}           AS cidade,
    {{ br_string('estadoendcontratado') }}           AS uf,
    {{ br_date('datainiciovigencia') }}              AS vigencia_inicio,
    {{ br_date('datafimvigencia') }}                 AS vigencia_fim,
    {{ br_amount('valorcontrato1') }}                AS valor_contrato,
    {{ br_amount('valorcontrato2') }}                AS valor_contrato_2,
    {{ br_string('situacaocontrato') }}              AS situacao,
    _synced_at
FROM source
