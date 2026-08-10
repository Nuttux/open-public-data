-- =============================================================================
-- Core: SF Budget OBT — row-level adopted AAO budget lines
--
-- Source: stg_us_sf_budget
-- Grain:  row-level (FY × side × org/dept/program × character/object/
--         sub_object × fund hierarchy) — rollups live in marts (ADR-0001).
--
-- Adds reconciliation-relevant flags (see mart_us_sf_budget_vs_actual):
--   - is_transfer_adjustment: the embedded NEGATIVE "Transfer Adjustment"
--     rows that net the budget total — kept, never dropped (naive
--     SUM(budget_amt) is net precisely because of them).
--   - is_transfer_character: any transfer character (in/out/adjustment) —
--     the transfer perimeter used when comparing against gross actuals.
--   - is_fiscal_year_complete: SF fiscal year N runs Jul 1 (N-1) → Jun 30 N;
--     FY2027 is present because SF budgets two years at a time.
-- =============================================================================

WITH budget AS (
    SELECT *
    FROM {{ ref('stg_us_sf_budget') }}
)

SELECT
    *,
    STARTS_WITH(UPPER(COALESCE(character, '')), 'TRANSFER ADJUSTMENT')
                                                       AS is_transfer_adjustment,
    UPPER(COALESCE(character, '')) LIKE '%TRANSFER%'   AS is_transfer_character,
    CURRENT_DATE('America/Los_Angeles') > DATE(fiscal_year, 6, 30)
                                                       AS is_fiscal_year_complete
FROM budget
