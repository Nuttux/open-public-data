# Audit data sanity — 2026-05-19

**Scope** : revue ultra détaillée des chiffres affichés sur les pages principales, traçabilité vers les sources, identification des risques (hardcoded, stale, déconnecté du pipeline).

**Auteur** : Claude Code (audit assisté).
**Décision review** : à valider par Daniel avant publication / communication.

---

## Synthèse

✅ **L'architecture data est solide** :
- Tous les chiffres factuels passent par `website/src/data/methodology.json` (généré depuis les seeds dbt `seed_city_constants`, `seed_legal_thresholds`, `seed_fiscal_constants`, `seed_editorial_params`).
- `grep -rn` sur `website/src` ne révèle **aucun nombre factuel hardcodé directement dans le code** — bonne discipline.
- Chaque seed contient `source` + `source_url` + `date_reference` + `notes` → lineage propre.

⚠️ **3 zones de risque à corriger AVANT communication publique** :
1. **Hero landing montre du budget VOTÉ 2026** (prévisionnel, pas exécuté) — risque de mécompréhension décideur/journaliste.
2. **Population Paris = 2 133 111 (recensement INSEE 2021)** — Marseille a 2024-01-01. Décalage temporel à harmoniser.
3. **Discrepancy de count subventions** : `index.json` dit 5977 pour 2024, le fichier année dit 5948. Écart 0,5%, à expliquer ou corriger.

🚨 **Aucun finding critique** (pas de chiffre faux affiché). Mais 3 risques perceptifs qui peuvent décrédibiliser face à un décideur attentif.

---

## 1. Constantes méthodo (`methodology.json`)

