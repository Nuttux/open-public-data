-- =============================================================================
-- Mart: SF payee materiality lines — "what a payment buys"
--
-- Sources: stg_us_sf_payee_materiality (curated picks), core_us_sf_vouchers
--          (the amounts), stg_us_sf_catalog (provenance).
-- Grain:  one row per curated line (slug).
--
-- The seed picks WHICH (vendor × department × sub_object × fiscal_year)
-- lines to feature — jail meals, election interpreters, Port lumber, Fire
-- uniforms, Muni light-rail cars, homelessness building purchases (all
-- verified against live vouchers 2026-07-16, docs/us/block-studies/
-- 2-payees.md §1.7). The DOLLAR AMOUNT is always computed here from the
-- voucher rows (zero-hardcode). INNER JOIN: a pick that stops matching
-- disappears from the export and fails
-- tests/us/assert_us_sf_materiality_rows_match.sql.
-- =============================================================================

WITH picks AS (
    SELECT * FROM {{ ref('stg_us_sf_payee_materiality') }}
),

amounts AS (
    SELECT
        p.slug,
        ANY_VALUE(v.object)   AS object,
        SUM(v.vouchers_paid)  AS amount_usd,
        COUNT(*)              AS n_voucher_lines
    FROM picks p
    INNER JOIN {{ ref('core_us_sf_vouchers') }} v
        ON  v.vendor      = p.vendor
        AND v.department  = p.department
        AND v.sub_object  = p.sub_object
        AND v.fiscal_year = p.fiscal_year
    GROUP BY p.slug
),

provenance AS (
    SELECT DISTINCT
        dataset_id,
        dataset_name,
        dataset_page_url,
        attribution,
        rows_updated_at
    FROM {{ ref('stg_us_sf_catalog') }}
    WHERE source_id = 'sf_vouchers'
)

SELECT
    p.slug,
    p.label,
    p.editorial_note,
    p.vendor,
    p.department,
    a.object,
    p.sub_object,
    p.fiscal_year,
    a.amount_usd,
    a.n_voucher_lines,
    {{ us_sf_execution_status('p.fiscal_year') }}  AS execution_status,
    p.method                               AS curation_method,
    p.added_at                             AS curated_at,
    pr.dataset_id                          AS source_dataset_id,
    pr.dataset_name                        AS source_name,
    pr.dataset_page_url                    AS source_url,
    pr.attribution                         AS source_attribution,
    pr.rows_updated_at                     AS source_rows_updated_at,
    'USD'                                  AS unit
FROM picks p
INNER JOIN amounts a USING (slug)
CROSS JOIN provenance pr
