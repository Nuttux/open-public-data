# Marseille — Data Inventory v1

**Statut : en cours de validation. Document figé après revue utilisateur.**
**Date : 2026-05-07**

Ce document liste précisément, page par page, les sources de chaque chiffre et chaque visualisation pour la v1 Marseille. Il sert de référence pour le pipeline d'ingestion et de jointure entre données et UI. Aligné avec les décisions de [`project_marseille_v1_decisions`](../memory/project_marseille_v1_decisions.md).

## Métadonnées Marseille

| Clé | Valeur |
|---|---|
| Code INSEE commune | `13055` |
| SIREN collectivité | `211300553` |
| SIRET principal | `21130055300016` |
| Population (recensement légal 2026) | ~870 000 |
| Subdivisions administratives | 16 arrondissements (codes INSEE 13201–13216) groupés en 8 secteurs |
| Granularité choropleth retenue | **arrondissement (16)**, drill secteur optionnel — voir P0.4 |
| Nomenclature budgétaire | M57 depuis 2018 |
| Mairie principale | Hôtel de Ville, 13002 |

## Inventaire par catégorie

### A. Budget — `/marseille/budget`

| Source | URL / slug | Format | Grain | Fraîcheur | Statut |
|---|---|---|---|---|---|
| Budget primitif | data.gouv.fr `marseille-budget-primitif-{2018..2024}` | CSV M57 row-level | (chap, nature, section, sens) | 2024 dispo | ✅ |
| Compte administratif | data.gouv.fr `marseille-compte-administratif-{2018..2022}` | CSV M57 row-level (2 schémas selon année) | (chap, nature, section, sens, mtréal, mtprév) | 2022 dispo en CSV | ✅ |
| CA 2023, 2024 (data) | À extraire depuis PDF CA → JSONL → seed in-session | PDF text + structuration | identique CSV M57 | 2024 dispo en PDF | ⚠️ via PDF parsing |
| OFGL agrégats | data.ofgl.fr API nationale (déjà intégrée) | JSON | annuel | 2024 | ✅ |

**Note schéma 2 versions CA Marseille** :
- 2018-2019 : colonnes `Exercice budgétaire, Budget, Section, Inscription, Type mvt, Chap, Nature, Alloué, Réalisé`
- 2020+ : colonnes `BGT_NATDEC, BGT_ANNEE, BGT_SIRET, BGT_NOM, BGT_CONTNAT, BGT_CONTNAT_LABEL, BGT_NATURE, BGT_NATURE_LABEL, BGT_SECTION, BGT_OPBUDG, BGT_CODRD, BGT_MTREAL, BGT_MTPREV`

→ stg dédié `stg_marseille_budget` qui gère les 2 schémas.

**⚠️ Asymétrie nomenclature Paris vs Marseille (constat 2026-05-07)** :
- **Paris** publie en mode **vote fonctionnel** : chapitres 930-939 = fonctions (Éducation, Sécurité, Culture, etc.) + nature comptable + fonction explicite
- **Marseille** publie en mode **par nature** : chapitres 11, 60, 65, etc. = natures (Charges générales, Achats, Transferts) **SANS** dimension fonction

**Conséquence Sankey** : on ne peut pas faire un Sankey Marseille en groupes "Éducation/Sécurité/etc." comme Paris parce que la donnée n'existe pas dans le CSV Marseille. Stratégie :
- **Sankey Marseille v1** : groupes par **type de flux** (Personnel / Achats / Subventions / Investissements matériels / Charges financières / Impôts et taxes / Dotations / etc.) en s'appuyant sur la classification universelle M57 par `nature_code` (déjà implémentée dans `core_budget.ode_categorie_flux`).
- **Politiques publiques Marseille (Écoles, BMPM, Sport, etc.)** : récupérées plus tard via parsing PDF CA narratif → seed `seed_pdf_investissements_[year].csv` (cf. workflow PDF parsing in-session). Pas dans le scope POC budget.

**Pour Paris** : le Sankey actuel basé sur chapitres fonctionnels reste tel quel. Pas de régression.

Cohérent avec P3.2 option a stricte : la donnée Marseille n'a pas de fonction → le Sankey Marseille n'a pas de groupes "Éducation" etc., point. Le citoyen voit ce qui existe.

### B. Marchés publics — `/marseille/marches-publics`

