# Paris Lieux — v0 execution plan

**Date : 2026-07-17.** Nouvelle entité `lieu` : un objet physique de la ville (piscine,
théâtre, place, équipement) qui agrège tout ce que le site sait déjà — projets
d'investissement géocodés, marchés, subventions — et y ajoute deux couches neuves :
les **délibérations du Conseil de Paris** (Débat-Délibs, 1995→) et le **Bulletin
Municipal Officiel** (Gallica, 1882–1985). Prototype validé sur Berkeley
(explorer IA/archives, 2026-07-16) ; ce plan transpose la mécanique à Paris dans
l'app existante.

## Ce qui est vérifié (spikes 2026-07-17)

| Source | Accès | Preuve |
|---|---|---|
| Débat-Délibs | `Portal.jsp?page=search-solr&query=X` → `id_document` → page doc (PDF joint) | recherche « Philharmonie » OK, ids stables |
| Gallica BMO | SRU `(gallica all "X") and (arkPress all "cb343512457_date")` + `collapsing=disabled` | « piscine des Amiraux » → **741 fascicules**, 1904→ |
| Money layer | `investissements_complet_{2019..2024}.json` | 4 lieux tests trouvés, 100 % géocodés |
| Votes par élu | — | **n'existe pas** (vote à main levée) ; ne jamais le promettre |

## Lieux v0 (validés dans nos données)

| Lieu | Invest. trouvé | BMO | Angle |
|---|---|---|---|
| Piscine des Amiraux (18e) | 0,4 M€ (2023) | 741 fascicules dès 1904 | vedette : 120 ans sur un bâtiment |
| Philharmonie (19e) | 11,0 M€ (2022) | à sonder | équipement culturel majeur |
| Théâtre de la Ville (4e) | 9,7 M€ (2022) | à sonder | rénovation longue |
| Porte Maillot (16/17e) | 15,3 M€ (2022-24) | à sonder | transformation urbaine en cours |

## Architecture (dans l'existant)

- **Pipeline** : `sync_debat_delibs.py` + `sync_gallica_bmo.py` (protocol adapters,
  pattern configs/countries) → `raw.paris_debat_delibs`, `raw.paris_gallica_bmo`
  → stg (typage, dédoublonnage) → `core_lieux` (OBT row-level : lieu × source ×
  document) → `mart_lieu_fiche` → export JSON par lieu. **Aucun bypass du layering.**
  v0 : caches JSONL prêts à charger, schéma BQ défini au moment du premier load.
- **Rapprochement lieu ↔ délib/BMO** : recherche ciblée par nom de lieu (v0, précision
  d'abord), PAS d'extraction d'adresses corpus-wide. Chaque rattachement garde
  `query`, `matched_on`, `source_url` — auditable.
- **Site** : entité `lieu` = fiche + drawer racine `(.)lieu/[slug]` (règle drawer
  root-level). Anatomie ProjetFiche : photo (pipeline photos existant), tags,
  synthèse courte (enrichissement in-session), strip stats (délibs / années /
  investi), sections Financements / Décisions / Archive (BMO). i18n : `fr.ts` + `en.ts`
  dans la même session. Zéro chiffre hardcodé : tout passe par l'export.
- **Entrée UX** : v0 = 4 fiches accessibles depuis les fiches projet existantes +
  URL directe. La carte des lieux et « autour de chez moi » viennent après (v1),
  une fois la fiche validée.

## Phases

- [ ] L0. Sync raw des 4 lieux : délibs (search → ids → métadonnées doc) + BMO
      (fascicules datés). Sortie : `pipeline/cache/lieux/{slug}_delibs.jsonl`,
      `{slug}_bmo.jsonl`. **Critère : chaque ligne porte source_url résolvable.**
- [ ] L1. Lecture/enrichissement in-session : pour chaque délib trouvée — objet,
      montant si présent, date de séance ; pour le BMO — sélection des fascicules
      significatifs (pas les 741). **Critère : chaque fait cité lié à sa page.**
- [ ] L2. Export `lieu_{slug}.json` (contrat : generated_at, source_pipeline,
      sources par bloc) + fiche `LieuFiche` + drawer + i18n. **Critère : capture
      Playwright desktop+mobile relue avant « fait ».**
- [ ] L3. Démo interne : la fiche Amiraux tient-elle le « wow » ? Décision v1
      (carte, plus de lieux, alerte « autour de chez moi ») seulement après.

## Risques nommés

- PDFs Débat-Délibs : qualité variable, montants dans le corps → extraction ciblée
  et citée, pas de claim de complétude.
- BMO : 741 hits = bruit ; le tri éditorial in-session est la vraie valeur.
- Trou 1985–1995 (fin BMO Gallica → début Débat-Délibs) : à dire sur la fiche.
- Rapprochement subventions ↔ délib de vote : à tester avant toute promesse.

## Idées v1 notées (non engagées)

- Liens « construction / bâtiment » sur la fiche lieu (site type « bercail » évoqué
  par Daniel 2026-07-17 — référence exacte à préciser avec lui avant tout usage).

## Résolution d'entité « argent public → lieu » (2026-07-17)

**Problème.** Relier un lieu à ses subventions / projets / marchés par le nom est
fragile dans les deux sens : homonymes (« Philharmonie des Enfants » ≠ Philharmonie),
et surtout **faux négatifs** — l'exploitant a souvent un nom sans rapport avec le
lieu (« Théâtre Musical de Paris » exploite le Châtelet ; le nom seul le rate).
Aucune clé partagée dans les exports : les subventions ont un SIRET (partiel) mais
pas d'adresse, les montants de délibs pas d'adresse exploitable, les id de projets
d'invest ne correspondent pas aux clés de `projet_marches.json`.

**Décision (co-conçue avec Daniel).** *Le flou propose, un signal exact dispose.*
1. **Gather** (`gather_lieu_money_candidates.py`) — candidats par faisceau d'indices
   bon marché : subventions dont le **nom OU l'objet** contient un alias du lieu ;
   projets géolocalisés à < 200 m. Volontairement large.
2. **Juge** (workflow) — un agent classe chaque candidat : subventions →
   exploitant / résident / homonyme / sans-rapport / incertain ; projets →
   au-lieu / voisin / incertain. **Chaque décision cite le signal** (l'objet, le
   nom, la distance). L'IA est le juge, pas la source.
3. **Publier** — seuls exploitant/au-lieu en confiance ≥ moyenne AVEC preuve.
   Le reste (résidents) affiché à part (« aussi financés ici »), l'incertain jeté.

**Validé 2026-07-17.** L'objet a résolu le Châtelet → « Théâtre Musical de Paris »
(106 M€, invisible au nom) et distingué l'Orchestre de Paris (résident) de la Cité
de la musique (exploitant) à la Philharmonie. Piège attrapé : « Théâtre Musical de
Paris » n'appartient qu'au Châtelet, pas au Théâtre de la Ville (alias corrigé).

**Limite assumée.** La proximité géographique contamine au centre (Théâtre de la
Ville et du Châtelet à 100 m) → d'où le jugement par nom de projet, pas par distance
seule. Prochaine étape hors v0 : géocoder les adresses des exploitants (BAN) pour
un signal « adresse » qui compléterait l'objet.
