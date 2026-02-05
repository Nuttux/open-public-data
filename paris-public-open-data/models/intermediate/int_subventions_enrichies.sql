-- =============================================================================
-- Intermediate: Subventions enrichies
--
-- Sources: stg_subventions_all + stg_associations + seeds
-- Description: Enrichit les subventions avec thématique et type d'organisme pour filtres UI
--
-- NOTE: Pas de géolocalisation - les subventions vont à des organisations, pas des lieux.
-- L'adresse du siège ne reflète pas où l'action est menée.
--
-- Enrichissements (colonnes ode_*):
--   1. JOIN associations → siret, direction, objet (métadonnées utiles pour filtres)
--   2. Cascade thématique: pattern → direction → LLM → default
--   3. Type d'organisme: public / association / entreprise / personne_physique / autre
--   4. Nom canonique: déduplication entités (CASP, etc.)
--
-- Output: ~43k lignes enrichies (identique au staging - pas de multiplication)
-- =============================================================================

WITH subventions AS (
    SELECT * FROM {{ ref('stg_subventions_all') }}
),

associations AS (
    SELECT * FROM {{ ref('stg_associations') }}
),

-- Seeds mappings
mapping_beneficiaires AS (
    SELECT * FROM {{ ref('seed_mapping_beneficiaires') }}
),

mapping_directions AS (
    SELECT * FROM {{ ref('seed_mapping_directions') }}
),

-- Cache thématique LLM
cache_thematique AS (
    SELECT * FROM {{ ref('seed_cache_thematique_beneficiaires') }}
),

-- Mapping entités (déduplication CASP et similaires)
mapping_entites AS (
    SELECT * FROM {{ ref('seed_mapping_entites') }}
),

