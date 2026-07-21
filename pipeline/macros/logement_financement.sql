{#
  =============================================================================
  Normalisation d'adresses et de bailleurs sociaux.

  Sert à rapprocher deux tables au grain et au vocabulaire différents :
    - core_dette_garantie   : un emprunt garanti ; l'adresse vit dans le texte
                              libre `objet` (« 107, rue Marcadet - 75018 - NSG »)
                              et le bailleur dans `beneficiaire` (« RIVP (SEM) »).
    - core_logements_sociaux: un programme livré ; adresse en champ dédié
                              (« 22 RUE LEPIC ») et bailleur en champ `bailleur`
                              (« RIVP »).

  « Le flou propose, un signal exact dispose » : ces macros produisent la couche
  DÉTERMINISTE (signature d'adresse + clé bailleur) consommée par
  mart_logement_financement. Les emprunts qu'elle ne rattache pas (ZAC/lot,
  « diverses adresses », adresses multiples) restent en `non_rattache` et sont
  confiés au juge LLM (gather_logement_financement_candidates.py + workflow).

  Une seule source de vérité pour la normalisation : ne PAS ré-implémenter ce
  découpage ailleurs — le gather du tail lit directement les lignes non
  rattachées du mart plutôt que de recalculer une signature divergente.
  =============================================================================
#}

{# Majuscules sans accents (NFD + suppression des diacritiques). #}
{% macro lf_deacc(col) -%}
  REGEXP_REPLACE(NORMALIZE(UPPER(IFNULL({{ col }}, '')), NFD), r'\pM', '')
{%- endmacro %}

{# Chaîne d'adresse nettoyée : on retire la queue « - 75018 - NSG » propre à
   l'`objet` des emprunts (code postal + code programme), sinon le code postal
   parasiterait l'extraction du numéro de voirie. #}
{% macro lf_addr_clean(col) -%}
  REGEXP_REPLACE({{ lf_deacc(col) }}, r'\s*[-,]?\s*75\d{3}\b.*$', '')
{%- endmacro %}

{# Premier numéro de voirie. Gère les plages (« 119-121 » → 119) et les libellés
   composés (« 4-4 bis et 6 rue Pierre Ginier » → 4). NULL si aucun numéro
   (ZAC/lot sans adresse) → l'emprunt ne matchera pas en déterministe. #}
{% macro lf_addr_number(col) -%}
  REGEXP_EXTRACT({{ lf_addr_clean(col) }}, r'(\d+)')
{%- endmacro %}

{# Cœur du nom de voie : on retire types de voie, articles, bis/ter, chiffres et
   ponctuation, puis on concatène les lettres restantes. Fait converger
   « 42, rue des Poissonniers » et « 42 RUE DES POISSONNIERS » → « POISSONNIERS ».
   NULL si vide (aucun nom de voie exploitable). #}
{% macro lf_addr_street(col) -%}
  NULLIF(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        {{ lf_addr_clean(col) }},
        r'\b(RUE|AVENUE|AVE|AV|BOULEVARD|BLVD|BD|PLACE|PASSAGE|PSG|IMPASSE|IMP|VILLA|QUAI|COURS|ALLEE|ALLEES|SENTE|SENTIER|CITE|SQUARE|SQ|ROUTE|RTE|PONT|PORTE|GALERIE|PARVIS|PROMENADE|VOIE|HAMEAU|MAIL|ESPLANADE|ROND|POINT|CHEMIN|DE|DES|DU|LA|LE|LES|L|D|ET|AUX|AU|A|BIS|TER|QUATER)\b',
        ' '
      ),
      r'[^A-Z]', ''
    ),
    ''
  )
{%- endmacro %}

{# Clé « famille de bailleur » : réunit les variantes d'un même organisme des
   deux côtés (« RIVP (SEM) » ↔ « RIVP », « Immobilière 3F - I3F (SA HLM) » ↔
   « IMM 3F », « ICF Habitat La Sablière » ↔ « SABLIERE »). Retourne NULL pour un
   bailleur non cartographié : deux NULL ne s'égalent JAMAIS (pas de faux
   rapprochement), l'emprunt bascule alors sur le signal adresse seul. #}
{% macro lf_bailleur_key(col) -%}
  CASE
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'RIVP') THEN 'RIVP'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ELOGIE|SIEMP') THEN 'ELOGIE_SIEMP'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'PARIS HABITAT') THEN 'PARIS_HABITAT'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'AXIMO') THEN 'AXIMO'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'IMMOBILIERE 3F|\bI3F\b|\b3F\b') THEN '3F'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'EFIDIS') THEN 'EFIDIS'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'SABLIERE') THEN 'SABLIERE'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'CDC HABITAT') THEN 'CDC_HABITAT'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'1001') THEN '1001_VIES'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'HABITATION ?CONFORTABLE|HAB\.CONF') THEN 'HAB_CONF'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'BATIGERE') THEN 'BATIGERE'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'\bHSF\b|HABITAT SOCIAL FRANCAIS') THEN 'HSF'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'SEQENS') THEN 'SEQENS'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'TOIT.{0,5}JOIE') THEN 'TOIT_JOIE'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ANTIN') THEN 'ANTIN'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ADOMA') THEN 'ADOMA'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'PROLOG|\bSNL\b') THEN 'SNL_PROLOG'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'RATP') THEN 'RATP_HABITAT'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'HENEO') THEN 'HENEO'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'COALLIA') THEN 'COALLIA'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'FREHA') THEN 'FREHA'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'EMMAUS') THEN 'EMMAUS'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'LOGIREP') THEN 'LOGIREP'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ERILIA') THEN 'ERILIA'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ERIGERE') THEN 'ERIGERE'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'VILOGIA') THEN 'VILOGIA'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'CASVP') THEN 'CASVP'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'CIUP|CITE INTERNATIONALE') THEN 'CIUP'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'HUMANISME') THEN 'HABITAT_HUMANISME'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'RESIDENCES LOG(EMEN)?T? ?FONCT|RES\.L\.F') THEN 'RES_LF'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'ARMEE DU SALUT') THEN 'ARMEE_SALUT'
    WHEN REGEXP_CONTAINS({{ lf_deacc(col) }}, r'UTOP') THEN 'UTOP'
    ELSE NULL
  END
{%- endmacro %}
