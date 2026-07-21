-- =============================================================================
-- MART: Logement social ↔ Dette garantie (chaîne de financement réelle)
--
-- Sources : core_dette_garantie (emprunts garantis) + core_logements_sociaux
--           (programmes livrés).
-- Grain    : une ligne = UN LIEN (emprunt distinct × programme rattaché).
--            Un emprunt non rattaché à un programme précis figure quand même
--            (colonnes programme NULL, match_basis = 'non_rattache') pour que le
--            total de dette d'un bailleur reste COMPLET et honnête.
--
-- Pourquoi un mart (et pas core) : relation MANY-TO-MANY. Un bailleur porte des
-- dizaines d'emprunts sur plusieurs années ; une même adresse peut couvrir
-- plusieurs programmes (tranches PLAI/PLUS). Ce n'est ni du row-level OBT ni un
-- simple rollup — c'est une table de pont (bridge), sa place est en mart.
--
-- ⚠️ GRAIN & SOMMES (à respecter côté UI) :
--   - « dette d'UN PROGRAMME » = SUM(montant_initial) sur ses liens : OK direct.
--   - « dette d'UN BAILLEUR »  = SUM sur emprunts DISTINCTS → agréger par
--     loan_id (un emprunt lié à N programmes apparaît N fois). n_programmes_lies
--     expose cette ambiguïté pour l'affichage (« ≈ », « réparti sur N programmes »).
--
-- Déduplication : core_dette_garantie est au grain emprunt × année de
-- publication (un même emprunt réapparaît chaque année jusqu'au solde). On
-- déduplique ici en emprunt DISTINCT (sinon double-comptage massif :
-- 53 k lignes → 20,8 k emprunts, 73 Md€ → 31 Md€ de montant initial). On garde
-- le capital_restant de la DERNIÈRE année de publication (encours courant).
--
-- Couche déterministe uniquement (Bloc 1) : rattachement sur
-- arrondissement + numéro de voirie + cœur de nom de voie (macros
-- logement_financement.sql). Les emprunts non rattachés ici (ZAC/lot, adresses
-- multiples) sont confiés au juge LLM dans un second temps.
--
-- source_url conservé sur chaque ligne pour citation (promesse Open Data).
-- =============================================================================
{{ config(materialized='table', schema='marts', tags=['marts','hors_bilan','logement']) }}

WITH loans_raw AS (
    SELECT *
    FROM {{ ref('core_dette_garantie') }}
    WHERE bucket_nature IN ('logement_social_aide', 'logement_hors_aide')
),

-- Emprunt distinct : on écrase la duplication année-de-publication.
loans AS (
    SELECT
        TO_HEX(MD5(CONCAT(
            IFNULL(beneficiaire, ''), '|', IFNULL(objet, ''), '|',
            CAST(IFNULL(annee_mobilisation, 0) AS STRING), '|',
            CAST(IFNULL(montant_initial, 0) AS STRING)
        )))                                        AS loan_id,
        beneficiaire,
        {{ lf_bailleur_key('beneficiaire') }}      AS bailleur_key,
        objet,
        arrondissement,
        bucket_nature,
        annee_mobilisation,
        montant_initial,
        MAX_BY(capital_restant, annee)             AS capital_restant,
        MAX(annee)                                 AS derniere_annee_publication,
        ANY_VALUE(source_url)                      AS source_url,
        {{ lf_addr_number('objet') }}              AS loan_num,
        {{ lf_addr_street('objet') }}              AS loan_street
    FROM loans_raw
    GROUP BY beneficiaire, objet, arrondissement, bucket_nature,
             annee_mobilisation, montant_initial
),

programs AS (
    SELECT
        id_livraison,
        bailleur,
        {{ lf_bailleur_key('bailleur') }}          AS bailleur_key,
        adresse,
        arrondissement,
        annee,
        nb_logements,
        latitude,
        longitude,
        {{ lf_addr_number('adresse') }}            AS prog_num,
        {{ lf_addr_street('adresse') }}            AS prog_street
    FROM {{ ref('core_logements_sociaux') }}
),

-- Rattachement déterministe : même arrondissement + même numéro + même voie.
-- Le bailleur ne CONTRAINT pas le lien (une adresse exacte suffit) mais son
-- accord le renforce : confiance 'haute' si les deux clés coïncident, 'moyenne'
-- sinon (programme possiblement transféré entre bailleurs, ou nom non mappé).
matched AS (
    SELECT
        l.loan_id,
        p.id_livraison,
        CASE
            WHEN l.bailleur_key IS NOT NULL AND l.bailleur_key = p.bailleur_key
                THEN 'adresse_exacte'
            ELSE 'adresse_arr'
        END                                        AS match_basis,
        CASE
            WHEN l.bailleur_key IS NOT NULL AND l.bailleur_key = p.bailleur_key
                THEN 'haute'
            ELSE 'moyenne'
        END                                        AS confiance,
        p.bailleur                                 AS programme_bailleur,
        p.adresse                                  AS programme_adresse,
        p.arrondissement                           AS programme_arrondissement,
        p.annee                                    AS programme_annee,
        p.nb_logements,
        p.latitude,
        p.longitude
    FROM loans l
    JOIN programs p
      ON l.arrondissement = p.arrondissement
     AND l.loan_num = p.prog_num
     AND l.loan_street = p.prog_street
    WHERE l.loan_num IS NOT NULL
      AND l.loan_street IS NOT NULL
),

matched_ids AS (
    SELECT DISTINCT loan_id FROM matched
),

-- Emprunts sans aucun programme rattaché : conservés (programme NULL) pour la
-- complétude des totaux par bailleur. On les étiquette honnêtement à partir du
-- seul texte de l'`objet` :
--   - 'portefeuille'   : « Diverses adresses », « Multi opérations », « CPG »,
--                        réhabilitation de patrimoine, refinancement — l'emprunt
--                        finance un ENSEMBLE, pas un immeuble unique. Non
--                        rattachable par nature (ce n'est pas une lacune).
--   - 'zac_operation'  : ZAC / lot d'aménagement — maille opération.
--   - 'non_rattache'   : adresse a priori unique mais aucun programme trouvé
--                        (programme hors inventaire, ou variante d'écriture) —
--                        SEULE cible utile d'un éventuel juge LLM (Bloc 2).
unmatched AS (
    SELECT
        loan_id,
        CAST(NULL AS STRING)  AS id_livraison,
        CASE
            WHEN REGEXP_CONTAINS(LOWER(objet), r'divers|multi.?op|multi.?adr|\bcpg\b|patrimoine|refinanc|portefeuille')
                THEN 'portefeuille'
            WHEN REGEXP_CONTAINS(LOWER(objet), r'\bzac\b|lot ')
                THEN 'zac_operation'
            ELSE 'non_rattache'
        END                   AS match_basis,
        CAST(NULL AS STRING)  AS confiance,
        CAST(NULL AS STRING)  AS programme_bailleur,
        CAST(NULL AS STRING)  AS programme_adresse,
        CAST(NULL AS INT64)   AS programme_arrondissement,
        CAST(NULL AS INT64)   AS programme_annee,
        CAST(NULL AS INT64)   AS nb_logements,
        CAST(NULL AS FLOAT64) AS latitude,
        CAST(NULL AS FLOAT64) AS longitude
    FROM loans
    WHERE loan_id NOT IN (SELECT loan_id FROM matched_ids)
),

links AS (
    SELECT * FROM matched
    UNION ALL
    SELECT * FROM unmatched
)

SELECT
    -- Lien
    k.loan_id,
    k.id_livraison,
    k.match_basis,
    k.confiance,
    COUNT(k.id_livraison) OVER (PARTITION BY k.loan_id) AS n_programmes_lies,

    -- Emprunt (côté dette)
    l.beneficiaire,
    l.bailleur_key,
    l.objet,
    l.arrondissement                                    AS emprunt_arrondissement,
    l.bucket_nature,
    l.annee_mobilisation,
    l.montant_initial,
    l.capital_restant,
    l.derniere_annee_publication,

    -- Programme (côté logement social) — NULL si non rattaché
    k.programme_bailleur,
    k.programme_adresse,
    k.programme_arrondissement,
    k.programme_annee,
    k.nb_logements                                      AS programme_nb_logements,
    k.latitude                                          AS programme_latitude,
    k.longitude                                         AS programme_longitude,

    -- Citation
    l.source_url,
    CURRENT_TIMESTAMP()                                 AS _dbt_updated_at
FROM links k
JOIN loans l USING (loan_id)
ORDER BY l.beneficiaire, k.match_basis, l.montant_initial DESC
