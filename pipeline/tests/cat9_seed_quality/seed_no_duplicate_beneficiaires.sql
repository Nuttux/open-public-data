{{ config(tags=['seed_quality']) }}
{# No duplicate pattern mappings in beneficiaires #}
SELECT pattern, COUNT(*) AS cnt
FROM {{ ref('seed_mapping_beneficiaires') }}
WHERE pattern IS NOT NULL AND pattern != ''
GROUP BY pattern
HAVING COUNT(*) > 1
