-- Cross-table self-check (API-RECON §B.1/§D.3.2): the Table 9 outlays
-- T-row must equal the Table 5 'Total Outlays' SL row per record_date
-- (verified live 2026-07-15: $5,517,917,965,556.91 FYTD through 2026-06,
-- equal to the penny). Tolerance $0.01.
--
-- One documented SOURCE anomaly excluded on the prior-FYTD column only:
-- 2015-05-31 (the oldest publications restate prior-FYTD differently
-- between the two tables — off by $47,090.69; current month and FYTD agree
-- exactly for every month of the full history, verified 2026-07-15).
{{ config(tags=['us', 'accounting_balance', 'cross_layer']) }}

WITH t9 AS (
    SELECT
        record_date,
        current_month_amt,
        current_fytd_amt,
        prior_fytd_amt
    FROM {{ ref('stg_us_mts_table_9') }}
    WHERE data_type_cd = 'T' AND section = 'outlays'
),

t5 AS (
    SELECT
        record_date,
        current_month_net_outlay_amt,
        current_fytd_net_outlay_amt,
        prior_fytd_net_outlay_amt
    FROM {{ ref('stg_us_mts_table_5') }}
    WHERE record_type_cd = 'SL' AND classification_desc = 'Total Outlays'
)

SELECT
    t9.record_date,
    t9.current_fytd_amt   AS t9_fytd,
    t5.current_fytd_net_outlay_amt AS t5_fytd,
    t9.current_fytd_amt - t5.current_fytd_net_outlay_amt AS diff_fytd
FROM t9
FULL OUTER JOIN t5 USING (record_date)
WHERE ABS(COALESCE(t9.current_month_amt, 0) - COALESCE(t5.current_month_net_outlay_amt, 0)) > 0.01
   OR ABS(COALESCE(t9.current_fytd_amt, 0) - COALESCE(t5.current_fytd_net_outlay_amt, 0)) > 0.01
   OR (
        ABS(COALESCE(t9.prior_fytd_amt, 0) - COALESCE(t5.prior_fytd_net_outlay_amt, 0)) > 0.01
        AND record_date != DATE '2015-05-31'  -- documented source anomaly (prior-FYTD only)
      )
