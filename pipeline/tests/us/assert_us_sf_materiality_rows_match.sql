-- Every curated "what a payment buys" pick must still match real voucher
-- rows with a positive amount. The mart INNER JOINs picks to vouchers, so
-- a pick whose (vendor × department × sub_object × FY) tuple stops
-- matching would silently vanish from the export — this test surfaces it
-- instead, forcing the seed to be re-curated against the refreshed data.
{{ config(tags=['us', 'seed_quality']) }}

SELECT
    s.slug,
    s.vendor,
    s.department,
    s.sub_object,
    s.fiscal_year,
    m.amount_usd
FROM {{ ref('stg_us_sf_payee_materiality') }} s
LEFT JOIN {{ ref('mart_us_sf_payee_materiality') }} m USING (slug)
WHERE m.slug IS NULL
   OR m.amount_usd <= 0
