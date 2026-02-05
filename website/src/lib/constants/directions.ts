/**
 * Dictionnaire des acronymes des directions de la Ville de Paris
 * 
 * Source: https://www.paris.fr/pages/les-directions-de-la-ville-de-paris-2311
 */

export interface DirectionInfo {
  acronyme: string;
  nom: string;
  description: string;
  thematique: ThematiqueSubvention;
}

/**
 * Thématiques pour regrouper les subventions de manière lisible pour les citoyens
 */
export type ThematiqueSubvention = 
  | 'culture'
  | 'sport'
  | 'social'
  | 'education'
  | 'environnement'
  | 'economie'
  | 'logement'
  | 'urbanisme'
  | 'securite'
  | 'administration'
  | 'international'
  | 'autre';

/**
 * Labels lisibles pour les thématiques
 */
export const THEMATIQUE_LABELS: Record<ThematiqueSubvention, { label: string; icon: string; color: string }> = {
  culture: { label: 'Culture & Arts', icon: '🎭', color: '#8b5cf6' },
  sport: { label: 'Sport & Jeunesse', icon: '⚽', color: '#10b981' },
  social: { label: 'Social & Solidarité', icon: '🤝', color: '#f59e0b' },
  education: { label: 'Éducation & Petite enfance', icon: '📚', color: '#3b82f6' },
  environnement: { label: 'Environnement & Espaces verts', icon: '🌳', color: '#22c55e' },
  economie: { label: 'Économie & Emploi', icon: '💼', color: '#6366f1' },
  logement: { label: 'Logement & Habitat', icon: '🏠', color: '#ec4899' },
  urbanisme: { label: 'Urbanisme & Voirie', icon: '🏗️', color: '#64748b' },
  securite: { label: 'Prévention & Sécurité', icon: '🛡️', color: '#ef4444' },
  administration: { label: 'Administration', icon: '🏛️', color: '#94a3b8' },
  international: { label: 'International', icon: '🌍', color: '#0ea5e9' },
  autre: { label: 'Autre', icon: '📋', color: '#71717a' },
};

/**
 * Dictionnaire des directions avec leur signification et thématique
 */
