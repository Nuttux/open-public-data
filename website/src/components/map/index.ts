/**
 * Export des composants de carte
 */

// Ces composants doivent être importés dynamiquement (next/dynamic avec ssr: false)
// car Leaflet nécessite l'objet window

export { default as ParisMap } from './ParisMap';
export { default as MapFilters } from './MapFilters';
export { default as GeoProgress } from './GeoProgress';
export { default as ChoroplethLayer, ChoroplethLegend } from './ChoroplethLayer';
export type { ChoroplethMetric } from './ChoroplethLayer';
