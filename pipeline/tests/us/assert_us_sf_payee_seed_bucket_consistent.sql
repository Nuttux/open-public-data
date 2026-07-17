-- The portal publishes the SAME institution under multiple raw strings —
-- including pairs differing only by case ('NEW FLYER OF AMERICA INC' vs
-- 'New Flyer of America Inc', the legacy-caps vs PeopleSoft Title Case
-- pattern of the FY2018 migration). Both spellings deliberately get seed
-- rows (the seed matches byte-exact strings). The invariant is therefore
-- NOT case-insensitive uniqueness, but case-insensitive CONSISTENCY: all
-- spellings that fold to the same key must carry the same bucket — a
-- split classification would make the same entity appear in and out of
-- the default view depending on the year's spelling.
{{ config(tags=['us', 'seed_quality']) }}

SELECT
    UPPER(TRIM(vendor))           AS vendor_key,
    COUNT(*)                      AS n_rows,
    COUNT(DISTINCT bucket)        AS n_buckets,
    STRING_AGG(vendor, ' || ')    AS spellings,
    STRING_AGG(bucket, ' || ')    AS buckets
FROM {{ ref('stg_us_sf_payee_buckets') }}
GROUP BY 1
HAVING COUNT(DISTINCT bucket) > 1
