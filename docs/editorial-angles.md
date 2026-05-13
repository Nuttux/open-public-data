# Angles éditoriaux des calculs — audit méthodologique

**But** : pour chaque métrique factuelle affichée sur le site, documenter quel calcul on fait, quelles autres méthodologies existent, et où le choix pourrait être perçu comme partisan.

**Principe guide** : si une métrique a plusieurs lectures légitimes avec des écarts > 10%, on doit soit afficher les deux, soit expliciter pourquoi on choisit une seule. Ne jamais laisser un chiffre "autoritaire" sans indiquer sa famille méthodologique.

**Exemple fondateur du besoin** : capacité de désendettement Paris 2024
- Méthode Ville / M57 stricte : **3.8 ans** (dette financière ÷ épargne brute)
- Méthode CRC / consolidée : **~39 ans** (dette + engagements hors-bilan + garanties ÷ épargne nette)

Afficher uniquement l'un des deux = partisan de fait. Afficher les deux + explication = neutre.

---

## Matrice des métriques à angles multiples

Légende :
- 🟢 = on est déjà honnête (bon angle ou double affichage)
- 🟡 = on pourrait être plus nuancé (ajouter une lecture alternative)
- 🔴 = risque partisan (choix implicite non documenté)

### Budget (/budget, LandingClient)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Dépenses totales** | `d.depenses` (~11.7 Md€) | Brut M57 (inclut opérations pour ordre) | Dépenses réelles hors ops pour ordre (~8-9 Md€) | 🟡 — on affiche le brut, la "moitié du budget apparaît deux fois" mentionnée dans le placeholder d'article mais pas démontrée |
| **Dépenses par habitant/mois** | `totalDepenses / PARIS_POPULATION / 12` | Population municipale INSEE 2,13M | Population jour (3-4M), population légale variante | 🟡 — valable mais ne distingue pas "ce que ça coûte au Parisien résident" vs "au Parisien-jour qui utilise le service" |
| **Delta YoY dépenses** | `d.deltaDepensesPct` | `(N/N-1) - 1` en % | Delta en volume constant (inflation), delta structurel | 🔴 — inflation non déflatée, compare en euros courants |
| **Taux d'exécution** | `versé / voté` | Exécuté / Voté depuis `mart_vote_vs_execute` | Versé / Engagé (plus strict), Versé / Budget primitif + décisions modif | 🟡 — choix légitime, à documenter |
| **Épargne brute** | `recettes_fonct - dépenses_fonct` | Définition standard M57 | Épargne nette (après intérêts de la dette) | 🟡 — notre choix est standard, CRC préfère épargne nette |

### Dette et patrimoine (/dette-patrimoine)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Capacité désendettement** | `d.capaciteDesendettement` (?) | À vérifier en détail | Voir exemple fondateur (3.8 vs 39 ans) | 🔴 — à traiter en priorité |
| **Dette financière** | `d.detteFinanciere` (~7-8 Md€) | Classe 16 bilan M57, budget principal | Dette consolidée groupe (Paris Habitat, satellites), Dette + hors-bilan (~30+ Md€) | 🔴 — périmètre étroit non explicité systématiquement |
| **Patrimoine net (fonds propres)** | `d.fondsPropres` (~17 Md€) | Actif - Passif en valeur comptable M57 | Valeur marché (estimée, non comptabilisée) | 🟡 — caveat nécessaire : valeur marché du patrimoine parisien >> valeur comptable (monuments, œuvres) |
| **Taux d'endettement** | `dette / actif` | Budget principal seul | Consolidé groupe | 🔴 — même problème de périmètre |
| **Dette par habitant** | `d.detteFinanciere / PARIS_POPULATION` | Pop INSEE municipale | Cf. per-capita ailleurs | 🟢 — cohérent avec les autres pages |
| **Hors-bilan** | `horsBilan.totals.capital_restant` (~30 Md€ ?) | Garanties d'emprunt bailleurs sociaux | Inclusion dans la "vraie dette" selon CRC | 🟡 — on l'affiche, mais bien séparé du bilan — risque de sous-lecture |

### Subventions (/qui-recoit)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Total subventions versées** | `d.total` | Versées (CA annexes) | Votées (DM + BP), différence = exécution | 🟢 — choix explicite "versé" = réalité froide, doc le rappelle |
| **Top 10 bénéficiaires** | `d.top10[]` | Agrégé par bénéficiaire normalisé (SIRET + libellé LLM) | Agrégé par SIRET strict (sans LLM) | 🟡 — la normalisation LLM peut masquer/fusionner à tort ; publier le taux de résolution SIRET |
| **Concentration top 10** | `topSum / total` | Pareto sur bénéficiaires | Pareto sur thématiques, sur types de structure | 🟢 — convention standard |
| **Répartition thématique** | `d.byTheme[]` | Classification LLM Gemini/Haiku via seed cache | Classification par chapitre M57 comptable | 🟡 — le cache LLM n'est qu'à 50% de couverture aujourd'hui (12k/26k bénéficiaires) |

