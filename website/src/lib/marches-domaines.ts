/**
 * Un axe stable pour lire les contrats d'une année à l'autre : le domaine.
 *
 * Pourquoi (2026-09-15) : la source change de nomenclature. La liste de la
 * Ville (2013-2024) range ses contrats dans 357 catégories fines (« Collecte
 * ordures ménagères et autres déchets ») ; la DECP (2024-2025) ne donne que
 * le CCAG (« Fournitures courantes et services »), un modèle de contrat, et
 * une famille CPV (« Environnement / propreté »). Sur la page, « par
 * catégorie » comparait donc des axes différents selon l'année.
 *
 * Treize domaines Qipu, en mots de tous les jours. Chaque contrat en reçoit
 * un par une table écrite à la main : la famille CPV pour les lignes DECP, la
 * catégorie de la Ville pour les autres (les 160 catégories qui portent 97 %
 * des montants 2013-2024 sont toutes rangées ; le reste passe par des mots-
 * clés, puis « Autres »). Quelques contrats mal rangés par la source sont
 * repris par numéro (le transport PAM 75 était classé « audit, conseil »).
 *
 * Pur : aucun accès disque, utilisable côté client (le filtre de recherche).
 */
export type DomaineSlug =
  | "proprete-dechets"
  | "voirie-espace-public"
  | "eau-assainissement"
  | "batiments"
  | "espaces-verts"
  | "energie"
  | "numerique"
  | "education-enfance"
  | "social-sante"
  | "culture-sport"
  | "transports-vehicules"
  | "etudes-conseil"
  | "fonctionnement"
  | "autres";

export type Domaine = { slug: DomaineSlug; fr: string; en: string };

export const DOMAINES: Domaine[] = [
  { slug: "proprete-dechets", fr: "Propreté et déchets", en: "Cleaning and waste" },
  { slug: "voirie-espace-public", fr: "Voirie et espace public", en: "Streets and public space" },
  { slug: "eau-assainissement", fr: "Eau et assainissement", en: "Water and sewers" },
  { slug: "batiments", fr: "Bâtiments et équipements publics", en: "Buildings and public facilities" },
  { slug: "espaces-verts", fr: "Espaces verts", en: "Parks and green spaces" },
  { slug: "energie", fr: "Énergie et carburants", en: "Energy and fuel" },
  { slug: "numerique", fr: "Numérique et télécoms", en: "Digital and telecoms" },
  { slug: "education-enfance", fr: "Éducation, enfance et jeunesse", en: "Education, childhood and youth" },
  { slug: "social-sante", fr: "Social et santé", en: "Social services and health" },
  { slug: "culture-sport", fr: "Culture, sport et événements", en: "Culture, sport and events" },
  { slug: "transports-vehicules", fr: "Transports et véhicules", en: "Transport and vehicles" },
  { slug: "etudes-conseil", fr: "Études et conseil", en: "Studies and consulting" },
  { slug: "fonctionnement", fr: "Fonctionnement des services", en: "Running the administration" },
  { slug: "autres", fr: "Autres achats", en: "Other purchases" },
];

const BY_SLUG = new Map(DOMAINES.map((d) => [d.slug, d]));

export function domaineLabel(slug: string, locale: string = "fr"): string {
  const d = BY_SLUG.get(slug as DomaineSlug) ?? BY_SLUG.get("autres")!;
  return locale === "en" ? d.en : d.fr;
}

export function isDomaineSlug(s: string): s is DomaineSlug {
  return BY_SLUG.has(s as DomaineSlug);
}

