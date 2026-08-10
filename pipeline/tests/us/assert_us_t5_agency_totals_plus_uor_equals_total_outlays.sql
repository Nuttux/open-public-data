-- MTS Table 5 self-check (verified live 2026-07-15, exact to the penny):
-- Σ(agency T|C net outlays, core_us_outlays_by_agency)
--   + 'Total--Undistributed Offsetting Receipts' SL row
--   = 'Total Outlays' SL row, per record_date.
-- Guards the agency extraction recipe against hierarchy drift. Tolerance $0.01.
{{ config(tags=['us', 'accounting_balance']) }}

WITH agencies AS (
    SELECT
        record_date,
        SUM(current_fytd_net_outlay_amt) AS sum_agencies_fytd
    FROM {{ ref('core_us_outlays_by_agency') }}
    GROUP BY record_date
),

uor AS (
    SELECT
        record_date,
        current_fytd_net_outlay_amt AS uor_fytd
    FROM {{ ref('stg_us_mts_table_5') }}
    WHERE record_type_cd = 'SL'
      AND classification_desc = 'Total--Undistributed Offsetting Receipts'
),

total AS (
    SELECT
        record_date,
        current_fytd_net_outlay_amt AS total_fytd
    FROM {{ ref('stg_us_mts_table_5') }}
    WHERE record_type_cd = 'SL'
      AND classification_desc = 'Total Outlays'
)

SELECT
    a.record_date,
    a.sum_agencies_fytd,
    u.uor_fytd,
    t.total_fytd,
    a.sum_agencies_fytd + u.uor_fytd - t.total_fytd AS diff_fytd
FROM agencies a
FULL OUTER JOIN uor u USING (record_date)
FULL OUTER JOIN total t USING (record_date)
WHERE ABS(COALESCE(a.sum_agencies_fytd, 0) + COALESCE(u.uor_fytd, 0) - COALESCE(t.total_fytd, 0)) > 0.01