| Source | URL / slug | Format | Couverture | Statut |
|---|---|---|---|---|
| DECP consolidé national | data.gouv.fr `donnees-essentielles-de-la-commande-publique-fichiers-consolides` | CSV/JSON SCDL | tous marchés ≥40k€ depuis 2019, filtre SIRET `21130055300016` | ✅ |
| Marchés Ville Marseille SCDL | data.gouv.fr `marseille-marches-publics-1` | CSV SCDL | 2020 uniquement (~438 marchés) | ⚠️ ancien, complément DECP |
| Marchés Métropole AMP | data.ampmetropole.fr `ls-marches-publics` | CSV/JSON ODS API | 2024+ | ✅ (concerne la Métropole, pas la Ville) |

**Décision** : prioritaire = DECP national filtré sur SIRET Ville. Le dataset Ville 2020 sert de validation/complétion pour 2020. Métropole = bonus pour stats agrégées Métropole vs Ville.

### C. Subventions — `/marseille/qui-recoit`

| Source | URL / slug | Format | Couverture | Statut |
|---|---|---|---|---|
| Subventions Ville Marseille | data.gouv.fr `marseille-subventions-{2017..2022}` | CSV SCDL standard (`nomBeneficiaire, idAttribuant, montant, nature, anneeAttribution`) | 2017-2022, ~3000 subv/an | ✅ |
| Subventions Métropole AMP | data.ampmetropole.fr `subventions-attribuees-depuis-2022` | CSV/JSON ODS API | 2022+ | ✅ (bonus, distinct Ville) |

**Décision** : on importe les deux, on les garde **distinctes** dans le pipeline (`raw.marseille_subventions_ville`, `raw.marseille_subventions_metropole`). Sur la page front, on les présente séparément avec libellé clair "Ville" vs "Métropole AMP". Pas de fusion artificielle.

**Note pattern par ville** (décision 2026-05-07) :
- **Paris** : la Métropole du Grand Paris (MGP) n'a quasi pas de subventions publiées (~140 M€ budget, surtout péréquation FPIC). Pas de double couche dans le pipeline Paris — on ne l'invente pas.
- **Marseille** : la Métropole AMP publie ~500 subventions/an depuis 2022 via ODS. Double couche pertinente, on affiche les deux niveaux.
- **Lyon (futur)** : la Métropole de Lyon est une collectivité unique (fusionnée avec le département). Pas de double couche — un seul niveau hybride à présenter.

**Conséquence UI** : sur `/paris/qui-recoit`, pas de section "Métropole". Sur `/marseille/qui-recoit`, deux sections "Ville de Marseille" + "Métropole AMP" en libellés clairs. Cohérent avec P3.2 option a stricte (ce qui n'existe pas, n'apparaît pas).

### D. Délibérations — `/marseille/qui-recoit` (ou page dédiée)

| Source | URL / slug | Format | Couverture | Statut |
|---|---|---|---|---|
| Délibérations CSV | data.gouv.fr `marseille-deliberations-{2019,2021,2024}` | CSV (~99 Ko 2024) | 2019, 2021, 2024 (lacunes 2020, 2022, 2023) | ⚠️ années manquantes |
| RAA recueil actes administratifs | marseille.fr/mairie/conseil-municipal/recueil-des-actes-administratifs | PDF mensuel | Continuous | ⚠️ PDF parsing si on veut combler |

**Décision v1** : on prend les 3 années CSV disponibles. Combler 2020/2022/2023 via RAA = phase 2 si nécessaire.

### E. Investissements — `/marseille/investissements`

| Source | URL | Format | Grain | Statut |
|---|---|---|---|---|
| Rapports CA présentation 2019-2024 | marseille.fr/sites/default/files/contenu/mairie/Budget/pdf/ | PDF (5 ans) | Narration projets/arrondissement | ⚠️ via PDF parsing |
| Rapport BP présentation 2024 (intègre PPI 2024-2029) | marseille.fr/.../rapport_de_presentation_budget_primitif_2024-c.pdf | PDF | Narration plan investissement | ⚠️ via PDF parsing |

**Workflow PDF parsing in-session** :
1. `pdftotext -layout [pdf] [txt]` → stocker dans `pipeline/cache/pdf_extracts/marseille/[year]/`
2. Identifier sections "Thématique X" + tables récap politiques publiques
3. Charger le `.txt` dans Claude Code en session, structurer en JSONL : `{nom_projet, arrondissement, montant_M_euros, thematique, annee, source_pdf}`
4. Sauvegarder vers `pipeline/seeds/cities/marseille/seed_pdf_investissements_{year}.csv`
5. Garder script `pipeline/scripts/enrich/parse_marseille_ca_pdf.py` avec flag `--use-llm` (default OFF) — cf. mémoire enrichissement in-session

**Couverture estimée** : 5 ans × ~100-150 projets/an = ~500-750 projets exploitables (vs ~3000-5000 Paris). 60-70% de la richesse Paris.