### Marchés publics (/marches-publics)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Total marchés notifiés** | `d.total` | Somme plafonds contractuels | Dépense réelle (non publiée systématiquement) | 🟡 — plafond = "peut payer jusqu'à", très différent de "a payé" ; caveat à rendre visible |
| **Nombre de marchés** | `d.nb` | Fusion opendata.paris + DECP (recouvrement ~55%) | opendata.paris seul (sous-estimation), DECP seul | 🟢 — méthodo documentée, fusion transparente |
| **Périmètre** | Ville + dépts publiés | Budget principal | Consolidé avec satellites (ParisHabitat, Eau de Paris, SEM, CASVP) | 🔴 — satellites exclus → sous-estime la commande publique réelle Parisienne |

### Logement social (/logement-social)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Ratio SRU** | `d.sruRatio` (~28% ?) | DDT officielle au 1er janvier | Incluant différents types de logements (intermédiaires inclus ou pas) | 🟡 — vérifier que c'est bien la base "loi SRU stricte" et pas "logements aidés au sens large" |
| **Tension (ratio demandes/attribs)** | 21.5 | DRIHL XLSX choix 1 | DRIHL tous choix (~28) | 🟢 — validé par test automatique vs infographie DRIHL (21) |
| **Délai médian attribution** | 29.9 mois (2.5 ans) | DRIHL — seulement attributaires | Ancienneté moyenne file active (non biaisé survivant) | 🟢 — caveat explicite "biais survivant" dans le composant |
| **Nouveaux logements/an** | `d.nouveauxParAn` | AP votées (promesse), pas livrées | Logements livrés (réalité habitable) | 🔴 — on affiche l'AP mais souvent sans dire que c'est la promesse, pas la réalité |

### Investissements (/investissements)

| Métrique | Notre valeur | Calcul | Alternative(s) | Status |
|---|---|---|---|---|
| **Total investissement** | `d.total` (AP) | Autorisations de Programme votées | CP (Crédits de Paiement) = réalité annuelle payée | 🔴 — AP ≠ CP ≠ chantier livré ; 3 notions différentes, on affiche la plus impressionnante (AP) |
| **Projets géolocalisés** | `d.pctGeo` (~70-80%) | BAN + LLM Gemini | Sans LLM (% plus bas) | 🟡 — documenter combien vient du LLM vs BAN pur |

---

## Métriques 🔴 prioritaires à traiter

Dans l'ordre d'impact éditorial :

1. **Capacité de désendettement** — exemple fondateur, 10× de différence. Doit afficher les deux lectures + explication.
2. **Dette financière (périmètre)** — budget principal vs consolidé groupe. Peut masquer 20-30 Md€ d'exposition.
3. **Investissements AP vs CP** — on affiche l'AP (flatteur) sans toujours dire que la réalité payée est une fraction.
4. **Nouveaux logements SLS : votés vs livrés** — même problème, décalage 3-4 ans entre la promesse et la livraison.
5. **Périmètre marchés publics (satellites)** — exclusion de ParisHabitat/Eau de Paris sous-estime la commande publique réelle.

Pour chacune : suggestion d'intervention = composant frontend `<AlternativeReading>` qui affiche sous le chiffre principal la valeur alternative + phrase explicative sourcée.

---

## Métriques 🟡 à affiner (second temps)

1. **Delta YoY non déflaté** — inflation absorbée, évolution réelle mal lisible. À terme : toggle "euros courants / constants".
2. **Per-capita monthly** — population résidente vs population jour. À terme : petit tip expliquant pourquoi on prend la pop résidente.
3. **Top 10 bénéficiaires** — taux de résolution SIRET à publier.
4. **Couverture classification LLM** — afficher explicitement la part classifiée vs "Autre".

---

## Process proposé pour l'audit continu

1. **Pour chaque nouveau chiffre affiché**, remplir cette matrice (3 colonnes : notre valeur, alternatives connues, status).
2. **Sources de comparaison canoniques** à interroger automatiquement quand possible :
   - Cour des comptes — rapports annuels finances locales
   - CRC Île-de-France — rapports par commune
   - OFGL — observatoire finances locales
   - DGFiP — fiches AEFF communes
   - Ministère du Logement — inventaire SRU
   - DRIHL — socles annuels (déjà intégré pour 1 métrique)
3. **Script `pipeline/scripts/audit/check_vs_authoritative.py`** (à créer) qui :
   - Tire nos valeurs depuis dbt
   - Les compare aux valeurs publiées par ces sources (quand elles sont machine-readable)
   - Flag les divergences > seuil ET non listées dans ce doc comme choix documenté

---

## Statut du doc

- Rédaction initiale : 2026-04-23
- Sources : audit manuel des pages du site + agent Explore
- À faire : 🔴 compléter les cases "?" (capacité désendettement exact, SRU ratio actuel, etc.) en vérifiant les valeurs courantes dans le code
- À faire : créer composant `<AlternativeReading>` + l'appliquer aux 5 métriques 🔴
