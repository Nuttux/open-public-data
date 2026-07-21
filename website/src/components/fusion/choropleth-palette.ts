/**
 * Shared 5-step choropleth palette (pale ocre → ink).
 *
 * Single source of truth for the map fill scale, used by the Paris, Marseille
 * and France maps. The maps themselves stay separate components on purpose —
 * they are genuinely different visualisations (Paris: map + ranking sidebar;
 * Marseille: floating tooltip + project markers; France: national scatter) —
 * but they share this exact colour ramp.
 */
export const CHOROPLETH_PALETTE = ["#f0e3c9", "#d8b88a", "#b88856", "#6d4a1c", "#2b1a08"];
