/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/bay-form.ts — THE BAY WINDOW, AS A SOLID.

   The projecting bay is the signature of this city. `lib/city/facades.ts`
   §THE BAY WINDOW IS A CLAIM ABOUT A TYPE already decides WHICH footprints
   have one — `faBayOK`: a HOUSE or FLATS, on a measured FRONT edge, built
   before 1925, more than one published storey. That rule reaches 32,290 of
   the 166,166 drawn footprints, 19.4 % of the city, and it is the same rule
   the Canvas page uses.

   What that rule has never had is a SHAPE. `FA.bay` draws the bay as a value
   on the wall — `bayv` 1.045, a pale vertical band — and the wall stays flat.
   At an axonometric camera a painted band is a painted band: the roofline
   does not step, nothing casts, and a block of Edwardian flats reads as a row
   of boxes with stripes on them. This file gives that band a third dimension.

   ── AND IT IS BUILT INWARD, WHICH IS THE HONEST DIRECTION ────────────────
   `facades.ts` states the constraint the 2D path works under: the bay "never
   leaves the footprint". That constraint is right and it survives here, but
   the way to keep it is not to stay flat — it is to notice which line the
   published footprint actually is.

   `ynuv-fyni` is derived from aerial survey. What an aerial outline traces on
   a bayed San Francisco house is the BAY'S OWN EDGE, because the bay is the
   widest thing there is to see from above. So the measured ring is not the
   plane of the wall behind the bay; it is the plane of the bay's face. A bay
   modelled by pushing OUT past that ring would draw 0.75 m of building that
   the survey says is not there. A bay modelled by setting the wall BACK from
   it draws exactly the same solid the survey measured, and puts the recess
   where the record has nothing to say.

   So: the bays reach the measured ring. The wall between them steps back. And
   the last `BAY_HEAD_M` under the wall's head stays ON the ring, unbroken
   across the whole frontage, which is the cornice the bays stop under.

   ── WHAT IS MEASURED AND WHAT IS DECLARED ────────────────────────────────
   MEASURED   the footprint ring, the edge's role (front / back / party), the
              storey count, the year, and the class — every gate on whether a
              bay is drawn at all.
   DECLARED   `BAY_DEPTH_M`, `BAY_FILL`, and the rule that bays repeat on the
              facade's own module. No published field records a bay's depth,
              its width, or how many a frontage has. These are one convention
              for the whole city, stated once here, exactly as every opening
              and cornice in `facades.ts` is.
   NOT CLAIMED  that THIS building has a bay in THIS place. The page says so
              in `manifest.facade.NOT_MEASURED`, and this file does not widen
              that claim — it only gives the existing one a silhouette.
   ═══════════════════════════════════════════════════════════════════════ */

import { DE } from "@/lib/city/roofs";

import type { RGB } from "./roof-form";

/**
 * How far the wall sets back from the measured ring, world metres.
 *
 * San Francisco's bays run about 0.6–1.0 m proud of the wall behind them —
 * a squared bay on a flat-front Edwardian is shallower, a slanted Victorian
 * bay deeper. 0.75 m is one value for the whole city, in the middle of that
 * range, and it is DECLARED rather than measured: no published column records
 * a projection.
 *
 * It is also chosen against the cameras this project has stops for. At the
 * block stop (1.03 m per pixel) a 0.75 m step is most of a pixel and the
 * roofline visibly breaks; at the street stop (0.3103 m/px) it is 2.4 pixels
 * of wall turning a corner, which is a shadow with a shape rather than a
 * gradient. Below the block stop the facade tier is not loaded and no bay is
 * built at all.
 */
export const BAY_DEPTH_M = 0.75;

/**
 * WHERE THE BAY STOPS, AND WHY IT IS NOT AT THE WALL'S HEAD.
 *
 * The first cut ran the recess the full height of the wall, and it was wrong
 * in a way that only the mesh could show: `DE` builds a PARAPET on every flat
 * roof — the measured ring is the coping, the deck is inset behind it and
 * dropped 0.85 m — and that inset is RAMPED with the camera. So a recess
 * 0.75 m deep sometimes stood inside the parapet's own inner face, and the
 * set-back wall's head came up through the roof deck as a band of wall with
 * windows on it, standing on the roof.
 *
 * Clamping the recess under the inset would have been chasing a moving
 * number. The answer the building itself gives is better: a San Francisco bay
 * stops UNDER THE CORNICE. It does not run up into the parapet, because the
 * cornice is the one line that crosses the whole frontage unbroken — that is
 * what makes a row of bays read as a row rather than as a corrugation.
 *
 * So the bayed zone ends below the head, and the caller puts the ordinary wall
 * back on the measured ring for that last band. The parapet then sits on solid
 * wall at the ring, exactly as it does on every other footprint in the city,
 * and a hip's eave does too.
 *
 * ── AND IT CLEARS THE DECK BY MORE THAN NOTHING ──────────────────────────
 * `DE.parapet` ALONE was still wrong, and the mesh showed that too: the tray
 * DROPS its deck by exactly `DE.parapet`, so a bayed zone ending there put the
 * bay's own top cap in the same plane as the roof deck — a wall-coloured
 * horizontal patch lying on the roof, one per bay, reading as a row of pink
 * dashes across every frontage in the Sunset.
 *
 * The clearance puts that cap UNDER the deck instead of on it, where the deck
 * (or, outside the deck's inset, the parapet's own solid) hides it at every
 * camera. 0.2 m is four orders of magnitude above what the depth buffer needs
 * to separate two surfaces over this scene's span, and under a fifth of a
 * storey, so the cornice band it lengthens is still a cornice band.
 */
