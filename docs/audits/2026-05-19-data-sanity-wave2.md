# Audit data sanity — wave 2 — 2026-05-19

**Suite de** [2026-05-19-data-sanity.md](./2026-05-19-data-sanity.md) (wave 1).

**Scope** : pages drill (France national + Paris drill + Marseille) que la wave 1 n'avait pas couvertes.

---

## Synthèse

### 🚨 Critique
- **`/logement-social` Paris** : violation de la promesse "zéro chiffre hardcodé". `sruRatio = 24.5`, `stockTotal = 258_400`, `sruYear = 2024`, **5 parts de marché bailleurs `share: X`** hardcoded dans `fusion-data.ts:3060-3080`. Sourced uniquement en **commentaire** ("source : DDT Paris"), pas en fichier JSON avec `source_url`.

### ⚠️ Risque perceptif
- **`/marches-publics` Paris** : KPI hero affiche `enveloppe_max_totale` (somme des montants max pluriannuels) sans disclaimer visible. Le commentaire interne du JSON dit *"Les montants sont des enveloppes pluriannuelles (plafonds contractuels), pas des dépenses annuelles"* — mais l'utilisateur ne le voit pas.
- **Marseille** : aucun disclaimer "WIP" affiché alors que la roadmap est explicite sur le statut v1 partiel. Les pages `/ville/marseille/{dette,investissements,logement}` existent en route mais leur statut data n'est pas signalé visuellement.

### ✅ OK
- **`/france/budget`, `/france/daily-bread`** : architecture data solide (cf wave 1).
- **`/ville/paris/budget`** : year picker propre, source CA Paris tracée jusqu'au mart `mart_sankey.sql`.
- **`/ville/paris/dette` + `/dette-patrimoine`** : bilan annuel, calcul capacité désendettement multi-source.
- **`/ville/paris/qui-recoit` (subventions)** : data CA annexe, delta vs année comparable bien posé.
- **`/ville/paris/investissements`** : AP exécutées avec tendances pluriannuelles, delta 5 ans tracé. **Petit caveat** : les AP représentent ~10% du budget d'investissement total (commentaire dans `sources.yml`), à clarifier visuellement.
- **Marseille pages publiées** (budget, bilan, marches, subventions) : **données réelles** — vérifié manuellement : top bénéficiaires 2017-2022 = CCAS Marseille, ESPM, Soc. Marseillaise de Restauration, etc. (vrais organismes, montants cohérents).

---

## 1. Pages France

### `/france/budget` (Sankey national)
| Hero/KPI | Source |
|---|---|
| Total dépenses APU consolidé | `national/eurostat_apu_subsectors.json::totals.s13_consolidated_pct_gdp` |
| PIB référence | `gdp_total_md_eur` (Eurostat nama_10_gdp) |
| Ventilation S1311/S1313/S1314 | sub_sectors du même fichier |

**Verdict** ✅ — Audit promise explicite dans `national/daily_bread.json::audit_promise`. Sources Eurostat, INSEE, OFGL, DREES toutes citées.

### `/france/dette`
À auditer en wave 3 (pas couvert ici, mais utilise probablement `dette_charges` seed + INSEE dette publique).

### `/france/etat`, `/france/fiscalite`
À auditer en wave 3.

---

## 2. Pages Paris drill

### `/ville/paris/budget` ✅
- **Loader** : `loadBudgetPageData(year)`
- **Source JSON** : `budget_sankey_${year}.json`, `budget_index.json`, `budget_nature_${year}.json`
- **dbt mart** : `mart_sankey.sql`, `mart_budget_nature.sql`
- **Source raw** : `comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement` (CA exécuté), `budgets_votes_principaux_*` (BP voté)
- **Year picker** indique le type (vote/execute) — pas le risque de la landing.

