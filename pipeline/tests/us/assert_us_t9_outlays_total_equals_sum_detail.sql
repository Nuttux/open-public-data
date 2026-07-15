-- MTS Table 9 self-check (API-RECON §D.3.2): published outlays T-row
-- (sequence 2.20) must equal Σ(D|F function rows) per record_date, for all
-- three amount columns. Exact to the penny in the source; tolerance $0.01.
{{ config(tags=['us', 'accounting_balance']) }}

WITH detail AS (
    SELECT
        record_date,
        SUM(current_month_amt) AS sum_month,
        SUM(current_fytd_amt)  AS sum_fytd,
        SUM(prior_fytd_amt)    AS sum_prior_fytd
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'D' AND record_type_cd = 'F'
    GROUP BY record_date
),

published AS (
    SELECT
        record_date,
        current_month_amt AS t_month,
        current_fytd_amt  AS t_fytd,
        prior_fytd_amt    AS t_prior_fytd
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'T' AND section = 'outlays'
)

SELECT
    d.record_date,
    d.sum_fytd,
    p.t_fytd,
    d.sum_fytd - p.t_fytd AS diff_fytd
FROM detail d
FULL OUTER JOIN published p USING (record_date)
WHERE ABS(COALESCE(d.sum_month, 0) - COALESCE(p.t_month, 0)) > 0.01
   OR ABS(COALESCE(d.sum_fytd, 0) - COALESCE(p.t_fytd, 0)) > 0.01
   OR ABS(COALESCE(d.sum_prior_fytd, 0) - COALESCE(p.t_prior_fytd, 0)) > 0.01
