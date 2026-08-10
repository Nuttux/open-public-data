{{ config(tags=['seed_quality']) }}
{# No duplicate pattern_match in lieux connus #}
SELECT pattern_match, COUNT(*) AS cnt
FROM {{ ref('seed_lieux_connus') }}
WHERE pattern_match IS NOT NULL AND pattern_match != ''
GROUP BY pattern_match
HAVING COUNT(*) > 1
