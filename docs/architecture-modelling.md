# ARCHITECTURE COMPLÈTE - PARIS BUDGET DASHBOARD

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Sources de données](#2-sources-de-données)
3. [Architecture des couches](#3-architecture-des-couches)
   - 3.7 [Fonctionnalités transversales](#37-fonctionnalités-transversales) (Paris Centre, Déduplication)
4. [Conventions de nommage](#4-conventions-de-nommage)
5. [Stratégie de jointure](#5-stratégie-de-jointure)
6. [Enrichissement](#6-enrichissement)
7. [Scripts Python](#7-scripts-python)
8. [Export et Frontend](#8-export-et-frontend)
9. [Qualité des données](#9-qualité-des-données)
   - 9.12 [Résultats audit complet](#912-résultats-audit-complet-2026-02-05)
10. [Estimation des coûts et temps](#10-estimation-des-coûts-et-temps)
11. [Structure des fichiers](#11-structure-des-fichiers)
12. [Workflow de mise à jour](#12-workflow-de-mise-à-jour)

---

## 1. Vue d'ensemble

### 1.1 Objectif

Créer un dashboard interactif permettant aux Parisiens de visualiser le budget de la Ville de Paris :
- **Sankey** : Flux budgétaires du global au détail avec drill-down
- **Carte** : Projets d'investissement (AP) et logements sociaux géolocalisés
- **Subventions** : Treemap par thématique + table filtrable (nature juridique, direction, secteur)
- **Stats** : Agrégations par arrondissement

> **Insight clé** : Les subventions vont à des ORGANISATIONS, pas à des LIEUX. L'adresse du siège 
> d'une association ne reflète pas où l'action est menée. Donc : pas de carte pour les subventions,
> mais une visualisation par thème avec drill-down sur les bénéficiaires.

### 1.2 Principes architecturaux

| Principe | Description |
|----------|-------------|
| **OBT (One Big Table)** | Tables finales dénormalisées, une OBT par entité |
| **Static Data First** | JSON pré-calculés, pas d'API live |
| **Enrichissement incrémental** | Seeds = cache persistant, ne traite que les nouveaux records |
| **Séparation données/enrichissement** | Préfixe `ode_` pour distinguer original vs enrichi |
| **LLM hors pipeline** | LLM uniquement dans scripts Python, jamais dans dbt |

### 1.3 Diagramme global

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              OPENDATA PARIS API                                  │
│         (6 datasets : budget, AP, subventions, associations, logements, marchés) │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                    scripts/sync_opendata.py
                    (SKIP si table déjà à jour)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BIGQUERY - raw                                           │
│  Tables brutes, noms = dataset_id OpenData (snake_case), AUCUNE transformation  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                              dbt run
                                 │
┌────────────────────────────────┼────────────────────────────────────────────────┐
│  STAGING (Views)               │                                                │
│  Nettoyage, typage, clés       │                                                │
│  standardisées                 │                                                │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  SEEDS (CSV)                   │  Mappings statiques + Caches enrichissement   │
│  ← Scripts Python (hors dbt)   │  (incrémental, asyncio, LLM batch)            │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  INTERMEDIATE (Tables)         │  JOIN staging + seeds → colonnes ode_*        │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  CORE (Tables OBT)             │  1 table wide par entité                      │
│  core_budget                   │  (budget, subventions, ap_projets, logements)  │
│  core_subventions              │                                                │
│  core_ap_projets               │                                                │
│  core_logements_sociaux        │                                                │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  MARTS (Views)                 │  Agrégations métier (Sankey, cartes, stats)   │
└────────────────────────────────┼────────────────────────────────────────────────┘
                                 │
                  scripts/export_*.py
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      frontend/public/data/                                       │
│            JSON statiques pour Next.js (Sankey, cartes, drill-down)             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sources de données

### 2.1 Inventaire OpenData Paris

> **Convention de nommage raw** : Le nom de table = dataset_id OpenData en snake_case (aucune abréviation)

| # | Dataset ID OpenData | Table BigQuery (raw) | Records | Usage |
|---|---------------------|---------------------|---------|-------|
| 1 | `comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement` | `comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement` | ~25k | **Source de vérité** budget |
| 2 | `comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de` | `comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de` | ~7k | Projets d'investissement |
| 3 | `subventions-versees-annexe-compte-administratif-a-partir-de-2018` | `subventions_versees_annexe_compte_administratif_a_partir_de_2018` | ~47k | Toutes subventions |
| 4 | `subventions-associations-votees-` | `subventions_associations_votees` | ~100k | Détail avec SIRET |
| 5 | `logements-sociaux-finances-a-paris` | `logements_sociaux_finances_a_paris` | ~4k | Déjà géolocalisé |
| 6 | `liste-des-marches-de-la-collectivite-parisienne` | `liste_des_marches_de_la_collectivite_parisienne` | ~17k | Contexte (non sommable) |

### 2.2 Colonnes clés par source

**ca_budget_principal** (source de vérité)
```
exercice_comptable, section_budgetaire_i_f, sens_depense_recette,
type_d_operation_r_o_i_m, chapitre_budgetaire_cle, chapitre_niveau_vote_texte_descriptif,
nature_budgetaire_cle, nature_budgetaire_texte, fonction_cle, fonction_texte,
mandate_titre_apres_regul
```

**ca_ap_projets** (projets AP)
```
exercice_comptable, budget, section_budgetaire_i_f, sens_depense_recette,
type_d_operation_r_o_i_m, mission_ap_cle, mission_ap_texte, direction_gestionnaire_cle,
direction_gestionnaire_texte, autorisation_de_programme_cle, autorisation_de_programme_texte,
nature_budgetaire_cle, domaine_fonctionnel_rubrique_reglementaire_cle,
mandate_titre_apres_regul
```
→ Contient `nature` et `fonction` → **joinable au budget**

**ca_subventions** (annexe CA)
```
publication, collectivite, categorie_du_beneficiaire, nature_juridique_du_beneficiaire,
nom_de_l_organisme_beneficiaire, montant_de_la_subvention, prestations_en_nature
```
→ **PAS de chapitre/nature/fonction** → classification par pattern matching
→ **PAS de direction** → vient de la table `associations`

**associations** (détail avec SIRET)
```
numero_de_dossier, annee_budgetaire, collectivite, nom_beneficiaire, numero_siret,
objet_du_dossier, montant_vote, direction, nature_de_la_subvention,
secteurs_d_activites_definies_par_l_association
```
→ Contient `direction`, `siret`, `objet` → enrichit `ca_subventions` via JOIN

**logements_sociaux** (déjà géolocalisé)
```
identifiant_livraison, adresse_du_programme, code_postal, annee_du_financement_agrement,
bailleur_social, nombre_total_de_logements_finances, arrondissement, geo_point_2d
```
→ `geo_point_2d` déjà présent → pas d'enrichissement nécessaire

---

## 3. Architecture des couches

### 3.1 RAW Layer

**Principe** : Miroir exact d'OpenData Paris, aucune transformation.

**Règles** :
- Noms de tables = `dataset_id` en snake_case
- Colonnes = noms originaux
- Sync = `WRITE_TRUNCATE` (remplacement complet)
- Script vérifie si table déjà à jour avant de télécharger

**Tables** :
```
raw.comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement
raw.comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de
raw.subventions_versees_annexe_compte_administratif_a_partir_de_2018
raw.subventions_associations_votees
raw.logements_sociaux_finances_a_paris
raw.liste_des_marches_de_la_collectivite_parisienne
```

### 3.2 STAGING Layer (Views)

**Principe** : Nettoyage, typage, renommage standardisé. Pas de logique métier.

**Modèles** :

| Modèle | Source (raw) | Transformations |
|--------|--------------|-----------------|
| `stg_budget_principal` | `comptes_administratifs_budgets_principaux_*` | Filtre type_op='Réel', typage montant, renommage FR |
| `stg_ap_projets` | `comptes_administratifs_autorisations_de_programmes_*` | Filtre Réel+Dépenses, extraction arrondissement regex |
| `stg_subventions_all` | `subventions_versees_annexe_compte_administratif_*` | Parse année depuis publication, normalisation nom |
| `stg_associations` | `subventions_associations_votees` | SIRET padding 14 chars, normalisation nom |
| `stg_logements_sociaux` | `logements_sociaux_finances_a_paris` | Parse geo_point_2d → lat/lng |
| `stg_marches_publics` | `liste_des_marches_de_la_collectivite_parisienne` | Typage dates et montants |

**Exemple stg_subventions_all** :
```sql
SELECT
    -- Année extraite de "CA 2023" ou "2023"
    SAFE_CAST(REGEXP_EXTRACT(publication, r'(\d{4})') AS INT64) AS annee,
    
    -- Bénéficiaire normalisé (pour jointures)
    UPPER(TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(nom_de_l_organisme_beneficiaire, r"^(L'|LA |LE )", ''),
        r'\s+', ' '
    ))) AS beneficiaire_normalise,
    
    -- Colonnes originales
    nom_de_l_organisme_beneficiaire AS beneficiaire,
    categorie_du_beneficiaire AS categorie,
    nature_juridique_du_beneficiaire AS nature_juridique,
    ABS(SAFE_CAST(montant_de_la_subvention AS FLOAT64)) AS montant,
    
    -- Flag données disponibles (2020-2021 = 100% NULL)
    CASE WHEN annee IN (2020, 2021) AND nom_de_l_organisme_beneficiaire IS NULL 
         THEN FALSE ELSE TRUE END AS donnees_disponibles,
    
    -- Clé technique
    CONCAT(annee, '-', beneficiaire_normalise, '-', collectivite) AS cle_technique
    
FROM {{ source('paris_raw', 'ca_subventions') }}
WHERE montant > 0
```

### 3.3 SEEDS Layer (CSV)

**Principe** : Fichiers CSV versionnés dans Git. Deux types :
1. **Mappings statiques** : règles de classification (manuels)
2. **Caches d'enrichissement** : résultats API/LLM (générés par scripts)

#### Mappings statiques

**seed_mapping_thematiques.csv** (chapitre → thématique)
```csv
chapitre_code,fonction_prefix,thematique
930,,Administration
931,,Sécurité
932,21,Éducation - Écoles
932,22,Éducation - Collèges
933,31,Culture
933,32,Sport
934,,Social
935,,Urbanisme
936,,Économie
937,,Environnement
938,,Transport
```

**seed_mapping_directions.csv** (direction → thématique)
```csv
direction,thematique,libelle_complet
DAC,Culture,Direction des Affaires Culturelles
DFPE,Petite enfance,Direction des Familles et de la Petite Enfance
DAE,Économie,Direction de l'Attractivité et de l'Emploi
DSOL,Social,Direction des Solidarités
DJS,Sport,Direction de la Jeunesse et des Sports
DASCO,Éducation,Direction des Affaires Scolaires
DEVE,Environnement,Direction des Espaces Verts et de l'Environnement
DLH,Logement,Direction du Logement et de l'Habitat
DVD,Voirie,Direction de la Voirie et des Déplacements
DDCT,Citoyenneté,Direction de la Démocratie Citoyens et Territoires
```

**seed_mapping_beneficiaires.csv** (pattern regex → thématique)
```csv
pattern,thematique,sous_categorie,priorite
CENTRE.ACTION.SOC|CASVP,Social,CASVP,1
PARIS.MUSEES,Culture,Musées,1
PARIS.HABITAT|OPH,Logement,Bailleur social,1
REGIE.*(TRANSPORTS|RATP)|^RATP$,Transport,RATP,1
REGIE.IMMOBILIERE|^RIVP$,Logement,RIVP,1
ELOGIE|SIEMP,Logement,Bailleur social,1
THEATRE|OPERA|COMEDIE,Culture,Spectacle vivant,2
CITE.DE.LA.MUSIQUE|PHILHARMONIE,Culture,Musique,1
CAISSE.*(ECOLES|DES.ECOLES),Éducation,Restauration scolaire,1
SNCF|RESEAU.FERRE,Transport,Ferroviaire,1
FORUM.DES.IMAGES|GAITE.LYRIQUE|104.CENT.QUATRE,Culture,Établissements,1
IMMOBILIERE.3F|ICF|SABLIERE,Logement,Bailleur social,1
AUTOLIB|VELIB|MOBILITES.PARTAGEES,Transport,Mobilité douce,1
EMMAUS|CROIX.ROUGE|SECOURS|SAMU.SOCIAL,Social,Solidarité,2
SOLIDEO|OLYMP,Sport,JO 2024,1
CRESCENDO|ABC.PUERICULTURE|KANGOUROU,Social,Petite enfance,2
```

**seed_lieux_connus.csv** (lieux parisiens → adresse exacte)
```csv
pattern_match,nom_complet,adresse,arrondissement,latitude,longitude
PISCINE PONTOISE,Piscine Pontoise,19 rue de Pontoise,5,48.8498,2.3517
GYMNASE JAPY,Gymnase Japy,2 rue Japy,11,48.8533,2.3797
PHILHARMONIE,Philharmonie de Paris,221 avenue Jean Jaurès,19,48.8893,2.3936
THEATRE DE LA VILLE,Théâtre de la Ville,2 place du Châtelet,4,48.8566,2.3472
PISCINE BLOMET,Piscine Blomet,17 rue Blomet,15,48.8421,2.3053
STADE CHARLETY,Stade Charléty,99 boulevard Kellermann,13,48.8186,2.3478
```

#### Caches d'enrichissement (générés par scripts)

**seed_cache_thematique_beneficiaires.csv** (1,244 records)
```csv
beneficiaire_normalise,ode_thematique,ode_sous_categorie,ode_confiance,ode_date_recherche,ode_source
THEATRE MUSICAL DE PARIS,Culture,Spectacle vivant,0.9,2026-02-05,llm_gemini
ASSOCIATION SPORTIVE PARIS 15,Sport,Club sportif,0.95,2026-02-05,llm_gemini
```

**seed_cache_geo_ap.csv** (483 records)
```csv
ap_code,ap_texte_original,ode_adresse,ode_arrondissement,ode_latitude,ode_longitude,ode_confiance,source,date_enrichissement
1623315,BPA - GYMNASE JAPY (11E),2 rue Japy,11,48.8533,2.3797,0.95,llm,2026-02-05
```

**seed_cache_siret_by_name.csv** (legacy, ~10k records)
```csv
beneficiaire_normalise,siret_found,nom_officiel,adresse,code_postal,score_match,source,date_enrichissement
CENTRE ACTION SOCIALE VILLE PARIS,26750005200016,CENTRE D'ACTION SOCIALE...,5 boulevard Diderot,75012,0.85,api_annuaire,2024-01-15
```
> Note: Ce cache SIRET n'est plus utilisé activement (géoloc subventions abandonnée) mais conservé pour référence.

### 3.4 INTERMEDIATE Layer (Tables)

**Principe** : JOIN staging + seeds → ajout colonnes `ode_*`

**Modèles** :

**int_subventions_enrichies.sql**
```sql
-- Enrichit subventions avec: direction/siret (join associations) + thématique (cascade)
-- NOTE: Pas de géolocalisation - subventions = organisations, pas lieux

WITH subventions AS (SELECT * FROM {{ ref('stg_subventions_all') }}),
associations AS (SELECT * FROM {{ ref('stg_associations') }}),
mapping_beneficiaires AS (SELECT * FROM {{ ref('seed_mapping_beneficiaires') }}),
mapping_directions AS (SELECT * FROM {{ ref('seed_mapping_directions') }}),
cache_thematique AS (SELECT * FROM {{ ref('seed_cache_thematique_beneficiaires') }}),

-- 1. JOIN avec associations (siret, direction, objet)
joined AS (
    SELECT s.*, a.siret, a.direction, a.objet, a.secteurs_activite
    FROM subventions s
    LEFT JOIN associations a
        ON s.beneficiaire_normalise = a.beneficiaire_normalise AND s.annee = a.annee
),

-- 2. Thématique: cascade Pattern → Direction → LLM → Default
with_thematique AS (
    SELECT
        j.*,
        COALESCE(
            mp.thematique,           -- Priorité 1: Pattern (72 regex)
            md.thematique,           -- Priorité 2: Direction (25 mappings)
            ct.ode_thematique,       -- Priorité 3: LLM cache (1,244 records)
            'Non classifié'          -- Priorité 4: Default
        ) AS ode_thematique,
        COALESCE(mp.sous_categorie, ct.ode_sous_categorie) AS ode_sous_categorie,
        CASE
            WHEN mp.thematique IS NOT NULL THEN 'pattern'
            WHEN md.thematique IS NOT NULL THEN 'direction'
            WHEN ct.ode_thematique IS NOT NULL THEN 'llm'
            ELSE 'default'
        END AS ode_source_thematique,
        
        -- Type d'organisme (dérivé de nature_juridique)
        CASE j.nature_juridique
            WHEN 'Etablissements publics' THEN 'public'
            WHEN 'Associations' THEN 'association'
            WHEN 'Entreprises' THEN 'entreprise'
            WHEN 'Personnes physiques' THEN 'personne_physique'
            ELSE 'autre'
        END AS ode_type_organisme,
        
        -- Flag contribution en nature
        (j.prestations_nature IS NOT NULL AND j.prestations_nature > 0) AS ode_contribution_nature
        
    FROM joined j
    LEFT JOIN mapping_beneficiaires mp ON REGEXP_CONTAINS(j.beneficiaire_normalise, mp.pattern)
    LEFT JOIN mapping_directions md ON j.direction = md.direction
    LEFT JOIN cache_thematique ct ON j.beneficiaire_normalise = ct.beneficiaire_normalise
)

SELECT * FROM with_thematique
```

**int_ap_projets_enrichis.sql**
```sql
WITH projets AS (
    SELECT * FROM {{ ref('stg_ap_projets') }}
),

lieux_connus AS (
    SELECT * FROM {{ ref('seed_lieux_connus') }}
),

cache_geo AS (
    SELECT * FROM {{ ref('seed_cache_geo_ap') }}
),

-- 1. Extraction arrondissement par regex
with_regex AS (
    SELECT
        *,
        CASE
            WHEN REGEXP_CONTAINS(ap_texte, r'750(0[1-9]|1[0-9]|20)')
            THEN CAST(REGEXP_EXTRACT(ap_texte, r'750(0[1-9]|1[0-9]|20)') AS INT64)
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'\((\d{1,2})E\)')
            THEN CAST(REGEXP_EXTRACT(UPPER(ap_texte), r'\((\d{1,2})E\)') AS INT64)
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'\b(\d{1,2})(E|EME|ÈME)\s*(ARR|ARRON)?')
            THEN CAST(REGEXP_EXTRACT(UPPER(ap_texte), r'\b(\d{1,2})(E|EME|ÈME)') AS INT64)
            ELSE NULL
        END AS arrondissement_regex,
        -- Type d'équipement par regex
        CASE
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PISCINE|BASSIN|AQUA') THEN 'piscine'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'GYMNASE|SPORT|STADE') THEN 'equipement_sportif'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'ECOLE|COLLEGE|LYCEE') THEN 'etablissement_scolaire'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'CRECHE|PETITE.ENFANCE') THEN 'petite_enfance'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PARC|JARDIN|SQUARE') THEN 'espace_vert'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'MUSEE|BIBLIOTHEQUE|THEATRE') THEN 'equipement_culturel'
            ELSE NULL
        END AS type_equipement_regex
    FROM projets
),

-- 2. JOIN lieux connus
with_lieux AS (
    SELECT
        p.*,
        l.adresse AS adresse_lieu,
        l.arrondissement AS arrondissement_lieu,
        l.latitude AS lat_lieu,
        l.longitude AS lng_lieu
    FROM with_regex p
    LEFT JOIN lieux_connus l
        ON REGEXP_CONTAINS(UPPER(p.ap_texte), UPPER(l.pattern_match))
),

-- 3. JOIN cache LLM
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

-- 4. Consolidation finale (cascade: regex → lieu_connu → cache LLM)
final AS (
    SELECT
        * EXCEPT(
            arrondissement_regex, type_equipement_regex,
            adresse_lieu, arrondissement_lieu, lat_lieu, lng_lieu,
            adresse_cache, arrondissement_cache, lat_cache, lng_cache, confiance_cache
        ),
        
        -- Arrondissement : cascade
        COALESCE(arrondissement_regex, arrondissement_lieu, arrondissement_cache) AS ode_arrondissement,
        
        -- Adresse
        COALESCE(adresse_lieu, adresse_cache) AS ode_adresse,
        
        -- Coordonnées
        COALESCE(lat_lieu, lat_cache) AS ode_latitude,
        COALESCE(lng_lieu, lng_cache) AS ode_longitude,
        
        -- Type équipement
        type_equipement_regex AS ode_type_equipement,
        
        -- Source
        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 'regex'
            WHEN arrondissement_lieu IS NOT NULL THEN 'lieu_connu'
            WHEN arrondissement_cache IS NOT NULL THEN 'llm'
            ELSE NULL
        END AS ode_source_geo,
        
        -- Confiance
        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 1.0
            WHEN arrondissement_lieu IS NOT NULL THEN 0.95
            WHEN confiance_cache IS NOT NULL THEN confiance_cache
            ELSE NULL
        END AS ode_confiance
        
    FROM with_cache
)

SELECT * FROM final
```

### 3.5 CORE Layer (Tables OBT)

**Principe** : Une table dénormalisée (wide & flat) par entité. Pas d'ARRAY, pas d'agrégation. Grain le plus fin possible.

**core_budget.sql**
```sql
-- Grain: (annee, section, chapitre, nature, fonction, sens_flux)
-- Une ligne = une combinaison budgétaire unique

WITH budget AS (
    SELECT * FROM {{ ref('stg_budget_principal') }}
),

mapping_thematiques AS (
    SELECT * FROM {{ ref('seed_mapping_thematiques') }}
),

final AS (
    SELECT
        -- =====================================================================
        -- COLONNES ORIGINALES (pas de préfixe)
        -- =====================================================================
        b.annee,
        b.section,
        b.sens_flux,
        b.chapitre_code,
        b.chapitre_libelle,
        b.nature_code,
        b.nature_libelle,
        b.fonction_code,
        b.fonction_libelle,
        b.montant,
        
        -- Clé technique
        CONCAT(b.annee, '-', b.section, '-', b.sens_flux, '-',
               b.chapitre_code, '-', b.nature_code, '-', b.fonction_code) AS cle_budget,
        
        -- =====================================================================
        -- COLONNES ENRICHIES (préfixe ode_)
        -- =====================================================================
        
        -- Thématique dashboard
        COALESCE(
            m.thematique,
            CASE b.chapitre_code
                WHEN '930' THEN 'Administration'
                WHEN '931' THEN 'Sécurité'
                WHEN '932' THEN 'Éducation'
                WHEN '933' THEN 'Culture & Sport'
                WHEN '934' THEN 'Social'
                WHEN '935' THEN 'Urbanisme'
                WHEN '936' THEN 'Économie'
                WHEN '937' THEN 'Environnement'
                WHEN '938' THEN 'Transport'
                ELSE 'Autre'
            END
        ) AS ode_thematique,
        
        -- Catégorie de flux (Personnel, Subventions, Dette, etc.)
        CASE
            WHEN b.nature_code LIKE '64%' THEN 'Personnel'
            WHEN b.nature_code LIKE '657%' THEN 'Subventions (fonctionnement)'
            WHEN b.nature_code LIKE '204%' THEN 'Subventions (investissement)'
            WHEN b.nature_code LIKE '651%' OR b.nature_code LIKE '652%' THEN 'Transferts sociaux'
            WHEN b.nature_code LIKE '655%' OR b.nature_code LIKE '656%' THEN 'Contributions obligatoires'
            WHEN b.nature_code LIKE '60%' OR b.nature_code LIKE '61%' OR b.nature_code LIKE '62%' THEN 'Achats & Services'
            WHEN b.nature_code LIKE '66%' THEN 'Charges financières'
            WHEN b.nature_code LIKE '16%' THEN 'Remboursement dette'
            WHEN b.nature_code LIKE '739%' THEN 'Reversements péréquation'
            WHEN b.nature_code LIKE '748%' THEN 'Dotations arrondissements'
            WHEN b.nature_code LIKE '21%' OR b.nature_code LIKE '23%' THEN 'Équipements & Constructions'
            WHEN b.nature_code LIKE '20%' AND b.nature_code NOT LIKE '204%' THEN 'Études'
            ELSE 'Autre'
        END AS ode_categorie_flux,
        
        -- Flag disponibilité subventions
        CASE WHEN b.annee IN (2020, 2021) THEN FALSE ELSE TRUE END AS donnees_subv_disponibles,
        
        -- Métadonnées
        CURRENT_TIMESTAMP() AS _dbt_updated_at

    FROM budget b
    LEFT JOIN mapping_thematiques m
        ON b.chapitre_code = m.chapitre_code
        AND (m.fonction_prefix IS NULL OR b.fonction_code LIKE CONCAT(m.fonction_prefix, '%'))
)

SELECT * FROM final
```

**core_subventions.sql**
```sql
-- Grain: (annee, beneficiaire_normalise, collectivite) ou cle_technique
-- Une ligne = une subvention unique
-- NOTE: Pas de géolocalisation - les subventions vont à des organisations, pas des lieux

SELECT
    -- =====================================================================
    -- COLONNES ORIGINALES
    -- =====================================================================
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
    
    -- Depuis jointure associations (pour filtres UI)
    siret,
    direction,
    objet,
    secteurs_activite,
    
    -- =====================================================================
    -- COLONNES ENRICHIES (ode_*)
    -- =====================================================================
    -- Classification thématique (cascade: pattern → direction → llm → default)
    ode_thematique,
    ode_sous_categorie,
    ode_source_thematique,
    
    -- Segmentation par type d'organisme (dérivé de nature_juridique)
    ode_type_organisme,       -- public/association/entreprise/personne_physique/autre
    
    -- Flag contribution en nature (vs numéraire)
    ode_contribution_nature,  -- BOOLEAN
    
    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('int_subventions_enrichies') }}
```

**Colonnes `ode_type_organisme`** (mapping nature_juridique) :
| nature_juridique | ode_type_organisme |
|------------------|-------------------|
| Établissements publics, Etat, Communes, Régions | `public` |
| Associations | `association` |
| Entreprises | `entreprise` |
| Personnes physiques | `personne_physique` |
| Autres personnes de droit privé | `prive_autre` |
| NULL ou autre | `non_renseigne` |

**core_ap_projets.sql**
```sql
-- Grain: (annee, ap_code)
-- Une ligne = un projet AP unique

SELECT
    -- =====================================================================
    -- COLONNES ORIGINALES
    -- =====================================================================
    annee,
    ap_code,
    ap_texte,
    mission_code,
    mission_libelle,
    direction,
    nature_code,
    fonction_code,
    montant,
    cle_technique,
    
    -- =====================================================================
    -- COLONNES ENRICHIES (ode_*)
    -- =====================================================================
    ode_arrondissement,
    ode_adresse,
    ode_latitude,
    ode_longitude,
    ode_type_equipement,
    ode_source_geo,
    ode_confiance,
    
    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('int_ap_projets_enrichis') }}
```

**core_logements_sociaux.sql**
```sql
-- Grain: (id_livraison)
-- Déjà géolocalisé dans la source, pas de colonnes ode_*

SELECT
    id_livraison,
    adresse,
    code_postal,
    annee,
    bailleur,
    arrondissement,
    nb_logements,
    nb_plai,
    nb_plus,
    nb_pls,
    nature_programme,
    mode_realisation,
    latitude,  -- Depuis source, pas ode_
    longitude, -- Depuis source, pas ode_
    
    -- Agrégation Paris Centre (1-4 → 0)
    ode_arrondissement_affichage,  -- 0 = Paris Centre
    ode_arrondissement_label,       -- "Paris Centre" ou "5e", "6e", etc.
    
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('stg_logements_sociaux') }}
```

### 3.7 Fonctionnalités transversales

#### A. Agrégation Paris Centre (arrondissements 1-4)

Depuis la fusion administrative de 2020, les arrondissements 1, 2, 3 et 4 sont regroupés en "Paris Centre".

**Colonnes ajoutées** dans `core_logements_sociaux` et `core_ap_projets` :

| Colonne | Type | Description |
|---------|------|-------------|
| `ode_arrondissement_affichage` | INT | 0 pour Paris Centre, sinon arrondissement original |
| `ode_arrondissement_label` | STRING | "Paris Centre" ou "5e", "6e", ..., "20e" |

```sql
-- Implémentation
CASE
    WHEN arrondissement IN (1, 2, 3, 4) THEN 0  -- Paris Centre
    ELSE arrondissement
END AS ode_arrondissement_affichage,

CASE
    WHEN arrondissement IN (1, 2, 3, 4) THEN 'Paris Centre'
    ELSE CONCAT(CAST(arrondissement AS STRING), 'e')
END AS ode_arrondissement_label
```

> **Usage frontend** : Utiliser `ode_arrondissement_affichage` pour les agrégations et `ode_arrondissement_label` pour l'affichage.

#### B. Déduplication des entités (CASVP, etc.)

Certaines entités apparaissent sous différents noms dans les données sources (ex: "CASVP", "CENTRE ACTION SOCIALE VILLE PARIS", "CENTRE D'ACTION SOCIALE DE LA VILLE DE PARIS").

**Seed** : `seed_mapping_entites.csv`
```csv
pattern,nom_canonique,description
CENTRE.*(ACTION|D.ACTION).*(SOCIALE|SOC).*PARIS,CENTRE ACTION SOCIALE VILLE DE PARIS,CASVP
CASVP,CENTRE ACTION SOCIALE VILLE DE PARIS,Sigle CASVP
EMMAUS.*SOLIDARIT,EMMAUS SOLIDARITE,Emmaüs Solidarité
THEATRE.*(DE LA|DU).*VILLE,THEATRE DE LA VILLE,Théâtre de la Ville
```

**Colonne ajoutée** dans `core_subventions` :

| Colonne | Type | Description |
|---------|------|-------------|
| `ode_beneficiaire_canonique` | STRING | Nom canonique si pattern match, sinon `beneficiaire` original |

> **Usage** : Permet d'agréger correctement les montants par bénéficiaire unique (ex: CASVP = 1,940 M€ total).

### 3.6 MARTS Layer (Views)

**Principe** : Agrégations métier pour le dashboard. C'est ici qu'on calcule les top bénéficiaires/projets.

**Modèles disponibles** :

| Mart | Source | Fonction | Output |
|------|--------|----------|--------|
| `mart_sankey` | core_budget | Diagramme flux budgétaires | ~300 liens/an |
| `mart_subventions_treemap` | core_subventions | Treemap par thématique | ~20 thématiques/an |
| `mart_subventions_beneficiaires` | core_subventions | Table filtrable bénéficiaires | ~8k lignes/an |
| `mart_carte_investissements` | core_ap_projets | Projets géolocalisés | ~1k points/an |
| `mart_stats_arrondissements` | core_* | Stats agrégées par arr | 20 × années |
| `mart_evolution_budget` | core_budget | Évolution temporelle YoY | ~200 lignes |
| `mart_concentration` | core_subventions, core_ap | Analyse Pareto | ~500 lignes |

**mart_sankey.sql**
```sql
-- Vue pour le diagramme Sankey

WITH budget AS (
    SELECT * FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
),

-- Top bénéficiaires par thématique
top_beneficiaires AS (
    SELECT
        annee,
        ode_thematique,
        beneficiaire,
        SUM(montant) AS montant_total,
        ROW_NUMBER() OVER (PARTITION BY annee, ode_thematique ORDER BY SUM(montant) DESC) AS rang
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE
    GROUP BY 1, 2, 3
    QUALIFY rang <= 10
),

-- Top projets par fonction
top_projets AS (
    SELECT
        annee,
        SUBSTR(fonction_code, 1, 2) AS fonction_prefix,
        ap_code,
        ap_texte,
        ode_arrondissement,
        SUM(montant) AS montant_total,
        ROW_NUMBER() OVER (PARTITION BY annee, SUBSTR(fonction_code, 1, 2) ORDER BY SUM(montant) DESC) AS rang
    FROM {{ ref('core_ap_projets') }}
    GROUP BY 1, 2, 3, 4, 5
    QUALIFY rang <= 10
)

SELECT
    b.annee,
    b.section AS niveau_1,
    b.ode_thematique AS niveau_2,
    CONCAT(b.chapitre_code, ' - ', b.chapitre_libelle) AS niveau_3,
    SUM(b.montant) AS montant,
    b.donnees_subv_disponibles,
    
    -- Drill-down data (agrégé en JSON pour l'export)
    TO_JSON_STRING(ARRAY_AGG(DISTINCT STRUCT(
        tb.beneficiaire, tb.montant_total, tb.rang
    ) IGNORE NULLS)) AS top_beneficiaires_json,
    
    TO_JSON_STRING(ARRAY_AGG(DISTINCT STRUCT(
        tp.ap_texte, tp.montant_total, tp.ode_arrondissement, tp.rang
    ) IGNORE NULLS)) AS top_projets_json

FROM budget b
LEFT JOIN top_beneficiaires tb ON b.annee = tb.annee AND b.ode_thematique = tb.ode_thematique
LEFT JOIN top_projets tp ON b.annee = tp.annee AND SUBSTR(b.fonction_code, 1, 2) = tp.fonction_prefix
GROUP BY 1, 2, 3, 4, 6
```

**mart_subventions_treemap.sql**
```sql
-- Vue pour le treemap et la table des subventions
-- PAS de géolocalisation : les subventions vont à des organisations, pas des lieux

WITH aggregated AS (
    SELECT
        annee,
        ode_thematique,
        nature_juridique,
        direction,
        secteurs_activite,
        COUNT(DISTINCT beneficiaire_normalise) AS nb_beneficiaires,
        SUM(montant) AS montant_total
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE
    GROUP BY 1, 2, 3, 4, 5
),

top_beneficiaires AS (
    SELECT
        annee,
        ode_thematique,
        beneficiaire,
        nature_juridique,
        direction,
        SUM(montant) AS montant_total,
        ROW_NUMBER() OVER (PARTITION BY annee, ode_thematique ORDER BY SUM(montant) DESC) AS rang
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE
    GROUP BY 1, 2, 3, 4, 5
)

SELECT
    a.annee,
    a.ode_thematique AS thematique,
    a.nature_juridique,
    a.direction,
    a.secteurs_activite,
    a.nb_beneficiaires,
    a.montant_total,
    -- Top 10 bénéficiaires par thématique (pour drill-down)
    ARRAY_AGG(STRUCT(
        tb.beneficiaire,
        tb.nature_juridique,
        tb.direction,
        tb.montant_total,
        tb.rang
    ) ORDER BY tb.rang LIMIT 10) AS top_beneficiaires
FROM aggregated a
LEFT JOIN top_beneficiaires tb 
    ON a.annee = tb.annee 
    AND a.ode_thematique = tb.ode_thematique
GROUP BY 1, 2, 3, 4, 5, 6, 7
```

**Colonnes de filtrage disponibles pour les subventions** :
| Colonne | Exemple valeurs | Usage UI |
|---------|-----------------|----------|
| `ode_thematique` | Social, Culture & Sport, Éducation | Treemap principal |
| `ode_type_organisme` | public, association, entreprise, personne_physique | Filtre segmentation |
| `ode_contribution_nature` | true/false | Filtre nature vs numéraire |
| `nature_juridique` | Associations, Entreprises, Fondations | Filtre dropdown |
| `direction` | DAC, DASES, DJS | Filtre dropdown |
| `secteurs_activite` | Sport, Santé, Environnement | Filtre multi-select |

**mart_carte_projets.sql**
```sql
-- Vue pour la carte des projets AP géolocalisés

SELECT
    annee,
    ap_code,
    ap_texte AS projet,
    direction,
    mission_libelle,
    ode_type_equipement,
    montant,
    ode_adresse,
    ode_arrondissement,
    ode_latitude,
    ode_longitude,
    ode_source_geo,
    ode_confiance

FROM {{ ref('core_ap_projets') }}
WHERE ode_arrondissement IS NOT NULL OR ode_latitude IS NOT NULL
```

**mart_stats_arrondissements.sql**
```sql
-- Statistiques agrégées par arrondissement

WITH subv AS (
    SELECT ode_arrondissement AS arr, annee, SUM(montant) AS montant_subv, COUNT(*) AS nb_subv
    FROM {{ ref('core_subventions') }}
    WHERE ode_arrondissement IS NOT NULL
    GROUP BY 1, 2
),

ap AS (
    SELECT ode_arrondissement AS arr, annee, SUM(montant) AS montant_ap, COUNT(DISTINCT ap_code) AS nb_projets
    FROM {{ ref('core_ap_projets') }}
    WHERE ode_arrondissement IS NOT NULL
    GROUP BY 1, 2
),

logements AS (
    SELECT arrondissement AS arr, annee, SUM(nb_logements) AS nb_logements
    FROM {{ ref('core_logements_sociaux') }}
    GROUP BY 1, 2
)

SELECT
    COALESCE(s.arr, a.arr, l.arr) AS arrondissement,
    COALESCE(s.annee, a.annee, l.annee) AS annee,
    COALESCE(s.montant_subv, 0) AS montant_subventions,
    COALESCE(s.nb_subv, 0) AS nb_subventions,
    COALESCE(a.montant_ap, 0) AS montant_investissements,
    COALESCE(a.nb_projets, 0) AS nb_projets,
    COALESCE(l.nb_logements, 0) AS nb_logements_sociaux

FROM subv s
FULL OUTER JOIN ap a ON s.arr = a.arr AND s.annee = a.annee
FULL OUTER JOIN logements l ON COALESCE(s.arr, a.arr) = l.arr AND COALESCE(s.annee, a.annee) = l.annee
```

**mart_evolution_budget.sql**
```sql
-- Agrégations temporelles pour graphiques d'évolution
-- Vues: par_sens (Recette/Dépense), par_thematique (Personnel, Subventions, etc.)

WITH budget_base AS (
    SELECT
        annee,
        sens_flux,
        chapitre_code,
        montant,
        -- Mapping chapitre → thématique macro
        CASE
            WHEN chapitre_code IN ('011', '012', '014') THEN 'Personnel'
            WHEN chapitre_code IN ('65', '657') THEN 'Subventions'
            WHEN chapitre_code IN ('66', '67') THEN 'Charges financières'
            WHEN chapitre_code IN ('20', '21', '23') THEN 'Investissement'
            WHEN chapitre_code LIKE '9%' THEN 'Opérations patrimoniales'
            WHEN chapitre_code IN ('73', '74', '75') THEN 'Fiscalité & Dotations'
            ELSE 'Autres'
        END AS thematique_macro
    FROM {{ ref('core_budget') }}
),

-- Vue avec variations YoY
par_annee_sens AS (
    SELECT
        annee,
        sens_flux,
        SUM(montant) AS montant_total,
        LAG(SUM(montant)) OVER (PARTITION BY sens_flux ORDER BY annee) AS montant_prec,
        SAFE_DIVIDE(SUM(montant) - LAG(SUM(montant)) OVER (...), LAG(...)) * 100 AS variation_pct
    FROM budget_base
    GROUP BY 1, 2
)
-- ... (voir modèle complet)
```

**mart_concentration.sql**
```sql
-- Analyse Pareto de la concentration des dépenses
-- Calcule: rang, % cumulé, segment (top_80/top_95/reste)

-- Subventions: par bénéficiaire
WITH subventions_ranked AS (
    SELECT
        beneficiaire_normalise AS entite,
        SUM(montant) AS montant_total,
        ROW_NUMBER() OVER (ORDER BY SUM(montant) DESC) AS rang,
        SUM(SUM(montant)) OVER (ORDER BY SUM(montant) DESC) AS cumul_montant
    FROM {{ ref('core_subventions') }}
    GROUP BY 1
)

SELECT
    rang,
    entite,
    montant_total,
    ROUND(cumul_montant / total_global * 100, 2) AS pct_cumule,
    CASE 
        WHEN cumul_montant / total_global <= 0.80 THEN 'top_80'
        WHEN cumul_montant / total_global <= 0.95 THEN 'top_95'
        ELSE 'reste'
    END AS segment_pareto
FROM subventions_ranked
-- ... (voir modèle complet avec investissements)
```

---

## 4. Conventions de nommage

### 4.1 Préfixe des colonnes

| Préfixe | Signification | Exemple |
|---------|---------------|---------|
| *(aucun)* | Donnée originale OpenData | `beneficiaire`, `montant`, `annee` |
| `ode_` | **O**pen **D**ata **E**nrichment | `ode_thematique`, `ode_latitude` |

### 4.2 Nommage des tables

| Couche | Pattern | Exemple |
|--------|---------|---------|
| Raw | `{dataset_id_snake_case}` | `ca_budget_principal` |
| Staging | `stg_{entite}` | `stg_budget_principal` |
| Intermediate | `int_{entite}_{action}` | `int_subventions_enrichies` |
| Core | `core_{entite}` | `core_subventions` |
| Mart | `mart_{usage}` | `mart_sankey` |

### 4.3 Nommage des seeds

| Type | Pattern | Exemple |
|------|---------|---------|
| Mapping statique | `seed_mapping_{objet}` | `seed_mapping_thematiques` |
| Cache enrichissement | `seed_cache_{source}_{objet}` | `seed_cache_geo_siret` |
| Lieux connus | `seed_lieux_connus` | |

---

## 5. Stratégie de jointure

### 5.1 Tableau des jointures possibles

| Source A | Source B | Clé de jointure | Qualité | Usage |
|----------|----------|-----------------|---------|-------|
| Budget Principal | AP Projets | `nature_code + fonction_code + annee` | Exacte | Lier budget → projets |
| Subventions (annexe) | Associations | `beneficiaire_normalise + annee` | Exacte | Récupérer SIRET, direction |
| Subventions | Budget | Pas de clé directe | Via thématique | Classification seulement |
| AP Projets | Budget | `nature_code + fonction_code` | Exacte | Lier projets → lignes budget |

### 5.2 Limitation majeure : Subventions ↔ Budget

La table `ca_subventions` (annexe CA) **ne contient PAS** de codes budgétaires (chapitre, nature, fonction).

**Conséquence** : On ne peut pas savoir exactement quelle ligne budgétaire correspond à quelle subvention.

**Solution** : Classification par thématique (pattern matching / direction / LLM) qui permet une association APPROXIMATIVE avec les chapitres budgétaires.

---

## 6. Enrichissement

### 6.1 Principes

| Principe | Description |
|----------|-------------|
| **Incrémental** | Ne traite que les records pas encore dans le cache |
| **Seeds = Cache** | Résultats stockés dans CSV versionnés Git |
| **LLM hors dbt** | Scripts Python séparés, jamais pendant `dbt run` |
| **Cascade** | Regex → Mapping → API → LLM → Default |

### 6.2 Types d'enrichissement

| Enrichissement | Source | Cible | Méthode | Priorité |
|----------------|--------|-------|---------|----------|
| Thématique | ca_subventions | subventions | Pattern → Direction → LLM | **Haute** |
| Géoloc AP | ca_ap_projets | projets AP | Regex → Lieux connus → LLM | **Haute** |
| Type équipement | ca_ap_projets | projets AP | Regex sur texte | Moyenne |
| ~~Géoloc SIRET~~ | ~~associations~~ | ~~subventions~~ | ~~API Entreprises~~ | **Abandonnée** |
| ~~SIRET par nom~~ | ~~ca_subventions~~ | ~~subventions~~ | ~~API Annuaire~~ | **Abandonnée** |

> **Décision architecturale** : La géolocalisation des subventions est abandonnée.
> Les subventions vont à des ORGANISATIONS (associations, entreprises), pas à des LIEUX.
> L'adresse du siège ne reflète pas où l'action est menée.
> → Focus sur la classification thématique pour permettre des filtres et drill-down.

### 6.3 Cascade thématique (subventions)

```
1. Pattern matching sur beneficiaire_normalise (seed_mapping_beneficiaires)
   └─► 72 patterns regex = 73.94% des montants

2. LLM (seed_cache_thematique_beneficiaires)
   └─► 1,244 bénéficiaires classifiés = 20.90% des montants

3. Direction (jointure associations → seed_mapping_directions)
   └─► 25 directions mappées = 4.45% des montants

4. Default ("Non classifié")
   └─► Fallback = 0.49% des montants (petites subventions)

TOTAL: 99.51% des montants classifiés (données disponibles)
```

> **Note**: L'ordre de priorité dans le code est 
Pattern → Direction → LLM → Default,
> mais le LLM couvre plus de montant que les directions car il cible les gros bénéficiaires.

### 6.4 Cascade géoloc (AP projets)

```
1. Regex sur ap_texte
   └─► Patterns: 75001-75020, (12E), 15EME, etc.
   └─► Couverture: ~30% des montants

2. Lieux connus (seed_lieux_connus)
   └─► ~50-100 équipements parisiens célèbres
   └─► Couverture: ~5% des montants

3. LLM (seed_cache_geo_ap)
   └─► Inference depuis le texte du projet
   └─► Couverture: ~8% des montants (confiance ≥0.7)

4. Non localisable
   └─► ode_arrondissement = NULL, ode_source_geo = NULL
   └─► ~57% des montants (projets multi-arrondissements, etc.)

TOTAL: 43.08% des montants géolocalisés par arrondissement
```

### 6.5 Fusion Investissements (PDF + BigQuery)

**Contexte** : Les données d'investissement existent dans deux sources complémentaires :

| Source | Fichier | Contenu | Points forts | Points faibles |
|--------|---------|---------|--------------|----------------|
| **PDF "Investissements Localisés"** | `investissements_localises_{year}.json` | Projets localisables par arrondissement | Descriptions détaillées avec adresses (~31% ont une adresse extraite) | Manque gros projets "citywide" (Philharmonie, etc.) |
| **BigQuery OpenData** | `investissements_{year}.json` | Tous les projets AP | Couverture complète | Noms génériques/tronqués (~9% adresses), doublons |

**Stratégie de fusion** : Utiliser le PDF comme base, compléter avec BigQuery pour les gros projets manquants.

#### Règle d'ajout depuis BigQuery

Un projet BigQuery est ajouté au dataset fusionné si et seulement si :

```python
# 1. Montant significatif (>500k€)
montant >= 500_000

# 2. Localisable (arrondissement connu OU lieu iconique)
AND (
    arrondissement IS NOT NULL
    OR est_lieu_iconique(nom)  # Philharmonie, Théâtre de la Ville, etc.
)

# 3. Pas une subvention générique non localisable
AND NOT is_subvention_logement_generique(nom)

# 4. Pas déjà présent dans le PDF
AND NOT already_in_pdf(nom)
```

#### Lieux iconiques (toujours inclus)

```python
LIEUX_ICONIQUES = [
    'philharmonie', 'theatre de la ville', 'opera bastille', 'opera garnier',
    'tour eiffel', 'notre-dame', 'hotel de ville', 'palais de tokyo',
    'petit palais', 'grand palais'
]
```

#### Patterns exclus (subventions génériques)

```python
EXCLUSION_PATTERNS = [
    r'sub.*logement\s*soci',      # SUB EQUIPEMENT LOGEMENT SOCIAL
    r'subvention.*logement',       # Subventions logement citywide
]
```

#### Résultats pour 2022

| Source | Projets | Montant |
|--------|---------|---------|
| PDF Investissements Localisés | 446 | 143.58 M€ |
| **Ajoutés depuis BigQuery** | **13** | **41.28 M€** |
| **TOTAL fusionné** | **459** | **184.86 M€** |

**Projets ajoutés depuis BigQuery (2022)** :

| Projet | Montant | Arrondissement | Raison |
|--------|---------|----------------|--------|
| PHILHARMONIE DE PARIS | 11.00 M€ | 19 | Lieu iconique |
| THÉÂTRE DE LA VILLE | 9.66 M€ | 4 | Lieu iconique |
| GPRU BAUDRICOURT 13e | 5.30 M€ | 13 | Avec arrondissement |
| GPRU ST BLAISE | 4.79 M€ | 20 | Avec arrondissement |
| ... (9 autres) | ... | ... | ... |

#### Scripts

```bash
# Fusion PDF + BigQuery pour toutes les années
python pipeline/scripts/export/merge_investments.py --all

# Géocodage des projets fusionnés
python pipeline/scripts/export/geocode_investments.py --all
```

#### Fichiers de sortie

```
website/public/data/map/
├── investissements_complet_2022.json    # Données fusionnées
├── investissements_complet_2023.json
├── investissements_complet_2024.json
├── investissements_complet_index.json   # Index avec stats
└── geo_cache.json                        # Cache API géocodage
```

#### Structure JSON fusionné

```json
{
  "year": 2022,
  "source": "Fusion PDF + BigQuery",
  "methodology": "PDF Investissements Localisés + Gros projets BQ (>500k€, localisables)",
  "stats": {
    "pdf_projets": 446,
    "pdf_total": 143580000,
    "bq_added": 13,
    "bq_added_total": 41280000,
    "total_projets": 459,
    "total_montant": 184860000,
    "geo_rate": 72.5,
    "precise_geo_rate": 35.2
  },
  "data": [
    {
      "nom_projet": "Piscine 19, rue de Pontoise",
      "montant": 850000,
      "arrondissement": 5,
      "source": "PDF",
      "lat": 48.8498,
      "lon": 2.3517,
      "geo_source": "lieu_connu",
      "geo_score": 1.0
    }
  ]
}
```

---

## 7. Scripts Python

### 7.1 Inventaire

| Script | Fonction | Optimisations | Status |
|--------|----------|---------------|--------|
| `sync_opendata.py` | Sync OpenData → BigQuery | Skip si déjà à jour | ✅ Actif |
| `enrich_thematique_llm.py` | Nom bénéficiaire → Thématique | LLM batch 10/req, top 500, Gemini 2.5 | ✅ **Actif** |
| `enrich_geo_ap_llm.py` | Texte AP → Géoloc | LLM batch 10/req, top 500, Gemini 2.5 | ✅ **Actif** |
| `export_sankey_data.py` | Export JSON Sankey | Query core_budget | ✅ Actif |
| `export_subventions_data.py` | Export JSON treemap + bénéficiaires | Query core_subventions | ✅ Actif |
| `export_map_data.py` | Export JSON carte AP + logements | Query core_ap_projets, core_logements | ✅ Actif |
| `run_pipeline.py` | Orchestration complète | | ✅ Actif |

> **Note** : Les scripts de géolocalisation SIRET ont été abandonnés car les subventions vont 
> à des organisations, pas des lieux (cf. section 1.1).

### 7.2 Logique sync_opendata.py

```python
def should_sync(table_name: str, dataset_id: str) -> bool:
    """
    Retourne False si table déjà à jour.
    Vérifie:
    1. Table existe dans BigQuery?
    2. Date modif OpenData <= Date modif BigQuery?
    """
    try:
        table = bq_client.get_table(f"{PROJECT}.raw.{table_name}")
        opendata_modified = get_opendata_metadata(dataset_id)['modified']
        if opendata_modified <= table.modified:
            return False  # SKIP
    except NotFound:
        pass  # Table n'existe pas, sync nécessaire
    return True
```

### 7.3 Logique enrichissement incrémental

```python
def enrich_incremental(records_to_enrich, existing_cache):
    # 1. Filtrer les records déjà enrichis
    new_records = [r for r in records_to_enrich if r['key'] not in existing_cache]
    
    # 2. Enrichir seulement les nouveaux
    results = process_batch(new_records)
    
    # 3. Append au cache CSV
    combined = existing_cache + results
    save_to_csv(combined)
```

### 7.4 Optimisations appliquées

| Optimisation | Gain | Implémentation |
|--------------|------|----------------|
| Asyncio | 10x | `aiohttp` + `asyncio.Semaphore(10)` |
| LLM Batching | 20x | 20 records par requête Gemini |
| Pareto | 10x | Top 500 par montant seulement |
| Cache adresses | 1.3x | Dict en mémoire des adresses déjà géocodées |

---

## 8. Export et Frontend

### 8.1 Structure JSON

```
frontend/public/data/
├── budget_index.json              # Années disponibles + métadonnées
├── budget_sankey_2019.json        # Données Sankey
├── budget_sankey_2020.json
├── ...
├── budget_sankey_2024.json
├── data_availability.json         # Avertissements par année
│
├── subventions/                   # NOUVEAU : données treemap + table
│   ├── index.json                 # Métadonnées, années dispo
│   ├── treemap_2019.json          # Agrégé par thématique
│   ├── treemap_2020.json
│   ├── ...
│   ├── beneficiaires_2019.json    # Liste complète filtrable
│   ├── beneficiaires_2020.json
│   └── ...
│
└── map/                           # Carte : AP + Logements seulement
    ├── investissements_index.json
    ├── investissements_2019.json  # AP géolocalisés
    ├── ...
    ├── logements_sociaux.json     # Déjà géolocalisés source
    ├── arrondissements_stats.json # Stats agrégées par arr
    └── arrondissements.geojson    # Contours Paris
```

> **Changement clé** : Subventions déplacées de `map/` vers `subventions/` car pas de géolocalisation.

### 8.2 Format budget_sankey_{year}.json

```json
{
  "annee": 2023,
  "donnees_disponibles": {
    "budget": true,
    "subventions": true,
    "ap_projets": true
  },
  "nodes": [
    {"id": "Fonctionnement", "level": 1},
    {"id": "Social", "level": 2},
    {"id": "934 - Action sociale", "level": 3}
  ],
  "links": [
    {"source": "Fonctionnement", "target": "Social", "value": 2100000000},
    {"source": "Social", "target": "934 - Action sociale", "value": 1500000000}
  ],
  "drill_down": {
    "Social": {
      "top_beneficiaires": [
        {"nom": "CASVP", "montant": 1580000000, "rang": 1},
        {"nom": "CROIX ROUGE", "montant": 25000000, "rang": 2}
      ]
    }
  }
}
```

### 8.3 Format subventions/treemap_{year}.json

```json
{
  "annee": 2023,
  "total_montant": 2130600000,
  "nb_beneficiaires": 7218,
  "thematiques": [
    {
      "id": "Social",
      "montant": 890000000,
      "pct": 41.8,
      "nb_beneficiaires": 2145,
      "top_beneficiaires": [
        {"nom": "CASVP", "montant": 580000000, "nature": "Établissement public"},
        {"nom": "SAMU SOCIAL", "montant": 45000000, "nature": "Association"}
      ]
    },
    {
      "id": "Culture & Sport",
      "montant": 620000000,
      "pct": 29.1,
      "nb_beneficiaires": 1823,
      "top_beneficiaires": [...]
    }
  ],
  "filtres_disponibles": {
    "nature_juridique": ["Associations", "Entreprises", "Fondations", "Établissements publics"],
    "directions": ["DAC", "DASES", "DJS", "DEVE", ...],
    "secteurs_activite": ["Sport", "Culture", "Santé", "Environnement", ...]
  }
}
```

### 8.4 Format subventions/beneficiaires_{year}.json

```json
{
  "annee": 2023,
  "records": [
    {
      "beneficiaire": "THEATRE DE LA VILLE",
      "montant": 6600000,
      "nature_juridique": "Association",
      "direction": "DAC",
      "secteurs_activite": "Spectacle vivant",
      "objet": "Fonctionnement 2023",
      "ode_thematique": "Culture & Sport",
      "ode_source_thematique": "pattern"
    }
  ]
}
```

> **Note** : Plus de coordonnées GPS (`ode_latitude/longitude`) - les subventions ne sont pas géolocalisées.

---

## 9. Catalogue Qualité des Données

### 9.1 Vue d'ensemble par table

| Table | Lignes | Années | Qualité | Status |
|-------|--------|--------|---------|--------|
| `core_budget` | 24,526 | 2019-2024 | ⭐⭐⭐ | ✅ Production |
| `core_subventions` | 42,931 | 2018-2024 | ⭐⭐ | ⚠️ 2020-2021 dégradés |
| `core_ap_projets` | 7,155 | 2018-2022 | ⭐⭐ | ⚠️ Manque 2023-2024 |
| `core_logements_sociaux` | 4,174 | 2001-2024 | ⭐⭐⭐ | ✅ Production |

> **Audit validé** : Totaux core vs staging identiques (0.00% différence), unicité des clés vérifiée.
> Voir [Audit complet 2026-02-05](#912-résultats-audit-complet).

### 9.2 Problèmes connus par année

| Année | `budget` | `subventions` | `ap_projets` | `logements` |
|-------|----------|---------------|--------------|-------------|
| 2018 | ❌ absent | ✅ 12k lignes | ✅ 2.4k | ✅ 181 |
| 2019 | ✅ 5.4k | ✅ 13.8k | ✅ 2.0k | ✅ 150 |
| 2020 | ✅ 5.1k | ⚠️ **100% benef NULL** | ✅ 1.3k | ✅ 123 |
| 2021 | ✅ 5.2k | ⚠️ **100% benef NULL** | ✅ 889 | ✅ 144 |
| 2022 | ✅ 5.7k | ✅ 7.2k | ✅ 485 | ✅ 129 |
| 2023 | ✅ 5.5k | ✅ 7.2k | ❌ **absent** | ✅ 144 |
| 2024 | ✅ 5.7k | ✅ 8.3k | ❌ **absent** | ✅ 101 |

> **Années dégradées**: 2020-2021 subventions n'ont pas de noms de bénéficiaires (problème source OpenData).
> **Gap AP**: 2023-2024 pas encore publiés sur OpenData au format structuré.

### 9.3 Détail qualité `core_budget`

| Vérification | Résultat | Impact |
|--------------|----------|--------|
| Colonnes clés (sens, chapitre, nature) | ✅ 0 NULL | Aucun |
| Montants négatifs | ✅ 0 | Aucun |
| Cohérence recettes/dépenses | ✅ Déficit normal ~3B/an | Attendu (Paris = collectivité déficitaire) |
| Double-comptage "Pour Ordre" | ✅ Exclu en staging | Filtré `type_operation = 'Réel'` |

### 9.4 Détail qualité `core_subventions`

| Vérification | Résultat | Impact |
|--------------|----------|--------|
| Bénéficiaires NULL | ❌ **4,092** (2020-2021) | Pas de drill-down ces années |
| Montants négatifs | ✅ 0 | Aucun |
| Jointure avec associations | ⚠️ 46.6% match | 53% sans direction |
| Montant vs budget total | ✅ 15-20% du budget | Cohérent avec attentes |

**Classification thématique (toutes années, données disponibles seulement):**

| Source | % Montant | Qualité | Risque hallucination |
|--------|-----------|---------|---------------------|
| Pattern matching | **73.94%** | ⭐⭐⭐ | Nul (regex déterministe) |
| LLM Gemini | 20.90% | ⭐⭐ | Faible (vérification échantillon OK) |
| Mapping direction | 4.45% | ⭐⭐⭐ | Nul (table de référence) |
| Default | **0.49%** | ⚠️ | N/A (petites subventions non classifiées) |

> **99.51% des montants sont classifiés** (données disponibles).
> Les 0.49% non classifiés sont des petites subventions où aucune méthode ne match.

**Note**: Les 4,092 lignes de 2020-2021 avec bénéficiaires NULL (source OpenData) sont exclues du calcul de couverture.

### 9.5 Détail qualité `core_ap_projets`

| Vérification | Résultat | Impact |
|--------------|----------|--------|
| Texte AP NULL | ✅ 0 | Aucun |
| Montants négatifs | ✅ 0 | Aucun |
| Codes AP dupliqués | ⚠️ 5 codes avec >30 lignes | Normal: même AP = plusieurs lignes budgétaires |
| Arrondissements hors 1-20 | ✅ 0 | Validation OK |

**Géolocalisation (toutes années):**

| Source | Records | % Montant | Confiance | Risque hallucination |
|--------|---------|-----------|-----------|---------------------|
| Regex (code postal, "15E") | 1,871 | 16.6% | 1.0 | Nul (déterministe) |
| LLM (haute confiance ≥0.9) | 970 | 18.4% | 0.96 moy | Faible |
| LLM (moyenne confiance 0.7-0.9) | 50 | 2.9% | 0.8 moy | ⚠️ Moyen |
| Non localisé | 4,202 | 56.9% | - | N/A |
| Lieu connu (manuel) | 62 | 5.2% | 0.95 | Nul |

**Échantillon LLM vérifié manuellement:**
- RATP → Transport ✅
- Préfecture Police → Sécurité ✅
- École Physique Chimie → Éducation ✅
- ANAH → Logement ✅
- Tramway T3 → Arr 17 ✅ (confiance 0.7 - acceptable)

### 9.6 Détail qualité `core_logements_sociaux`

| Vérification | Résultat | Impact |
|--------------|----------|--------|
| Coordonnées présentes | ✅ 100% | Carte complète |
| Coordonnées dans Paris | ✅ 100% (48.8-48.95 lat) | Validation OK |
| Nombre logements négatif | ⚠️ 1 record | Négligeable |
| Arrondissements 1-20 | ✅ 100% | Validation OK |

### 9.7 Matrice risque/qualité

```
                    FIABILITÉ HAUTE                    FIABILITÉ BASSE
              ┌──────────────────────────────┬──────────────────────────────┐
              │                              │                              │
   MONTANT    │  ✅ Budget complet           │  ⚠️ AP non localisés        │
    ÉLEVÉ     │  ✅ Subventions (98.8%)      │     (57% montant)           │
              │  ✅ Logements sociaux        │                              │
              │                              │                              │
              ├──────────────────────────────┼──────────────────────────────┤
              │                              │                              │
   MONTANT    │  ✅ Subventions direction    │  ⚠️ Subventions default     │
    FAIBLE    │  ✅ AP regex/LLM conf>0.9    │     (25k records, 1.2%)     │
              │                              │  ❌ Subventions 2020-2021   │
              │                              │                              │
              └──────────────────────────────┴──────────────────────────────┘
```

### 9.8 Pistes d'amélioration (par priorité)

| # | Amélioration | Effort | Impact | Qualité | Risque |
|---|--------------|--------|--------|---------|--------|
| 1 | Ajouter patterns bénéficiaires (OPAC, CAF, etc.) | ⭐ | +5-10% | ⭐⭐⭐ | Nul |
| 2 | Sync données AP 2023-2024 (si publiées) | ⭐ | +2 années | ⭐⭐⭐ | Nul |
| 3 | Fuzzy matching subventions↔associations | ⭐⭐ | +20% direction | ⭐⭐⭐ | Nul |
| 4 | Extraire adresses AP depuis PDFs (regex) | ⭐⭐ | +10% géoloc | ⭐⭐⭐ | Nul |
| 5 | LLM sur non-classifiés restants | ⭐⭐⭐ | +40% thématique | ⭐⭐ | Moyen |
| 6 | Géocodage LLM basse confiance | ⭐⭐⭐ | +5% géoloc | ⭐ | Élevé |

> **Principe**: Privilégier les méthodes déterministes (regex, tables de référence) sur le LLM.
> Le LLM ne doit être utilisé que pour les cas où les méthodes classiques échouent.

### 9.9 Règles anti-double comptage

| Règle | Implémentation | Vérifié |
|-------|----------------|---------|
| Exclure "Pour Ordre" | `WHERE type_operation = 'Réel'` en staging | ✅ |
| AP ⊂ Budget investissement | Documentation, pas d'addition | ✅ |
| Subventions ⊂ Budget | Documentation, pas d'addition | ✅ |
| Subventions = somme correcte | 15-20% du budget total | ✅ |
| Marchés = enveloppes | Non sommable, contexte uniquement | ✅ |

### 9.10 Contrat Qualité Frontend (Data Quality Contract)

**Principe** : Le frontend DOIT afficher des avertissements quand les données sont incomplètes ou de mauvaise qualité.

#### Warnings obligatoires à afficher

| Condition | Message à afficher | Composant |
|-----------|-------------------|-----------|
| `annee IN (2020, 2021)` pour subventions | "⚠️ Données 2020-2021 incomplètes : détail bénéficiaires indisponible" | Treemap, Table bénéficiaires |
| `annee >= 2023` pour carte AP | "⚠️ Projets d'investissement non disponibles pour cette année" | Carte |
| `ode_source_thematique = 'default'` | "(non classifié)" en italique | Label bénéficiaire |
| `ode_confiance < 0.8` pour géoloc AP | "📍 Localisation approximative" | Tooltip carte |
| `pct_non_classifie > 30%` | "⚠️ 30% des montants non classifiés" | En-tête section |

#### Structure JSON data_availability.json

```json
{
  "budget": {
    "annees_disponibles": [2019, 2020, 2021, 2022, 2023, 2024],
    "warnings": {}
  },
  "subventions": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022, 2023, 2024],
    "warnings": {
      "2020": { "severity": "error", "message": "Données bénéficiaires absentes" },
      "2021": { "severity": "error", "message": "Données bénéficiaires absentes" }
    }
  },
  "ap_projets": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022],
    "warnings": {
      "2023": { "severity": "warning", "message": "Données non encore publiées" },
      "2024": { "severity": "warning", "message": "Données non encore publiées" }
    }
  },
  "logements_sociaux": {
    "annees_disponibles": [2001, 2002, ..., 2024],
    "warnings": {}
  }
}
```

#### Implémentation frontend recommandée

```tsx
// components/DataQualityBanner.tsx
interface DataQualityBannerProps {
  dataset: 'budget' | 'subventions' | 'ap_projets' | 'logements';
  annee: number;
}

export function DataQualityBanner({ dataset, annee }: DataQualityBannerProps) {
  const warning = DATA_AVAILABILITY[dataset]?.warnings?.[annee];
  
  if (!warning) return null;
  
  return (
    <div className={cn(
      "rounded-lg p-3 mb-4",
      warning.severity === 'error' 
        ? "bg-red-900/30 border border-red-700/50" 
        : "bg-yellow-900/30 border border-yellow-700/50"
    )}>
      <p className="text-sm">
        {warning.severity === 'error' ? '❌' : '⚠️'} {warning.message}
      </p>
    </div>
  );
}
```

#### Règles de confiance pour le LLM

| Confiance | Affichage | Action |
|-----------|-----------|--------|
| ≥ 0.95 | Normal | Aucune |
| 0.85-0.94 | Indication discrète | Tooltip "Classification automatique" |
| 0.70-0.84 | Warning visuel | Icône ⚠️ + tooltip |
| < 0.70 | Exclusion | Ne pas afficher sur la carte |

### 9.12 Résultats audit complet (2026-02-05)

**Validation end-to-end du pipeline de données**

| Check | Status | Détails |
|-------|--------|---------|
| Budget: Total core vs staging | ✅ PASS | 126.16B vs 126.16B (0.00%) |
| Subventions: Total core vs staging | ✅ PASS | 8.78B vs 8.78B (0.00%) |
| Budget: Lignes core vs staging | ✅ PASS | 24,526 vs 24,526 (0.00%) |
| Subventions: Lignes core vs staging | ✅ PASS | 42,931 vs 42,931 (0.00%) |
| Subventions: Classifiées (données dispo) | ✅ PASS | 99.51% |
| AP: Géolocalisés (par montant) | ✅ PASS | 43.08% |
| Budget: Variations YoY < 20% | ✅ PASS | Max: 7.8% |
| Budget: Unicité clés (< 0.5%) | ✅ PASS | 0.106% doublons |
| Subventions: Unicité clés (= 0%) | ✅ PASS | 0.000% doublons |
| AP: Unicité clés (= 0%) | ✅ PASS | 0.000% doublons |
| Paris Centre: Agrégation 1-4 | ✅ PASS | 1 valeur distincte |
| CASVP: Dédupliqué | ✅ PASS | 1 entité canonique (1,940 M€) |

**Score: 12/12 checks passed**

> **Conclusion** : Les données sont prêtes pour le frontend. Aucune multiplication de lignes,
> totaux identiques entre couches, clés uniques vérifiées. Les quelques doublons résiduels
> dans `core_budget` (0.1%) proviennent de la source raw et ont un impact financier négligeable.

---

## 10. Estimation des coûts et temps

### 10.1 Enrichissement actuel (réalisé)

| Étape | Volume | Méthode | Coût | Temps |
|-------|--------|---------|------|-------|
| Thématique LLM subventions | 1,244 bénéficiaires | Gemini 2.5 Flash | ~$0.15 | ~15 min |
| Géoloc LLM projets AP | 483 projets | Gemini 2.5 Flash | ~$0.05 | ~5 min |
| **TOTAL réalisé** | | | **~$0.20** | **~20 min** |

> Note: SIRET lookup et géoloc SIRET abandonnés (pas de sens métier pour subventions)

### 10.2 Maintenance annuelle (estimée)

| Étape | Nouveaux records | Coût | Temps |
|-------|-----------------|------|-------|
| Sync OpenData | ~8k lignes | $0 | ~2 min |
| dbt seed + run | - | $0 | ~1 min |
| LLM nouveaux bénéficiaires | ~100 | ~$0.01 | ~1 min |
| LLM nouveaux AP | ~200 | ~$0.02 | ~2 min |
| Export JSON | - | $0 | ~1 min |
| **TOTAL annuel** | | **~$0.03** | **~7 min** |

---

## 11. Structure des fichiers

```
paris-budget-dashboard/
├── README.md                           # Quick start
├── docs/
│   └── ARCHITECTURE.md                 # Ce document
│
├── paris-public-open-data/             # Projet dbt
│   ├── dbt_project.yml
│   ├── profiles.yml
│   │
│   ├── models/
│   │   ├── staging/
│   │   │   ├── sources.yml             # Déclaration sources raw
│   │   │   ├── schema.yml              # Tests et docs
│   │   │   ├── stg_budget_principal.sql
│   │   │   ├── stg_ap_projets.sql
│   │   │   ├── stg_subventions_all.sql
│   │   │   ├── stg_associations.sql
│   │   │   ├── stg_logements_sociaux.sql
│   │   │   └── stg_marches_publics.sql
│   │   │
│   │   ├── intermediate/
│   │   │   ├── schema.yml
│   │   │   ├── int_subventions_enrichies.sql
│   │   │   └── int_ap_projets_enrichis.sql
│   │   │
│   │   ├── core/
│   │   │   ├── schema.yml
│   │   │   ├── core_budget.sql
│   │   │   ├── core_subventions.sql
│   │   │   ├── core_ap_projets.sql
│   │   │   └── core_logements_sociaux.sql
│   │   │
│   │   └── marts/
│   │       ├── schema.yml
│   │       ├── mart_sankey.sql
│   │       ├── mart_subventions_treemap.sql
│   │       ├── mart_subventions_beneficiaires.sql
│   │       ├── mart_carte_investissements.sql
│   │       ├── mart_stats_arrondissements.sql
│   │       ├── mart_evolution_budget.sql
│   │       └── mart_concentration.sql
│   │
│   └── seeds/
│       ├── seed_mapping_thematiques.csv      # Chapitre → thématique
│       ├── seed_mapping_directions.csv       # Direction → thématique
│       ├── seed_mapping_beneficiaires.csv    # 72 patterns regex
│       ├── seed_mapping_entites.csv          # Déduplication entités (CASVP, etc.)
│       ├── seed_lieux_connus.csv             # Équipements parisiens
│       ├── seed_cache_geo_ap.csv             # Cache LLM géoloc AP
│       ├── seed_cache_thematique_beneficiaires.csv  # Cache LLM (1,244 records)
│       └── seed_cache_siret_by_name.csv      # Cache SIRET (legacy)
│
├── scripts/
│   ├── sync_opendata.py                # Sync OpenData → BigQuery
│   ├── enrich_thematique_llm.py        # ✅ Classification thématique
│   ├── enrich_geo_ap_llm.py            # ✅ Géoloc AP projets
│   ├── export_sankey_data.py           # Export budget Sankey
│   ├── export_subventions_data.py      # Export treemap + bénéficiaires
│   ├── export_map_data.py              # Export carte (AP + logements)
│   └── run_pipeline.py                 # Script orchestration
│
├── frontend/                           # Next.js
│   ├── public/data/                    # JSON exportés
│   └── src/
│
└── requirements.txt
```

---

## 12. Workflow de mise à jour

### 12.1 Mise à jour annuelle (après publication CA)

```bash
# 1. Sync nouvelles données OpenData → BigQuery (skip si déjà à jour)
python scripts/sync_opendata.py

# 2. Enrichissement LLM incrémental (nouveaux records seulement)
#    - Les résultats sont cachés dans seeds/ (Git)
python scripts/enrich_thematique_llm.py       # Classification thématique subventions
python scripts/enrich_geo_ap_llm.py           # Géolocalisation AP projets

# 3. Rebuild dbt (staging → intermediate → core)
cd paris-public-open-data
dbt seed    # Charge les caches CSV
dbt run     # Transforme les données

# 4. Export JSON pour frontend
python scripts/export_sankey_data.py          # Budget Sankey
python scripts/export_subventions_data.py     # Treemap + bénéficiaires
python scripts/export_map_data.py             # Carte (AP + logements)

# 5. Build frontend
cd frontend && npm run build

# 6. Commit
git add .
git commit -m "MAJ données budget 2024"
```

### 12.2 Enrichissement initial (one-shot)

```bash
# 1. Sync complet OpenData → BigQuery
python scripts/sync_opendata.py --all

# 2. Premier build dbt (sans enrichissement LLM)
cd paris-public-open-data
dbt seed
dbt run

# 3. Enrichissement LLM complet (~10 min avec tier payant Gemini)
#    Note: Les scripts lisent depuis BigQuery et écrivent dans seeds/
python scripts/enrich_thematique_llm.py       # ~5 min (top 500 bénéficiaires)
python scripts/enrich_geo_ap_llm.py           # ~5 min (top 500 projets AP)

# 4. Rebuild avec enrichissement
dbt seed
dbt run

# 5. Export JSON
python scripts/export_sankey_data.py
python scripts/export_subventions_data.py
python scripts/export_map_data.py

# 6. Build frontend
cd frontend && npm run build
```

> **Note importante** : Les scripts `enrich_geo_siret.py` et `enrich_siret_lookup.py` ont été
> abandonnés car la géolocalisation des subventions n'a pas de sens métier (voir section 1.1).

---

## Annexes

### A. APIs utilisées

| API | URL | Auth | Rate limit | Coût |
|-----|-----|------|------------|------|
| OpenData Paris | opendata.paris.fr | Non | Illimité | Gratuit |
| API Entreprises | recherche-entreprises.api.gouv.fr | Non | ~10/s | Gratuit |
| API Adresse | api-adresse.data.gouv.fr | Non | ~50/s | Gratuit |
| Gemini | generativelanguage.googleapis.com | API Key | 15/min (free) | ~$0.10/1M tokens |

### B. Variables d'environnement

```bash
# BigQuery
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export BIGQUERY_PROJECT="open-data-france-484717"

# Gemini (optionnel, pour enrichissement LLM)
export GEMINI_API_KEY="your_api_key"
```

### C. Glossaire

| Terme | Définition |
|-------|------------|
| **AP** | Autorisation de Programme - enveloppe pluriannuelle d'investissement |
| **CA** | Compte Administratif - budget exécuté (vs budget voté) |
| **CP** | Crédits de Paiement - montant annuel mandaté |
| **M57** | Nomenclature comptable des collectivités depuis 2019 |
| **OBT** | One Big Table - table dénormalisée finale |
| **SIRET** | Identifiant établissement (14 chiffres) |

---

*Document mis à jour le 2026-02-05. Pipeline complet opérationnel et validé (audit 12/12 OK).*
*Couverture thématique: 99.51%. Géoloc AP: 43.08%. 7 marts, 4 core tables, 1,244 bénéficiaires LLM.*
*Nouvelles fonctionnalités: agrégation Paris Centre, déduplication entités.*
