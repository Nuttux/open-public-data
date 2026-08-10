{{ config(tags=['seed_quality']) }}
{# No duplicate direction mappings #}
SELECT direction, COUNT(*) AS cnt
FROM {{ ref('seed_mapping_directions') }}
WHERE direction IS NOT NULL AND direction != ''
GROUP BY direction
HAVING COUNT(*) > 1
