{{ config(tags=['seed_quality']) }}
{# Each PDF budget vote seed year must have both sections and both flux types #}
WITH all_pdfs AS (
    SELECT annee, section, sens_flux, COUNT(*) AS cnt
    FROM {{ ref('stg_pdf_budget_vote') }}
    GROUP BY annee, section, sens_flux
),
expected_combos AS (
    SELECT DISTINCT annee
    FROM all_pdfs
),
coverage AS (
    SELECT
        e.annee,
        COUNTIF(a.section = 'Fonctionnement' AND a.sens_flux = 'Recette') AS has_fonct_recette,
        COUNTIF(a.section = 'Fonctionnement' AND a.sens_flux = 'Dépense') AS has_fonct_depense,
        COUNTIF(a.section = 'Investissement' AND a.sens_flux = 'Recette') AS has_invest_recette,
        COUNTIF(a.section = 'Investissement' AND a.sens_flux = 'Dépense') AS has_invest_depense
    FROM expected_combos e
    LEFT JOIN all_pdfs a ON e.annee = a.annee
    GROUP BY e.annee
)
SELECT annee, has_fonct_recette, has_fonct_depense, has_invest_recette, has_invest_depense
FROM coverage
WHERE has_fonct_recette = 0
   OR has_fonct_depense = 0
   OR has_invest_recette = 0
   OR has_invest_depense = 0
