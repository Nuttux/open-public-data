# Front multi-cities — Refactor plan

**Statut : en cours de validation. Document figé après revue utilisateur.**
**Date : 2026-05-07**

Plan de refactor du front (`website/`) pour passer d'une architecture "Paris-root" à une architecture multi-villes URL-routed. Aligné avec [`project_marseille_v1_decisions`](../memory/project_marseille_v1_decisions.md) — décisions P0.2, P0.3, P3.1, P3.2, P3.3.

## Architecture cible

| URL | Rôle | Layout |
|---|---|---|
| `/` | Landing France macro (vue agrégée nationale + sélecteur ville) | `app/page.tsx` (à refondre) |
| `/[city]` | Landing par ville | `app/(city)/[city]/page.tsx` |
| `/[city]/budget` | Budget par ville | `app/(city)/[city]/budget/page.tsx` |
| `/[city]/marches-publics` | Marchés par ville | `app/(city)/[city]/marches-publics/page.tsx` |
| `/[city]/qui-recoit` | Subventions par ville | `app/(city)/[city]/qui-recoit/page.tsx` |
| `/[city]/investissements` | Investissements par ville | `app/(city)/[city]/investissements/page.tsx` |
| `/[city]/logement-social` | Logement social par ville | `app/(city)/[city]/logement-social/page.tsx` |
| `/[city]/dette-patrimoine` | Dette/patrimoine par ville | `app/(city)/[city]/dette-patrimoine/page.tsx` |
| `/[city]/analyses` | Articles par ville (filtres tag city) | `app/(city)/[city]/analyses/page.tsx` |
| `/c/[slug]` | Pages slim (transition, villes pas exhaustives) | `app/c/[slug]/page.tsx` (existant, conservé) |
| `/apu`, `/etat`, `/dette`, `/fiscalite` | Pages thématiques nationales | inchangées |

## Plan de refactor — étapes

### Étape A — Créer le route group `(city)` Next.js (1 jour)

Action :
```bash
mkdir -p website/src/app/\(city\)/\[city\]/{budget,marches-publics,qui-recoit,investissements,logement-social,dette-patrimoine,analyses}
```

Pour chaque page, créer `page.tsx` qui :
1. Lit `params.city` (slug)
2. Vérifie que la ville existe dans le registry `listCities()` (sinon `notFound()`)
3. Vérifie que la ville est exhaustive (sinon redirige vers `/c/[slug]` slim)
4. Appelle le loader paramétré : `loadBudgetPageData(city, year?)`, etc.
5. Retourne le client component avec les données

**Pattern type** (`app/(city)/[city]/budget/page.tsx`) :
```tsx
import { notFound, redirect } from 'next/navigation';
import { isCityExhaustive, loadBudgetPageData } from '@/lib/...';
import BudgetClient from './BudgetClient';

export default async function Page({ params, searchParams }) {
  const { city } = await params;
  const exhaustive = await isCityExhaustive(city);
  if (!exhaustive) redirect(`/c/${city}`);
  const data = await loadBudgetPageData(city, searchParams.year);
  return <BudgetClient data={data} city={city} />;
}
```

**Layout commun** : `app/(city)/[city]/layout.tsx` qui injecte le `currentCity` dans un context React `<CityProvider value={city}>` et passe le top de page (header, ScopeDropdown).

### Étape B — Paramétrer les loaders dans `lib/fusion-data.ts` (1 jour)

**Avant** :
```ts
export async function loadBudgetPageData(year?: number): Promise<BudgetPageData> {
  return readJson(`budget_sankey_${year ?? latestYear}.json`);
}
```

**Après** :
```ts
export async function loadBudgetPageData(city: string, year?: number): Promise<BudgetPageData> {
  return readJson(`${city}/budget_sankey_${year ?? latestYearFor(city)}.json`);
}
```

Loaders à paramétrer :
| Loader | Avant | Après |
|---|---|---|
| `loadBudgetIndex()` | `budget_index.json` | `${city}/budget_index.json` |
| `loadBudgetPageData(year?)` | `budget_sankey_${year}.json` | `${city}/budget_sankey_${year}.json` |
| `loadInvestissementsData(year?)` | `investissement_tendances.json` + `map/investissements_complet_${year}.json` | `${city}/investissement_tendances.json` + `${city}/map/investissements_complet_${year}.json` |
| `loadLogementSocialData(year?)` | `map/arrondissements_stats_${year}.json` | `${city}/map/arrondissements_stats_${year}.json` |
| `loadMarchesData()` | `marches_data.json` | `${city}/marches_data.json` |
| `loadSubventionsData()` | `subventions_data.json` | `${city}/subventions_data.json` |
| `loadDetteData()` | `dette_patrimoine.json` | `${city}/dette_patrimoine.json` |

