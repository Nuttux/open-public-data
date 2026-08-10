-- End-to-end acceptance check: the total rows exported by
-- mart_us_daily_bread must equal the PUBLISHED MTS Table 9 T-rows for the
-- same record_date (receipts §1.8, outlays §2.20) — the mart totals are
-- computed as Σ(core detail), so this closes the raw → stg → core → mart
-- loop against the source's own published totals. Tolerance $0.01.
{{ config(tags=['us', 'accounting_balance', 'cross_layer']) }}

WITH mart_totals AS (
    SELECT
        record_date,
        side,
        current_fytd_amt,
        current_month_amt
    FROM {{ ref('mart_us_daily_bread') }}
    WHERE row_type = 'total'
),

published AS (
    SELECT
        record_date,
        section AS side,
        current_fytd_amt  AS published_fytd,
        current_month_amt AS published_month
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'T'
)

SELECT
    m.record_date,
    m.side,
    m.current_fytd_amt,
    p.published_fytd,
    m.current_fytd_amt - p.published_fytd AS diff_fytd
FROM mart_totals m
LEFT JOIN published p USING (record_date, side)
WHERE p.published_fytd IS NULL
   OR ABS(m.current_fytd_amt - p.published_fytd) > 0.01
   OR ABS(m.current_month_amt - p.published_month) > 0.01
