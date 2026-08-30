/* ══ WATCHING ONE SYSTEM BUILD ITSELF ══════════════════════════════════════
 *
 * The century rail plays the whole city at once: streets, footprints, canopy
 * and track all arriving together. That is the right default and it is also
 * why no single thing can be FOLLOWED — asked to watch the transit network
 * grow, the eye has nowhere to rest.
 *
 * Daniel: *"i want a filter in liek its like 'public transportation' and then
 * you click and see the network expand/retract etc"*.
 *
 * So: pick a system, and everything that is not it steps back. The city stays
 * on screen — a network floating over nothing is not a city and cannot be read
 * — but it goes quiet, and the system you chose keeps its colour.
 *
 * ── QUIET IS A MULTIPLY, NOT A HIDE ────────────────────────────────────────
 * Hiding the rest would be easier and worse: the map would lose its ground,
 * its water and its shadows, and the track would hang in the air. Every
 * material here already multiplies a per-vertex colour by `material.color`,
 * which ships as white, so muting is that one factor moving toward the paper
 * and back. It touches no geometry, allocates nothing, and is exactly
 * reversible — the original is kept per material and restored, so a mode can
 * be switched or cleared without a rebuild.
 *
 * ── AND IT SAYS WHAT IT CANNOT SHOW ────────────────────────────────────────
 * `RETRACTS` is false for every system here, and that is a statement about the
 * DATA and not about the city. Today's registers describe what survived, so a
 * line that was torn up in 1949 is simply absent rather than drawn and then
 * removed. Until `rail-history.json` carries an `ended` year, a system can
 * only be watched growing, and a control that implies otherwise would be
 * lying. `pipeline/scripts/us_sf_city/build_rail_history.py` is where that
 * ends up.
 */

import type { Object3D } from "three";

/** a mode: which layers keep their colour while the rest go quiet */
export interface CitySystem {
  readonly key: string;
  /** what the button says */
  readonly label: string;
  /** the layers this system is made of */
  readonly layers: readonly string[];
  /** one line under the button — what it is, and what it leaves out */
  readonly note: string;
  /** does the map hold a record of this system SHRINKING as well as growing */
  readonly retracts: boolean;
  /** draw it OVER the city rather than in it -- see §AN OVERLAY, NOT A TINT */
  readonly overlay?: boolean;
}

/* The layer names are `engine.claim()`'s, so a system is a list of things
   already on the scene graph rather than a new pass over the data. */
export const CITY_SYSTEMS: readonly CitySystem[] = [
  {
    key: "transport",
    label: "Public transport",
    layers: ["rail", "rail-overlay"],
    note:
      "cable, streetcar and light rail, each drawn from the year the city is " +
      "recorded paying to lay it. Only the lines that still run: what was " +
      "torn up is not in today's geometry.",
    retracts: false,
    overlay: true,
  },
  {
    key: "streets",
    label: "Streets",
    layers: ["streets", "street-detail", "street-markings", "street-uncovered"],
    note:
      "the roadway as it arrives, from the Board's Journal and the earliest " +
      "building on each frontage. A street exists before its first house, so " +
      "these dates run late.",
    retracts: false,
  },
  {
    key: "buildings",
    label: "Buildings",
    layers: ["buildings", "caps", "heroes"],
    note: "footprints by the assessor's year. A roll that does not date a " +
      "building draws it in every year.",
    retracts: false,
  },
] as const;

/** the ground and the water stay lit at all times — a system floating over
 *  nothing reads as a diagram, not a city */
const NEVER_MUTED = new Set(["terrain", "water", "surround", "sky", "fire"]);

/* ── QUIETENING THE REST IS NOT ENOUGH ─────────────────────────────────────
   First cut only muted, and the whole frame just went darker: at the district
   camera the track is a couple of pixels wide, so taking 38 % off the city
   around it does not make it findable. Measured against a screenshot -- 56.6 %
   of pixels moved and the rail was no easier to see.

   So the chosen system is LIFTED as well. `material.color` multiplies the
   per-vertex colour, and a factor above one brightens: the steel is already
   near-white, so it goes to the top of the frame's range while everything
   else steps back. Two small moves in opposite directions separate far better
   than one big move in one. */