Ajouter aussi : `loadCityMeta(city)` qui lit `methodology.json` → `cities[city]` (cf. refactor pipeline étape F).

### Étape C — Restructurer `public/data/` par ville (déjà fait pipeline étape G)

Aucune action front nécessaire — c'est le pipeline qui écrit. Le front lit juste les nouveaux paths.

**Important** : pendant la transition (refactor pipeline en cours), garder les anciens fichiers à la racine `public/data/` ET ajouter les nouveaux dans `public/data/paris/`. Le front lit les nouveaux par défaut, fallback sur les anciens si absents.

### Étape D — `DistrictChoropleth` unifié, GeoJSON standard (2-3 jours)

**Décision 2026-05-07** : composant **unique paramétrable** consommant du **GeoJSON standard** (pas de paths SVG inline). Conversion Paris pour s'aligner.

**Avant** :
- `website/src/components/fusion/ParisChoropleth.tsx` (239 lignes, hardcode 17 paths SVG Paris)
- `website/src/components/fusion/paris-arrondissements.ts` (paths SVG inline)

**Après** :
- `website/src/components/fusion/DistrictChoropleth.tsx` (paramétrable, lit GeoJSON)
- `website/public/data/geojson/paris-arrondissements.geojson` (converti depuis SVG existant — opération one-shot)
- `website/public/data/geojson/marseille-arrondissements.geojson` (téléchargé depuis data.gouv.fr `arrondissements-de-marseille-nd`)
- `website/src/lib/cityGeo.ts` : registry `getDistrictGeoJsonUrl(city) → '/data/geojson/[city]-arrondissements.geojson'`

**Signature** :
```ts
type DistrictChoroplethProps = {
  city: string;                     // 'paris' | 'marseille' | ...
  items: { districtCode: string | number; amount: number; count?: number }[];
  formatValue?: (n: number) => string;
  hrefFor?: (districtCode) => string;
  onTileClick?: (districtCode) => void;
};
```

Le composant fait un `fetch()` du GeoJSON au mount via le registry. Un seul code path, un seul format.

**Conversion Paris one-shot** : utiliser le GeoJSON officiel APUR ou data.gouv.fr (`arrondissements`) plutôt que de re-générer depuis les paths SVG existants — moins de risque de glissement de coordonnées. Stocker le GeoJSON validé dans `public/data/geojson/`.

**`ParisChoropleth.tsx`** : conservé en alias deprecated qui appelle `<DistrictChoropleth city="paris" ... />` pour la rétro-compat. Supprimé après migration de toutes les pages Paris vers le composant générique.

**Bénéfice** : Lyon, Toulouse, Bordeaux pourront télécharger leur GeoJSON IGN AdminExpress directement, sans conversion. Le pattern scale.

### Étape E — Extraire les constants Paris de `methodology.ts` (0,5 jour)

**Avant** :
```ts
// website/src/lib/methodology.ts
export const PARIS_POPULATION = 2133111;
export const PARIS_NB_ARRONDISSEMENTS = 17;
export function parisCrcDebtYearsFor(year: number) { ... }
```

**Après** :
```ts
// website/src/lib/methodology.ts
import methodology from '@/data/methodology.json';

export function cityMeta(slug: string) {
  return methodology.cities[slug];
}

export function crcDebtYearsFor(slug: string, year: number) {
  return methodology.cities[slug]?.crc_debt_years?.[year] ?? null;
}

// alias deprecated (pour rétro-compat pendant migration)
export const PARIS_POPULATION = methodology.cities.paris.population;
```

Fichiers Paris qui utilisent les constants (à migrer après) :
- `website/src/lib/fusion-data.ts`
- `website/src/components/TaPartAToi.tsx`
- `website/src/components/ViralMockupsClient.tsx`
- `website/src/app/budget/BudgetClient.tsx`
- `website/src/app/dette-patrimoine/DettePatrimoineClient.tsx`
- `website/src/components/fusion/MasseFiche.tsx`

→ Migration progressive : remplacer `PARIS_POPULATION` par `cityMeta(currentCity).population` (lu depuis context).

### Étape F — i18n helpers paramétrés (1 jour)

**Avant** : `~50 clés` dans `website/src/i18n/{fr,en}.ts` ont "Paris" en dur dans la valeur.

