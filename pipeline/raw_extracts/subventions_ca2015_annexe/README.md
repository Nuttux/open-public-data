# Subventions 2015 : les noms que l'open data a masqués

Le jeu `subventions-versees` de la Ville de Paris (publication « CA 2015 ») remplace par un pseudonyme (« Nom3950 », « Adresse3950 ») le nom de 772 bénéficiaires qui ne sont PAS des particuliers : 133 établissements publics, 61 entreprises, 533 associations, 12 fondations, 4 lignes de l'État. Les autres années, la Ville ne pseudonymise que les personnes physiques.

Fichiers :

- `ods_2015_pseudonymes_hors_particuliers.json` : les 772 lignes telles que publiées par la Ville (668,0 M€ ; Ville 167 lignes / 570,6 M€, Département 605 lignes / 97,4 M€).
- `ville_2015_b17.json` : l'annexe B1.7 « Liste des concours attribués à des tiers » du compte administratif 2015 de la Ville (2016 DFA 79), extraite par `parse_subv_pdf_m14.py`. Acceptée : 977,04 M€ lus pour 977,48 M€ imprimés au TOTAL GENERAL (0,046 %). PDF : https://web.archive.org/web/20161020121757id_/http://labs.paris.fr/commun/pdf/ca2015/ville/7.pdf
- `correspondances_pseudonymes_ville_2015.json` : chaque pseudonyme Ville rapproché d'une ligne de l'annexe par montant exact au centime ET code postal. `prouvé` = une seule ligne correspond (116 pseudonymes, 570,11 M€) ; `ambigu` = plusieurs bénéficiaires ont le même montant dans le même code postal (46) ; `absent` = aucune ligne (5).

Le Département : l'annexe équivalente n'existe dans l'archive qu'en copie tronquée à 1 Mo (captures de 2021), inexploitable. Ses 605 pseudonymes restent non nommés.
