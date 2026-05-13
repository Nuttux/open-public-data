# ADR-0007 : Tolérance byte-equality des exports

**Status** : Accepted (2026-05-07)

## Contexte

Le projet vérifie qu'un refactor n'altère pas la donnée publiée via `pipeline/scripts/audit/diff_json_semantic.py`. Comparaison naïve byte-byte échoue à cause de :

1. **Timestamps** (`generated_at`) — différents à chaque run
2. **Order non-déterministe** dans les listes de records (BQ ne garantit pas l'ordre sans ORDER BY ; même avec ORDER BY, les ties sont non-déterministes)
3. **Float precision** — sommation Python vs SUM() BigQuery donne des écarts à la 6e-9e décimale
4. **Map/dict ordering** — BQ retourne `{a:1, b:2}` ou `{b:2, a:1}` selon le run

## Décision

`diff_json_semantic.py` applique :

- **Strip metadata keys** : `generated_at`, `generation_timestamp`, `exported_at`, `_generated_at` ignorés à tous les niveaux
- **Quantize floats** : tous les floats arrondis à 6 chiffres significatifs (rel diff < 1e-6 = équivalent)
- **Sort lists of dicts** : si une liste contient des dicts, la sort par `json.dumps(sort_keys=True)` (multiset compare)
- **Sort dict keys** : `sort_keys=True` au dump pour ordre déterministe

Tolérance du float :
- 6 sig digits = 1 € sur 100k €, 10 € sur 1M €, 100 € sur 10M €
- Bien en dessous de la précision UI (montants affichés en M€ ou Md€)
- Au-dessus du bruit float typique (1e-9 → 1e-15)

## Alternatives rejetées

**A. Strict byte-equality (cmp diff)**
- ❌ Échoue sur tout refactor → useless

**B. Tolérance configurable par fichier**
- ✅ Plus flexible
- ❌ Plus de complexité ; peu de cas où la tolérance globale ne suffit pas

**C. Schema-based comparison (Pydantic)**
- ✅ Type-safe
- ❌ Définit un schéma par JSON publié = maintenance énorme

## Conséquences

**Positives** :
- Refactors structurels passent sans faux positifs
- Les vraies régressions (montant qui change de 1k €) sont attrapées

**Négatives** :
- 1 € de différence dans un montant individuel passe sous le radar (mais 1k € sur un total non)
- Si un refactor change SUBTILEMENT la sémantique (ex : DISTINCT ajouté), la diff peut être absorbée par le tolerancing

**Mitigation** : les xlay tests dbt (`pipeline/tests/cat7_cross_layer/`) vérifient les totaux **exacts** au niveau des marts. Si le mart-level passe ET le diff_json_semantic passe, on est bons.

## Enforcement

- `bash pipeline/scripts/audit/verify_export.sh <export_script> <output.json>` est utilisé après chaque refactor d'un export
- À automatiser en CI : tous les exports doivent produire des JSONs sémantiquement-équivalents au HEAD
