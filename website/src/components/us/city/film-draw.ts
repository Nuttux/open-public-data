/**
 * THE FILM'S OWN MARKS.
 *
 * Four passes, and where each one is painted is the whole of whether it is
 * honest — ported from `film/film.js`'s five wraps.
 *
 *   drawAccepted     INTO THE BUFFER, under the fabric and over the ground.
 *                    That order is the record's own: the Board accepts a
 *                    street, and the assessor dates the houses on it later.
 *   drawBridgeDeck   ON THE GLASS. One two-point line over open water that
 *                    changes every frame and occludes nothing.
 *   drawSubject      ON THE GLASS. The ring, the dot and the rising footprint.
 *   drawSubjectName  ON THE GLASS. Text, which would otherwise be
 *                    re-rasterised with 166,166 buildings every time it moved.
 *
 * WHY THE DECK IS NOT IN THE BUFFER, measured. It was — inside the streets
 * pass, inside the layer the renderer caches on its content key, and that key
 * carries the year, the tier and the camera, none of which move while a bridge
 * is being drawn across the bay. So during PLAYBACK the layer was last rebuilt
 * when the year turned 1936, before the build act started, and it was not
 * rebuilt again until 1937: **the deck never strokes out at all**, then arrives
 * at full length on the next year's rebuild. Found by looking at six played
 * frames with no bridge in any of them — every previous still of that shot was
 * SEEKED across a year boundary, which rebuilds the layer and shows a finished
 * deck.
 *
 * Nothing here invents a coordinate. The centrelines are DataSF's, lit on the
 * year the Board voted; the deck is the same published file; the subject's name
 * is the string the corpus prints and the ledger and the drawer print.
 */

import type { Frame } from "@/lib/city/terrain";
import { SX, SY, type Plane, type Projection, type ViewCamera } from "@/lib/city/projection";
import type { FilmEnt, FilmState, FilmStreets, YearBand } from "@/lib/city/film";
import type { Ring } from "@/lib/city/water";
import { heldMaterial } from "@/lib/city/landmarks";

/** `base/heroes.json`'s own first two material entries — stone, and the value
 *  the mock derives its walls from. Nothing here picks a colour. */
const HERO_STONE = "#f7f1e1";
const HERO_STONE_D = "#e4dabe";

/** `part3.html` §FAM — the five decision families and their colours. */
export const FAM: Readonly<Record<string, string>> = {
  civic: "#1e45e4",
  learning: "#c12323",
  green: "#1baf7a",
  health: "#4a3aa7",
  infra: "#eda100",
};

/** accepted, and settled */
const ST_INK = "rgba(38,28,12,0.58)";
/** accepted THIS year, while it lands */
const ST_NEW = "#8a2f14";

/**
 * The 2,051 centrelines, projected once.
 *
 * Elevation is sampled once per vertex, exactly as the base street layer does
 * it: `elevM` is two clamps and an array read, and 4,896 of them a frame for a
 * number that cannot change is real money at 60 Hz. The `+ 0.8` is the base
 * layer's own lift off the ground, so an accepted line sits on the road surface
 * rather than inside it.
 */
export class AcceptedStreets {
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly bands: readonly YearBand[];

  constructor(
    readonly st: FilmStreets,
    bands: readonly YearBand[],
    proj: Projection,
    elev: (x: number, y: number) => number,
  ) {
    this.bands = bands;
    const n = st.x.length;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    const c = proj.coeffs();
    for (let k = 0; k < n; k++) {
      const wx = st.x[k] * 0.1; // decimetres
      const wy = st.yv[k] * 0.1;
      this.px[k] = c.ax * wx + c.ay * wy;
      this.py[k] = c.bx * wx + c.by * wy;
      this.pz[k] = elev(wx, wy) + 0.8;
    }
  }
}

function strokeSeg(
  g: CanvasRenderingContext2D,
  A: AcceptedStreets,
  s: number,
  k2: number,
  W2: number,
  H2: number,
  cx: number,
  cy: number,
  zex: number,
  frac: number,
): void {
  const o = A.st.off[s];
  const n = A.st.off[s + 1] - o;
  if (n < 2) return;
  const last = frac >= 1 ? n - 1 : Math.max(1, Math.ceil((n - 1) * frac));
  for (let t = 0; t <= last; t++) {
    let px = A.px[o + t];
    let py = A.py[o + t] + A.pz[o + t] * zex;
    if (t === last && frac < 1) {
      /* the partial vertex: the stroke stops part-way along its own last
         segment, which is what makes a short street DRAW rather than blink */
      const u = (n - 1) * frac - (last - 1);
      if (u < 1 && last > 0) {
        const ax = A.px[o + last - 1];
        const ay = A.py[o + last - 1] + A.pz[o + last - 1] * zex;
        px = ax + (px - ax) * u;
        py = ay + (py - ay) * u;
      }
    }
    const sx2 = (px - cx) * k2 + W2;
    const sy2 = H2 - (py - cy) * k2;
    if (t) g.lineTo(sx2, sy2);
    else g.moveTo(sx2, sy2);
  }
}