export const DIRECTIONS: Record<string, DirectionInfo> = {
  // Culture
  'DAC': {
    acronyme: 'DAC',
    nom: 'Direction des Affaires Culturelles',
    description: 'Politique culturelle, musées, bibliothèques, conservatoires, théâtres',
    thematique: 'culture',
  },
  
  // Sport & Jeunesse
  'DJS': {
    acronyme: 'DJS',
    nom: 'Direction de la Jeunesse et des Sports',
    description: 'Équipements sportifs, associations sportives, politique jeunesse',
    thematique: 'sport',
  },
  'DJOP': {
    acronyme: 'DJOP',
    nom: 'Délégation aux Jeux Olympiques et Paralympiques',
    description: 'Organisation des JO Paris 2024',
    thematique: 'sport',
  },
  
  // Social
  'DASES': {
    acronyme: 'DASES',
    nom: 'Direction de l\'Action Sociale, de l\'Enfance et de la Santé',
    description: 'Aide sociale, protection de l\'enfance, santé publique',
    thematique: 'social',
  },
  'CASVP': {
    acronyme: 'CASVP',
    nom: 'Centre d\'Action Sociale de la Ville de Paris',
    description: 'Aide aux personnes âgées, handicapées, en difficulté',
    thematique: 'social',
  },
  'DSOL': {
    acronyme: 'DSOL',
    nom: 'Direction de la Solidarité',
    description: 'Lutte contre l\'exclusion, hébergement d\'urgence',
    thematique: 'social',
  },
  
  // Éducation
  'DASCO': {
    acronyme: 'DASCO',
    nom: 'Direction des Affaires Scolaires',
    description: 'Écoles, cantines, périscolaire, centres de loisirs',
    thematique: 'education',
  },
  'DFPE': {
    acronyme: 'DFPE',
    nom: 'Direction des Familles et de la Petite Enfance',
    description: 'Crèches, haltes-garderies, PMI, soutien à la parentalité',
    thematique: 'education',
  },
  
  // Environnement
  'DEVE': {
    acronyme: 'DEVE',
    nom: 'Direction des Espaces Verts et de l\'Environnement',
    description: 'Parcs, jardins, arbres, biodiversité, propreté',
    thematique: 'environnement',
  },
  'DPE': {
    acronyme: 'DPE',
    nom: 'Direction de la Propreté et de l\'Eau',
    description: 'Collecte des déchets, propreté urbaine, eau',
    thematique: 'environnement',
  },
  
  // Économie
  'DAE': {
    acronyme: 'DAE',
    nom: 'Direction de l\'Attractivité et de l\'Emploi',
    description: 'Développement économique, emploi, insertion professionnelle',
    thematique: 'economie',
  },
  'DTEC': {
    acronyme: 'DTEC',
    nom: 'Direction de la Transition Écologique et du Climat',
    description: 'Plan climat, transition énergétique, économie circulaire',
    thematique: 'environnement',
  },
  
  // Logement
  'DLH': {
    acronyme: 'DLH',
    nom: 'Direction du Logement et de l\'Habitat',
    description: 'Logement social, attribution HLM, aide au logement',
    thematique: 'logement',
  },
  'DILT': {
    acronyme: 'DILT',
    nom: 'Direction de l\'Immobilier, de la Logistique et des Transports',
    description: 'Patrimoine immobilier, logistique municipale',
    thematique: 'urbanisme',
  },
  
  // Urbanisme & Voirie
  'DU': {
    acronyme: 'DU',
    nom: 'Direction de l\'Urbanisme',
    description: 'PLU, permis de construire, aménagement urbain',
    thematique: 'urbanisme',
  },
  'DVD': {
    acronyme: 'DVD',
    nom: 'Direction de la Voirie et des Déplacements',
    description: 'Voirie, circulation, stationnement, mobilités douces',
    thematique: 'urbanisme',
  },
  'DUCT': {
    acronyme: 'DUCT',
    nom: 'Direction de l\'Urbanisme, du Cadre de vie et des Territoires',
    description: 'Urbanisme et cadre de vie',
    thematique: 'urbanisme',
  },
  
  // Sécurité & Prévention
  'DPSP': {
    acronyme: 'DPSP',
    nom: 'Direction de la Prévention, de la Sécurité et de la Protection',
    description: 'Police municipale, prévention, médiation',
    thematique: 'securite',
  },
  'DPVI': {
    acronyme: 'DPVI',
    nom: 'Direction de la Prévention et de la Protection',
    description: 'Prévention de la délinquance, protection civile',
    thematique: 'securite',
  },
  
  // Démocratie locale
  'DDCT': {
    acronyme: 'DDCT',
    nom: 'Direction de la Démocratie, des Citoyen·ne·s et des Territoires',
    description: 'Participation citoyenne, budget participatif, mairies d\'arrondissement',
    thematique: 'administration',
  },
  
  // Administration
  'DRH': {
    acronyme: 'DRH',
    nom: 'Direction des Ressources Humaines',
    description: 'Gestion du personnel municipal',
    thematique: 'administration',
  },
  'DFA': {
    acronyme: 'DFA',
    nom: 'Direction des Finances et des Achats',
    description: 'Budget, comptabilité, marchés publics',
    thematique: 'administration',
  },
  'DAJ': {
    acronyme: 'DAJ',
    nom: 'Direction des Affaires Juridiques',
    description: 'Conseil juridique, contentieux',
    thematique: 'administration',
  },
  'DPMP': {
    acronyme: 'DPMP',
    nom: 'Direction du Patrimoine et de l\'Architecture',
    description: 'Patrimoine historique, monuments, architecture',
    thematique: 'culture',
  },
  'DSP': {
    acronyme: 'DSP',
    nom: 'Direction des Systèmes et du Patrimoine',
    description: 'Systèmes d\'information, patrimoine numérique',
    thematique: 'administration',
  },
  'DICOM': {
    acronyme: 'DICOM',
    nom: 'Direction de l\'Information et de la Communication',
    description: 'Communication municipale, presse, digital',
    thematique: 'administration',
  },
  
  // International
  'DGRI': {
    acronyme: 'DGRI',
    nom: 'Direction Générale des Relations Internationales',
    description: 'Coopération internationale, jumelages',
    thematique: 'international',
  },
  'DGOM': {
    acronyme: 'DGOM',
    nom: 'Direction Générale aux Outre-Mer',
    description: 'Relations avec l\'Outre-Mer',
    thematique: 'international',
  },
  
  // Secrétariat Général
  'SG': {
    acronyme: 'SG',
    nom: 'Secrétariat Général',
    description: 'Coordination des services',
    thematique: 'administration',
  },
  'SG-DPMC': {
    acronyme: 'SG-DPMC',
    nom: 'Secrétariat Général - Pilotage Mission Cinéma',
    description: 'Mission cinéma et audiovisuel',
    thematique: 'culture',
  },
  'SG-MI-CINEMA': {
    acronyme: 'SG-MI-CINEMA',
    nom: 'Mission Cinéma',
    description: 'Soutien au cinéma et à l\'audiovisuel',
    thematique: 'culture',
  },
  'SGCP': {
    acronyme: 'SGCP',
    nom: 'Secrétariat Général - Cabinet du Préfet',
    description: 'Cabinet',
    thematique: 'administration',
  },
};

/**
 * Récupère les informations d'une direction par son acronyme
 */
export function getDirectionInfo(acronyme: string): DirectionInfo | null {
  return DIRECTIONS[acronyme] || null;
}

/**
 * Récupère le nom complet d'une direction
 */
export function getDirectionName(acronyme: string): string {
  const info = DIRECTIONS[acronyme];
  return info ? info.nom : acronyme;
}

/**
 * Récupère la thématique d'une direction
 */
export function getDirectionThematique(acronyme: string): ThematiqueSubvention {
  const info = DIRECTIONS[acronyme];
  return info ? info.thematique : 'autre';
}

/**
 * Regroupe les directions par thématique
 */
export function getDirectionsByThematique(): Record<ThematiqueSubvention, DirectionInfo[]> {
  const grouped: Record<ThematiqueSubvention, DirectionInfo[]> = {
    culture: [],
    sport: [],
    social: [],
    education: [],
    environnement: [],
    economie: [],
    logement: [],
    urbanisme: [],
    securite: [],
    administration: [],
    international: [],
    autre: [],
  };
  
  Object.values(DIRECTIONS).forEach(dir => {
    grouped[dir.thematique].push(dir);
  });
  
  return grouped;
}
