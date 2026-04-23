-- =============================================================================
-- Core: Marchés Publics (OBT)
--
-- Sources:
--   - stg_marches_publics (opendata.paris.fr, 17k lignes 2013-2024)
--   - stg_decp_marches_paris (data.gouv DECP nationale, Paris uniquement, 2024+)
--
-- Grain: un marché unique (annee, numero_marche).
--
-- STRATÉGIE DE FUSION :
--   1. Base = stg_marches_publics (montant_max = plafond, la donnée historique Paris).
--   2. LEFT JOIN stg_decp_marches_paris sur SUBSTR(num_marche, 5) = decp_id pour
--      enrichir avec ccag, code_cpv, lieu_execution, offres_recues, montant_notifie.
--   3. UNION les marchés présents UNIQUEMENT dans DECP (~30% en plus, dont des gros
--      marchés absents de la source Paris). On les reconstruit avec num_marche
--      synthétique (annee×2 + decp_id) pour garder un grain stable.
--
-- ⚠️ montant_max = ENVELOPPE AUTORISÉE (plafond contractuel).
-- ⚠️ montant_notifie = montant déclaré à l'État à la signature (DECP), souvent
--    plus réaliste que le plafond pour les accords-cadres mais pas un cumul
--    des bons de commande émis.
--
-- Output: ~17k + ~500/an DECP-exclusifs.
-- =============================================================================

WITH ours AS (
    SELECT *
    FROM {{ ref('stg_marches_publics') }}
    WHERE montant_max > 0
      AND (duree_jours > 0 OR duree_jours IS NULL)
),

decp AS (
    SELECT *
    FROM {{ ref('stg_decp_marches_paris') }}
),

-- Partie 1 : marchés source Paris, enrichis DECP quand possible.
ours_enriched AS (
    SELECT
        -- Identifiants
        o.annee,
        o.numero_marche,
        o.cle_technique,

        -- Marché (Paris = source de vérité pour objet, car libellé historique)
        o.objet,
        o.nature,

        -- Fournisseur
        o.fournisseur_nom,
        o.fournisseur_siret,
        o.fournisseur_code_postal,
        o.fournisseur_ville,

        -- Montants (Paris = plafond autorisé)
        o.montant_min,
        o.montant_max,

        -- Dates
        o.date_notification,
        o.date_debut,
        o.date_fin,
        o.duree_jours,

        -- Catégorie Paris
        o.categorie_code,
        o.categorie_libelle,
        o.perimetre_financier,

        -- =====================================================================
        -- ENRICHISSEMENT DECP
        -- =====================================================================
        d.decp_id,
        d.ccag                                      AS decp_ccag,
        d.code_cpv                                  AS decp_code_cpv,
        d.cpv_division                              AS decp_cpv_division,
        d.montant_notifie                           AS decp_montant_notifie,
        d.type_procedure                            AS decp_procedure,
        d.duree_mois                                AS decp_duree_mois,
        d.offres_recues                             AS decp_offres_recues,
        d.lieu_execution_code                       AS decp_lieu_execution_code,
        d.lieu_execution_type_code                  AS decp_lieu_execution_type_code,
        d.arrondissement_exec                       AS decp_arrondissement_exec,
        d.titulaire_siret                           AS decp_titulaire_siret,
        d.titulaires_count                          AS decp_titulaires_count,
        d.sous_traitance_declaree                   AS decp_sous_traitance_declaree,
        d.nb_modifications                          AS decp_nb_modifications,
        d.has_consideration_sociale                 AS decp_has_consideration_sociale,
        d.has_consideration_environnementale        AS decp_has_consideration_environnementale,
        d.marche_innovant                           AS decp_marche_innovant,

        'paris' AS _source_origin  -- ligne provient de opendata.paris.fr
    FROM ours AS o
    LEFT JOIN decp AS d
      ON SUBSTR(o.numero_marche, 5) = d.decp_id
),

