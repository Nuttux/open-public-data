/**
 * Métadonnées des 5 plus grandes villes de France
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
];

export const CITY_SLUGS = CITIES.map(c => c.slug);

export function getCityBySlug(slug: string): CityMeta | undefined {
  return CITIES.find(c => c.slug === slug);
}

export function getCityColor(slug: string): string {
  return getCityBySlug(slug)?.color ?? '#64748b';
}
