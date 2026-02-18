/**
 * Centralized icon mapping for consistent emoji usage across the dashboard.
 *
 * RULES:
 * - Navigation (navbar, tabs): emojis OK — they serve as visual anchors
 * - Section headers inside pages: NO emojis — use text only
 * - Status indicators: ✓ (ok), ⚠ (warning) only — no ❌, ✅, 💡, etc.
 * - ECharts tooltips: NO emojis — plain text
 * - KPI cards: NO decorative emojis — color is the semantic
 *
 * One emoji per concept, never reused for something else.
 */

// ─── Navigation icons (navbar + page headers) ──────────────────────────────

export const NAV_ICONS = {
  accueil: '🏠',
  synthese: '🎯',
  budget: '📊',
  patrimoine: '🏦',
  subventions: '💰',
  investissements: '🏗️',
  marches: '🤝',
  logements: '🏘️',
  blog: '📝',
} as const;

// ─── Tab icons (TabBar within pages) ────────────────────────────────────────

export const TAB_ICONS = {
  annuel: '📋',
  tendances: '📈',
  prevision: '🎯',
  carte: '🗺️',
  explorer: '🔍',
  bailleurs: '🏢',
} as const;

// ─── Status indicators (minimal set) ────────────────────────────────────────

export const STATUS = {
  ok: '✓',
  warning: '⚠',
} as const;