/**
 * THE STRONGEST IMAGE IN THE PIECE: 2,051 published centrelines laying
 * themselves down, each in the year the Board voted to accept it.
 *
 * The year's own acceptances arrive on `enter`, drawn from one end, so a year
 * with four segments reads as four gestures and not as an alpha step. They are
 * stroked hotter than the settled layer for as long as they are arriving and
 * then join it.
 *
 * HONEST, AND VISIBLE IN THE PICTURE RATHER THAN ARGUED: the corpus opens in
 * April 1906, so every street accepted before the fire was accepted before the
 * record starts and downtown stays dark; 1,826 of the 2,051 land by 1930 and the
 * last in 1947, and nothing fills the tail.
 */
export function drawAccepted(
  f: Frame,
  A: AcceptedStreets,
  state: FilmState,
  base: number,
): void {
  const g = f.ctx;
  const iy = Math.floor(state.year);
  const cam = f.cam;
  const k2 = cam.scale;
  const W2 = f.W / 2;
  const H2 = f.H / 2;
  const zex = f.proj.zex;
  /* width tracks the zoom, floored so the layer never disappears at the whole
     city and capped so it never becomes a road at block zoom */
  const lw = Math.max(0.9, Math.min(3.4, 1.05 * Math.sqrt(cam.scale / (base || 1))));

  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  let arriving: YearBand | null = null;
  g.strokeStyle = ST_INK;
  g.lineWidth = lw;
  g.beginPath();
  for (const band of A.bands) {
    if (band.y > iy) break;
    if (band.y === iy && state.stEnter < 1) {
      arriving = band;
      continue;
    }
    for (let s = band.i; s < band.j; s++)
      strokeSeg(g, A, s, k2, W2, H2, cam.cx, cam.cy, zex, 1);
  }
  g.stroke();

  if (arriving) {
    const e = Math.max(0, Math.min(1, state.stEnter));
    g.strokeStyle = ST_NEW;
    g.lineWidth = lw + 1.1;
    g.globalAlpha = 0.85;
    g.beginPath();
    for (let s = arriving.i; s < arriving.j; s++)
      strokeSeg(g, A, s, k2, W2, H2, cam.cx, cam.cy, zex, e);
    g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

/** The deck, in plane coordinates, projected once. Two coordinates a
 *  carriageway: it is a straight run from Rincon Hill to Yerba Buena Island and
 *  the published file does not pretend otherwise. */
export function projectDeck(
  lines: readonly (readonly (readonly number[])[])[],
  proj: Projection,
): Plane[][] {
  const c = proj.coeffs();
  return lines.map((line) =>
    line.map((pt) => {
      const wx = pt[0] * 0.1;
      const wy = pt[1] * 0.1;
      return [c.ax * wx + c.ay * wy, c.bx * wx + c.by * wy] as Plane;
    }),
  );
}

export function drawBridgeDeck(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  deck: readonly Plane[][],
  e: number,
  base: number,
): void {
  if (!(e > 0)) return;
  const k2 = cam.scale;
  const W2 = W / 2;
  const H2 = H / 2;
  const lw = Math.max(0.9, Math.min(3.4, 1.05 * Math.sqrt(cam.scale / (base || 1))));
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = ST_INK;
  g.lineWidth = lw + 2.2;
  g.beginPath();
  for (const line of deck) {
    const a = line[0];
    const b = line[1];
    if (!a || !b) continue;
    g.moveTo((a[0] - cam.cx) * k2 + W2, H2 - (a[1] - cam.cy) * k2);
    const x1 = a[0] + (b[0] - a[0]) * e;
    const y1 = a[1] + (b[1] - a[1]) * e;
    g.lineTo((x1 - cam.cx) * k2 + W2, H2 - (y1 - cam.cy) * k2);
  }
  g.stroke();
  g.restore();
}

export interface FootprintRing {
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly n: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * THE ONE TRUE BUILDING CONSTRUCTION IN THE FILM.
 *
 * The subject's own published footprint, extruded from the ground to its own
 * measured LIDAR height over the length of the act. Not a glyph and not a
 * sprite: the ring is the ring `ynuv-fyni` publishes and the height is the one
 * the roll measures.
 *
 * `drawLandmark` is deliberately NOT used, and the reason is what shot 4 is
 * about: it would put the geocoder's precision disc round the block, and the
 * 1917 Main Library's geocode is 507 m wide — at the zoom this shot holds that
 * disc is the whole frame. **A ring the size of Civic Center drawn round one
 * building is a claim about the wrong thing.** The published footprint IS the
 * precision here, because the record names the parcel.
 */
export function drawRisingFootprint(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  ring: FootprintRing,
  groundZ: number,
  rise: number,
  colour: string,
): void {
  const c = proj.coeffs();
  const n = ring.n;
  if (n < 3) return;
  const h = ring.h * rise;
  const zBase = groundZ * proj.zex;
  const dh = h * proj.zexb;
  const bx = new Float64Array(n);
  const by = new Float64Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const px = c.ax * ring.vx[k] + c.ay * ring.vy[k];
    const pyB = c.bx * ring.vx[k] + c.by * ring.vy[k] + zBase;
    const sxv = (px - cam.cx) * cam.scale + W / 2;
    bx[k] = sxv;
    by[k] = H / 2 - (pyB - cam.cy) * cam.scale;
    tx[k] = sxv; // screen x carries no height: projb adds it to p1 only
    ty[k] = H / 2 - (pyB + dh - cam.cy) * cam.scale;
  }
  let s2 = 0;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    s2 += tx[k] * ty[k1] - tx[k1] * ty[k];
  }
  const sgn = s2 >= 0 ? 1 : -1;

  /* ── THE FAMILY COLOUR IS A LENS ON A BUILDING, NOT A SWATCH OVER ONE ──
     `landmarks.ts` §THE FAMILY COLOUR IS NOT POURED OVER A HERO'S ROOF, and its
     own note records the measurement: against 166,166 earth and slate roofs a
     60 % #1e45e4 "read as a selection swatch rather than as a roof", and 0.40
     is the same mistake at a lower opacity. The roof is a MATERIAL and the
     family colour is pulled through it at `HELD_PULL_ROOF` — 0.26 on the roof
     and 0.20 on the walls — while the beat is held. The stone it is pulled from
     is the landmark palette's own first entry. */
  const roofCol = heldMaterial(HERO_STONE, colour, true);
  const wallCol = heldMaterial(HERO_STONE_D, colour, false);

  g.save();
  g.lineJoin = "round";
  // the contact shadow, so it sits on the ground rather than floating
  g.fillStyle = "rgba(28,22,12,0.20)";
  g.beginPath();
  const sox = Math.min(9, h * cam.scale * 0.34 * 0.02);
  const soy = Math.min(7, h * cam.scale * 0.2 * 0.02);
  g.moveTo(bx[0] - sox, by[0] + soy);
  for (let k = 1; k < n; k++) g.lineTo(bx[k] - sox, by[k] + soy);
  g.closePath();
  g.fill();

  // the walls — one wall faces the camera at this bearing
  g.fillStyle = wallCol;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    if ((tx[k1] - tx[k]) * sgn <= 0) continue;
    g.beginPath();
    g.moveTo(bx[k], by[k]);
    g.lineTo(bx[k1], by[k1]);
    g.lineTo(tx[k1], ty[k1]);
    g.lineTo(tx[k], ty[k]);
    g.closePath();
    g.fill();
  }
  // the roof
  g.fillStyle = roofCol;
  g.beginPath();
  g.moveTo(tx[0], ty[0]);
  for (let k = 1; k < n; k++) g.lineTo(tx[k], ty[k]);
  g.closePath();
  g.fill();
  g.strokeStyle = shade(roofCol, 0.62);
  g.lineWidth = 1;
  g.stroke();
  g.restore();
}

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.round(((v >> 16) & 255) * k);
  const gg = Math.round(((v >> 8) & 255) * k);
  const b = Math.round((v & 255) * k);
  return `rgb(${r},${gg},${b})`;
}

