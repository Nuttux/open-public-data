# Audit data sanity — wave 3 — 2026-05-20

**Suite de** [wave 1](./2026-05-19-data-sanity.md) + [wave 2](./2026-05-19-data-sanity-wave2.md) + audit éditorial.

**Scope wave 3** : pages drill Paris (drawer fiches), pages nationales France (`/france/{etat,fiscalite,dette}`), pages Marseille pas encore couvertes (dette, investissements, logement).

---

## Synthèse

✅ **Très bon état après waves 1+2** — les fixes appliqués (PR #40, #42, #44, #46) ont réglé tous les findings critiques. Wave 3 confirme : architecture data propre sur l'ensemble du site.

⚠️ **1 finding mineur** :
- `dette/stress-test/page.tsx:54` : fallback hardcodé `?? 2.4` pour le taux baseline si `structure_dette.taux` est null. Edge case (la valeur réelle est lue normalement quand les data sont présentes), mais viole strictement la promesse "zéro hardcoded".

🚨 **Aucun finding critique.** Le bandeau WIP Marseille (PR #46) couvre les sections silencieuses des pages Marseille incomplètes.

---

## 1. Pages France national

| Page | Loader | Source JSON | Source officielle | Verdict |
|---|---|---|---|---|
| `/france/etat` | `loadEtatLFI()` | `national/etat_lfi_2025.json` | data.economie.gouv.fr — PLF25 dépenses par destination | ✅ source claire, 34 missions, year 2025 |
| `/france/fiscalite` | `loadEurostatFiscalite()` | `national/eurostat_fiscalite.json` | Eurostat — gov_10a_taxag (year 2024, fetched 2026-05-01) | ✅ source_url officielle, notes méthodo FR/EN, peer compare européen |
| `/france/dette` | `loadEurostatDette()` | `national/eurostat_dette.json` | Eurostat — gov_10q_ggdebt (fetched 2026-05-01) | ✅ |

**Verdict France national** : architecture data propre, tous les JSON ont `source` + `source_url` + `fetched_at`. Pas de hardcoded, pas de stale (toutes les données ont été fetched dans les 3 dernières semaines).

---

## 2. Paris drill (drawer + fiches)

11 pages auditées :

| Page | Loader | Pattern | Verdict |
|---|---|---|---|
| `subventions/association/[slug]` | `loadAssociation()` | Filtre du parent par name + agrège années/thèmes | ✅ |
| `subventions/theme/[slug]` | `loadThemeSubventions()` | Treemap parent filtré par thème | ✅ |
| `marches/contrat/[numero]` | `loadContrat()` + `loadContratRanking()` | Scan cross-années, ranking calculé dynamiquement | ✅ |
| `marches/fournisseur/[siren]` | `loadFournisseur()` | Agrégation par SIREN | ✅ |
| `marches/categorie/[slug]` | `loadMarcheCategorie()` | Filtre par category_libelle | ✅ |
| `investissements/projet/[id]` | `loadProjet()` | + résolution photo + vulg + marchés liés | ✅ |
| `investissements/chapitre/[slug]` | `loadChapitre()` | Filtre + agrège montants | ✅ |
| `investissements/arrondissement/[num]` | `loadArrondissement()` | Agrégation par arr | ✅ |
| `logement/arrondissement/[arr]` | `loadArrondissementLogement()` | Slug validation (1-20 ou paris-centre) | ✅ |
| `dette/bailleur/[slug]` | `loadBailleur()` | Filtre slug | ✅ |
| `dette/stress-test` | `loadPatrimoineData()` | force-dynamic, searchParams | ⚠️ fallback 2.4% hardcodé |

### ⚠️ Finding : stress-test fallback hardcoded

[`page.tsx:54`](../../website/src/app/ville/paris/dette/stress-test/page.tsx#L54) :

```ts
const tauxBaseline = structure?.structure_dette.taux.taux_fixe_moyen_pondere_pct ?? 2.4;
```

**Contexte** : si `structure_dette.taux` est null (cas rare — quand un export pipeline est partiel), le composant `tauxBaseline` reçoit 2,4% en fallback. Pas un mensonge — c'est une estimation raisonnable pour la dette à taux fixe parisienne historique — mais hardcoded.

**Fix recommandé** (optionnel, low priority) :
- Soit ajouter `paris_dette_taux_baseline_fallback` à `seed_city_constants.csv` avec source (rapport CRC ou similaire)
- Soit retirer le fallback et afficher un message "Donnée taux indisponible — réessayer ultérieurement" si null

Effort : 15 min. **Pas un blocker communication** car c'est un edge case.

---

## 3. Marseille restantes (dette, investissements, logement)

| Page | Loader | Données | Statut |
|---|---|---|---|
| `marseille/dette` | `loadPatrimoineData(..., "marseille")` | OFGL national (INSEE 13055) | ✅ Données réelles |
| `marseille/investissements` | `loadInvestissementsData(..., "marseille")` | PDF CA Marseille 2023-2024 | ✅ Granularité limitée (arrondissement, pas adresse) |
| `marseille/logement` | `loadLogementSocialData(..., "marseille")` | RPLS atlas Métropole AMP | ✅ |

**Limitations POC v1 connues** (déjà documentées en code par des comments "POC v1 limit") :
- `investissements` Marseille : pas de drill chapitre/projet (cards non cliquables)
- `logement` Marseille : pas de drill arrondissement, pas de tension DRIHL (IDF-only)
- `dette` Marseille : pas de série CRC (rapport ponctuel "Marseille en Grand" 2024 non stress-testable)

→ **Toutes ces limitations sont maintenant signalées via le bandeau WIP** introduit en PR #46. Plus de sections silencieuses sans contexte.

---

## Bilan global — 3 waves

| Wave | Scope | Findings critiques | Status |
|---|---|---|---|
| 1 | Landing + daily-bread + méthodo + datasets globaux | 3 (latestCompleteYear, mix temporel lede, pop Paris stale) | **2/3 fixés** (#40), 1 reste (latestCompleteYear pipeline) |
| 2 | Drill pages Paris + Marseille publiées | 1 (logement hardcoded SRU + bailleurs) + 1 (marches disclaimer) + 1 (Marseille WIP) | **3/3 fixés** (#42, #46) |
| 3 | France national + Paris drill + Marseille restantes | 0 critique, 1 mineur (stress-test fallback 2.4) | Non bloquant |
| Éditorial | Cadrage angle | 5 (brand, collectif, pop i18n, date, qui-suis-je) | **4/5 fixés** (#44), 1 skipped par choix user (a-propos) |

### Score post-audit
- ✅ **Aucun chiffre faux affiché**
- ✅ **Architecture data uniforme** (seeds → methodology → loader → JSON, pas de bypass)
- ✅ **Sourcing public** sur chaque chiffre factuel (source + source_url + date_reference)
- ✅ **Honnêteté éditoriale** (projet indépendant assumé, pas "collectif" inventé)
- ⚠️ **Edge cases** : 1 fallback hardcoded (stress-test) + 1 logique pipeline (latestCompleteYear) restent

**Conclusion** : prêt pour communication publique. Les 2 items restants sont des polishs non bloquants.

---

## TODO résiduels (non bloquants)

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | Investiguer `latestCompleteYear = 2022` désaligné dans pipeline (`pipeline/scripts/export/`) | Wave 1 finding | 30 min |
| 2 | Retirer fallback `?? 2.4` du stress-test (option : seed ou message d'erreur) | Wave 3 finding | 15 min |
| 3 | Page `/a-propos` honnête (financement, indépendance) | Audit éditorial finding #5 | 1h |
| 4 | Confirmer sources DRIHL pour parts bailleurs (actuellement "provisoire") | Audit wave 2 | 1-2h |

Aucun de ces items ne devrait empêcher la communication publique.
