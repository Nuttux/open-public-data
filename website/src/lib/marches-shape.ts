/**
 * Shared shaping of raw marches_<year>.json rows into the flat contract list
 * used by the search/table UIs on the marchés pages.
 *
 * Pure module — no fs, no Node APIs — so the exact same shaping runs
 * server-side (lib/fusion-data) and client-side (lazy fetch of the public
 * /data/<city>/marches-publics/marches_<year>.json file). Keeping one
 * function guarantees the lazily fetched list is byte-identical to what the
 * server used to serialize into the RSC payload.
 */

export const MULTI_ATTRIBUTAIRE_NAME = "MARCHE MULTIATTRIBUTAIRE";

/** Row schema of the public marches_<year>.json files (data[] / marches[]). */
export type RawMarcheRow = {
  numero_marche?: string;
  objet?: string;
  nature?: string;
  fournisseur_nom?: string;
  fournisseur_siret?: string;
  montant_min?: number;
  montant_max?: number;
  categorie_libelle?: string;
  date_notification?: string;
  decp_offres_recues?: number | null;
  is_multiattributaire?: boolean;
};

export type RawMarchesFile = {
  year?: number;
  data?: RawMarcheRow[];
  marches?: RawMarcheRow[];
};

/** numero → clear-language labels (subset of the vulgarization caches). */
export type MarcheVulgLabels = Record<
  string,
  { objet_clair?: string | null; objet_clair_en?: string | null }
>;

export type ShapedMarche = {
  numeroMarche: string;
  titulaire: string;
  titulaireSiret: string;
  objet: string;
  objetClair: string | null;
  objetClairEn: string | null;
  montant: number;
  categorie: string;
  nature: string;
  date: string;
  multiAttributaire: boolean;
  /** Offres reçues (DECP) — null hors millésimes 2024+. */
  offres: number | null;
};

/** Older vintages use `marches`, current ones `data`. */
export function marchesFileRows(file: RawMarchesFile): RawMarcheRow[] {
  return file.data ?? file.marches ?? [];
}

/**
 * Merge the FR + EN public vulgarization caches
 * (enrichment/vulgarization_marches{,_en}.json) into numero → labels.
 * Either input may be null (e.g. Marseille has no EN file).
 */
export function mergeMarcheVulgLabels(
  fr: { items?: Record<string, { objet_clair?: string }> } | null | undefined,
  en: { items?: Record<string, { objet_clair?: string }> } | null | undefined,
): MarcheVulgLabels {
  const out: MarcheVulgLabels = {};
  for (const [k, v] of Object.entries(fr?.items ?? {})) {
    out[k] = {
      objet_clair: v.objet_clair ?? null,
      objet_clair_en: en?.items?.[k]?.objet_clair ?? null,
    };
  }
  return out;
}

/**
 * Shape raw rows into the flat list (sorted by montant desc) — the exact
 * shaping loadMarchesPageData used to apply before serializing `allMarches`.
 */
export function shapeAllMarches(rows: RawMarcheRow[], vulg: MarcheVulgLabels): ShapedMarche[] {
  return rows
    .map((r) => {
      const numeroMarche = r.numero_marche ?? "";
      return {
        numeroMarche,
        titulaire: r.fournisseur_nom || "Non précisé",
        titulaireSiret: (r.fournisseur_siret ?? "").replace(/\s/g, ""),
        objet: r.objet || "",
        objetClair: (numeroMarche && vulg[numeroMarche]?.objet_clair) || null,
        objetClairEn: (numeroMarche && vulg[numeroMarche]?.objet_clair_en) || null,
        montant: Number(r.montant_max ?? r.montant_min ?? 0),
        categorie: r.categorie_libelle || r.nature || "Autres",
        nature: r.nature || "Autres",
        date: r.date_notification || "",
        multiAttributaire:
          r.fournisseur_nom === MULTI_ATTRIBUTAIRE_NAME || Boolean(r.is_multiattributaire),
        offres: r.decp_offres_recues != null ? Number(r.decp_offres_recues) : null,
      };
    })
    .sort((a, b) => b.montant - a.montant);
}