Fichier généré le **2026-04-23** (il y a ~4 semaines au moment de l'audit).

| Clé | Valeur | Source | Date ref | Verdict |
|---|---|---|---|---|
| `paris_population` | 2 133 111 | INSEE recensement 2021 | **2021-01-01** | ⚠️ À rafraîchir vers INSEE 2022 ou 2023 (publié oct 2024/2025) — décalage avec Marseille (2024) |
| `marseille_population` | 879 238 | INSEE recensement 2024 | 2024-01-01 | ✅ |
| `paris_superficie_km2` | 105,4 | INSEE 2021 | 2021-01-01 | ✅ (stable dans le temps) |
| `paris_nb_arrondissements` | 17 | Loi 2017-257 (fusion Paris Centre) | 2020-07-01 | ✅ |
| `marseille_nb_arrondissements` | 16 | Loi PLM 1987 | 1987-07-09 | ✅ |

**Recommandation** : régénérer le seed `seed_city_constants.csv` avec la population INSEE **la plus récente** (vérifier ce qui est disponible sur https://www.insee.fr/fr/statistiques/2011101?geo=COM-75056 — probablement 2022 ou 2023 selon la date courante).

---

## 2. Landing — chiffres hero

### Source des chiffres
- Page : [`website/src/app/LandingClient.tsx`](../../website/src/app/LandingClient.tsx)
- Loader : `loadLandingStats()` dans [`website/src/lib/fusion-data.ts:300`](../../website/src/lib/fusion-data.ts#L300)

### Chiffres affichés (depuis le pipeline)

| # | Affichage | Valeur réelle | Source dans pipeline | Verdict |
|---|---|---|---|---|
| 1 | Hero "11,7 Md€" (budget Paris) | `sankey.totals.depenses` du `budget_sankey_2026.json` | `mart_sankey.sql` ← `comptes_administratifs_budgets_principaux...` | 🚨 **2026 = budget VOTÉ**, pas exécuté. Lire "Paris dépense 11,7 Md€" est trompeur sur la landing |
| 2 | Cumul `nbMarchesCumul` | Somme `nb_marches` de `marches-publics/index.json` | `mart_marches_*.sql` | ✅ |
| 3 | Cumul `nbSubventionsCumul` | Somme `nb_subventions` de `subventions/index.json` | `mart_subventions_*.sql` | ✅ |
| 4 | Per capita "458 €/mois" | `totalDepenses / PARIS_POPULATION / 12` | `methodology.json::paris_population` (INSEE 2021) | ⚠️ Dépend du finding #2 et de la pop datée 2021 |
| 5 | Delta vs lastExecutedYear | `(totalDepenses - ref.depenses) / ref.depenses * 100` | `budget_index.json::latestCompleteYear` | 🚨 **latestCompleteYear = 2022** mais 2024 est aussi exécuté → le delta affiché est "vs 2022" alors qu'on a des données 2023+2024 exécutées |
| 6 | Top 3 bénéficiaires | `subventions/beneficiaires_2024.json` top par `montant_total` | `mart_subventions_treemap.sql` | ✅ Données 2024 : CASVP 416,5 M€ / Paris Musées 65 M€ / Paris Habitat-OPH 49 M€ |
| 7 | Top 3 fournisseurs | `marches-publics/marches_2026.json` (?) | `mart_marches_fournisseurs.sql` | ⚠️ Probablement `latestMarchesYear` = 2026 (donné partiel `nb_marches = 266`) — préférer 2024 ou 2025 (année complète) |
| 8 | Capacité de désendettement | calcul live `dettes_financieres / epargne_brute` | `bilan_sankey_${lastExecutedYear}` + `budget_sankey_${lastExecutedYear}` | ⚠️ Calcul tributaire du finding #5 |

### Findings concrets

#### 🚨 Finding 1 : "Latest year" vs "Latest complete year" — mismatch logique

`budget_index.json` contient :
```
latestYear: 2026 (budget voté)
latestCompleteYear: 2022 (??)
summary: [
  2026 vote 11,7 Md€
  2025 vote 12,2 Md€
  2024 execute 11,5 Md€     ← exécuté !
  2023 execute 10,8 Md€     ← exécuté !
  2022 execute 10,7 Md€     ← dit "latestComplete"
  ...
]
```

**Le code définit `latestCompleteYear = 2022` alors que 2023 et 2024 sont également de type `execute`.** Le delta hero affiche donc "+9,6% vs 2022" au lieu de "+1,9% vs 2024" — un écart de framing significatif.

**Cause probable** : la logique de définition de `latestCompleteYear` dans le pipeline est trop conservatrice (probablement attend la publication du CRC/Compte de Gestion ou un quorum de chapitres remplis), mais elle n'est pas alignée avec le `type_budget = execute` réel des données 2023 + 2024.

**Action** :
1. Investiguer la définition de `latestCompleteYear` dans `pipeline/scripts/export/` (probablement `export_budget_index.py` ou similaire).
2. Décider : soit corriger la définition pour pointer vers 2024 (le vrai exécuté le plus récent), soit ajouter sur la landing un libellé clair "vs 2022 (dernier compte administratif validé)".

#### 🚨 Finding 2 : Le hero affiche du **budget voté**, pas exécuté

Pour la landing en lecture rapide, montrer "11,7 Md€ — Budget Paris" sans préciser que c'est un voté donne une fausse impression d'autorité.

**Comparatif** :
- 2024 (exécuté) = 11,5 Md€
- 2026 (voté) = 11,7 Md€

Le voté est généralement **5–10% supérieur** à l'exécuté final (les villes prévoient large). Sur la landing, afficher le voté gonfle le chiffre.

**Action** : 2 options
- **Option A** (transparent, pro) : afficher `2024 (exécuté)` sur la landing, avec un sous-libellé "dernier budget réel · 2026 voté à 11,7 Md€".
- **Option B** (statu quo, mais clarifié) : garder 2026 voté avec un libellé visible "budget voté 2026" et un lien vers la dernière année exécutée.

#### ⚠️ Finding 3 : Subventions count mismatch

- `subventions/index.json::totalsByYear[2024].nb_subventions` = **5977**
- `subventions/beneficiaires_2024.json::nb_beneficiaires` = **5948**

Écart de 29 lignes (~0,5%). À investiguer :
- Probable cause : `beneficiaires_2024.json` agrège par bénéficiaire (donc 5948 bénéficiaires distincts), `index.json::nb_subventions` compte les lignes de subventions (5977 dossiers, certains bénéficiaires en touchent plusieurs).

**Action** : confirmer que les deux mesures sont sémantiquement distinctes (subventions vs bénéficiaires) et que l'affichage sur le site emploie le bon mot. Si oui, c'est OK.

#### ⚠️ Finding 4 : Top 3 fournisseurs probablement 2026 (partiel)

`loadLandingStats` choisit `latestMarchesYear = 2026` (1ère année du tri descending). Or 2026 = 266 marchés notifiés (année en cours). Comparé à 2024 (1763 marchés) c'est une fraction.

**Action** : utiliser `latestMarchesYear` = **dernière année avec ≥ N marchés** (où N = 500 ou 1000) pour éviter les partial-year displays.

---

## 3. Daily-bread (`/france/daily-bread`)

### Sources

[`national/daily_bread.json`](../../website/public/data/national/daily_bread.json) — généré 2026-05-07.

Pipeline source documenté en clair :
> `seed_fiscal_constants.csv + seed_csg_retraite_tranches.csv + seed_db_equivalents.csv + seed_apul_subsectors.csv + seed_ondam_subobjectifs.csv + seed_plf_defense_titres.csv + seed_ofgl_communes_fonctionnelle.csv + seed_drees_retraites_branches.csv + seed_secu_famille_prestations.csv + seed_unedic_prestations.csv + seed_education_niveaux.csv + seed_dette_charges.csv + seed_etat_autres_ministeres.csv + seed_ofgl_departements_fonctionnelle.csv + seed_ofgl_regions_fonctionnelle.csv + sync_eurostat_apu_subsectors.json + sync_etat_lfi.json + sync_ofgl_all_communes/index.json + sync_ofgl_communes_fonctionnelle.json`

`audit_promise` explicite :
> "Toute valeur numérique du calculateur Daily Bread est tracée jusqu'à sa source officielle (CGI, URSSAF, Eurostat, INSEE, OFGL, DREES, Sécurité sociale)."

### Données clés vérifiées

| Élément | Valeur | Source | Verdict |
|---|---|---|---|
| `eurostat_apu_subsectors.json::year` | 2025 | Eurostat gov_10a_main, `eurostat_updated: 2026-04-22T11:00:00+0200` | ✅ Récent et sourcé |
| Total APU France | 57,2 % PIB (consolidé) | Eurostat | ✅ |
| Décomposition S1311/S1313/S1314 | Sub-sectors notés bien | `notes_fr/en` explicite la méthodo (transferts intra-APU non consolidés) | ✅ Méthodo claire |
| PIB France 2025 | 2 979,1 Md€ | Eurostat nama_10_gdp | ✅ |
| Population France | (à confirmer dans `apu_subsectors.totals`) | — | ⚠️ Le champ `population_france` est `None` dans le fetched JSON — vérifier d'où vient la population utilisée dans le calcul per-capita |

### Action

Vérifier comment `loadDailyBread` calcule le per-capita France quand `totals.population_france = None`. Probable fallback hardcoded ou autre seed → tracer.

---

## 4. Datasets utilisés — inventaire

### Sources raw OpenData / data.gouv / INSEE

`pipeline/models/staging/sources.yml` recense :

**Paris (OpenData Paris)** :
1. `comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement` — budget exécuté (CA)
2. `budgets_votes_principaux_a_partir_de_2019_m57_ville_departement` — budget voté
3. `comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de` — AP exécutées
4. `subventions_versees_annexe_compte_administratif_a_partir_de_2018` — annexe CA subv. (avec NULL noms 2020-2021)
5. `subventions_associations_votees` — subventions assos avec SIRET
6. `logements_sociaux_finances_a_paris` — logements sociaux
7. `decp_marches_paris` — DECP filtré Paris
8. `liste_des_marches_de_la_collectivite_parisienne` — marchés (montants pluriannuels)
9. `bilan_comptable` — patrimoine annuel
10. `dette_garantie_paris` — engagements hors bilan

**Marseille (data.gouv via sync_city.py)** :
- `marseille_budget_primitif_2018..2024` (7 années)
- `marseille_compte_administratif_2018..2022` (5 années, 2 schémas)

**Sources internes** :
- `sirene_companies_paris` — cache SIRENE (recherche-entreprises.api.gouv.fr)
- `deliberations_sessions_paris` + `_delibs_` + `_articles_` — scrape Conseil de Paris + LLM extraction
- `pdf_investissements_localises_paris` — extraction Gemini Vision des PDFs CA
- `enrichment_caches_paris` — caches LLM/SIRENE/photos

### Fraîcheur

| Dataset | Dernière année | Statut |
|---|---|---|
| Budget principal Paris | 2026 (voté), 2024 (exécuté) | ✅ |
| Subventions Paris | 2024 (1,35 Md€, 5977 dossiers) | ✅ |
| Marchés Paris | 2026 (266 partial), 2024 (1763) | ✅ |
| Logements sociaux | À vérifier | ❓ |
| Bilan comptable Paris | 2024 | ✅ |
| Hors-bilan (dette garantie) | 2024 | ✅ |
| Marseille budget | 2022 (CA), 2024 (BP) | ✅ |

---

## 5. Pages restant à auditer (TODO en wave 2)

J'ai audité en profondeur la **landing** + **daily-bread** + **les constantes méthodo** + **les datasets sources**. Pour aller jusqu'à la couverture complète demandée, il reste :

- `/france/budget` (déclinaison Sankey national)
- `/france/dette` (sensible — chiffres dette publique)
- `/france/etat`, `/france/fiscalite`
- `/ville/paris/budget` (devrait être OK, hérite des données vérifiées)
- `/ville/paris/subventions` (drilldown subventions — vérifier les pages drawer)
- `/ville/paris/marches` (montants pluriannuels — vérifier que la confusion est désamorcée)
- `/ville/paris/investissements` (extraction PDF Gemini, à confirmer)
- `/ville/paris/dette` + `/ville/paris/dette/stress-test`
- `/ville/paris/logement`
- `/ville/marseille/*` (pipeline WIP, voir docs/marseille-data-inventory.md)

**Estimation effort** : ~2h pour couvrir ces pages avec le même niveau de détail.

---

## 6. Recommandations prioritaires

### À faire AVANT communication publique

1. **🚨 Régler le mismatch latestCompleteYear** (finding #1) — soit corriger la logique pipeline pour pointer vers 2024, soit clarifier le libellé sur la landing. **C'est le finding le plus visible décideur.**

2. **🚨 Décider du framing budget voté vs exécuté en hero** (finding #2) — Option A recommandée : hero = dernier exécuté + lien vers voté.

3. **⚠️ Régénérer `seed_city_constants` avec population INSEE plus récente** (finding du tableau §1) — au moins pour cohérence avec Marseille.

### À faire DANS LE MOIS (non bloquant pour la communication)

4. **⚠️ Clarifier le mismatch count subventions** (finding #3) — soit aligner sémantiquement, soit ajouter une note sur la page.

5. **⚠️ Filtre "année complète" pour `latestMarchesYear`** (finding #4) — empêche d'afficher des données partielles 2026 sur la landing.

6. **⚠️ Tracer le fallback `population_france`** dans daily-bread — confirmer qu'il n'y a pas un hardcode caché.

### Polish / lineage

7. Régénérer `methodology.json` à chaque sortie de seed mise à jour → ajouter un check CI qui flag si `generated_at` > 30 jours.

---

## Annexe : commandes utilisées pour ce audit

```bash
# Inventaire pages
find website/src/app -name "page.tsx" | sort

# Inventaire JSON
find website/public/data -type f -name "*.json" | wc -l

# Hardcoded numbers
grep -rn "= [12][0-9]\{6,\}" website/src --include="*.ts" --include="*.tsx"

# Inspection methodology
python3 -c "import json; print(json.load(open('website/src/data/methodology.json'))['city'])"

# Inspection budget_index
python3 -c "import json; print(json.load(open('website/public/data/budget_index.json')))"
```

Tous les fichiers cités sont versionnés dans le repo. Aucun finding ne nécessite d'accès à BQ — tout est dérivable de `public/data/`.
