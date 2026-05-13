{{ config(tags=['cross_layer']) }}
{# Mart deliberations doit préserver le nombre d'articles par session
   (le grain est ligne article ; pas de dédup en mart). #}
WITH mart AS (
    SELECT session_id, COUNT(*) AS n_articles
    FROM {{ ref('mart_deliberations') }}
    GROUP BY session_id
),
core AS (
    SELECT session_id, COUNT(*) AS n_articles
    FROM {{ ref('core_deliberations') }}
    GROUP BY session_id
)
SELECT m.session_id, m.n_articles AS mart_n, c.n_articles AS core_n
FROM mart m
FULL OUTER JOIN core c ON m.session_id = c.session_id
WHERE COALESCE(m.n_articles, -1) != COALESCE(c.n_articles, -1)