-- =============================================================================
-- ÉTAPE 1: DEDUPLICATE associations for JOIN
-- On garde UNE ligne par (beneficiaire_normalise, annee) - priorité au dossier
-- avec le plus gros montant (représente mieux l'activité principale)
-- =============================================================================
associations_dedup AS (
    SELECT
        beneficiaire_normalise,
        annee,
        siret,
        direction,
        objet,
        secteurs_activite,
        ROW_NUMBER() OVER (
            PARTITION BY beneficiaire_normalise, annee 
            ORDER BY montant DESC
        ) AS rn
    FROM associations
),

associations_unique AS (
    SELECT 
        beneficiaire_normalise,
        annee,
        siret,
        direction,
        objet,
        secteurs_activite
    FROM associations_dedup
    WHERE rn = 1
),

-- =============================================================================
-- ÉTAPE 2: Pattern matching pour thématique
-- Cross join puis ROW_NUMBER pour trouver le meilleur pattern par bénéficiaire
-- =============================================================================
distinct_beneficiaires AS (
    SELECT DISTINCT beneficiaire_normalise
    FROM subventions
    WHERE beneficiaire_normalise IS NOT NULL
),

pattern_matches AS (
    SELECT
        b.beneficiaire_normalise,
        m.thematique,
        m.sous_categorie,
        m.priorite,
        ROW_NUMBER() OVER (
            PARTITION BY b.beneficiaire_normalise 
            ORDER BY m.priorite ASC
        ) AS rn
    FROM distinct_beneficiaires b
    CROSS JOIN mapping_beneficiaires m
    WHERE REGEXP_CONTAINS(b.beneficiaire_normalise, m.pattern)
),

best_pattern AS (
    SELECT 
        beneficiaire_normalise,
        thematique AS pattern_thematique,
        sous_categorie AS pattern_sous_categorie
    FROM pattern_matches
    WHERE rn = 1
),

-- =============================================================================
-- ÉTAPE 3: Entity canonicalization (CASP, etc.)
-- =============================================================================
entity_matches AS (
    SELECT
        b.beneficiaire_normalise,
        e.nom_canonique,
        LENGTH(e.pattern) AS pattern_length,
        ROW_NUMBER() OVER (
            PARTITION BY b.beneficiaire_normalise 
            ORDER BY LENGTH(e.pattern) DESC
        ) AS rn
    FROM distinct_beneficiaires b
    CROSS JOIN mapping_entites e
    WHERE REGEXP_CONTAINS(b.beneficiaire_normalise, e.pattern)
),

best_entity AS (
    SELECT 
        beneficiaire_normalise,
        nom_canonique
    FROM entity_matches
    WHERE rn = 1
),

-- =============================================================================
-- ÉTAPE 4: JOIN avec associations dédupliquées + enrichissements
-- =============================================================================
joined AS (
    SELECT
        s.*,
        a.siret,
        a.direction,
        a.objet,
        a.secteurs_activite,
        bp.pattern_thematique,
        bp.pattern_sous_categorie,
        md.thematique AS direction_thematique,
        ct.ode_thematique AS llm_thematique,
        ct.ode_sous_categorie AS llm_sous_categorie,
        be.nom_canonique AS matched_nom_canonique
    FROM subventions s
    LEFT JOIN associations_unique a
        ON s.beneficiaire_normalise = a.beneficiaire_normalise
        AND s.annee = a.annee
    LEFT JOIN best_pattern bp
        ON s.beneficiaire_normalise = bp.beneficiaire_normalise
    LEFT JOIN mapping_directions md 
        ON a.direction = md.direction
    LEFT JOIN cache_thematique ct 
        ON s.beneficiaire_normalise = ct.beneficiaire_normalise
    LEFT JOIN best_entity be
        ON s.beneficiaire_normalise = be.beneficiaire_normalise
)

-- =============================================================================
-- ÉTAPE 5: Calcul final des colonnes enrichies
-- =============================================================================
SELECT
    -- Colonnes originales
    annee,
    beneficiaire,
    beneficiaire_normalise,
    categorie,
    nature_juridique,
    montant,
    prestations_nature,
    collectivite,
    donnees_disponibles,
    cle_technique,
    
    -- Colonnes depuis associations (pour filtres UI)
    siret,
    direction,
    objet,
    secteurs_activite,
    
    -- =========================================================================
    -- COLONNES ENRICHIES (ode_*)
    -- =========================================================================
    
    -- Thématique via cascade
    COALESCE(
        pattern_thematique,
        direction_thematique,
        llm_thematique,
        CASE 
            WHEN categorie LIKE '%culture%' OR categorie LIKE '%spectacle%' THEN 'Culture'
            WHEN categorie LIKE '%sport%' THEN 'Sport'
            WHEN categorie LIKE '%social%' OR categorie LIKE '%solidarit%' THEN 'Social'
            WHEN categorie LIKE '%education%' OR categorie LIKE '%scolaire%' THEN 'Éducation'
            WHEN categorie LIKE '%environnement%' OR categorie LIKE '%ecolog%' THEN 'Environnement'
            WHEN nature_juridique = 'Entreprises' THEN 'Économie'
            WHEN nature_juridique = 'Établissements publics' THEN 'Administration'
            ELSE 'Non classifié'
        END
    ) AS ode_thematique,
    
    -- Sous-catégorie
    COALESCE(pattern_sous_categorie, llm_sous_categorie) AS ode_sous_categorie,
    
    -- Source de la thématique (pour debug/audit)
    CASE
        WHEN pattern_thematique IS NOT NULL THEN 'pattern'
        WHEN direction_thematique IS NOT NULL THEN 'direction'
        WHEN llm_thematique IS NOT NULL THEN 'llm'
        ELSE 'default'
    END AS ode_source_thematique,
    
    -- Type d'organisme (pour segmentation UI)
    CASE nature_juridique
        WHEN 'Etablissements publics' THEN 'public'
        WHEN 'Etablissements de droit public' THEN 'public'
        WHEN 'Etat' THEN 'public'
        WHEN 'Communes' THEN 'public'
        WHEN 'Département' THEN 'public'
        WHEN 'Régions' THEN 'public'
        WHEN 'Autres personnes de droit public' THEN 'public'
        WHEN 'Associations' THEN 'association'
        WHEN 'Entreprises' THEN 'entreprise'
        WHEN 'Personnes physiques' THEN 'personne_physique'
        WHEN 'Autres personnes de droit privé' THEN 'prive_autre'
        WHEN 'Autres' THEN 'autre'
        ELSE 'non_renseigne'
    END AS ode_type_organisme,
    
    -- Flag: contribution en nature (vs numéraire)
    CASE 
        WHEN prestations_nature IS NOT NULL AND prestations_nature > 0 
        THEN TRUE 
        ELSE FALSE 
    END AS ode_contribution_nature,
    
    -- Nom canonique pour agrégation (déduplication CASP, etc.)
    COALESCE(matched_nom_canonique, beneficiaire_normalise) AS ode_beneficiaire_canonique

FROM joined
