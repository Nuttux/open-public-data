{{ config(tags=['seed_quality']) }}
{# All geo coordinates in seed_lieux_connus must be within Paris bounding box #}
SELECT pattern_match, latitude, longitude
FROM {{ ref('seed_lieux_connus') }}
WHERE latitude != 0 AND longitude != 0
  AND (
    latitude < 48.815 OR latitude > 48.905
    OR longitude < 2.22 OR longitude > 2.47
  )
