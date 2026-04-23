# Ideas & roadmap

Notes libres sur les pistes à explorer, classées par horizon. Pas un plan validé — un carnet.

## En cours (court terme)

### Jalon délibés marchés → join projet ↔ fournisseurs
Étendre `pipeline/scripts/sync/scrape_deliberations.py` aux délibés marchés (filtres : `Marché|Attribution|Avenant|Modification de contrat|Accord-cadre`), parser les PDF, extraire `(numero_marche, objet, fournisseur, operation_liee, adresse)` via regex.

**Objectif mesurable** : sur une session pilote, quel % des marchés Ville sont retrouvés en délibé avec un champ `operation_liee` exploitable pour joindre les investissements ?

**Décision conditionnelle** :
- ≥80% couverture → on généralise, on connecte à la table investissements, fiche projet affiche "fournisseurs identifiés".
- <50% ou libellés trop vagues → on bascule sur NER LLM direct sur `objet` marché (prio 2 ci-dessous).

Format numéros confirmé compatible (`20232023S06216` identique des deux côtés). Volume estimé : ~500-1000 PDF délibés marchés/an, parsing trivial une fois téléchargé.

### Pistes fuzzy fallback (si délibés insuffisants)
1. Lexique d'abréviations DECP Paris (`TVX`, `MS`, `SA3/SA4`, `MSAC`, `MOE`, `CSPS`, `GO`) → expansion avant match.
2. NER LLM batch : extraire `{equipement_type, toponyme, adresse, arrondissement, lot}` côté projets ET côté marchés (~17k lignes, ~8$ Haiku), matcher sur champs normalisés.
3. Géocodage adresse dans `nom_projet` ↔ adresse dans `objet` marché.
4. Signal fournisseurs spécialisés patrimoine (Pradeau Morin, Lefèvre, UTB, Freyssinet…) pour booster candidats une fois un lot identifié.

## Moyen terme — budgets annexes & opérateurs publics

### Contexte
Jusqu'ici le site couvre uniquement le **budget principal** de la Ville (~10Mds€). Angles morts majeurs :
- **Budget annexe assainissement** (réseau égouts/stations) — centaines de M€/an.
- Autres budgets annexes à cataloguer.
- **EPIC / SPL / EPA rattachés** avec compta propre mais dépendance Ville :
  - Eau de Paris (EPIC) ~450M€
  - CASVP (Centre d'action sociale) ~700M€
  - ParisHabitat, RIVP, Élogie-Siemp (bailleurs)
  - Paris Musées (EPA)
  - Paris La Défense, ParisAnAir, SemPariSeine, Paris Habitat OPH

Somme plausible : **3-4 Mds€ de dépense publique parisienne hors budget principal**, invisibles aujourd'hui.

### Jalon 1 — Cartographie des entités
Table `operateurs_paris` : nom, SIRET, type juridique (EPIC/SPL/EPA/SEM/bailleur), lien avec la Ville (tutelle/actionnaire/subvention), part Ville dans les ressources, budget annuel, URL rapports.

Source : rapports annuels (PDF stables année après année) + data.gouv (DECP avec `acheteur_siret` = opérateur).

### Jalon 2 — Fiches simples par entité
Pour chaque opérateur : recettes, dépenses, top fournisseurs, lien vers DECP. Format identique fiche marchés Ville actuelle.

Features citoyennes rendues possibles :
- *"Combien coûte l'eau à Paris et à qui ça va ?"* (fiche Eau de Paris).
- *"Le CASVP aide N parisiens, avec quel budget ?"*
- *"La vraie dépense publique parisienne"* consolidée principal + annexes + EPIC.

### Jalon 3 — DECP bailleurs intégrée aux fiches projets HLM
Rapatrier DECP national filtrée sur SIRET bailleurs parisiens. Fiche logement social affiche entreprises titulaires sur opérations précises (quand fléchage conventionnel disponible).

## Long terme — vues consolidées & graphes

Territoire journaliste/chercheur, à ranger dans un onglet "aller plus loin" distinct des vues citoyennes par défaut.

### Règle éditoriale
Distinguer visuellement :
- **Fléché** (convention/délibé nommant projet + marché) — trait plein, somme affichée.
- **Proportionnel** (subvention fongible dans le budget d'un opérateur) — trait pointillé, ratio affiché, disclaimer.

Jamais dire "tel euro Ville a payé tel marché" quand c'est fongible.

### Views possibles
1. **Graphe Ville → opérateurs → fournisseurs finaux** (avec distinction fléché/proportionnel).
2. **Top fournisseurs consolidés toutes sources** (Ville + bailleurs + EDP + SEM, joint par SIRET).
3. **Argent public consolidé par quartier** : investissements localisés + marchés `lieu_execution` + subventions assos domiciliées + marchés bailleurs géocodés.
4. **Anomalies de gouvernance** : asso subventionnée aussi titulaire de marché, fournisseur chez 6 acheteurs publics parisiens, etc.
5. **Écart vote ↔ exécution étendu opérateurs** : *"vote 200M€ logement social → N logements produits par bailleurs pour Y€ de marchés"*.
6. **Chaînes subvention → sous-subvention** (fédérations qui redistribuent à assos membres, via bilans annuels > 153k€).
7. **Empreinte PME locale** : % marchés Ville → boîtes <50 salariés domiciliées Paris (join DECP + SIRENE).

### Faisabilité technique
Toutes ces vues sont des joins sur des datasets déjà publics mais éclatés sur 6-10 portails sans clé commune propre. Faisable techniquement, inaccessible au particulier sans compétence data.

## Principes transversaux

- **Page par défaut** répond à *"qui / combien / où"* en une ligne. Complexité cachée en onglet.
- **Jamais de framing "vos impôts"** — préférer "service public / ce que la Ville produit".
- **Source-ancré** : "d'après la DECP 2023", "selon le rapport annuel ParisHabitat", plutôt que claims absolus.
- **Disclaimer honnête** quand couverture partielle : "X% du montant projet couvert par marchés ≥ 40k€ HT".
