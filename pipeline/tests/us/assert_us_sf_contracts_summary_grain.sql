-- BLOCK 3 BINDING GRAIN TEST (docs/us/block-studies/3-contracts.md §CI):
-- the contracts summary mart must equal the prime-dedupe total computed
-- directly from core — and must NOT be the all-rows sum, which inflates
-- agreed by ~$8.1B of subcontractor/JV team rows.
--
-- Three conditions, any failure returns rows:
--   1. identity: mart SUM(agreed_usd) == core prime-row SUM(agreed_amt)
--      over non-null contract_no, to the cent;
--   2. anti-double-count: the all-rows sum must exceed the mart total by
--      at least $4B (the measured sub/JV inflation is ~$8.1B — if the gap
--      collapses, the mart started absorbing team rows or the source
--      stopped publishing them);
--   3. reference band: $93,057,642,487.26 measured 2026-07-16 (prime-dedupe
--      over core, the study's "$93.06B"); the register grows weekly →
--      assert within 2% rather than exactly.
{{ config(tags=['us', 'accounting_balance']) }}

WITH mart AS (
    SELECT
        SUM(agreed_usd)  AS mart_agreed,
        COUNT(*)         AS mart_rows
    FROM {{ ref('mart_us_sf_contracts_summary') }}
),

core_prime AS (
    SELECT
        SUM(agreed_amt)              AS prime_agreed,
        COUNT(DISTINCT contract_no)  AS prime_contracts
    FROM {{ ref('core_us_sf_contracts') }}
    WHERE is_prime_contractor_row AND contract_no IS NOT NULL
),

core_all AS (
    SELECT SUM(agreed_amt) AS all_rows_agreed
    FROM {{ ref('core_us_sf_contracts') }}
)

SELECT
    mart_agreed,
    prime_agreed,
    all_rows_agreed,
    mart_rows,
    prime_contracts,
    93057642487 AS reference_usd_2026_07_16
FROM mart, core_prime, core_all
WHERE ABS(mart_agreed - prime_agreed) > 0.01
   OR mart_rows != prime_contracts
   OR all_rows_agreed - mart_agreed < 4e9
   OR ABS(SAFE_DIVIDE(mart_agreed, 93057642487) - 1) > 0.02
