# ARCHITECTURE FRONTEND - PARIS BUDGET DASHBOARD

> Mis à jour le 2026-02-06. Refonte UX : architecture par entité avec tabs consistants.

## Table des matières

1. [Principes UX](#1-principes-ux)
2. [Architecture par entité](#2-architecture-par-entité)
3. [Pages et tabs](#3-pages-et-tabs)
4. [Composants partagés](#4-composants-partagés)
5. [Gestion des données](#5-gestion-des-données)
6. [Design system](#6-design-system)
7. [Roadmap](#7-roadmap)

---

## 1. Principes UX

### 1.1 Objectif

> Permettre à un citoyen parisien de comprendre en 30 secondes où va l'argent de sa ville.

### 1.2 Principes

| Principe | Détail |
|----------|--------|
| **Consistance** | Chaque entité suit le même pattern de tabs (Tendances → Annuel → Carte/Explorer) |
| **Progressive disclosure** | Vue macro → drill-down → détail |
| **Transparence** | Badge obligatoire sur données non-exécutées (Voté, Estimé), warnings qualité |
| **Mobile-first** | Responsive, touch-friendly, navigation bottom bar |
| **Static Data First** | JSON pré-calculés, pas d'API live |

### 1.3 Stack technique

| Technologie | Version | Usage |
|-------------|---------|-------|
| Next.js | 16 | Framework React (App Router) |
| React | 19 | UI Library |
| TypeScript | 5.x | Typage |
| Tailwind CSS | 4 | Styling |
| ECharts | 5.x | Graphiques (Sankey, Treemap, Line, Bar) |
| echarts-for-react | 3.x | Wrapper React ECharts |
| Leaflet | 1.9 | Cartes interactives |

---

## 2. Architecture par entité

### 2.1 Problème de l'ancienne architecture

Les pages étaient organisées par **type de visualisation** (Sankey, Évolution, Carte, Prévision...), ce qui forçait l'utilisateur à naviguer entre 3-4 pages pour comprendre un seul sujet. La dette était dans /evolution, le bilan dans /bilan, etc.

### 2.2 Nouvelle architecture : tabs par entité

Chaque entité de données = une page avec des tabs internes suivant un pattern consistant :

```
Entité
  ├── Tab "Tendances"     → évolution multi-années, moyennes, variations
  ├── Tab "Annuel"        → détail d'une année (Sankey, Donut, table...)
  ├── Tab "Carte"         → seulement si données géolocalisées
  └── Tab "Explorer"      → table/liste filtrable, search
```

### 2.3 Vue d'ensemble

```
NAVBAR (6 items) :
  Budget | Patrimoine | Subventions | Investissements | Logements | Blog

/budget            → Tendances | Annuel (2019-2026) | Prévision
/patrimoine        → Tendances | Annuel
/subventions       → Tendances | Annuel | Explorer
/investissements   → Tendances | Annuel | Carte | Explorer
/logements         → Tendances | Annuel | Carte | Explorer
/blog              → Articles
```

### 2.4 Mapping ancien → nouveau

| Ancienne route | Nouvelle destination |
|---------------|---------------------|
| `/budget` | `/budget?tab=annuel` |
| `/evolution` | `/budget?tab=tendances` (redirect) |
| `/prevision` | `/budget?tab=prevision` (redirect) |
| `/bilan` | `/patrimoine?tab=annuel` (redirect) |
| `/carte` | `/logements?tab=carte` (redirect) |
| `/subventions` | `/subventions` (inchangé) |
| `/investissements` | `/investissements` (inchangé) |

---

## 3. Pages et tabs

### 3.1 `/budget` — Budget de la Ville

| Tab | Contenu | Source données |
|-----|---------|---------------|
| **Tendances** | Line chart R/D, YoY cards, variations par thématique, filtre plage d'années (hors COVID) | `evolution_budget.json` |
| **Annuel** | Sankey + Donut + KPIs, sélecteur 2019-2026, disclaimer voté pour 2025-2026 | `budget_sankey_{year}.json` |
| **Prévision** | Vote vs Exécuté, taux d'exécution, écart ranking, estimations 2025-2026 | `vote_vs_execute.json` |

**Comportement clé — Annuel 2025-2026** :
- YearSelector inclut 2025 et 2026
- Quand année ≥ 2025 : bannière orange + BudgetTypeBadge "Voté" sur tous les montants
- Texte disclaimer : "Budget prévisionnel. Hors COVID, l'écart-type avec l'exécuté est de ±X%."
- Les données Sankey proviennent de `core_budget_vote` (mêmes chapitres fonctionnels)

**Comportement clé — Prévision** :
- YearRangeSelector pour choisir les années de comparaison (exclure COVID)
- EcartRanking filtre dynamiquement selon les années sélectionnées

### 3.2 `/patrimoine` — État patrimonial & dette

| Tab | Contenu | Source données |
|-----|---------|---------------|
| **Tendances** | Évolution dette (emprunts, remboursement, intérêts), épargne brute, surplus/déficit | `evolution_budget.json` (métriques dette) |
| **Annuel** | Sankey Actif/Passif + KPIs (actif net, fonds propres, ratio endettement) | `bilan_sankey_{year}.json` |

### 3.3 `/subventions` — Bénéficiaires

| Tab | Contenu | Source données |
|-----|---------|---------------|
| **Tendances** | Évolution montant total + nb bénéficiaires par année | À créer (agrégation `subventions/index.json`) |
| **Annuel** | Treemap par thématique + stats | `subventions/treemap_{year}.json` |
| **Explorer** | Table filtrable (thématique, direction, nature juridique, recherche) | `subventions/beneficiaires_{year}.json` |

Pas de tab Carte : les subventions vont à des organisations, pas des lieux.

### 3.4 `/investissements` — Projets d'investissement (AP)

| Tab | Contenu | Source données |
|-----|---------|---------------|
| **Tendances** | Évolution montants AP par thématique/année | À créer |
| **Annuel** | Top projets, stats par arrondissement | Existant |
| **Carte** | Carte Leaflet avec markers géolocalisés | Existant |
| **Explorer** | Table filtrable tous projets | Existant (vue liste) |

### 3.5 `/logements` — Logements sociaux financés

| Tab | Contenu | Source données |
|-----|---------|---------------|
| **Tendances** | Évolution production logements par année/arrondissement | À créer |
| **Annuel** | Top bailleurs + stats arrondissement | Existant (ex-`/carte`) |
| **Carte** | Carte choroplèthe | Existant (ex-`/carte`) |
| **Explorer** | Table filtrable tous logements | À créer |

---

## 4. Composants partagés

### 4.1 Infrastructure tabs

| Composant | Description |
|-----------|-------------|
| `TabBar` | Segmented control générique. Props: `tabs[]`, `activeTab`, `onChange`. Scroll horizontal mobile si > 4 tabs. |
| `useTabState(default)` | Hook : state tab actif + sync URL `?tab=xxx` via `useSearchParams()`. Permet liens directs. |
| `PageHeader` | Header entité : icône + titre + description + badges coverage. |

### 4.2 Badges et warnings

| Composant | Description |
|-----------|-------------|
| `BudgetTypeBadge` | Badge `Exécuté` (bleu) / `Voté` (orange) / `Estimé` (gris). Apparaît à côté de TOUT montant non-exécuté. |
| `DataQualityBanner` | Bannière contextuelle (warning/info) selon `data_availability.json`. |

**Règle UX badges** :
- 2019-2024 exécuté : pas de badge (défaut)
- 2025-2026 voté : badge orange "Voté" OBLIGATOIRE + bannière disclaimer
- Estimations : badge gris "Estimé" avec tooltip

### 4.3 Sélecteurs

| Composant | Description |
|-----------|-------------|
| `YearSelector` | Sélection d'une année. Étendu à 2019-2026. Indicateur visuel vote/exécuté. |
| `YearRangeSelector` | Multi-select années pour vues Tendances. Preset "Hors COVID (excl. 2020-2021)". |

### 4.4 Composants par domaine

**Budget** : `BudgetSankey`, `NatureDonut`, `StatsCards`, `DrilldownPanel`, `EvolutionChart`, `FinancialHealthChart`, `VariationRankChart`, `YoyCards`, `ExecutionRateCards`, `ExecutionRateChart`, `EcartRanking`, `EstimationSummary`, `DetailThematiqueTable`

**Patrimoine** : `BilanSankey`, `DetteEvolutionChart` (à créer)

**Subventions** : `SubventionsTreemap`, `SubventionsFilters`, `SubventionsTable`

**Carte** : `ParisMap`, `MapFilters`, `ChoroplethLayer`, `InvestissementsMap`, `LogementsSociauxMap`

### 4.5 Hiérarchie des pages

```
app/
├── layout.tsx → Navbar (6 items)
│
├── budget/page.tsx
│   ├── TabBar (Tendances | Annuel | Prévision)
│   ├── [Tendances] EvolutionChart, YoyCards, VariationRankChart, YearRangeSelector
│   ├── [Annuel]    YearSelector, BudgetTypeBadge, StatsCards, BudgetSankey/NatureDonut
│   └── [Prévision] ExecutionRateCards, VoteVsExecuteChart, EcartRanking, EstimationSummary
│
├── patrimoine/page.tsx
│   ├── TabBar (Tendances | Annuel)
│   ├── [Tendances] FinancialHealthChart, DetteEvolutionChart
│   └── [Annuel]    YearSelector, BilanSankey, BilanStatsCards
│
├── subventions/page.tsx
│   ├── TabBar (Tendances | Annuel | Explorer)
│   ├── [Tendances] SubventionsEvolutionChart (à créer)
│   ├── [Annuel]    YearSelector, SubventionsTreemap
│   └── [Explorer]  YearSelector, SubventionsFilters, SubventionsTable
│
├── investissements/page.tsx
│   ├── TabBar (Tendances | Annuel | Carte | Explorer)
│   ├── [Tendances] InvestissementsEvolutionChart (à créer)
│   ├── [Annuel]    YearSelector, TopProjets, StatsArrondissement
│   ├── [Carte]     InvestissementsMap
│   └── [Explorer]  Table filtrable
│
├── logements/page.tsx
│   ├── TabBar (Tendances | Annuel | Carte | Explorer)
│   ├── [Tendances] LogementsEvolutionChart (à créer)
│   ├── [Annuel]    TopBailleurs, StatsArrondissement
│   ├── [Carte]     LogementsSociauxMap, ChoroplethLayer
│   └── [Explorer]  Table filtrable (à créer)
│
└── blog/page.tsx
```

---

## 5. Gestion des données

### 5.1 Fichiers JSON statiques (`/public/data/`)

| Fichier | Taille | Contenu |
|---------|--------|---------|
| `budget_index.json` | ~1 KB | Années 2019-2026, `type_par_annee` (execute/vote) |
| `budget_sankey_{year}.json` | ~50 KB | Nodes + Links Sankey + drilldown, champ `type_budget` |
| `budget_nature_{year}.json` | ~10 KB | Répartition par nature comptable (Donut) |
| `evolution_budget.json` | ~30 KB | Totaux, métriques dette, variations par thématique |
| `vote_vs_execute.json` | ~65 KB | Taux exécution, écart ranking, estimations, détail thématique |
| `bilan_sankey_{year}.json` | ~30 KB | Actif/Passif pour BilanSankey |
| `subventions/index.json` | ~2 KB | Années, filtres, totaux |
| `subventions/treemap_{year}.json` | ~10 KB | Agrégations par thématique |
| `subventions/beneficiaires_{year}.json` | ~500 KB | Liste complète bénéficiaires |
| `map/investissements_*.json` | ~200 KB | Projets AP géolocalisés |
| `map/logements_sociaux.json` | ~100 KB | Logements géolocalisés |
| `map/arrondissements_stats.json` | ~5 KB | Stats per capita |
| `data_availability.json` | ~2 KB | Warnings par dataset/année |

### 5.2 Métadonnées type_budget

Chaque JSON avec des montants inclut un champ `type_budget`:

```json
{
  "annee": 2025,
  "type_budget": "vote",
  "disclaimer": "Budget prévisionnel voté par le Conseil de Paris."
}
```

Le frontend lit ce champ pour afficher les badges et disclaimers.

---

## 6. Design system

### 6.1 Règle fondamentale

> **Une couleur = Un concept, partout dans l'app.**

"Éducation" est TOUJOURS bleu (#3b82f6), dans le Sankey, le Treemap, la carte et les tables.

### 6.2 Palette thématiques

| Thématique | Couleur | Hex |
|------------|---------|-----|
| Éducation | Blue | `#3b82f6` |
| Culture & Sport | Purple | `#a855f7` |
| Action Sociale | Pink | `#ec4899` |
| Sécurité | Red | `#ef4444` |
| Transports | Amber | `#f59e0b` |
| Environnement | Green | `#22c55e` |
| Aménagement | Cyan | `#06b6d4` |
| Économie | Orange | `#f97316` |
| Santé | Teal | `#14b8a6` |
| Administration | Slate | `#64748b` |
| Dette | Yellow | `#eab308` |

### 6.3 Palette flux et statuts

| Concept | Couleur |
|---------|---------|
| Recettes | Emerald `#10b981` |
| Dépenses | Purple `#a855f7` |
| Solde positif | Emerald |
| Solde négatif | Red `#ef4444` |
| Badge Exécuté | Blue `#3b82f6` |
| Badge Voté | Orange `#f97316` |
| Badge Estimé | Slate `#64748b` |

### 6.4 Responsive

| Breakpoint | Usage |
|------------|-------|
| `sm:` (640px) | Mobile landscape |
| `md:` (768px) | Tablet, bascule nav top/bottom |
| `lg:` (1024px) | Desktop |

- **Desktop** : hover tooltips, légendes latérales
- **Mobile** : tap pour détails, drawers/modals, légendes en bas, tabs scroll horizontal
- **Animations** : 300ms max, respecter `prefers-reduced-motion`

---

## 7. Roadmap

> Contexte : Élections municipales Paris 15-22 mars 2026.

### Phase 0 — Data Foundation (pipeline) ~2h

| Tâche | Détail |
|-------|--------|
| Exporter Sankey 2025-2026 | `export_sankey_vote.py` → `budget_sankey_2025.json`, `budget_sankey_2026.json` depuis `core_budget_vote` |
| Ajouter `type_budget` aux JSON | `"type_budget": "execute"` (2019-2024) et `"vote"` (2025-2026) |
| Mettre à jour `budget_index.json` | Inclure 2025-2026, champ `year_types` |
| Stats hors-COVID | Taux exécution moyen excluant 2020-2021 dans `vote_vs_execute.json` |

### Phase 1 — Infrastructure Tabs ~1h

| Tâche | Détail |
|-------|--------|
| `TabBar.tsx` | Composant générique, responsive, scroll horizontal mobile |
| `useTabState(default)` | Hook state + sync `?tab=xxx` URL |
| `PageHeader.tsx` | Header partagé (icône, titre, badges) |
| `BudgetTypeBadge.tsx` | Badge Execute/Voté/Estimé |
| `YearRangeSelector.tsx` | Multi-select années + preset "Hors COVID" |

### Phase 2 — Page `/budget` (refonte majeure) ~4h

| Tâche | Détail |
|-------|--------|
| Tab Tendances | Migrer EvolutionChart, YoyCards, VariationRankChart depuis /evolution |
| Tab Annuel | Étendre YearSelector à 2025-2026, disclaimer voté, BudgetTypeBadge |
| Tab Prévision | Migrer composants /prevision, ajouter filtre années (excl. COVID) |
| Supprimer /evolution, /prevision | Redirections → `/budget?tab=tendances` et `?tab=prevision` |

### Phase 3 — Page `/patrimoine` ~2h

| Tâche | Détail |
|-------|--------|
| Tab Tendances | Extraire FinancialHealthChart + dette depuis /evolution |
| Tab Annuel | Migrer BilanSankey depuis /bilan |
| Supprimer /bilan | Redirection → `/patrimoine?tab=annuel` |

### Phase 4 — Autres entités ~3h

| Tâche | Détail |
|-------|--------|
| /subventions | Ajouter tabs Tendances + Explorer (table = existant, treemap = existant) |
| /investissements | Consolider avec tab Carte + Explorer, ajouter Tendances |
| /logements | Restructurer /carte en tabs, ajouter Tendances + Explorer |
| Supprimer /carte | Redirection → `/logements?tab=carte` |

### Phase 5 — Navigation + Landing ~1h

| Tâche | Détail |
|-------|--------|
| Simplifier Navbar | 6 items : Budget, Patrimoine, Subventions, Investissements, Logements, Blog |
| Redirections Next.js | `/evolution`, `/prevision`, `/bilan`, `/carte` → nouvelles routes |
| Mettre à jour landing | Adapter questions citoyennes aux nouvelles URLs |

### Calendrier cible

```
Semaine 1 (6-12 fév)  : Phase 0 + 1 (data + infra) ← ON EST ICI
Semaine 2 (13-19 fév) : Phase 2 (refonte /budget)
Semaine 3 (20-26 fév) : Phase 3 + 4 (patrimoine + autres entités)
Semaine 4 (27 fév-5 mars) : Phase 5 (nav + polish)
15 mars : Élections Tour 1
```
