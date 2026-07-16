-- =============================================================================
-- Mart: SF budget vs actual by DEPARTMENT — Operating perimeter, closed years
--
-- Sources: core_us_sf_budget, core_us_sf_actuals, stg_us_sf_dept_names,
--          stg_us_sf_bva_outliers (GEN/PUC annotations), stg_us_sf_catalog.
-- Grain:  fiscal_year × side × department.
--
-- PERIMETER (replicates the ONLY honest comparison, measured in
-- mart_us_sf_budget_vs_actual): fund_category = 'Operating' on both sides,
-- related-government-unit rows excluded from actuals, ALL transfer
-- characters excluded from both sides. On that perimeter the citywide
-- residual runs −0.4% (FY2024) to −8.8%, with the lone −16.8% COVID
-- outlier (FY2021).
--
-- SCOPE RULES (docs/us/block-studies/1-budget.md §4):
--   - fiscal_year ≥ 2019 ONLY: department codes changed at the FY2018
--     chart-of-accounts break (49/55 codes bridge it = 81.3% of dollars);
--     pre-break department series need a crosswalk enrichment that does not
--     exist yet. Do NOT extend this mart backwards without it.
--   - Only CLOSED fiscal years (execution_status = 'closed'): the most
--     recently ended FY is still in its accounting close and would render
--     residuals that later move.
--   - GEN and PUC (Spending) carry is_structural_outlier + a measured
--     annotation from the seed: their deviations (+73.2% / −42.4% FY2024)
--     are perimeter artifacts, not execution stories. Unannotated they
--     discredit the table.
--   - RET has an Operating budget but zero Operating actuals (handled:
--     is_comparable = FALSE when either side is missing).
-- =============================================================================

WITH budget AS (
    SELECT
        fiscal_year,
        revenue_or_spending                              AS side,
        department_code,
        ANY_VALUE(department)                            AS department,
        ANY_VALUE(organization_group_code)               AS organization_group_code,
        ANY_VALUE(organization_group)                    AS organization_group,
        SUM(budget_amt)                                  AS budget_operating_usd
    FROM {{ ref('core_us_sf_budget') }}
    WHERE fiscal_year >= 2019
      AND fund_category = 'Operating'
      AND NOT is_transfer_character
    GROUP BY 1, 2, 3
    HAVING ABS(SUM(budget_amt)) > 0.005
),

actuals AS (
    SELECT
        fiscal_year,
        revenue_or_spending                              AS side,
        department_code,
        ANY_VALUE(department)                            AS department,
        ANY_VALUE(organization_group_code)               AS organization_group_code,
        ANY_VALUE(organization_group)                    AS organization_group,
        SUM(amount)                                      AS actual_operating_usd
    FROM {{ ref('core_us_sf_actuals') }}
    WHERE fiscal_year >= 2019
      AND fund_category = 'Operating'
      AND NOT is_related_govt_unit
      AND NOT is_transfer_character
    GROUP BY 1, 2, 3
    HAVING ABS(SUM(amount)) > 0.005
),

joined AS (
    SELECT
        COALESCE(b.fiscal_year, a.fiscal_year)             AS fiscal_year,
        COALESCE(b.side, a.side)                           AS side,
        COALESCE(b.department_code, a.department_code)     AS department_code,
        COALESCE(b.department, a.department)               AS department,
        COALESCE(b.organization_group_code, a.organization_group_code)
                                                           AS organization_group_code,
        COALESCE(b.organization_group, a.organization_group)
                                                           AS organization_group,
        b.budget_operating_usd,
        a.actual_operating_usd
    FROM budget b
    FULL OUTER JOIN actuals a
        USING (fiscal_year, side, department_code)
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
    j.fiscal_year,
    j.side,
    j.organization_group_code,
    j.organization_group,
    j.department_code,
    j.department,
    n.display_name                          AS department_display_name,
    j.budget_operating_usd,
    j.actual_operating_usd,
    j.actual_operating_usd - j.budget_operating_usd        AS residual_usd,
    SAFE_DIVIDE(j.actual_operating_usd - j.budget_operating_usd,
                j.budget_operating_usd)                    AS residual_pct,
    (j.budget_operating_usd IS NOT NULL
     AND j.actual_operating_usd IS NOT NULL
     AND j.budget_operating_usd > 0)                       AS is_comparable,
    COALESCE(o.is_structural_outlier, FALSE)               AS is_structural_outlier,
    o.outlier_note,
    {{ us_sf_execution_status('j.fiscal_year', basis='actuals') }}
                                            AS execution_status,
    pr.budget_source_url,
    pr.budget_rows_updated_at,
    pr.actuals_source_url,
    pr.actuals_rows_updated_at,
    'USD'                                   AS unit
FROM joined j
LEFT JOIN {{ ref('stg_us_sf_dept_names') }} n
    ON n.department_code = j.department_code
LEFT JOIN {{ ref('stg_us_sf_bva_outliers') }} o
    ON o.department_code = j.department_code
   AND o.side = j.side
CROSS JOIN provenance pr
WHERE {{ us_sf_execution_status('j.fiscal_year', basis='actuals') }} = 'closed'
