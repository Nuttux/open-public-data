-- =============================================================================
-- Mart: SF budget vs actual — candidate reconciliation perimeters, measured
--
-- Sources: core_us_sf_budget, core_us_sf_actuals, stg_us_sf_catalog.
-- Grain:  fiscal_year × side (Revenue | Spending), FY2010+ (budget floor).
--
-- WHY THIS TABLE EXISTS (docs/us/API-RECON.md §A.2/§A.7.3): the budget is
-- net, the actuals are closer to gross, and a naive comparison is off by
-- billions. Rather than assert a reconciliation rule, this mart MEASURES
-- the candidate perimeters so the residual per FY is a queryable fact:
--
--   budget_net_usd            : SUM(budget) — includes negative Transfer
--                               Adjustment rows (the published net total)
--   budget_excl_transfers_usd : minus ALL transfer characters (in/out/adj)
--   actual_all_usd            : naive SUM(amount) — NB the actuals ALSO
--                               contain negative Transfer Adjustment rows,
--                               so this is already partially netted
--   actual_excl_rgu_usd       : minus related_govt_units='Yes' rows
--                               (entities absent from the budget dataset)
--   actual_excl_rgu_excl_transfers_usd : minus RGU rows AND all transfer
--                               characters — the same perimeter as
--                               budget_excl_transfers_usd
--
-- The honest comparison pair is the *_excl_transfers one (identical
-- character perimeter on both sides, related-government entities removed).
-- The residual (actual − budget) on that pair is real over/under-execution
-- + supplemental appropriations, NOT accounting noise. The export decision
-- based on these measurements is documented in export_us_sf.py.
-- =============================================================================

WITH budget AS (
    SELECT
        fiscal_year,
        revenue_or_spending                                     AS side,
        SUM(budget_amt)                                         AS budget_net_usd,
        SUM(IF(NOT is_transfer_character, budget_amt, 0))       AS budget_excl_transfers_usd,
        SUM(IF(is_transfer_character, budget_amt, 0))           AS budget_transfers_usd,
        SUM(IF(is_transfer_adjustment, budget_amt, 0))          AS budget_transfer_adjustments_usd
    FROM {{ ref('core_us_sf_budget') }}
    GROUP BY fiscal_year, revenue_or_spending
),

actuals AS (
    SELECT
        fiscal_year,
        revenue_or_spending                                     AS side,
        SUM(amount)                                             AS actual_all_usd,
        SUM(IF(is_related_govt_unit, amount, 0))                AS actual_rgu_usd,
        SUM(IF(NOT is_related_govt_unit, amount, 0))            AS actual_excl_rgu_usd,
        SUM(IF(NOT is_related_govt_unit AND is_transfer_character, amount, 0))
                                                                AS actual_transfers_usd,
        SUM(IF(NOT is_related_govt_unit AND NOT is_transfer_character, amount, 0))
                                                                AS actual_excl_rgu_excl_transfers_usd,
        LOGICAL_AND(is_fiscal_year_complete)                    AS is_fiscal_year_complete
    FROM {{ ref('core_us_sf_actuals') }}
    GROUP BY fiscal_year, revenue_or_spending
),

provenance AS (
    SELECT
        b.dataset_page_url  AS budget_source_url,
        b.rows_updated_at   AS budget_rows_updated_at,
        a.dataset_page_url  AS actuals_source_url,
        a.rows_updated_at   AS actuals_rows_updated_at
    FROM (SELECT DISTINCT dataset_page_url, rows_updated_at
          FROM {{ ref('stg_us_sf_catalog') }} WHERE source_id = 'sf_budget') b
    CROSS JOIN (SELECT DISTINCT dataset_page_url, rows_updated_at
          FROM {{ ref('stg_us_sf_catalog') }} WHERE source_id = 'sf_spending_revenue') a
)

SELECT
    COALESCE(b.fiscal_year, a.fiscal_year)  AS fiscal_year,
    COALESCE(b.side, a.side)                AS side,
    b.budget_net_usd,
    b.budget_excl_transfers_usd,
    b.budget_transfers_usd,
    b.budget_transfer_adjustments_usd,
    a.actual_all_usd,
    a.actual_rgu_usd,
    a.actual_excl_rgu_usd,
    a.actual_transfers_usd,
    a.actual_excl_rgu_excl_transfers_usd,
    a.is_fiscal_year_complete,
    -- candidate residuals (actual − budget), per perimeter
    a.actual_excl_rgu_usd - b.budget_net_usd
        AS residual_net_perimeter_usd,
    a.actual_excl_rgu_excl_transfers_usd - b.budget_excl_transfers_usd
        AS residual_excl_transfers_usd,
    SAFE_DIVIDE(a.actual_excl_rgu_usd - b.budget_net_usd, b.budget_net_usd)
        AS residual_net_perimeter_pct,
    SAFE_DIVIDE(a.actual_excl_rgu_excl_transfers_usd - b.budget_excl_transfers_usd,
                b.budget_excl_transfers_usd)
        AS residual_excl_transfers_pct,
    pr.budget_source_url,
    pr.budget_rows_updated_at,
    pr.actuals_source_url,
    pr.actuals_rows_updated_at,
    'USD' AS unit
FROM budget b
FULL OUTER JOIN actuals a
    USING (fiscal_year, side)
CROSS JOIN provenance pr
