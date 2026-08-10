{{ config(tags=['accounting_balance']) }}
WITH totals AS (
    SELECT
        annee,
        SUM(CASE WHEN type_bilan = 'Actif' THEN montant_net ELSE 0 END) AS total_actif,
        SUM(CASE WHEN type_bilan = 'Passif' THEN montant_net ELSE 0 END) AS total_passif
    FROM {{ ref('core_bilan_comptable') }}
    GROUP BY annee
)
SELECT annee, total_actif, total_passif,
       ABS(total_actif - total_passif) AS ecart,
       ABS(total_actif - total_passif) / NULLIF(total_actif, 0) * 100 AS pct_ecart
FROM totals
WHERE ABS(total_actif - total_passif) / NULLIF(total_actif, 0) > 0.1
