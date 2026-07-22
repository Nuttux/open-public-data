# ADR-0012 — Séparation open-core : socle financier public / enrichissement privé

**Status:** Accepted · **Date:** 2026-07-22

## Contexte

Deux promesses coexistent et semblent s'opposer :

1. **Audit** — quiconque peut vérifier les chiffres financiers qu'on publie : d'où
   ils viennent, comment ils sont transformés, et recalculer.
2. **Moat (cf. stratégie funding)** — ce qui nous protège n'est *pas* la donnée
   publique (DGFiP, OFGL, DECP sont téléchargeables par tous, un fork re-dérive
   les mêmes chiffres). C'est **l'opérateur, la marque, et surtout la couche
   d'enrichissement curée/générée** — résumés, descriptions, vulgarisations,
   classifications thématiques, photos, géocodage, matching nom→SIRET, lieux,
   paramètres éditoriaux. C'est ce capital accumulé qui rend chaque nouvelle
   ville peu coûteuse *pour nous* et coûteuse pour un copieur, et qui permet de
   relier les niveaux (national ↔ ville ↔ lieu).

Le **code est ouvert**. La tension "tout auditable" vs "données derrière un mur"
se résout par une observation : **l'auditabilité vit au niveau (source publique
→ code dbt ouvert → entrepôt BigQuery public), pas au niveau des JSON de
livraison.** Un auditeur n'a pas besoin de nos fichiers JSON ; il lui faut la
source, la transformation, et la table requêtable — les trois publics.

## Décision

Toute donnée est classée par **nature**, et le stockage/l'accès en découlent :

| Classe | Définition | Où | Accès |
|---|---|---|---|
| **financial** | Déterministe, reproductible depuis une source **publique** (DGFiP, OFGL, DECP, montants SCDL, INSEE, régulatoire type SRU) par du SQL, **sans jugement humain ni génération** | BigQuery datasets publics + code ouvert | **public** (`bigquery.dataViewer` → `allUsers`) |
| **enriched** | Généré ou curé : texte LLM, classification subjective/LLM, photos, géocodage, matching flou, lieux, params éditoriaux | BigQuery dataset **privé** + bucket privé | **credentials** |
| **mixed** | Un modèle qui contient **les deux** | On éclate les colonnes enrichies dans une table privée séparée, **ou** le modèle entier passe privé | jamais de colonne enrichie dans un dataset public |

**Frontière d'audit** = `source publique → dbt open-source → BigQuery financier
public + tests de réconciliation`. Les **JSON de livraison** (financiers *comme*
enrichis) restent dans des buckets privés (cf. [data-buckets.md](../data-buckets.md)) —
l'audit n'en dépend pas.

## Mécanisme (comment on code ça)

1. **Chaque modèle dbt déclare** `meta: { data_class: financial | enriched }`
   (les `mixed` sont interdits en l'état : éclater ou marquer `enriched`).
2. **Routage** : `generate_schema_name` (ou `+schema`) envoie les `enriched` vers
   un dataset **privé** (`dbt_paris_private_*`), les `financial` vers les datasets
   publics existants.
3. **IAM** : `allUsers:roles/bigquery.dataViewer` sur les datasets **financiers
   uniquement**. Jamais sur un dataset privé.
4. **Assets & livraison** : photos + tous les JSON exportés → buckets privés.
5. **Défaut sûr pour un nouveau modèle** : s'il réfère une source/seed
   d'enrichissement (`*enrichment_caches*`, `stg_cache_*`, `*thematique*`,
   `*grounded*`, `*sirene*`-matching, `*lieux*`, `seed_editorial_*`) → `enriched`.
   Sinon, arithmétique pure sur source publique → `financial`.

### Règle opérationnelle (à retenir)

> Dès qu'une colonne vient d'un **LLM, d'un choix humain, d'une photo, d'un
> géocodage, ou d'un matching nom→SIRET** → `enriched`, privé.
> Un dataset public ne contient **QUE** du déterministe-issu-de-source-publique.

## Alternatives rejetées

- **Tout public** : trahit le moat — l'enrichissement est le vrai travail, pas
  les chiffres publics.
- **Tout privé** : trahit la promesse d'audit et le positionnement neutre /
  open-data (crédibilité auprès de la presse, des villes, des financeurs).
- **Auditer au niveau des JSON** : fragile, cher, inutile — l'audit appartient au
  triplet source + code + entrepôt, pas aux fichiers de livraison.

## Conséquences

- Promesse d'audit tenue *précisément* : « requête notre BigQuery public, lis nos
  modèles dbt, recalcule ». Plus fort que « télécharge nos JSON ».
- Moat protégé : un fork obtient le code + le manifeste, **pas** l'enrichissement
  ni les credentials → il doit refaire le vrai travail (sa donnée, son pipeline,
  ses clés). Self-host documenté, fork-and-boom non.
- Coût : refactor des modèles `mixed` (éclatement de colonnes) ; IAM à maintenir
  par dataset ; le self-hébergeur amène son propre enrichissement.
- Le socle financier national (budget-by-nature, ADR à venir) va dans les
  datasets **publics** en prod ; l'enrichissement Paris (subventions grounded,
  thématique, photos, lieux) passe **privé**.
- La classification modèle-par-modèle est tenue à jour dans
  [`docs/data-classification.md`](../data-classification.md).