/**
 * The precision disc, for a subject that is a DISTRICT and not a building — a
 * bond programme, a redevelopment area, a made island. Its radius is the
 * geocode's own published width and not a decoration: `civic-center` is 507 m
 * because the corpus only ever puts it in Civic Center, and drawing it smaller
 * would claim a precision the record does not have.
 */
export function drawSubjectRing(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  wx: number,
  wy: number,
  wz: number,
  radM: number,
  rise: number,
  colour: string,
): void {
  const p = proj.proj(wx, wy, wz);
  const cx = SX(p, W, cam);
  const cy = SY(p, H, cam);
  const rx = radM * proj.cA * Math.SQRT2 * cam.scale * rise;
  const ry = radM * proj.sA * Math.SQRT2 * cam.scale * rise;
  if (rx < 1 || ry < 0.4) return;
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.globalAlpha = 0.13 * rise;
  g.fillStyle = colour;
  g.fill();
  g.globalAlpha = 0.5 * rise;
  g.strokeStyle = colour;
  g.lineWidth = 1.4;
  g.stroke();
  g.restore();
}

/** A place mark for a subject that is a POINT the registry names — a tunnel
 *  portal. It is 5 px and it says nothing on its own, which is exactly why the
 *  subject carries its name on a leader. */
export function drawSubjectDot(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  wx: number,
  wy: number,
  wz: number,
  rise: number,
  colour: string,
): void {
  const p = proj.proj(wx, wy, wz);
  const cx = SX(p, W, cam);
  const cy = SY(p, H, cam);
  const r = 5 * rise;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r + 3, 0, Math.PI * 2);
  g.fillStyle = "rgba(250,250,247,.85)";
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = colour;
  g.fill();
  g.restore();
}