**Après** : passer les clés en templates `{{ city }}` et fournir un helper qui injecte le nom de ville.

**Pattern** :
```ts
// website/src/i18n/fr.ts (avant)
'nav.budget.desc': 'Budget de Paris — recettes, dépenses, investissements'

// website/src/i18n/fr.ts (après)
'nav.budget.desc': 'Budget de {{ city }} — recettes, dépenses, investissements'

// website/src/i18n/index.ts
export function t(key: string, vars?: Record<string, string>) {
  let s = lookup(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{{ ${k} }}`, v);
  return s;
}

// usage dans un composant
const { city } = useCity();
const cityLabel = cityMeta(city).nom_long;  // "Paris" / "Marseille"
const desc = t('nav.budget.desc', { city: cityLabel });
```

**Liste des ~5 clés vraiment éditoriales Paris à forker** (pas paramétrer, parce que le sens est Paris-specifique) :
- `landing.manifesto` ("indépendant de la Mairie de Paris…") → fork `landing.manifesto.paris` / `landing.manifesto.marseille`
- `landing.headline_city` ("VILLE DE PARIS") → idem
- `nav.qui_recoit.desc` (mention "Conseil de Paris") → idem
- 2-3 autres à identifier en passant en revue le fichier

**Les ~45 autres clés** passent en helper paramétré.

### Étape G — `ScopeDropdown` : détection currentCity et hrefs adaptés (0,5 jour)

**Avant** : `ScopeDropdown.tsx` (169 lignes) navigue entre Paris (root) et `/c/[slug]`.

**Après** : navigue entre `/[city]` (pour les villes exhaustives) et `/c/[slug]` (slim transitoires) et France (`/`).

Adaptations :
1. Détecter `currentCity` depuis `usePathname()` (regex `^/([^/]+)/`)
2. Pour chaque ville exhaustive, `href = /${slug}/budget` (ou la page courante équivalente)
3. Pour chaque ville slim, `href = /c/${slug}`
4. Item "France entière" : `href = /`
5. Logo/Brand : devient `href = /` (France entière, plus Paris par défaut)

### Étape H — Redirects rétro-compat dans `next.config.ts` (0,5 jour)

```js
async redirects() {
  return [
    // Paris : anciens liens / → /paris (rétro-compat)
    { source: '/budget', destination: '/paris/budget', permanent: true },
    { source: '/marches-publics', destination: '/paris/marches-publics', permanent: true },
    { source: '/qui-recoit', destination: '/paris/qui-recoit', permanent: true },
    { source: '/investissements', destination: '/paris/investissements', permanent: true },
    { source: '/logement-social', destination: '/paris/logement-social', permanent: true },
    { source: '/dette-patrimoine', destination: '/paris/dette-patrimoine', permanent: true },
    { source: '/analyses', destination: '/paris/analyses', permanent: true },
    // Sub-pages (drill arrondissement, drill marché, etc.) — à enrichir
    { source: '/investissements/arrondissement/:arr', destination: '/paris/investissements/arrondissement/:arr', permanent: true },
    // Slim → riche (quand Marseille devient exhaustive)
    { source: '/c/marseille', destination: '/marseille', permanent: true },
    { source: '/c/marseille/:path*', destination: '/marseille/:path*', permanent: true },
  ];
}
```

### Étape I — Landing `/` v1 = redirect vers `/paris` (0,5 jour)

**Décision 2026-05-07** : la vraie landing France macro est repoussée en **v1.5**. En v1 Marseille, `/` redirige 301 vers `/paris` (rétro-compat avec les liens existants).

**Action v1** :
- `next.config.ts` : ajouter `{ source: '/', destination: '/paris', permanent: true }` (UNIQUEMENT après que `/paris` ait été créé en étape A)
- `app/page.tsx` actuel (LandingClient Paris-centrique) → migré tel quel vers `app/(city)/[city]/page.tsx` avec data city-aware (Paris OU Marseille selon le slug)
- Cette landing par ville sert pour `/paris` et `/marseille` avec hero, KPIs, et cards vers les sous-pages

**v1.5 (séparée, après livraison Marseille v1)** : refonte de `/` en vraie landing France macro :
- Hero macro France (PIB, dépenses publiques, dette publique — Eurostat/INSEE)
- Sélecteur ville (carte cliquable + dropdown)
- Cards `/apu`, `/etat`, `/dette`, `/fiscalite`
- Cards villes exhaustives (Paris, Marseille, ...)
- Search "Toutes les communes" → ouvre `/c/[slug]`

→ retirer alors le redirect `/` → `/paris`.

### Étape J — Pages dégradées Marseille (P3.2 option a) (1 jour)

Pour chaque page Marseille avec données partielles, le client component détecte les sections vides et les retire silencieusement.

**Exemples** :
- `LogementSocialClient.tsx` (ou nouveau `LogementSocialClient.shared.tsx` paramétré) :
  - Si `data.bailleurs.length === 0` → ne rend pas la section "Bailleurs sociaux"
  - Si `data.tension.byArrondissement.length === 0` → ne rend pas la choropleth tension
- `InvestissementsClient.tsx` :
  - Si `data.projets[].adresse_complete` absent → drawer fiche projet sans carte adresse, juste arrondissement
- `DettePatrimoineClient.tsx` :
  - Si `data.crcSnapshots.length === 0` → ne rend pas le bloc "Stress-test CRC"

**Pas de callout d'explication.** Section absente = section absente. (P3.2)

## Pages "shared" vs "Paris-only" / "Marseille-only"

| Page | Stratégie |
|---|---|
| `/budget` (BudgetClient) | **Shared** — 100% data-driven, fonctionne pour les 2 villes |
| `/qui-recoit` (QuiRecoitExplorer) | **Shared** — listes filtrables data-driven |
| `/marches-publics` (MarchesFullList) | **Shared** — filtres data-driven |
| `/analyses` (AnalysesClient) | **Shared** — pur éditorial, filtre `tag=city` |
| `/investissements` (InvestissementsClient) | **Shared dégradé** — mêmes composants, sections conditionnelles |
| `/logement-social` (LogementSocialClient) | **Shared dégradé** — sections "bailleurs" conditionnelles |
| `/dette-patrimoine` (DettePatrimoineClient) | **Shared dégradé** — sections CRC conditionnelles |
| Landing `/[city]` | **Shared** — data-driven, hero variable |

**Principe** : pas de fork de composants par ville. Un seul composant, sections conditionnelles selon ce que la data fournit.

## Ordre d'exécution

```
A. Route group (city)/[city]                       [INDEPENDANT]
B. Paramétrer loaders fusion-data                  [INDEPENDANT, parallèle de A]
C. Public/data/[city]/ (fait par pipeline étape G) [DEPEND DE B]
D. DistrictChoropleth                              [INDEPENDANT, parallèle]
E. cityMeta() / methodology.ts                     [DEPEND DE pipeline étape F]
F. i18n helpers                                    [INDEPENDANT, parallèle]
G. ScopeDropdown adapté                            [DEPEND DE A]
H. Redirects                                       [DEPEND DE A]
I. Landing France macro                            [INDEPENDANT, peut être en v1.5]
J. Pages dégradées                                 [DEPEND DE A, B]
```

**Plan d'attaque proposé** :
- Semaine 1 : A + B + D + F en parallèle (pas de touch landing)
- Semaine 2 : C + E + G + H + J séquentiel
- Semaine 3 : I (refonte landing) — peut glisser en v1.5

## Tests de non-régression Paris

À chaque étape :
1. **Pages Paris fonctionnent** (toutes URLs `/budget`, etc. via redirect 301 → `/paris/budget`)
2. **Screenshots Playwright** pages clés desktop + mobile (cf. mémoire `feedback_ui_self_review`) — visuellement identiques avant/après
3. **i18n** : pas de clé orpheline, helpers paramétrés rendent correctement
4. **SEO** : sitemap mis à jour, canonicals corrects, redirects 301 fonctionnels
5. **Performance** : LCP/INP pas dégradés (lazy loading des `cityDistricts/[city].ts`)

## Critères d'acceptation phase 3

- [ ] Route group `(city)/[city]/...` créé et fonctionnel pour Paris
- [ ] Tous les loaders paramétrés `(city, ...)`
- [ ] `DistrictChoropleth` générique en prod, `ParisChoropleth` deprecated
- [ ] `cityMeta(slug)` et `crcDebtYearsFor(slug, year)` fonctionnels
- [ ] i18n helpers déployés, ~50 clés migrées, ~5 forks éditoriaux
- [ ] ScopeDropdown détecte `currentCity` et adapte les hrefs
- [ ] Redirects 301 actifs, anciennes URLs Paris fonctionnent
- [ ] Pages dégradées : sections conditionnelles testées sur data Marseille mockée
- [ ] Screenshots Playwright Paris : aucune régression visuelle
- [ ] **À valider par utilisateur avant de débloquer phase 4 (POC vertical)**
