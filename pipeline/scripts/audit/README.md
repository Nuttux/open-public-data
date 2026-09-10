# Layering audit

Tools to enforce the layering convention defined in
[docs/data-platform/04-layering-convention.md](../../../docs/data-platform/04-layering-convention.md).

## `check_layering.py`

The CI gate. Reads `layering_whitelist.yml` and walks the repo to verify:

- E1: every `core_*` model refs only `stg_*`/`core_*`/`int_*`/seed-mapping.
- E2: every `int_*` model refs `stg_*`/`core_*`/`int_*`/whitelisted seeds.
- E3: every `mart_*` model refs `core_*`/`int_*`/`mart_*`/seed-mapping.
- E4: every `pipeline/scripts/export/*.py` reads only from `mart_*`.
- E5: no `sync/`, `tools/`, or `enrich/` script writes JSON under
      `website/public/data/` outside the whitelist.

Run locally:

```bash
python3 pipeline/scripts/audit/check_layering.py            # warnings + violations
python3 pipeline/scripts/audit/check_layering.py --strict   # warnings count as failure
```

Exit code:
- `0` — clean (or warnings only — see `--strict`)
- `1` — at least one violation
- `2` — invalid invocation

## `layering_whitelist.yml`

Three exception categories:

| Cat | Tag | Where | When OK |
|---|---|---|---|
| **E** | `enrich_writes_to_enrichment` | enrichment scripts → `public/data/enrichment/*` | Lazy-loaded per-record cache (LLM, SIRENE, photos). Must also feed dbt via `seed_cache_*`. |
| **D** | `ingest_writes_to_data` | known legacy bypasses to `public/data/<feature>/` | Has a `todo:` field with a future-work pointer. New entries require code review. |
| **W** | `wip_not_yet_consumed` | sync/tools scripts not wired into UI yet | Audit reports as warning. Must comply with §4.1 before being wired up. |

Plus two seed-related allowlists:

| Tag | Purpose |
|---|---|
| `mapping_seeds_allowed_outside_stg` | Mappings/parameters (config), allowed to be `ref()`'d from `core_*`/`int_*` directly. |
| `llm_cache_seeds_allowed_in_int` | Memoization tables (frozen LLM output), allowed to be `ref()`'d from `int_*` only. |

## `build_layering_audit.py`

Older scanner; produces a CSV of all flagged spots regardless of whitelist.
Useful for migration planning. Output → `docs/data-platform/_audit_layering_<suffix>.csv`.

## `diff_json_semantic.py`

Helper used by `verify_export.sh` to compare JSON files modulo:
- run metadata keys (`generated_at`, `exported_at`, …)
- floating-point summation noise (rounded to 6 significant digits)
- list-of-dicts ordering (compared as multisets)

Use it during a refactor to confirm an export still produces the same data
even when SQL ordering or aggregation order changes.

## `verify_export.sh`

End-to-end check: runs an export script, compares each JSON output against
the version in `git HEAD`, and restores on success so the working tree
stays clean. Used after any refactor that touches an export's SQL.

```bash
bash pipeline/scripts/audit/verify_export.sh \
    pipeline/scripts/export/export_logement_attente.py \
    website/public/data/logement_attente_paris.json
```

## CI hook

Add to GitHub Actions / pre-commit:

```yaml
- name: Layering audit
  run: python3 pipeline/scripts/audit/check_layering.py --strict
```

Pre-commit (optional — `--strict` is harsh for incremental development):

```bash
# .git/hooks/pre-commit
#!/bin/sh
python3 pipeline/scripts/audit/check_layering.py || exit 1
```

## `audit_publication_coverage.py`

Le crible de couverture. Contrairement à `run_data_quality_audit.py`, qui
vérifie la cohérence interne de l'entrepôt, celui-ci part du catalogue
opendata.paris.fr et croise trois colonnes : ce que la Ville publie, ce qu'on
ingère, ce que le site sert. Il ne demande aucun accès BigQuery.

Son contrôle central est générique : la Ville coupe ses séries au changement de
plan comptable et republie la suite sous un autre identifiant. Le script retire
les marqueurs de période des titres du catalogue, regroupe par souche, et
signale tout jeu frère qu'on n'ingère pas. C'est ce contrôle qui manquait
quand la série des autorisations de programme est restée coupée à 2017 pendant
des mois (95 M€ absents des fiches lieu, corrigé le 2026-09-10).

Il distingue nos erreurs (série coupée, exercices absents, écart de total à
filtre égal) de celles de la Ville (série gelée, changement de format en cours
de série, colonne abîmée, identifiant fautif).

```bash
python3 pipeline/scripts/audit/audit_publication_coverage.py
python3 pipeline/scripts/audit/audit_publication_coverage.py --famille subventions
python3 pipeline/scripts/audit/audit_publication_coverage.py --no-totaux --dry-run
```

Sorties : `website/public/data/audit_publication_coverage.json` (publiable) et
`pipeline/docs/audit_publication_coverage.md` (lisible). Code de sortie 1 s'il
reste une erreur, pour servir de porte en intégration continue.

Ajouter une série : une entrée dans `FAMILLES`, avec les identifiants ODS
ingérés, les indices de colonnes année/montant, où lire notre chiffre, et si
possible le `filtre_source` qui reproduit le filtre de l'export — sans lui la
comparaison de totaux reste indicative, et une alerte indicative ne bloque rien.

## `audit_echantillon.py`

Le contrôle par sondage. Le crible de couverture compare des totaux ; deux jeux
peuvent avoir le même total et des lignes fausses. Celui-ci tire des lignes au
hasard dans ce que le site publie et va rechercher chacune au portail, une
requête par ligne. La graine du tirage est affichée pour rejouer exactement le
même échantillon.

```bash
python3 pipeline/scripts/audit/audit_echantillon.py --n 100
python3 pipeline/scripts/audit/audit_echantillon.py --serie subventions --n 200
python3 pipeline/scripts/audit/audit_echantillon.py --graine 534782389   # rejeu
```

Ce qu'il ne prouve pas : rien sur les données reconstruites depuis les PDF
(subventions 2020-2021, investissements localisés). Elles n'ont pas
d'équivalent interrogeable au portail et sont exclues du tirage plutôt que
déclarées bonnes.

Trois pièges de méthode ont été trouvés en l'écrivant, tous du même genre :
comparer notre ligne à un agrégat plus large de la source. Une livraison de
logements réapparaît sur un autre exercice, une même livraison est publiée en
plusieurs lignes chez nous quand elle mêle des financements, et `annee` est un
champ DATE qu'il faut interroger avec `year()`. Chacun faisait crier au faux
sur une donnée juste. Une alerte fausse fait perdre sa valeur à l'outil : les
trois sont documentés dans le code à l'endroit exact où ils mordent.
