{{
  config(
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: DGFiP Balances Comptables

  Nettoie et normalise les balances comptables de la DGFiP.
  Chaque ligne = 1 compte M57 pour 1 commune sur 1 année.

  Les balances DGFiP contiennent:
  - Débits/Crédits pour chaque compte
  - Le solde net = crédits - débits (pour comptes de classe 7)
    ou débits - crédits (pour comptes de classe 6)

  Classification M57:
  - Classe 6 (6xx) = Charges (dépenses de fonctionnement)
  - Classe 7 (7xx) = Produits (recettes de fonctionnement)
  - Classe 1 (1xx) = Comptes de capitaux (investissement/bilan)
  - Classe 2 (2xx) = Immobilisations (investissement dépenses)
  - Classe 3 (3xx) = Stocks
  - Classe 4 (4xx) = Tiers
  - Classe 5 (5xx) = Financier
*/

WITH raw_balances AS (
    SELECT *
    FROM {{ source('national_raw', 'dgfip_balances') }}
),

-- Join with communes cibles to get slug and city metadata
communes AS (
    SELECT * FROM {{ ref('seed_communes_cibles') }}
),

cleaned AS (
    SELECT
        -- Identifiants commune
        CAST(b.siren AS STRING) AS siren,
        c.code_insee,
        c.nom AS commune_nom,
        c.slug AS commune_slug,
        c.population,

        -- Année
        COALESCE(
            SAFE_CAST(b.annee_balance AS INT64),
            SAFE_CAST(b.exer AS INT64)
        ) AS annee,

        -- Compte M57
        CAST(COALESCE(b.compte, b.ccompte) AS STRING) AS compte,
        LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 2) AS nature_prefix,
        LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) AS classe_compte,

        -- Budget
        CAST(COALESCE(b.budget, b.cbudg) AS STRING) AS code_budget,

        -- Montants
        COALESCE(SAFE_CAST(b.sd AS FLOAT64), 0) AS solde_debit,
        COALESCE(SAFE_CAST(b.sc AS FLOAT64), 0) AS solde_credit,
        COALESCE(SAFE_CAST(b.obnetdeb AS FLOAT64), 0) AS operations_nettes_debit,
        COALESCE(SAFE_CAST(b.obnetcre AS FLOAT64), 0) AS operations_nettes_credit,

        -- Section
        CASE
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) IN ('6', '7') THEN 'Fonctionnement'
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) IN ('1', '2') THEN 'Investissement'
            ELSE 'Autre'
        END AS section,

        -- Sens du flux
        CASE
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) = '6' THEN 'Depense'
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) = '7' THEN 'Recette'
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) = '2' THEN 'Depense'
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 2) = '16' THEN 'Both'
            WHEN LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 2) IN ('10', '13', '15') THEN 'Recette'
            ELSE 'Bilan'
        END AS sens_flux,

        -- Libellé du compte
        CAST(COALESCE(b.lcompte, b.libelle) AS STRING) AS libelle_compte

    FROM raw_balances b
    INNER JOIN communes c ON CAST(b.siren AS STRING) = c.siren
    WHERE
        -- Filtrer budget principal uniquement (BP = budget primitif / BA = budget annexe)
        COALESCE(b.budget, b.cbudg, 'BP') IN ('BP', 'BA', '00')
        -- Exclure les comptes techniques
        AND LEFT(CAST(COALESCE(b.compte, b.ccompte) AS STRING), 1) IN ('1', '2', '3', '4', '5', '6', '7')
)

SELECT
    *,
    -- Montant net pour Sankey (simplifié)
    CASE
        WHEN classe_compte = '6' THEN operations_nettes_debit  -- Charges = débits
        WHEN classe_compte = '7' THEN operations_nettes_credit  -- Produits = crédits
        WHEN classe_compte = '2' THEN operations_nettes_debit  -- Immobilisations = débits
        WHEN nature_prefix = '16' THEN operations_nettes_credit - operations_nettes_debit  -- Emprunts = net
        WHEN nature_prefix IN ('10', '13', '15') THEN operations_nettes_credit  -- Dotations invest = crédits
        ELSE operations_nettes_credit - operations_nettes_debit
    END AS montant_net

FROM cleaned
WHERE annee IS NOT NULL