### `/ville/paris/marches` ⚠️
- **Hero KPI** : `enveloppe_max_totale` (somme des montants max signés)
- **Source JSON** : `marches-publics/marches_${year}.json`
- **Source raw** : `liste_des_marches_de_la_collectivite_parisienne`
- **Risque** : ces montants sont des **enveloppes pluriannuelles** (un marché signé en 2020 pour 4 ans à 100 M€ apparaît à 100 M€ en 2020 dans le hero). Le commentaire de `sources.yml` est explicite mais **invisible côté UX**.
- **Action recommandée** : badge ou note **dans le hero** : *"Enveloppes pluriannuelles — pas une dépense annuelle"*. Existe peut-être dans le texte de la page (à vérifier visuel), mais le KPI lui-même devrait porter une tooltip.

### `/ville/paris/subventions` (qui-recoit) ✅
- **Loader** : `loadQuiRecoitData(year)`
- **Hero KPI** : total montant année + nb bénéficiaires + médiane
- **Source JSON** : `subventions/beneficiaires_${year}.json`, `subventions/index.json`
- **Source raw** : `subventions_versees_annexe_compte_administratif_a_partir_de_2018`
- Year picker, delta vs année comparable, traçabilité OK.

### `/ville/paris/investissements` ✅ avec caveat
- **Hero KPI** : total investissements année + nb projets + % géolocalisés
- **Source JSON** : `investissement_tendances.json`, `map/investissements_complet_${year}.json`
- **Source raw** : `comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de`
- **Caveat connu** : *"Représente ~10% du budget d'investissement total"* (cf `sources.yml`). À expliciter dans la page si pas déjà fait.

### `/ville/paris/dette` + `/dette-patrimoine` ✅
- **Hero KPI** : dette financière totale, capacité désendettement, fonds propres
- **Source JSON** : `bilan_sankey_${year}.json`, `hors_bilan_${year}.json`
- **Source raw** : `bilan_comptable`, `dette_garantie_paris`
- Calcul capacité désendettement = `dette_financiere / epargne_brute` cross-source — bien fait.

