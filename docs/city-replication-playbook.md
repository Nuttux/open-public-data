# City Replication Playbook

**Comment transposer le pipeline + site France Open Data à une nouvelle grande ville française.**

Ce playbook industrialise le processus défini lors de la transposition Paris → Marseille (validé 2026-05-07). Il sert à la fois de :
- **Runbook humain** : checklist d'audit + décisions à valider avec le porteur produit
- **Prompt agent** : template à donner à un agent (Claude Code) pour démarrer une nouvelle ville

> **Note** : ce doc remplace l'ancien `replicability.md`, qui est devenu obsolète (brand, défauts d'architecture). Lire celui-ci en priorité.

---

## 0. Quand utiliser ce playbook

**Cible** : grande ville française (>100k habitants idéalement) candidate à devenir une "ville exhaustive" du site France Open Data, c'est-à-dire avec ses propres pages riches `/[city]/{budget,marches-publics,qui-recoit,...}` au même niveau que Paris et Marseille.

**Ne pas utiliser** pour :
- Communes sous le seuil OFGL pertinent (utiliser la fiche slim `/c/[slug]` à la place)
- Régions, départements (architecture différente, à concevoir séparément)
- Pays étrangers (n'utilisent ni M57, ni DECP, ni OFGL — refaire l'audit data de zéro)

**Vocabulaire** :
- "Ville exhaustive" = ville avec ses propres pages riches dédiées (pas juste la slim)
- "v1 ville" = première version exhaustive d'une ville, livrée en bloc
- "POC ville" = preuve verticale sur 1 page (souvent `/budget`) avant de tout déployer

---

## 1. Vue d'ensemble du processus

**Durée totale typique : 3-5 semaines** pour une ville de ~500k-1M habitants avec un portail open data correct.

```
Phase 0 — Décisions produit & cadrage         [0,5 jour]
  └─ Aligner sur 12 décisions (template plus bas)

Phase 1 — Audit data exhaustif                [2-3 jours]
  └─ Inventorier sources : ville + métropole + national + PDF
  └─ Livrable : docs/[city]-data-inventory.md

Phase 2 — Audit pipeline                      [1 jour]
  └─ Identifier ce qui se généralise vs ce qui doit être forké
  └─ Livrable : docs/[city]-pipeline-refactor.md (si refactor générique nécessaire)

Phase 3 — Audit UX/front                      [1 jour]
  └─ Liste des composants à généraliser, des i18n à paramétrer
  └─ Livrable : docs/[city]-front-refactor.md (si refactor générique nécessaire)

Phase 4 — POC vertical                        [3-4 jours]
  └─ /[city]/budget end-to-end (sync → core → mart → JSON → page)
  └─ Critère go : switch ScopeDropdown fonctionne, données justes

Phase 5 — Implémentation complète             [12-18 jours]
  └─ Pages restantes en série (marches-publics → qui-recoit → ...)
  └─ Tests, i18n, exports, déploiement
```

**Règle d'or** : chaque phase a des livrables et un critère d'acceptation. On ne passe à la suivante qu'une fois validé. Si la phase n+1 révèle un trou dans la phase n, on retourne en arrière — on ne pousse pas du dette technique.

---

## 2. Phase 0 — Décisions produit & cadrage

**Objectif** : aligner sur 12 décisions clés avant de toucher au moindre code.

**Livrable** : tableau des décisions validé par le porteur produit (le copier dans `docs/[city]-v1-decisions.md` ou en mémoire `project_[city]_v1_decisions.md`).

**Defaults** : reprendre les décisions Marseille v1 (mémoire `project_marseille_v1_decisions`). Toute déviation = à justifier explicitement.

### Template de questions à poser