/**
 * THE SUBJECT IS NAMED, and it is the one label the film adds.
 *
 * The cold-read test on shot 5 failed on a screenshot: the west side is bare,
 * which is the subject, and the tunnel portal is a 5 px dot that says nothing.
 * A reader who has not been told cannot get *a tunnel opened here* out of a dot;
 * and a blue ellipse over Civic Center is not a legible statement of what it is
 * either. So the shot's subject carries ITS OWN NAME, out of the corpus — the
 * same string the ledger and the drawer print — on a leader down to the mark.
 * Nothing is invented: no name here was typed in this file.
 *
 * A CALLOUT MAY SLIDE, A POINTER MAY NOT. The box is clamped into the frame and
 * the leader still ends on the mark; where the slide takes the box off the mark
 * the leader turns once along the box's own bottom edge, which is what a leader
 * line is for. And the name is WRAPPED, not cut and not abbreviated — these
 * strings come out of the corpus and *Treasure Island and the 1939 Golden Gate
 * International Exposition* does not fit on one line of a phone. Truncating it
 * would put a name on screen that is not the record's name.
 */
export function drawSubjectName(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  x: number,
  y: number,
  name: string,
  colour: string,
  alpha: number,
  placed: number[][],
  lift: number,
): void {
  if (x < -200 || x > W + 200 || y < -200 || y > H + 200) return;
  g.save();
  g.globalAlpha = alpha;
  g.font = "600 12.5px ui-sans-serif,system-ui,sans-serif";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const maxIn = Math.max(60, W - 30);
  const words = name.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const trial = cur ? `${cur} ${wd}` : wd;
    if (cur && g.measureText(trial).width > maxIn) {
      lines.push(cur);
      cur = wd;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  const tw = Math.max(...lines.map((L) => g.measureText(L).width));
  const bw = tw + 18;
  const half = bw / 2;
  const bh = 20 + (lines.length - 1) * 16;
  const bx = Math.max(6 + half, Math.min(W - 6 - half, x));
  let ly = y - lift;
  const top = (): number => ly - 15 - (lines.length - 1) * 16;
  for (let tries = 0; tries < 3; tries++) {
    const clash = placed.some(
      (q) => bx - half < q[2] && bx + half > q[0] && top() < q[3] && ly + 5 > q[1],
    );
    if (!clash) break;
    ly -= bh + 6;
  }
  placed.push([bx - half, top(), bx + half, ly + 5]);
  g.strokeStyle = colour;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y - 3);
  g.lineTo(x, ly + 5);
  if (x < bx - half) g.lineTo(bx - half, ly + 5);
  else if (x > bx + half) g.lineTo(bx + half, ly + 5);
  g.stroke();
  g.fillStyle = "rgba(250,250,247,.93)";
  g.fillRect(bx - half, top(), bw, bh);
  g.strokeStyle = colour;
  g.strokeRect(bx - half, top(), bw, bh);
  g.fillStyle = colour;
  lines.forEach((L, li) => g.fillText(L, bx, ly - (lines.length - 1 - li) * 16));
  g.restore();
}

/** The colour a subject is drawn in: its own decision family, and nothing
 *  chosen here. */
export function familyColour(e: FilmEnt | undefined): string {
  return (e && FAM[e.f]) || "#161310";
}


/**
 * THE LINE AROUND THE BURNED CITY, and it is the single most legible image in
 * the project.
 *
 * `ff3a-iqhv`'s seven published rings, stroked as a red hairline over 1.4 s —
 * one stroke, starting at the waterfront. Inside it the fabric is visibly
 * empty, and it is empty for a reason nothing here had to arrange: the roll
 * dates every building standing today, so nothing that burned is ever drawn.
 *
 * It is painted at VIEWPORT size and not into the buffer. A hairline whose
 * length changes every frame does not belong in a layer keyed on the year, the
 * tier and the camera, none of which move while it is being drawn — that is the
 * same defect that kept the Bay Bridge deck from ever stroking out.
 */
