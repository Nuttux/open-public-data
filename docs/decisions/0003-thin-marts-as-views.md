# ADR-0003 : Marts « thin » matérialisés en VIEW

**Status** : Accepted (2026-05-07) · **Revised v2 (2026-05-07)** — voir addendum en bas
**Décideur** : daniel
**Contexte** : Issue #2 de la review post-Phase 18 + correction round 3 issue #6

## Contexte

6 marts du projet sont des « thin marts » : ils font uniquement projection de colonnes + filter trivial + `ORDER BY` stable, sans agrégation :

- `mart_logement_attente`
- `mart_bilan_comptable`
- `mart_logements_map`
- `mart_investissements_map`
- `mart_hors_bilan`
- `mart_investissements_localises`

Une revue critique remarque qu'ils n'apportent rien de plus que `core_*` directement. Le statu quo (matérialisés en `table` avec ORDER BY) double l'espace BigQuery sans valeur ajoutée.

## Décision

Conserver ces marts mais les matérialiser en `view` (pas `table`), avec le tag `thin` dbt et un commentaire SQL explicite. Trois raisons :

1. **Contrat de colonnes** : l'export Python lit un set précis de colonnes. Si demain `core_*` ajoute une colonne, le mart la masque par défaut → l'export ne casse pas inopinément.
2. **Contrat d'ordre** : `ORDER BY` stable garantit que les JSONs exportés ont une représentation déterministe (utile pour byte-equality verify).
3. **Layering** : la règle « exports lisent uniquement de mart_* » reste enforce-able sans exception. Sans ces marts thin, il faudrait soit autoriser `core_*` reads (regression), soit déplacer ORDER BY dans le SQL Python (mais BQ ne garantit pas l'ordre sur un SELECT * sans ORDER BY).

## Alternatives rejetées

**A. Supprimer les marts, lire `core_*` direct depuis exports**
- ✅ Moins de fichiers
- ❌ Casse la règle « exports lisent mart » → exception nécessaire dans le gate
- ❌ Pas de contrat de colonnes : un changement de core casse silencieusement

**B. Inline le SQL dans le script Python avec `ORDER BY` explicite**
- ✅ Pas de mart à maintenir
- ❌ La logique d'ordonnancement vit hors dbt → impossible à tester via dbt
- ❌ Si plusieurs scripts utilisent le même core, duplication

## Conséquences

**Positives** :
- Coût BQ négligeable (views = pas de stockage, query rewrite)
- Tests `xlay_*` peuvent vérifier que mart count == core count
- Naming consistant : un mart par JSON consommateur

**Négatives** :
- 6 fichiers SQL avec une seule transformation triviale (projection + ORDER BY)
- Doit être documenté pour qu'un nouveau contributeur ne trouve pas ça stupide

## Enforcement

Convention §2 [04-layering-convention.md](../data-platform/04-layering-convention.md) liste le pattern « thin mart » comme variante acceptable. Tag dbt `thin` permet de les sélectionner facilement (`dbt build --select tag:thin`).

---

## Addendum v2 (round 3 issue #6) — l'argument « ORDER BY contract » était faux

La version originale de cet ADR défendait le thin mart avec **trois** raisons : contrat de colonnes, contrat d'ordre, conservation de la règle layering. Une review round 3 a montré que l'argument **« contrat d'ordre »** est faux :

- BigQuery **ne préserve PAS l'`ORDER BY` d'une VIEW** au niveau du outer SELECT.
- `SELECT * FROM mart_logements_map` (où le mart est une VIEW avec ORDER BY) peut renvoyer les lignes dans **n'importe quel ordre** ; BQ exécute la VIEW puis applique sa propre parallélisation.
- Le seul moyen d'avoir un ordre stable côté export est d'**ORDER BY explicite dans la query du script Python**.

### Correction appliquée

1. Les 6 thin marts ont été modifiés pour **ne plus contenir d'`ORDER BY`** dans la VIEW (c'était trompeur).
2. Les 6 exports consommateurs ont reçu un `ORDER BY` explicite dans leur query.
3. Les xlay tests (qui vérifient row count) restent valables — l'ordre n'affecte pas le count.
4. La byte-equality des JSON publiés est préservée (le `diff_json_semantic.py` sort les listes, donc l'ordre exact ne dépend pas de la sortie de la query mais du tri Python en amont).

### Justification résiduelle pour garder les thin marts

L'argument « contrat d'ordre » disparaissant, il reste **deux** justifications pour conserver les thin marts :

1. **Contrat de colonnes** : si `core_*` ajoute une colonne demain, le mart la masque (l'export ne casse pas).
2. **Layering rule** : « exports lisent uniquement `mart_*` » reste enforce-able sans exception.

C'est moins fort qu'avant, mais suffisant pour le statu quo. **Si un futur refactor remet en cause le pattern**, supprimer les thin marts et autoriser explicitement les `core_*` reads dans certains exports devient une option crédible (cf. ADR-0001 alternatives section).

### Leçon

Les ADR doivent être **vérifiés contre la réalité du moteur SQL**, pas seulement contre l'intention. La revue round 3 a montré qu'un argument plausible-mais-faux peut survivre 3 itérations si personne ne teste empiriquement. Test : faire un `SELECT *` sans ORDER BY sur une VIEW avec ORDER BY et observer l'ordre — c'est non-déterministe.
