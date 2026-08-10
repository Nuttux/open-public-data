-- DataSF budget self-check (API-RECON §A.1, §D.3.2): SF adopts a balanced
-- budget — per fiscal year, SUM(Revenue) must equal SUM(Spending).
-- Verified live 2026-07-15 within $5 across FY2010-FY2027; tolerance $10.
{{ config(tags=['us', 'accounting_balance']) }}

WITH by_side AS (
    SELECT
        fiscal_year,
        SUM(IF(revenue_or_spending = 'Revenue', budget_amt, 0))  AS revenue_usd,
        SUM(IF(revenue_or_spending = 'Spending', budget_amt, 0)) AS spending_usd
    FROM {{ ref('core_us_sf_budget') }}
    GROUP BY fiscal_year
)

SELECT
    fiscal_year,
    revenue_usd,
    spending_usd,
    revenue_usd - spending_usd AS diff_usd
FROM by_side
WHERE ABS(revenue_usd - spending_usd) > 10
