# ARCHITECTURE FRONTEND - PARIS BUDGET DASHBOARD

## Table des matières

1. [État actuel](#1-état-actuel)
2. [Vision cible](#2-vision-cible)
3. [Pages et navigation](#3-pages-et-navigation)
4. [Composants](#4-composants)
5. [Gestion des données](#5-gestion-des-données)
6. [Qualité et warnings](#6-qualité-et-warnings)
7. [Design system](#7-design-system)
8. [Roadmap d'implémentation](#8-roadmap-dimplémentation)

---

## 1. État actuel

### 1.1 Stack technique

| Technologie | Version | Usage |
|-------------|---------|-------|
| Next.js | 16 | Framework React (App Router) |
| React | 19 | UI Library |
| TypeScript | 5.x | Typage |
| Tailwind CSS | 4 | Styling |
| ECharts | 5.x | Graphiques (Sankey, Treemap) |
| Leaflet | 1.9 | Cartes interactives |
| react-leaflet | 4.x | Wrapper React pour Leaflet |

### 1.2 Structure actuelle

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx              # ✅ Home - Sankey budget
│   │   ├── carte/page.tsx        # ✅ Carte - Investissements + Logements
│   │   └── layout.tsx            # Layout global avec Navbar
│   │
│   ├── components/
│   │   ├── BudgetSankey.tsx      # ✅ Diagramme Sankey ECharts
│   │   ├── DrilldownPanel.tsx    # ✅ Panel drill-down Sankey
│   │   ├── StatsCards.tsx        # ✅ Cartes KPI
│   │   ├── YearSelector.tsx      # ✅ Sélecteur d'année
│   │   ├── Navbar.tsx            # ✅ Navigation globale
│   │   └── map/
│   │       ├── ParisMap.tsx      # ✅ Carte Leaflet
│   │       ├── MapFilters.tsx    # ✅ Filtres carte
│   │       └── ChoroplethLayer.tsx # ✅ Choroplèthe
│   │
│   ├── lib/
│   │   ├── api/staticData.ts     # ✅ Loaders JSON statiques
│   │   ├── colors.ts             # ✅ Palettes de couleurs
│   │   ├── formatters.ts         # ✅ Formatage montants/nombres
│   │   ├── types/map.ts          # ✅ Types TypeScript
│   │   └── constants/            # ✅ Données statiques
│   │
├── public/data/                  # ✅ JSON pré-calculés
│   ├── budget_sankey_{year}.json
│   ├── subventions/
│   │   ├── treemap_{year}.json
│   │   └── beneficiaires_{year}.json
│   └── map/
│       ├── investissements_{year}.json
│       └── logements_{year}.json
```

### 1.3 Pages existantes

| Route | Nom | Status | Description |
|-------|-----|--------|-------------|
| `/` | Budget Sankey | ✅ Fonctionnel | Diagramme flux + drill-down + KPIs |
| `/carte` | Carte Paris | ✅ Fonctionnel | Investissements AP + Logements sociaux |

### 1.4 Gaps identifiés

| Fonctionnalité | Status | Priorité |
|----------------|--------|----------|
| Page Subventions (Treemap + Table) | ❌ Manquant | **P1** |
| Page Évolution temporelle | ❌ Manquant | P2 |
| Warnings qualité données | ⚠️ Partiel | **P1** |
| Paris Centre (arr 1-4 agrégés) | ❌ Manquant | P2 |
| Filtres avancés subventions | ❌ Manquant | P2 |
| Export PDF/CSV | ❌ Manquant | P3 |
| Mode mobile optimisé | ⚠️ Partiel | P3 |

---

## 2. Vision cible

### 2.1 Objectif UX

> **"Permettre à un citoyen parisien de comprendre en 30 secondes où va l'argent de sa ville."**

Principes:
1. **Progressive disclosure** - Vue macro → drill-down détaillé
2. **Mobile-first** - Responsive, touch-friendly
3. **Transparence** - Toujours afficher la source et la qualité des données
4. **Rapidité** - Chargement < 2s, navigation instantanée

### 2.2 Architecture cible (4 pages)

```
┌─────────────────────────────────────────────────────────────┐
│                         NAVBAR                               │
│  [🏠 Budget]  [💰 Subventions]  [🗺️ Carte]  [📈 Évolution]  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   / (Home)    │   │  /subventions │   │    /carte     │
│               │   │               │   │               │
│  Sankey +     │   │  Treemap +    │   │  Carte Paris  │
│  KPIs +       │   │  Table        │   │  (AP + Lgmts) │
│  Drill-down   │   │  filtrable    │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │  /evolution   │
                    │               │
                    │  Charts YoY   │
                    │  Comparaisons │
                    └───────────────┘
```

---

## 3. Pages et navigation

### 3.1 Navigation globale (Navbar)

```tsx
// Navbar.tsx - Structure cible
const NAV_ITEMS = [
  { href: '/', label: 'Budget', icon: '🏠', description: 'Vue d'ensemble' },
  { href: '/subventions', label: 'Subventions', icon: '💰', description: 'Qui reçoit quoi?' },
  { href: '/carte', label: 'Carte', icon: '🗺️', description: 'Projets par quartier' },
  { href: '/evolution', label: 'Évolution', icon: '📈', description: 'Tendances 2019-2024' },
];
```

### 3.2 Page `/` - Budget Sankey (existante)

**Objectif**: Comprendre les grands flux (recettes → dépenses)

| Composant | Description | Status |
|-----------|-------------|--------|
| YearSelector | Sélection année 2019-2024 | ✅ |
| DataStatusBadge | Indicateur complétude données | ✅ |
| StatsCards | KPIs (Recettes, Dépenses, Solde, Emprunts) | ✅ |
| BudgetSankey | Diagramme Sankey cliquable | ✅ |
| DrilldownPanel | Détail par catégorie | ✅ |

**Améliorations prévues**:
- [ ] Ajouter lien vers `/subventions` depuis drill-down "Subventions"
- [ ] Ajouter warning si données partielles
- [ ] Améliorer responsive mobile

### 3.3 Page `/subventions` - Treemap + Table (à créer)

**Objectif**: Explorer les bénéficiaires de subventions

```
┌─────────────────────────────────────────────────────────────┐
│  💰 Subventions {année}                    [Sélecteur année] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TREEMAP par thématique                  │   │
│  │  ┌──────────┐┌─────┐┌───────┐┌────┐                 │   │
│  │  │  Social  ││Cult.││Éduc.  ││Sprt│                 │   │
│  │  │  41.8%   ││29.1%││18.5%  ││6.2%│                 │   │
│  │  └──────────┘└─────┘└───────┘└────┘                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────┐                               │
│  │ FILTRES                  │                               │
│  │ ☑ Associations           │                               │
│  │ ☐ Établissements publics │                               │
│  │ ☐ Entreprises            │                               │
│  │ ☐ Personnes physiques    │                               │
│  │ ────────────────────     │                               │
│  │ Direction: [Toutes    ▼] │                               │
│  │ Montant min: [________] │                               │
│  └──────────────────────────┘                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TABLE BÉNÉFICIAIRES                    🔍 Recherche │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  Bénéficiaire          │ Thématique │ Montant │ Dir │   │
│  │  ──────────────────────│────────────│─────────│─────│   │
│  │  CASVP                 │ Social     │ 580 M€  │ DASES│  │
│  │  SAMU SOCIAL           │ Social     │ 45 M€   │ DASES│  │
│  │  THEATRE DE LA VILLE   │ Culture    │ 6.6 M€  │ DAC │   │
│  │  ...                   │            │         │     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⚠️ Données 2020-2021 incomplètes (bénéficiaires absents)   │
└─────────────────────────────────────────────────────────────┘
```

**Composants requis**:

| Composant | Description | Status |
|-----------|-------------|--------|
| SubventionsTreemap | Treemap ECharts par thématique | ❌ À créer |
| SubventionsFilters | Filtres (type, direction, montant) | ❌ À créer |
| SubventionsTable | Table triable/filtrable | ❌ À créer |
| DataQualityBanner | Warning années dégradées | ❌ À créer |

**Données JSON utilisées**:
- `subventions/treemap_{year}.json` - Agrégations par thématique
- `subventions/beneficiaires_{year}.json` - Liste complète bénéficiaires

**Filtres disponibles** (depuis `subventions/index.json`):

| Filtre | Valeurs | Type |
|--------|---------|------|
| `thematiques` | Culture, Social, Éducation... (19) | Multi-select chips |
| `natures_juridiques` | Associations, Entreprises, Établissements publics... | Checkboxes |
| `directions` | DAC, DASES, DJS... (22) | Dropdown |
| `montant_min` | 0 - ∞ | Slider/Input |

### 3.4 Page `/carte` - Carte interactive (existante)

**Objectif**: Voir où sont les investissements géographiquement

| Composant | Description | Status |
|-----------|-------------|--------|
| ParisMap | Carte Leaflet avec layers | ✅ |
| MapFilters | Filtres (année, layers, thématiques) | ✅ |
| ChoroplethLayer | Mode choroplèthe per capita | ✅ |

**Améliorations prévues**:
- [ ] Ajouter agrégation "Paris Centre" (arr 1-4)
- [ ] Améliorer popups avec plus d'infos
- [ ] Ajouter légende dynamique

### 3.5 Page `/evolution` - Tendances temporelles (à créer)

**Objectif**: Comparer les budgets dans le temps

```
┌─────────────────────────────────────────────────────────────┐
│  📈 Évolution du budget 2019-2024                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │       GRAPHIQUE ÉVOLUTION (Line Chart)              │   │
│  │                                                      │   │
│  │  25B€ ─┬──────────────────────────────────────────  │   │
│  │        │                              ◆ Dépenses    │   │
│  │  20B€ ─┼─────────◆────◆────◆────◆────◆─────────────  │   │
│  │        │   ◇────◇────◇────◇────◇────◇ Recettes     │   │
│  │  15B€ ─┼──────────────────────────────────────────  │   │
│  │        └────┬────┬────┬────┬────┬────┬─────────────  │   │
│  │           2019 2020 2021 2022 2023 2024             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  +6.4% YoY   │ │  21.64 B€    │ │  -3.2 B€     │        │
│  │  vs 2023    │ │  Dépenses 24  │ │  Solde 2024  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RÉPARTITION PAR THÉMATIQUE (Stacked Bar)           │   │
│  │                                                      │   │
│  │  2024 ████████████████████████████████████████████  │   │
│  │  2023 ██████████████████████████████████████████    │   │
│  │  2022 ████████████████████████████████████████████  │   │
│  │       ──────────────────────────────────────────    │   │
│  │       ■ Social ■ Éduc ■ Culture ■ Transport ■ Autre │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Composants requis**:

| Composant | Description | Status |
|-----------|-------------|--------|
| EvolutionChart | Line chart Recettes/Dépenses | ❌ À créer |
| YoyCards | KPIs variations YoY | ❌ À créer |
| ThematiqueStackedBar | Stacked bar par thématique | ❌ À créer |

**Données nécessaires**:
- Agrégation depuis `budget_sankey_{year}.json` (tous les fichiers)
- Ou nouveau fichier `budget_evolution.json` pré-calculé

---

## 4. Composants

### 4.1 Composants existants

| Composant | Props | Usage |
|-----------|-------|-------|
| `YearSelector` | `years`, `selected`, `onChange` | Sélection d'année |
| `StatsCards` | `recettes`, `depenses`, `solde`, `emprunts` | KPIs |
| `BudgetSankey` | `data`, `onNodeClick` | Diagramme Sankey |
| `DrilldownPanel` | `title`, `items`, `breadcrumbs`, `onClose` | Détail drill-down |
| `ParisMap` | `subventions`, `logements`, `autorisations`, ... | Carte Leaflet |
| `MapFilters` | `availableYears`, `activeLayers`, ... | Filtres carte |

### 4.2 Composants à créer

#### DataQualityBanner

```tsx
interface DataQualityBannerProps {
  dataset: 'budget' | 'subventions' | 'ap_projets' | 'logements';
  annee: number;
}

// Affiche un warning si données dégradées pour cette année/dataset
export function DataQualityBanner({ dataset, annee }: DataQualityBannerProps) {
  // Lit depuis data_availability.json ou constante
  const warning = getWarning(dataset, annee);
  if (!warning) return null;
  
  return (
    <div className={cn(
      "rounded-lg p-3 mb-4",
      warning.severity === 'error' 
        ? "bg-red-900/30 border border-red-700/50" 
        : "bg-yellow-900/30 border border-yellow-700/50"
    )}>
      <p className="text-sm">
        {warning.severity === 'error' ? '❌' : '⚠️'} {warning.message}
      </p>
    </div>
  );
}
```

#### SubventionsTreemap

```tsx
interface SubventionsTreemapProps {
  data: TreemapData;
  onThematiqueClick?: (thematique: string) => void;
}

// Treemap ECharts avec drill-down
export function SubventionsTreemap({ data, onThematiqueClick }: SubventionsTreemapProps) {
  // Configuration ECharts treemap
  // Click sur thématique → filtre la table
}
```

#### SubventionsTable

```tsx
interface SubventionsTableProps {
  beneficiaires: Beneficiaire[];
  filters: SubventionFilters;
  onFiltersChange: (filters: SubventionFilters) => void;
  onSort: (column: string, direction: 'asc' | 'desc') => void;
}

// Table avec tri, recherche, pagination
export function SubventionsTable({ ... }: SubventionsTableProps) {
  // Colonnes: Bénéficiaire, Thématique, Montant, Direction, Nature juridique
  // Recherche full-text
  // Tri par colonne
  // Pagination (50 par page)
}
```

### 4.3 Hiérarchie des composants

```
app/
├── layout.tsx
│   └── Navbar
│
├── page.tsx (Budget)
│   ├── DataStatusBadge
│   ├── YearSelector
│   ├── StatsCards
│   ├── BudgetSankey
│   └── DrilldownPanel
│
├── subventions/page.tsx
│   ├── DataQualityBanner
│   ├── YearSelector
│   ├── SubventionsTreemap
│   ├── SubventionsFilters
│   └── SubventionsTable
│
├── carte/page.tsx
│   ├── MapFilters
│   └── ParisMap
│       ├── ChoroplethLayer
│       └── MarkerCluster
│
└── evolution/page.tsx
    ├── EvolutionChart
    ├── YoyCards
    └── ThematiqueStackedBar
```

---

## 5. Gestion des données

### 5.1 Principe: Static Data First

**Règle**: Toutes les données viennent de fichiers JSON statiques dans `/public/data/`.
Pas d'appels API au runtime (sauf géolocalisation SIRET si nécessaire).

### 5.2 Fichiers JSON disponibles

| Fichier | Taille | Contenu |
|---------|--------|---------|
| `budget_index.json` | ~1 KB | Années disponibles, métadonnées |
| `budget_sankey_{year}.json` | ~50 KB | Nodes + Links Sankey + drilldown |
| `subventions/index.json` | ~2 KB | Années, filtres disponibles |
| `subventions/treemap_{year}.json` | ~10 KB | Agrégations par thématique |
| `subventions/beneficiaires_{year}.json` | ~500 KB | Liste complète bénéficiaires |
| `map/investissements_{year}.json` | ~200 KB | Projets AP géolocalisés |
| `map/logements_{year}.json` | ~100 KB | Logements sociaux |
| `map/arrondissements_stats.json` | ~5 KB | Stats per capita par arr |

### 5.3 Loaders (lib/api/staticData.ts)

```typescript
// Loaders existants
export async function loadBudgetIndex(): Promise<BudgetIndex>;
export async function loadBudgetSankey(year: number): Promise<BudgetData>;
export async function loadSubventionsIndex(): Promise<SubventionsIndex>;
export async function loadSubventionsForYear(year: number): Promise<Subvention[]>;
export async function loadLogementsSociaux(): Promise<LogementSocial[]>;
export async function loadAutorisationsForYear(year: number): Promise<AutorisationProgramme[]>;

// Loaders à ajouter
export async function loadSubventionsTreemap(year: number): Promise<TreemapData>;
export async function loadSubventionsBeneficiaires(year: number): Promise<Beneficiaire[]>;
export async function loadBudgetEvolution(): Promise<EvolutionData>;
```

### 5.4 Types TypeScript

```typescript
// Types existants dans lib/types/map.ts
export interface Subvention { ... }
export interface LogementSocial { ... }
export interface AutorisationProgramme { ... }
export interface ArrondissementStats { ... }

// Types à ajouter
export interface TreemapData {
  annee: number;
  total: number;
  thematiques: {
    id: string;
    name: string;
    value: number;
    pct: number;
    children?: TreemapData['thematiques'];
  }[];
}

export interface Beneficiaire {
  id: string;
  nom: string;
  nomCanonique?: string;  // Nom dédupliqué (CASVP)
  thematique: string;
  montant: number;
  direction?: string;
  natureJuridique: string;
  typeOrganisme: 'public' | 'association' | 'entreprise' | 'personne_physique' | 'autre';
  sourceThematique: 'pattern' | 'direction' | 'llm' | 'default';
}

export interface EvolutionData {
  years: number[];
  recettes: number[];
  depenses: number[];
  soldes: number[];
  byThematique: {
    [thematique: string]: number[];
  };
}
```

---

## 6. Qualité et warnings

### 6.1 Contrat qualité (depuis architecture-modelling.md)

| Condition | Warning à afficher |
|-----------|-------------------|
| `annee IN (2020, 2021)` subventions | "⚠️ Données incomplètes : détail bénéficiaires indisponible" |
| `annee >= 2023` pour AP | "⚠️ Projets d'investissement non disponibles pour cette année" |
| `sourceThematique = 'default'` | Label "(non classifié)" en italique |
| `confiance < 0.8` géoloc | "📍 Localisation approximative" |
| `pct_non_classifie > 30%` | "⚠️ 30% des montants non classifiés" |

### 6.2 Fichier data_availability.json (à créer)

```json
{
  "budget": {
    "annees_disponibles": [2019, 2020, 2021, 2022, 2023, 2024],
    "warnings": {}
  },
  "subventions": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022, 2023, 2024],
    "warnings": {
      "2020": { "severity": "error", "message": "Données bénéficiaires absentes (source)" },
      "2021": { "severity": "error", "message": "Données bénéficiaires absentes (source)" }
    }
  },
  "ap_projets": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022],
    "warnings": {
      "2023": { "severity": "warning", "message": "Données non encore publiées par OpenData" },
      "2024": { "severity": "warning", "message": "Données non encore publiées par OpenData" }
    }
  }
}
```

### 6.3 Implémentation

```tsx
// Hook pour récupérer les warnings
function useDataQuality(dataset: string, year: number) {
  const [availability, setAvailability] = useState<DataAvailability | null>(null);
  
  useEffect(() => {
    fetch('/data/data_availability.json')
      .then(r => r.json())
      .then(setAvailability);
  }, []);
  
  return availability?.[dataset]?.warnings?.[year] || null;
}
```

---

## 7. Design system

### 7.1 Couleurs (lib/colors.ts)

```typescript
// Thématiques subventions
export const THEMATIQUE_COLORS: Record<string, string> = {
  'Social': '#ef4444',
  'Social - Solidarité': '#dc2626',
  'Social - Petite enfance': '#f87171',
  'Culture': '#a855f7',
  'Culture & Sport': '#9333ea',
  'Éducation': '#3b82f6',
  'Sport': '#22c55e',
  'Transport': '#f59e0b',
  'Logement': '#06b6d4',
  'Urbanisme - Logement': '#0891b2',
  'Économie': '#ec4899',
  'Environnement': '#84cc16',
  'Administration': '#64748b',
  'Santé': '#14b8a6',
  'Sécurité': '#f97316',
  'Non classifié': '#94a3b8',
};

// Statuts qualité
export const STATUS_COLORS = {
  complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  partial: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  missing: 'bg-red-500/20 text-red-400 border-red-500/30',
};
```

### 7.2 Styles communs

```css
/* Card standard */
.card {
  @apply bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50;
}

/* Badge */
.badge {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border;
}

/* Table */
.table-header {
  @apply text-xs font-semibold text-slate-400 uppercase tracking-wide;
}
.table-row {
  @apply border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors;
}
```

### 7.3 Responsive breakpoints

| Breakpoint | Usage |
|------------|-------|
| `sm:` (640px) | Mobile landscape |
| `md:` (768px) | Tablet |
| `lg:` (1024px) | Desktop |
| `xl:` (1280px) | Large desktop |

---

## 8. Roadmap d'implémentation

### Phase 1: Subventions (P1)

**Objectif**: Page `/subventions` complète avec treemap et table

| Tâche | Effort | Dépendances |
|-------|--------|-------------|
| Créer `SubventionsTreemap.tsx` | ⭐⭐ | ECharts config |
| Créer `SubventionsFilters.tsx` | ⭐ | - |
| Créer `SubventionsTable.tsx` | ⭐⭐ | Pagination, tri |
| Créer `DataQualityBanner.tsx` | ⭐ | data_availability.json |
| Assembler page `/subventions` | ⭐⭐ | Tous composants |
| Ajouter à Navbar | ⭐ | - |

### Phase 2: Qualité & Paris Centre (P1-P2)

| Tâche | Effort | Dépendances |
|-------|--------|-------------|
| Générer `data_availability.json` | ⭐ | Script Python |
| Implémenter warnings dans toutes les pages | ⭐⭐ | DataQualityBanner |
| Ajouter "Paris Centre" dans carte | ⭐ | GeoJSON modifié |
| Mettre à jour stats arrondissements | ⭐ | Export script |

### Phase 3: Évolution (P2)

| Tâche | Effort | Dépendances |
|-------|--------|-------------|
| Créer `EvolutionChart.tsx` | ⭐⭐ | ECharts line |
| Créer `YoyCards.tsx` | ⭐ | - |
| Créer `ThematiqueStackedBar.tsx` | ⭐⭐ | ECharts stacked |
| Générer `budget_evolution.json` | ⭐ | Script Python |
| Assembler page `/evolution` | ⭐⭐ | Tous composants |

### Phase 4: Polish (P3)

| Tâche | Effort | Dépendances |
|-------|--------|-------------|
| Export PDF (Sankey, Treemap) | ⭐⭐⭐ | html2canvas |
| Export CSV (Table subventions) | ⭐ | - |
| Optimiser mobile | ⭐⭐ | - |
| Tests E2E (Playwright) | ⭐⭐⭐ | - |
| Documentation utilisateur | ⭐⭐ | - |

---

## Annexes

### A. Commandes utiles

```bash
# Développement
cd frontend && npm run dev

# Build production
npm run build

# Lint
npm run lint

# Générer données (depuis racine projet)
python scripts/export_sankey_data.py
python scripts/export_subventions_data.py
python scripts/export_map_data.py
```

### B. Variables d'environnement

```bash
# frontend/.env.local (optionnel)
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

### C. Dépendances NPM

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "echarts": "^5.5.0",
    "echarts-for-react": "^3.0.2",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@types/leaflet": "^1.9.0"
  }
}
```

---

*Document créé le 2026-02-05. Architecture frontend pour Paris Budget Dashboard.*
*Priorités: P1 = Subventions + Qualité, P2 = Évolution + Paris Centre, P3 = Export + Mobile.*
