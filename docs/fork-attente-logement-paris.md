# Fork — Dashboard public "Attente logement social Paris/IDF"

**Pitch en une phrase :** transformer les données DRIHL (annuelles, brutes, austères) sur la file d'attente du logement social en un dashboard public lisible — pour rendre visible la réalité quantitative de la crise du logement à Paris et en Île-de-France.

---

## 1. Problème

195 828 demandes actives de logement social à Paris au 31/12/2024 pour 9 098 attributions dans l'année (**1 attribution pour 21 demandes** — source DRIHL). Dans certains arrondissements, le ratio monte à **134 pour 1** (6e). Cette tension structurelle est **invisible publiquement** dans un format accessible :

- La DRIHL publie chaque année un fichier XLSX brut et une infographie PDF — utiles pour les pros, illisibles pour le grand public et les associations de terrain.
- `demande-logement-social.gouv.fr` permet de gérer SA demande, pas d'explorer les données publiquement.
- Apur, Fondation Abbé Pierre, DAL : rapports narratifs annuels, pas dashboard interactif.
- **Trou de marché** : aucun outil grand public ne traduit la donnée DRIHL en lecture utile par arrondissement, profil, typologie.

Conséquence : le débat public sur le logement social parisien repose sur des chiffres globaux médiatiques ("70 000 demandes en attente", "des années d'attente") plutôt que sur des indicateurs précis et comparables — qui existent pourtant dans la donnée publique.

## 2. Solution proposée

Un site dédié **`attente-logement-paris.fr`** (ou équivalent), qui pour chaque profil utilisateur (arrondissement × typologie × composition de ménage × statut prioritaire) affiche :

1. **Tension réelle de votre segment** : ratio demandes/attributions exact (ex. "134 demandes pour 1 attribution dans le 6e pour un T3 standard")
2. **Distribution d'ancienneté** : "22% des demandes Paris attendent depuis 5 ans ou plus" — par segment
3. **Effet du statut prioritaire** : "DALO = 8% des demandes mais 34% des attributions ⇒ effet ×4" — chiffré et vérifiable
4. **Comparaison inter-arrondissements / EPCI** : où votre profil aurait davantage de chances
5. **Délai médian d'attribution** (avec caveat explicite sur le biais survivant)
6. **Évolution pluriannuelle** dès qu'on aura ingéré 2-3 années de données DRIHL

**Principe rédactionnel structurant** : aucun chiffre affiché ne doit être inventé ou estimé. Chaque valeur visible est rattachable à une cellule du XLSX DRIHL ou à un calcul transparent documenté. Toute estimation est explicitement marquée comme telle.

## 3. Pourquoi maintenant

- **DRIHL publie un socle de données 2024 structuré** (XLSX, 235 colonnes, par arrondissement) librement téléchargeable. Mise à jour annuelle.
- **La crise du logement** est en haut de l'agenda politique national (loi 3DS, loi Kasbarian, débats budget 2025).
- **L'écosystème civic-tech français** (beta.gouv.fr, DINUM, Etalab) cherche des projets à fort impact sur les politiques publiques structurantes — le logement coche toutes les cases.
- **Ce projet est un fork léger** d'un dashboard civic-tech existant (`open-public-data` — finances publiques Paris) qui a déjà résolu les briques techniques (BigQuery, dbt, Next.js, design system).

## 4. Stack technique (héritée du projet parent)

```
Sources         → DRIHL XLSX annuel + INSEE référentiel arrondissements
Sync (Python)   → scripts/sync/sync_drihl.py (à créer, pattern existant)
Stockage        → BigQuery (raw + analytics + marts) ou DuckDB/FoxDB
Modélisation    → dbt (staging → core → marts par segment)
Export          → JSON statiques (website/public/data/)
Frontend        → Next.js + React (App Router, TypeScript)
Hébergement     → Vercel ou équivalent (déjà en place sur projet parent)
i18n            → FR/EN dès le départ
```

**Ce qui est récupérable directement du projet parent open-public-data :**
- Pipeline dbt complet (45 modèles, 175 tests data quality)
- Architecture frontend Next.js + design system "fusion"
- Composants réutilisables (KPIGrid, HeroNumber, ChartSource, YearPicker, etc.)
- Méthodologie zéro-hardcode (toutes constantes factuelles tracées via `methodology.json`)
- Tests dbt + CI

**Ce qui est à construire :**
- Sync DRIHL (1 script, ~200 lignes Python)
- 3-5 modèles dbt SLS (staging XLSX → core par segment → marts par dimension)
- 5-7 composants frontend dédiés (Tension par arr, Funnel demandes/attribs, Comparateur arr, etc.)
- Page d'explication méthodologique (biais survivant, ancienneté, etc.)

## 5. Roadmap MVP → V1

| Phase | Durée | Livrables |
|---|---|---|
| **MVP** | 3 semaines (1 dev) | Sync DRIHL 2024, dashboard 1 page : tension par arrondissement Paris + filtre typologie + caveats pédagogiques |
| **V1** | + 4 semaines | Filtres profil complet (composition ménage × statut prio × revenus), comparaison inter-arr, export CSV/JSON par segment, accessibilité WCAG AA |
| **V1.1** | + 2 semaines | Extension Île-de-France (96 EPT/EPCI), cartographie interactive |
| **V2** | + 4 semaines | Données pluriannuelles (re-fetch DRIHL 2019-2023 + projection annuelle), dashboard évolution, alertes par segment |

