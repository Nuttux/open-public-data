# National-level data — France Open Data

Target shape for each dataset (skeleton only — populated by `scripts/fetch_national_data.py`).

## Files expected

| File | Contains | Source |
|---|---|---|
| `etat_budget_{year}.json` | Budget État LFI — mission/programme/action | data.gouv.fr, budget.gouv.fr |
| `etat_budget_index.json` | List of available years | computed |
| `dette.json` | Séries trimestrielles APU/APUC/APUL/ASSO | INSEE BDM |
| `apu_consolide_{year}.json` | Treemap consolidé ~1500 Md€ par sous-secteur × COFOG | INSEE + Eurostat |
| `eurostat_cofog_{year}.json` | FR vs DE/IT/ES/NL/EU27 par fonction COFOG | Eurostat gov_10a_exp |
| `fiscalite_recettes.json` | Recettes fiscales État par impôt, séries longues | DGFiP impots.gouv |
| `daily_bread_coeffs.json` | Coefficients de ventilation par poste | dérivé APU |

## Règles de neutralité appliquées

- Tous les montants en euros nominaux ; `index_cpi.json` fournit les déflateurs INSEE pour conversion en euros constants côté client.
- Chaque fichier porte un champ `perimeter` ∈ `{État, APUC, APUL, ASSO, APU}` pour éviter les confusions.
- Aucune séparation par gouvernement en titre, aucun comparateur hors finances publiques.
