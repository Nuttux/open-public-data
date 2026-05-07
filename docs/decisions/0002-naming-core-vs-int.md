# ADR-0002 : Nomenclature `core` plutôt que `int` pour les OBT par entité

**Status** : Accepted (2026-05-07)
**Décideur** : daniel
**Contexte** : Phase 16 du refactor — révélé par l'aplatissement de `int_ap_projets_enrichis` et `int_subventions_enrichies`

## Contexte

dbt strict utilise 3 couches : `staging` (1:1 avec source), `intermediate` (re-usable building blocks), `marts` (consumer-facing). Le projet utilise 4 couches en ajoutant `core`.

La question : ce qu'on appelle `core_subventions` (qui joint 5+ stagings pour produire l'OBT enrichie de l'entité « subventions ») devrait-il s'appeler `int_subventions` selon dbt strict ?

## Décision

**Garder le label `core`** pour les OBT par entité métier :
- `core_*` = un par entité (subventions, ap_projets, bilan_comptable, marches_publics, …) ; OBT enrichi par joins inline
- `int_*` = optionnel ; uniquement pour compositions cross-entité (1 ou 2 modèles dans le projet)
- `mart_*` = shape consommateur (un par JSON ou famille de JSONs)

## Alternatives rejetées

**A. dbt strict — renommer `core_*` en `int_*`**
- ✅ Aligne avec la doc dbt officielle et les ressources (Lightdash, Calogica)
- ❌ 12 modèles à renommer + tous les `ref()` en aval + tous les imports/exports + cross-layer tests
- ❌ Perd la sémantique « entité métier canonique » qui est utile en équipe data

**B. Ni `core` ni `int` — modèles top-level (`subventions`, `ap_projets`, …)**
- ✅ Le plus court
- ❌ Confus : qu'est-ce qui distingue `subventions` de `mart_subventions_treemap` ?
- ❌ Perd la couche d'agrégation/contrat

## Conséquences

**Positives** :
- Conservation de l'OBT comme concept distinct de la couche mart
- Un nouveau contributeur peut reconnaître l'entité métier sans connaître l'aggrégation downstream

**Négatives** :
- Décalage avec dbt strict → un dev externe arrivant sur le projet aura un moment de surprise
- Doit être documenté explicitement (ce que fait cet ADR)
- La couche `intermediate/` héberge un seul modèle aujourd'hui (`int_projet_marches`), ce qui peut paraître bizarre

## Enforcement

- La convention est explicite dans [04-layering-convention.md §2](../data-platform/04-layering-convention.md#2-layer-purposes).
- `check_layering.py` accepte les deux directions `core ← int` ET `int ← core` à cause du double rôle accepté de `int_*`.
