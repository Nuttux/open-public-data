"""
Jugements in-session par Claude sur les 260 paires (projet, marché).

Chaque clé = numero_marche. Valeurs : dict {projet_id: score, ...}.
Score 1.0 = objet mentionne explicitement le projet avec la même opération.
Score 0.9 = toponyme fort + nature cohérente + période cohérente.
Score 0.8 = match fort mais avec éléments d'incertitude résiduelle.
Score 0.7 = probable mais pas certain.
Score < 0.6 = exclu.

Seuils d'affichage côté frontend :
  >= 0.85 : "Confirmé"
  0.60 - 0.85 : "Probable"
  < 0.60 : n'apparaît pas dans le seed
"""

JUDGMENTS = {
    # Format: (projet_id, numero_marche): (score, reason)

    # --- Porte de la Chapelle Réaménagement JO 2024 (#1) ---
    # Tokens: ['porte', 'chapelle', '2024']
    ("2024_18_51_021", "20242024S10156"): (0.95, "MOE ARCADIS identique, 2024"),
    ("2024_18_51_021", "20232023T13093"): (0.95, "TERIDEAL voirie Porte Chapelle, gros œuvre voirie 15.9M€"),
    ("2024_18_51_021", "20232023T05049"): (0.95, "FREYSSINET ouvrages d'art Porte Chapelle 3.5M€"),
    ("2024_18_51_021", "20222022S04573"): (0.95, "MOE ARCADIS Porte Chapelle 2022"),
    ("2024_18_51_021", "20222022T03824"): (0.90, "TERIDEAL AGRIGEX espaces verts Porte Chapelle"),
    ("2024_18_51_021", "20222022S00616"): (0.90, "SEGIC OPC Porte Chapelle"),
    ("2024_18_51_021", "20212021S04872"): (0.90, "ARCADIS MSAC MOE Porte Chapelle AVP+EP"),

    # --- Piscine Belliard (#2) ---
    ("2024_18_51_019", "20232023T02731"): (1.00, "BOUYGUES construction piscine 133 bis Belliard, EXACT"),
    ("2024_18_51_019", "20232023T08488"): (0.90, "EIFFAGE Clevia TEP Jesse Owens + école Belliard + future piscine Belliard"),

    # --- Aréna 2 Construction (#3) ---
    ("2023_18_51_023", "20212021T02049"): (0.85, "EHTP rénovation nœud Chapelle local technique Aréna 2"),
    ("2023_18_51_023", "20212021T03017"): (0.90, "CPCU Aréna 2 raccordement réseau chauffage"),
    ("2023_18_51_023", "20202020S06301"): (0.80, "APAVE contrôle/réception Aréna Porte Chapelle"),
    ("2023_18_51_023", "20202020S06355"): (0.80, "Bureau d'études CSPS Aréna Porte Chapelle"),

    # --- Porte de la Chapelle rue Marx Dormoy Rond Point (#4) ---
    # Même projet que #1 géographiquement
    ("2024_18_51_020", "20242024S10156"): (0.85, "ARCADIS MOE Porte Chapelle, même périmètre urbain"),
    ("2024_18_51_020", "20232023T13093"): (0.85, "TERIDEAL voirie Porte Chapelle"),
    ("2024_18_51_020", "20232023T05049"): (0.85, "FREYSSINET Porte Chapelle 18eme"),
    ("2024_18_51_020", "20222022S04573"): (0.85, "ARCADIS MOE 2022"),
    ("2024_18_51_020", "20222022T03824"): (0.80, "TERIDEAL AGRIGEX espaces verts"),
    ("2024_18_51_020", "20222022S00616"): (0.80, "SEGIC OPC"),
    ("2024_18_51_020", "20212021S04872"): (0.80, "ARCADIS MOE 2021"),

    # --- Réaménagement Porte Chapelle JO 2024 (#5) --- même projet que #1
    ("2023_18_51_028", "20232023T13093"): (0.95, "TERIDEAL voirie Porte Chapelle"),
    ("2023_18_51_028", "20232023T05049"): (0.95, "FREYSSINET Porte Chapelle"),
    ("2023_18_51_028", "20222022S04573"): (0.95, "ARCADIS MOE Porte Chapelle"),
    ("2023_18_51_028", "20222022T03824"): (0.90, "TERIDEAL AGRIGEX espaces verts"),
    ("2023_18_51_028", "20242024S10156"): (0.90, "ARCADIS MOE 2024 suite"),
    ("2023_18_51_028", "20222022S00616"): (0.90, "SEGIC OPC"),
    ("2023_18_51_028", "20212021S04872"): (0.90, "ARCADIS MOE 2021"),
    ("2023_18_51_028", "20202020S07043"): (0.90, "LOUIS BERGER AMO coordination tvx Porte Chapelle"),

    # --- Porte Maillot (#6, #7) - aucun match précis ---

    # --- Médiathèque James Baldwin (#8, #9) ---
    ("2024_19_54_014", "20232023S02345"): (1.00, "VIDELIO installation son/vidéo médiathèque J. Baldwin 19e, EXACT"),
    ("2023_19_54_016", "20232023S02345"): (1.00, "VIDELIO installation son/vidéo médiathèque J. Baldwin 19e, EXACT"),

    # --- Église Trinité Massif Entrée 2022 (#10) ---
    ("2022_09_24_010", "20212021T05021"): (1.00, "LOUBIERE serrurerie massif Trinité LOT5, EXACT"),
    ("2022_09_24_010", "20201120005023"): (1.00, "LEFEVRE gros œuvre massif Trinité LOT1, EXACT"),
    ("2022_09_24_010", "20201120005024"): (1.00, "TOLLIS massif Trinité LOT2, EXACT"),
    ("2022_09_24_010", "20201120005025"): (1.00, "LE BRAS FRERES massif Trinité LOT3, EXACT"),
    ("2022_09_24_010", "20191120012345"): (0.95, "BRUNELLE MOE massif Trinité"),
    ("2022_09_24_010", "20191120018452"): (0.90, "QUALICONSULT BCT massif Trinité"),
    ("2022_09_24_010", "20191120019002"): (0.90, "SOLUTECH SPS massif Trinité"),

    # --- Porte de Montreuil (#11) --- aucun match précis

    # --- énergétiques et thermiques (#12) - nom tronqué, aucun match ---

    # --- Piscine 19 rue Pontoise 2022 (#13) ---
    ("2022_05_12_014", "20222022T04850"): (1.00, "LEFEVRE piscine Pontoise rénovation accès et bassin, EXACT"),

    # --- Maison des réfugiés (#14) - aucun candidat ---

    # --- EE A 53 rue Baudricourt cuisine (#15) ---
    ("2022_13_38_015", "20191120028201"): (1.00, "CONPAS construction cuisine 53/61 Baudricourt 75013, EXACT"),
    ("2022_13_38_015", "20191120050103"): (0.95, "OBM CONSTRUCTION cuisine centrale rue Baudricourt, même adresse"),

    # --- EE 75 bd Davout construction 10 salles (#16, #17) ---
    ("2023_20_57_020", "20212021T02389"): (0.75, "BOYER construction école élém 10 classes 99 places, libellé générique mais cohérent projet Davout 10 salles 2023"),
    ("2022_20_62_033", "20212021T02389"): (0.75, "BOYER construction école élém 10 classes 99 places (même projet que #16)"),

    # --- Église Trinité Massif 2024 (#18) --- continuation 2022
    ("2024_09_24_013", "20212021T05021"): (1.00, "LOUBIERE serrurerie massif Trinité LOT5"),

    # --- Église Saint Eustache (#19) - tokenization cassée (eustacherestauration collé), aucun match via tokens ---

    # --- Église Sainte-Anne Butte-aux-Cailles 2024 (#20) ---
    ("2024_13_36_014", "20222022T04900"): (1.00, "LEFEVRE église Ste Anne Butte aux Cailles LOT 1 gros œuvre"),
    ("2024_13_36_014", "20222022T04901"): (1.00, "LOUIS GENESTE église Ste Anne Butte aux Cailles LOT 2 maçonnerie"),

    # --- Parc Python-Duvernois 2023 (#21) ---
    ("2023_20_57_022", "20232023T02001"): (1.00, "ETP TVX génie civil parc Python Duvernois LOT1"),
    ("2023_20_57_022", "20232023T02002"): (1.00, "ESPACE DECO plantations parc Python Duvernois LOT4"),
    ("2023_20_57_022", "20232023T02003"): (1.00, "TERIDEAL bassin végétalisé parc Python Duvernois LOT3"),
    ("2023_20_57_022", "20232023T02004"): (1.00, "Ent. Gén. Clôture serrurerie parc Python Duvernois LOT5"),
    ("2023_20_57_022", "20232023T02005"): (1.00, "TERIDEAL SEGEX arrosage parc Python Duvernois LOT2"),
    ("2023_20_57_022", "20212021S02234"): (0.95, "Études Pluridisciplin BET création parc Python Duvernois"),

    # --- Paul Meurice Porte des Lilas Crèche (#22) - aucun match précis ---

    # --- Église Ste-Anne Butte-aux-Cailles 2023 (#23) --- même projet que #20
    ("2023_13_36_027", "20222022T04900"): (1.00, "LEFEVRE église Ste Anne BAC LOT 1"),
    ("2023_13_36_027", "20222022T04901"): (1.00, "LOUIS GENESTE église Ste Anne BAC LOT 2"),

    # --- Église Sainte-Trinité Massif 2023 (#24) --- même projet que #10
    ("2023_09_24_019", "20212021T05021"): (1.00, "LOUBIERE serrurerie massif Trinité LOT5"),
    ("2023_09_24_019", "20201120005023"): (1.00, "LEFEVRE gros œuvre massif Trinité LOT1"),
    ("2023_09_24_019", "20201120005024"): (1.00, "TOLLIS massif Trinité LOT2"),
    ("2023_09_24_019", "20201120005025"): (1.00, "LE BRAS FRERES massif Trinité LOT3"),

    # --- ZAC Saint Vincent de Paul école (#25) - pas de match clair ---

    # --- Etablissements petite enfance rue Université crèche (#26) ---
    ("2022_07_18_009", "20222022S01500"): (1.00, "Cabinet MT MO restructuration crèche Université 75007, EXACT"),

    # --- Église Sainte-Marie-Madeleine (#27) ---
    ("2022_08_21_015", "20232023S03001"): (1.00, "1090 ARCHITECTES MO restauration façades église Madeleine"),
    ("2022_08_21_015", "20232023S03002"): (1.00, "BE Conseils CSPS façades Madeleine"),
    ("2022_08_21_015", "20232023S03500"): (0.90, "PROCHALOR modernisation génie climatique Madeleine"),
    ("2022_08_21_015", "20212021T04500"): (1.00, "SPMG restauration façade sud Madeleine LOT2"),

    # --- Parc Python Duvernois 2024 (#28) --- même que #21
    ("2024_20_57_015", "20232023T02001"): (1.00, "ETP parc Python Duvernois LOT1"),
    ("2024_20_57_015", "20232023T02002"): (1.00, "ESPACE DECO parc Python Duvernois LOT4"),
    ("2024_20_57_015", "20232023T02003"): (1.00, "TERIDEAL bassin Python Duvernois LOT3"),
    ("2024_20_57_015", "20232023T02004"): (1.00, "Clôture Python Duvernois LOT5"),
    ("2024_20_57_015", "20232023T02005"): (1.00, "TERIDEAL SEGEX arrosage Python Duvernois LOT2"),
    ("2024_20_57_015", "20212021S02234"): (0.95, "Études BET création parc Python Duvernois"),

    # --- EE 53 Baudricourt 2023 (#29) - anciens marchés 2019 hors fenêtre année±3 ---

    # --- Parc André Citroën Grand Canal (#30) ---
    ("2024_15_42_015", "20232023T07900"): (0.95, "TERIDEAL ACBC tvx rénovation fontainerie+serrurerie parc André Citroën"),
}
