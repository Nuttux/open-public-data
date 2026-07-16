-- DataSF employee-comp year_type sanity (API-RECON §A.5 — the dataset's #1
-- trap): rows exist under BOTH 'Calendar' AND 'Fiscal' accountings of the
-- same compensation. Verified at recon: 548,140 Calendar vs 547,962 Fiscal.
-- If the split ever collapses (one side missing / wildly unbalanced), every
-- downstream year_type filter assumption breaks → fail when either side is
-- absent or the row split deviates more than 5% from parity, or an
-- unexpected year_type value appears.
{{ config(tags=['us', 'data_completeness']) }}

WITH split AS (
    SELECT
        COUNTIF(year_type = 'Calendar')                       AS n_calendar,
        COUNTIF(year_type = 'Fiscal')                         AS n_fiscal,
        COUNTIF(year_type NOT IN ('Calendar', 'Fiscal')
                OR year_type IS NULL)                         AS n_other,
        COUNT(*)                                              AS n_total
    FROM {{ ref('core_us_sf_comp') }}
)

SELECT *
FROM split
WHERE n_calendar = 0
   OR n_fiscal = 0
   OR n_other > 0
   OR ABS(n_calendar - n_fiscal) / n_total > 0.05