export const BAY_DECK_CLEAR_M = 0.2;
export const BAY_HEAD_M = DE.parapet + BAY_DECK_CLEAR_M;

/**
 * The share of its module a bay takes, leaving the rest as the pier between
 * bays. 0.62 is DECLARED. It sits above a half so the bay reads as the
 * dominant element of the frontage — which on this stock it is — and below
 * two thirds so a pier survives at every module width the vocabulary uses
 * (3.1 m for a 1900s flat gives a 1.18 m pier).
 */
export const BAY_FILL = 0.62;

/**
 * A BAY IS NOT A WINDOW, AND IT DOES NOT REPEAT ON THE WINDOW'S MODULE.
 *
 * The first cut spaced the bays on `faVocab().mod` — the facade tile's own
 * module, 3.1 m for a 1900s flat — because that is the rhythm the openings
 * already have and reusing it meant a bay could not fall between two windows.
 * The mesh showed what is wrong with that: a 19 m frontage got five bays, and
 * five bays is a corrugation. The Sunset does not look like that.
 *
 * A San Francisco bay spans two or three window modules, not one. On the
 * standard 25 ft (7.62 m) lot that is ONE bay to a frontage, about 3.8 m
 * across, which is the form the whole city is made of. Two window modules is
 * the multiplier that produces it, and it keeps the bays commensurate with the
 * openings — the pier between two bays is still a whole number of modules
 * wide, so nothing lands half over a window.
 */
export const BAY_MODULE_MULT = 2;

/**
 * A frontage shorter than this gets no bay.
 *
 * Below about 5 m a single bay at `BAY_FILL` leaves piers under 0.95 m, and
 * the two side returns (0.75 m each) then cost more geometry than the face
 * they carry. It is also the point below which the whole frontage is one
 * window on this stock, and a one-window frontage does not have a bay AND a
 * pier — it has a front.
 */
export const BAY_MIN_EDGE_M = 5.0;

/**
 * The footprint's smaller plan extent must clear this or no bay is built.
 *
 * Setting one edge back by `d` cannot invert a ring on its own, but on a
 * footprint thinner than a few times `d` it eats a visible share of the plan
 * — and a 2 m deep footprint with a 0.75 m recess in it is a claim about the
 * building's INSIDE, which nothing here is entitled to make. Three times the
 * depth is the gate.
 */
export const BAY_MIN_PLAN_M = 3 * BAY_DEPTH_M;

/**
 * The most bays one frontage may carry.
 *
 * The module already scales the count with the wall, so this only catches the
 * long frontage — a 40 m flat block on a 3.1 m module asks for thirteen. Six
 * is the point past which the bays stop being a rhythm and become a corrugation,
 * and it bounds the vertex cost per footprint at a number that can be stated:
 * 4 for the set-back wall plus 8 a bay, so 52 at the ceiling.
 */
export const BAY_MAX = 6;

/** what `bayForm` needs to append a vertex — `layers/buildings.ts` §pushVert */
export interface BaySink {
  vertexUV(
    x: number, y: number, elevM: number, hM: number,
    r: number, g: number, b: number, u: number, v: number,
  ): number;
}

/** one measured ring edge, and everything the wall on it was going to use */
export interface BayEdge {
  /** the edge's ends on the measured ring, world metres */
  ax: number; ay: number; bx: number; by: number;
  /** unit normal pointing INTO the footprint */
  nx: number; ny: number;
  /** ground under the footprint's centroid */
  elevM: number;
  /** the head of the BAYED ZONE — the wall's head less `BAY_HEAD_M`, not the
   *  wall's head. The band above it is the caller's cornice. */
  wallH: number;
  /** the wall colour at the foot and at the head */
  cBot: RGB; cTop: RGB;
  /** the facade coordinate at A, and the module the tile repeats on */
  u0: number; moduleM: number;
  /** the tile's v at the head — the published storey count */
  vTop: number;
  /** the ring's own vertices, already in the buffer, for the corner returns */
  footA: number; footB: number; topA: number; topB: number;
}