export function drawBurnLine(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  rings: readonly Ring[],
  elev: (x: number, y: number) => number,
  alpha: number,
  phase: number,
): void {
  if (alpha <= 0.002 || rings.length === 0) return;
  const c = proj.coeffs();
  const zex = proj.zex;
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  g.strokeStyle = "#b4341c";
  g.lineWidth = 1.6;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  for (const ring of rings) {
    const n = ring.length;
    if (n < 2) continue;
    /* the whole boundary is drawn as ONE gesture, so `phase` is spent across
       the rings in order rather than each ring racing its neighbours */
    const last = phase >= 1 ? n - 1 : Math.max(1, Math.ceil((n - 1) * phase));
    for (let k = 0; k <= last; k++) {
      const wx = ring[k][0];
      const wy = ring[k][1];
      const px = c.ax * wx + c.ay * wy;
      const py = c.bx * wx + c.by * wy + elev(wx, wy) * zex;
      const X = (px - cam.cx) * cam.scale + W / 2;
      const Y = H / 2 - (py - cam.cy) * cam.scale;
      if (k) g.lineTo(X, Y);
      else g.moveTo(X, Y);
    }
    if (phase >= 1) g.closePath();
  }
  g.stroke();
  g.restore();
}

/* ── the 1906 fire ───────────────────────────────────────────────────────── */

/**
 * THE FIRE, AND WHAT OF IT IS THE RECORD.
 *
 * Three things are published and this pass draws all three:
 *
 *   THE EXTENT   DataSF `ff3a-iqhv`, seven rings, the area the fire took. It is
 *                the SAME geometry `drawBurnLine` strokes; here it is filled.
 *   THE LOSSES   `film/fire.json` — the *San Francisco Municipal Reports 1906*
 *                table "Value of Houses Destroyed by Fire", which is the Fire
 *                Department's own property, structure by structure, each with a
 *                survey offset from a named corner to the inch and a dollar
 *                value. 35 of 36 placed, 27 of them burned.
 *   THE VALUE    the figure the page prints beside each one, which is what sets
 *                how large its flame is drawn.
 *
 * AND WHAT IS NOT PUBLISHED, SO IS NOT CLAIMED. `ff3a-iqhv` is one polygon with
 * no time field — the final extent — and no ignition time exists for any
 * structure in the schedule. `coverage/FIRE.md` says it in the open: *"Not a
 * fire that spreads. The fire can arrive; it cannot advance."* So the fill
 * arrives along the ring's OWN VERTEX ORDER, which is the order the Clerk
 * describes the boundary in — *"The Water Front from Brannan street on the east
 * to Jones street on the north; thence along Jones to Chestnut…"* — and that is
 * the order of a description being read, not a claim about where it burned
 * first. It is declared here and in `film/fire.json`'s `meta.order`.
 *
 * THE FLAME IS A TREATMENT AND IS DECLARED AS ONE. Its shape and its flicker
 * carry no information, and it has no smoke — see §THERE IS NO SMOKE. What carries information is WHERE it is, HOW
 * BIG it is, and that there are twenty-seven of them. The flicker is
 * `Math.sin` of the act's own phase and a per-row hash — **a pure function of
 * the film clock, never `Math.random`** — so a scrub lands on exactly the frame
 * playback would have produced, which is §1's whole design claim and is the
 * first thing a random number would destroy.
 */
export interface FireLoss {
  readonly n: string;
  readonly fire: boolean;
  readonly x: number;
  readonly y: number;
  readonly usd: number | null;
  readonly usdImplied: number | null;
}

/**
 * The fraction of the whole act one structure's own flame occupies — and it is
 * deliberately most of it. At 0.42 the flames arrived in a travelling band of
 * four or five and the rest of the frame was embers: measured on
 * `out-m1c/watch-fire2-03.png`, two structures lit at 7.6 s of a 9 s act. A
 * city burning for three days has more than five buildings alight at once, so
 * the windows overlap heavily and the frame carries fifteen to twenty flames
 * through the middle of the act.
 */
