{{
  config(
    enabled=true,
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: DECP marchés publics (national, ungated)

  Source = decp.parquet consolidé (data.gouv.fr), une ligne par marché×titulaire.
  On rattache chaque marché à la COMMUNE acheteuse par SIREN (9 premiers chiffres
  de acheteur_id) joint à l'univers OFGL — donc uniquement les marchés dont
  l'acheteur est une commune, attribués à son INSEE.

  Déduplication : une ligne par marché (acheteur × id) pour ne pas compter le
  montant plusieurs fois quand un marché a plusieurs titulaires ou plusieurs
  modifications (avenants) — deux pièges classiques du DECP. On garde la
  version en cours (donneesActuelles, puis la dernière modification), et le
  titulaire au plus gros montant comme titulaire principal.

  Dimension commune : UNE ligne par SIREN (dernier exercice OFGL). L'ancien
  SELECT DISTINCT incluait la population, qui change chaque année → chaque
  marché était multiplié par le nombre d'exercices (×7 : Lyon affichait
  37 331 marchés pour 5 703 réels).

  ⚠ Couverture DECP : ~50-70 % au national (seuil de publication 40 k€ HT). On
  l'AFFICHE (nb marchés, montant), sans prétendre à l'exhaustivité.
*/

WITH raw AS (
    SELECT
        CAST(uid AS STRING)                          AS marche_id,
        CAST(id AS STRING)                           AS id_acheteur,
        SUBSTR(CAST(acheteur_id AS STRING), 1, 9)    AS acheteur_siren,
        COALESCE(donneesActuelles, FALSE)            AS donnees_actuelles,
        COALESCE(SAFE_CAST(modification_id AS INT64), 0) AS modification_id,
        CAST(acheteur_nom AS STRING)                 AS acheteur_nom,
        CAST(objet AS STRING)                        AS objet,
        CAST(nature AS STRING)                       AS nature_marche,
        CAST(procedure AS STRING)                    AS type_procedure,
        CAST(codeCPV AS STRING)                      AS code_cpv,
        LEFT(CAST(codeCPV AS STRING), 2)             AS cpv_division,
        SAFE_CAST(montant AS FLOAT64)                AS montant,
        CAST(formePrix AS STRING)                    AS forme_prix,
        dateNotification                             AS date_notification,
        EXTRACT(YEAR FROM dateNotification)          AS annee,
        SAFE_CAST(dureeMois AS INT64)                AS duree_mois,
        CAST(titulaire_nom AS STRING)                AS titulaire_nom,
        CAST(titulaire_id AS STRING)                 AS titulaire_siret,
        CAST(titulaire_typeIdentifiant AS STRING)    AS titulaire_type_id
    FROM {{ source('national_raw', 'decp_marches') }}
    WHERE montant > 0
      AND dateNotification IS NOT NULL
      -- Plancher 2018 : avant, la DECP est trop lacunaire pour être publiable.
      -- PAS DE PLAFOND. Le « BETWEEN 2018 AND 2025 » qui était écrit ici jetait
      -- silencieusement l'année en cours : au 2026-09-11, 256 872 marchés notifiés
      -- en 2026 étaient dans la table brute et aucun n'atteignait le site, qui
      -- affichait donc 2025 comme dernière année. Un plafond en dur sur une année
      -- se périme le 1er janvier ; on borne au présent, pas à un millésime.
      AND EXTRACT(YEAR FROM dateNotification) >= 2018
      AND dateNotification <= CURRENT_DATE()
),

-- Une ligne par marché (acheteur × id) : version en cours, puis dernière
-- modification, puis titulaire principal = plus gros montant.
deduped AS (
    SELECT * FROM raw
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY acheteur_siren, id_acheteur
        ORDER BY donnees_actuelles DESC, modification_id DESC, montant DESC
    ) = 1
),

-- Une ligne par commune (dernier exercice OFGL), jamais une par année.
commune_dim AS (
    SELECT siren, code_insee, commune_nom, dep_name, reg_name, population
    FROM {{ ref('stg_ofgl_communes') }}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY siren ORDER BY annee DESC) = 1
)

SELECT
    d.marche_id,
    c.code_insee,
    c.commune_nom,
    c.dep_name,
    c.reg_name,
    c.population,
    d.acheteur_siren,
    d.acheteur_nom,
    d.objet,
    d.nature_marche,
    d.type_procedure,
    d.code_cpv,
    d.cpv_division,
    d.montant,
    d.forme_prix,
    d.date_notification,
    d.annee,
    d.duree_mois,
    d.titulaire_nom,
    d.titulaire_siret,
    IF(d.titulaire_type_id = 'SIRET', SUBSTR(d.titulaire_siret, 1, 9), NULL) AS titulaire_siren
FROM deduped d
INNER JOIN commune_dim c
    ON d.acheteur_siren = c.siren
