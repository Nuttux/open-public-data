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
--
-- Output: ~53k lignes enrichies
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

-- =============================================================================
-- ÉTAPE 1: JOIN avec associations (siret, direction, objet)
-- Jointure sur (beneficiaire_normalise, annee)
-- =============================================================================
joined_associations AS (
    SELECT
        s.*,
        a.siret AS siret,
        a.direction,
        a.objet,
        a.secteurs_activite
    FROM subventions s
    LEFT JOIN associations a
        ON s.beneficiaire_normalise = a.beneficiaire_normalise
        AND s.annee = a.annee
),

-- =============================================================================
-- ÉTAPE 2: Classification thématique (cascade) + type d'organisme
-- Priorité: 1.Pattern → 2.Direction → 3.LLM cache → 4.Default
-- =============================================================================
with_thematique AS (
    SELECT
        j.*,
        
        -- Thématique via cascade
        COALESCE(
            -- Priorité 1: Pattern matching sur nom bénéficiaire
            mp.thematique,
            -- Priorité 2: Mapping direction
            md.thematique,
            -- Priorité 3: Cache LLM
            ct.ode_thematique,
            -- Priorité 4: Default basé sur catégorie subvention + nature juridique
            CASE 
                WHEN j.categorie LIKE '%culture%' OR j.categorie LIKE '%spectacle%' THEN 'Culture'
                WHEN j.categorie LIKE '%sport%' THEN 'Sport'
                WHEN j.categorie LIKE '%social%' OR j.categorie LIKE '%solidarit%' THEN 'Social'
                WHEN j.categorie LIKE '%education%' OR j.categorie LIKE '%scolaire%' THEN 'Éducation'
                WHEN j.categorie LIKE '%environnement%' OR j.categorie LIKE '%ecolog%' THEN 'Environnement'
                WHEN j.nature_juridique = 'Entreprises' THEN 'Économie'
                WHEN j.nature_juridique = 'Établissements publics' THEN 'Administration'
                ELSE 'Non classifié'
            END
        ) AS ode_thematique,
        
        -- Sous-catégorie
        COALESCE(mp.sous_categorie, ct.ode_sous_categorie) AS ode_sous_categorie,
        
        -- Source de la thématique (pour debug/audit)
        CASE
            WHEN mp.thematique IS NOT NULL THEN 'pattern'
            WHEN md.thematique IS NOT NULL THEN 'direction'
            WHEN ct.ode_thematique IS NOT NULL THEN 'llm'
            ELSE 'default'
        END AS ode_source_thematique,
        
        -- Type d'organisme (pour segmentation UI)
        CASE j.nature_juridique
            -- Organismes publics
            WHEN 'Etablissements publics' THEN 'public'
            WHEN 'Etablissements de droit public' THEN 'public'
            WHEN 'Etat' THEN 'public'
            WHEN 'Communes' THEN 'public'
            WHEN 'Département' THEN 'public'
            WHEN 'Régions' THEN 'public'
            WHEN 'Autres personnes de droit public' THEN 'public'
            -- Associations
            WHEN 'Associations' THEN 'association'
            -- Entreprises (dont ESS)
            WHEN 'Entreprises' THEN 'entreprise'
            -- Personnes physiques (artistes, sportifs, etc.)
            WHEN 'Personnes physiques' THEN 'personne_physique'
            -- Autres privés
            WHEN 'Autres personnes de droit privé' THEN 'prive_autre'
            WHEN 'Autres' THEN 'autre'
            -- Non renseigné
            ELSE 'non_renseigne'
        END AS ode_type_organisme,
        
        -- Flag: contribution en nature (vs numéraire)
        CASE 
            WHEN j.prestations_nature IS NOT NULL 
                 AND j.prestations_nature > 0 
            THEN TRUE 
            ELSE FALSE 
        END AS ode_contribution_nature
        
    FROM joined_associations j
    -- Pattern matching: on prend le pattern avec la plus haute priorité
    LEFT JOIN (
        SELECT 
            pattern,
            thematique,
            sous_categorie,
            priorite,
            ROW_NUMBER() OVER (PARTITION BY pattern ORDER BY priorite) as rn
        FROM mapping_beneficiaires
    ) mp ON REGEXP_CONTAINS(j.beneficiaire_normalise, mp.pattern) AND mp.rn = 1
    LEFT JOIN mapping_directions md ON j.direction = md.direction
    LEFT JOIN cache_thematique ct ON j.beneficiaire_normalise = ct.beneficiaire_normalise
)

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
    
    -- Colonnes enrichies (ode_*)
    ode_thematique,
    ode_sous_categorie,
    ode_source_thematique,
    ode_type_organisme,
    ode_contribution_nature

FROM with_thematique
