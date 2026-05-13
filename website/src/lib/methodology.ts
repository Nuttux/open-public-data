/**
 * Méthodologie — source unique de vérité pour toutes les constantes factuelles.
 *
 * Généré par `pipeline/scripts/export/export_methodology.py` depuis les seeds dbt :
 *   - seed_city_constants
 *   - seed_legal_thresholds
 *   - seed_editorial_params
 *
 * **Ne jamais hardcoder de valeur factuelle ailleurs dans le code.**
 * Si une valeur manque ici, l'ajouter au seed approprié et régénérer le JSON.
 */
import methodology from "@/data/methodology.json";

type MethodologyEntry = {
  value: number | string | number[];
  unit: string;
  source?: string | null;
  source_url?: string | null;
  date_reference: string;
  notes?: string | null;
  rationale?: string | null;
};

export type DebtSnapshotEntry = {
  value_crc_ans: number;
  source_crc: string;
  source_url_crc: string;
  date_reference: string;
  notes?: string;
};

type MethodologyShape = {
  generated_at: string;
  source_pipeline: string;
  audit_promise: string;
  city: Record<string, MethodologyEntry>;
  legal_thresholds: Record<string, MethodologyEntry>;
  editorial_params: Record<string, MethodologyEntry>;
  paris_debt_snapshots?: {
    description: string;
    unit: string;
    by_year: Record<string, DebtSnapshotEntry>;
  };
};

const M = methodology as MethodologyShape;

const num = (e: MethodologyEntry): number => {
  if (typeof e.value !== "number") {
    throw new Error(
      `methodology: expected number, got ${typeof e.value} for value ${JSON.stringify(e.value)}`,
    );
  }
  return e.value;
};

// ─── City ──────────────────────────────────────────────────────────────────
export const PARIS_POPULATION = num(M.city.paris_population);
export const PARIS_SUPERFICIE_KM2 = num(M.city.paris_superficie_km2);
export const PARIS_NB_ARRONDISSEMENTS = num(M.city.paris_nb_arrondissements);

// Multi-city helpers (POC v1 Marseille — preparation for full refactor P2.3
// where seed_city_constants moves to (city_slug, key, value) shape).
// Reads from methodology.json keys like `marseille_population`.
export function cityPopulation(slug: string): number {
  const key = `${slug}_population`;
  const entry = M.city[key];
  return entry ? num(entry) : PARIS_POPULATION; // fallback to Paris
}

export function cityNbArrondissements(slug: string): number {
  const entry = M.city[`${slug}_nb_arrondissements`];
  return entry ? num(entry) : PARIS_NB_ARRONDISSEMENTS;
}

// Detect city from Next.js pathname (/ville/[city]/...). Returns 'paris' for
// root paths (Paris-rich pages live at the root for rétro-compat).
export function citySlugFromPathname(pathname: string | null): string {
  if (!pathname) return "paris";
  const m = pathname.match(/^\/ville\/([^/]+)/);
  return m ? m[1] : "paris";
}

// ─── Legal thresholds ──────────────────────────────────────────────────────
export const CAPACITE_DESENDETTEMENT_ALERTE_ANS = num(
  M.legal_thresholds.capacite_desendettement_alerte_ans,
);
export const CAPACITE_DESENDETTEMENT_CRITIQUE_ANS = num(
  M.legal_thresholds.capacite_desendettement_critique_ans,
);
export const LEVERAGE_RECETTES_MAX = num(M.legal_thresholds.leverage_recettes_max);
export const BORROW_RATIO_MAX = num(M.legal_thresholds.borrow_ratio_max);

// ─── Editorial ────────────────────────────────────────────────────────────
export const TIMELINE_AXIS_START = num(M.editorial_params.timeline_axis_start);
export const TIMELINE_AXIS_END = num(M.editorial_params.timeline_axis_end);

// ─── Paris debt snapshots (CRC) ────────────────────────────────────────────
/**
 * Renvoie le chiffre CRC de capacité de désendettement pour une année donnée
 * (la plus récente disponible ≤ year si exact introuvable). null si aucun.
 */
export function parisCrcDebtYearsFor(year: number): DebtSnapshotEntry | null {
  const snap = M.paris_debt_snapshots?.by_year ?? {};
  if (snap[String(year)]) return snap[String(year)];
  // Fallback : plus récent disponible avant ou égal à l'année demandée
  const years = Object.keys(snap)
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => b - a);
  return years.length > 0 ? snap[String(years[0])] : null;
}

/**
 * Snapshot CRC city-aware. Paris dispose d'une série régulière (rapports CRC
 * Île-de-France 2018 + 2024). Marseille n'a qu'un rapport ponctuel ("Marseille
 * en Grand" 2024) qui n'est pas une série stress-testable → on retourne null
 * et la section "deux lectures" disparaît silencieusement (P3.2 option a).
 *
 * Les futures villes pourront brancher leurs propres séries CRC ici en
 * ajoutant un bloc `<city>_debt_snapshots` dans le seed methodology.
 */
export function crcDebtYearsFor(city: string, year: number): DebtSnapshotEntry | null {
  if (city === "paris") return parisCrcDebtYearsFor(year);
  // Pas de série CRC pour les autres villes en v1.
  return null;
}

// ─── Full methodology object (pour affichage des métadonnées d'audit) ─────
export const METHODOLOGY = M;