### `/ville/paris/logement` 🚨 CRITIQUE
**Code source** : [`website/src/lib/fusion-data.ts:3076-3080`](../../website/src/lib/fusion-data.ts#L3076-L3080)

```ts
// SRU officiel : Paris à 24,5 % au 31/12/2024 (source : DDT Paris).
// Figé à l'inventaire le plus récent même si l'utilisateur sélectionne une
// année antérieure dans le YearPicker — pas de jeu de valeurs historiques
// dans nos sources ouvertes actuelles.
const sruRatio = 24.5;        // 🚨 HARDCODED
const sruTarget = 25;         // OK (cible légale = constante)
const sruYear = 2024;         // 🚨 HARDCODED
// Stock SRU inventaire 2024 : 258 400 logements sociaux sur 1 055 000 résidences principales
const stockTotal = 258_400;   // 🚨 HARDCODED
```

Plus haut, dans le tableau `bailleursAll` : **5 entrées avec `share: X`** hardcoded (parts de marché 49% / 18% / 14% / 7% / 6%) — chiffre **éditorial** sans source DDT précise.

**Violation** : feedback `feedback_no_hardcoded_numbers.md` qui pose la règle *"toute métrique factuelle passe par pipeline → JSON avec source/source_url (promesse Open Data Paris)"*.

**Risque communication** : un journaliste curieux qui clique sur "comment ce chiffre est sourcé ?" verra un fichier markdown wave 2 (donc cet audit) qui dit que c'est hardcoded — pas top.

**Fix recommandé** :
1. Créer un seed `seed_sru_paris.csv` avec colonnes `year, ratio, target, stock_total, source, source_url, date_reference`
2. Ajouter à `methodology.json` via `export_methodology.py`
3. `loadLogementSocialData` lit depuis `methodology` au lieu de hardcoder
4. Idem pour les parts bailleurs (créer `seed_bailleurs_paris_shares.csv`)

Effort estimé : ~1h (seed CSV + une modif loader).

**Note** : la partie `tension` (DRIHL) est **bien sourcée** (`logement_attente_paris.json` avec `source` + `source_url`). C'est juste la partie SRU + bailleurs shares qui dérape.

---

## 3. Marseille

### Pages publiées avec data réelles ✅
- `/ville/marseille/budget` — `marseille_compte_administratif_*` (réel, 2018-2022)
- `/ville/marseille/bilan` (patrimoine) — `marseille_bilan_*`
- `/ville/marseille/marches` — data.gouv DECP filtré Marseille
- `/ville/marseille/subventions` — vérifié manuellement : top bénéficiaires 2017-2022 = CCAS Marseille (10 M€), ESPM, Soc. Marseillaise de Restauration (8 M€) — **données réelles, pas dummy**.

### Pages avec status data ambigu ⚠️
- `/ville/marseille/dette`, `/ville/marseille/investissements`, `/ville/marseille/logement` : routes existent dans `app/`, mais à vérifier si data publiée ou placeholder. **Pas couvert dans cet audit**.

### ⚠️ Pas de disclaimer WIP visible
La memory `project_marseille_v1_decisions.md` (2026-05-07) acte que Marseille est en v1 partiel. La page `/ville/marseille` ne porte pas de bandeau ou note du genre *"v1 — datasets en cours de complétion, périmètre partiel"*. Un visiteur arrivant directement sur une page Marseille n'a pas d'indication.

**Fix recommandé** : composant `<WipBadge city="marseille">` réutilisable, affiché sur les pages Marseille tant que la v1 n'est pas validée complète. Peut être lié à un seed `seed_city_status.csv`.

---

## 4. Recommendations consolidées (wave 1 + wave 2)

Reclassement par priorité, en intégrant les findings de la wave 1 déjà traités :

### 🚨 À faire avant communication
| # | Item | Status |
|---|---|---|
| 1 | Lede landing transparent (vote vs execute, depuis YYYY) | ✅ Fait (PR #40 mergée) |
| 2 | Population Paris INSEE 2022 | ✅ Fait (PR #40) |
| 3 | `latestCompleteYear` désaligné (wave 1 finding #2) | ⏸ À investiguer pipeline |
| 4 | `/logement` hardcoded (sruRatio, stockTotal, parts bailleurs) | ⏸ **wave 2 finding critique** |

### ⚠️ À faire dans le mois
| # | Item | Effort |
|---|---|---|
| 5 | Disclaimer "enveloppes pluriannuelles" sur hero `/marches-publics` | 30 min |
| 6 | Disclaimer WIP visible sur pages Marseille | 1h |
| 7 | `latestMarchesYear` filtre "année complète" pour landing | 30 min |
| 8 | Clarifier count subventions index vs file (wave 1) | 15 min |
| 9 | Tracer fallback `population_france = None` dans daily-bread | 1h |

### Polish
| # | Item |
|---|---|
| 10 | Check CI : alert si `methodology.json::generated_at` > 30j |
| 11 | Audit wave 3 : `/france/{dette, etat, fiscalite}` |
| 12 | Audit wave 4 : pages drill Paris (drawer, fournisseur, contrat, association, theme) |

---

## Conclusion

**Sur 10 pages auditées en wave 2** :
- ✅ **7 OK** (architecture data propre, sources tracées)
- ⚠️ **2 risques perceptifs** (marchés pluriannuels, Marseille WIP non signalé)
- 🚨 **1 critique** (logement social hardcoded — violation de la promesse "zéro hardcoded")

**Wave 1 + wave 2 = ~15 pages couvertes, le reste (drill pages, France etat/fiscalite) en wave 3.**

Le projet est en bon état data — la majorité des pages respectent la convention seed → methodology.json → loader → page. Le finding critique sur `/logement` est concentré sur ~10 lignes de code, fix rapide.
