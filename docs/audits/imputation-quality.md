# Audit qualité de l'imputation proportionnelle

Analyse de la stabilité des ratios `(category, flow_category) → fonction` sur 6 ans (CA exécutés 2019-2024).

**Lecture** : un combo est *fiable* si la part de chaque fonction reste similaire d'une année à l'autre. Si une fonction passe de 5% à 60% selon l'année, la moyenne est trompeuse.

**Métrique** : `overall_stddev` = moyenne des écarts-types des fonctions ≥5%. Plus c'est bas, plus l'imputation est fiable.

## ✅ Combos les plus stables (imputation safe)

| Combo | Years | Fonctions ≥5% (moyenne ± écart-type) |
|---|---:|---|
| RSA → Transferts sociaux | 6 | **RSA allocations** 100% ± 0pt |
| RSA → Services extérieurs | 6 | **Insertion sociale** 100% ± 0pt |
| RSA → Contributions obligatoires | 6 | **Insertion sociale** 100% ± 0pt |
| RSA → Subventions (fonctionnement) | 5 | **Insertion professionnelle** 100% ± 0pt |
| Invest. Administration → Subventions (investissement) | 4 | **Autres instances** 100% ± 0pt |
| Invest. Administration → Études | 6 | **Adm générale collectivité** 100% ± 0pt |
| Invest. Aménagement → Études | 6 | **Opérations d’aménagement** 100% ± 0pt |
| Culture & Sport → Contributions obligatoires | 3 | **Autre équip sport loisirs** 100% ± 0pt |
| Invest. Éducation → Études | 6 | **Classes regroupées** 100% ± 0pt |
| Reversements Fiscaux → Reversements péréquation | 6 | **Opérations non ventilable** 100% ± 0pt |
| Administration → Dotations arrondissements | 6 | **Autres instances** 100% ± 0pt |
| Charges Fiscales → Reversements péréquation | 6 | **Opérations non ventilable** 100% ± 0pt |
| Administration → Achats | 6 | **Adm générale collectivité** 100% ± 0pt |
| Sécurité → Subventions (fonctionnement) | 6 | **Police, sécurité, justice** 100% ± 0pt |
| Invest. Sécurité → Autre | 6 | **Hygiène salubrité publiqu** 100% ± 0pt |
| Sécurité → Achats | 6 | **Services communs** 100% ± 0pt |
| Subventions Équipement → Dotations et participations | 6 | **Opérations non ventilable** 100% ± 0pt |
| Subventions Équipement → Reversements péréquation | 6 | **Opérations non ventilable** 100% ± 0pt |
| Participations → Autre | 3 | **Opérations non ventilable** 100% ± 0pt |
| Action Économique → Autres services | 5 | **Rayonnement et attractivi** 100% ± 0pt |

## ⚠️ Combos les plus volatils (imputation risquée)

Ces combos ont des fonctions dont la part varie fortement d'une année à l'autre. L'imputation proportionnelle est moins fiable et la projection 2026 peut s'écarter de la réalité.

| Combo | Years | Fonctions ≥5% (moyenne ± écart-type, min-max) |
|---|---:|---|
| Invest. Social → Immobilisations en cours | 6 | **Crèches et garderies** 78% ± 18pt (57-100%) · **Personnes handicapées** 22% ± 18pt (0-43%) |
| Culture & Sport → Services extérieurs | 6 | **Piscines** 51% ± 20pt (23-73%) · **Manifestations sportives** 27% ± 24pt (0-67%) · **Théâtre spectable vivant** 22% ± 11pt (6-38%) |
| Éducation → Achats | 6 | **Autre serv annexe enseign** 65% ± 21pt (47-100%) · **Classes de découverte** 35% ± 21pt (0-53%) |
| Éducation → Services extérieurs | 6 | **Apprentissage** 87% ± 21pt (49-100%) · **Classes regroupées** 13% ± 21pt (0-51%) |
| Invest. Environnement → Subventions (investissement) | 6 | **Politique de l'air** 82% ± 22pt (53-100%) · **Politique de l'eau** 18% ± 22pt (0-47%) |
| Invest. Culture → Études | 4 | **Manifestations sportives** 89% ± 23pt (55-100%) · **Patrimoine** 11% ± 23pt (0-45%) |
| Invest. Environnement → Immobilisations corporelles | 6 | **Tri, valo et trait déchet** 31% ± 28pt (0-69%) · **Ser com collecte propreté** 25% ± 28pt (0-75%) · **Collecte des déchets** 18% ± 21pt (0-47%) |
| Invest. Transports → Études | 6 | **Transport ferroviaire** 46% ± 27pt (0-75%) · **Voirie communale** 45% ± 30pt (20-100%) · **Circulations douces** 9% ± 15pt (0-34%) |
| Culture & Sport → Achats | 5 | **Manifestations sportives** 57% ± 25pt (42-100%) · **Colonies de vacances** 43% ± 25pt (0-58%) |
| Environnement → Subventions (fonctionnement) | 6 | **Actions transversales** 77% ± 25pt (49-100%) · **Politique de l'air** 23% ± 25pt (0-51%) |
| Invest. Environnement → Immobilisations en cours | 6 | **Actions transversales** 49% ± 26pt (22-80%) · **Ser com collecte propreté** 39% ± 26pt (8-71%) |
| Invest. Sécurité → Immobilisations en cours | 6 | **Incendie et secours** 73% ± 26pt (32-96%) · **Police, sécurité, justice** 24% ± 27pt (0-66%) |
| Invest. Sécurité → Immobilisations corporelles | 6 | **Police, sécurité, justice** 76% ± 30pt (27-100%) · **Services communs** 24% ± 30pt (0-73%) |
| Invest. Transports → Autre | 6 | **Voirie communale** 88% ± 30pt (27-100%) · **Transport ferroviaire** 12% ± 30pt (0-73%) |
| Invest. Culture → Subventions (investissement) | 5 | **Musées** 68% ± 34pt (21-100%) · **Manifestations sportives** 32% ± 34pt (0-79%) |
| Culture & Sport → Autres services | 6 | **Activité art action manif** 62% ± 49pt (0-100%) · **Activités artistiques,act** 25% ± 42pt (0-100%) · **Piscines** 8% ± 21pt (0-51%) |
| Environnement → Autre | 6 | **Ser com collecte propreté** 84% ± 40pt (3-100%) · **Réseau chaleur et froid** 16% ± 40pt (0-97%) |
| Invest. Environnement → Études | 4 | **Actions transversales** 45% ± 41pt (0-100%) · **Tri, valo et trait déchet** 29% ± 48pt (0-100%) · **Propreté urbaine** 27% ± 31pt (0-57%) |
| Invest. Transports → Immobilisations corporelles | 5 | **Voirie communale** 60% ± 55pt (0-100%) · **Services communs** 20% ± 45pt (0-100%) · **Circulations douces** 20% ± 45pt (0-100%) |
| Invest. Culture → Immobilisations corporelles | 6 | **Bibliothèques médiathèque** 50% ± 55pt (0-100%) · **Bibliothèque, médiathèque** 50% ± 55pt (0-100%) |

## Résumé statistique

- Très stable (écart-type <5 pts) : **56** combos
- Stable (5-10 pts) : **15**
- Modéré (10-15 pts) : **7**
- Volatile (≥15 pts) : **22**
