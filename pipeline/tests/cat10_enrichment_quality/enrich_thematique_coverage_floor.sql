-- Drift guard (cat10) : plancher de couverture de l'enrichissement thématique.
--
-- L'enrichissement (pattern / direction / LLM) se jointait sur le nom normalisé.
-- Une dérive de la normalisation faisait retomber des bénéficiaires en
-- 'default' / 'Non classifié' SANS lever d'erreur — c'est exactement le mode de
-- panne « 247 orgs perdues silencieusement » qui a motivé dim_beneficiaire.
--
-- Ce test échoue si la part du MONTANT portant une thématique RÉSOLUE (source
-- ≠ 'default') tombe sous un plancher. Actuel ≈ 96,3 % ; plancher 85 % : tolère
-- le churn annuel des bénéficiaires mais attrape une vraie rupture de jointure.
-- Relever le plancher une fois l'enrichissement re-clé sur beneficiaire_id.
{{ config(severity='error') }}

WITH cov AS (
    SELECT
        SUM(IF(ode_source_thematique != 'default', montant, 0)) AS resolved,
        SUM(montant)                                            AS total
    FROM {{ ref('core_subventions') }}
    WHERE montant > 0
)

SELECT resolved, total, SAFE_DIVIDE(resolved, total) AS ratio
FROM cov
WHERE SAFE_DIVIDE(resolved, total) < 0.85
