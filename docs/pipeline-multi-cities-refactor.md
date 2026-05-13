# Pipeline multi-cities — Refactor plan

**Statut : en cours de validation. Document figé après revue utilisateur.**
**Date : 2026-05-07**

Plan de refactor pour passer le pipeline d'un schéma "Paris-only" à un schéma multi-villes générique. Ce refactor est fait UNE seule fois (lors de l'arrivée de Marseille comme 2e ville exhaustive). Les villes 3+ rentrent ensuite avec ~2-3 jours d'effort chacune.

Aligné avec [`project_marseille_v1_decisions`](../memory/project_marseille_v1_decisions.md), notamment décisions P2.1, P2.2, P2.3, P2.4.

## Diagnostic actuel

Le pipeline a aujourd'hui **deux familles parallèles** de modèles :

| Famille | Localisation | Couverture | commune_slug ? |
|---|---|---|---|
| **Paris-only** (riche) | `pipeline/models/{stg,core,mart}/*.sql` | Paris uniquement | ❌ |
| **National** (slim) | `pipeline/models/{stg,core,mart}/*_national.sql` | 35k communes | ✅ |

Conséquence : pour Marseille on ne peut pas réutiliser la richesse Paris-only sans refactor. Le national ne donne que les 3 KPIs OFGL slim.

**Décision validée P2.1** : unifier en une seule famille. Tous les `core_*` Paris-only reçoivent une colonne `commune_slug`. Ils acceptent toutes les villes exhaustives à grain riche. Le `*_national` reste pour la queue 35k communes (slim).

## Plan de refactor — étapes

### Étape A — Restructurer les seeds (1-2 jours)

**Avant** :
```
pipeline/seeds/
  seed_mapping_directions.csv          # Paris-only
  seed_lieux_connus.csv                # Paris-only
  seed_drihl_paris_2024.csv            # Paris-only
  seed_city_constants.csv              # clés "paris_*"
  seed_pdf_investissements_2022.csv    # Paris-only
  seed_communes_cibles.csv             # multi-villes
  seed_mapping_thematiques.csv         # national (M57)
  ...
```

**Après** :
```
pipeline/seeds/
  cities/
    paris/
      seed_mapping_directions.csv
      seed_lieux_connus.csv
      seed_drihl_2024.csv
      seed_pdf_investissements_2022.csv
      seed_pdf_budget_vote_2020.csv     # déplacés
      ...
    marseille/
      seed_mapping_directions.csv      # nouveau
      seed_lieux_connus.csv             # nouveau
      seed_pdf_investissements_2024.csv # nouveau, généré in-session
      ...
  national/
    seed_communes_cibles.csv
    seed_mapping_thematiques.csv
    seed_legal_thresholds.csv
    seed_fiscal_constants.csv
    seed_drees_retraites_branches.csv
    seed_*_prestations.csv (3 fichiers)
    seed_ofgl_communes_fonctionnelle.csv
    ...
  seed_city_constants.csv               # restructuré : (city_slug, key, value)
```

**Fichier `seed_city_constants.csv` après** :
```csv
city_slug,key,value,source,source_url,date_reference
paris,population,2133111,INSEE recensement 2026,https://insee.fr/...,2026-01-01
paris,nb_arrondissements,17,...,...
paris,superficie_km2,105.4,...,...
marseille,population,873076,INSEE recensement 2026,https://insee.fr/...,2026-01-01
marseille,nb_arrondissements,16,...,...
marseille,superficie_km2,240.6,...,...
```

**Action concrète** :
1. `git mv pipeline/seeds/seed_mapping_directions.csv pipeline/seeds/cities/paris/`
2. Idem pour les 5 autres seeds Paris-only
3. Restructurer `seed_city_constants.csv` au nouveau format
4. Update `pipeline/dbt_project.yml` `seed-paths` pour inclure les sous-dossiers
5. Update les `ref('seed_*')` dans les SQL si les noms changent (ils ne changent pas, juste le path)

### Étape B — Ajouter `commune_slug` aux core_* Paris (2-3 jours)

Les modèles `core_*` Paris-only à modifier (10 fichiers d'après l'audit pipeline) :

