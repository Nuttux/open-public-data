# DATA QUALITY — Observations, Limites et Pistes d'Amélioration

> Mis à jour : 2026-02-09
> Ce document recense tous les problèmes, limites et observations liés à la qualité
> des données du Paris Budget Dashboard. Il sert de tracker pour les décisions prises
> et les améliorations futures.

## Table des matières

1. [Vue d'ensemble des sources](#1-vue-densemble-des-sources)
2. [Travaux / Investissements — Problèmes majeurs](#2-travaux--investissements--problèmes-majeurs)
3. [Budget Principal — Notes](#3-budget-principal--notes)
4. [Subventions — Notes](#4-subventions--notes)
5. [Logements Sociaux — Notes](#5-logements-sociaux--notes)
6. [Patrimoine / Dette — Notes](#6-patrimoine--dette--notes)
7. [Pistes d'amélioration](#7-pistes-damélioration)
8. [Décisions prises](#8-décisions-prises)

---

## 1. Vue d'ensemble des sources

| Source | Dataset OpenData | Dernière MAJ | Années | Status |
|--------|-----------------|--------------|--------|--------|
| **Budget Principal (CA)** | `comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement` | 2025-08-26 | 2019-2024 | ✅ À jour |
| **Budget Principal (2018)** | `comptes-administratifs-principaux-2018-m57-ville-departement` | 2019-11-28 | 2018 | ✅ Complet |
| **AP Projets (CA)** | `comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de` | **2019-11-28** | **2018-2022** | ⚠️ **GELÉ** |
| **AP Projets (BV)** | `budgets-votes-autorisations-de-programmes-a-partir-de-2018-m57-ville-departement` | 2020-11-25 | 2018-2022 | ⚠️ **GELÉ** |
| **Budget Voté (BV)** | `budgets-votes-principaux-a-partir-de-2019-*` | ~2025 | 2019-2026 | ✅ À jour |
| **Subventions (CA)** | `subventions-versees-annexe-compte-administratif-*` | ~2025 | 2018-2024 | ⚠️ Partiel |
| **Associations** | `subventions-associations-votees-` | ~2025 | 2018-2024 | ✅ |
| **Logements Sociaux** | `logements-sociaux-finances-a-paris` | ~2025 | 2001-2024 | ✅ |
| **PDF CA IL** | Annexe Investissements Localisés (cdn.paris.fr) | 2025-06 (CA 2024) | 2018-2024 | ✅ |
| **PDF BP IL** | Budget Primitif — Investissements Localisés | 2025 | 2025-2026 | ✅ |

---

## 2. Travaux / Investissements — Problèmes majeurs

### 2.1 Dataset AP OpenData gelé depuis 2022

**Problème** : Le dataset `comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de` n'a pas été mis à jour depuis novembre 2019 (date de `modified`). Il ne contient que les exercices 2018-2022.

**Impact** :
- Aucune donnée AP structurée pour 2023 et 2024 (BigQuery ne peut rien ajouter)
- La page "Explorer" repose uniquement sur les PDFs IL pour 2023-2024
- Les PDFs contiennent ~450 projets/an vs ~2500 dans le dataset AP complet en 2018

**Nombre de records AP par année** (OpenData) :
| Année | Records | Observation |
|-------|---------|-------------|
| 2018 | 2 567 | Dataset initial complet |
| 2019 | 2 044 | -20% |
| 2020 | 1 398 | -31% (COVID ?) |
| 2021 | 941 | -33% |
| 2022 | 516 | -45% — dernière année |
| 2023 | ❌ | Non publié |
| 2024 | ❌ | Non publié |

> **Note** : La baisse intra-dataset (2018→2022) n'est pas expliquée. Elle pourrait refléter
> un changement de périmètre de publication ou un appauvrissement progressif du dataset.

### 2.2 PDF IL — Périmètre partiel

**Problème** : L'Annexe "Investissements Localisés" du Compte Administratif ne couvre qu'une **partie** des dépenses d'investissement : celles qui sont localisables par arrondissement. Le CA lui-même le précise :

> « Certaines opérations n'étant pas localisées, les dépenses détaillées ne représentent qu'une partie de l'effort d'investissement total de la collectivité parisienne. »

**Chiffres (nos extractions PDF)** :

| Année | Projets PDF | Montant PDF | Budget Principal (hors dette) | Couverture |
|-------|-------------|-------------|-------------------------------|------------|
| 2018 | 2 457 | 713 M€ | 1 510 M€ | 47% |
| 2019 | 1 976 | 613 M€ | 1 354 M€ | 45% |
| 2020 | 1 348 | 336 M€ | 1 309 M€ | 26% |
| 2021 | 889 | 260 M€ | 1 575 M€ | 16% |
| 2022 | 459 | 185 M€ | 1 711 M€ | 11% |
| 2023 | 497 | 210 M€ | 1 733 M€ | 12% |
| 2024 | 437 | 235 M€ | ~1 733 M€ | ~14% |

> **Conclusion** : La baisse apparente de 2457→437 projets est un **artefact de la source**,
> pas une baisse réelle de l'investissement parisien. Le Budget Principal montre que l'investissement
> est stable voire en hausse (1,5 Md€ → 1,7 Md€).

### 2.3 Classification `chapitre_libelle` incomplète

**Problème** : Dans les données AP OpenData, le champ équivalent au chapitre fonctionnel est souvent vide ou "Autre" pour les années antérieures à 2024. Les PDFs 2024 incluent des chapitres structurés (Enseignement, Culture, Transports, etc.) mais les anciens PDFs et l'API AP n'ont pas cette classification.

**Impact** : Le breakdown par type de projet (éducation, sport, voirie, etc.) est fiable uniquement pour les données récentes (PDF 2024). Pour les années antérieures, seule l'extraction regex sur le nom du projet (`ode_type_equipement`) permet une classification approchée.

**Taux de classification par année** :
- 2024 (PDF) : ~80% classifiés via `chapitre_libelle`
- 2018-2022 (API AP) : Classification uniquement via regex sur `ap_texte` (~40% classifiables)

### 2.4 Sources alternatives identifiées mais non intégrées

| Source | Contenu | Années | Faisabilité | Priorité |
|--------|---------|--------|-------------|----------|
| **Carte interactive Budget Primitif** (capgeo.sig.paris.fr) | Projets localisés avec coords GPS | 2022-2025 | Moyen (scraping ESRI app) | Basse (budget voté, pas exécuté) |
| **Rapport Financier CA** (PDF) | Vue globale + tableaux consolidés | 2014-2024 | Moyen (extraction PDF) | Basse (déjà couvert par Budget Principal) |
| **Contacter la Ville** pour MAJ dataset AP | AP complet 2023-2024 | 2023-2024 | Incertain (demande administrative) | **Haute** |

---

## 3. Budget Principal — Notes

### 3.1 Qualité globale : ✅ Excellente

Le Budget Principal (CA) est la source la plus fiable et la mieux maintenue. Il couvre 2019-2024 avec ~25k lignes, mise à jour annuelle.

### 3.2 Périmètre 2018

L'année 2018 est dans un dataset séparé (`comptes-administratifs-principaux-2018-m57-ville-departement`) avec une structure identique mais un ID de dataset différent.

### 3.3 Années votées (2025-2026)

Les données votées proviennent de deux sources :
- **OpenData** : `budgets-votes-principaux-a-partir-de-2019-*` (CSV structuré)
- **PDF BP** : Extraits via `extract_pdf_budget_vote.py` (pour les années récentes non encore en open data)

Les deux sont UNIONées dans `stg_pdf_budget_vote` / `core_budget_vote`.

### 3.4 Anti-double comptage

Toutes les requêtes filtrent `type_d_operation_r_o_i_m = 'Réel'` pour exclure les opérations "Pour Ordre" (écritures comptables internes, non des flux réels).

---

## 4. Subventions — Notes

### 4.1 Années 2020-2021 : bénéficiaires manquants

Les datasets subventions pour 2020 et 2021 ne contiennent **pas** les noms de bénéficiaires détaillés. Seuls les montants agrégés par chapitre sont disponibles.

**Impact** : Le treemap par thématique fonctionne, mais la table des bénéficiaires et les analyses par organisme sont impossibles pour ces années.

### 4.2 Classification thématique

La classification des subventions par thématique utilise une cascade :
1. Pattern matching sur le nom (73,9% des montants)
2. LLM Gemini (20,9%)
3. Direction (4,5%)
4. Non classifié (0,5%)

Le taux de 99,5% classifié est satisfaisant.

---

## 5. Logements Sociaux — Notes

### 5.1 Qualité : ✅ Excellente

Le dataset est bien maintenu, géolocalisé nativement (lat/lng fournies par la source), et couvre 2001-2024.

### 5.2 Paris Centre

Les arrondissements 1-4 sont agrégés en "Paris Centre" (`ode_arrondissement_affichage = 0`) dans nos modèles, conformément à la réforme administrative de 2020.

---

## 6. Patrimoine / Dette — Notes

### 6.1 Données de bilan (actif/passif)

Les données de bilan proviennent des tomes 3-5 du Compte Administratif (extraits PDF). Disponibles pour 2020-2024.

### 6.2 Estimation dette 2025-2026

Aucun bilan n'est disponible pour les années votées (2025-2026). La dette financière est **estimée** par projection :

```
dette(N) = dette(N-1) + emprunts(N) - remboursement_principal(N)
```

Avec comme ancrage le dernier bilan audité (2024). Cette estimation est signalée visuellement (barres en pointillés, opacité réduite) et expliquée dans un encart.

### 6.3 Ratios prudentiels

Les seuils de durée de désendettement (< 10 ans = sain, 10-15 = vigilance, > 15 = critique) proviennent de la **grille CRC / Cour des comptes**. Ce sont des normes techniques de finances publiques, pas des jugements politiques. La source est indiquée dans le composant.

---

## 7. Pistes d'amélioration

### 7.1 Priorité haute

| # | Action | Impact attendu | Effort |
|---|--------|---------------|--------|
| 1 | **Contacter OpenData Paris** pour demander la MAJ du dataset AP (2023-2024+) | Récupérer ~2000 projets/an avec détail AP | Faible (email) |
| 2 | **NLP/regex sur noms de projets AP** pour classifier les `chapitre_libelle` manquants | Améliorer le breakdown par type (éducation, sport, voirie...) | Moyen |
| 3 | **Intégrer Budget Principal** pour les tendances globales d'investissement | ✅ **FAIT** — `investissement_tendances.json` | — |

### 7.2 Priorité moyenne

| # | Action | Impact attendu | Effort |
|---|--------|---------------|--------|
| 4 | Scraper la carte interactive Budget Primitif (capgeo.sig.paris.fr) | Projets localisés pour 2023-2025 (voté) | Moyen |
| 5 | Ajouter un disclaimer visible quand le périmètre PDF < 20% du total | Transparence pour l'utilisateur | Faible |
| 6 | Croiser PDF IL avec AP OpenData (2018-2022) pour mesurer le taux de recouvrement exact | Mieux comprendre l'écart de périmètre | Moyen |

### 7.3 Priorité basse

| # | Action | Impact attendu | Effort |
|---|--------|---------------|--------|
| 7 | Parser les tomes 3-5 du CA pour enrichir les données de bilan | Plus d'années de patrimoine | Élevé |
| 8 | Automatiser la détection de nouveaux PDFs CA sur cdn.paris.fr | Mise à jour automatique chaque été | Moyen |

---

## 8. Décisions prises

### 2026-02-09 — Tendances Travaux via Budget Principal (Option C)

**Contexte** : Le dataset AP étant gelé à 2022, les tendances sur la page Travaux étaient impossibles avec les données granulaires (projets individuels). Le nombre de projets baissait artificiellement d'année en année.

**Décision** : Utiliser le Budget Principal (CA) pour les tendances globales d'investissement par chapitre fonctionnel. Ce dataset couvre 2019-2024, est bien maintenu, et donne le montant **total réel** d'investissement (contrairement aux PDF IL qui n'en couvrent que 10-47%).

**Résultat** :
- Nouveau fichier `investissement_tendances.json` généré depuis l'API OpenData Paris
- Stacked bar chart par chapitre fonctionnel dans l'onglet "Tendances"
- Disclaimer expliquant la différence de périmètre avec l'onglet "Explorer"

### 2026-02-06 — Estimation dette 2025-2026

**Décision** : Estimer la dette financière pour les années votées par projection (encours + emprunts - remboursements). Signaler visuellement et textuellement l'estimation.

### 2026-02-06 — Suppression badges "Voté" des KPI cards

**Décision** : Les badges "VOTÉ *" sur chaque KPI card étaient trop invasifs. Remplacés par un bandeau unique `DataQualityBanner` en haut de page.

### 2026-02-05 — Source des seuils de dette

**Décision** : Ajouter la mention "Réf. : grille CRC / Cour des comptes" dans les tooltips et encarts de la section dette, pour clarifier que les seuils ne sont pas des jugements éditoriaux mais des normes techniques.

---

## Annexe — URLs des PDFs Investissements Localisés

| Année | Type | URL |
|-------|------|-----|
| 2024 | CA | `https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF` |
| 2023 | CA | `https://cdn.paris.fr/paris/2024/07/03/ca-2023-investissements-localises-tJO3.pdf` |
| 2022 | CA | `https://cdn.paris.fr/paris/2023/07/05/09-ca-2022-investissements-localises-3owH.pdf` |
| 2021 | CA | `https://cdn.paris.fr/paris/2022/06/28/0d712de76bf95015e948204164b17823.pdf` |
| 2020 | CA | `https://cdn.paris.fr/paris/2021/06/29/77cdc4ae35e532f18323707de79fa49a.pdf` |
| 2019 | CA | `https://cdn.paris.fr/paris/2020/07/24/a553a4550362175f3d609b65a5998072.pdf` |
| 2025 | BP | `https://cdn.paris.fr/paris/.../bp-2025-editique-il-Yt2X.pdf` |
