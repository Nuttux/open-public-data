# ADR-0006 : Audit gate basé sur regex (Phase 1), AST plus tard (Phase 2)

**Status** : Accepted (2026-05-07)
**Décideur** : daniel

## Contexte

`pipeline/scripts/audit/check_layering.py` enforce les règles de layering. Implémentation actuelle : regex Python.

Critique légitime : un dev malin peut contourner :
```python
get_path = lambda root: root / "website" / "public" / "data" / "X"
get_path(ROOT).write_text(json.dumps(...))
```

Le regex actuel ne suit pas l'indirection variable.

## Décision

**Phase 1 (actuelle)** : regex Python avec tracking de variables nommées (closure de variables → write target). Suffisant pour 95 % des cas réels (écrire à un path passe par une variable nommée).

**Phase 2 (futur, pas planifiée)** : remplacer par un AST visit (`ast` module Python) qui suit toutes les expressions résolvant à un path sous `public/data/`. Vrai parser, pas heuristique.

## Pourquoi pas AST direct

- Le projet a 50+ scripts Python → effort de migration ~2 jours
- Aucun bypass observé en pratique → ROI faible aujourd'hui
- L'AST ne résout pas le runtime indirection (callable returning path) sans une analyse de flux

## Mitigation court terme

- Pre-commit hook qui run `check_layering.py --strict`
- Code review — un dev qui contourne via lambda est observable
- Frontend audit (Issue #9) attrape les fetch côté UI

## Triggers pour passer en Phase 2

Migrer vers AST si :
1. Un bypass réel est trouvé en review qui n'a pas été détecté par la regex
2. Le projet dépasse 100 scripts Python
3. Un audit externe demande la garantie

## Conséquences

**Positives** : Solution actuelle fonctionne, simple à maintenir.

**Négatives** : Confiance imparfaite. Un attaquant motivé peut contourner.

**Acceptable** parce que ce n'est pas un threat model adversarial — l'audit gate sert à attraper les régressions accidentelles, pas le sabotage.
