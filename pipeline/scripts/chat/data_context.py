"""Contexte sémantique des datasets — injecté dans le system prompt pour guider Claude.

Inspiré de l'idée "semantic layer" (Dot, dbt) : décrire explicitement
ce que contient chaque dataset, sa granularité, ses pièges, et les synonymes
utilisateur → dataset. Évite que le modèle parte chercher au mauvais endroit
ou invente des champs qui n'existent pas.
"""

DATA_CONTEXT = """# Contexte des données disponibles

Toutes les données viennent de la Ville de Paris (open data Paris, comptes administratifs, délibérations, dbt marts internes au projet). Périmètre = Ville + Département de Paris (collectivité unique depuis 2019, M57).

## Datasets

### 1. SUBVENTIONS — `subventions/beneficiaires_<year>.json`
- **Granularité** : 1 ligne = 1 bénéficiaire agrégé sur l'année (montant total + nb de subventions reçues).
- **Années dispo** : 2018, 2019, 2022, 2023, 2024 (trous : 2020-2021).
- **Champs clés** : `beneficiaire`, `nature_juridique` (Association / Établissement public / Société / etc.), `thematique` (classification LLM), `sous_categorie`, `montant_total`, `nb_subventions`.
- **À utiliser pour** : "qui reçoit combien", top bénéficiaires, recherche par nom d'asso/établissement, totaux par thématique, comparaison inter-années.
- **Ne contient PAS** : le détail subvention par subvention (date, objet précis), les bénéficiaires hors Ville (État, Région, autres collectivités).
- **Piège** : les plus gros bénéficiaires sont des établissements publics rattachés (CASVP, Paris Musées, Paris Habitat) — ce sont des "subventions internes" qui financent l'action sociale, la culture, le logement social. Ne pas les confondre avec des subventions à des tiers privés/associatifs.

### 2. SUBVENTIONS — TENDANCES — `subventions/subventions_tendances.json`
- **Granularité** : 1 ligne par année avec totaux + ventilation par thématique.
- **Années** : 2018-2024 (mêmes trous).
- **À utiliser pour** : évolution annuelle des subventions, parts par thématique dans le temps.

### 3. MARCHÉS PUBLICS — `marches-publics/marches_<year>.json`
- **Granularité** : 1 ligne = 1 marché notifié dans l'année.
- **Années dispo** : 2013-2024 (continu).
- **Champs clés** : `objet`, `nature` (TRAVAUX / SERVICES / FOURNITURES), `fournisseur_nom`, `fournisseur_siret`, `montant_min`, `montant_max`, `date_notification`, `duree_jours`.
- **PIÈGE CRITIQUE** : `montant_max` = **enveloppe contractuelle pluriannuelle (plafond)**, PAS une dépense annuelle. Un marché de 140 M€ notifié en 2024 peut courir 4 ans. Toujours le préciser quand on cite ces montants.
- **À utiliser pour** : qui sont les fournisseurs de la Ville, recherche par mot-clé (ex: "informatique", "voirie", "consultant"), top contrats par enveloppe.
- **Ne contient PAS** : ce qui a été réellement dépensé / facturé sur le marché (juste l'enveloppe).
- **Piège bis** : "MARCHE MULTIATTRIBUTAIRE" comme fournisseur = accord-cadre avec plusieurs titulaires non détaillés.

### 4. MARCHÉS — TENDANCES — `marches-publics/marches_tendances.json`
- **Granularité** : 1 ligne par année avec enveloppe totale + ventilation par nature.
- **À utiliser pour** : évolution du volume de commande publique, mix travaux/services/fournitures.

### 5. BUDGET — SANKEY — `budget_sankey_<year>.json`
- **Granularité** : flux Sankey recettes → dépenses agrégés par grand poste.
- **Années** : 2019-2026 (2019-2024 exécuté, 2025-2026 voté).
- **Champs clés** : `totals` (recettes/dépenses/solde), `nodes`, `links` (source/target/value), `dataStatus` (COMPLET/PARTIEL), `type_budget` ("execute" ou "vote").
- **À utiliser pour** : "combien dépense Paris en X", "d'où vient l'argent", grandes masses budgétaires.
- **Distinction importante** : voté (BP) ≠ exécuté (CA). 2025-2026 sont prévisionnels.

### 6. BUDGET — INDEX — `budget_index.json`
- Liste les années dispo, leur statut (voté/exécuté), et marque les années PARTIEL vs COMPLET (2023-2024 sont partiels — il manque arrondissements/AP/CP).

### 7. BILAN PATRIMONIAL — `bilan_index.json` + (à venir : `bilan_<year>.json`)
- **Granularité** : actif / passif au 31/12 de chaque année.
- **Années** : 2019-2024.
- **À utiliser pour** : patrimoine total de la collectivité, fonds propres, dettes long terme.

### 8. PATRIMOINE STRUCTURE DETTE — `patrimoine_structure_<year>.json`
- **Granularité** : décomposition de la dette financière par instrument (obligataire, bancaire, Schuldschein, etc.).
- **Années** : 2019-2024.
- **Champs** : `total_dette_financiere`, `instruments[]` avec `label`, `encours`, `tag`, `description`.
- **À utiliser pour** : "combien Paris doit", structure de financement, notation.

### 9. HORS-BILAN — `hors_bilan_<year>.json`
- **Granularité** : garanties d'emprunt accordées par la Ville à des tiers (essentiellement bailleurs sociaux).
- **Années** : 2019-2024.
- **À utiliser pour** : engagements hors-bilan, exposition garanties logement social.
- **Ne pas confondre avec** : la dette directe de la Ville (cf patrimoine_structure).

### 10. INVESTISSEMENTS — `investissement_tendances.json`
- **Granularité** : dépenses d'investissement réel par chapitre fonctionnel et par année.
- **À utiliser pour** : "combien Paris investit", évolution de l'investissement, ventilation par fonction (sport, culture, voirie…).
- **Périmètre** : Budget Principal, hors dette/dotations.

### 11. ÉVOLUTION BUDGET — `evolution_budget.json`
- Métriques financières d'évolution (recettes/dépenses, soldes, ratios) sur la durée.
- À utiliser pour les questions "qu'est-ce qui a évolué dans le budget".

### 12. VOTE vs EXÉCUTION — `vote_vs_execute.json`
- Comparaison Budget Voté (BP, PDFs Éditique) vs Exécuté (CA, open data).
- À utiliser pour "ce qui a été voté est-il dépensé", écarts de prévision.

## Glossaire utilisateur → bon dataset

- "associations" / "qui reçoit des aides" → SUBVENTIONS
- "fournisseurs" / "appels d'offres" / "contrats" / "consultants" → MARCHÉS
- "budget total" / "recettes" / "dépenses" / "d'où vient l'argent" → BUDGET SANKEY
- "dette" / "emprunt" → PATRIMOINE STRUCTURE DETTE
- "garanties" / "bailleurs sociaux" (côté garanties) → HORS-BILAN
- "investissements" / "équipements" / "construction" → INVESTISSEMENTS (pour les flux annuels) ou MARCHÉS (pour les contrats individuels)
- "patrimoine" / "actif / passif" → BILAN
- "voté vs réel" / "ce qui était prévu" → VOTE_VS_EXECUTE

## Termes à clarifier avec l'utilisateur si la question est ambiguë
- "Combien Paris dépense pour X" → c'est le **budget exécuté** (chapitre fonctionnel), PAS la somme des subventions ni des marchés (ce sont des sous-ensembles).
- "Argent donné à X" → subventions (X = asso/EP) ou marchés (X = entreprise) selon le contexte.
- "Dépenses de fonctionnement vs investissement" → budget Sankey distingue les deux.

## Périmètres temporels et géographiques
- Toutes les données = **Ville + Département de Paris** (collectivité unique M57 depuis 2019).
- Avant 2019, certaines séries n'existent pas (notamment patrimoine, bilan, investissements M57).
- 2025-2026 = budget voté uniquement (prévisionnel, pas exécuté).
"""