**Total MVP→V2 : ~13 semaines / 3 mois** pour 1 développeur full-stack senior, 0.5 designer, 0.2 chef de projet.

## 6. Ressources nécessaires

**Demande à l'incubateur :**
- 1 développeur full-stack (TypeScript/Python/dbt) sur 3 mois (peut être l'auteur du projet parent en transition)
- 0.3 designer UX/UI sur 1 mois (design system existant à adapter)
- 0.2 expert métier logement social sur 6 semaines (validation rédactionnelle, méthodologie)
- Hébergement (~30€/mois Vercel ou équivalent — déjà coût du projet parent)
- Crédits API Anthropic Claude Haiku (~$50 pour enrichissement éventuel des libellés DRIHL)

**Pas demandé (déjà acquis du projet parent) :**
- Pipeline dbt + BigQuery (BQ free tier suffit pour ce volume)
- Design system + composants React
- Méthodologie zéro-hardcode + tests data quality

## 7. Critères de succès (mesurables à 6 mois)

- 5 000 visites uniques / mois (audience plausible : associations + journalistes + citoyens curieux)
- 3 articles de presse citant le dashboard comme source
- 1 acteur institutionnel (DRIHL, Mairie de Paris, Apur) reprend ou commente publiquement les données
- Code 100% open source (licence MIT)
- Réutilisé par au moins 1 autre métropole (Lyon, Marseille) via fork — démontre la généralisable

## 8. Risques identifiés et mitigations

| Risque | Mitigation |
|---|---|
| Données DRIHL annuelles seulement → fraîcheur limitée | Bandeau date de référence systématique. Pas de claim "temps réel". |
| Biais survivant sur "délai médian d'attribution" | Caveat pédagogique explicite à chaque affichage. Mise en avant des indicateurs non biaisés (ratio, ancienneté). |
| Incompréhension du grand public sur typologies T1/T5+ etc. | Onglet glossaire + tooltips contextuels |
| Mauvaise interprétation politique des chiffres | Page "méthode" obligatoire avec sources, modes de calcul, limites — comme sur projet parent |
| Format DRIHL change d'une année à l'autre | Schéma d'attente rigide en SQL + tests dbt qui détectent les ruptures |
| Conflit avec services existants DRIHL/État | Positionnement complémentaire (pédagogie public) plutôt que concurrent (gestion individuelle) |

## 9. Annexes — exemples concrets de données disponibles

**Source : DRIHL — Socle de données demandes et attributions de logements sociaux 2024**
URL : https://www.drihl.ile-de-france.developpement-durable.gouv.fr/socle-de-donnees-demandes-et-attributions-de-a1414.html

**Volumes Paris 2024 :**
- 195 828 demandes actives (choix 1)
- 9 098 attributions
- Ratio global : 21.5 demandes pour 1 attribution

**Exemples par arrondissement (extrait XLSX) :**

| Arr | Demandes | Attributions | Ratio | Délai médian (mois) |
|---|---|---|---|---|
| 1er | 2 414 | 31 | 77.9 | 15.9 |
| 6e | 1 615 | 12 | 134.6 | 14.9 |
| 7e | 1 954 | 16 | 122.1 | n/c |
| 8e | 1 567 | 12 | 130.6 | n/c |
| Paris global | 195 828 | 9 098 | 21.5 | 29.9 |

**Dimensions disponibles dans la donnée brute (235 colonnes) :**
- 5 typologies (T1 → T5+) avec ratio direct demandes/attribution par taille
- 6 compositions de ménage (Personne seule, Couple, Couples avec enfants, Familles monoparentales)
- 4 quartiles de revenus + plafonds PLAI
- 4 sheets séparées par profil prioritaire (Ensemble, 1er quartile, prioritaires, DALO, hébergés, mutations)
- Distribution d'ancienneté de la demande (de "moins d'1 an" à "5 ans et plus")

**Cartographie minimale possible dès le MVP :**
- Choroplèthe arrondissements Paris (fond de carte INSEE 75101-75120)
- Couleur = tension (ratio demandes/attributions)
- Click → fiche arr avec breakdown profil

## 10. Demandes concrètes à l'incubateur

1. **Validation du besoin** : confirmer qu'aucun service public ou civic-tech existant ne couvre déjà ce périmètre (revue rapide ~1 semaine)
2. **Ressource humaine** : 1 dev senior full-stack sur 3 mois (financement bourse / accompagnement / mise en relation)
3. **Mise en relation métier** : identifier une personne-ressource DRIHL ou Apur pour validation rédactionnelle
4. **Hébergement institutionnel** : si possible, héberger sous un domaine `.gouv.fr` ou `.beta.gouv.fr` pour crédibilité (sinon `.fr` indépendant)
5. **Promotion** : aide à la diffusion auprès des associations (Fondation Abbé Pierre, DAL, FAP, USH) lors du lancement

---

**Contact :** [Daniel — open-public-data] (à compléter selon contexte de soumission)

**Repo parent à forker :** `open-public-data` (à publier en MIT public si pas déjà)

**Démo data préliminaire** : extraction XLSX DRIHL 2024 disponible sur demande, exemples de mockups dashboard fournis sur sollicitation.
