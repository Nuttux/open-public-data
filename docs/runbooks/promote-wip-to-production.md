# Runbook : promouvoir un script WIP en production

## Contexte

Le dossier `pipeline/cache/wip/` héberge des scripts d'exploration qui produisent des fichiers JSON sans encore être consommés par l'UI. Le gate audit les laisse passer parce qu'ils n'écrivent pas dans `website/public/data/`. Ce runbook décrit les étapes pour passer un de ces scripts en production une fois qu'on veut câbler son output au front.

Voir aussi : [04-layering-convention.md](../data-platform/04-layering-convention.md), [ADR-0001](../decisions/0001-layering-stg-core-mart.md), [ADR-0005](../decisions/0005-internal-cache-pattern.md).

## Quand utiliser ce runbook

- Une page UI doit afficher la donnée produite par un script de `pipeline/scripts/sync/sync_*` ou `pipeline/scripts/tools/*`
- Le script écrit aujourd'hui dans `pipeline/cache/wip/`
- Aucun pipeline dbt n'existe pour ce script

## Pré-requis

- Comprendre la convention `stg → core → (int) → mart → export` ([04-layering-convention.md](../data-platform/04-layering-convention.md))
- Avoir un accès BigQuery au projet `open-data-france-484717`
- Identifier l'**entité métier** qu'on ajoute (marchés, subventions, communes, etc.)

## Étapes

### 1. Décider le scope (10 min)

Trois questions :

- **Est-ce une nouvelle entité ou une dimension d'une existante ?**
  - Nouvelle entité → nouveau `core_<entity>`
  - Dimension d'une existante → JOIN dans le `core_*` existant
- **Combien de marts en aval ?**
  - 1 mart → pas besoin d'`int_*`
  - 2+ marts qui partagent un join → ajouter un `int_*`
- **L'extraction est-elle déterministe ?**
  - Oui (API JSON stable) → sync direct vers raw, pas de cache
  - Non (LLM, scrape, vision PDF) → garde le cache local, charge en raw via sync

### 2. ADR si conventions impactées (15 min)

