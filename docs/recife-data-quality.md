# Recife — Data Quality Audit

> Audit : 2026-07-25. Portée : les 20 tables `raw.br_recife_*` chargées depuis
> le portail CKAN de la Prefeitura do Recife.
>
> Chaque chiffre ci-dessous a été vérifié en requête live sur BigQuery. Les
> défauts sont classés selon leur origine : **source** (le portail publie une
> donnée fausse ou ambiguë) ou **pipeline** (notre code interprète mal une
> donnée correcte).

## Résumé

| # | Défaut | Origine | Impact publié | Statut |
|---|--------|---------|---------------|--------|
| 1 | Licitações comptées par lot | **Pipeline** | R$ 103,9 bi au lieu de R$ 18,4 bi (5,6×) | ✅ Corrigé |
| 2 | Contrat ARIES à R$ 15,3 bi | **Source** | Inexigibilidade #1 à R$ 15,6 bi au lieu de #4 à R$ 320 M | ✅ Corrigé |
| 3 | 53 contrats sur un même `contrato_id` | Source + **pipeline** | 52 fiches inatteignables | ✅ Corrigé |
| 4 | Valeurs de contrat absentes depuis 2022 | **Source** | Graphique par année trompeur | ✅ Signalé en UI |
| 5 | `is_ativo` incluait CANCELADO/ENCERRADO | **Pipeline** | 9 contrats comptés à tort comme actifs | ✅ Corrigé |
| 6 | Coordonnées cultura / esporte / educacao cassées | **Source** | Aucun — déjà neutralisé en staging | ✅ Déjà traité |
| 7 | 58 % des termos aditivos sans valeur | **Source** | Avenants non chiffrables | ⚠️ Documenté |

---

## 1. Licitações — double comptage par lot (pipeline)

`raw.br_recife_licitacoes_concluidas` est publiée au grain
**(processo × lote × fornecedor)** : 21 981 lignes. Mais la colonne
`valor_totalhomologadolicitacao` porte le total du **processo entier**, répété
à l'identique sur chacune de ses lignes.

Vérification : en partitionnant par `(comissao_licitacao, ano_processolicitatorio,
num_processolicitatorio)` → **4 891 processos**, et **zéro** ne porte plus d'une
valeur distincte pour cette colonne (idem pour `valor_total_estimado`,
`modalidadeprocessolicitatorio`, `orgao_licitante`, `objeto` : tous constants
dans le processo).

> ⚠️ Piège : `num_processolicitatorio` seul n'est PAS unique (les numéros
> repartent à 1 par commission). Il faut la clé à 3 colonnes.

| | Avant | Après |
|---|---|---|
| `n_concluidas` | 21 981 (lignes-lots) | 4 891 (processos) |
| `homologado_total` | R$ 103 940 964 206,41 | R$ 18 421 611 128,54 |

