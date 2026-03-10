/**
 * Métadonnées des 20 plus grandes villes de France
 * Utilisé pour le routing, les couleurs de benchmarking, et les labels.
 */

export interface CityMeta {
  slug: string;
  name: string;
  code_insee: string;
  population: number;
  color: string;      // Couleur principale pour les charts
  colorLight: string;  // Couleur claire pour les backgrounds
}

export const CITIES: CityMeta[] = [
  { slug: 'paris', name: 'Paris', code_insee: '75056', population: 2_133_111, color: '#3b82f6', colorLight: '#3b82f620' },
  { slug: 'marseille', name: 'Marseille', code_insee: '13055', population: 873_076, color: '#f97316', colorLight: '#f9731620' },
  { slug: 'lyon', name: 'Lyon', code_insee: '69123', population: 522_250, color: '#a855f7', colorLight: '#a855f720' },
  { slug: 'toulouse', name: 'Toulouse', code_insee: '31555', population: 504_078, color: '#ec4899', colorLight: '#ec489920' },
  { slug: 'nice', name: 'Nice', code_insee: '06088', population: 342_669, color: '#14b8a6', colorLight: '#14b8a620' },
  { slug: 'nantes', name: 'Nantes', code_insee: '44109', population: 320_732, color: '#22c55e', colorLight: '#22c55e20' },
  { slug: 'montpellier', name: 'Montpellier', code_insee: '34172', population: 299_096, color: '#eab308', colorLight: '#eab30820' },
  { slug: 'strasbourg', name: 'Strasbourg', code_insee: '67482', population: 287_228, color: '#06b6d4', colorLight: '#06b6d420' },
  { slug: 'bordeaux', name: 'Bordeaux', code_insee: '33063', population: 260_958, color: '#ef4444', colorLight: '#ef444420' },
  { slug: 'lille', name: 'Lille', code_insee: '59350', population: 236_234, color: '#8b5cf6', colorLight: '#8b5cf620' },
  { slug: 'rennes', name: 'Rennes', code_insee: '35238', population: 222_485, color: '#10b981', colorLight: '#10b98120' },
  { slug: 'reims', name: 'Reims', code_insee: '51454', population: 182_460, color: '#f59e0b', colorLight: '#f59e0b20' },
  { slug: 'saint-etienne', name: 'Saint-Étienne', code_insee: '42218', population: 174_082, color: '#84cc16', colorLight: '#84cc1620' },
  { slug: 'toulon', name: 'Toulon', code_insee: '83137', population: 171_953, color: '#0ea5e9', colorLight: '#0ea5e920' },
  { slug: 'le-havre', name: 'Le Havre', code_insee: '76351', population: 170_352, color: '#64748b', colorLight: '#64748b20' },
  { slug: 'grenoble', name: 'Grenoble', code_insee: '38185', population: 158_198, color: '#e11d48', colorLight: '#e11d4820' },
  { slug: 'dijon', name: 'Dijon', code_insee: '21231', population: 158_002, color: '#7c3aed', colorLight: '#7c3aed20' },
  { slug: 'angers', name: 'Angers', code_insee: '49007', population: 155_850, color: '#059669', colorLight: '#05966920' },
  { slug: 'nimes', name: 'Nîmes', code_insee: '30189', population: 148_236, color: '#d97706', colorLight: '#d9770620' },
  { slug: 'villeurbanne', name: 'Villeurbanne', code_insee: '69266', population: 154_781, color: '#db2777', colorLight: '#db277720' },
];

export const CITY_SLUGS = CITIES.map(c => c.slug);

export function getCityBySlug(slug: string): CityMeta | undefined {
  return CITIES.find(c => c.slug === slug);
}

export function getCityColor(slug: string): string {
  return getCityBySlug(slug)?.color ?? '#64748b';
}