-- Partie 2 : marchés présents UNIQUEMENT dans DECP (non-matchés côté Paris).
decp_only AS (
    SELECT
        d.annee_notification                                   AS annee,
        CONCAT(CAST(d.annee_notification AS STRING),
               CAST(d.annee_notification AS STRING),
               SUBSTR(d.decp_id, 5))                           AS numero_marche,
        CONCAT('decp-', d.decp_id)                             AS cle_technique,

        d.objet,
        -- Map DECP nature → Paris nature vocabulary (approximation).
        CASE
            WHEN d.ccag = 'Travaux' THEN 'Travaux'
            WHEN d.ccag = 'Fournitures courantes et services' THEN 'Fournitures'
            WHEN d.ccag = "Maitrise d'œuvre" THEN 'Services'
            WHEN d.ccag = 'Prestations intellectuelles' THEN 'Services'
            WHEN d.ccag = "Techniques de l'information et de la communication" THEN 'Services'
            ELSE d.nature
        END AS nature,

        -- Fournisseur (depuis DECP). titulaire_nom souvent NULL en DECP v3 →
        -- CAST pour éviter les mismatches de type dans l'UNION.
        CAST(d.titulaire_nom AS STRING)                        AS fournisseur_nom,
        CAST(d.titulaire_siret AS STRING)                      AS fournisseur_siret,
        CAST(NULL AS STRING)                                   AS fournisseur_code_postal,
        CAST(NULL AS STRING)                                   AS fournisseur_ville,

        -- Montants : DECP n'a qu'un seul montant (= notifié). On le met en max
        -- pour compatibilité frontend ; min reste 0.
        CAST(0 AS FLOAT64)                                     AS montant_min,
        d.montant_notifie                                      AS montant_max,

        -- Dates
        d.date_notification,
        CAST(NULL AS DATE)                                     AS date_debut,
        CAST(NULL AS DATE)                                     AS date_fin,
        SAFE_CAST(d.duree_mois * 30 AS INT64)                  AS duree_jours,

        -- Catégorie — pas d'équivalent Paris, on expose DECP
        CAST(NULL AS STRING)                                   AS categorie_code,
        d.ccag                                                 AS categorie_libelle,
        CAST(NULL AS STRING)                                   AS perimetre_financier,

        -- DECP enrichment (identique mais pas de join — c'est la ligne DECP elle-même)
        d.decp_id,
        d.ccag                                      AS decp_ccag,
        d.code_cpv                                  AS decp_code_cpv,
        d.cpv_division                              AS decp_cpv_division,
        d.montant_notifie                           AS decp_montant_notifie,
        d.type_procedure                            AS decp_procedure,
        d.duree_mois                                AS decp_duree_mois,
        d.offres_recues                             AS decp_offres_recues,
        d.lieu_execution_code                       AS decp_lieu_execution_code,
        d.lieu_execution_type_code                  AS decp_lieu_execution_type_code,
        d.arrondissement_exec                       AS decp_arrondissement_exec,
        d.titulaire_siret                           AS decp_titulaire_siret,
        d.titulaires_count                          AS decp_titulaires_count,
        d.sous_traitance_declaree                   AS decp_sous_traitance_declaree,
        d.nb_modifications                          AS decp_nb_modifications,
        d.has_consideration_sociale                 AS decp_has_consideration_sociale,
        d.has_consideration_environnementale        AS decp_has_consideration_environnementale,
        d.marche_innovant                           AS decp_marche_innovant,

        'decp' AS _source_origin  -- ligne reconstruite depuis DECP
    FROM decp AS d
    LEFT JOIN ours AS o
      ON SUBSTR(o.numero_marche, 5) = d.decp_id
    WHERE o.numero_marche IS NULL
      AND d.montant_notifie > 0
      AND d.annee_notification IS NOT NULL
),

unioned AS (
    SELECT * FROM ours_enriched
    UNION ALL
    SELECT * FROM decp_only
)

SELECT
    *,

    -- =====================================================================
    -- COLONNES DÉRIVÉES (frontend-friendly)
    -- =====================================================================
    -- Flag multi-attributaire
    (fournisseur_nom = 'MARCHE MULTIATTRIBUTAIRE') AS is_multiattributaire,

    -- Écart entre plafond Paris et montant notifié DECP
    CASE
        WHEN decp_montant_notifie IS NULL OR montant_max IS NULL THEN NULL
        WHEN montant_max = 0 THEN NULL
        ELSE SAFE_DIVIDE(decp_montant_notifie - montant_max, montant_max)
    END AS ecart_plafond_vs_notifie,

    -- Règle d'affichage "double chiffre" : différence > 5% ET deux sources présentes
    CASE
        WHEN decp_montant_notifie IS NULL THEN FALSE
        WHEN montant_max = 0 THEN FALSE
        WHEN ABS(decp_montant_notifie - montant_max) / montant_max > 0.05 THEN TRUE
        ELSE FALSE
    END AS afficher_deux_montants,

    -- Famille CPV lisible (pour tags UI)
    CASE decp_cpv_division
        WHEN '03' THEN 'Agriculture'
        WHEN '09' THEN 'Énergie / combustibles'
        WHEN '14' THEN 'Matières premières'
        WHEN '15' THEN 'Alimentation'
        WHEN '18' THEN 'Vêtements'
        WHEN '22' THEN 'Imprimerie / édition'
        WHEN '24' THEN 'Produits chimiques'
        WHEN '30' THEN 'Bureau / informatique'
        WHEN '31' THEN 'Équipements électriques'
        WHEN '32' THEN 'Télécommunications'
        WHEN '33' THEN 'Matériel médical'
        WHEN '34' THEN 'Transport'
        WHEN '35' THEN 'Sécurité'
        WHEN '37' THEN 'Musique / sport'
        WHEN '38' THEN 'Instruments laboratoire'
        WHEN '39' THEN 'Mobilier / équipement'
        WHEN '41' THEN 'Eau'
        WHEN '42' THEN 'Machines industrielles'
        WHEN '43' THEN 'Équipements chantiers'
        WHEN '44' THEN 'Matériaux construction'
        WHEN '45' THEN 'Travaux construction'
        WHEN '48' THEN 'Logiciels'
        WHEN '50' THEN 'Réparation / maintenance'
        WHEN '51' THEN 'Installation'
        WHEN '55' THEN 'Hôtellerie / restauration'
        WHEN '60' THEN 'Transport'
        WHEN '63' THEN 'Services auxiliaires transport'
        WHEN '64' THEN 'Postes / télécoms'
        WHEN '65' THEN 'Utilités publiques'
        WHEN '66' THEN 'Finance / assurance'
        WHEN '70' THEN 'Immobilier'
        WHEN '71' THEN 'Architecture / ingénierie'
        WHEN '72' THEN 'Informatique'
        WHEN '73' THEN 'Recherche & développement'
        WHEN '75' THEN 'Administration'
        WHEN '77' THEN 'Services agricoles'
        WHEN '79' THEN 'Services aux entreprises'
        WHEN '80' THEN 'Éducation / formation'
        WHEN '85' THEN 'Santé / social'
        WHEN '90' THEN 'Environnement / propreté'
        WHEN '92' THEN 'Culture / loisirs'
        WHEN '98' THEN 'Services divers'
        ELSE NULL
    END AS decp_cpv_famille,

    -- Lieu d'exécution lisible
    CASE
        WHEN decp_lieu_execution_code = '75' THEN 'Paris'
        WHEN decp_lieu_execution_type_code = 'Code département'
             AND decp_lieu_execution_code IS NOT NULL
        THEN CONCAT('Département ', decp_lieu_execution_code)
        WHEN decp_lieu_execution_type_code IN ('Code postal', 'Code Postal')
             AND STARTS_WITH(CAST(decp_lieu_execution_code AS STRING), '750')
        THEN CONCAT('Paris ',
                    CAST(SAFE_CAST(SUBSTR(CAST(decp_lieu_execution_code AS STRING), 4, 2) AS INT64) AS STRING), 'e')
        WHEN decp_lieu_execution_type_code IN ('Code postal', 'Code Postal')
        THEN CONCAT('CP ', CAST(decp_lieu_execution_code AS STRING))
        ELSE NULL
    END AS decp_lieu_execution_lisible,

    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM unioned