Le total publié valait **11× le budget annuel de la ville**. Le classement par
modalidade s'inversait aussi : PREGÃO PRESENCIAL affiché à R$ 31,5 bi (#2), réel
R$ 979 M (#3).

**Correctif** : `stg_br_recife_licitacoes` agrège au processo ; les colonnes
processo sont prises en MAX (constantes), `valor_licitacao_lote` est SUMmé dans
`valor_lotes`, et `n_lotes` / `n_fornecedores` conservent le détail. Contrôle de
non-perte : `SUM(n_lotes) = 21 981` = le nombre de lignes d'origine.

## 2. Contrat ARIES — R$ 15,3 bi (source)

Contrat `3101.1007/2023`, AGENCIA RECIFE PARA INOVACAO E ESTRATEGIA (ARIES),
CNPJ 29036430000145, objet « PESQUISA CIENTÍFICA, SOCIAL E URBANÍSTICA… ».

La valeur brute du portail est littéralement `"15295275720.0"` — ce n'est donc
pas une erreur de parsing de notre part. Mais elle n'est pas crédible :

- elle dépasse **le budget annuel entier** de Recife (~R$ 9,2 bi empenhado) ;
- elle représente **98,6 %** du portefeuille de contrats actifs (R$ 15,5 bi) ;
- les paiements réellement enregistrés à ce CNPJ dans `despesa_credor` sont de
  **R$ 2,77 M (2024)** et **R$ 3,54 M (2025)** — trois ordres de grandeur en dessous ;
- le 1er terme aditif précise explicitement « NAO IMPLICA EM ACRESCIMO DE
  RECURSOS FINANCEIROS » ;
- aucune trace publique d'un contrat municipal de ce montant (recherche presse :
  rien ; ARIES est une petite agence d'innovation urbaine à but non lucratif).

> Note : R$ 15 295 275 720,00 ÷ 1000 = R$ 15 295 275,72, cohérent avec ~4 ans de
> la dépense réelle. Un décalage de trois zéros est l'hypothèse la plus simple,
> mais **nous ne republions pas une valeur corrigée** — seulement le constat.

**Correctif** : `mart_br_recife_contratos.valor_implausivel` est vrai quand la
valeur dépasse le plus gros exercice annuel connu (`MAX(SUM(empenhado))` par an
sur `stg_br_recife_funcional` = R$ 9 173 604 546,60). Le seuil est **dérivé des
données**, pas codé en dur, donc il vaut aussi pour d'autres années/villes. Un
seul contrat est aujourd'hui flaggé.

Le contrat **reste listé et consultable** ; seule la valeur est retirée — de
l'affichage et de tous les totaux — avec l'explication affichée en clair.

Effet sur le classement des modalidades :

| Modalidade | Avant | Après |
|---|---|---|
| LICITAÇÃO | R$ 7,01 bi (#2) | **R$ 7,01 bi (#1)** |
| SARP | R$ 2,12 bi (#3) | R$ 2,12 bi (#2) |
| DISPENSA | R$ 694 M (#4) | R$ 694 M (#3) |
| **INEXIGIBILIDADE** | **R$ 15,62 bi (#1)** | **R$ 320 M (#4)** |

C'est un renversement éditorial majeur : la page laissait entendre que le gré à
gré dominait la commande publique de Recife, alors qu'il en est la plus petite
part.

`valor_ativo_total` passe de R$ 15,51 bi à **R$ 213,6 M**.

## 3. Collision de `contrato_id` (source + pipeline)

La source publie 53 contrats portant le libellé littéral
« Aguardando Numeração » (2 variantes de casse) en guise de numéro, plus
quelques vrais numéros répétés (ex. `3901.4002/2024`). **Origine mixte** : le
portail publie une clé non unique (source), mais notre `contrato_id` supposait
son unicité (pipeline) — les 53 s'écrasaient sur `aguardando-numera-o`, donc une
seule fiche était atteignable.

Mesure : 7 912 lignes → **7 859** ids avant, **7 912** après correctif.

**Correctif** : slug lisible conservé quand il est unique ; sinon suffixe de
hash SHA-256 court et déterministe des colonnes identifiantes. En parallèle,
`numero_contrato_publicavel` est NULL pour les placeholders, pour que l'UI
affiche « sem número » plutôt que « Aguardando Numeração ».

## 4. Valeurs de contrat absentes depuis 2022 (source)

Recife a **cessé de publier le montant des contrats** :

| Année | Contrats | Sans valeur | % |
|---|---|---|---|
| 2025 | 769 | 769 | **100 %** |
| 2024 | 941 | 939 | **99,8 %** |
| 2023 | 1 096 | 1 081 | **98,6 %** |
| 2022 | 710 | 699 | **98,5 %** |
| 2021 | 449 | 249 | 55,5 % |
| 2020 | 361 | 25 | 6,9 % |
| ≤ 2019 | — | — | 0–7 % |

Globalement **3 833 / 7 912 (48 %)** des contrats n'ont aucun montant, et
**2 129 (27 %)** aucune année.

C'est la conséquence la plus insidieuse du défaut #2 : la barre 2023 géante du
graphique « valor contratado por ano » n'existait que parce qu'ARIES était l'un
des ~15 contrats de 2023 à porter une valeur — et c'était la mauvaise. Une fois
ARIES retiré, tracer 2022-2025 dessinerait des barres à ~0, ce qui **se lirait
comme « la ville a cessé de contracter »** alors qu'elle a seulement cessé de
publier.

**Correctif** : `by_year` porte `n_com_valor` ; les années sans aucun montant
sortent du graphique et sont énoncées en toutes lettres (« ausência de dado, não
ausência de contratação »).

## 5. `is_ativo` (pipeline)

Le flag ne regardait que les dates de vigência : 2 contrats ENCERRADO et 1
CANCELADO ressortaient « actifs aujourd'hui ». Ajout de la condition
`situacao NOT IN ('CANCELADO','ENCERRADO')`. `n_ativos` : 401 → 392.

## 6. Coordonnées des lieux (source) — ✅ déjà neutralisé

Les tables brutes sont bel et bien cassées (vérifié contre la bounding box de
Recife, lat −8,2/−7,9 ; lon −35,1/−34,8) :

| Table brute | Problème |
|---|---|
| `places_cultura` | 68/68 **lat et lon inversées** — `latitude` contient −34,89 (une longitude) |
| `places_esporte` | 35/35 **séparateur décimal perdu** — `"-8116820631116893,0"` |
| `places_educacao` | 11/357 sentinelles : `-99.999999`, `-79.048`, `-80.614`, 7 vides |
| `places_pracas`, `places_usf`, `places_ubs` | propres |

**Mais `stg_br_recife_places` traite déjà les trois cas** : le swap cultura est
documenté et résolu par `br_coord()`, le décimal esporte est reconstruit par
échelle du 1er/2e chiffre significatif, et le bornage `br_coord(…, -9, -7)`
rejette les sentinelles. Sortie du modèle vérifiée en live :

| Família | n | sans coord | hors Recife |
|---|---|---|---|
| Cultura | 68 | 0 | **0** |
| Educação | 357 | 11 (sentinelles rejetées) | **0** |
| Esporte | 35 | 0 | **0** |
| Praças | 476 | 0 | **0** |
| Saúde | 153 | 10 | **0** |

Rien à corriger. Noté ici parce que ces défauts sont invisibles en aval et
reviendront si le staging est refactorisé.

## 7. Termos aditivos (source) — documenté

`valor_termoaditivo` est NULL sur **7 767 / 13 390 (58 %)** des avenants. Les
montants des contrats ne peuvent donc pas être ajustés des avenants ; les
valeurs affichées sont celles du contrat initial.

## Contrôles passés sans anomalie

- **Contratos, top 2-20** : plausibles (R$ 730 M → R$ 76 M, assainissement,
  travaux, gestion hospitalière). ARIES est le seul décrochage.
- **Despesa por credor** : plus gros paiement R$ 155 M (Caixa Econômica Federal,
  service de la dette). Aucun montant négatif. Cohérent.
- **Funcional** : réconcilie avec les totaux connus (R$ 8,97 bi payés en 2024).
- **`anulacao_pagamento`** : intégralement nul/zéro sur 2024-2026 — le calcul
  `pago_liquido = pagamento − anulacao_pagamento` est donc sans effet, pas un
  bug de signe. (`anulacao_empenho` est bien négatif mais n'est utilisé nulle
  part.)
- **Vie privée CPF** : 13 496 lignes personnes physiques en 2025 (R$ 98,9 M),
  correctement séparées par `br_doc_tipo` et jamais exposées nominativement.

## Garde-fous ajoutés

`pipeline/models/br/schema.yml` — aucun test n'existait sur ces modèles, ce qui
explique que les deux bugs de grain aient atteint la production :

- `core/mart_br_recife_contratos.contrato_id` : `unique` + `not_null` ;
- `mart_br_recife_licitacoes` : `unique_combination_of_columns` sur
  (status, comissao, processo_numero, processo_ano) — verrouille le grain ;
- `valor_implausivel` : `not_null`.
