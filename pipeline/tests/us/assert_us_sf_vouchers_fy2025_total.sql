-- DataSF vouchers reference-total check (API-RECON §A.3): FY2025
-- SUM(vouchers_paid) was $16,749,409,672.83 at recon (2026-07-15) and
-- matched exactly at sync (2026-07-16). The dataset refreshes weekly and
-- FY2025 is closed but can still take late corrections → assert within
-- 0.5% of the recon reference rather than to the penny.
{{ config(tags=['us', 'accounting_balance']) }}

WITH fy2025 AS (
    SELECT SUM(vouchers_paid) AS total_paid
    FROM {{ ref('core_us_sf_vouchers') }}
    WHERE fiscal_year = 2025
)

SELECT
    total_paid,
    16749409673 AS recon_reference_usd,
    SAFE_DIVIDE(total_paid, 16749409673) - 1 AS drift_pct
FROM fy2025
WHERE ABS(SAFE_DIVIDE(total_paid, 16749409673) - 1) > 0.005