| Modèle | Action |
|---|---|
| `core_budget` | Ajouter colonne `commune_slug` dans le SELECT, init à `'paris'` (constant en attendant Marseille) |
| `core_budget_vote` | Idem |
| `core_ap_projets` | Idem |
| `core_subventions` | Idem |
| `core_deliberations` | Idem |
| `core_marches_publics` | Idem (en plus, harmoniser avec `core_marches_national`) |
| `core_bilan_comptable` | Idem |
| `core_dette_garantie` | Idem |
| `core_logement_attente_arr` | Remplacer filtres hardcodés `WHERE code_insee BETWEEN 75101 AND 75120` par filtre sur `commune_slug` joint à `seed_communes_cibles` |
| `core_logements_sociaux` | Idem |

**Pattern type pour l'ajout** :
```sql
-- core_budget.sql (avant)
SELECT
  CAST(annee AS INT64) AS annee,
  chapitre,
  nature,
  ...
FROM {{ ref('stg_budget_principal') }}

-- core_budget.sql (après)
SELECT
  'paris' AS commune_slug,  -- en attendant Marseille
  CAST(annee AS INT64) AS annee,
  chapitre,
  nature,
  ...
FROM {{ ref('stg_budget_principal') }}
```

Quand Marseille arrive, on UNION avec `stg_marseille_budget` :
```sql
SELECT 'paris' AS commune_slug, ... FROM {{ ref('stg_paris_budget') }}
UNION ALL
SELECT 'marseille' AS commune_slug, ... FROM {{ ref('stg_marseille_budget') }}
```

**Tests dbt** : ajouter `unique_combination_of_columns: [commune_slug, annee, chapitre, nature, section, sens]` sur chaque core.

### Étape C — Renommer `stg_*` Paris-only en `stg_paris_*` (1 jour)

D'après audit pipeline, ces stg sont Paris-only :
```
stg_budget_principal       → stg_paris_budget
stg_budget_vote            → stg_paris_budget_vote
stg_ap_projets             → stg_paris_ap_projets
stg_subventions_all        → stg_paris_subventions
stg_deliberations_*        → stg_paris_deliberations_*
stg_drihl_paris            → stg_paris_drihl  (déjà préfixé)
stg_logements_sociaux      → stg_paris_logements_sociaux
stg_bilan_comptable        → stg_paris_bilan_comptable
stg_lieux_connus           → stg_paris_lieux_connus
stg_mapping_*              → stg_paris_mapping_*
```

Les stg génériques (national, M57, sirene) gardent leur nom :
```
stg_ofgl_communes        # reste
stg_dgfip_balances       # reste
stg_decp_marches         # reste
stg_sirene_companies     # reste
stg_cache_*              # reste
```

**Action** : rename + update tous les `ref()` qui pointent vers ces stg dans les modèles aval.

### Étape D — Scripts sync : génériques paramétrés par YAML (3-4 jours)

**Décision 2026-05-07** : ne PAS écrire un script dédié par source par ville (explosion combinatoire pour Lyon, Toulouse, Bordeaux). À la place : **scripts génériques + 1 fichier YAML par ville** qui liste les sources.

**Avant** : 3 scripts mono-Paris (`sync_opendata.py`, `fetch_subventions_opendata.py`, `scrape_deliberations.py`).

**Après** :

```
pipeline/scripts/sync/
  sync_paris_opendata.py            # legacy Paris, refactoré stable (lecture API opendata.paris.fr)
  sync_paris_deliberations.py       # legacy Paris (scrape conseil-paris.fr)
  sync_datagouv_dataset.py          # GÉNÉRIQUE — lit n'importe quel dataset data.gouv.fr par slug
  sync_ods_dataset.py               # GÉNÉRIQUE — lit n'importe quel dataset ODS API (data.ampmetropole.fr, data.grandlyon.com, etc.)
  sync_pdf_municipal.py             # GÉNÉRIQUE — télécharge un PDF + extraction texte, stocke dans cache pour parsing in-session

pipeline/configs/cities/
  marseille.yaml                    # config Marseille
  lyon.yaml                          # plus tard
  toulouse.yaml                      # plus tard
```

