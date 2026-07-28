-- Family-cut distribution self-checks, per fiscal year:
--   1. Σ histogram cells over ALL families (published + the pooled 'Other
--      roles' row) == the citywide n_employees — every person is placed in
--      exactly one family and exactly one bucket, nothing silently dropped;
--   2. Σ n_people_primary over the published families == citywide
--      n_employees — the primary-family attribution partitions the
--      workforce (a person is never counted twice, never lost);
--   3. percentiles are monotone within each family (p25 ≤ p50 ≤ p75 ≤ p90);
--   4. no NAMED family cell covers fewer than 5 people, and every family
--      carrying percentiles has ≥ 5 people (dial B).
--
-- The pooled 'Other roles' row is exempt from (4) on purpose: it names no
-- family, carries no dollars, and is arithmetically derivable anyway —
-- citywide bucket count (already published in payroll_distribution.json)
-- minus the named cells of that bucket. Suppressing it would hide nothing
-- and would break the Σ = citywide identity that (1) exists to guarantee.
{{ config(tags=['us', 'data_integrity']) }}

WITH f AS (
    SELECT
        fiscal_year,
        display_family,
        is_pooled,
        n_people_primary,
        p25_usd, p50_usd, p75_usd, p90_usd,
        (SELECT SUM(h.n_employees) FROM UNNEST(histogram) h)  AS family_hist_n,
        (SELECT MIN(h.n_employees) FROM UNNEST(histogram) h)  AS min_cell_n
    FROM {{ ref('mart_us_sf_payroll_family_distribution') }}
),

per_year AS (
    SELECT
        fiscal_year,
        SUM(family_hist_n)                                     AS hist_n,
        SUM(IF(is_pooled, 0, n_people_primary))                AS people_n
    FROM f
    GROUP BY fiscal_year
),

city AS (
    SELECT fiscal_year, n_employees AS city_n
    FROM {{ ref('mart_us_sf_payroll_distribution') }}
),

-- (1) + (2): the two partitions must both add up to the citywide count.
totals_broken AS (
    SELECT
        p.fiscal_year,
        'totals'          AS check_name,
        CAST(p.hist_n AS STRING)    AS got,
        CAST(c.city_n AS STRING)    AS expected
    FROM per_year p
    INNER JOIN city c USING (fiscal_year)
    WHERE p.hist_n != c.city_n
       OR p.people_n != c.city_n
),

-- (3) + (4): per-family shape and privacy floor.
rows_broken AS (
    SELECT
        fiscal_year,
        CONCAT('family:', display_family) AS check_name,
        CAST(min_cell_n AS STRING)        AS got,
        '>= 5'                            AS expected
    FROM f
    WHERE (NOT is_pooled AND min_cell_n < 5)
       OR (NOT is_pooled AND n_people_primary < 5)
       OR (NOT is_pooled AND NOT (p25_usd <= p50_usd
                                  AND p50_usd <= p75_usd
                                  AND p75_usd <= p90_usd))
       OR (is_pooled AND n_people_primary IS NOT NULL)
)

SELECT * FROM totals_broken
UNION ALL
SELECT * FROM rows_broken
