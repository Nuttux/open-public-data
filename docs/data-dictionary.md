# Data dictionary

Catalogue des datasets publiés par le projet, par entité core. Pour chaque entité : source officielle, fréquence MAJ, années couvertes, colonnes principales, transformations appliquées.

Cette page est la **source de vérité** côté gouvernance : un journaliste ou un décideur qui veut citer un chiffre y trouve la traçabilité complète.

> Format : voir aussi [`docs/architecture-modelling.md`](architecture-modelling.md) pour le détail des règles dbt, [`docs/data-platform/02-catalog-and-model.md`](data-platform/02-catalog-and-model.md) pour le catalogue technique pipeline, [`docs/data-platform/04-layering-convention.md`](data-platform/04-layering-convention.md) pour les conventions raw → stg → core → mart.

---

## core_budget — Budget exécuté (Compte Administratif)

| Champ | Description |
|-------|-------------|
| **Source** | [Open Data Paris — Comptes administratifs](https://opendata.paris.fr/explore/dataset/comptes-administratifs-fonction/) |
| **Years** | 2019 → 2024 |
| **Grain** | 1 ligne = 1 (année, chapitre, fonction, nature) |
| **MAJ** | Annuel, ~juin année N+1 |
| **License source** | Etalab Licence Ouverte 2.0 |

Colonnes clés : `exercice`, `chapitre`, `fonction`, `nature`, `libelle`, `mandate` (montant exécuté), `realise` (montant payé), `direction`.

Transformations appliquées :
- Conversion EUR → entiers (centimes) côté staging pour éviter floats
- Enrichissement `direction` ↔ `M57` via `seed_mapping_directions.csv`
- Filtrage des lignes annulées (post-CRC)

## core_budget_vote — Budget prévisionnel (Budget Primitif)

| Champ | Description |
|-------|-------------|
| **Source** | PDFs Budget Primitif Ville de Paris (annexés aux délibérations) |
| **Years** | 2023 → 2026 |
| **Grain** | 1 ligne = 1 (année, chapitre, fonction) |
| **MAJ** | Annuel, ~décembre année N-1 |
| **License source** | Document administratif public |

Transformations :
- Extraction via `pdfplumber` (cf `pipeline/scripts/tools/extract_pdf_investments.py`)
- Mapping fonctions M57 ↔ libellés ville via `seed_mapping_directions.csv`

## core_bilan_comptable — Actif / Passif / Dette

| Champ | Description |
|-------|-------------|
| **Source** | Compte de gestion (DGFiP) + Chambre régionale des comptes (snapshots années précédentes) |
| **Years** | 2019 → 2024 |
| **Grain** | 1 ligne = 1 (année, poste bilan) |
| **MAJ** | Annuel |

Colonnes clés : `total_actif`, `total_passif`, `dettes_financieres`, `dettes_court_terme`, `tresorerie`, `epargne_brute`, `epargne_nette`, `capacite_desendettement_ans`.

Snapshots CRC dans `seed_paris_debt_snapshots.csv` (override DGFiP quand divergence connue).

## core_subventions — Subventions versées

| Champ | Description |
|-------|-------------|
| **Source** | [Open Data Paris — Subventions](https://opendata.paris.fr/explore/dataset/subventions-octroyees-aux-associations-loi-1901-et-autres-organismes/) |
| **Years** | 2018 → 2024 |
| **Grain** | 1 ligne = 1 (année, bénéficiaire, objet) |
| **MAJ** | Trimestriel (mais consolidation annuelle ~mars année N+1) |
| **License source** | Etalab Licence Ouverte 2.0 |
| **Volume** | ~40 000 lignes/an |

Colonnes clés : `annee`, `beneficiaire`, `siret`, `montant`, `objet`, `direction`, `thematique` (enrichi LLM).

Transformations :
- Enrichissement SIRET via API Sirene
- Classification `thematique` (16 catégories) via LLM Gemini/Claude — voir `pipeline/scripts/enrich/enrich_thematique_llm.py`
- Vulgarisation `objet` via `vulgarize_subventions_llm.py` (libellé technique → texte lisible)

## core_marches_publics — Marchés publics notifiés

| Champ | Description |
|-------|-------------|
| **Source** | [Open Data Paris — DECP](https://opendata.paris.fr/explore/dataset/marches-publics-de-la-ville-de-paris-decp/) + data.gouv.fr DECP nationaux |
| **Years** | 2013 → 2026 |
| **Grain** | 1 ligne = 1 contrat (numero unique) |
| **MAJ** | Mensuel |
| **License source** | Etalab Licence Ouverte 2.0 |
| **Volume** | ~110 000 contrats cumulés |

Colonnes clés : `numero`, `objet`, `titulaire_denomination`, `titulaire_siren`, `montant`, `date_notification`, `cpv`, `procedure`, `lieu_execution`.

Transformations :
- Normalisation libellés `objet` via `objet-normalizer.ts` (regex pré-LLM) + vulgarisation LLM
- Enrichissement SIREN → forme juridique, ville, secteur via API Sirene
- Matching projets investissements via `match_projet_marches.py` (LLM scoring)

## core_ap_projets — Projets d'investissement (Autorisations de Programme)

| Champ | Description |
|-------|-------------|
| **Source** | Annexe Compte Administratif (PDFs investissements) + arrondissement (BDP) |
| **Years** | 2018 → 2022 |
| **Grain** | 1 ligne = 1 (année, projet, arrondissement) |
| **MAJ** | Annuel |

Transformations :
- Extraction PDF via pdftotext + parsing texte
- Géolocalisation arrondissement via mapping adresse → INSEE
- Classification typologie (école/voirie/équipement culturel/etc.) via heuristique regex + LLM

## core_logements_sociaux — Logements sociaux financés

| Champ | Description |
|-------|-------------|
| **Source** | Open Data Paris — Inventaires logements sociaux, DRIHL |
| **Years** | 2001 → 2024 |
| **Grain** | 1 ligne = 1 (année, opération, bailleur) |
| **MAJ** | Annuel |
| **License source** | Etalab Licence Ouverte 2.0 |

Colonnes clés : `annee_financement`, `bailleur`, `nb_logements`, `categorie_financement` (PLAI/PLUS/PLS), `arrondissement`, `commune` (pour parc périphérique).

## core_dette_garantie — Dette garantie par la Ville

| Champ | Description |
|-------|-------------|
| **Source** | Compte administratif annexe |
| **Years** | 2019 → 2024 |
| **Grain** | 1 ligne = 1 (année, organisme bénéficiaire) |
| **MAJ** | Annuel |

Bailleurs sociaux + autres bénéficiaires de garantie d'emprunt. Calcul du "hors bilan" agrégé.

## core_deliberations — Délibérations du Conseil de Paris

| Champ | Description |
|-------|-------------|
| **Source** | Scrape site officiel Conseil de Paris |
| **Years** | 2019 → ongoing |
| **Grain** | 1 ligne = 1 délibération (numero unique) |
| **MAJ** | Hebdomadaire (jours de séance) |

Sessions + délibérations + articles attachés. Utilisé pour cross-référencer subventions (qui sont votées par délibération) et marchés.

## core_sirene_companies — Cache Sirene (national)

| Champ | Description |
|-------|-------------|
| **Source** | API officielle Sirene INSEE |
| **Grain** | 1 ligne = 1 SIREN |
| **MAJ** | À la demande (cache local, refresh mensuel) |

Cache des données Sirene résolues pour les SIREN apparaissant dans subventions/marchés.

## core_enrichment_caches — Caches d'enrichissement LLM

| Champ | Description |
|-------|-------------|
| **Source** | Outputs LLM (Claude / Gemini) gardés en cache pour reproductibilité |
| **Grain** | 1 ligne = 1 (entité, scope_id, payload_hash) |
| **MAJ** | À chaque nouveau run LLM |

Permet de re-run le pipeline sans re-payer les LLM. Voir [`docs/decisions/0005-internal-cache-pattern.md`](decisions/0005-internal-cache-pattern.md).

---

## Marts (vues d'agrégation)

Les marts (`pipeline/models/marts/mart_*.sql`) sont les vues consommées par les scripts d'export → JSON. Voir [`docs/data-platform/02-catalog-and-model.md`](data-platform/02-catalog-and-model.md) pour le catalogue complet.

Quelques marts notables :
- `mart_marches_fournisseurs` — agrégat par titulaire
- `mart_projet_marches` — matching projets ↔ marchés (LLM-scored)
- `mart_bilan_comptable` — vue user-facing du bilan
- `mart_budget_sankey_lines` — données du Sankey budget
- `mart_data_availability_*` — pour cocher "données dispos" par page UI

## JSON exportés (frontière pipeline → site)

Chaque mart est exporté vers `website/public/data/<entity>/*.json` par un script `pipeline/scripts/export/export_*.py`. Voir le README pipeline pour la liste complète.

Le site lit ces JSON via `website/src/lib/fusion-data.ts` (server-side loaders).

## Pour signaler une erreur factuelle

Ouvrir une issue GitHub avec le label `data-correction`. Voir [`CONTRIBUTING.md`](../CONTRIBUTING.md) section "Process de signalement d'erreur factuelle".

Si la correction vient d'une mise à jour de l'éditeur source, suivre [`docs/runbooks/source-correction-retroactive.md`](runbooks/source-correction-retroactive.md) (en cours dans PR #27).
