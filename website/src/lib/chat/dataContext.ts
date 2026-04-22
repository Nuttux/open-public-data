// Synced from pipeline/scripts/chat/data_context.py — keep in sync if you edit either.
export const DATA_CONTEXT = `# Contexte des données disponibles

Toutes les données viennent de la Ville de Paris (open data Paris, comptes administratifs, délibérations, dbt marts internes au projet). Périmètre = Ville + Département de Paris (collectivité unique depuis 2019, M57).

## Datasets

### 1. SUBVENTIONS — beneficiaires_<year>.json
- Granularité : 1 ligne = 1 bénéficiaire agrégé sur l'année (montant total + nb subventions).
- Années : 2018, 2019, 2022, 2023, 2024 (trous : 2020-2021).
- Champs : beneficiaire, nature_juridique, thematique, sous_categorie, montant_total, nb_subventions.
- Pour : qui reçoit combien, top, recherche par nom, totaux par thématique.
- PAS pour : détail subvention par subvention, bénéficiaires hors Ville.
- Piège : top bénéficiaires = établissements publics rattachés (CASVP, Paris Musées, Paris Habitat) — "subventions internes".

### 2. SUBVENTIONS TENDANCES — subventions_tendances.json
- 1 ligne par année avec totaux + ventilation par thématique.
- Années : 2018-2024.
- À PRÉFÉRER pour "quels secteurs", "par thématique", "par domaine".

### 3. MARCHÉS PUBLICS — marches_<year>.json
- 1 ligne = 1 marché notifié dans l'année.
- Années : 2013-2024 (continu).
- Champs : objet, nature (TRAVAUX/SERVICES/FOURNITURES), fournisseur_nom, montant_min, montant_max, date_notification.
- PIÈGE CRITIQUE : montant_max = enveloppe contractuelle PLURIANNUELLE (plafond), PAS dépense annuelle. Toujours préciser quand on cite.
- Pour : fournisseurs, recherche par mot-clé, top contrats.
- PAS pour : ce qui a été réellement dépensé / facturé.

### 4. MARCHÉS TENDANCES — marches_tendances.json
- Évolution annuelle + ventilation par nature.

### 5. BUDGET SANKEY — budget_sankey_<year>.json
- Flux Sankey recettes → dépenses agrégés.
- Années 2019-2026 (2019-2024 exécuté, 2025-2026 voté).
- Pour : "combien Paris dépense en X" (grandes masses), "d'où vient l'argent".
- Distinction : voté (BP) ≠ exécuté (CA).

### 6. BUDGET INDEX — budget_index.json
- Liste années + statut (voté/exécuté), marque PARTIEL vs COMPLET.

### 7. BILAN PATRIMONIAL — bilan_index.json
- Actif/passif au 31/12. Années 2019-2024.

### 8. PATRIMOINE STRUCTURE DETTE — patrimoine_structure_<year>.json
- Décomposition de la dette par instrument (obligataire, bancaire, etc.). Années 2019-2024.
- Pour : "combien Paris doit", structure de financement.

### 9. HORS-BILAN — hors_bilan_<year>.json
- Garanties d'emprunt accordées (essentiellement bailleurs sociaux). Années 2019-2024.
- Ne pas confondre avec la dette directe.

### 10. INVESTISSEMENTS — investissement_tendances.json
- Investissement réel par chapitre fonctionnel par an (Budget Principal, hors dette/dotations).

### 11. ÉVOLUTION BUDGET — evolution_budget.json
- Métriques d'évolution budget sur la durée.

### 12. VOTE vs EXÉCUTION — vote_vs_execute.json
- Comparaison BP voté vs CA exécuté.

## Glossaire utilisateur → bon dataset
- "associations" / "qui reçoit des aides" → SUBVENTIONS
- "fournisseurs" / "appels d'offres" / "contrats" / "consultants" → MARCHÉS
- "budget total" / "recettes" / "dépenses" / "d'où vient l'argent" → BUDGET SANKEY
- "dette" / "emprunt" → PATRIMOINE STRUCTURE DETTE
- "garanties" / "bailleurs sociaux" (côté garanties) → HORS-BILAN
- "investissements" / "équipements" → INVESTISSEMENTS ou MARCHÉS
- "patrimoine" / "actif passif" → BILAN
- "voté vs réel" → VOTE_VS_EXECUTE

## Termes à clarifier si ambigus
- "Combien Paris dépense pour X" → budget exécuté (chapitre fonctionnel), PAS somme subv+marchés.
- "Argent donné à X" → subventions (asso/EP) ou marchés (entreprise) selon contexte.

## Périmètres
- Ville + Département de Paris (M57 depuis 2019). Avant 2019 certaines séries n'existent pas.
- 2025-2026 = budget voté uniquement (prévisionnel).
`;
