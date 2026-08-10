-- Cross-table self-check: Table 9A (function × subfunction) has no
-- data_type_cd; verified live 2026-07-15 that its rows are clean detail —
-- Σ(all 9A rows) per record_date must equal the Table 9 outlays T-row.
-- Guards against Treasury ever adding embedded totals to 9A. Tolerance $0.01.
{{ config(tags=['us', 'accounting_balance', 'cross_layer']) }}

WITH t9a AS (
    SELECT
        record_date,
        SUM(current_month_amt) AS sum_month,
        SUM(current_fytd_amt)  AS sum_fytd
    FROM {{ ref('stg_us_mts_table_9_outlays_functions_subfunctions') }}
    GROUP BY record_date
),

t9 AS (
    SELECT
        record_date,
        current_month_amt,
        current_fytd_amt
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'T' AND section = 'outlays'
)

SELECT
    t9a.record_date,
    t9a.sum_fytd,
    t9.current_fytd_amt AS t9_fytd,
    t9a.sum_fytd - t9.current_fytd_amt AS diff_fytd
FROM t9a
FULL OUTER JOIN t9 USING (record_date)
WHERE ABS(COALESCE(t9a.sum_month, 0) - COALESCE(t9.current_month_amt, 0)) > 0.01
   OR ABS(COALESCE(t9a.sum_fytd, 0) - COALESCE(t9.current_fytd_amt, 0)) > 0.01
