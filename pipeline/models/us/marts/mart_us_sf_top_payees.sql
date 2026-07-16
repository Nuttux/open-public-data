-- =============================================================================
-- Mart: SF top payees by fiscal year — vouchers paid per FY × vendor
--
-- Sources: core_us_sf_vouchers (8.07M rows → FY × vendor rollup),
--          stg_us_sf_payee_buckets (manual bucket classification),
--          stg_us_sf_catalog (provenance).
-- Grain:  fiscal_year × vendor, top 100 payees per FY by vouchers_paid.
--
-- READ THIS before ranking (docs/us/API-RECON.md §A.3): the top of a naive
-- ranking is banks/fiscal agents (JPMorgan $1.86B FY2025 — debt service and
-- pass-throughs), NOT service providers. `bucket` annotates the top ~40
-- FY2025 payees (fiscal_agent_debt_service / payroll_passthrough /
-- healthcare / nonprofit / supplier / other) from a MANUAL classification
-- seed; NULL bucket = unclassified. Vendor names are unkeyed portal strings
-- (BNY Mellon appears under 2 spellings — both classified in the seed).
-- =============================================================================

WITH by_vendor AS (
    SELECT
        fiscal_year,
        vendor,
        SUM(vouchers_paid)                       AS vouchers_paid_usd,
        SUM(vouchers_pending)                    AS vouchers_pending_usd,
        COUNT(DISTINCT voucher)                  AS n_vouchers,
        COUNT(*)                                 AS n_voucher_lines,
        LOGICAL_OR(is_non_profit)                AS is_non_profit,
        COUNT(DISTINCT department)               AS n_departments,
        LOGICAL_AND(is_fiscal_year_complete)     AS is_fiscal_year_complete
    FROM {{ ref('core_us_sf_vouchers') }}
    WHERE vendor IS NOT NULL
    GROUP BY fiscal_year, vendor
),

top_department AS (
    -- biggest paying department per (FY, vendor), for display context
    SELECT fiscal_year, vendor, department AS top_department
    FROM (
        SELECT
            fiscal_year, vendor, department,
            ROW_NUMBER() OVER (
                PARTITION BY fiscal_year, vendor
                ORDER BY SUM(vouchers_paid) DESC
            ) AS rn
        FROM {{ ref('core_us_sf_vouchers') }}
        WHERE vendor IS NOT NULL
        GROUP BY fiscal_year, vendor, department
    )
    WHERE rn = 1
),

fy_totals AS (
    SELECT
        fiscal_year,
        SUM(vouchers_paid_usd) AS fy_total_vouchers_paid_usd
    FROM by_vendor
    GROUP BY fiscal_year
),

ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY fiscal_year ORDER BY vouchers_paid_usd DESC
        ) AS rank_in_fy
    FROM by_vendor
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
    r.fiscal_year,
    r.rank_in_fy,
    r.vendor,
    r.vouchers_paid_usd,
    r.vouchers_pending_usd,
    r.n_vouchers,
    r.n_voucher_lines,
    r.is_non_profit,
    r.n_departments,
    td.top_department,
    r.is_fiscal_year_complete,
    SAFE_DIVIDE(r.vouchers_paid_usd, ft.fy_total_vouchers_paid_usd)  AS share_of_fy_paid,
    ft.fy_total_vouchers_paid_usd,
    pb.bucket,
    pb.classification_note,
    pb.classification_method,
    pb.classified_at,
    pr.dataset_id                          AS source_dataset_id,
    pr.dataset_name                        AS source_name,
    pr.dataset_page_url                    AS source_url,
    pr.attribution                         AS source_attribution,
    pr.rows_updated_at                     AS source_rows_updated_at,
    'USD'                                  AS unit
FROM ranked r
INNER JOIN fy_totals ft USING (fiscal_year)
LEFT JOIN top_department td USING (fiscal_year, vendor)
LEFT JOIN {{ ref('stg_us_sf_payee_buckets') }} pb
    ON pb.vendor = r.vendor
CROSS JOIN provenance pr
WHERE r.rank_in_fy <= 100
