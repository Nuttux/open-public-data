-- Row-count sanity for MTS Table 9 (API-RECON §B.1): every month must have
-- exactly 33 rows, of which 9 receipt-source detail rows (D|RSG) and
-- 19 budget-function detail rows (D|F). Verified stable across the full
-- 2015-03 → 2026-06 history on 2026-07-15.
{{ config(tags=['us', 'row_count_freshness']) }}

SELECT
    record_date,
    COUNT(*) AS n_rows,
    COUNTIF(data_type_cd = 'D' AND record_type_cd = 'RSG') AS n_receipt_sources,
    COUNTIF(data_type_cd = 'D' AND record_type_cd = 'F')   AS n_functions
FROM {{ ref('stg_us_mts_table_9') }}
GROUP BY record_date
HAVING n_rows != 33
    OR n_receipt_sources != 9
    OR n_functions != 19
