/* ══ THE NAMED GROUND ══════════════════════════════════════════════════════
 *
 * Street names, neighbourhood capitals and designated landmarks all get
 * written; the ground they stand on does not. Lake Merced has no name on it,
 * and neither does Mount Davidson, Ocean Beach, Lands End or the bay.
 *
 * `pipeline/scripts/us_sf_city/build_geo_names.py` ships 90 of them out of the
 * United States' own gazetteer, each carrying its GNIS `feature_id`. This
 * writes them.
 *
 * ── TWO HANDS, BECAUSE A MAP HAS ALWAYS USED TWO ───────────────────────────
 * Water is written in italic and land is not. That is not decoration: it is
 * the oldest convention in cartography and it lets a reader tell a lake from a
 * hill without reading either word. The land names are letter-spaced like the
 * neighbourhood capitals they sit among, so the two registers read as the same
 * kind of statement about the ground, and the water names are not, so they
 * separate from it.
 *
 * ── AND IT SHARES THE ONE COLLISION GRID ───────────────────────────────────
 * `overlay.ts` §THE ORDER IS THE PRIORITY: every pass writes into the same
 * `LabelGrid`, so a hill name cannot land on a street name and no pass has to
 * know the others exist. This one runs BEFORE the district capitals: written
 * after them, Lake Merced lost its own frame to LAKESHORE — the district named
 * after the lake beat the lake. The ground is older than the districts drawn
 * on it, so it wins the collision.
 *
 * The gazetteer does not rank its own names, so the RANK is the pipeline's and
 * is documented there. Here it only decides what is attempted first, which is
 * what survives when the ink runs out.
 */

import { LEDGER_W } from "@/lib/city/camera";
import type { LabelGrid } from "@/lib/city/labels";
import { type Frame, sx, sy } from "@/lib/city/terrain";

export interface GeoName {
  /** the gazetteer's own name */
  n: string;
  /** its GNIS feature class — Bay, Summit, Lake, Cape, Beach, Island … */
  k: string;
  /** drop order in a crowded frame, 0 first. The pipeline's, not the register's */
  r: number;
  /** GNIS feature_id, so any name on the map can be looked up */
  id: number;
  x: number;
  y: number;
}

/** the classes a map writes in italic, because they are water */
const WATER = new Set(["Bay", "Lake", "Reservoir", "Stream", "Falls", "Beach", "Basin"]);

/** lifted the same amount the neighbourhood capitals are, so a name on a hill
 *  sits on the hill rather than in the ground beside it */
const LIFT_M = 6;

/* Sizes by zoom band. A geographic name is smaller than a district capital --
   the district is what a reader navigates by -- and larger than a street. */
const FS = [13, 12, 11];
const TRACK = [1.6, 1.2, 0.8];

const WATER_INK = "#2d5c7a";
const LAND_INK = "#4a4136";
const HALO = "rgba(255,255,255,0.86)";

/**
 * Write the named ground. Returns how many made it onto the frame — a count,
 * not a promise: on a crowded frame most of them lose to something already
 * written, which is the grid working.
 */
export function drawGeoNames(
  f: Frame,
  names: readonly GeoName[],
  grid: LabelGrid,
  elev: (x: number, y: number) => number,
  step: number,
  /** district names already on the frame — see §AND NOT TWICE */
  hoodNames?: ReadonlySet<string>,
): number {
  if (!names.length) return 0;
  const { ctx, W, H } = f;
  const band = step < 0 ? 0 : step > 2 ? 2 : step;
  /* the ledger sits ON the canvas, so the writable strip is narrower than the
     canvas — `labels.ts` §THE STRIP IS NOT CENTRED found this the hard way */
  const vw = W < LEDGER_W * 3 ? W : W - LEDGER_W;
  let placed = 0;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  for (const g of names) {
    /* ── AND NOT TWICE ────────────────────────────────────────────────────
       The gazetteer names a summit TWIN PEAKS and the city named a district
       after it, so the frame carried the same two words in two hands a
       centimetre apart. The district is drawn from the city's own hood rings
       and covers ground the summit is only a point in, so the summit yields:
       one name, one place. */
    if (hoodNames && hoodNames.has(g.n.toUpperCase())) continue;
    const water = WATER.has(g.k);
    ctx.font = `${water ? "italic 500" : "600"} ${FS[band]}px var(--f-sans, system-ui, sans-serif)`;
    ctx.letterSpacing = `${water ? 0 : TRACK[band]}px`;
    const t = water ? g.n : g.n.toUpperCase();
    const p = f.proj.proj(g.x, g.y, elev(g.x, g.y) + LIFT_M);
    const X = sx(f, p);
    const Y = sy(f, p);
    const bw = ctx.measureText(t).width + 14;
    const bh = FS[band] + 8;
    if (X - bw / 2 < 4 || X + bw / 2 > vw - 4 || Y - bh / 2 < 4 || Y + bh / 2 > H - 4) {
      continue;
    }
    const x0 = X - bw / 2;
    const y0 = Y - bh / 2;
    const x1 = X + bw / 2;
    const y1 = Y + bh / 2;
    if (!grid.fits(x0, y0, x1, y1)) continue;
    grid.add(x0, y0, x1, y1);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = HALO;
    ctx.strokeText(t, X, Y);
    ctx.fillStyle = water ? WATER_INK : LAND_INK;
    ctx.fillText(t, X, Y);
    placed++;
  }
  ctx.letterSpacing = "0px";
  ctx.restore();
  return placed;
}
