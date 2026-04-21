# Conseil de Paris deliberation pipeline

Bridges the gap between the consolidated `opendata.paris.fr`
"Subventions accordées" dataset (last year published = 2024) and the
current fiscal year, by parsing individual Conseil de Paris
deliberations as they are voted.

## Layers

```
scrape_deliberations.py        (HTML index → PDF → regex extract)
    ↓
enrich_deliberations_sirene.py (name → SIRET via recherche-entreprises.api.gouv.fr)
    ↓
enrich_deliberations_llm.py    (text extraction for regex gaps — Haiku or Gemini)
    ↓
enrich_deliberations_websearch.py (SIRET fallback via Claude + web_search tool)
    ↓
apply_deliberation_results.py  (merge hand-crafted results into session JSON)
```

`compare_deliberation_results.py` sanity-checks a candidate results
file against a ground-truth file (both same shape).

## Quality baseline

On session 152 (Conseil de Paris, March 2025):

| Pass                         | Beneficiary | Amount | SIRET |
| ---------------------------- | ----------- | ------ | ----- |
| regex only                   | 50 %        | 58 %   | 10 %  |
| + SIRENE normaliser v0.2     | 50 %        | 58 %   | 56 %  |
| + hand-crafted batch_000     | 70 %        | 60 %   | 57 %  |
| + LLM on remaining gaps      | ~95 %       | ~90 %  | ~70 % |
| + WebSearch SIRET fallback   | ~95 %       | ~90 %  | ~85 % |

## Typical run

```bash
# 1. Scrape a session (downloads PDFs, regex extract)
python3 pipeline/scripts/sync/scrape_deliberations.py --session 152

# 2. SIRENE lookup
python3 pipeline/scripts/enrich/enrich_deliberations_sirene.py --session 152

# 3. LLM fills the remaining benef/amount gaps (prefer Haiku for cost)
ANTHROPIC_API_KEY=xxx python3 pipeline/scripts/enrich/enrich_deliberations_llm.py \
    --session 152 --provider anthropic

# 4. WebSearch for still-missing SIRETs
ANTHROPIC_API_KEY=xxx python3 pipeline/scripts/enrich/enrich_deliberations_websearch.py \
    --session 152

# 5. (Optional) Apply hand-crafted corrections for tricky batches
python3 pipeline/scripts/enrich/apply_deliberation_results.py \
    --session 152 \
    --results website/public/data/enrichment/deliberations_results/session_152_batch_000.json
```

## Data shape

`website/public/data/subventions_delibs/session_<id>.json`:

```json
{
  "session_id": 152,
  "generated_at": "...",
  "source": "Conseil de Paris — ordre du jour",
  "nb_delibs": 212,
  "nb_articles": 1463,
  "delibs":   [{ "delib_id":"2025 DAC 399", "id_entite": 64103, ...}],
  "articles": [{
    "delib_id": "2025 DAC 399",
    "article_num": 1,
    "beneficiary": "Fondation Charles de Gaulle",
    "beneficiary_source": "regex|llm|manual",
    "amount_eur": 5000,
    "amount_source": "regex|llm|manual",
    "siret": "12345678901234",
    "siret_source": "regex|sirene|websearch|llm|manual",
    "motif": "...",
    "dossier": "2025_05412",
    "is_admin": false
  }]
}
```

## Ground-truth snapshots

`website/public/data/enrichment/deliberations_results/session_<id>_batch_<n>.json`
— each file contains hand-crafted records for 30 articles, applied via
`apply_deliberation_results.py`. Serves as the comparison baseline when
we test a new extractor (see `compare_deliberation_results.py`).
