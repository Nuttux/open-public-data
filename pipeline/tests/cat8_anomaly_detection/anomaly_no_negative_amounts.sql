{{ config(tags=['anomaly_detection'], severity='warn') }}
{# No negative amounts in core budget or subventions #}
WITH negatives AS (
    SELECT 'core_budget' AS model, COUNT(*) AS cnt
    FROM {{ ref('core_budget') }}
    WHERE montant < 0

    UNION ALL

    SELECT 'core_subventions', COUNT(*)
    FROM {{ ref('core_subventions') }}
    WHERE montant < 0

    UNION ALL

    SELECT 'core_budget_vote', COUNT(*)
    FROM {{ ref('core_budget_vote') }}
    WHERE montant < 0
)
SELECT model, cnt AS negative_count
FROM negatives
WHERE cnt > 0
