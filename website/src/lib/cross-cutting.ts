import fs from "node:fs";
import path from "node:path";

/**
 * Cross-cutting themes (Stage 2C+2D) — agrégats Santé / Éducation /
 * Solidarité qui recoupent plusieurs institutions (Sécu + État + Local).
 *
 * Données : `public/data/national/cross_cutting_themes.json` produit
 * par `pipeline/scripts/enrich/build_cross_cutting_themes.py`. Ce
 * fichier peut être absent (build pas encore lancé) — le loader renvoie
 * alors `null` et l'UI doit fallback gracieusement (section masquée).
 *
 * Server-side only (utilise `node:fs`).
 */

export type CrossCuttingBucket =
  | "secu"
  | "etat"
  | "local_communal"
  | "local_dept"
  | "local_region";

export type CrossCuttingComponent = {
  key: string;
  bucket: CrossCuttingBucket;
  level2: string;
  level3: string | null;
  label_fr: string;
  label_en: string;
  /** Montant annuel en € (institution × scale × shares × fraction). */
  annual_eur: number;
  /** 0..1 — part dans le total du thème. */
  share_of_theme: number;
  /** Fraction éditoriale (frontière santé/social) appliquée. */
  fraction_applied: number;
  /** URL drawer pour drill vers la cellule du panneau institution. */
  drill_url: string;
  source: string;
  source_url: string;
  note: string | null;
};

export type CrossCuttingTheme = {
  key: string;
  label_fr: string;
  label_en: string;
  subtitle_fr: string;
  subtitle_en: string;
  total_annual_eur: number;
  /** 0..1 — part du thème dans la somme S1311+S1313+S1314 (APU non-consolidé). */
  share_of_total_apu: number;
  components: CrossCuttingComponent[];
  caveats_fr: string;
  caveats_en: string;
};

export type CrossCuttingThemes = {
  generated_at?: string;
  source_pipeline?: string;
  audit_promise?: string;
  denominator_total_apu_eur?: number;
  themes: Record<string, CrossCuttingTheme>;
};

const DATA_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "national",
  "cross_cutting_themes.json",
);

let cache: CrossCuttingThemes | null | undefined;

export function loadCrossCuttingThemes(): CrossCuttingThemes | null {
  if (cache !== undefined) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    cache = JSON.parse(raw) as CrossCuttingThemes;
  } catch {
    cache = null;
  }
  return cache;
}

export function getCrossCuttingTheme(key: string): CrossCuttingTheme | null {
  const data = loadCrossCuttingThemes();
  if (!data) return null;
  return data.themes[key] ?? null;
}

export function listCrossCuttingThemes(): CrossCuttingTheme[] {
  const data = loadCrossCuttingThemes();
  if (!data) return [];
  // Stable order — matches build script's ORDERED_THEMES.
  // 3 piliers historiques (santé/éducation/solidarité) puis 3 thèmes
  // trans-institutionnels (sécurité/logement/transports).
  const order = [
    "sante",
    "education",
    "solidarite",
    "securite_globale",
    "logement",
    "transports",
  ];
  return order
    .map((k) => data.themes[k])
    .filter((t): t is CrossCuttingTheme => Boolean(t));
}
