# Eval — local inference (GLM 5.2) vs frontier (Sonnet 5) on enrichment

**Purpose (2026-07-15):** decide, tier by tier, whether enrichment can run on a local open-weights model at acceptable quality. Run this OUTSIDE any Claude Code session: local model via LM Studio/Ollama (OpenAI-compatible endpoint), frontier via claude.ai or API. Reference labels come from the repo's existing Claude-produced enrichment — the bar is "agrees with what we already shipped", not perfection.

## Task 1 — Thematic classification of beneficiary names (highest volume, exact-scorable)

**Build the test set (100 items, high-confidence references only):**
```bash
cd pipeline/seeds
python3 - <<'EOF'
import csv, json, random
rows = [r for r in csv.DictReader(open('seed_cache_thematique_beneficiaires.csv'))
        if float(r['ode_confiance'] or 0) >= 0.7]
random.seed(42); sample = random.sample(rows, 100)
labels = sorted({r['ode_thematique'] for r in rows})
json.dump(labels, open('/tmp/eval_labels.json','w'), ensure_ascii=False)
with open('/tmp/eval_inputs.jsonl','w') as f:
    for r in sample:
        f.write(json.dumps({'name': r['beneficiaire_normalise']}, ensure_ascii=False)+'\n')
with open('/tmp/eval_refs.jsonl','w') as f:
    for r in sample:
        f.write(json.dumps({'name': r['beneficiaire_normalise'], 'ref': r['ode_thematique']}, ensure_ascii=False)+'\n')
print(f"{len(sample)} items, labels: {labels}")
EOF
```

**The prompt (identical for both models; paste the label list from `/tmp/eval_labels.json` into `{LABELS}`):**

```
Tu classifies des bénéficiaires de subventions de la Ville de Paris par thématique.

Réponds UNIQUEMENT avec un objet JSON: {"thematique": "<label>", "confiance": <0.0-1.0>}
- "thematique" doit être EXACTEMENT l'un de ces labels: {LABELS}
- "confiance": 0.9+ seulement si le nom rend la thématique évidente; 0.5 si tu infères
  d'indices partiels; 0.25 ou moins si le nom est trop court/tronqué/ambigu.
- Si le nom ne permet pas de classification fiable, réponds {"thematique": "Autre", "confiance": 0.25}.
- N'invente RIEN: pas de recherche web, uniquement le nom fourni.

Nom du bénéficiaire: {NAME}
```

**Scoring:** run all 100 through each model (temperature 0), then exact-match agreement vs `ode_thematique` in `/tmp/eval_refs.jsonl`. Also track: % invalid JSON, % labels outside the enum (both are automatic fails for that item).

**Decision rule:** local ≥ 90% agreement AND ≤ 2% invalid outputs → switch this tier to local. 80–90% → local with a confidence threshold (route `confiance < 0.7` items to frontier). < 80% → stay frontier.

## Task 2 — Marché vulgarization (judged pairwise, 30 items)

**Test set:** pick 30 entries from `website/public/data/enrichment/vulgarization_marches.json` (skip the `count` key). Each entry's input fields (objet du marché, titulaire, montant) go to both models with the production-style prompt:

```
Explique ce marché public de la Ville de Paris en une phrase (max 25 mots),
en français courant, pour un citoyen non spécialiste.
Règles: pas de jargon administratif; pas de jugement de valeur; ne rien inventer
au-delà des champs fournis; garder les chiffres exacts s'ils sont fournis.

Marché: {OBJET}
Titulaire: {TITULAIRE}
Montant: {MONTANT} €
```

**Judging (blind A/B):** shuffle which model is A/B per item. Judge = you, or a third model (never one of the two contestants — self-preference bias). Criteria, in order: (1) factuellement fidèle aux champs fournis (toute invention = perte automatique), (2) clarté pour un non-spécialiste, (3) concision. Verdict par item: A / B / égalité.

**Decision rule:** local wins+ties ≥ 70% → switch tier. Watch specifically for hallucinated specifics (adresses, dates, quantités non fournies) — one systematic hallucinator disqualifies regardless of style scores.

## What NOT to test locally (settled by design, not eval)

- **Grounded/web-search enrichment** (`enrich_beneficiaire_grounded_llm.py`): bottleneck is retrieval, not the model — separate decision, needs a search stack first.
- **Vision/handwriting** (archive showcase): frontier by design; it's the pitch.

## Report format

| Task | Model | Agreement / win rate | Invalid outputs | Hallucinations noted | Verdict |
|---|---|---|---|---|---|

Paste the filled table back into a session and we wire the winning setup into the `--use-llm` JSONL batch path (P2.4 interface — the scripts don't care what's behind the endpoint).