| # | Question | Default Marseille v1 | Réponse [city] |
|---|---|---|---|
| P0.1 | Périmètre v1 ? Toutes pages ou phasage ? | Toutes (pas de report V2) | ? |
| P0.2 | URL : préfixée `/[city]/budget` (option B) ? | Oui (option B) | ? |
| P0.3 | Slim `/c/[city]` disparaît dès exhaustive ? | Oui, redirect 301 | ? |
| P0.4 | Choropleth : quel grain géographique ? | 16 arrondissements (à valider phase 1) | ? |
| P0.5 | Branding : France Open Data (pas autre nom local) | Oui | ? |
| P2.1 | OBT unifié (commune_slug partout) ou dual ? | Unifié (option α) | ? |
| P2.2 | Naming scripts : `sync_[city]_*` city-specific, sans préfixe si générique | Oui | ? |
| P2.3 | Seeds dans `pipeline/seeds/cities/[city]/*.csv` | Oui | ? |
| P2.4 | Refactor enrichissement LLM `--use-llm` flag avant la ville | Oui (cohérence dès le début) | ? |
| P3.1 | Layout group Next.js `app/(city)/[city]/...` | Oui | ? |
| P3.2 | Pages dégradées : section disparaît silencieusement (option a) ou callout (option b) | Option a | ? |
| P3.3 | i18n : helper paramétré `{{ city }}` + ~5 forks éditoriaux | Oui | ? |
| PA.1 | Double couche Ville / Intercommunalité ? | Variable par ville (Marseille=oui, Paris=non, Lyon=N/A car unique) | ? |
| PA.2 | Scripts sync génériques + YAML config | Oui (1 YAML par ville, 3 scripts génériques) | ? |
| PA.3 | Landing `/` = redirect vers `/[1ère-ville]` ou vraie landing France ? | Redirect en v1, vraie landing en v1.5 | ? |
| PA.4 | Choropleth GeoJSON standard (pas paths SVG inline) | Oui, GeoJSON dans `public/data/geojson/[city]-arrondissements.geojson` | ? |

**Règle** : tant qu'une question n'est pas tranchée, ne pas la deviner ni l'inventer. Demander.

---

## 3. Phase 1 — Audit data exhaustif

**Objectif** : pour chaque page de la v1, identifier précisément les sources de chaque chiffre, chaque visualisation. Pas d'approximation.

**Livrable** : `docs/[city]-data-inventory.md` au format défini plus bas.

### 3.1 Checklist des sources à inventorier

Pour chaque catégorie ci-dessous, **localiser la source la plus à jour** + **télécharger un échantillon** + **noter le schéma exact** + **noter la fraîcheur**.

| Catégorie | Sources à enquêter | Note |
|---|---|---|
| **Budget** | Budget primitif M57 + Compte Administratif M57 | Format CSV row-level idéal (chap/nature/section/montant) |
| **AP/CP investissements** | Dataset CSV dédié OU rapport CA PDF (parsing in-session) | Paris a un dataset, Marseille en PDF — vérifier |
| **Marchés publics** | Dataset SCDL ville + DECP national consolidé | DECP national couvre tout mais tardivement |
| **Subventions associations** | SCDL ville + métropole | Les 2 sources se complètent |
| **Délibérations** | CSV ville (par année) ou scrape | Préférer CSV si dispo |
| **Logement social** | RPLS détaillé national + portail métropole | Géoloc commune/arrondissement |
| **Dette / patrimoine** | OFGL national + rapports CRC + données ville | OFGL est généralement suffisant |
| **Équipements** | data.gouv ville + portail métropole | Bâtiments institutionnels, écoles, etc. |
| **Population / IRIS** | INSEE FILOSOFI + base IRIS | Pour per-capita et choropleth tension |

### 3.2 Pour chaque source, documenter

```markdown
### [Nom de la source]
- **URL** : [lien vers le dataset]
- **Producteur** : [Ville / Métropole / État]
- **Format** : CSV / JSON / PDF / API ODS / API custom
- **Grain** : [unité de la ligne — ex: une AP par ligne, un marché par ligne]
- **Couverture temporelle** : [années]
- **Fréquence de maj** : [annuelle / trimestrielle / temps réel]
- **Schéma** : [colonnes principales, exemples]
- **Filtre nécessaire** : [SIRET / code INSEE / autre]
- **Statut** : ✅ disponible et à jour / ⚠️ partiel ou ancien / ❌ manquant
- **Mapping vers page front** : [/budget, /marches-publics, etc.]
```

### 3.3 PDFs à parser in-session

