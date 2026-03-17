{{
  config(
    materialized='table',
    tags=['national', 'core']
  )
}}

/*
  Core: Bilan / Patrimoine National par ville

  Extrait les données de bilan (actif/passif) des balances DGFiP.
  Utilise les comptes de classes 1-5 pour le patrimoine.
*/

WITH balances AS (
    SELECT *
    FROM {{ ref('stg_dgfip_balances') }}
    WHERE classe_compte IN ('1', '2', '3', '4', '5')
),

aggregated AS (
    SELECT
        commune_slug,
        commune_nom,
        code_insee,
        population,
        annee,
        nature_prefix,
        classe_compte,
        libelle_compte,

        -- Actif = solde débiteur, Passif = solde créditeur
        SUM(solde_debit) AS total_debit,
        SUM(solde_credit) AS total_credit,
        SUM(solde_debit - solde_credit) AS solde_net

    FROM balances
    GROUP BY ALL
)

SELECT
    commune_slug,
    commune_nom,
    code_insee,
    population,
    annee,
    nature_prefix,
    classe_compte,

    -- Classification bilan
    CASE
        WHEN classe_compte IN ('2', '3') THEN 'Actif'
        WHEN classe_compte = '5' AND solde_net > 0 THEN 'Actif'
        WHEN classe_compte = '4' AND solde_net > 0 THEN 'Actif'
        WHEN classe_compte = '1' THEN 'Passif'
        WHEN classe_compte = '5' AND solde_net <= 0 THEN 'Passif'
        WHEN classe_compte = '4' AND solde_net <= 0 THEN 'Passif'
        ELSE 'Autre'
    END AS categorie_bilan,

    -- Sous-catégories
    CASE
        WHEN nature_prefix = '10' THEN 'Dotations et fonds'
        WHEN nature_prefix = '11' THEN 'Résultat reporté'
        WHEN nature_prefix = '12' THEN 'Résultat exercice'
        WHEN nature_prefix = '13' THEN 'Subventions investissement'
        WHEN nature_prefix = '14' THEN 'Provisions réglementées'
        WHEN nature_prefix = '15' THEN 'Provisions pour risques'
        WHEN nature_prefix = '16' THEN 'Emprunts et dettes'
        WHEN nature_prefix = '17' THEN 'Dettes rattachées'
        WHEN nature_prefix = '20' THEN 'Immobilisations incorporelles'
        WHEN nature_prefix = '21' THEN 'Immobilisations corporelles'
        WHEN nature_prefix = '22' THEN 'Immobilisations reçues'
        WHEN nature_prefix = '23' THEN 'Immobilisations en cours'
        WHEN nature_prefix = '24' THEN 'Participations'
        WHEN nature_prefix = '26' THEN 'Participations financières'
        WHEN nature_prefix = '27' THEN 'Autres immo. financières'
        WHEN nature_prefix = '28' THEN 'Amortissements'
        WHEN nature_prefix = '29' THEN 'Dépréciations'
        WHEN classe_compte = '3' THEN 'Stocks'
        WHEN classe_compte = '4' THEN 'Créances/Dettes court terme'
        WHEN classe_compte = '5' THEN 'Trésorerie'
        ELSE 'Autre'
    END AS sous_categorie,

    total_debit,
    total_credit,
    ABS(solde_net) AS montant

FROM aggregated
WHERE ABS(solde_net) > 0
