/**
 * Centralized icon mapping — Lucide SVG icons.
 *
 * All icons use `size="1em"` so they scale with the parent's font-size,
 * just like emojis did. They also inherit `currentColor` for stroke.
 *
 * RULES:
 * - Navigation (navbar, tabs): Lucide icons — consistent visual anchors
 * - Thematic category icons: emojis OK (intuitive, high-recognition)
 * - Section headers inside pages: NO decorative icons — text only
 * - ECharts tooltips: NO icons — use colored ● dots for status
 * - KPI cards: NO decorative icons — color is the semantic
 */

import {
  Home,
  LayoutDashboard,
  BarChart3,
  Landmark,
  Coins,
  HardHat,
  Handshake,
  Building2,
  PenLine,
  CalendarDays,
  TrendingUp,
  Target,
  Map,
  Search,
  Building,
  Wallet,
  Activity,
  Newspaper,
  Ruler,
  MapPin,
  MapPinOff,
  ClipboardList,
  Users,
  Tag,
} from 'lucide-react';
import type { ReactNode } from 'react';

// ─── Navigation icons (navbar + page headers) ──────────────────────────────

export const NAV_ICONS: Record<string, ReactNode> = {
  accueil: <Home size="1em" />,
  synthese: <LayoutDashboard size="1em" />,
  budget: <BarChart3 size="1em" />,
  patrimoine: <Landmark size="1em" />,
  subventions: <Coins size="1em" />,
  investissements: <HardHat size="1em" />,
  marches: <Handshake size="1em" />,
  logements: <Building2 size="1em" />,
  blog: <PenLine size="1em" />,
};

// ─── Tab icons (TabBar within pages) ────────────────────────────────────────

export const TAB_ICONS: Record<string, ReactNode> = {
  annuel: <CalendarDays size="1em" />,
  tendances: <TrendingUp size="1em" />,
  prevision: <Target size="1em" />,
  carte: <Map size="1em" />,
  explorer: <Search size="1em" />,
  bailleurs: <Building size="1em" />,
};

// ─── Breakdown / filter toggle icons ────────────────────────────────────────

export const BREAKDOWN_ICONS: Record<string, ReactNode> = {
  thematique: <Target size="1em" />,
  direction: <Landmark size="1em" />,
  type_organisme: <Users size="1em" />,
  chapitre: <ClipboardList size="1em" />,
  nature: <ClipboardList size="1em" />,
  secteur: <ClipboardList size="1em" />,
  arrondissement: <MapPin size="1em" />,
  categorie: <Tag size="1em" />,
  type: <Home size="1em" />,
  bailleur: <Building size="1em" />,
};

// ─── Glossary section icons ─────────────────────────────────────────────────

export const GLOSSARY_ICONS: Record<string, ReactNode> = {
  budget: <Wallet size="1em" />,
  sante: <Activity size="1em" />,
  dette: <Landmark size="1em" />,
  patrimoine: <Building2 size="1em" />,
};

// ─── One-off icons (landing page, section headers, map) ─────────────────────

export const MISC_ICONS = {
  citizens: <Users size="1em" />,
  journalists: <Newspaper size="1em" />,
  institutions: <Building size="1em" />,
  debtStock: <Landmark size="1em" />,
  debtRatios: <Ruler size="1em" />,
  mapPinPrecise: <MapPin size="1em" />,
  mapPinApprox: <MapPinOff size="1em" />,
  layerLogements: <Building2 size="1em" />,
  layerInvestissements: <HardHat size="1em" />,
};

// ─── Status indicators (minimal set, plain text for HTML tooltips) ──────────

export const STATUS = {
  ok: '✓',
  warning: '⚠',
} as const;
