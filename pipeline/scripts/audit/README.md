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