/** Clé de comparaison : minuscules, sans accents, espaces réduits. */
export function normKey(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── Familles CPV de la DECP ───────────────────────────────────────────────
const CPV_FAMILLE: Record<string, DomaineSlug> = {
  "travaux construction": "batiments",
  "environnement / proprete": "proprete-dechets",
  "postes / telecoms": "numerique",
  "informatique": "numerique",
  "telecommunications": "numerique",
  "logiciels": "numerique",
  "bureau / informatique": "numerique",
  "reparation / maintenance": "batiments",
  "architecture / ingenierie": "etudes-conseil",
  "services aux entreprises": "etudes-conseil",
  "recherche & developpement": "etudes-conseil",
  "energie / combustibles": "energie",
  "transport": "transports-vehicules",
  "services auxiliaires transport": "transports-vehicules",
  "materiaux construction": "batiments",
  "equipements chantiers": "batiments",
  "installation": "batiments",
  "immobilier": "batiments",
  "equipements electriques": "batiments",
  "culture / loisirs": "culture-sport",
  "musique / sport": "culture-sport",
  "mobilier / equipement": "fonctionnement",
  "alimentation": "fonctionnement",
  "administration": "fonctionnement",
  "education / formation": "education-enfance",
  "instruments laboratoire": "fonctionnement",
  "services agricoles": "espaces-verts",
  "agriculture": "espaces-verts",
  "services divers": "fonctionnement",
  "hotellerie / restauration": "fonctionnement",
  "finance / assurance": "fonctionnement",
  "vetements": "fonctionnement",
  "securite": "fonctionnement",
  "sante / social": "social-sante",
  "materiel medical": "social-sante",
  "imprimerie / edition": "fonctionnement",
  "produits chimiques": "fonctionnement",
  "machines industrielles": "fonctionnement",
};

// ── Catégories de la liste de la Ville (2013-2024) ────────────────────────
const CATEGORIE: Record<string, DomaineSlug> = {
  // Propreté et déchets
  "collecte ordures menageres et autres dechets": "proprete-dechets",
  "nettoiement des espaces publics": "proprete-dechets",
  "nettoyage vitre et locaux": "proprete-dechets",
  "degraffitage et desaffichage": "proprete-dechets",
  "mobilier urbain de proprete et consommables": "proprete-dechets",
  "pieces detachees,accessoires: vehicules,engins de proprete": "proprete-dechets",
  "collecte et valorisation des dechets verts": "proprete-dechets",
  "maintenance des conteneurs om et mobiliers urbains": "proprete-dechets",
  "traitement des nuisibles": "proprete-dechets",
  "produits d'entretien usage domestique, articles de droguerie": "proprete-dechets",
  // Voirie et espace public
  "travaux d'amenagement de voirie": "voirie-espace-public",
  "travaux de genie civil et ouvrages d'art": "voirie-espace-public",
  "travaux de signalisation d'espaces publics": "voirie-espace-public",
  "travaux de signalisation lumineuse": "voirie-espace-public",
  "travaux d'eclairage public": "voirie-espace-public",
  "maintenance de la signalisation routiere lumineuse": "voirie-espace-public",
  "maintenance de la signalisation sur espace public": "voirie-espace-public",
  "mobilier urbain": "voirie-espace-public",
  "travaux de serrurerie et metallerie espaces publics": "voirie-espace-public",
  "materiaux pour construction et revetement de voirie": "voirie-espace-public",
  "entretien d'equipements de securite espace public": "voirie-espace-public",
  "maintenance de reseaux espace public": "voirie-espace-public",
  "etudes relatives a l'espace public": "voirie-espace-public",
  "gestion du stationnement": "voirie-espace-public",
  "horodateurs (et pieces detachees)": "voirie-espace-public",
  "maintenance des horodateurs": "voirie-espace-public",
  "maintenance des materiels, equipements des canaux": "voirie-espace-public",
  // Eau et assainissement
  "travaux sur le reseau d'assainissement": "eau-assainissement",
  "curage, elimination des dechets du reseau d'assainissement": "eau-assainissement",
  "travaux sur le patrimoine de l'eau": "eau-assainissement",
  "travaux d'arrosage et fontainerie": "eau-assainissement",
  // Bâtiments et équipements publics
  "travaux d'entretien, preservation equipements publics": "batiments",
  "travaux de construction, renovation equipements publics": "batiments",
  "travaux de genie climatique": "batiments",
  "maintenance des installations de genie climatique": "batiments",
  "services de maintenance multitechnique de batiment": "batiments",
  "travaux dans les equipements sportifs": "batiments",
  "travaux sur lieux de culte, oeuvres d'art, monuments classes": "batiments",
  "maintenance appareils elevateurs; ascenseurs, monte-charges": "batiments",
  "maintenance extincteurs, systemes protection incendie": "batiments",
  "maintenance des installations techniques debatiment": "batiments",
  "aires et sols de jeux :equipements et maintenance associee": "batiments",
  "travaux sur le domaine gere par la dlh": "batiments",
  "materiels,materiaux de batiments pour ateliers": "batiments",
  "travaux de depollution": "batiments",
  "batiments et equipements provisoires": "batiments",
  "coordination des systemes de securite incendie": "batiments",
  "travaux d'office sur logements et immeubles insalubres": "batiments",
  "exploitation des installations sportives": "batiments",
  "travaux": "batiments",
  // Espaces verts
  "travaux d'amenagement d'espaces verts": "espaces-verts",
  "entretien des espaces verts": "espaces-verts",
  "travaux de plantation": "espaces-verts",
  "accessoires pour l'horticulture": "espaces-verts",
  "machines d'entretien et de production pour espaces verts": "espaces-verts",
  // Énergie et carburants
  "electricite (distribue)": "energie",
  "gaz combustible (distribue)": "energie",
  "carburants": "energie",
  // Numérique et télécoms
  "maintenance de progiciels": "numerique",
  "postes de travail et peripheriques": "numerique",
  "acquisition de licences logicielles bureautiques": "numerique",
  "acquisition de licences progicielles": "numerique",
  "assistance a maitrise d'ouvrage informatique": "numerique",
  "prestations de tma": "numerique",
  "abonnements et consommations telephonie et internet": "numerique",
  "infogerance d'un systeme d'information": "numerique",
  "ingenierie informatique et telecom": "numerique",
  "materiels reseaux it et securite": "numerique",
  "maintenance de materiels reseaux it et securite": "numerique",
  "maintenance telecommunications": "numerique",
  "prestations it : transmission, traitement donnees": "numerique",
  "amoe de developpement specifique progiciel": "numerique",
  "equipements de telecommunications": "numerique",
  "maintenance de materiels de stockage informatique": "numerique",
  "maintenance des postes de travail": "numerique",
  "serveurs": "numerique",
  "travaux de cablage pour l'informatique et la telephonie": "numerique",
  "techniques de l'information et de la communication": "numerique",
  // Éducation, enfance et jeunesse
  "services d'actions educatives scolaires et periscolaires": "education-enfance",
  "animation culturelle et de loisirs": "education-enfance",
  "services de centres de vacances et de centres de loisirs": "education-enfance",
  "services d'accueil a la petite enfance": "education-enfance",
  "services d'accueil jeunesse et animation": "education-enfance",
  "transports d'enfants": "education-enfance",
  "fournitures scolaires, periscolaires et enseignt specialise": "education-enfance",
  "manuels et livres scolaires": "education-enfance",
  "materiels pedagogiques": "education-enfance",
  "mobilier scolaire": "education-enfance",
  "mobiliers pour la petite enfance": "education-enfance",
  "produits de dietetique infantile": "education-enfance",
  "changes complets": "education-enfance",
  "animations sportives de prevention": "education-enfance",
  // Social et santé
  "services pour les personnes agees, handicapes ou en difficul": "social-sante",
  "service d'aide sociale a l'enfance": "social-sante",
  "services d'accompagnement (pmi, familles)": "social-sante",
  "hebergement social": "social-sante",
  "vaccins": "social-sante",
  "materiels a usage medical": "social-sante",
  "consommables a usage medical": "social-sante",
  "controle, analyse pour la sante": "social-sante",
  "service de qualification et d'insertion professionnelles": "social-sante",
  "cheques service et bons d'achat": "social-sante",
  // Culture, sport et événements
  "services culturels : gestion, conservation, restauration": "culture-sport",
  "livres": "culture-sport",
  "service des spectacles par des producteurs ou artistes": "culture-sport",
  "organisation et promotion des manifestations sportives": "culture-sport",
  "instruments, partitions, materiels musicaux (et maintenance)": "culture-sport",
  "fourniture et location de materiels evenementiels": "culture-sport",
  "services annexes pour manifestations et evenements (hors reg": "culture-sport",
  "materiels sportifs lourds": "culture-sport",
  "petits materiels et mobiliers sportifs": "culture-sport",
  "appareils audiovisuels et maintenance associee": "culture-sport",
  "cd/dvd et autres supports": "culture-sport",
  "mobilier de bibliotheque": "culture-sport",
  // Transports et véhicules
  "vehicules automobiles": "transports-vehicules",
  "pieces detachees vehicules automobiles": "transports-vehicules",
  "camions, chassis vehicules utilitaires": "transports-vehicules",
  "carrossage de camions et vehicules utilitaires": "transports-vehicules",
  "transports aeriens": "transports-vehicules",
  "agences de voyages et prestations associees": "transports-vehicules",
  "services de deplacement et transports publics": "transports-vehicules",
  "assurances automobiles": "transports-vehicules",
  "materiel de levage et de manutention": "transports-vehicules",
  // Études et conseil
  "prestations intellectuelles pour operations btp,urbanisme": "etudes-conseil",
  "maitrise d'oeuvre btp": "etudes-conseil",
  "maitrise d'œuvre": "etudes-conseil",
  "prestations intellectuelles": "etudes-conseil",
  "amoa btp, urbanisme et espace public": "etudes-conseil",
  "diagnostics pour maitrise d'ouvrage operation btp, urbanisme": "etudes-conseil",
  "organisation des services : audit, conseil, controle gestion": "etudes-conseil",
  "services de conseils et representations juridiques": "etudes-conseil",
  "etudes a caractere scientifique et technologique": "etudes-conseil",
  "etudes a caractere general": "etudes-conseil",
  "controle technique btp": "etudes-conseil",
  "coordination securite et protection sante des travailleurs": "etudes-conseil",
  "services de geometres et de leve de plans": "etudes-conseil",
  "sondages et etudes de sols": "etudes-conseil",
  "sondages et enquetes": "etudes-conseil",
  "controle, verifications, analyse, essais (hors construction)": "etudes-conseil",
  "conseil en communication et publicite": "etudes-conseil",
  "conseil en securite": "etudes-conseil",
  // Fonctionnement des services
  "impression offset": "fonctionnement",
  "reprographie et impressions administratives": "fonctionnement",
  "papiers": "fonctionnement",
  "petites fournitures de bureau": "fonctionnement",
  "mobiliers administratifs": "fonctionnement",
  "copieurs, massicots, destructeurs et maintenances": "fonctionnement",
  "formation : metiers": "fonctionnement",
  "formation : concours et scolarites": "fonctionnement",
  "formation sante et securite au travail": "fonctionnement",
  "formation : reconversion": "fonctionnement",
  "acheminement lettres,colis et courrier express": "fonctionnement",
  "demenagements et garde-meubles": "fonctionnement",
  "manutention et entreposage": "fonctionnement",
  "services des traiteurs": "fonctionnement",
  "vetements de travail": "fonctionnement",
  "equipements de protection individuelle": "fonctionnement",
  "produits alimentaires frais": "fonctionnement",
  "epicerie et boissons": "fonctionnement",
  "restauration et conception de menus": "fonctionnement",
  "pains et patisseries": "fonctionnement",
  "appareils menagers et maintenance associee": "fonctionnement",
  "produits textiles (linges, tissus ameublement, rideaux)": "fonctionnement",
  "prestations de traduction et interpretation": "fonctionnement",
  "creation ou adaptation graphique": "fonctionnement",
  "surveillance, protection du patrimoine et des manifestations": "fonctionnement",
  "fournitures courantes et services": "fonctionnement",
  // ── Marseille (POC) : des familles CPV en libellés courts ──
  "travaux de construction": "batiments",
  "services environnement": "proprete-dechets",
  "equipements informatiques": "numerique",
  "services informatiques": "numerique",
  "equipements telecom": "numerique",
  "architecture, ingenierie": "etudes-conseil",
  "conseil, etudes, juridique": "etudes-conseil",
  "agriculture, espaces verts": "espaces-verts",
  "reparation, maintenance": "batiments",
  "construction (materiaux)": "batiments",
  "equipements electriques": "batiments",
  "immobilier": "batiments",
  "mobilier, fournitures": "fonctionnement",
  "alimentation, boissons": "fonctionnement",
  "vetements, chaussures": "fonctionnement",
  "securite, defense": "fonctionnement",
  "services financiers": "fonctionnement",
  "machines industrielles": "fonctionnement",
  "autres services": "fonctionnement",
  "equipements medicaux": "social-sante",
  "sante, social": "social-sante",
  "energie": "energie",
  "auxiliaires transport": "transports-vehicules",
  "vehicules, transports": "transports-vehicules",
  "transports": "transports-vehicules",
  "culture, sport, loisirs": "culture-sport",
  "education, formation": "education-enfance",
};

// ── Mots-clés de secours pour les catégories rares (3 % des montants) ─────
const KEYWORDS: [RegExp, DomaineSlug][] = [
  [/dechet|proprete|nettoi|nettoyage|graffit|environnement/, "proprete-dechets"],
  [/architect|ingenierie/, "etudes-conseil"],
  [/assainiss|egout|fontain|eau\b/, "eau-assainissement"],
  [/voirie|chaussee|trottoir|signalisation|eclairage public|stationnement|mobilier urbain|ouvrages d'art/, "voirie-espace-public"],
  [/espaces? verts?|horticol|plantation|arbre|jardin/, "espaces-verts"],
  [/electricite|gaz\b|carburant|energie|chauffage/, "energie"],
  [/informati|logiciel|progiciel|telecom|telephon|internet|reseau|serveur|numerique/, "numerique"],
  [/scolaire|periscolaire|ecole|enfance|creche|jeunesse|vacances|loisirs|pedagog/, "education-enfance"],
  [/social|sante|medical|handicap|insertion|hebergement|vaccin|personnes agees/, "social-sante"],
  [/culture|spectacle|musee|bibliotheque|livre|sport|evenement|manifestation/, "culture-sport"],
  [/vehicule|camion|transport|voyage|deplacement/, "transports-vehicules"],
  [/etude|conseil|audit|maitrise d'oeuvre|maitrise d'ouvrage|amoa|amoe|diagnostic|controle|expertise|juridique|geometre|sondage/, "etudes-conseil"],
  [/travaux|batiment|construction|renovation|maintenance|entretien|equipement|ascenseur|incendie|serrurerie|peinture|plomberie|couverture|menuiserie/, "batiments"],
  [/formation|impression|reprographie|papier|bureau|mobilier|courrier|demenagement|traiteur|alimentaire|vetement|assurance|gardiennage|surveillance|securite/, "fonctionnement"],
];

/** Contrats que la source range à côté de leur objet : repris par numéro. */
const NUMERO_OVERRIDES: Record<string, DomaineSlug> = {
  "20162370000574": "social-sante", // PAM 75, transport des personnes à mobilité réduite, classé « audit, conseil »
  "20171370090079": "voirie-espace-public", // enlèvement de véhicules vers les fourrières, classé « pains et pâtisseries »
  "20171370090080": "voirie-espace-public",
  "20171370090081": "voirie-espace-public",
  "20171210001782": "batiments", // rénovation du musée Carnavalet, travaux, classée « maîtrise d'œuvre »
};

export type DomaineRow = {
  numero_marche?: string;
  categorie_libelle?: string | null;
  nature?: string | null;
  decp_cpv_famille?: string | null;
  _source_origin?: string;
};

export function domaineOf(r: DomaineRow): DomaineSlug {
  const numero = String(r.numero_marche ?? "");
  const forced = NUMERO_OVERRIDES[numero];
  if (forced) return forced;
  const cat = normKey(r.categorie_libelle ?? "");
  // The City's own category first: finer than the CPV family, and the only
  // axis the 2013-2023 rows carry. In the mixed 2024, list rows keep it too.
  const byCat = CATEGORIE[cat];
  if (byCat && !(cat === "travaux" || cat === "fournitures courantes et services" || cat === "prestations intellectuelles")) return byCat;
  const fam = normKey(r.decp_cpv_famille ?? "");
  if (fam && CPV_FAMILLE[fam]) return CPV_FAMILLE[fam];
  if (byCat) return byCat;
  for (const [re, slug] of KEYWORDS) if (re.test(cat)) return slug;
  return "autres";
}

export function domaineSlugify(slug: DomaineSlug): string {
  return slug;
}
