# Couverture de publication — Ville × entrepôt × site

Généré le 2026-09-10 depuis opendata.paris.fr. 9 séries, 25 constats (0 erreurs), dont 9 de notre côté et 16 du côté de la Ville.


## Tableau croisé

| Série | La Ville publie | Le site sert | Exercices absents | Autres jeux de la série non ingérés |
|---|---|---|---|---|
| Budget exécuté — budget principal (compte administratif) | 2009→2024 | 2019→2024 | 10 | 2 |
| Budget voté — budget principal | 2009→2021 | 2019→2026 | 10 | 2 |
| Investissement — autorisations de programme (exécuté) | 2009→2022 | 2009→2022 | — | — |
| Investissement — carte des projets localisés | 2018→2022 | 2018→2024 | — | — |
| Subventions versées (annexe du compte administratif) | 2013→2024 | 2013→2024 | — | — |
| Marchés publics de la collectivité parisienne | 2013→2024 | 2013→2026 | — | — |
| Logements sociaux financés | 2001→2025 | 2001→2025 | — | — |
| Dette garantie par la Ville | 2007→2025 | 2007→2025 | — | — |
| Bilan comptable | 2016→2024 | 2016→2024 | 1 | — |

## Jeux de données, un par ligne

| Série | Jeu | Ingéré | Lignes | Exercices | Total | Dernière MAJ Ville |
|---|---|---|---|---|---|---|
| budget_execute | [comptes-administratifs-budgets-principaux-a-partir-d](https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/) | oui | 25629 | 2019→2024 | 62 812 M€ | 2025-08-26 |
| budget_execute | [comptes-administratifs-principaux-2018-m57-ville-dep](https://opendata.paris.fr/explore/dataset/comptes-administratifs-principaux-2018-m57-ville-departement/) | **non** | 4581 | 2018→2018 | 21 560 M€ | 2019-11-28 |
| budget_execute | [comptes-administratifs-principaux-ville-departement](https://opendata.paris.fr/explore/dataset/comptes-administratifs-principaux-ville-departement/) | **non** | 30899 | 2009→2017 | 88 835 M€ | 2019-11-28 |
| budget_vote | [budgets-votes-principaux-a-partir-de-2019-m57-ville-](https://opendata.paris.fr/explore/dataset/budgets-votes-principaux-a-partir-de-2019-m57-ville-departement/) | oui | 8598 | 2019→2021 | — | 2020-11-25 |
| budget_vote | [bugdet-votes-principaux](https://opendata.paris.fr/explore/dataset/bugdet-votes-principaux/) | **non** | 28075 | 2009→2017 | — | 2019-11-28 |
| budget_vote | [bugdet-votes-principaux_2018_m57_ville_dpt](https://opendata.paris.fr/explore/dataset/bugdet-votes-principaux_2018_m57_ville_dpt/) | **non** | 3715 | 2018→2018 | — | 2019-11-28 |
| ap_execute | [comptes-administratifs-autorisations-de-programmes-a](https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/) | oui | 7466 | 2018→2022 | 1 969 M€ | 2019-11-28 |
| ap_execute | [comptes-administratifs-autorisations-de-programmes-a](https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-ap-ville-departement/) | oui | 27927 | 2009→2017 | 14 436 M€ | 2019-11-28 |
| investissements_carte | [comptes-administratifs-autorisations-de-programmes-a](https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/) | oui | 7466 | 2018→2022 | 2 278 M€ | 2019-11-28 |
| subventions | [subventions-versees](https://opendata.paris.fr/explore/dataset/subventions-versees/) | oui | 39431 | 2013→2017 | 6 189 M€ | 2019-12-19 |
| subventions | [subventions-versees-annexe-compte-administratif-a-pa](https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/) | oui | 47381 | 2018→2024 | 6 267 M€ | 2025-08-26 |
| marches | [liste-des-marches-de-la-collectivite-parisienne](https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/) | oui | 17639 | 2013→2024 | 33 184 M€ | 2024-05-02 |
| logements_sociaux | [logements-sociaux-finances-a-paris](https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/) | oui | 4293 | 2001→2025 | — | 2026-09-08 |
| dette_garantie | [dette-garantie](https://opendata.paris.fr/explore/dataset/dette-garantie/) | oui | 147071 | 2007→2025 | 174 108 M€ | 2026-07-01 |
| bilan | [bilan-comptable](https://opendata.paris.fr/explore/dataset/bilan-comptable/) | oui | 506 | 2016→2024 | 650 300 M€ | 2024-07-05 |

## Ce qu'il faut corriger chez nous

- info · `ECART_DOCUMENTE` · bilan — la Ville publie 2016→2024, le site sert 2016→2024 : 1 exercice(s) absent(s) (2017) — L'exercice 2017 manque parce que la Ville a publié un actif sans aucun passif cette année-là (28 lignes de passif, zéro valeur dans `brut` comme dans `net`). Un bilan sans passif n'est pas un bilan.
- info · `SERIE_COUPEE_DOCUMENTEE` · budget_execute — « Comptes Administratifs - Budgets Principaux 2018 (M57 Ville-département) » (comptes-administratifs-principaux-2018-m57-ville-departement) est un autre morceau d'une série qu'on ingère déjà, et il n'est pas ingéré : 4581 lignes, 21560 M€, exercices 2018→2018
- info · `SERIE_COUPEE_DOCUMENTEE` · budget_execute — « Comptes Administratifs - Budgets Principaux 2009 - 2017 (M14-M52 Ville-département) » (comptes-administratifs-principaux-ville-departement) est un autre morceau d'une série qu'on ingère déjà, et il n'est pas ingéré : 30899 lignes, 88835 M€, exercices 2009→2017
- info · `ECART_DOCUMENTE` · budget_execute — la Ville publie 2009→2024, le site sert 2019→2024 : 10 exercice(s) absent(s) (2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018) — Les exercices 2009-2018 existent (deux jeux, 35 480 lignes, 110 Md€) et NE SONT PAS ingérés, volontairement. Les deux plans comptables ne partagent qu'UNE valeur de chapitre sur 100 côté M14 et 25 côté M57, et les libellés de fonction communs le sont par coïncidence (« APA versée à l'établissement » contre « APA versé bénéf établisem »). Les empiler donnerait un graphique dont les catégories ne veulent pas dire la même chose avant et après 2019 : faux et vraisemblable, ce qui est pire que manquant. Il faut une table de correspondance M14 → catégories du site, écrite et relue. Mesuré le 2026-09-10.
- info · `SERIE_COUPEE_DOCUMENTEE` · budget_vote — « Budgets Votés - Budget Principal 2009 - 2017 (M14-M52 Ville-département) » (bugdet-votes-principaux) est un autre morceau d'une série qu'on ingère déjà, et il n'est pas ingéré : 28075 lignes, exercices 2009→2017
- info · `SERIE_COUPEE_DOCUMENTEE` · budget_vote — « Budgets Votés - Budget Principal 2018 (M57 Ville-département) » (bugdet-votes-principaux_2018_m57_ville_dpt) est un autre morceau d'une série qu'on ingère déjà, et il n'est pas ingéré : 3715 lignes, exercices 2018→2018
- info · `ECART_DOCUMENTE` · budget_vote — la Ville publie 2009→2021, le site sert 2019→2026 : 10 exercice(s) absent(s) (2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018) — Même obstacle que le budget exécuté : nomenclatures M14 et M57 non compatibles, une table de correspondance est nécessaire.
- info · `PERIMETRE_NON_ALIGNE` · marches — 2022 : source 3824.6 M€ vs site 3934.6 M€ (2.9 % d'écart) — périmètres différents : l'export fusionne l'open data et les DECP nationales : le total dépasse la seule source ODS
- info · `PERIMETRE_NON_ALIGNE` · marches — 2024 : source 2495.7 M€ vs site 3219.8 M€ (29.0 % d'écart) — périmètres différents : l'export fusionne l'open data et les DECP nationales : le total dépasse la seule source ODS

## Ce que la Ville publie mal

- avertissement · `JEU_ABANDONNE` · ap_execute — comptes-administratifs-autorisations-de-programmes-ap-ville-departement : dernier exercice 2017, dernière mise à jour déclarée le 2019-11-28 — les deux concordent, le jeu n'est plus alimenté
- avertissement · `SOURCE_GELEE` · ap_execute — dernier exercice publié 2022, soit 4 ans de retard sur 2026 : la Ville a cessé d'alimenter la série
- avertissement · `JEU_ABANDONNE` · budget_execute — comptes-administratifs-principaux-2018-m57-ville-departement : dernier exercice 2018, dernière mise à jour déclarée le 2019-11-28 — les deux concordent, le jeu n'est plus alimenté
- avertissement · `JEU_ABANDONNE` · budget_execute — comptes-administratifs-principaux-ville-departement : dernier exercice 2017, dernière mise à jour déclarée le 2019-11-28 — les deux concordent, le jeu n'est plus alimenté
- avertissement · `ANNEE_PARTIELLE_SOURCE` · budget_vote — budgets-votes-principaux-a-partir-de-2019-m57-ville-departement : l'exercice 2021 ne compte que 460 lignes contre 4029 en année pleine (11 %) — dépôt interrompu, l'exercice ne peut pas être présenté comme complet
- avertissement · `JEU_ABANDONNE` · budget_vote — bugdet-votes-principaux : dernier exercice 2017, dernière mise à jour déclarée le 2019-11-28 — les deux concordent, le jeu n'est plus alimenté
- avertissement · `JEU_ABANDONNE` · budget_vote — bugdet-votes-principaux_2018_m57_ville_dpt : dernier exercice 2018, dernière mise à jour déclarée le 2019-11-28 — les deux concordent, le jeu n'est plus alimenté
- avertissement · `SOURCE_GELEE` · budget_vote — dernier exercice publié 2021, soit 5 ans de retard sur 2026 : la Ville a cessé d'alimenter la série
- avertissement · `SOURCE_GELEE` · investissements_carte — dernier exercice publié 2022, soit 4 ans de retard sur 2026 : la Ville a cessé d'alimenter la série
- avertissement · `JEU_ABANDONNE` · subventions — subventions-versees : dernier exercice 2017, dernière mise à jour déclarée le 2019-12-19 — les deux concordent, le jeu n'est plus alimenté
- info · `METADONNEE_INCOHERENTE` · ap_execute — comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de : le jeu contient l'exercice 2022 alors que le portail annonce une dernière mise à jour au 2019-11-28 — la date de fraîcheur affichée aux réutilisateurs est fausse
- info · `COLONNE_ABIMEE` · budget_execute — comptes-administratifs-principaux-2018-m57-ville-departement : la colonne « mandate_titre_x000d_apres_regul » contient un retour chariot Excel (_x000d_), le même champ s'appelle autrement dans l'autre moitié de la série
- info · `IDENTIFIANT_FAUTIF` · budget_vote — identifiant de jeu mal orthographié à la source : « bugdet-votes-principaux » — il ne peut pas être deviné, seul le catalogue le donne
- info · `IDENTIFIANT_FAUTIF` · budget_vote — identifiant de jeu mal orthographié à la source : « bugdet-votes-principaux_2018_m57_ville_dpt » — il ne peut pas être deviné, seul le catalogue le donne
- info · `METADONNEE_INCOHERENTE` · budget_vote — budgets-votes-principaux-a-partir-de-2019-m57-ville-departement : le jeu contient l'exercice 2021 alors que le portail annonce une dernière mise à jour au 2020-11-25 — la date de fraîcheur affichée aux réutilisateurs est fausse
- info · `METADONNEE_INCOHERENTE` · investissements_carte — comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de : le jeu contient l'exercice 2022 alors que le portail annonce une dernière mise à jour au 2019-11-28 — la date de fraîcheur affichée aux réutilisateurs est fausse

## Écarts de total, année par année

| Série | Exercice | Source | Site | Écart |
|---|---|---|---|---|
| budget_execute | 2019 | 9806.3 M€ | 9806.3 M€ | 0.0 % |
| budget_execute | 2020 | 9940.6 M€ | 9940.6 M€ | 0.0 % |
| budget_execute | 2021 | 10025.2 M€ | 10025.2 M€ | 0.0 % |
| budget_execute | 2022 | 10699.6 M€ | 10699.6 M€ | 0.0 % |
| budget_execute | 2023 | 10845.3 M€ | 10845.3 M€ | 0.0 % |
| budget_execute | 2024 | 11494.7 M€ | 11494.7 M€ | 0.0 % |
| ap_execute | 2009 | 1692.6 M€ | 1692.6 M€ | 0.0 % |
| ap_execute | 2010 | 1536.4 M€ | 1536.4 M€ | 0.0 % |
| ap_execute | 2011 | 1707.4 M€ | 1707.4 M€ | 0.0 % |
| ap_execute | 2012 | 1666.2 M€ | 1666.2 M€ | 0.0 % |
| ap_execute | 2013 | 1835.6 M€ | 1835.6 M€ | 0.0 % |
| ap_execute | 2014 | 1767.9 M€ | 1767.9 M€ | 0.0 % |
| ap_execute | 2015 | 1369.4 M€ | 1369.4 M€ | 0.0 % |
| ap_execute | 2016 | 1651.0 M€ | 1651.0 M€ | 0.0 % |
| ap_execute | 2017 | 1208.9 M€ | 1208.9 M€ | 0.0 % |
| ap_execute | 2018 | 688.4 M€ | 688.4 M€ | 0.0 % |
| ap_execute | 2019 | 557.1 M€ | 557.1 M€ | 0.0 % |
| ap_execute | 2020 | 318.7 M€ | 318.7 M€ | 0.0 % |
| ap_execute | 2021 | 247.5 M€ | 247.5 M€ | 0.0 % |
| ap_execute | 2022 | 156.9 M€ | 156.9 M€ | 0.0 % |
| subventions | 2013 | 1265.8 M€ | 1265.8 M€ | 0.0 % |
| subventions | 2014 | 1362.1 M€ | 1362.1 M€ | 0.0 % |
| subventions | 2015 | 1149.9 M€ | 1149.9 M€ | 0.0 % |
| subventions | 2016 | 1261.0 M€ | 1261.0 M€ | 0.0 % |
| subventions | 2017 | 1150.1 M€ | 1150.1 M€ | 0.0 % |
| subventions | 2018 | 1241.3 M€ | 1241.3 M€ | 0.0 % |
| subventions | 2019 | 1304.0 M€ | 1304.0 M€ | 0.0 % |
| subventions | 2022 | 1167.6 M€ | 1167.6 M€ | 0.0 % |
| subventions | 2023 | 1201.0 M€ | 1201.0 M€ | 0.0 % |
| subventions | 2024 | 1353.5 M€ | 1353.5 M€ | 0.0 % |
| marches | 2013 | 1903.2 M€ | 1901.1 M€ | 0.1 % |
| marches | 2014 | 1530.5 M€ | 1530.5 M€ | 0.0 % |
| marches | 2015 | 1538.5 M€ | 1538.5 M€ | 0.0 % |
| marches | 2016 | 1917.2 M€ | 1916.8 M€ | 0.0 % |
| marches | 2017 | 3465.6 M€ | 3465.6 M€ | 0.0 % |
| marches | 2018 | 2836.2 M€ | 2836.2 M€ | 0.0 % |
| marches | 2019 | 2303.0 M€ | 2313.2 M€ | 0.5 % |
| marches | 2020 | 3282.3 M€ | 3292.5 M€ | 0.3 % |
| marches | 2021 | 5483.5 M€ | 5483.5 M€ | 0.0 % |
| marches | 2022 | 3824.6 M€ | 3934.6 M€ | 2.9 % |
| marches | 2023 | 2603.7 M€ | 2606.7 M€ | 0.1 % |
| marches | 2024 | 2495.7 M€ | 3219.8 M€ | 29.0 % |
