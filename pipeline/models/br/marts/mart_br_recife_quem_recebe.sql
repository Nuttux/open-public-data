-- =============================================================================
-- Mart: QUEM RECEBE — organisations that received municipal payments.
--
-- Source: core_br_recife_despesa, filtered to is_org (CNPJ) ONLY. CPF
-- individuals are NEVER included — no individual is ranked, searched or
-- exposed (privacy doctrine). Grain: recipient_key (CNPJ) × ano.
--
-- subvencao_pago isolates the Modalidade-50 transfer slice (subvenções to
-- private non-profits). Ranking/fiche totals roll these ano rows up in the
-- exporter. 2024 spine Σpago (orgs) ≈ R$4.x bn of the R$5.14 bn credor total
-- (the remainder is CPF individuals — mostly payroll/leases — kept out).
-- =============================================================================

WITH org_rows AS (
    SELECT * FROM {{ ref('core_br_recife_despesa') }}
    WHERE is_org AND recipient_key IS NOT NULL
),

-- canonical display name per CNPJ (most frequent spelling across all rows)
names AS (
    SELECT
        recipient_key,
        APPROX_TOP_COUNT(nome_credor, 1)[OFFSET(0)].value AS nome
    FROM org_rows
    WHERE nome_credor IS NOT NULL
    GROUP BY 1
),

by_year AS (
    SELECT
        recipient_key,
        ano,
        COUNT(*)                                     AS n_empenhos,
        SUM(pago_liquido)                            AS total_pago,
        SUM(empenhado)                               AS total_empenhado,
        SUM(IF(is_subvencao, pago_liquido, 0))       AS subvencao_pago,
        LOGICAL_OR(is_subvencao)                     AS is_subvencao_any,
        COUNT(DISTINCT orgao)                        AS n_orgaos,
        APPROX_TOP_COUNT(orgao, 1)[OFFSET(0)].value  AS principal_orgao
    FROM org_rows
    GROUP BY 1, 2
),

provenance AS (
    SELECT
        ANY_VALUE(dataset_title)     AS source_name,
        ANY_VALUE(dataset_page_url)  AS source_url,
        ANY_VALUE(portal_name)       AS source_portal,
        ANY_VALUE(license_title)     AS source_license,
        MAX(rows_updated_at)         AS rows_updated_at
    FROM {{ ref('stg_br_recife_catalog') }}
    WHERE source_id LIKE 'credor_%'
)

SELECT
    y.recipient_key                  AS cnpj,
    n.nome,
    y.ano,
    y.n_empenhos,
    y.total_pago,
    y.total_empenhado,
    y.subvencao_pago,
    y.is_subvencao_any,
    y.n_orgaos,
    y.principal_orgao,
    'BRL'                            AS unit,
    p.source_name,
    p.source_url,
    p.source_portal,
    p.source_license,
    p.rows_updated_at                AS source_rows_updated_at
FROM by_year y
LEFT JOIN names n USING (recipient_key)
CROSS JOIN provenance p
