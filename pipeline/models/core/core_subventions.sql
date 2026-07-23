-- =============================================================================
-- Core: Subventions (OBT, ex-int_subventions_enrichies aplatie)
--
-- Sources:
--   - stg_subventions_all       (lignes brutes)
--   - stg_associations          (siret + direction + objet par asso, niveau année)
--   - dim_beneficiaire          (registre d'identité : beneficiaire_id +
--                                enrichissement niveau-entité pattern/llm/canon)
--   - stg_mapping_directions    (direction → thematique)
--
-- Grain: une ligne par subvention (cle_technique).
--
-- Pas de géolocalisation : les subventions vont à des organisations, pas à des
-- lieux. L'adresse du siège ne reflète pas où l'action est menée.
--
-- NB (registre) : la normalisation + les jointures de cache (pattern/llm/canon)
-- vivent désormais dans dim_beneficiaire (un seul endroit, testé contre la
-- dérive). Ce modèle REJOINT le dim au lieu de ré-implémenter ces CTE — le
-- SIRET/direction/objet niveau-année restent tirés de stg_associations.
--
-- Enrichissements (ode_*) :
--   - ode_thematique         (cascade: pattern → direction → llm → default)
--   - ode_sous_categorie     (pattern ou llm)
--   - ode_source_thematique  ('pattern' | 'direction' | 'llm' | 'default')
--   - ode_type_organisme     (public | association | entreprise | …)
--   - ode_contribution_nature (bool)
--   - ode_beneficiaire_canonique (déduplication CASP etc.)
--   - beneficiaire_id        (clé stable du registre dim_beneficiaire)
--
-- Output: ~53k lignes, 2018-2024.
-- =============================================================================

WITH subventions AS (
    SELECT * FROM {{ ref('stg_subventions_all') }}
),

associations AS (
    SELECT * FROM {{ ref('stg_associations') }}
),

mapping_directions AS (
    SELECT * FROM {{ ref('stg_mapping_directions') }}
),

-- Registre d'identité : beneficiaire_id + enrichissement niveau-entité.
dim AS (
    SELECT * FROM {{ ref('dim_beneficiaire') }}
),

-- ─── ÉTAPE 1 : Dédupliquer associations pour le JOIN ───────────────────────────
-- Une ligne par (beneficiaire_normalise, annee). Priorité au dossier avec le
-- plus gros montant (représente mieux l'activité principale).
associations_dedup AS (
    SELECT
        beneficiaire_normalise,
        annee,
        siret,
        direction,
        objet,
        secteurs_activite,
        -- Tiebreaker stable (siret ASC) pour reproductibilité quand
        -- plusieurs lignes ont le même montant.
        ROW_NUMBER() OVER (
            PARTITION BY beneficiaire_normalise, annee
            ORDER BY montant DESC,
                     COALESCE(siret, '') ASC,
                     COALESCE(direction, '') ASC
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

-- ─── ÉTAPE 2 : JOIN des enrichissements ────────────────────────────────────────
-- Année-level : associations (siret/direction/objet). Entité-level : dim
-- (pattern/llm thematique, nom canonique, beneficiaire_id).
joined AS (
    SELECT
        s.*,
        a.siret,
        a.direction,
        a.objet,
        a.secteurs_activite,
        d.beneficiaire_id,
        d.pattern_thematique,
        d.pattern_sous_categorie,
        md.thematique AS direction_thematique,
        d.llm_thematique,
        d.llm_sous_categorie,
        d.nom_canonique AS matched_nom_canonique
    FROM subventions s
    LEFT JOIN associations_unique a
        ON s.beneficiaire_normalise = a.beneficiaire_normalise
        AND s.annee = a.annee
    LEFT JOIN dim d
        ON s.beneficiaire_normalise = d.beneficiaire_normalise
    LEFT JOIN mapping_directions md
        ON a.direction = md.direction
)

-- ─── ÉTAPE 3 : Construction des colonnes ode_* ─────────────────────────────────
SELECT
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

    -- Clé stable du registre d'identité (survit à la dérive de normalisation).
    beneficiaire_id,

    siret,
    direction,
    objet,
    secteurs_activite,

    -- Cascade thematique : pattern → direction → llm → fallback catégorie
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

    COALESCE(pattern_sous_categorie, llm_sous_categorie) AS ode_sous_categorie,

    CASE
        WHEN pattern_thematique IS NOT NULL THEN 'pattern'
        WHEN direction_thematique IS NOT NULL THEN 'direction'
        WHEN llm_thematique IS NOT NULL THEN 'llm'
        ELSE 'default'
    END AS ode_source_thematique,

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

    CASE
        WHEN prestations_nature IS NOT NULL AND prestations_nature > 0 THEN TRUE
        ELSE FALSE
    END AS ode_contribution_nature,

    COALESCE(matched_nom_canonique, beneficiaire_normalise) AS ode_beneficiaire_canonique,

    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM joined
