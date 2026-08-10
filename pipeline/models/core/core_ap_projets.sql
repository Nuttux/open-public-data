-- =============================================================================
-- Core: AP Projets (OBT, ex-int_ap_projets_enrichis aplatie)
--
-- Sources:
--   - stg_ap_projets        (lignes brutes typées)
--   - stg_lieux_connus      (mapping pattern → adresse/arrondissement/coords)
--   - stg_cache_geo_ap      (cache LLM géoloc — fallback)
--
-- Grain: (annee, ap_code) — un projet AP unique
--
-- Enrichissements (cascade géoloc regex → lieu_connu → cache_llm) :
--   - ode_arrondissement, ode_adresse, ode_latitude, ode_longitude
--   - ode_type_equipement (regex sur ap_texte)
--   - ode_nom_lieu, ode_source_geo, ode_confiance
--
-- Output: ~7k lignes, années 2018-2022.
-- =============================================================================

WITH projets AS (
    SELECT * FROM {{ ref('stg_ap_projets') }}
),

lieux_connus AS (
    SELECT * FROM {{ ref('stg_lieux_connus') }}
),

cache_geo AS (
    SELECT * FROM {{ ref('stg_cache_geo_ap') }}
),

-- ─── ÉTAPE 1 : Match avec lieux connus (regex pattern_match) ───────────────────
-- Le LEFT JOIN regex peut matcher plusieurs lieux pour un même AP : on garde le
-- pattern le plus long (= le plus spécifique).
with_lieux_all AS (
    SELECT
        p.*,
        l.adresse AS adresse_lieu,
        l.arrondissement AS arrondissement_lieu,
        l.latitude AS lat_lieu,
        l.longitude AS lng_lieu,
        l.nom_complet AS nom_lieu,
        l.pattern_match AS _pattern_match,
        ROW_NUMBER() OVER (
            PARTITION BY p.cle_technique
            ORDER BY
                LENGTH(COALESCE(l.pattern_match, '')) DESC,
                l.nom_complet ASC
        ) AS _lieu_rank
    FROM projets p
    LEFT JOIN lieux_connus l
        ON REGEXP_CONTAINS(UPPER(p.ap_texte), UPPER(l.pattern_match))
),

with_lieux AS (
    SELECT * EXCEPT(_lieu_rank, _pattern_match)
    FROM with_lieux_all
    WHERE _lieu_rank = 1
),

-- ─── ÉTAPE 2 : Cache LLM (fallback) ────────────────────────────────────────────
with_cache AS (
    SELECT
        w.*,
        c.ode_adresse AS adresse_cache,
        c.ode_arrondissement AS arrondissement_cache,
        c.ode_latitude AS lat_cache,
        c.ode_longitude AS lng_cache,
        c.ode_confiance AS confiance_cache
    FROM with_lieux w
    LEFT JOIN cache_geo c ON w.ap_code = c.ap_code
),

-- ─── ÉTAPE 3 : Type d'équipement (regex sur texte AP) ──────────────────────────
with_type AS (
    SELECT
        *,
        CASE
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PISCINE|BASSIN|AQUA') THEN 'piscine'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'GYMNASE|SPORT|STADE|TERRAIN') THEN 'equipement_sportif'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'ECOLE|COLLEGE|LYCEE|SCOLAIRE') THEN 'etablissement_scolaire'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'CRECHE|PETITE.ENFANCE|MULTI.ACCUEIL') THEN 'petite_enfance'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PARC|JARDIN|SQUARE|ESPACE.VERT') THEN 'espace_vert'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'MUSEE|BIBLIOTHEQUE|THEATRE|CONSERVATOIRE') THEN 'equipement_culturel'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'VOIRIE|CHAUSSEE|TROTTOIR|PISTE.CYCLABLE') THEN 'voirie'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'LOGEMENT|HLM|SOCIAL') THEN 'logement'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'MAIRIE|ADMINISTRATIF|HOTEL.DE.VILLE') THEN 'batiment_administratif'
            ELSE NULL
        END AS type_equipement_regex
    FROM with_cache
),

-- ─── ÉTAPE 4 : Cascade finale ──────────────────────────────────────────────────
enrichi AS (
    SELECT
        annee,
        section,
        sens_flux,
        type_operation,
        mission_code,
        mission_libelle,
        direction_code,
        direction,
        ap_code,
        ap_texte,
        nature_code,
        fonction_code,
        montant,
        cle_technique,

        -- Cascade géolocalisation : regex (déjà en stg) → lieu_connu → cache_llm
        COALESCE(
            arrondissement_regex,
            arrondissement_lieu,
            arrondissement_cache
        ) AS ode_arrondissement,

        COALESCE(adresse_lieu, adresse_cache) AS ode_adresse,
        COALESCE(lat_lieu, lat_cache) AS ode_latitude,
        COALESCE(lng_lieu, lng_cache) AS ode_longitude,
        type_equipement_regex AS ode_type_equipement,
        nom_lieu AS ode_nom_lieu,

        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 'regex'
            WHEN arrondissement_lieu IS NOT NULL THEN 'lieu_connu'
            WHEN arrondissement_cache IS NOT NULL THEN 'llm'
            ELSE NULL
        END AS ode_source_geo,

        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 1.0
            WHEN arrondissement_lieu IS NOT NULL THEN 0.95
            WHEN confiance_cache IS NOT NULL THEN confiance_cache
            ELSE NULL
        END AS ode_confiance
    FROM with_type
)

SELECT
    annee,
    section,
    sens_flux,
    type_operation,
    mission_code,
    mission_libelle,
    direction_code,
    direction,
    ap_code,
    ap_texte,
    nature_code,
    fonction_code,
    montant,
    cle_technique,
    ode_arrondissement,

    -- Arrondissement pour affichage (1-4 → Paris Centre)
    CASE
        WHEN ode_arrondissement IN (1, 2, 3, 4) THEN 0
        ELSE ode_arrondissement
    END AS ode_arrondissement_affichage,

    CASE
        WHEN ode_arrondissement IN (1, 2, 3, 4) THEN 'Paris Centre'
        WHEN ode_arrondissement IS NOT NULL THEN CONCAT(CAST(ode_arrondissement AS STRING), 'e')
        ELSE NULL
    END AS ode_arrondissement_label,

    ode_adresse,
    ode_latitude,
    ode_longitude,
    ode_type_equipement,
    ode_nom_lieu,
    ode_source_geo,
    ode_confiance,

    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM enrichi
