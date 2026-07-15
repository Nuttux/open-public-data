-- =============================================================================
-- Core: US public debt outstanding — daily + annual long series (OBT)
--
-- Sources:
--   - stg_us_debt_to_penny   : daily since 1993-04-01, with public/intragov
--                              breakout (series = 'daily')
--   - stg_us_debt_outstanding: fiscal-year-end since 1790, total only
--                              (series = 'annual_fy_end')
-- Grain: (series, record_date).
--
-- Amounts in DOLLARS. The two series overlap 1993+ and can differ slightly
-- at FY-end (Historical Debt Outstanding includes FFB debt in TPDO; Debt to
-- the Penny counts FFB inside intragov holdings — both per the datasets'
-- published notes). Never mix the two series in one line chart segment;
-- the mart keeps them separate.
-- =============================================================================

WITH daily AS (
    SELECT
        'daily'                  AS series,
        record_date,
        fiscal_year,
        debt_held_public_amt,
        intragov_hold_amt,
        tot_pub_debt_out_amt,
        'USD'                    AS unit,
        _synced_at
    FROM {{ ref('stg_us_debt_to_penny') }}
),

annual AS (
    SELECT
        'annual_fy_end'          AS series,
        record_date,
        fiscal_year,
        CAST(NULL AS NUMERIC)    AS debt_held_public_amt,
        CAST(NULL AS NUMERIC)    AS intragov_hold_amt,
        debt_outstanding_amt     AS tot_pub_debt_out_amt,
        'USD'                    AS unit,
        _synced_at
    FROM {{ ref('stg_us_debt_outstanding') }}
)

SELECT * FROM daily
UNION ALL
SELECT * FROM annual
