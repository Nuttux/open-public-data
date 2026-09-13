{{
  config(
    enabled=true,
    materialized='table',
    tags=['national', 'core']
  )
}}

/*
  Core: Marchés publics national (row-level OBT, une ligne par marché)

  Grain : 1 marché (uid) attribué à sa commune acheteuse (code_insee).
  La catégorie CPV est une correspondance déterministe (division CPV → thème),
  donc publique — pas d'enrichissement.
*/

WITH marches AS (
    SELECT * FROM {{ ref('stg_decp_marches') }}
),

-- Dépenses totales de la commune (OFGL, dernier exercice) : sert au plafond
-- de vraisemblance. Le DECP contient des montants saisis n'importe comment
-- (100 000 M€ pour une papeterie, 40 000 M€ chez Nice) : 318 marchés
-- au-dessus de 200 M€ portaient 85 % du total national. Un marché est jugé
-- invraisemblable s'il dépasse 200 M€, ou dix années de dépenses de la
-- commune, ou trois années de dépenses ET 10 M€. Vérifié sur échantillons
-- (2026-09-09) : un village qui construit une salle à 2 M€ pour 400 k€ de
-- budget annuel est réel et reste ; au-delà de dix fois le budget, ou de
-- trois fois avec plus de 10 M€, on ne trouve que des plafonds d'accords-
-- cadres de groupements d'achat d'énergie ou de centrales d'achat.
depenses_commune AS (
    SELECT code_insee, montant AS depenses_totales
    FROM {{ ref('stg_ofgl_communes') }}
    WHERE agregat = 'Dépenses totales' AND montant IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY code_insee ORDER BY annee DESC) = 1
),

sirene AS (
    SELECT siren, est_personne_physique
    FROM {{ ref('stg_sirene_unites_legales') }}
)

SELECT
    m.code_insee,
    m.commune_nom,
    m.dep_name,
    m.reg_name,
    m.population,
    m.marche_id,
    m.acheteur_nom,
    m.objet,
    m.nature_marche,
    m.type_procedure,
    m.code_cpv,
    m.cpv_division,
    m.montant,
    m.forme_prix,
    m.date_notification,
    m.annee,
    m.duree_mois,
    m.titulaire_nom,
    m.titulaire_siret,
    m.titulaire_siren,
    m.offres_recues,
    m.ccag,
    m.techniques,
    m.considerations_sociales,
    m.considerations_environnementales,
    m.sous_traitance_declaree,
    m.lieu_execution_code,
    m.lieu_execution_type,
    m.id_accord_cadre,
    m.nb_titulaires,
    m.nb_modifications,
    -- Vie privée : entrepreneur individuel = personne physique, jamais nommée.
    COALESCE(s.est_personne_physique, FALSE)   AS titulaire_personne_physique,
    d.depenses_totales                          AS depenses_totales_commune,
    (m.montant > 200000000
        OR (d.depenses_totales IS NOT NULL AND m.montant > 10 * d.depenses_totales)
        OR (d.depenses_totales IS NOT NULL AND m.montant > 3 * d.depenses_totales AND m.montant >= 10000000))
                                                AS montant_invraisemblable,

    -- Classification CPV (division → thème). Déterministe, publique.
    CASE
        WHEN m.cpv_division IN ('09', '31', '65') THEN 'Énergie'
        WHEN m.cpv_division IN ('30', '32', '48', '72') THEN 'Informatique & Télécom'
        WHEN m.cpv_division IN ('33', '85') THEN 'Santé & Social'
        WHEN m.cpv_division IN ('34', '50', '60', '63') THEN 'Transport & Véhicules'
        WHEN m.cpv_division IN ('39', '44', '45') THEN 'Construction & Bâtiment'
        WHEN m.cpv_division IN ('55', '15', '03') THEN 'Alimentation & Restauration'
        WHEN m.cpv_division IN ('71', '79') THEN 'Services professionnels'
        WHEN m.cpv_division IN ('77', '90') THEN 'Environnement & Propreté'
        WHEN m.cpv_division IN ('22', '80') THEN 'Éducation & Formation'
        WHEN m.cpv_division = '92' THEN 'Culture & Loisirs'
        WHEN m.cpv_division = '75' THEN 'Administration publique'
        ELSE 'Autres'
    END AS categorie_cpv

FROM marches m
LEFT JOIN depenses_commune d ON d.code_insee = m.code_insee
LEFT JOIN sirene s ON s.siren = m.titulaire_siren
