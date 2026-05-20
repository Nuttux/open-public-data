# Audit : OG-per-chart — scope worth-it vs overkill — 2026-05-20

**Contexte** : décision user d'implémenter le niveau **C riche** (OG image custom par chart partagé). Avant de coder, on définit **quels charts méritent leur propre OG** et **où ça devient overkill**.

**Critères "worth it"** :
1. Le chart contient une info auto-suffisante (compréhensible sans le reste de la page)
2. Le chart contient un chiffre saillant qui sert d'accroche
3. Probabilité non nulle qu'il soit partagé individuellement (journaliste qui tweete une donnée précise)
4. Coût implémentation raisonnable (< 30 min par OG après que l'infrastructure soit en place)

**Critères "overkill"** :
- Chart purement contextuel (légende / source / "à lire")
- Chart de drill très profond (level3+ d'une nomenclature)
- Chart répétitif (1 par sous-catégorie × 30 catégories = 30 OG → personne ne les utilise)
- Chart qui nécessite des paramètres user (filtre, recherche) → impossible à servir statiquement

---

## Synthèse

| Catégorie | Charts auditeurs | Worth OG | Marginal | Overkill |
|---|---|---|---|---|
| Hero / KPI principal de page | 14 | **14** | 0 | 0 |
| Sankey / Treemap | 5 | **5** | 0 | 0 |
| Top N (bars rankings) | 12 | **9** | 3 | 0 |
| Choropleth / cartes | 4 | **4** | 0 | 0 |
| Timeline / Evolution | 9 | **3** | 6 | 0 |
| Peer compare européen | 3 | **3** | 0 | 0 |
| Daily-bread équivalents | 1 | **1** (déjà OG) | 0 | 0 |
| Drill drawer (fiches) | 8 | **0** | 0 | **8** (déjà 4 OG existantes pages) |
| Sections légales / méthode | 6 | 0 | 0 | **6** |
| Filter / search / explorer | 3 | 0 | 0 | **3** |
| **TOTAL** | **65** | **39** | **9** | **17** |

→ **39 charts méritent un OG custom**, 9 marginal (utiliser OG page), 17 overkill.

**Effort estimé** :
- Infrastructure (route OG dynamique + share button component) : 2-3h
- 39 templates OG (variation autour de 5-6 designs base) : 3-4h
- Tests + screenshots : 1h
- **Total : ~7-8h** sur 1 PR ou 2-3 petites

---

## 1. Détail par page

### Landing ` /`

| Section | Chart | Verdict | Note |
|---|---|---|---|
| Hero `Où va l'argent public à Paris ?` | H1 + lede | 🟢 OG existante | Déjà couvert |
| `Chaque mois, la Ville dépense` | BarRow €/habitant + KPI | 🟢 **Worth OG dédié** | "463 €/mois par habitant" est un chiffre choc partageable |
| Tile grid (Budget / Évolution / Invest / Subv / Marchés / Logement) | 6 cards | 🔴 Overkill | Sert de navigation, pas d'info auto-suffisante |
| Top 3 bénéficiaires | Liste | 🟡 Marginal | OG page suffit |
| Top 3 fournisseurs | Liste | 🟡 Marginal | OG page suffit |
| Bench section "Comparer" | Bars peer compare | 🟢 **Worth OG dédié** | Si Paris vs autres villes |

### `/methode`

| Section | Verdict | Note |
|---|---|---|
| Hero "Chaque chiffre, sa source" | 🟢 OG existante (PR #50) | OK |
| 4 étapes pipeline | 🔴 Overkill | Texte, pas chart |
| Provenance par chart | 🔴 Overkill | Liste de sources |

### `/corrections`

| Section | Verdict | Note |
|---|---|---|
| Hero "Tout ce qu'on a corrigé" | 🟢 OG existante (PR #50) | OK |
| Entrée individuelle | 🔴 Overkill | Drill, peu de partage |

### `/contact`

🟢 OG existante (PR #50). Pas de chart.

### `/ville/paris/budget`

| Section | Chart | Verdict |
|---|---|---|
| Hero "11,72 Md€ — 5 546 €/hab, 67% quotidien, 13% chantiers" | Hero text + KPI | 🟢 **Worth OG** (déjà couvert PR #50) |
| Sankey "Recettes → Dépenses" | BudgetSankey | 🟢 **Worth OG dédié** |
| Top 7 dépenses par chapitre | Bars | 🟢 **Worth OG dédié** |
| Top 6 recettes | Bars | 🟢 **Worth OG dédié** |
| Timeline "Évolution depuis 2019" | DebtLineChart | 🟡 Marginal (sans annotation = peu parlant seul) |
| Vote vs Execute par année | Bars compar | 🟢 **Worth OG dédié** ("voté vs réalisé") |

### `/ville/paris/subventions`

| Section | Verdict |
|---|---|
| Hero "1,35 Md€ via 5 977 subv, top 10 = 54%" | 🟢 OG existante |
| Bars par thème | 🟢 **Worth OG dédié** |
| Top 10 plus grosses subventions | 🟢 **Worth OG dédié** (CASVP = chiffre média) |
| Search association | 🔴 Overkill (interactif) |
| Timeline tendances | 🟡 Marginal |

### `/ville/paris/marches`

| Section | Verdict |
|---|---|
| Hero "1 122 contrats, 1,61 Md€, top 10 = 34%" | 🟢 OG existante |
| Concentration top 10 | 🟢 **Worth OG dédié** |
| Top fournisseurs | 🟢 **Worth OG dédié** |
| Liste full (110k) | 🔴 Overkill (search) |
| Par nature | 🟡 Marginal |
| Timeline enveloppes | 🟡 Marginal |

### `/ville/paris/investissements`

| Section | Verdict |
|---|---|
| Hero "2,12 Md€ sur 437 projets, 1002 €/Parisien" | 🟢 OG existante |
| Top chapitres | 🟢 **Worth OG dédié** |
| Carte choropleth | 🟢 **Worth OG dédié** (visuel choc) |
| Top chantiers 2024 | 🟢 **Worth OG dédié** |
| Timeline 2019-2024 | 🟡 Marginal |

### `/ville/paris/dette` + `/dette-patrimoine`

| Section | Verdict |
|---|---|
| Hero "36,37 Md€ patrimoine net" | 🟢 OG existante |
| Bilan Sankey (actif/passif) | 🟢 **Worth OG dédié** |
| Capacité de désendettement (chiffre + comparable seuils) | 🟢 **Worth OG dédié** ("14,2 ans") |
| Détails actifs | 🟡 Marginal |
| Emprunts | 🟡 Marginal |
| Engagements hors-bilan | 🟢 **Worth OG dédié** |
| Stress-test | 🟢 **Worth OG dédié** (page dédiée, gros impact comm) |

### `/ville/paris/logement`

| Section | Verdict |
|---|---|
| Hero "195 828 ménages attendent un HLM, 1 pour 22" | 🟢 OG existante |
| Choropleth arrondissements | 🟢 **Worth OG dédié** |
| Bailleurs (5 grands) | 🟢 **Worth OG dédié** |
| Tension par arrondissement | 🟢 **Worth OG dédié** |

### `/france/budget`

| Section | Verdict |
|---|---|
| Hero "1 808 Md€/an APU" | 🟢 OG existante |
| Recettes APU breakdown | 🟢 **Worth OG dédié** |
| 3 piliers (Sécu / État / Local) | 🟢 **Worth OG dédié** |
| Drill Sécu / État / Local | 🔴 Overkill (level 3+) |
| §08 cross-cutting themes | 🟡 Marginal (6 panels × OG ?) |

### `/france/daily-bread`

| Section | Verdict |
|---|---|
| Hero "856 € financent chaque mois le service public" | 🟢 OG existante (custom square 1080x1080) |
| Composition (Cotisations / CSG / IR / TVA) | 🟢 **Worth OG dédié** |
| Stack bar Sécu/État/Local | Déjà dans hero OG | — |
| 4 équivalents (consultations, retraite, école, transit) | Déjà dans hero OG | — |
| Deep-dive (drill par bucket) | 🔴 Overkill |

### `/france/dette`

| Section | Verdict |
|---|---|
| Hero "X% PIB" | 🟢 OG existante |
| Timeline dette historique | 🟢 **Worth OG dédié** |
| Peer compare européen | 🟢 **Worth OG dédié** |

### `/france/etat`

| Section | Verdict |
|---|---|
| Hero "X Md€ État" | 🟢 OG existante |
| Top 34 missions | 🟢 **Worth OG dédié** |

### `/france/fiscalite`

| Section | Verdict |
|---|---|
| Hero "43,4% du PIB" | 🟢 OG existante |
| Catégories empilées | 🟢 **Worth OG dédié** |
| Timeline structure | 🟢 **Worth OG dédié** |
| Position Europe (peer compare) | 🟢 **Worth OG dédié** |

---

## 2. Pages drill (fiches) — toutes overkill au niveau chart

Pour les pages drill (`subventions/association/[slug]`, `marches/contrat/[numero]`, `investissements/projet/[id]`, etc.), on a déjà **les OG page** (créées PR #50). Pas besoin d'OG par chart à l'intérieur. La fiche elle-même IS l'unité partagée.

À ajouter quand même comme **OG page** (cf audit précédent) :
- `subventions/theme/[slug]` ✅ à faire
- `marches/categorie/[slug]` ✅ à faire
- `investissements/chapitre/[slug]` ✅ à faire
- `investissements/arrondissement/[num]` ✅ à faire
- `logement/arrondissement/[arr]` ✅ à faire
- `dette/bailleur/[slug]` ✅ à faire
- `france/budget/recettes/[key]` ✅ à faire

→ **7 OG drill pages à créer** (cf audit OG cards PR #49).

---

## 3. Pattern d'implémentation proposé

### Architecture
```
Chart partageable :
  1. <ShareButton chart="paris-budget-sankey" data={...} />
  2. Click → modal "Partager ce graphique" avec Twitter / LinkedIn / Copy
  3. URL générée : franceopendata.org/ville/paris/budget?share=sankey
  4. Le ?share= déclenche dans la page la metadata override + l'OG dynamique
  5. OG route : /api/og-chart?chart=paris-budget-sankey
     → renvoie une image PNG 1200x630 spécifique au chart
```

### Composant `ShareButton`
- Variante "small" : icône partager + tooltip
- Variante "large" : bouton avec label
- Génère l'URL `?share={chartId}` + appelle l'API native share quand dispo

### Route `/api/og-chart`
- Switch sur `chart` query
- Lit les data via les loaders existants
- Renvoie OG image cohérente avec le design system

### Effort par chart
- Implémenter le **template** OG (1 par type de chart : sankey, bars, choropleth, timeline, kpi) → ~30 min × 5 = **2,5h**
- Décliner pour chacun des 39 charts (réutilisation template) → ~10 min × 39 = **6,5h**

**Total infrastructure + 39 charts : ~9h.**

→ Trop pour 1 PR. **Proposition : phasing.**

### Phasing recommandé

**Phase 1 (3h)** : Infrastructure
- Composant `<ShareButton>` réutilisable
- Route `/api/og-chart?chart=...`
- 1 template OG bars (le plus universel)

**Phase 2 (2h)** : Top charts hero
- 10 charts les plus partageables (hero KPI + Sankey budget + treemap subv + choropleth logement)

**Phase 3 (2h)** : Élargissement
- 15 charts supplémentaires

**Phase 4 (1h)** : Polish + drill OG pages manquantes

**Total : ~8h** sur 4 PRs.

---

## 4. Verdict

### À faire absolument
- **7 OG drill pages** manquantes (~1.5h, blocant pour partage drill)
- **10 charts hero les plus partageables** (~3h infra + 1.5h templates)

### À faire si tu veux pousser
- 15 charts supplémentaires (~2h)

### À skip (overkill)
- Charts drill drawer (level 3+)
- Sections légales / méthode
- Charts filter / search (interactifs)
- Tiles de navigation landing

---

## Décision attendue

Tu valides :
- **Niveau de scope** : 10 charts hero + 7 OG drill pages (4-6h) **OU** tout le 39 (8-9h) ?
- **Phasing** : tout dans 1 PR ou 3-4 PRs ?

Ma reco : **phasing en 2 PRs** :
- PR 1 : Infrastructure + 7 OG drill pages + 10 charts hero les plus partageables (~5h)
- PR 2 : 15 charts supplémentaires (~2h)