### F. Logement social — `/marseille/logement-social`

| Source | URL | Format | Grain | Statut |
|---|---|---|---|---|
| RPLS détaillé au logement | data.gouv.fr `donnees-detaillees-au-logement-du-repertoire-des-logements-locatifs-des-bailleurs-sociaux-rpls` | CSV (national, filtre 13055 + 13201-13216) | Logement individuel avec adresse | ✅ |
| Atlas parc locatif social AMP | data.ampmetropole.fr `parc-locatif-social` | CSV ODS | Métropole agrégé | ⚠️ moins détaillé |
| SRU taux | data.ampmetropole.fr `sru-taux` | CSV ODS | commune annuel | ✅ |
| Objectifs SRU triennaux | data.ampmetropole.fr `amest_hab_sru_objectifs_triennaux_cms_amp-` | CSV ODS | commune triennal | ✅ |
| Demande logement social SNE | data.gouv.fr `demande-de-logement-social` | CSV national | commune | ✅ |

**Note bailleurs** : RPLS national anonymise le bailleur (confidentialité). Donc Marseille **n'aura pas** les fiches nominatives par bailleur (Logirem, Erilia, 13 Habitat) comme Paris en a (Paris Habitat, RIVP, Elogie-Siemp). → P3.2 option a : la section disparaît silencieusement.

**Géocodage** : RPLS fournit l'adresse, on géocode (in-session ou via base adresse Marseille publiée par la Ville) pour rattacher chaque logement à son arrondissement.

### G. Dette / patrimoine — `/marseille/dette-patrimoine`

| Source | URL | Format | Statut |
|---|---|---|---|
| OFGL ratios financiers | data.ofgl.fr API | JSON 70+ indicateurs | ✅ déjà intégré |
| Rapport CRC "Marseille en Grand" 2024 | ccomptes.fr | PDF audit | ⚠️ ponctuel, pas en série |
| Dette garantie | OFGL agrégats | JSON | ✅ |
| Compte administratif (dette ligne) | CSV CA Marseille | inclus dans CA | ✅ |

**Note** : Marseille n'a **pas** de série régulière de rapports CRC comme Paris. On affiche le rapport "Marseille en Grand" 2024 en référence ponctuelle, et on s'appuie sur OFGL pour les séries.

### H. Équipements / patrimoine bâti — sections multiples

| Source | URL | Format | Usage |
|---|---|---|---|
| Bâtiments institutionnels | data.gouv.fr `marseille-batiments-institutionnels-1` | CSV géoloc | Patrimoine bâti |
| Écoles maternelles 2024 | data.gouv.fr `marseille-ecoles-maternelles-2024` | CSV géoloc | Investissements écoles |
| Écoles élémentaires 2024 | data.gouv.fr `marseille-ecoles-elementaires-2024` | CSV géoloc | Investissements écoles |
| Base adresse locale Marseille | data.gouv.fr (16 fichiers par arrondissement) | CSV | Géocodage |
| BPE Base permanente équipements | data.ampmetropole.fr `mod-base-permanente-des-equipements-2018` | CSV | Tous équipements collectifs |

### I. Données socio-démo — pages multiples

| Source | URL | Format | Statut |
|---|---|---|---|
| INSEE FILOSOFI commune 13055 | INSEE | CSV | ✅ |
| INSEE FILOSOFI IRIS Marseille | INSEE | CSV | ✅ |
| Recensement INSEE | INSEE | CSV national | ✅ |

## Mapping page front × sources

| Page | Sources principales | Granularité | Statut richesse vs Paris |
|---|---|---|---|
| `/marseille` (landing) | Agrégats OFGL + extraits autres pages | ville | ~95% Paris |
| `/marseille/budget` | BP/CA CSV + OFGL | ville (chap/nature/section) | ~95% Paris |
| `/marseille/marches-publics` | DECP national + SCDL Ville 2020 | marché/SIRET titulaire | ~85% Paris |
| `/marseille/qui-recoit` | Subventions Ville + Métropole | bénéficiaire (SCDL standard) | ~75% Paris |
| `/marseille/investissements` | PDF CA parsé in-session | arrondissement (pas adresse complète) | ~65% Paris |
| `/marseille/logement-social` | RPLS détaillé + SRU + demande | logement (agrégeable arr) | ~65% Paris (pas de fiches bailleurs) |
| `/marseille/dette-patrimoine` | OFGL + CA + CRC ponctuel | ville annuel | ~65% Paris (pas CRC en série) |
| `/marseille/analyses` | Articles dédiés à écrire | éditorial | 100% (équivalent) |

**Couverture moyenne pondérée : ~75% Paris.** Aligné avec l'estimation initiale.

