#!/usr/bin/env node
/**
 * Script pour merger les arrondissements 1-4 en "Paris Centre" dans le GeoJSON
 * 
 * Usage: node scripts/merge_paris_centre.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../../../website/public/data/map/arrondissements.geojson');

// Simple polygon union using array concatenation (for MultiPolygon)
function mergePolygons(features) {
  const allCoordinates = [];
  
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      allCoordinates.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      allCoordinates.push(...geom.coordinates);
    }
  }
  
  return {
    type: 'MultiPolygon',
    coordinates: allCoordinates
  };
}

// Main
const geojson = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

const parisCentreFeatures = geojson.features.filter(f => [1, 2, 3, 4].includes(f.properties.c_ar));
const otherFeatures = geojson.features.filter(f => ![1, 2, 3, 4].includes(f.properties.c_ar));

console.log(`Features 1-4: ${parisCentreFeatures.length}, Autres: ${otherFeatures.length}`);

// Merger les géométries
const mergedGeometry = mergePolygons(parisCentreFeatures);

// Nouvelle feature Paris Centre
const parisCentre = {
  type: 'Feature',
  geometry: mergedGeometry,
  properties: {
    n_sq_ar: 750000000,
    c_ar: 0,  // Code Paris Centre
    c_arinsee: 75100,
    l_ar: 'Paris Centre',
    l_aroff: 'Paris Centre (1-2-3-4)',
    n_sq_co: 750001537,
    surface: parisCentreFeatures.reduce((sum, f) => sum + (f.properties.surface || 0), 0),
    perimetre: 0,
    geom_x_y: { lon: 2.347, lat: 48.858 }
  }
};

// Nouveau GeoJSON
const newGeojson = {
  type: 'FeatureCollection',
  features: [parisCentre, ...otherFeatures]
};

// Sauvegarder
fs.writeFileSync(INPUT_PATH, JSON.stringify(newGeojson));

console.log(`✅ GeoJSON mis à jour: ${newGeojson.features.length} features`);
console.log(`   - 1 Paris Centre (fusion 1-4)`);
console.log(`   - ${otherFeatures.length} arrondissements (5-20)`);
