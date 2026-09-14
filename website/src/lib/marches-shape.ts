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

/** Placeholders the DECP export uses where a company name is missing, or where
 *  one record covers several unnamed awardees. */
const UNNAMED_TITULAIRES = new Set([MULTI_ATTRIBUTAIRE_NAME, "Non précisé", "Non precise"]);

/**
 * Is this titulaire a real, named company — i.e. would a supplier fiche for it
 * mean anything?
 *
 * The money on those rows is real and stays in the totals, so the rows are not
 * dropped; but linking them is a dead end. Category fiches were rendering
 * "Non précisé" and "MARCHE MULTIATTRIBUTAIRE" as blue links to a supplier
 * page describing a placeholder.
 */
export function isNamedTitulaire(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n.length > 0 && !UNNAMED_TITULAIRES.has(n);
}

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

/** The fields the shared-lot rule reads. */
export type LotRow = {
  objet?: string | null;
  montant_max?: number | null;
  montant_min?: number | null;
  fournisseur_nom?: string | null;
  fournisseur_siret?: string | null;
};

/**
 * A lot won by several companies is published once per company, each row
 * carrying the value of the whole lot. Checked 2026-09-14 on the 2020 school
 * sports workshops: the BOAMP award notice (21-59153) values the whole
 * framework agreement at 14.6 M€ and repeats one lot amount (14 456 000 €) on
 * each of five holders' decisions; the Paris list shows that amount over four
 * years (57 824 009,99 €) on each of its 19 holders' rows.
 *
 * Rule: same objet (case and spacing ignored) + same amount (to the cent) +
 * at least two distinct holders = one lot. Its first row counts, the others are
 * flagged as repeats. The same holder twice keeps both rows: two budgets can
 * sign the same contract.
 */
export type LotInfo = {
  /** This row repeats a lot already counted on an earlier row. */
  repeat: boolean;
  /** Distinct companies holding the lot this row belongs to; 1 when the lot is not shared. */
  holders: number;
};

export function lotInfo<T extends LotRow>(
  rows: readonly T[],
  amountOf: (r: T) => number = (r) => Number(r.montant_max ?? 0),
): LotInfo[] {
  const holdersOf = (r: T): string[] => {
    const sirens = String(r.fournisseur_siret ?? "")
      .split("|")
      .map((x) => x.replace(/\s/g, ""))
      .filter((x) => /^\d{9}/.test(x))
      .map((x) => x.slice(0, 9));
    if (sirens.length) return sirens;
    const name = (r.fournisseur_nom ?? "").trim().toLowerCase();
    return name && isNamedTitulaire(r.fournisseur_nom) ? [`name:${name}`] : [];
  };
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const objet = (r.objet ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const cents = Math.round(amountOf(r) * 100);
    if (!objet || !(cents > 0)) return;
    const key = `${cents}|${objet}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });
  const info: LotInfo[] = rows.map(() => ({ repeat: false, holders: 1 }));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const holders = new Set(idx.flatMap((i) => holdersOf(rows[i])));
    if (holders.size < 2) continue;
    idx.forEach((i, k) => { info[i] = { repeat: k > 0, holders: holders.size }; });
  }
  return info;
}

export function lotRepeatFlags<T extends LotRow>(
  rows: readonly T[],
  amountOf: (r: T) => number = (r) => Number(r.montant_max ?? 0),
): boolean[] {
  return lotInfo(rows, amountOf).map((x) => x.repeat);
}

/** Sum of amounts where a shared lot counts once (see lotRepeatFlags). */
export function sumLots<T extends LotRow>(
  rows: readonly T[],
  amountOf: (r: T) => number = (r) => Number(r.montant_max ?? 0),
): number {
  const repeats = lotRepeatFlags(rows, amountOf);
  return rows.reduce((sum, r, i) => (repeats[i] ? sum : sum + (amountOf(r) || 0)), 0);
}