**Workflow standard** (pas d'appel LLM externe — voir mémoire `feedback_enrichment_in_session`) :

1. `pdftotext -layout [pdf] [txt]` (ou `pymupdf` si layout complexe)
2. Identifier les sections d'intérêt (tables financières, listes de projets, sections par arrondissement)
3. Stocker le `.txt` dans `pipeline/cache/pdf_extracts/[city]/[year]/`
4. Charger via Claude Code en session, structurer en JSONL → `pipeline/seeds/cities/[city]/seed_[domain]_pdf_[year].csv`
5. Le seed entre dans le pipeline raw → stg → core → mart comme une source normale

**Garder une option `--use-llm`** dans le script de structuration pour quiconque voudrait automatiser via Gemini/Claude API plus tard. Default OFF.

### 3.4 Critères d'acceptation phase 1

- [ ] Pour chaque page de la v1, on peut tracer chaque visualisation à une source précise
- [ ] La granularité géographique (P0.4) est confirmée : choropleth réalisable au niveau souhaité ou retombée sur granularité dispo
- [ ] Tous les trous sont listés explicitement (ex : "pas de fiches bailleurs nominatives") et leur impact UX est convenu (P3.2)
- [ ] Le doc `[city]-data-inventory.md` est mergé dans `docs/`

---

## 4. Phase 2 — Audit pipeline

**Objectif** : décider ce qui se généralise (refactor pipeline une seule fois) vs ce qui se forke (script city-specific).

**Livrable** : si la ville est la 2e à être ajoutée (Marseille post-Paris), produire `docs/pipeline-multi-cities-refactor.md` qui formalise le refactor générique. Pour les villes 3+, ajouter juste leur entrée dans les configs existantes.

### 4.1 Inventaire à faire

Pour chaque script de sync (`pipeline/scripts/sync/*`, `pipeline/scripts/fetch_*`) :

| Question | Décision |
|---|---|
| Source nationale (couvre toute la France) ou city-specific ? | Si nationale → script générique, ne pas dupliquer |
| Hardcodes Paris (SIRET, codes INSEE, dataset slugs) ? | Si oui → paramétrer ou forker |
| Schéma de réponse stable entre villes ? | Si non → adapter le stg, pas le sync |

Pour chaque modèle dbt (`pipeline/models/{stg,core,mart}/*.sql`) :

| Question | Décision |
|---|---|
| `core_*` a-t-il une colonne `commune_slug` ? | Si non → ajouter (P2.1) |
| Filtre `WHERE collectivite = 'Ville de Paris'` ? | À paramétrer via `var('city_slug')` |
| Source dépend d'un schéma Paris ? | Si oui → soit normaliser au stg, soit forker le stg |

Pour chaque seed (`pipeline/seeds/*.csv`) :

| Question | Décision |
|---|---|
| Contenu spécifique Paris (mappings, lieux connus) ? | Déplacer vers `pipeline/seeds/cities/paris/*.csv` |
| Standard national (M57 chart, fiscal_constants) ? | Garder à `pipeline/seeds/national/*.csv` |
| Cache LLM (vulgarisations, géoloc) ? | Reste générique, indexé par hash |

### 4.2 Refactor type pour 1ère ville additionnelle (Marseille post-Paris)

Liste indicative — voir `docs/pipeline-multi-cities-refactor.md` pour le détail :

1. Ajouter colonne `commune_slug` à tous les `core_*` Paris-only (~10 modèles SQL)
2. Réorganiser les seeds : `pipeline/seeds/cities/paris/`, `pipeline/seeds/cities/[city]/`, `pipeline/seeds/national/`
3. Refactor des 3 scripts sync hardcodés Paris :
   - `sync_opendata.py` → `sync_paris_opendata.py` (Paris-only) + `sync_ods_generic.py` (paramétré)
   - `fetch_subventions_opendata.py` → idem
   - `scrape_deliberations.py` → reste Paris-only (Marseille a des CSV directs, donc différent)
4. Ajouter le flag `--use-llm` (default OFF) à tous les `enrich_*_llm.py` et `vulgarize_*_llm.py`
5. Restructurer `seed_city_constants.csv` : passage de clés `paris_*` à format `(city_slug, key, value)`
6. Restructurer `methodology.json` exporté : `{ cities: { paris: {...}, [city]: {...} }, national: {...} }`

### 4.3 Refactor pour villes 3+ (après le 1er gros refactor)

Beaucoup plus court : ajouter juste un nouveau bloc de config + dérouler le pipeline. ~2-3 jours typiques.

### 4.4 Critères d'acceptation phase 2

- [ ] Le refactor générique (si nécessaire) est planifié et n'est pas dans la même PR que la ville cible
- [ ] Pour chaque source city-specific, le script de sync existe ou son adaptation est planifiée
- [ ] Les seeds spécifiques à la nouvelle ville sont identifiées (mapping_directions, lieux_connus, etc.)

---

## 5. Phase 3 — Audit UX/front

**Objectif** : identifier les composants à généraliser, les routes à créer, les i18n à paramétrer.

**Livrable** : si la ville est la 2e (Marseille), produire `docs/front-multi-cities-refactor.md`. Pour les villes 3+, ajouter juste l'entrée city dans les configs.

### 5.1 Refactor type pour 1ère ville additionnelle

1. **Routing** : créer `app/(city)/[city]/{budget,marches-publics,qui-recoit,...}/page.tsx`
2. **Loaders** : paramétrer `loadBudgetPageData(city, year?)` etc. dans `website/src/lib/fusion-data.ts`
3. **Data files** : restructurer `website/public/data/` en `data/[city]/budget_*.json`
4. **Choropleth** : `ParisChoropleth.tsx` → `DistrictChoropleth.tsx` paramétrable, GeoJSON externe par ville (`cityDistricts/[city].ts`)
5. **i18n** : extraire les ~50 clés avec "Paris" en dur en helpers paramétrés `{{ city }}`
6. **ScopeDropdown** : détecter `currentCity` depuis pathname, adapter les hrefs
7. **Constants** : `methodology.ts` → `cityMeta(slug).population` (lire depuis JSON pipeline)
8. **Redirects** : `next.config.ts` → `/budget` → `/paris/budget` (rétro-compat)

### 5.2 Pages dégradées (si donnée manque pour la ville cible)

Per P3.2, option a : la section qui manque disparaît de la page silencieusement. Pas de callout d'explication.

Exemples Marseille :
- `/marseille/logement-social` : choropleth + RPLS national, mais pas de section "fiches bailleurs" (pas de data nominative)
- `/marseille/investissements` : projets parsés du PDF CA, granularité arrondissement (pas adresse complète)

### 5.3 Critères d'acceptation phase 3

- [ ] Plan de refactor minimal (si nécessaire) listé fichier par fichier dans `docs/front-multi-cities-refactor.md`
- [ ] Pages dégradées identifiées (qu'est-ce qui manque, qu'est-ce qui s'affiche à la place)
- [ ] i18n : liste des ~5 clés vraiment éditoriales à forker explicitement

---

## 6. Phase 4 — POC vertical

**Objectif** : prouver que tout marche end-to-end sur **une seule page** avant de tout déployer.

**Page candidate par défaut** : `/[city]/budget`. C'est la plus rentable (data en CSV row-level, pipeline existant, viz Sankey/Treemap déjà data-driven).

**Périmètre POC** :
1. Sync CSV BP+CA ville (1 année suffit pour le POC)
2. Tables `raw.[city]_*`, `stg_*` paramétré, `core_budget` avec `commune_slug`
3. Mart Sankey ville
4. Export `data/[city]/budget_*.json`
5. Route `/[city]/budget` qui affiche le Sankey
6. ScopeDropdown qui switch entre villes en gardant le top de page identique

**Critère POC = GO pour Phase 5** :
- Switch ScopeDropdown fonctionne (URL change, contenu change, header reste)
- Données budget ville affichées sans hardcode résiduel
- Le 2e fichier de sync (vers la 2e source ville) se fait en <2h, pas 2 jours
- Aucune surprise architecturale (sinon retour phase 2 ou 3)

**Effort POC : 3-4 jours.**

---

## 7. Phase 5 — Implémentation complète

Ne pas planifier en détail avant le POC. Les vraies surprises arrivent en POC.

**Ordre recommandé** des pages à dérouler après le POC :
1. Le POC `/[city]/budget` ✅
2. `/[city]/marches-publics` (DECP national + dataset ville si dispo)
3. `/[city]/qui-recoit` (subventions ville + métropole)
4. `/[city]/analyses` (pur éditorial, ré-écrire articles ou en démarrer de nouveaux)
5. `/[city]/investissements` (PDF parsing in-session pour AP/CP)
6. `/[city]/logement-social` (RPLS, dégradé sans bailleurs nominatifs si pas dispo)
7. `/[city]/dette-patrimoine` (OFGL + CRC, dégradé sans CRC en série si pas dispo)
8. Landing `/[city]` (vue agrégée des 7 pages ci-dessus)

**Estimation typique : 12-18 jours** pour les 8 pages, plus i18n EN en parallèle (mémoire `feedback_i18n_en_parallel`), tests, déploiement.

---

## 8. Mode "prompt agent" — utilisation par un agent autonome

Pour démarrer une nouvelle ville sans humain, on peut donner ce playbook à un agent (Claude Code) avec ce prompt :

```
Tu vas piloter la transposition du site France Open Data à la ville de [CITY].

Lis d'abord :
1. docs/city-replication-playbook.md (ce doc) — le processus
2. memory project_marseille_v1_decisions.md — les défauts à reprendre
3. memory feedback_enrichment_in_session.md — le mode d'enrichissement
4. memory feedback_no_hardcoded_numbers.md — la promesse d'auditabilité
5. memory feedback_pipeline_no_bypass.md — la discipline raw→stg→core→mart

Phase 0 : produis un tableau des 12 décisions avec les defaults Marseille en colonne de référence et une colonne pour [CITY]. Pose les questions au porteur produit pour les éventuelles déviations. Ne pas inventer.

Phase 1 : enquête data exhaustive sur [CITY]. Livrable : docs/[city]-data-inventory.md au format défini.

Phase 2-3 : si ville 3+ (refactor pipeline et front déjà fait), inventaire light. Si ville 2e, produire les docs de refactor générique.

Phase 4 : POC vertical sur /[city]/budget, end-to-end. Critère go documenté.

Phase 5 : déroule les 7 pages restantes en série, en respectant la discipline pipeline et la promesse zéro chiffre hardcodé.

Important :
- Tout enrichissement (PDF parsing, classification thématique) se fait in-session avec Claude Code, pas via Gemini API. Garder un flag --use-llm OFF par défaut.
- Travailler dans le clone canonical /Users/daniel/code/open-public-data/, pas Desktop
- Ne pas pousser de PR sans validation utilisateur
- Toute UI modifiée → screenshot Playwright + relecture (mémoire feedback_ui_self_review)
```

---

## 9. Anti-patterns connus à éviter

Issus des leçons Paris (et de Marseille en cours) :

- **Inventer un grain géographique** que la donnée n'a pas. Si Marseille publie au secteur (8) et qu'on choroplethe au niveau arrondissement (16), on ment. Toujours retomber sur la granularité réelle.
- **Bypasser le layering** raw → stg → core → mart. Pas de JSON direct depuis un scrape vers la UI. Pas de seed cache utilisé en input ET output dans la même run.
- **Hardcoder une métrique factuelle** dans le frontend (population, seuils, ratios). Tout passe par pipeline → JSON.
- **Inventer des géolocs ou des données manquantes** parce que "ça serait mieux". Si la donnée n'existe pas, la section disparaît silencieusement (P3.2 option a).
- **Oublier l'i18n EN** en cours de session. Toute clé FR ajoutée → remplir EN dans la même session (mémoire `feedback_i18n_en_parallel`).
- **Forker tout par ville** plutôt que généraliser. La 2e ville force le refactor générique. La 3e ville doit être beaucoup plus courte que la 2e — sinon on a mal généralisé.
- **Faire du callout "Cette ville n'a pas X"**. Trop bavard, trop méta. Si X manque, X disparaît, point.

---

## 10. Notes pour l'évolution de ce playbook

Après chaque ville déployée, mettre à jour ce playbook avec :
- Surprises rencontrées qui auraient dû être détectées plus tôt
- Sources nationales découvertes que les futures villes peuvent réutiliser
- Patterns de PDF parsing qui marchent bien et peuvent se réutiliser

Ce doc est vivant. La transposition Paris → Marseille a permis de l'écrire. Lyon, Toulouse, Bordeaux le testent et l'améliorent.