**Format YAML type** (`pipeline/configs/cities/marseille.yaml`) :
```yaml
city_slug: marseille
siren_collectivite: "211300553"
siret_principal: "21130055300016"
code_insee: "13055"
codes_insee_arrondissements: ["13201", "13202", ..., "13216"]
sources:
  - id: marseille_budget_primitif
    target_table: raw.marseille_budget_primitif
    type: datagouv_dataset
    slug_pattern: "marseille-budget-primitif-{year}"
    years: [2018, 2019, 2020, 2021, 2022, 2023, 2024]

  - id: marseille_compte_administratif
    target_table: raw.marseille_compte_administratif
    type: datagouv_dataset
    slug_pattern: "marseille-compte-administratif-{year}"
    years: [2018, 2019, 2020, 2021, 2022]

  - id: marseille_subventions_ville
    target_table: raw.marseille_subventions_ville
    type: datagouv_dataset
    slug_pattern: "marseille-subventions-{year}"
    years: [2017, 2018, 2019, 2020, 2021, 2022]

  - id: marseille_subventions_metropole
    target_table: raw.marseille_subventions_metropole
    type: ods_dataset
    portal: data.ampmetropole.fr
    dataset_id: subventions-attribuees-depuis-2022

  - id: marseille_marches_ville
    target_table: raw.marseille_marches_ville
    type: datagouv_dataset
    slugs: [marseille-marches-publics-1]

  - id: marseille_deliberations
    target_table: raw.marseille_deliberations
    type: datagouv_dataset
    slug_pattern: "marseille-deliberations-{year}"
    years: [2019, 2021, 2024]

  - id: marseille_pdf_ca
    target_table: raw.marseille_pdf_ca_extracts
    type: pdf_municipal
    pdfs:
      - {year: 2019, url: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapportca2019.pdf"}
      - {year: 2020, url: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapportca20.pdf"}
      - {year: 2023, url: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapport_de_presentation_du_compte_administratif_2023.pdf"}
      - {year: 2024, url: "https://www.marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/rapport-de-presentation-compte-administratif-2024.pdf"}
```

**Orchestrateur** : `pipeline/scripts/sync/sync_city.py marseille` lit le YAML et exécute les sources dans l'ordre.

**Avantages** :
- Lyon = 1 seul fichier YAML, pas 8 scripts
- Le code générique est testé une seule fois, devient robuste
- Schéma déclaratif facile à reviewer
- Le PDF parsing in-session se branche naturellement (étape `pdf_municipal` télécharge + extrait texte → JSONL pending lu par Claude Code → seed structuré)

**Effort** : 3-4 jours pour les 3 scripts génériques + le runner YAML + tests sur Marseille.

### Étape E — Flag `--use-llm` sur tous les enrich_*_llm.py (2 jours)

Cf. mémoire `feedback_enrichment_in_session`.

Scripts concernés :
```
enrich_thematique_llm.py
enrich_geo_ap_llm.py
enrich_beneficiaire_grounded_llm.py
enrich_deliberations_llm.py
fetch_photos_grounded_llm.py
vulgarize_projets_llm.py
vulgarize_marches_llm.py
vulgarize_subventions_llm.py
translate_to_en_llm.py
parse_marseille_ca_pdf.py  # nouveau
```

**Pattern** :
- Default behavior : produit un fichier JSONL `pipeline/cache/enrich_pending/[script_name]_[date].jsonl` avec un objet par item à enrichir. Ne fait AUCUN appel LLM.
- Avec `--use-llm` : appelle l'API (Claude/Gemini selon le script) et produit `pipeline/cache/enrich_done/...`.
- Workflow par défaut : un humain (Claude Code in-session) lit le pending JSONL, ajoute ses sorties dans done JSONL, puis le pipeline le consomme.

**Important** : ne pas casser les scripts existants en prod Paris. Soit on garde le comportement legacy par défaut, soit on documente la migration. Décision par script.

### Étape F — Restructurer `methodology.json` exporté (1 jour)

**Avant** : `website/src/data/methodology.json` racine `{ paris_population: ..., paris_nb_arrondissements: ..., legal_thresholds: ... }`.

