-- =============================================================================
-- Staging: Licitações — typed, concluídas + em andamento unified.
--
-- Sources: raw.br_recife_licitacoes_concluidas (23 cols, homologated value)
--          raw.br_recife_licitacoes_andamento  (10 cols, estimated only).
-- Grain:   one row per (processo × lote) for concluídas; per processo for
--          andamento. status distinguishes the two.
--
-- ⚠ Amounts here use BRAZILIAN format (',' decimal, space-padded, '.'
-- thousands) — br_amount() normalizes it. economia = estimado − homologado
-- (savings vs the reference price) on concluídas.
-- =============================================================================

WITH concluidas AS (
    SELECT
        'concluida'                                     AS status,
        {{ br_string('num_processolicitatorio') }}      AS processo_numero,
        {{ br_int('ano_processolicitatorio') }}         AS processo_ano,
        {{ br_string('numero_lote') }}                  AS lote,
        {{ br_string('modalidadeprocessolicitatorio') }} AS modalidade,
        {{ br_string('orgao_licitante') }}              AS orgao,
        {{ br_string('objeto') }}                       AS objeto,
        COALESCE({{ br_digits('cnpj_contratado') }}, {{ br_digits('cpf_contratado') }})
                                                        AS doc,
        CASE
            WHEN {{ br_digits('cnpj_contratado') }} IS NOT NULL THEN 'cnpj'
            WHEN {{ br_digits('cpf_contratado') }} IS NOT NULL THEN 'cpf'
            ELSE 'outro'
        END                                             AS doc_tipo,
        {{ br_string('razao_nomecontratado') }}         AS razao_social,
        {{ br_amount('valor_total_estimado') }}         AS valor_estimado,
        {{ br_amount('valor_totalhomologadolicitacao') }} AS valor_homologado,
        {{ br_date('data_ultimafaseprocesso') }}        AS data_conclusao,
        _synced_at
    FROM {{ source('br_recife_raw', 'br_recife_licitacoes_concluidas') }}
),

andamento AS (
    SELECT
        'andamento'                                     AS status,
        {{ br_string('numeroprocessolicitatorio') }}    AS processo_numero,
        {{ br_int('anoprocessolicitatorio') }}          AS processo_ano,
        CAST(NULL AS STRING)                            AS lote,
        {{ br_string('modalidadeprocessolicitatorio') }} AS modalidade,
        {{ br_string('orgaolicitante') }}               AS orgao,
        {{ br_string('objeto') }}                       AS objeto,
        CAST(NULL AS STRING)                            AS doc,
        'outro'                                         AS doc_tipo,
        CAST(NULL AS STRING)                            AS razao_social,
        {{ br_amount('valor_estipulado') }}             AS valor_estimado,
        CAST(NULL AS NUMERIC)                           AS valor_homologado,
        {{ br_date('dataaberturaproposta') }}           AS data_conclusao,
        _synced_at
    FROM {{ source('br_recife_raw', 'br_recife_licitacoes_andamento') }}
)

SELECT *,
    CASE WHEN valor_homologado IS NOT NULL AND valor_estimado IS NOT NULL
         THEN valor_estimado - valor_homologado END    AS economia
FROM concluidas
UNION ALL
SELECT *, CAST(NULL AS NUMERIC) AS economia FROM andamento
