# Tests — état & priorités

> État : 48 tests unitaires Vitest sur `website/src/lib` couvrent les 5
> fonctions identifiées comme les plus à risque de régression silencieuse
> (cf section "Top 5" ci-dessous, toutes cochées).
>
> Le gate CI actuel (`.github/workflows/ci.yml`) lance pour chaque PR :
> `lint → typecheck → vitest → next build` côté website, et `py_compile`
> côté pipeline. Les 42 tests dbt restent dans le pipeline data, hors CI.
>
> Critère de sélection des tests prioritaires : **régression silencieuse qui
> ferait publier un faux chiffre / une fiche cassée à un utilisateur final**.
> Le top 5 ci-dessous est livré ; la roadmap "à venir" est en bas de page.

## Top 5 tests unit prioritaires (`website/src/lib`) — ✅ livrés

### 1. ✅ `fmt.ts` — formats euros (`fmtCompactEur`, `fmtBillions`, `fmtMillions`)

**Pourquoi** : utilisés sur tous les KPI affichés (Md/M/k €). Bug d'un seuil
ou d'un divisor → tous les chiffres affichés sont faux d'un facteur 1 000
sans que personne ne le voie.

**Cas critiques** :
- Boundary `999_999` → "999 999 €", `1_000_000` → "1 M €".
- Boundary `999_999_999` → "1 000 M €", `1_000_000_000` → "1,00 Md €".
- Signe négatif (dette, déficit).
- Valeur 0 et `NaN`.

### 2. ✅ `projet-utils.ts` — slugs (`slugifyChapitre`, `slugifyBailleur`)

**Pourquoi** : ces slugs construisent les URLs des fiches (chapitres,
bailleurs). Régression = collision (deux libellés → même slug, fiche
écrasée) ou 404 sur fiche déjà publiée.

**Cas critiques** :
- Accents : "Éducation" → "education" (déterministe, identique à la fonction
  qui fixe les routes côté serveur).
- `slugifyBailleur` strip des formes juridiques : "Paris Habitat OPH" et
  "Paris Habitat" doivent slugifier vers la même valeur (déduplication).
- Caractères spéciaux fréquents ('&', "'", '-').
- Input vide / `null` → ne casse pas.

### 3. ✅ `projet-utils.ts` — classification (`resolveTypoBucket`, `guessTypologieFromName`, `detectJO`)

**Pourquoi** : range les projets dans la légende carte des investissements.
Bug de regex → une école se retrouve dans "Voirie", un projet JO 2024 ne
détecte pas son flag.

**Cas critiques** :
- Mots-clés multi-typologies ("groupe scolaire" → education, pas voirie).
- Accents ignorés : "École" et "ecole" matchent.
- Fallback "autre" pour input non-matché.
- `detectJO` : "Arena Porte de la Chapelle", "Village olympique", false
  positives à éviter ("Olympique de Marseille" hypothétique).

### 4. ✅ `objet-normalizer.ts` — `normalizeObjet`, `isObjetCryptic`

**Pourquoi** : 110 k+ libellés de marchés publics passent par cette fonction
avant affichage. Bug de regex → libellés illisibles ou faussés en masse.

**Cas critiques** :
- Cas du commentaire d'en-tête : input MAJ + underscores + abrévs →
  rendu lisible attendu.
- Articles français en MAJ ("DES MARCHÉS À LA SAUVETTE") → minuscules
  conservées sur stopwords ("des marchés à la sauvette").
- Input déjà lisible (idempotence : `normalizeObjet(normalizeObjet(x)) === normalizeObjet(x)`).
- `isObjetCryptic` : true sur tout-MAJ + abrév, false sur libellé propre.

### 5. ✅ `methodology.ts` — `parisCrcDebtYearsFor`

**Pourquoi** : source unique de vérité pour les snapshots CRC affichés sur
la page dette. Le fallback "année antérieure la plus proche" est subtil et
silencieux : un bug renvoie une ancienne année comme si elle était la
courante.

**Cas critiques** :
- Match exact présent dans `paris_debt_snapshots.by_year`.
- Année demandée absente, mais `year - 1` ou `year - 2` présent → renvoie
  le plus récent ≤ year.
- Année demandée plus ancienne que tout snapshot → renvoie `null`.
- `paris_debt_snapshots` undefined dans le JSON → renvoie `null` (pas crash).

---

## Outillage en place

- **Vitest** (config dans `website/vitest.config.ts` avec alias `@/` mappé
  sur `src/`). Tests stockés à côté des fichiers : `lib/fmt.test.ts`, etc.
- Lancer en local : `npm test` (one-shot) ou `npm run test:watch` (TDD).
- Bloque les PRs en CI via le job `Website` (étape `Unit tests (Vitest)`).

## Roadmap tests — prochaines vagues

### Vague 2 (à écrire prochainement)

- `daily-bread.ts` — calculs déterministes du panier journalier ; à tester
  avec fixtures JSON figées.
- `daily-bread-drilldown.ts` — résolution des URLs de drill-down (le bug
  silencieux ici = mauvais lien depuis le panier).
- `label-translate.ts` — fallback FR↔EN, cohérence entre `fr.ts` et `en.ts`.
- `national-data.ts` — schéma Eurostat / DGFiP / OFGL.

### Hors scope MVP

- Tests e2e Playwright sur les pages clés (golden path par section).
- Visual regression sur composants `fusion/` (graphes ECharts).
- Tests de loaders `fusion-data.ts` (3 469 lignes, dépendent de `fs` →
  nécessitent fixtures JSON à figer).