/**
 * How many bays a frontage of `Lm` carries on a module of `moduleM`.
 *
 * The same divisor the facade tile uses, so a bay lands on the rhythm the
 * windows already have rather than on a second, competing one. Returns 0
 * where the edge is too short to carry one.
 */
export function bayCountOn(Lm: number, moduleM: number): number {
  if (!(Lm >= BAY_MIN_EDGE_M) || !(moduleM > 0.5)) return 0;
  const span = moduleM * BAY_MODULE_MULT;
  return Math.max(1, Math.min(BAY_MAX, Math.round(Lm / span)));
}

/**
 * Build the bayed frontage. Returns false when the edge will not take one, and
 * a false return means the CALLER STILL OWES THE PLAIN WALL — nothing is
 * emitted on a refusal.
 *
 * The solid is: one quad for the set-back wall across the whole edge, one
 * return quad at each corner where the set-back plane meets the ring, and a
 * four-sided box per bay standing on the ring. The bay's BACK is not built —
 * the set-back wall is 0.75 m behind it and closes it — which is a quad a bay
 * saved and no hole, because nothing can see between two surfaces that face
 * the same way with solid between them.
 */
export function bayForm(
  sink: BaySink,
  quad: (a: number, b: number, c: number, d: number) => void,
  e: BayEdge,
): boolean {
  const ex = e.bx - e.ax;
  const ey = e.by - e.ay;
  const L = Math.hypot(ex, ey);
  const m = bayCountOn(L, e.moduleM);
  if (m === 0) return false;
  /* a wall too short to stand a bay against is left alone: the recess would
     be a larger share of the storey than the bay's own face */
  if (!(e.wallH > BAY_DEPTH_M * 2)) return false;

  const dx = ex / L;
  const dy = ey / L;
  const d = BAY_DEPTH_M;
  const { cBot, cTop } = e;

  /** a vertex at `t` metres along the edge, `dep` metres in, at the foot */
  const foot = (t: number, dep: number): number =>
    sink.vertexUV(
      e.ax + dx * t + e.nx * dep, e.ay + dy * t + e.ny * dep,
      e.elevM, 0, cBot[0], cBot[1], cBot[2],
      e.u0 + t / e.moduleM, 0,
    );
  /** the same, at the wall's head */
  const head = (t: number, dep: number): number =>
    sink.vertexUV(
      e.ax + dx * t + e.nx * dep, e.ay + dy * t + e.ny * dep,
      e.elevM, e.wallH, cTop[0], cTop[1], cTop[2],
      e.u0 + t / e.moduleM, e.vTop,
    );

  /* ── THE WALL BEHIND THE BAYS, AS ONE PLANE ─────────────────────────────
     Drawn across the whole frontage rather than in pieces between the bays.
     Each bay then stands 0.75 m in front of it and hides the stretch it
     covers, so the piece-wise version would be the same picture for four more
     vertices a bay — and a seam at every bay edge for the tile to fail to
     line up across. */
  const s0f = foot(0, d);
  const s1f = foot(L, d);
  const s0t = head(0, d);
  const s1t = head(L, d);
  quad(s0f, s1f, s1t, s0t);

  /* ── AND THE TWO CORNERS COME BACK TO THE MEASURED RING ────────────────
     The neighbouring edges are still on the footprint, so without these the
     frontage would be a 0.75 m slot open at both ends. They reuse the ring's
     own vertices — no new geometry on the ring side, and the corner stays
     exactly where the survey put it. */
  quad(e.footA, s0f, s0t, e.topA);
  quad(s1f, e.footB, e.topB, s1t);

  const w = L / m;
  const bw = w * BAY_FILL;
  for (let j = 0; j < m; j++) {
    const t0 = j * w + (w - bw) / 2;
    const t1 = t0 + bw;
    /* the face, on the measured ring */
    const o0f = foot(t0, 0);
    const o1f = foot(t1, 0);
    const o0t = head(t0, 0);
    const o1t = head(t1, 0);
    /* and its two returns, back at the set-back plane */
    const k0f = foot(t0, d);
    const k1f = foot(t1, d);
    const k0t = head(t0, d);
    const k1t = head(t1, d);
    quad(o0f, o1f, o1t, o0t);
    quad(k0f, o0f, o0t, k0t);
    quad(o1f, k1f, k1t, o1t);
    /* the bay's top. The roof fan covers the ring at `wallH` and would close
       this anyway on a flat roof, but a hip's eave and a tray's inset both
       leave the ring — so the bay caps itself rather than depending on which
       roof its building happens to have got. */
    quad(o0t, o1t, k1t, k0t);
  }
  return true;
}
