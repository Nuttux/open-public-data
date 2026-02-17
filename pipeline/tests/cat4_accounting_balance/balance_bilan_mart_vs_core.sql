{{ config(tags=['accounting_balance']) }}
WITH mart AS (
    SELECT annee, total_actif_net, total_passif_net
    FROM {{ ref('mart_bilan_sankey') }}
    WHERE vue = 'summary'
),
core AS (
    SELECT annee,
        SUM(CASE WHEN type_bilan = 'Actif' THEN montant_net ELSE 0 END) AS core_actif,
        SUM(CASE WHEN type_bilan = 'Passif' THEN montant_net ELSE 0 END) AS core_passif
    FROM {{ ref('core_bilan_comptable') }}
    GROUP BY annee
)
SELECT m.annee,
    m.total_actif_net, c.core_actif,
    m.total_passif_net, c.core_passif
FROM mart m
JOIN core c ON m.annee = c.annee
WHERE ABS(m.total_actif_net - c.core_actif) > 1.0
   OR ABS(m.total_passif_net - c.core_passif) > 1.0
