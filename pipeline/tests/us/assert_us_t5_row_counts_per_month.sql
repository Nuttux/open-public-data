-- Row-count sanity for MTS Table 5 (API-RECON §B.2): ~802 rows per month
-- (band 700-900 to absorb account-level churn), and EXACTLY 29 agency
-- total rows (T|C — verified stable across the full history 2026-07-15).
{{ config(tags=['us', 'row_count_freshness']) }}

SELECT
    record_date,
    COUNT(*) AS n_rows,
    COUNTIF(data_type_cd = 'T' AND record_type_cd = 'C') AS n_agency_totals
FROM {{ ref('stg_us_mts_table_5') }}
GROUP BY record_date
HAVING n_rows < 700
    OR n_rows > 900
    OR n_agency_totals != 29
