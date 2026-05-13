# ADR-0009 : Process ADR going forward

**Status** : Accepted (2026-05-07)
**Décideur** : daniel

## Contexte

Les ADR 0001-0008 ont été rédigés en backfill le même jour (2026-05-07) lors du refactor layering. C'est honnête à dire mais peu satisfaisant comme méthode : les ADR perdent leur intérêt principal qui est de **forcer l'argumentation AVANT le commit**.

À partir de maintenant, on veut éviter de rejouer ce piège.

## Décision

### Quand rédiger un ADR

Un ADR est requis pour tout changement qui :

1. Ajoute, supprime ou renomme une **couche dbt** (stg, core, int, mart)
2. Change la **règle de layering** (qui peut lire quoi, qui peut écrire où)
3. Ajoute une **catégorie d'exception** dans `pipeline/scripts/audit/layering_whitelist.yml`
4. Introduit ou retire une **convention de nommage** (tables BQ, fichiers JSON, etc.)
5. Modifie le **process de release** ou l'**audit gate** (CI checks)
6. Touche au **modèle de données canonique** (ce qu'est une « entité » : subvention, marché, etc.)

Les changements de SQL d'un modèle particulier ne nécessitent **PAS** d'ADR sauf si l'un des 6 points ci-dessus est concerné.

### Workflow

1. Rédiger l'ADR dans `docs/decisions/NNNN-titre.md` (numéro = max actuel + 1) avec status `Proposed`
2. Ouvrir la PR contenant **uniquement** l'ADR
3. Faire reviewer (en solo : se laisser 24h pour relire à froid)
4. Merger l'ADR avec status `Accepted`
5. Ouvrir une seconde PR avec l'implémentation, qui référence l'ADR dans son message de commit
6. Si pendant l'implémentation on découvre que l'ADR avait tort, soit corriger l'ADR (Edit), soit le marquer `Superseded` et écrire un nouveau

### Statuts possibles

- **Proposed** : en discussion, code non écrit
- **Accepted** : décision prise, code peut être écrit
- **Superseded by ADR-NNNN** : décision défaite par un ADR ultérieur (l'ancien reste accessible mais le nouveau prime)
- **Deprecated** : décision plus pertinente (le contexte a changé)

### Format

Voir le template dans n'importe quel ADR existant. Sections obligatoires :
- Status, Décideur, Date
- Contexte (pourquoi cette décision aujourd'hui)
- Décision (quoi)
- Alternatives rejetées (avec ✅/❌ pour chaque)
- Conséquences (positives ET négatives)
- Enforcement (comment on s'assure que ça tient)

## Alternatives rejetées

**A. Pas d'ADR, juste les commits Git**
- ❌ Le commit message dit le quoi, pas le pourquoi en profondeur
- ❌ Les alternatives rejetées disparaissent de la mémoire

**B. ADR uniquement quand quelqu'un tient à les défendre**
- ❌ Le projet redevient invisible pour un nouvel arrivant
- ❌ Pas de hygiene constante

**C. ADR pour CHAQUE changement de SQL**
- ❌ Pollution
- ❌ Les vrais ADR se noient dans le bruit

## Conséquences

**Positives** :
- Les futures décisions seront documentées AVANT le code (intent clair)
- Un nouvel arrivant peut lire les ADR pour comprendre l'historique des choix
- Les alternatives rejetées restent accessibles

**Négatives** :
- Friction : ouvrir une PR avant d'écrire le code peut sembler bureaucratique
- Risque de skip si le solo dev est pressé

**Mitigation** : commencer petit. Un ADR de 30 lignes est meilleur que pas d'ADR. Si le projet se collabore, le process se renforce naturellement par la review.

## Enforcement

- Pas de gate CI strict (ce serait disproportionné).
- Une **checklist PR** dans `.github/pull_request_template.md` qui demande : « Ce changement modifie-t-il une couche dbt, la règle de layering, le naming, ou le process release ? Si oui, lien vers l'ADR. »

À ajouter dans la prochaine itération.
