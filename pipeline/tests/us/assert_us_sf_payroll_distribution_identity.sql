-- Distribution mart self-checks, per fiscal year:
--   1. Σ histogram buckets (0-500k) + n_at_or_above_500k == n_employees
--      (the histogram covers every employee exactly once);
--   2. percentiles are monotone (p25 ≤ p50 ≤ p75 ≤ p90 ≤ p99);
--   3. n_employees agrees with mart_us_sf_comp_by_year (both are person
--      counts from the same intermediate);
--   4. threshold counts are monotone (>$200k ≥ >$300k ≥ >$400k ≥ >$500k).
{{ config(tags=['us', 'data_integrity']) }}

WITH d AS (
    SELECT
        fiscal_year,
        n_employees,
        p25_usd, p50_usd, p75_usd, p90_usd, p99_usd,
        n_above_200k, n_above_300k, n_above_400k, n_above_500k,
        n_at_or_above_500k,
        (SELECT SUM(h.n_employees) FROM UNNEST(histogram_under_500k) h) AS histogram_n
    FROM {{ ref('mart_us_sf_payroll_distribution') }}
),

y AS (
    SELECT fiscal_year, n_employees AS by_year_n
    FROM {{ ref('mart_us_sf_comp_by_year') }}
)

SELECT d.*, y.by_year_n
FROM d
LEFT JOIN y USING (fiscal_year)
WHERE d.histogram_n + d.n_at_or_above_500k != d.n_employees
   OR d.p25_usd > d.p50_usd
   OR d.p50_usd > d.p75_usd
   OR d.p75_usd > d.p90_usd
   OR d.p90_usd > d.p99_usd
   OR d.n_above_200k < d.n_above_300k
   OR d.n_above_300k < d.n_above_400k
   OR d.n_above_400k < d.n_above_500k
   OR d.n_employees != y.by_year_n