const FIRE_WIN = 0.74;
/** where in its own window the flame peaks, before it dies back to an ember */
const FIRE_PEAK = 0.26;
/**
 * HOW LONG A FLAME STANDS AT ITS FULL HEIGHT BEFORE IT DIES BACK — a local
 * phase, and it exists because the fire was over long before the shot was.
 *
 * The decay used to start the instant the flame peaked: `down` fell linearly
 * from `FIRE_PEAK` all the way to the end of the window, so a structure was
 * under a third of its height for three quarters of its own life. Measured on
 * the shipped cut (`out-n3/seq-q0*.png`, six frames across 5.0-14.0 s): the
 * flames peak at **6.8 s and are gone by 10.4 s — 2.5 s of fire in a 15 s
 * shot**, and the contact-sheet mark every harness here uses, 62 % through the
 * shot, lands at act phase 0.886 and has never once seen a flame. Daniel's
 * first note was *"you need a real fire thing going on"*.
 *
 * The window, the order and the ending are all unchanged: a flame still lights
 * where its `lead` puts it, still ends its window at `0.22` of its height, and
 * the frame the fire leaves — which is the frame shot 2 opens on — is the
 * same frame it always was. What changes is only the middle, and it is a
 * DRAWING decision about a fire nobody published a timeline for, exactly as
 * `FIRE_WIN` and `FIRE_PEAK` above it are.
 */
const FIRE_HOLD = 0.66;
/**
 * CANVAS pixels of flame at the largest figure on the page, at the film's own
 * z 2.05 — and the canvas is at DPR 2, so these are half this many CSS pixels.
 * Set at 46/13 first, which is 23/7 CSS px on a 1440 px stage: measured on
 * `out-m1c/watch-fire2-04.png` as embers with a glow, not flames.
 */
const FIRE_H_MAX = 96;
const FIRE_H_MIN = 34;

/** deterministic, and that is the point — see the header */
const hash01 = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** the local phase of loss `i` of `n` at act phase `p`, or 0 before it lights */
export function firePhaseOf(i: number, n: number, p: number): number {
  if (n <= 0) return 0;
  const lead = n > 1 ? ((1 - FIRE_WIN) * i) / (n - 1) : 0;
  return Math.max(0, Math.min(1, (p - lead) / FIRE_WIN));
}

/**
 * The dollars this act has read off the page by phase `p` — the same arithmetic
 * the flames are drawn from, so a counter in the chrome and the marks on the
 * canvas cannot disagree. A structure's value is added when its own flame
 * peaks, not when it lights, so the number moves with the light.
 */
export function fireTotalAt(losses: readonly FireLoss[], p: number): number {
  let sum = 0;
  for (let i = 0; i < losses.length; i++)
    if (firePhaseOf(i, losses.length, p) >= FIRE_PEAK) sum += losses[i].usd ?? 0;
  return sum;
}

/**
 * THE BURNED AREA, FILLED — the fire's own ground, arriving and then cooling.
 *
 * Drawn UNDER the flames and under the hairline, at `phase` of the ring's own
 * vertex order, moving through two states the one number carries: hot where the
 * sweep is still running, ash where it has passed. `cool` is what carries it
 * past the shot — 1 while the fire is on the frame, falling to 0 across shot 2
 * as the city rebuilds inside it.
 */
export function drawBurnFill(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  rings: readonly Ring[],
  elev: (x: number, y: number) => number,
  phase: number,
  cool: number,
): void {
  if (phase <= 0.001 || cool <= 0.001 || rings.length === 0) return;
  const c = proj.coeffs();
  const zex = proj.zex;
  g.save();
  g.beginPath();
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) continue;
    /* a vertex the sweep has not reached is not filled, so the ground arrives
       along the same axis the hairline strokes */
    const last = phase >= 1 ? n - 1 : Math.max(2, Math.ceil((n - 1) * phase));
    for (let k = 0; k <= last; k++) {
      const wx = ring[k][0];
      const wy = ring[k][1];
      const px = c.ax * wx + c.ay * wy;
      const py = c.bx * wx + c.by * wy + elev(wx, wy) * zex;
      const X = (px - cam.cx) * cam.scale + W / 2;
      const Y = H / 2 - (py - cam.cy) * cam.scale;
      if (k) g.lineTo(X, Y);
      else g.moveTo(X, Y);
    }
    g.closePath();
  }
  const heat = Math.max(0, 1 - phase * 1.25);
  const r = Math.round(88 + 104 * heat);
  const gn = Math.round(60 + 24 * heat);
  const bl = Math.round(48 - 16 * heat);
  g.fillStyle = `rgba(${r},${gn},${bl},${(0.34 + 0.30 * heat) * cool})`;
  g.fill("evenodd");
  g.restore();
}

/**
 * The flames and the embers, on the placed structures. See the header for what
 * of this is the record and what is treatment.
 */