const MUTE = 0.72;
const LIT = 1.7;

/* ── AN OVERLAY, NOT A TINT ────────────────────────────────────────────────
   Brightening the track and dimming the city moved 56.6 % of the frame and the
   network was still not findable, for a reason no amount of colour fixes:
   MEASURED at the street camera, buildings cover 94-97 % of the rail. A line
   in a street is hidden by the street's own buildings in an axonometric view,
   correctly, and lighting something hidden lights nothing.

   So a transit system is drawn as an OVERLAY: its depth test comes off and the
   network lies over the city like a transit diagram. This is the one place in
   the renderer where something is deliberately drawn out of depth order, and
   it is a MODE the reader has asked for rather than the default view -- the
   map is not claiming the track floats above the rooftops, it is answering
   "where does the network go" with the city kept underneath for reference. */
type Mutable = {
  color?: { r: number; g: number; b: number; setRGB: (r: number, g: number, b: number) => void };
  depthTest?: boolean;
  needsUpdate?: boolean;
};

const ORIGINAL = new WeakMap<object, [number, number, number]>();

function materialsOf(o: Object3D): Mutable[] {
  const m = (o as unknown as { material?: Mutable | Mutable[] }).material;
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}

/**
 * Light one system and quieten the rest. `key` of `null` restores everything.
 *
 * Returns the number of materials it touched, which is the only honest way to
 * tell a mode that did nothing from a mode that is not wired up — a control
 * that silently changes no pixels is the failure this codebase keeps finding.
 */
export function applySystem(root: Object3D, key: string | null): number {
  const sys = key ? CITY_SYSTEMS.find((s) => s.key === key) ?? null : null;
  const lit = sys ? new Set(sys.layers) : null;
  let touched = 0;
  root.traverse((o) => {
    const layer = (o.userData as { layer?: string }).layer;
    if (!layer) return;
    /* the diagram ribbon is drawn ONLY for the system that asked for it, and
       the layer itself decides whether the camera is far enough out to want
       one -- see `rail.ts` §AND AT CITY ZOOM THE TRACK IS HALF A PIXEL. Both
       conditions are kept on the mesh so neither module has to know the
       other's state. */
    if (layer === "rail-overlay") {
      const u = o.userData as { systemLit?: boolean; stepOK?: boolean };
      const want = lit !== null && lit.has(layer);
      if (u.systemLit !== want) {
        u.systemLit = want;
        touched++;
      }
      const geom = (o as unknown as { geometry?: { drawRange: { count: number } } }).geometry;
      const drawn = geom ? geom.drawRange.count : 1;
      o.visible = want && u.stepOK !== false && drawn > 0;
      return;
    }
    for (const mat of materialsOf(o)) {
      const c = mat.color;
      if (!c) continue;
      if (!ORIGINAL.has(mat)) ORIGINAL.set(mat, [c.r, c.g, c.b]);
      const base = ORIGINAL.get(mat)!;
      const isLit = lit !== null && lit.has(layer);
      const quiet = lit !== null && !isLit && !NEVER_MUTED.has(layer);
      const k = quiet ? MUTE : isLit ? LIT : 1;
      const wantDepth = !(isLit && sys?.overlay);
      if (mat.depthTest !== undefined && mat.depthTest !== wantDepth) {
        mat.depthTest = wantDepth;
        mat.needsUpdate = true;
        touched++;
      }
      if (c.r !== base[0] * k || c.g !== base[1] * k || c.b !== base[2] * k) {
        c.setRGB(base[0] * k, base[1] * k, base[2] * k);
        touched++;
      }
    }
  });
  return touched;
}
