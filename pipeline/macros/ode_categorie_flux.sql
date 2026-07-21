{#
    ode_categorie_flux — catégorie de flux M57 dérivée de la nature comptable.

    Mapping universel M57 (par nature), partagé par les modèles budget France :
    core_budget (Paris CA), core_budget_vote (Paris BP) et
    mart_marseille_budget_sankey_lines (Marseille). Auparavant ce CASE était
    copié-collé à l'identique dans les trois modèles (cf. ADR-0011). Extraire
    ici garantit une seule source de vérité, sans changer la sortie.

    Arg:
      nature_col — référence SQL vers la colonne nature_code
                   (ex. 'b.nature_code' côté core, 'nature_code' côté mart).

    Portée : macro FRANCE (M57). Ne pas partager avec les modèles US
    (vocabulaire fund/character sans équivalent) — cf. ADR-0010.
#}
{% macro ode_categorie_flux(nature_col) %}
        CASE
            -- Personnel
            WHEN {{ nature_col }} LIKE '64%' THEN 'Personnel'

            -- Subventions
            WHEN {{ nature_col }} LIKE '657%' THEN 'Subventions (fonctionnement)'
            WHEN {{ nature_col }} LIKE '204%' THEN 'Subventions (investissement)'

            -- Transferts
            WHEN {{ nature_col }} LIKE '651%' OR {{ nature_col }} LIKE '652%' THEN 'Transferts sociaux'
            WHEN {{ nature_col }} LIKE '655%' OR {{ nature_col }} LIKE '656%' THEN 'Contributions obligatoires'

            -- Achats et services
            WHEN {{ nature_col }} LIKE '60%' THEN 'Achats'
            WHEN {{ nature_col }} LIKE '61%' THEN 'Services extérieurs'
            WHEN {{ nature_col }} LIKE '62%' THEN 'Autres services'

            -- Charges financières et dette
            WHEN {{ nature_col }} LIKE '66%' THEN 'Charges financières'
            WHEN {{ nature_col }} LIKE '16%' THEN 'Remboursement dette'

            -- Dotations
            WHEN {{ nature_col }} LIKE '739%' THEN 'Reversements péréquation'
            WHEN {{ nature_col }} LIKE '748%' THEN 'Dotations arrondissements'

            -- Investissements
            WHEN {{ nature_col }} LIKE '21%' THEN 'Immobilisations corporelles'
            WHEN {{ nature_col }} LIKE '23%' THEN 'Immobilisations en cours'
            WHEN {{ nature_col }} LIKE '20%' AND {{ nature_col }} NOT LIKE '204%' THEN 'Études'

            -- Recettes
            WHEN {{ nature_col }} LIKE '73%' THEN 'Impôts et taxes'
            WHEN {{ nature_col }} LIKE '74%' THEN 'Dotations et participations'
            WHEN {{ nature_col }} LIKE '75%' THEN 'Autres produits gestion'
            WHEN {{ nature_col }} LIKE '70%' THEN 'Produits services'

            ELSE 'Autre'
        END
{% endmacro %}