export function drawFireLosses(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  proj: Projection,
  losses: readonly FireLoss[],
  elev: (x: number, y: number) => number,
  phase: number,
  maxUsd: number,
): void {
  if (phase <= 0 || losses.length === 0) return;
  const c = proj.coeffs();
  const zex = proj.zex;
  const n = losses.length;
  /* the flame is sized in SCREEN pixels: at shot 1's z the largest of these
     buildings is a third of a pixel across, so one drawn to scale would be
     invisible and one drawn to scale at a block camera would cover the block. */
  const seen: { X: number; Y: number; s: number; p: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = firePhaseOf(i, n, phase);
    if (p <= 0) continue;
    const L = losses[i];
    const wz = elev(L.x, L.y);
    const px = c.ax * L.x + c.ay * L.y;
    const py = c.bx * L.x + c.by * L.y + wz * zex;
    const X = (px - cam.cx) * cam.scale + W / 2;
    const Y = H / 2 - (py - cam.cy) * cam.scale;
    if (X < -60 || X > W + 60 || Y < -80 || Y > H + 60) continue;
    const known = L.usd !== null && L.usd !== undefined;
    const k = known && maxUsd > 0 ? Math.sqrt(L.usd / maxUsd) : 0;
    seen.push({ X, Y, s: FIRE_H_MIN + (FIRE_H_MAX - FIRE_H_MIN) * k, p, h: hash01(i) });
  }
  if (!seen.length) return;

  /* ── THERE IS NO SMOKE, AND THAT IS THE FIX ────────────────────────────
     Daniel, on the shipped cut: *"on the fire when it runs theres this weird
     grey animation of the fire completing its totally strange"*. This pass is
     what he was looking at. It drew THREE radial discs per structure in
     `rgba(74,64,58,·)` — a neutral dark grey with no hue in it — centred up to
     `s x 3.7` ABOVE the flame's foot at a radius of up to `s x 1.6`, drifting
     on `Math.sin(… + phase * 5.1)`.

     THE NUMBERS ARE WHY IT COULD NOT WORK. At `FIRE_H_MAX = 96` the tallest
     flame is 96 device px and its smoke column reached 355 px above the foot
     and 154 px wide: **a plume five times the height of the flame it came
     from, and eighty-one of them on the frame.** The painted area of the smoke
     was several times the painted area of the fire, so on a pale warm map the
     largest moving thing in shot 1 was a hueless grey wash — which is exactly
     the failure §21.7 diagnosed for the flames themselves under `lighter`,
     one pass later and in grey.

     It is REMOVED rather than re-tuned. The header above already declares that
     the smoke carries no information; the record publishes no plume, no wind
     and no ignition time, so nothing is lost from the record by deleting it,
     and a fire with no smoke is better than a fire with a grey cone on it. */

  // ── the flames ───────────────────────────────────────────────────────────
  /* SOURCE-OVER, NOT `lighter`, AND THIS IS THE WHOLE OF WHY THE FIRE READ AS
     DOTS. Additive blending is right over a dark frame and wrong over this
     one: the ground under the burned district is a pale warm tan, so ADDING a
     yellow-orange gradient to it clips every channel to white and the flame
     comes out as a **cream cone of light** with no hue left in it. That is
     what `out-m1d/crop-fire8.png` shows at the act's peak — twenty-seven pale
     beams standing over the city and a dark red dot at the foot of each, and
     the dot is the only thing on the frame with any colour in it. Over
     source-over the same gradient is orange against tan, which is fire.
     The alphas below are raised to match, because additive blending had been
     doing half the work. */
  g.save();
  for (const f of seen) {
    const up = Math.min(1, f.p / FIRE_PEAK);
    /* the plateau is `FIRE_HOLD`, not `FIRE_PEAK` — see the constant. Decaying
       from the peak put every flame under a third of its height for three
       quarters of its window, so the act's own middle was embers. */
    const down = f.p <= FIRE_HOLD ? 1 : 1 - (f.p - FIRE_HOLD) / (1 - FIRE_HOLD);
    /* linear in `down`, not squared. Squared put nineteen of the twenty-seven
       under 10 % of their height by the middle of the act, which is a field of
       embers with two flames on it — the note this whole pass exists to answer. */
    const life = up * up * (0.22 + 0.78 * down);
    if (life <= 0.02) continue;
    /* two tongues, out of phase, so the flame moves rather than pulses */
    for (let q = 0; q < 2; q++) {
      /* wider than it was. At 0.25 the tongue is 4:1 tall and reads as a spike;
         a flame is nearer 2.5:1 and the eye knows it. */
      const w = f.s * (0.30 - 0.08 * q);
      const flick = 0.78 + 0.22 * Math.sin(phase * (31 + 11 * q) + f.h * 41 + q * 2.1);
      const hgt = f.s * life * flick * (1 - 0.22 * q);
      const sway = Math.sin(phase * (17 + 7 * q) + f.h * 27) * w * 0.5;
      const gr = g.createLinearGradient(f.X, f.Y, f.X, f.Y - hgt);
      gr.addColorStop(0, `rgba(255,196,84,${0.62 * life})`);
      gr.addColorStop(0.34, `rgba(232,104,22,${0.52 * life})`);
      gr.addColorStop(0.70, `rgba(178,46,16,${0.26 * life})`);
      gr.addColorStop(1, "rgba(140,32,14,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(f.X - w, f.Y + 1);
      g.quadraticCurveTo(f.X - w * 0.9, f.Y - hgt * 0.55, f.X + sway, f.Y - hgt);
      g.quadraticCurveTo(f.X + w * 0.9, f.Y - hgt * 0.55, f.X + w, f.Y + 1);
      g.closePath();
      g.fill();
    }
    /* the white heart, which is what makes it read as fire and not as paint */
    const hr = f.s * 0.13 * life;
    const gh = g.createRadialGradient(f.X, f.Y - hr * 0.4, 0, f.X, f.Y - hr * 0.4, hr * 2.2);
    gh.addColorStop(0, `rgba(255,246,214,${0.92 * life})`);
    gh.addColorStop(0.5, `rgba(255,186,74,${0.6 * life})`);
    gh.addColorStop(1, "rgba(240,120,32,0)");
    g.fillStyle = gh;
    g.beginPath();
    g.arc(f.X, f.Y - hr * 0.4, hr * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // ── what is left: one ember per structure, and it does not go out ────────
  g.save();
  for (const f of seen) {
    /* small and dark. It is what the frame KEEPS, not what it shows: an ember
       the size of the flame that made it is the "red dots" note again. */
    /* 0.075 of the flame height put a 12 px disc at the foot of every
       structure and it was the darkest, most saturated mark on the frame —
       the "red dots" note, still true after the flames were built. Half that,
       and half the alpha again: what is left has to be findable and must not
       be the thing the eye lands on. */
    const a = Math.min(1, f.p * 3);
    const rr = Math.max(1.1, f.s * 0.038);
    g.beginPath();
    g.arc(f.X, f.Y, rr, 0, Math.PI * 2);
    g.fillStyle = `rgba(88,34,20,${0.42 * a})`;
    g.fill();
  }
  g.restore();
}



/**
 * A DISTRICT A RESOLUTION NAMED, AND IT IS FOUR STREETS AND NOT A POLYGON.
 *
 * The 1942 resolution names its own subject as *"the district bounded by
 * ELLIS, CALIFORNIA, GOUGH AND FILLMORE STREETS"*. `build_film_twelve.py`
 * §district_outline takes those four names to the same published centreline
 * file the accepted streets come out of and clips them to the box of their own
 * crossings; nothing fits a shape to them and nothing closes the figure. Three
 * of the four corners exist in the 2026 file and one does not — Ellis no
 * longer reaches Fillmore, cut by the redevelopment this very resolution asked
 * Washington for — so the fourth side simply stops where the street stops,
 * which is the truth about both the street and the resolution.
 *
 * IT IS NOT DRAWN WITH `drawBridgeDeck`, and that was tried first. The deck's
 * ink is `ST_INK`, the same brown the settled street layer uses, at a width
 * derived from the zoom; over the Western Addition's own grid at z 4.4 it was
 * invisible on the frame — twenty segments of street-coloured line lying on
 * top of streets. Verified by looking: `out-m1c/watch-jtown-sheet.png`, all
 * eight frames, no mark. This is the film's own family ink on a white halo,
 * which is the grammar the ring and the dot beside it already use.
 */
export function drawOutline(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: ViewCamera,
  lines: readonly Plane[][],
  phase: number,
  colour: string,
): void {
  if (!(phase > 0) || lines.length === 0) return;
  const k = cam.scale;
  const W2 = W / 2;
  const H2 = H / 2;
  /* one gesture across the whole set, so `phase` is spent along the boundary in
     order rather than every side racing its neighbours — `drawBurnLine`'s own
     rule, for the same reason. */
  const n = lines.length;
  const last = phase >= 1 ? n : Math.max(1, Math.ceil(n * phase));
  const frac = phase >= 1 ? 1 : Math.min(1, n * phase - (last - 1));
  const walk = (): void => {
    for (let i = 0; i < last; i++) {
      const a = lines[i][0];
      const b = lines[i][1];
      if (!a || !b) continue;
      const e = i === last - 1 ? frac : 1;
      g.moveTo((a[0] - cam.cx) * k + W2, H2 - (a[1] - cam.cy) * k);
      g.lineTo(
        (a[0] + (b[0] - a[0]) * e - cam.cx) * k + W2,
        H2 - (a[1] + (b[1] - a[1]) * e - cam.cy) * k,
      );
    }
  };
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(250,250,247,.88)";
  g.lineWidth = 7.5;
  g.beginPath();
  walk();
  g.stroke();
  g.strokeStyle = colour;
  g.lineWidth = 3.2;
  g.beginPath();
  walk();
  g.stroke();
  g.restore();
}