Si la promotion modifie le **modèle de données canonique** (nouveau type d'entité, nouveau pattern), ouvrir un ADR :

```bash
# Numéro = max actuel + 1
NUM=$(printf '%04d' $(($(ls docs/decisions/0*.md | tail -1 | grep -oE '^docs/decisions/[0-9]+' | grep -oE '[0-9]+') + 1)))
cp docs/decisions/0009-adr-process.md docs/decisions/$NUM-<slug>.md
# Éditer pour la nouvelle décision
```

Sinon, sauter cette étape.

### 3. Source raw + sources.yml (15 min)

Renommer la table dans BigQuery selon la convention `<entity>_<scope>` ([ADR-0008](../decisions/0008-bq-table-naming.md)) :

```bash
# Si la table actuelle s'appelle "raw.x_temp"
bq cp open-data-france-484717:raw.x_temp open-data-france-484717:raw.<entity>_paris
bq rm -f open-data-france-484717:raw.x_temp
```

Ajouter dans [pipeline/models/staging/sources.yml](../../pipeline/models/staging/sources.yml) :

```yaml
- name: <entity>_paris
  description: "..."
  loaded_at_field: loaded_at
  freshness:
    warn_after: {count: 30, period: day}
    error_after: {count: 90, period: day}
  columns:
    - name: <pk>
      tests: [not_null]
```

Modifier le sync script pour écrire `loaded_at = pd.Timestamp.utcnow()` (cf. les sync existants pour pattern).

### 4. Modèle stg (10 min)

`pipeline/models/staging/stg_<entity>.sql` :

```sql
{{ config(materialized='view', schema='staging', tags=['staging','<domain>']) }}

SELECT
    -- type-cast et renommage
    SAFE_CAST(<col> AS <type>) AS <col_renamed>,
    ...
FROM {{ source('paris_raw', '<entity>_paris') }}
```

Entry dans `pipeline/models/staging/schema.yml` :

```yaml
- name: stg_<entity>
  description: "..."
  columns:
    - name: <pk>
      tests:
        - not_null
        - unique
```

### 5. Modèle core (15 min)

`pipeline/models/core/core_<entity>.sql` :

```sql
{{ config(materialized='table', schema='analytics', tags=['core','<domain>']) }}

SELECT * FROM {{ ref('stg_<entity>') }}
-- + joins si dimensions à enrichir
```

Schema entry avec **meta** (cf. F1 du round 2 review) :

```yaml
- name: core_<entity>
  description: "..."
  meta:
    domain: "<domain>"
    criticality: "high"  # ou medium, low
    freshness_slo: "..."
  columns:
    - name: <pk>
      tests: [not_null]
```

### 6. Mart + export (20 min)

Mart : ne fais que la forme finale pour l'UI (agrégation, projection). Cf. [ADR-0003](../decisions/0003-thin-marts-as-views.md) pour le pattern « thin mart » si pas d'agrégation.

Export script `pipeline/scripts/export/export_<entity>.py` :

```python
from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = "dbt_paris_marts"
OUTPUT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "<file>.json"
)

def main():
    c = bigquery.Client(project=PROJECT_ID)
    rows = list(c.query(f"SELECT * FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_<entity>`").result())
    # ... shape into JSON ...
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
```

### 7. Tests

Au minimum :
- `not_null` + `unique` sur la PK du stg et du core
- Cross-layer test (`pipeline/tests/cat7_cross_layer/xlay_<entity>_core_to_mart.sql`) qui vérifie row count préservé

Cf. les tests existants dans `pipeline/tests/cat7_cross_layer/` pour pattern.

### 8. Vérification gate + byte-equality

```bash
# Layering audit
python3 pipeline/scripts/audit/check_layering.py --strict

# Frontend audit (si l'UI fetch ce JSON, vérifier qu'on est sous /data/)
python3 pipeline/scripts/audit/check_frontend_fetches.py --strict

# dbt parse + test
cd pipeline && dbt parse && dbt test --select stg_<entity>+ core_<entity>+ mart_<entity>+

# Verify export produces stable JSON
bash pipeline/scripts/audit/verify_export.sh \
    pipeline/scripts/export/export_<entity>.py \
    website/public/data/<file>.json
```

### 9. Déplacer le cache du WIP vers le légitime

Le script ne doit plus écrire dans `pipeline/cache/wip/`. Soit :
- Si c'est un sync direct vers BQ : supprimer l'écriture cache et garder uniquement l'upload BQ
- Si c'est non-idempotent (LLM/scrape/PDF) : déplacer le cache vers `pipeline/cache/<topic>/` (sans `wip/`)

### 10. PR avec checklist

Le commit message doit inclure :
- `Refs: ADR-NNNN` (si nouvel ADR)
- `Promotes <script_name> from cache/wip/ to production`
- Liste des fichiers ajoutés/modifiés (sources.yml, schema.yml, modèles dbt, export, tests)

La PR doit passer le CI (`data-platform-audit.yml`) avant merge.

## Cas particuliers

### Le script est obsolète / dépassé

S'il n'est pas câblé à l'UI dans les 6 mois et qu'on ne sait plus à quoi il sert :

```bash
# Supprimer
rm pipeline/scripts/sync/sync_<obsolete>.py
rm -rf pipeline/cache/wip/<obsolete>
```

Avec un commit message expliquant pourquoi (audit log).

### Le script est partagé avec une autre ville (futur scope national)

L'entité doit aller dans `pipeline/models/national/` (pour l'instant disabled — voir `dbt_project.yml`). À faire :
1. Réactiver `national: +enabled: true`
2. Suivre les étapes 3-9 mais sous `national/staging/`, `national/core/`, etc.
3. Le sync doit avoir `commune_slug` comme dimension

## Estimation totale

- Script simple, 1 entité, 1 mart : **~1h30**
- Script complexe (cross-domain, plusieurs marts) : **~3-4h**

Le gros du temps va dans la conception du grain (étape 1) et les tests (étape 7), pas dans le code.
