# Classification des données — financial (public) / enriched (privé)

Compagnon opérationnel de [ADR-0012](decisions/0012-open-core-data-division.md).
Chaque modèle dbt porte `meta: { data_class: financial | enriched }`. Ce fichier
est la **carte de référence** : quand on ajoute un modèle, on le classe ici et on
le tague. Dernière revue : 2026-07-22 (90 modèles).

## Principe de tri (rappel)

`enriched` **dès qu'une colonne vient d'un LLM, d'un choix humain, d'une photo,
d'un géocodage, ou d'un matching flou nom→SIRET.** Sinon `financial`. Le préfixe
`ode_` **ne signifie rien** en soi : `ode_categorie_flux` est une règle comptable
déterministe (public) ; `ode_thematique` sur subventions est un cascade LLM
(privé). On classe sur la **provenance**, pas sur le nom.

## ENRICHED — modèles entièrement privés

| Modèle | Giveaway |
|---|---|
| stg_cache_geo_ap | géocodage LLM (`ode_latitude/longitude/confiance`) |
| stg_cache_thematique_beneficiaires | thématique LLM subventions |
| stg_deliberations_articles / _delibs / _sessions | extraction LLM/websearch/sirene |
| stg_enrichment_caches | payloads générés |
| stg_lieux_connus | lieux curés (adresse/lat/long) |
| stg_pdf_investissements_localises | extraction Gemini (`confidence`) |
| stg_match_projet_marches | matching flou (`score/label/reason`) |
| core_enrichment_caches / mart_enrichment_caches | payloads |
| core_pdf_investissements_localises / mart_investissements_localises | chaîne Gemini |
| core_deliberations / mart_deliberations | toute la table = extraction LLM (même `amount_eur`) |

## MIXED — financier + enrichi dans une même table

Règle ADR : **éclater les colonnes enrichies dans une table privée séparée, ou
passer le modèle en privé.** Le refactor d'éclatement est un chantier à part ;
en attendant, traitement par défaut ci-dessous.

| Modèle | Colonnes enrichies à isoler | Défaut interim |
|---|---|---|
| core_subventions | `ode_thematique, ode_sous_categorie, ode_source_thematique, ode_beneficiaire_canonique` (cascade LLM) | **privé** *(voir décision ⚠️)* |
| mart_subventions_beneficiaires / _treemap / mart_concentration | idem (thématique LLM) | **privé** *(⚠️)* |
| core_ap_projets / mart_carte_investissements / mart_investissements_map / mart_stats_arrondissements | cascade géo `ode_latitude/longitude/adresse/nom_lieu/type_equipement` (lieux + LLM) | **privé** (montants → publics au split) |
| int_projet_marches / mart_projet_marches | `score/label/reason` + la relation de match elle-même | **privé** (la liaison EST le moat) |
| core_budget / core_budget_vote / mart_budget_nature / mart_sankey / mart_vote_vs_execute / mart_evolution_budget | `ode_thematique` = **seed déterministe** `seed_mapping_thematiques` | **PUBLIC** (voir note) |

**Note budget-thématique** : contrairement aux subventions, la thématique budget
vient d'un mapping *règle* `chapitre/fonction → thématique` (seed committé,
reproductible). C'est déterministe → on le garde **public** et on publie le seed.
C'est le socle financier phare : il doit rester auditable.

**⚠️ Décision à confirmer (subventions / qui-reçoit)** : les *montants* de
subventions sont publics (SCDL), mais la thématique + le bénéficiaire canonique
sont du LLM. Interim = privé (protège le moat). Alternative = éclater pour
exposer publiquement montant+bénéficiaire brut, garder privé thématique/canonique.
À trancher selon l'importance de qui-reçoit comme vitrine publique.

## FINANCIAL — public (tout le reste)

Tous les modèles **national** (budget-by-nature, dette, marchés, subventions,
bilan, réconciliation) sont FINANCIAL → publics. Côté Paris : bilan, budget
recettes/chapitre, sankey-lines (règle nature), hors-bilan, logement (DRIHL/SRU),
marchés (par nature, fournisseurs via lookup SIRET public), data-availability,
SIRENE (registre INSEE public), Marseille budget. Les mappings-seed déterministes
(`stg_mapping_*`) sont publics : leur source est un CSV committé.

## ⚠️ Couche non encore traitée — enrichissement committé en SEED

Certains caches d'enrichissement sont **committés comme seeds CSV** dans
`pipeline/seeds/` (`seed_cache_geo_ap`, `seed_cache_thematique_beneficiaires`,
`seed_cache_siret_by_name`, `seed_lieux_connus`, `seed_match_projet_marches`).
Tant qu'ils sont dans le repo public, l'enrichissement est **déjà forkable** —
l'IAM sur les datasets de sortie ne suffit pas. Prochaine couche : sortir ces
seeds du repo (source privée / bucket), comme on l'a fait pour `public/data`.

## Rollout prod (à faire délibérément)

Les tags + le macro `generate_schema_name` sont inertes jusqu'au prochain
`dbt run --target prod`, qui matérialise les `enriched` dans `dbt_paris_private_*`.
Étapes coordonnées : (1) `dbt run --target prod` ; (2) IAM `allUsers:dataViewer`
sur les datasets financiers, **rien** sur les `private_*` ; (3) pointer les
scripts d'export d'enrichissement vers les datasets `private_*` ; (4) modal
Provenance : ne pas lier publiquement les tables `enriched` (afficher « privé »).
