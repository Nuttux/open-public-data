-- =============================================================================
-- Staging: Licitações — typed, concluídas + em andamento unified.
--
-- Sources: raw.br_recife_licitacoes_concluidas (23 cols, homologated value)
--          raw.br_recife_licitacoes_andamento  (10 cols, estimated only).
-- Grain:   ONE ROW PER PROCESSO for both statuses.
--
-- ⚠ Amounts here use BRAZILIAN format (',' decimal, space-padded, '.'
-- thousands) — br_amount() normalizes it.
--
-- ⚠ GRAIN TRAP (fixed 2026-07-25). The concluídas file is published at
-- (processo × lote × fornecedor) — 21 981 rows — but
-- `valor_totalhomologadolicitacao` is the total for the WHOLE processo,
-- repeated identically on every one of its rows. Verified live: partitioned by
-- (comissão, ano, número) there are 4 891 processos and ZERO of them carry
-- more than one distinct value for that column (same for estimado, modalidade,
-- órgão, objeto — all processo-level attributes).
--
-- Summing it row-level therefore multi-counted every multi-lot tender and put
-- R$ 103.9 bn on the site — 5.6× the true R$ 18.4 bn, and more than 11× the
-- city's annual budget. It also flipped the modalidade ranking (PREGÃO
-- PRESENCIAL read as R$ 31.5 bn / #2; it is really R$ 979 M / #3).
--
-- So we aggregate to processo here: the processo-level money columns are taken
-- with MAX (constant within the group), while `valor_licitacao_lote` — the one
-- genuinely per-lot column — is SUMmed into valor_lotes and the lot/vendor
-- counts are kept so the page can still say how many lots and bidders a
-- tender had. The winning supplier shown is the one with the largest lot total.
-- =============================================================================

WITH concluidas_lotes AS (
    SELECT
        {{ br_string('comissao_licitacao') }}            AS comissao,
        {{ br_string('num_processolicitatorio') }}       AS processo_numero,
        {{ br_int('ano_processolicitatorio') }}          AS processo_ano,
        {{ br_string('numero_lote') }}                   AS lote,
        {{ br_string('modalidadeprocessolicitatorio') }} AS modalidade,
        {{ br_string('orgao_licitante') }}               AS orgao,
        {{ br_string('objeto') }}                        AS objeto,
        COALESCE({{ br_digits('cnpj_contratado') }}, {{ br_digits('cpf_contratado') }})
                                                         AS doc,
        CASE
            WHEN {{ br_digits('cnpj_contratado') }} IS NOT NULL THEN 'cnpj'
            WHEN {{ br_digits('cpf_contratado') }} IS NOT NULL THEN 'cpf'
            ELSE 'outro'
        END                                              AS doc_tipo,
        {{ br_string('razao_nomecontratado') }}          AS razao_social,
        {{ br_amount('valor_total_estimado') }}          AS valor_estimado_processo,
        {{ br_amount('valor_totalhomologadolicitacao') }} AS valor_homologado_processo,
        {{ br_amount('valor_licitacao_lote') }}          AS valor_lote,
        {{ br_date('data_ultimafaseprocesso') }}         AS data_conclusao,
        _synced_at
    FROM {{ source('br_recife_raw', 'br_recife_licitacoes_concluidas') }}
),

-- Winning supplier per processo = largest summed lot value. Deterministic
-- tiebreak on doc so rebuilds are stable.
fornecedor_principal AS (
    SELECT comissao, processo_numero, processo_ano, doc, doc_tipo, razao_social
    FROM (
        SELECT
            comissao, processo_numero, processo_ano, doc, doc_tipo, razao_social,
            ROW_NUMBER() OVER (
                PARTITION BY comissao, processo_numero, processo_ano
                ORDER BY SUM(valor_lote) DESC, doc
            ) AS rn
        FROM concluidas_lotes
        GROUP BY comissao, processo_numero, processo_ano, doc, doc_tipo, razao_social
    )
    WHERE rn = 1
),

concluidas AS (
    SELECT
        'concluida'                          AS status,
        l.comissao,
        l.processo_numero,
        l.processo_ano,
        ANY_VALUE(l.modalidade)              AS modalidade,
        ANY_VALUE(l.orgao)                   AS orgao,
        ANY_VALUE(l.objeto)                  AS objeto,
        ANY_VALUE(f.doc)                     AS doc,
        ANY_VALUE(f.doc_tipo)                AS doc_tipo,
        ANY_VALUE(f.razao_social)            AS razao_social,
        MAX(l.valor_estimado_processo)       AS valor_estimado,
        MAX(l.valor_homologado_processo)     AS valor_homologado,
        SUM(l.valor_lote)                    AS valor_lotes,
        COUNT(*)                             AS n_lotes,
        COUNT(DISTINCT l.doc)                AS n_fornecedores,
        MAX(l.data_conclusao)                AS data_conclusao,
        MAX(l._synced_at)                    AS _synced_at
    FROM concluidas_lotes l
    LEFT JOIN fornecedor_principal f
      ON  f.comissao         = l.comissao
      AND f.processo_numero  = l.processo_numero
      AND f.processo_ano     = l.processo_ano
    GROUP BY l.comissao, l.processo_numero, l.processo_ano
),

andamento AS (
    SELECT
        'andamento'                                      AS status,
        {{ br_string('comissaolicitacao') }}             AS comissao,
        {{ br_string('numeroprocessolicitatorio') }}     AS processo_numero,
        {{ br_int('anoprocessolicitatorio') }}           AS processo_ano,
        {{ br_string('modalidadeprocessolicitatorio') }} AS modalidade,
        {{ br_string('orgaolicitante') }}                AS orgao,
        {{ br_string('objeto') }}                        AS objeto,
        CAST(NULL AS STRING)                             AS doc,
        'outro'                                          AS doc_tipo,
        CAST(NULL AS STRING)                             AS razao_social,
        {{ br_amount('valor_estipulado') }}              AS valor_estimado,
        CAST(NULL AS NUMERIC)                            AS valor_homologado,
        CAST(NULL AS NUMERIC)                            AS valor_lotes,
        0                                                AS n_lotes,
        0                                                AS n_fornecedores,
        {{ br_date('dataaberturaproposta') }}            AS data_conclusao,
        _synced_at
    FROM {{ source('br_recife_raw', 'br_recife_licitacoes_andamento') }}
)

SELECT *,
    CASE WHEN valor_homologado IS NOT NULL AND valor_estimado IS NOT NULL
         THEN valor_estimado - valor_homologado END      AS economia
FROM concluidas
UNION ALL
SELECT *, CAST(NULL AS NUMERIC) AS economia FROM andamento