**Après** :
```json
{
  "cities": {
    "paris": { "population": ..., "nb_arrondissements": ..., "superficie_km2": ... },
    "marseille": { "population": ..., "nb_arrondissements": 16, ... }
  },
  "national": {
    "legal_thresholds": { ... },
    "fiscal_constants": { ... }
  }
}
```

**Action** :
1. Modifier `pipeline/scripts/export/export_methodology.py` pour produire la nouvelle structure
2. Modifier `website/src/lib/methodology.ts` pour exposer un helper `cityMeta(slug)` qui lit `methodology.cities[slug]`
3. Mettre à jour les ~6 endroits du frontend qui font `import { PARIS_POPULATION }` (cf. mémoire `feedback_no_hardcoded_numbers` — il y avait un incident dupliqué) pour passer par `cityMeta(currentCity).population`

### Étape G — Restructurer les exports JSON par ville (2 jours)

**Avant** : `website/public/data/budget_sankey_2024.json`, `website/public/data/marches_data.json`, etc. Tous Paris.

**Après** : `website/public/data/[city]/budget_sankey_2024.json`, etc.

**Action** :
1. Modifier les ~13 scripts `pipeline/scripts/export/export_*.py` pour écrire dans `website/public/data/{commune_slug}/...`
2. Premier passage : tous les exports Paris écrivent dans `website/public/data/paris/...`
3. Mettre à jour `website/src/lib/fusion-data.ts` pour lire depuis `data/${city}/...`
4. Garder les anciens fichiers à la racine `public/data/` jusqu'à la complétion du refactor front (pour pas casser la prod pendant la transition)

### Étape H — `match_projet_marches.py` : généraliser regex (1 jour)

Script Paris : regex `7500[1-9]|750[12][0-9]` pour les arrondissements parisiens. Généraliser :
- Lire depuis seed `seed_communes_cibles.csv` la liste des codes INSEE par ville cible
- Construire la regex dynamiquement par ville
- Filtre `commune_slug` au lieu de filtre arrondissement Paris

## Ordre d'exécution & dépendances

```
A. Restructurer seeds (cities/, national/)        [INDEPENDANT, fait en 1er]
B. Ajouter commune_slug aux core_*                [DEPEND DE A]
C. Renommer stg_* en stg_paris_*                  [DEPEND DE B (ref())]
D. Refactor scripts sync                          [INDEPENDANT, parallèle]
E. Flag --use-llm                                 [INDEPENDANT, parallèle]
F. methodology.json multi-villes                  [DEPEND DE A]
G. Exports par ville                              [DEPEND DE B, F]
H. match_projet_marches généralisé                [DEPEND DE A]
```

**Plan d'attaque proposé** :
- Semaine 1 : A + D + E en parallèle (pas de touch core)
- Semaine 2 : B + C + F séquentiel (refactor SQL)
- Semaine 3 : G + H + tests de non-régression Paris

**Point critique** : Paris doit rester en prod pendant tout le refactor. À chaque PR, vérifier que les exports Paris restent identiques (diff JSON byte à byte ou structurel). Tests dbt à enrichir au fil des étapes.

## Tests de non-régression Paris

À chaque étape, vérifier :
1. **Pipeline** : `dbt build` passe (ajouts tests `unique_combination_of_columns`, `accepted_values` sur commune_slug)
2. **Exports** : diff entre `data/budget_sankey_2024.json` (avant) et `data/paris/budget_sankey_2024.json` (après) — schéma identique, valeurs identiques
3. **Frontend Paris** : screenshot Playwright pages clés (cf. mémoire `feedback_ui_self_review`) — visuellement identique avant/après refactor
4. **i18n** : pas de clé orpheline introduite pendant restructuration

## Critères d'acceptation phase 2

- [ ] Tous les `core_*` ont une colonne `commune_slug`
- [ ] Tous les seeds sont organisés en `cities/`, `national/`, ou racine
- [ ] Les scripts sync sont préfixés par ville (sauf nationaux)
- [ ] Le flag `--use-llm` existe sur tous les scripts d'enrichissement (default OFF)
- [ ] `methodology.json` est multi-villes
- [ ] Les exports écrivent dans `data/[city]/`
- [ ] Tous les tests de non-régression Paris passent
- [ ] **À valider par utilisateur avant de débloquer phase 3 (refactor front)**
