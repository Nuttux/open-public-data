# Changelog méthodologique — convention interne

Cette doc encadre **comment** on enregistre une évolution méthodologique. Le rendu utilisateur se fait sur la page [/corrections](https://franceopendata.org/corrections), alimentée par [website/public/data/corrections.json](../website/public/data/corrections.json).

## Quand créer une entrée

| Cas | Catégorie | Entrée requise ? |
|---|---|---|
| Un chiffre publié change rétroactivement (source corrigée, bug pipeline) | `data` | ✅ obligatoire |
| Une règle d'enrichissement, dédup, classification ou agrégation évolue | `methodology` | ✅ obligatoire |
| Un cadrage éditorial, libellé, ou présentation est modifié | `editorial` | ✅ obligatoire si visible côté user |
| Refactor technique invisible côté user (renommage variable, optim) | — | ❌ commit message suffit |
| Nouveau dataset ajouté | — | ❌ pas une correction, c'est une extension |

## Format JSON

```json
{
  "id": "YYYY-MM-DD-scope-slug",
  "date": "YYYY-MM-DD",
  "category": "data" | "methodology" | "editorial",
  "scope": "subventions" | "marches" | "budget" | "daily-bread" | "global" | …,
  "title": { "fr": "…", "en": "…" },
  "summary": { "fr": "…", "en": "…" },
  "trigger": { "fr": "…", "en": "…" },     // optionnel — origine du signalement
  "before": { "fr": "…", "en": "…" },      // optionnel — état avant
  "after": { "fr": "…", "en": "…" },       // optionnel — état après
  "links": [ { "label": "…", "url": "/…" } ] // optionnel — pages affectées, issue GitHub, source officielle
}
```

## Workflow

1. **Une issue GitHub avec le label `correction`** est créée (par un user via le template `signaler-une-erreur.md`, ou par nous lors d'un audit interne).
2. Si l'investigation confirme une vraie correction à appliquer :
   - Le fix est implémenté dans une PR normale (data, code, ou contenu).
   - **Dans la même PR**, on ajoute une entrée au début du tableau `entries` dans `corrections.json`.
   - On référence l'issue dans `links` (avec son URL GitHub).
3. Au merge, la page `/corrections` se met automatiquement à jour à la prochaine build/deploy Vercel.

## Ce qu'on n'écrit PAS

- **Pas de SLA chiffré** ("réponse sous X jours") tant que le projet est porté par 1 personne — engagement intenable, perte de crédibilité.
- **Pas d'engagement futur inventé** ("audit externe en Q3" si pas planifié).
- **Pas de jargon technique** dans `summary` — la page est destinée au grand public et aux décideurs. Le détail technique va dans l'issue GitHub ou la PR.
- **Pas de "thanks @user"** dans le rendu public — citer @username sans son consentement est une mauvaise pratique. Citer son rôle suffit ("signalement utilisateur direct").

## Lien avec les autres systèmes

- **Source correction rétroactive** ([source-correction-retroactive.md](runbooks/source-correction-retroactive.md)) : process opérationnel pipeline quand la source change. Le runbook décrit le "comment" technique, /corrections décrit le "quoi" public.
- **dbt snapshots** ([snapshots.md](runbooks/snapshots.md)) : permettent de remonter à l'état pré-correction d'une source. Référencer le snapshot pertinent dans les entrées `data` si applicable.
- **CHANGELOG.md** dépôt : changements code (techniques). Pas confondre avec /corrections (chiffres + méthode + éditorial visibles user).

## Exemple d'entrée minimaliste

```json
{
  "id": "2026-07-15-subventions-casvp-2024",
  "date": "2026-07-15",
  "category": "data",
  "scope": "subventions",
  "title": {
    "fr": "Correction du montant CASVP 2024",
    "en": "Correction of CASVP 2024 amount"
  },
  "summary": {
    "fr": "La Ville a republié l'annexe CA 2024 le 10 juillet avec un montant CASVP corrigé : 416,5 M€ (au lieu de 412,1 M€ initialement). Notre snapshot du 2026-04-15 conserve la version pré-correction.",
    "en": "The City re-published the 2024 CA appendix on July 10 with a corrected CASVP amount: €416.5M (instead of €412.1M initially). Our 2026-04-15 snapshot preserves the pre-correction version."
  },
  "links": [
    { "label": "Issue GitHub", "url": "https://github.com/Nuttux/open-public-data/issues/123" },
    { "label": "Source officielle", "url": "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/" }
  ]
}
```
