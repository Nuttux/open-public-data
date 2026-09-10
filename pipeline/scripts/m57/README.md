# Lire les documents budgétaires communaux (M14 / M57 / CFU)

## Pourquoi ces scripts existent

La DGFiP publie déjà la ventilation par **fonction** pour ~3 384 communes
(`sync_communes_fonctionnelle.py`, jeu « présentation croisée nature-fonction »).
Ce n'est donc **pas** ce qu'on cherche ici.

Ce qu'aucun jeu national ne couvre — vérifié le 2026-09-10 sur data.economie,
data.gouv, OFGL et Data.Subvention — ce sont les **annexes nominatives** des
maquettes budgétaires :

| Annexe | M14 | M57 | Ce qu'elle contient |
|---|---|---|---|
| Subventions | B1.7 | **B8** | bénéficiaire, montant, objet, nature juridique, code fonction |
| État de la dette | A2.x | B1.x | prêteur, date, nominal, taux, index, profil |
| Emprunts garantis | B1.1 | B7.3 | bailleurs sociaux et autres |
| AP/CP | B2.1 | B2.1 | programmes pluriannuels nommés |
| État du personnel | C1.1 | **B9** | effectifs par grade en ETP (aucun nom) |

⚠ **Les codes d'annexe changent entre M14 et M57** — en M57, « B1.7 » désigne
l'état de la dette. Toujours reconnaître une annexe à son **titre**, jamais à
son code.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `lecteur_m57.py` | le lecteur : entité, fonction (3 mises en page), subventions (2 formats), OCR |
| `decouverte_base.py` | briques de découverte : crawl, sitemap, WordPress, Google, Wayback, Calameo |
| `decouverte.py` | les 5 canaux assemblés + verdicts démontrables |
| `sonde_subventions.py` | la sonde en cours : cherche la liste nominative, avec sa validation DGFiP |
| `ods_delib_index.py` | moissonne les jeux « délibérations » Opendatasoft (à relancer de temps en temps) |
| `ingere_manuel.py` | ingère les PDF déposés à la main dans `~/Desktop/qipu-maquettes-manuelles/` |
| `barometre.py` | agrège les sondes : catégories, redressement par tranche, intervalle de confiance |
| `google_search.mjs` | Google dans un Chromium visible (tous les moteurs bloquent les scripts) |
| `browser_fetch.mjs` | Chromium pour les sites protégés et Calameo |
| `mesures/` | résultats qu'on ne veut pas refaire (index ODS, sondes, portails) |

## Les trois mises en page de la présentation par fonction

1. **M14 « croisée »** — une page par fonction, colonnes = sous-fonctions, une
   colonne **Total** qui répète le total : lire cette colonne, garder le max entre pages.
2. **M57 « détaillée »** (A1.9xx / A2.9xx) — une page par fonction, **pas** de
   colonne Total, pages en **paysage** (`/Rotate 90`) : sommer la ligne, et
   **additionner** les pages de suite (elles portent d'autres sous-fonctions).
3. **CFU « vue d'ensemble »** (A1/A2) — un seul tableau, colonnes = fonctions,
   lignes = chapitres de nature. La plus riche (croisement fonction × nature +
   recettes) et la plus simple à contrôler : la colonne TOTAL est imprimée.
   C'est le format de tout le corpus à partir de 2026.

## La validation, qui n'est pas optionnelle

Chaque extraction se compare à une référence, et c'est ce qui a attrapé
plusieurs erreurs graves (un total de 99 M€ au lieu de 7,2 pour Nanterre) :

- **CFU / M57 B8** : les totaux sont imprimés dans le document (écart attendu 0 %).
- **M14 B1.7** : partie « personnes de droit privé » ≈ compte **65748** de la
  balance DGFiP. Ne pas y ajouter 657362/657363 (subvention au CCAS), qui
  relèvent de la rubrique « personnes de droit public ».
- **Fonction** : à comparer aux balances, en gardant à l'esprit que la maquette
  inclut les opérations d'ordre (amortissements) et notre export DGFiP non —
  d'où ~15 % d'écart structurel.

Écarts observés sur les cas validés : Châteauneuf +3,0 %, Plessis-Robinson
−9,0 %, Nanterre +25,1 % (son comité d'action sociale est classé « association »
dans le document et en 657362 dans les comptes — différence de classement, pas
de lecture).

## Pièges mesurés, à ne pas refaire

- **macOS n'a pas `setsid`** : lancer les passes via
  `subprocess.Popen([...], start_new_session=True)` ; `nohup &` meurt avec le shell.
- **Google bloque par intermittence** : un « zéro résultat » sur un `site:` de
  mairie est un blocage, pas une absence → réessayer sur un autre profil, et si
  ça échoue, conclure « non concluant », jamais « rien publié ».
- **Ne jamais retenir un document hors domaine** sauf plateforme connue
  (Calameo, Huwise, Issuu…) : sinon on attribue le budget de la commune voisine.
- **Un montant se lit par POSITION de colonne**, pas par expression régulière :
  un nom finissant par un chiffre (« NANTERRE 92 ») se colle au montant.
- **Ralentir** : ≥ 1 s entre requêtes, ≤ 24 pages par site. Deux communes nous
  ont coupé la connexion après une journée de passes.
- L'API data.economie n'accepte pas `like` ni `(a or b)` dans `where` ;
  `compte in (…)` fonctionne. Chercher une commune par `ndept` + `insee`.

Détail complet des pièges : mémoire `project_m57_lecteur`.
