/**
 * EN translations for enumerable data-label values coming from the JSON data
 * (marché categories, subvention thématiques, natures, procédures, CCAG, CPV
 * families). Proper names (associations, fournisseurs, projets, bailleurs)
 * are NOT translated — only descriptive vocabulary.
 *
 * Consumed by `trLabel()` (lib/label-translate.ts) as a normalized-key
 * fallback after its exact-match map: keys here are trimmed, lowercased,
 * inner whitespace collapsed, so they match any casing variant in the data.
 */

export const DATA_LABELS_EN: Record<string, string> = {
  // ── Natures de marché ──────────────────────────────────────────────
  travaux: "Works",
  fournitures: "Supplies",
  fourniture: "Supplies",
  services: "Services",
  marché: "Contract",

  // ── Procédures (DECP) ──────────────────────────────────────────────
  "appel d'offres ouvert": "Open call for tenders",
  "appel d'offres restreint": "Restricted call for tenders",
  "procédure avec négociation": "Negotiated procedure",
  "procédure adaptée": "Adapted procedure",
  "marché passé sans publicité ni mise en concurrence préalable":
    "Contract awarded without prior advertising or competitive bidding",

  // ── CCAG ───────────────────────────────────────────────────────────
  "fournitures courantes et services": "Common supplies and services",
  "prestations intellectuelles": "Intellectual services",
  "techniques de l'information et de la communication":
    "Information and communication technologies",
  "marchés industriels": "Industrial contracts",
  "maitrise d'œuvre": "Project design and supervision",
  "maitrise d'oeuvre": "Project design and supervision",
  "pas de ccag": "No CCAG",

  // ── Thématiques subventions ────────────────────────────────────────
  "social - solidarité": "Social — Solidarity",
  "social - petite enfance": "Social — Early childhood",
  social: "Social",
  culture: "Culture",
  transport: "Transport",
  logement: "Housing",
  éducation: "Education",
  sport: "Sports",
  sécurité: "Security",
  économie: "Economy",
  administration: "Administration",
  santé: "Health",
  international: "International",
  environnement: "Environment",
  autre: "Other",
  "non classifié": "Unclassified",

  // ── Familles CPV (DECP) ────────────────────────────────────────────
  "travaux construction": "Construction works",
  "énergie / combustibles": "Energy / fuels",
  vêtements: "Clothing",
  "architecture / ingénierie": "Architecture / engineering",
  "réparation / maintenance": "Repair / maintenance",
  "culture / loisirs": "Culture / leisure",
  "mobilier / équipement": "Furniture / equipment",
  informatique: "IT",
  "finance / assurance": "Finance / insurance",
  "santé / social": "Health / social",
  "services aux entreprises": "Business services",
  "services agricoles": "Agricultural services",
  "postes / télécoms": "Postal / telecoms",
  "éducation / formation": "Education / training",
  "musique / sport": "Music / sports",
  "machines industrielles": "Industrial machinery",
  "hôtellerie / restauration": "Hospitality / catering",
  télécommunications: "Telecommunications",
  agriculture: "Agriculture",
  "bureau / informatique": "Office / IT",
  "matériaux construction": "Construction materials",
  "environnement / propreté": "Environment / cleaning",
  "services divers": "Miscellaneous services",
  "imprimerie / édition": "Printing / publishing",
  "services auxiliaires transport": "Transport auxiliary services",
  "instruments laboratoire": "Laboratory instruments",
  "matériel médical": "Medical equipment",
  "matières premières": "Raw materials",
  "produits chimiques": "Chemical products",
  immobilier: "Real estate",
  alimentation: "Food",

  // ── Catégories de marchés (categorie_libelle) ──────────────────────
  "travaux d'entretien, préservation équipements publics":
    "Maintenance and preservation works on public facilities",
  "animation culturelle et de loisirs": "Cultural and leisure activities",
  "prestations intellectuelles pour opérations btp,urbanisme":
    "Consultancy for construction and urban planning operations",
  "travaux de construction, rénovation équipements publics":
    "Construction and renovation works on public facilities",
  "travaux dans les équipements sportifs": "Works in sports facilities",
  "maîtrise d'oeuvre btp": "Construction project design and supervision",
  "services d'actions éducatives scolaires et périscolaires":
    "School and after-school educational services",
  "travaux de génie climatique": "HVAC works",
  "formation : métiers": "Training: trades and occupations",
  "travaux sur lieux de culte, oeuvres d'art, monuments classés":
    "Works on places of worship, artworks and listed monuments",
  "maintenance de progiciels": "Software package maintenance",
  "travaux d'aménagement de voirie": "Road development works",
  "etudes à caractère général": "General studies",
  "organisation des services : audit, conseil, contrôle gestion":
    "Organisational services: audit, consulting, management control",
  "services de centres de vacances et de centres de loisirs":
    "Holiday and leisure centre services",
  "amoa btp, urbanisme et espace public":
    "Project-owner support (construction, urban planning, public space)",
  "services annexes pour manifestations et évènements (hors rég":
    "Ancillary services for events and festivities",
  "travaux d'aménagement d'espaces verts": "Green space development works",
  "services de conseils et représentations juridiques":
    "Legal advice and representation services",
  "service de qualification et d'insertion professionnelles":
    "Professional qualification and integration services",
  "impression offset": "Offset printing",
  "travaux de génie civil et ouvrages d'art":
    "Civil engineering and structural works",
  "organisation et promotion des manifestations sportives":
    "Organisation and promotion of sports events",
  "coordination sécurité et protection santé des travailleurs":
    "Worker health and safety coordination",
  "services d'accueil à la petite enfance": "Early childhood care services",
  "entretien des espaces verts": "Green space maintenance",
  "etudes à caractère scientifique et technologique":
    "Scientific and technological studies",
  "nettoyage vitre et locaux": "Window and premises cleaning",
  "instruments, partitions, matériels musicaux (et maintenance)":
    "Musical instruments, scores and equipment (incl. maintenance)",
  livres: "Books",
  "etudes relatives à l'espace public": "Public space studies",
  "services des traiteurs": "Catering services",
  "travaux sur le réseau d'assainissement": "Sewer network works",
  "vêtements de travail": "Work clothing",
  "services culturels : gestion, conservation, restauration":
    "Cultural services: management, conservation, restoration",
  "service des spectacles par des producteurs ou artistes":
    "Performances by producers or artists",
  "nettoiement des espaces publics": "Public space cleaning",
  "services de maintenance multitechnique de bâtiment":
    "Multi-technical building maintenance services",
  "contrôle, vérifications, analyse, essais (hors construction)":
    "Inspection, verification, analysis and testing (excl. construction)",
  "copieurs, massicots, destructeurs et maintenances":
    "Copiers, guillotines, shredders and maintenance",
  "matériels,matériaux de batiments pour ateliers":
    "Building equipment and materials for workshops",
  "diagnostics pour maîtrise d'ouvrage opération btp, urbanisme":
    "Diagnostics for project owners (construction, urban planning)",
  "pièces détachées,accessoires: véhicules,engins de propreté":
    "Spare parts and accessories: vehicles, cleaning machinery",
  "appareils ménagers et maintenance associée":
    "Household appliances and associated maintenance",
  "création ou adaptation graphique": "Graphic design or adaptation",
  "services pour les personnes âgées, handicapés ou en difficul":
    "Services for the elderly, disabled or vulnerable",
  "objets promotionnels": "Promotional items",
  "collecte ordures ménagères et autres déchets":
    "Household and other waste collection",
  "travaux de serrurerie et métallerie espaces publics":
    "Locksmith and metalwork in public spaces",
  "conception d'expositions dans les musées et lieux publics":
    "Exhibition design in museums and public venues",
  "aires et sols de jeux :équipements et maintenance associée":
    "Playgrounds and play surfaces: equipment and maintenance",
  "mobilier urbain": "Street furniture",
  "maintenance des installations techniques debâtiment":
    "Building technical installations maintenance",
  "services audiovisuels": "Audiovisual services",
  "equipements de protection individuelle": "Personal protective equipment",
  "conseil en communication et publicité":
    "Communication and advertising consulting",
  "appareils audiovisuels et maintenance associée":
    "Audiovisual equipment and associated maintenance",
  "contrôle technique btp": "Construction technical inspection",
  "assistance à maîtrise d'ouvrage informatique": "IT project-owner support",
  "formation santé et sécurité au travail":
    "Occupational health and safety training",
  "véhicules automobiles": "Motor vehicles",
  "travaux sur le domaine géré par la dlh":
    "Works on housing department (DLH) property",
  "travaux d'arrosage et fontainerie": "Irrigation and fountain works",
  "fourniture et location de matériels évènementiels":
    "Supply and rental of event equipment",
  "travaux de dépollution": "Decontamination works",
  "conception graphique, maquette pour communication":
    "Graphic design and layout for communications",
  "accessoires pour l'horticulture": "Horticultural accessories",
  "prestations it : transmission, traitement données":
    "IT services: data transmission and processing",
  "mobiliers administratifs": "Office furniture",
  "formation : concours et scolarités":
    "Training: competitive exams and tuition",
  "reprographie et impressions administratives":
    "Reprographics and administrative printing",
  "pièces détachées véhicules automobiles": "Motor vehicle spare parts",
  "réalisation de stands (salons, foires)":
    "Stand construction (trade shows, fairs)",
  "surveillance, protection du patrimoine et des manifestations":
    "Security and protection of property and events",
  "traitement de l'information": "Information processing",
  "prestations portant sur contenu de sites internet, intranet":
    "Website and intranet content services",
  "services d'accueil jeunesse et animation":
    "Youth services and activities",
  "animations sportives de prévention": "Preventive sports activities",
  "matériels sportifs lourds": "Heavy sports equipment",
  "travaux dans les équipements de jeunesse": "Works in youth facilities",
  "machines d'entretien et de production pour espaces verts":
    "Maintenance and production machinery for green spaces",
  "maintenance extincteurs, systèmes protection incendie":
    "Maintenance of extinguishers and fire protection systems",
  "epicerie et boissons": "Groceries and beverages",
  "instruments et appareils de mesure et de contrôle":
    "Measuring and monitoring instruments",
  "prestations de traduction et interprétation":
    "Translation and interpreting services",
  "gestion du stationnement": "Parking management",
  vaccins: "Vaccines",
  "matériels à usage médical": "Medical equipment",
  "fournitures scolaires, périscolaires et enseignt spécialisé":
    "School, after-school and special-education supplies",
  "coordination des systèmes de sécurité incendie":
    "Fire safety systems coordination",
  "service d'aide sociale à l'enfance": "Child welfare services",
  "traitement des nuisibles": "Pest control",
  "matériels pédagogiques": "Teaching materials",
  "plantes à repiquer": "Bedding plants",
  "produits textiles (linges, tissus ameublement, rideaux)":
    "Textile products (linen, upholstery fabrics, curtains)",
  "services de géomètres et de levé de plans":
    "Surveying and plan drafting services",
  "outillage et matériels pour horticulture":
    "Horticultural tools and equipment",
  "mobilier urbain de propreté et consommables":
    "Street-cleaning furniture and consumables",
  "blanchisserie, teinturerie": "Laundry and dry cleaning",
  "organisation séminaires, foires et salons":
    "Organisation of seminars, fairs and trade shows",
  "gaz combustible (distribué)": "Fuel gas (distributed)",
  "maintenance appareils élévateurs; ascenseurs, monte-charges":
    "Maintenance of lifts, elevators and goods hoists",
  "sondages et études de sols": "Soil surveys and studies",
  "electricité (distribué)": "Electricity (distributed)",
  "produits d'entretien usage domestique, articles de droguerie":
    "Household cleaning products and drugstore items",
  "services de reliure et finition": "Binding and finishing services",
  "sondages et enquêtes": "Polls and surveys",
  "entretien d'équipements de sécurité espace public":
    "Maintenance of public-space safety equipment",
  "conception et prestations rédactionnelles pour publications":
    "Editorial design and writing for publications",
  "transports d'enfants": "Children's transport",
  "matériel de levage et de manutention": "Lifting and handling equipment",
  "formations, conférences pour les associations":
    "Training and conferences for associations",
  "acquisition de licences progicielles": "Software package licences",
  "cyclomoteurs, cycles, pièces détachées":
    "Mopeds, bicycles and spare parts",
  "mobilier scolaire": "School furniture",
  "ingénierie informatique et télécom": "IT and telecom engineering",
  "services de régisseur pour événements":
    "Event stage-management services",
  "petits matériels et mobiliers sportifs":
    "Small sports equipment and furniture",
  "machines et équipements pour ateliers":
    "Workshop machinery and equipment",
  "travaux d'éclairage public": "Public lighting works",
  "matériaux pour construction et revêtement de voirie":
    "Road construction and surfacing materials",
  "maintenance des véhicules pl et engins de propreté":
    "Maintenance of heavy vehicles and cleaning machinery",
  "amoe de développement spécifique progiciel":
    "Implementation support for custom software development",
  "matériels et équipements de laboratoire santé":
    "Health laboratory equipment",
  "déménagements et garde-meubles": "Removals and furniture storage",
  "droit d'usage de logiciel en tant que services (saas)":
    "Software-as-a-service (SaaS) usage rights",
  "mobiliers pour la petite enfance": "Early childhood furniture",
  "prestations de soins: examens médicaux et radiologiques":
    "Care services: medical and radiological examinations",
  "manuels et livres scolaires": "Textbooks and school books",
  "abonnements et consommations téléphonie et internet":
    "Telephone and internet subscriptions and usage",
  "bâtiments et équipements provisoires":
    "Temporary buildings and facilities",
  "matériels, équipements et maintenance pour éclairage public":
    "Public lighting equipment and maintenance",
  "contrôle, analyse pour la santé": "Health inspection and analysis",
  "produits alimentaires frais": "Fresh food products",
  "campagnes de communication": "Communication campaigns",
  "location de véhicules pour transport de marchandises":
    "Goods-transport vehicle rental",
  "contrôle technique automobile": "Vehicle roadworthiness testing",
  "formations management": "Management training",
  "maintenance de machines-outils et d'usage spécifique":
    "Maintenance of machine tools and special-purpose machinery",
  "conditionnement pour collections patrimoniales":
    "Packaging for heritage collections",
  "services d'accompagnement (pmi, familles)":
    "Support services (maternal and child care, families)",
  "manutention et entreposage": "Handling and warehousing",
  "bacs, godets et autres contenants d'horticulture":
    "Trays, pots and other horticultural containers",
  "abonnement et achat presse": "Press subscriptions and purchases",
  "consommables et petits matériels à usage dentaire":
    "Dental consumables and small equipment",
  "fournitures nettoiement voies publiques":
    "Public road cleaning supplies",
  "travaux d'office sur logements et immeubles insalubres":
    "Enforced works on substandard housing and buildings",
  "matériels de stockage informatique": "IT storage equipment",
  "fleurs coupées, plantes vertes, fleuries,ornements":
    "Cut flowers, green and flowering plants, ornaments",
  "carrossage de camions et véhicules utilitaires":
    "Bodywork for trucks and utility vehicles",
  "travaux de plantation": "Planting works",
  "hébergement social": "Social accommodation",
  "travaux sur le patrimoine de l'eau": "Works on water infrastructure",
  "acheminement lettres,colis et courrier express":
    "Letter, parcel and express mail delivery",
  "assurances des personnes": "Personal insurance",
  "consommables de laboratoire": "Laboratory consumables",
  carburants: "Fuels",
  "mobilier de bibliothèque": "Library furniture",
  "travaux liés à la commande publique artistique":
    "Works related to public art commissions",
  "maintenance des matériels et machines agricoles":
    "Maintenance of agricultural equipment and machinery",
  "formation : intégration et parcours":
    "Training: onboarding and career paths",
  "prestations de tma": "Third-party application maintenance",
  "maintenance de matériels réseaux it et sécurité":
    "Maintenance of IT network and security equipment",
  "equipements de protection et sécurité (et maintenance)":
    "Protection and safety equipment (incl. maintenance)",
  "semences horticoles": "Horticultural seeds",
  "produits de désinsectisation et dératisation":
    "Insect and rodent control products",
  "formations si et micro-informatique":
    "IT systems and desktop computing training",
  "services de déplacement et transports publics":
    "Travel and public transport services",
  "cd/dvd et autres supports": "CDs/DVDs and other media",
  "camions, châssis véhicules utilitaires":
    "Trucks and utility vehicle chassis",
  "sel et agrégats pour le déneigement":
    "Salt and aggregates for snow clearing",
  "travaux de menuiserie espaces publics":
    "Carpentry works in public spaces",
  "services de banques de données": "Database services",
  arbres: "Trees",
  "autres assurances": "Other insurance",
  "petites fournitures de bureau": "Small office supplies",
  "matériels réseaux it et sécurité": "IT network and security equipment",
  "services d'agences de presse": "Press agency services",
  "maintenance de réseaux espace public":
    "Public space network maintenance",
  "plaques pour rues et signalétiques": "Street plates and signage",
  "mandat de maîtrise d'ouvrage": "Delegated project ownership",
  "matériels de génie climatique": "HVAC equipment",
  "articles et mobiliers électoraux": "Electoral supplies and furniture",
  "assurances automobiles": "Vehicle insurance",
  "travaux sur établissements départementaux et safd de l'ase":
    "Works on child-welfare (ASE) departmental facilities",
  "maintenance des matériels, équipements des canaux":
    "Maintenance of canal equipment",
  "terres végétales et substrats": "Topsoil and substrates",
  "travaux sur les locaux de la deve":
    "Works on green-spaces department (DEVE) premises",
  "postes de travail et périphériques": "Workstations and peripherals",
  "transports par taxis": "Taxi transport",
  "fournitures et matériels d'assainissement":
    "Sewerage supplies and equipment",
  "travaux de signalisation d'espaces publics":
    "Public space signage works",
  "travaux de câblage pour l'informatique et la téléphonie":
    "IT and telephone cabling works",
  "infogérance d'un système d'information":
    "Outsourced IT system management",
  "produits d'hygiène corporelle": "Personal hygiene products",
  "plantes vivaces,et à massifs": "Perennial and bedding plants",
  "exploitation des installations sportives":
    "Sports facility operation",
  papiers: "Paper",
  "structures provisoires, accueil d'été des centres de loisirs":
    "Temporary structures for summer leisure centres",
  "maintenance des instruments et appareils de mesure":
    "Maintenance of measuring instruments",
  "restauration et conception de menus": "Catering and menu design",
  "hébergement informatique": "IT hosting",
  "matériels et équipements pour laboratoires voirie":
    "Equipment for road laboratories",
  gazon: "Turf",
  "traitement des ordures ménagères et autres déchets":
    "Household and other waste treatment",
  "conseil en sécurité": "Security consulting",
  "maintenance des équipements de laboratoire":
    "Laboratory equipment maintenance",
  "maintenance des installations de génie climatique":
    "HVAC installations maintenance",
  "formation : reconversion": "Training: career retraining",
  "nourriture, fournitures et services pour animaux":
    "Animal food, supplies and services",
  "changes complets": "Incontinence briefs",
  "collecte et valorisation des déchets verts":
    "Green waste collection and recovery",
  "curage, élimination des déchets du réseau d'assainissement":
    "Sewer cleaning and waste disposal",
  "equipements pour les canaux": "Canal equipment",
  "prestations de secrétariat et de sténotypie":
    "Secretarial and stenotype services",
  "acquisition licences logicielles réseaux/sécurité":
    "Network/security software licences",
  "travaux de signalisation lumineuse": "Traffic-light works",
  "conduite d'opération et opc":
    "Project management and works coordination",
  routage: "Mailing and dispatch services",
  pneumatiques: "Tyres",
  "dégraffitage et désaffichage": "Graffiti and poster removal",
  "location-entretien d'appareils d'hygiène":
    "Hygiene equipment rental and maintenance",
  "arbustes et rosiers": "Shrubs and rose bushes",
  "assurances construction": "Construction insurance",
  boîtage: "Envelope stuffing and boxing",
  "matériels d'arrosage et pour réseaux d'eau":
    "Irrigation and water network equipment",
  "gaz industriels": "Industrial gases",
  "horodateurs (et pièces détachées)": "Parking meters (and spare parts)",
  "matériaux et équipements pour signalisation espace public":
    "Materials and equipment for public space signage",
  "assurances du patrimoine - contrats dommages aux biens":
    "Property insurance — property damage contracts",
  "jeux pour enfants": "Children's play equipment",
  "agences de voyages et prestations associées":
    "Travel agencies and related services",
  "maintenance des conteneurs om et mobiliers urbains":
    "Maintenance of waste containers and street furniture",
  "tirages photographiques": "Photographic prints",
  préservatifs: "Condoms",
  "chèques service et bons d'achat": "Service vouchers and gift vouchers",
  "médailles et monnaies": "Medals and coins",
  "équipements de télécommunications": "Telecommunications equipment",
  "matériels et accessoires de puériculture":
    "Childcare equipment and accessories",
  "produits de traitement de l'eau": "Water treatment products",
  "fournitures funéraires": "Funeral supplies",
  "maintenance des équipements médicaux divers":
    "Maintenance of miscellaneous medical equipment",
  "recyclage de matériaux et matériels":
    "Materials and equipment recycling",
  "sapins de noël": "Christmas trees",
  "produits agrochimiques pour les espaces verts":
    "Agrochemical products for green spaces",
  "location de salles": "Venue hire",
  "fret terrestre, aérien, maritime": "Land, air and sea freight",
  "affichage et publicité légale": "Legal notices and public posting",
  "analyse et essais matériaux, matériels, produits":
    "Analysis and testing of materials, equipment and products",
  "services bancaires": "Banking services",
  "maintenance des matériels et équipements pour assainissement":
    "Maintenance of sewerage equipment",
  "pains et pâtisseries": "Bread and pastries",
  "achat et gestion d'espaces publicitaires":
    "Advertising space purchase and management",
  "transports aériens": "Air transport",
  "produits de parapharmacie, hygiène corporelle à fin médicale":
    "Parapharmacy and medical hygiene products",
  "maintenance matériels, mobiliers des équipements sportifs":
    "Maintenance of sports facility equipment and furniture",
  "maintenance des matériels de levage et de manutention":
    "Maintenance of lifting and handling equipment",
  "produits industriels pour le nettoiement":
    "Industrial cleaning products",
  "gestion de personnel : conseil en recrutement":
    "HR: recruitment consulting",
  "consommables informatiques": "IT consumables",
  "matériels de stérilisation pour laboratoire et usage médical":
    "Sterilisation equipment for laboratory and medical use",
  "maintenance télécommunications": "Telecommunications maintenance",
  "travaux sur les locaux de la dpe":
    "Works on environment department (DPE) premises",
  "prestation d'intégration et de maintenance du paramétrage":
    "Configuration integration and maintenance services",
  "matériels pour la protection et reliure des documents":
    "Document protection and binding equipment",
  "maintenance des véhicules de transport de personnes":
    "Maintenance of passenger transport vehicles",
  "expertises et intermédiations: immobilier, foncier":
    "Real estate and land appraisal and brokerage",
  "produits de diététique infantile": "Infant dietary products",
  "maintenance des équipements de propreté":
    "Cleaning equipment maintenance",
  "réactifs de laboratoires hors immunologie":
    "Laboratory reagents (excl. immunology)",
  "gaz et fluides à usage médical, de laboratoire":
    "Medical and laboratory gases and fluids",
  "actions de prévention et réduction des déchets":
    "Waste prevention and reduction actions",
  "prestations de services de soins dentaires, orthodontiques":
    "Dental and orthodontic care services",
  "transport spécialisé domaine culturel":
    "Specialised transport for cultural works",
  "matériels de transport naval (et pièces détachées)":
    "Marine transport equipment (and spare parts)",
  "produits alimentaires surgelés": "Frozen food products",
  "terminaux spécifiques informatiques (badgeuses, bornes ...)":
    "Special-purpose IT terminals (badge readers, kiosks…)",
  "fourniture et maintenance de matériel hivernal":
    "Supply and maintenance of winter equipment",
  "assistance pour recherche de partenariat, mécénat":
    "Support for partnership and sponsorship development",
  "travaux sur les espaces natures des centres de loisirs d'été":
    "Works on natural areas of summer leisure centres",
  "vaisselle et ustensiles de cuisine": "Tableware and kitchen utensils",
  "préparations, produits pour photographie/cinéma patrimonial":
    "Preparations and products for heritage photography and film",
  "consommables de radiologie et imagerie médicale":
    "Radiology and medical imaging consumables",
  "maintenance & vérification des équipements, aires et sols de":
    "Maintenance and inspection of playground equipment and surfaces",
  "maintenance des cycles et cyclomoteurs":
    "Bicycle and moped maintenance",
  serveurs: "Servers",
  "maintenance des serveurs": "Server maintenance",
  "maintenance des horodateurs": "Parking meter maintenance",
  "cartons, emballages": "Cardboard and packaging",
  "nettoyage de matériel informatique": "IT equipment cleaning",
  "ravalement des équipements publics parisiens":
    "Facade restoration of Paris public buildings",
  "services juridiques : commiss.-priseurs, commiss.-enquêteurs":
    "Legal services: auctioneers, public-inquiry commissioners",
  "matériels à usage dentaire": "Dental equipment",
  "maintenance de matériels de stockage informatique":
    "IT storage equipment maintenance",
  "bulbes de fleurs": "Flower bulbs",
  "travaux d'entretien des logements de fonction":
    "Maintenance works on staff housing",
  "consommables à usage médical": "Medical consumables",
  "compositions florales": "Floral arrangements",
  "travaux sur les plaques commémoratives":
    "Works on commemorative plaques",
  "acquisition licences logicielles télécoms":
    "Telecom software licences",
  "analyse alimentaires": "Food analysis",
  "services d'établissements d'actes authentiques":
    "Notarial deed services",
  "nettoyage et lavage extérieur de véhicules":
    "Vehicle exterior cleaning and washing",
  "droits d'usage de logiciel": "Software usage rights",
  médicaments: "Medicines",
  "analyses et essais pour attestation de conformité":
    "Analysis and testing for compliance certification",
  "maintenance des produits de la construction navale":
    "Maintenance of shipbuilding products",
  "equipements spécifiques pour agents handicapés":
    "Special equipment for disabled staff",
  "acquisition de licences logicielles bureautiques":
    "Office software licences",
  "maintenance des appareils d'imagerie médicale pulmonaire":
    "Maintenance of pulmonary medical imaging equipment",
  "maintenance de la signalisation sur espace public":
    "Public space signage maintenance",
  "terminaux de télécommunications": "Telecommunications terminals",
  "graisses, lubrifiants": "Greases and lubricants",
  "equipements mécaniques pour la voirie": "Mechanical road equipment",
  chaussures: "Footwear",
  "location de véhicules pour transport de personnes":
    "Passenger vehicle rental",
  "engrais, fumier pour les espaces verts":
    "Fertiliser and manure for green spaces",
  "acquisition licences logicielles os et base de données":
    "OS and database software licences",
  "transports routiers et urbains de marchandises":
    "Road and urban goods transport",
  "régulation des animaux dans les canaux":
    "Animal control in the canals",
  "transport ferroviaire de personnes": "Rail passenger transport",
  "maintenance de la signalisation routière lumineuse":
    "Traffic-light maintenance",
  "nettoyage des vitres": "Window cleaning",
  "impression numérique": "Digital printing",
  "fioul domestique": "Heating oil",
  "maintenance des postes de travail": "Workstation maintenance",
  "maintenance d'autres matériels d'imagerie médicale":
    "Maintenance of other medical imaging equipment",
  "accessoires, articles divers pour l'habillement":
    "Clothing accessories and miscellaneous items",
  "maintenance, réparation d'instruments de musique":
    "Musical instrument maintenance and repair",
  "conteneurs, caravanes, remorques, pièces détachées":
    "Containers, caravans, trailers and spare parts",
  "assistance et conseil en fiscalité et expertise comptable":
    "Tax and accounting advisory services",
  "intermédiation et conseil dans le domaine financier":
    "Financial brokerage and advisory services",
  "services d'économistes de la construction":
    "Construction cost consulting services",
  "mobilier à usage médical et de laboratoire":
    "Medical and laboratory furniture",
  "conteneurs roulants à ordures ménagères":
    "Wheeled household waste containers",
  "matériels, équipements de signalisation lumineuse":
    "Traffic-light equipment",
  "maintenance machines pour lycées municipaux":
    "Machine maintenance for municipal high schools",
  "peintures et vernis pour le bâtiment": "Building paints and varnishes",
  "matériaux de métallerie pour ateliers":
    "Metalwork materials for workshops",
  "chariots de propreté et balayage": "Cleaning and sweeping trolleys",
  "peintures, vernis, adjuvants pour véhicules":
    "Vehicle paints, varnishes and additives",
  "repas aux restaurants": "Restaurant meals",
  "epicerie petite enfance": "Early childhood groceries",
  "recherches documentaires": "Documentary research",
  "autre matériel": "Other equipment",
  "services de gestion d'archives publiques":
    "Public archive management services",
  "produits bactéricides, virucides, désinfectants pour locaux":
    "Bactericides, virucides and disinfectants for premises",
  "matériels nautiques à usage sportif et récréatif":
    "Nautical equipment for sport and recreation",
  "matériels de protection pour l'assainissement":
    "Protective equipment for sewer work",
  "maintenance du mobilier urbain": "Street furniture maintenance",
  "matériels d'imagerie médicale": "Medical imaging equipment",
  "outillages appareils électroportatifs, consommables atelie":
    "Power tools and workshop consumables",
  "véhicules et engins de propreté": "Cleaning vehicles and machinery",
  reprise: "Buy-back",
  "conseil en assurance": "Insurance consulting",
};

export function normalizeDataKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}