## Trous résiduels acceptés v1 (P3.2 option a)

| Trou | Page impactée | Conséquence UX |
|---|---|---|
| Pas de fiches bailleurs nominatives | `/marseille/logement-social` | Section "Bailleurs sociaux" absente |
| AP/CP pas en CSV (PDF only) | `/marseille/investissements` | Granularité arrondissement, pas adresse |
| CA 2023/2024 pas en CSV | `/marseille/budget` | On reconstruit 2023/2024 via parsing PDF + OFGL en complément |
| Marchés Ville 2021-2023 absents en SCDL Ville | `/marseille/marches-publics` | DECP national couvre ces années |
| CRC pas en série | `/marseille/dette-patrimoine` | Pas de stress-test série, juste rapport "Marseille en Grand" 2024 |
| Délibérations 2020/2022/2023 absentes | `/marseille/qui-recoit` | 3 années couvertes (2019, 2021, 2024) v1 |

## Workflow PDF parsing in-session — détail

**Pour chaque rapport CA Marseille (2019, 2020, 2021, 2023, 2024)** :

1. **Téléchargement automatisé** via script `pipeline/scripts/sync/sync_marseille_pdf_ca.py` :
   ```python
   PDFS = {
       2019: "rapportca2019.pdf",
       2020: "rapportca20.pdf",
       2021: "...",  # à confirmer
       2023: "rapport_de_presentation_du_compte_administratif_2023.pdf",
       2024: "rapport-de-presentation-compte-administratif-2024.pdf",
   }
   ```

2. **Extraction texte** via `pdftotext -layout` → fichiers texte stockés dans `pipeline/cache/pdf_extracts/marseille/[year]/ca.txt`.

3. **Structuration in-session** par Claude Code :
   - Lire le `.txt`
   - Identifier les sections "Thématique X" (Écoles, BMPM, Sports, Environnement, Urbanisme, Social, Sécurité, etc.)
   - Extraire chaque projet mentionné avec : nom, arrondissement (regex `\d+(er|ème) arr`), montant (M€/K€), thématique, année
   - Produire `pipeline/seeds/cities/marseille/seed_pdf_investissements_[year].csv`

4. **Optionnel — flag `--use-llm`** sur le script de structuration pour quiconque veut automatiser via Gemini/Claude API. Default OFF (cf. mémoire `feedback_enrichment_in_session`).

5. **Le seed entre dans le pipeline normal** : raw → stg_marseille_investissements_pdf → core_ap_projets (avec `commune_slug = 'marseille'`) → mart → export JSON.

## Sources nationales à intégrer pour Marseille (sans nouveau script)

Ces sources sont déjà dans le pipeline national et couvrent Marseille **par construction**. Aucun nouveau script à écrire :
- OFGL (35k communes)
- DECP consolidé
- SIRENE
- INSEE FILOSOFI commune + IRIS
- BPE
- RPLS détaillé (à filtrer 13055 + 13201-13216)

## Sources Marseille-spécifiques nécessitant un script de sync

| Script à créer | Source | Périodicité |
|---|---|---|
| `sync_marseille_budget.py` | data.gouv.fr datasets `marseille-budget-primitif-{year}` + `marseille-compte-administratif-{year}` | Annuel |
| `sync_marseille_subventions.py` | data.gouv.fr `marseille-subventions-{year}` | Annuel |
| `sync_marseille_deliberations.py` | data.gouv.fr `marseille-deliberations-{year}` | Annuel |
| `sync_marseille_marches.py` | data.gouv.fr `marseille-marches-publics-1` (2020 only) | One-shot |
| `sync_marseille_pdf_ca.py` | marseille.fr PDF | Annuel |
| `sync_amp_subventions.py` | data.ampmetropole.fr ODS API `subventions-attribuees-depuis-2022` | Mensuel |
| `sync_amp_logement.py` | data.ampmetropole.fr ODS API `parc-locatif-social`, `sru-taux` | Annuel |

**Pattern partagé** : tous lisent depuis l'API data.gouv.fr ou ODS et écrivent dans `raw.marseille_*`. Schéma cible : OBT row-level avec `commune_slug = 'marseille'`.

## Critères d'acceptation phase 1

- [x] Sources confirmées et téléchargées en échantillon pour chaque catégorie
- [x] Granularité géographique validée : arrondissement 16 (P0.4)
- [x] Trous résiduels listés et impact UX convenu (P3.2 option a)
- [x] Schémas CSV des deux versions CA documentés
- [x] Workflow PDF parsing in-session défini
- [ ] **À valider par utilisateur avant de débloquer phase 2 (refactor pipeline)**
