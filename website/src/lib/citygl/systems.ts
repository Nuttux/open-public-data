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
    layers: ["rail", "rail-overlay", "rail-history"],
    note:
      "cable, streetcar and light rail, each drawn from the year the city is " +
      "recorded paying to lay it — and the routes the Board wrote down that " +
      "no longer exist, which appear and then are taken up again.",
    retracts: true,
    overlay: true,
  },
  {
    key: "bike",
    label: "Bike network",
    layers: ["bikeways", "bikeway-overlay"],
    note:
      "720 km of bikeway, each piece carrying the year the city installed it " +
      "-- one of the few registers on this map that dates itself. 61 dated " +
      "pieces by 1980, 1,355 by 2005, 4,306 today. A shared lane is drawn " +
      "dashed because it is a marking on a road and not a lane.",
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
] as const;

/* ── AND THERE IS NO "BUILDINGS" SYSTEM, BECAUSE THAT IS THE MAP ───────────
   There was one. It lit `buildings`, `caps` and `heroes` and quietened the
   rest, which on a map whose subject IS its buildings changes almost nothing:
   the control was there, it moved pixels, and it answered no question.
   Daniel: *"buildings ok we dont need a filter right cause thats the map
   itslef"*.

   A system control is for a network the city has laid ON its fabric and that
   the fabric then hides. The fabric itself needs no such help — it is what
   the default view already draws, and the century rail already shows it
   arriving. If a reader ever wants the buildings answered as a QUESTION, the
   question is not "where are they" but "when did they arrive", and that is a
   recolour by era rather than a mute of everything else. It is not this
   control and it is not built. */

/** the ground and the water stay lit at all times — a system floating over
 *  nothing reads as a diagram, not a city */
const NEVER_MUTED = new Set(["terrain", "water", "surround", "sky", "fire"]);

/* ── ONE MUTE FOR EVERY LAYER WAS THE WRONG SHAPE ──────────────────────────
   The first version took 28 % off everything that was not the chosen system
   and lifted the system 70 %. Driven the way a reader drives it — click
   BIKE NETWORK at the district camera — it moved 85.2 % of the pixels and
   produced a frame with **no bike network in it at all**. Daniel: *"bike lanes
   buildings i dont even get shit, it just really lights up stuff but theres no
   really overlay or liek the mpa loking different"*.

   A single constant is the wrong instrument because the layers are not doing
   the same job. Some of them are what HIDES the system — in an axonometric
   view a building stands between the eye and the street beside it, and
   `rail.ts` measured the cost at 94-97 % of the track covered. Others are what
   LOCATES the reader — the street grid, the ground, the coastline — and
   quietening those buys nothing and costs orientation.

   So the treatment is by ROLE:

     GHOST      what stands between the eye and the system. Goes TRANSPARENT.
     REFERENCE  what tells the reader where they are. Steps back a little.
     never      the ground, the water, the sky. Untouched.

   ── AND DARKENING AN OCCLUDER DOES NOT UNBLOCK IT ────────────────────────
   The first version of this took 66 % off the buildings' colour and left them
   opaque. A dark building hides a street exactly as well as a bright one, so
   the street the reader asked to see was still behind it. Daniel: *"streets
   shoudlnt it be you no longer see buildings etc but just see streets ... or
   like a version with enough opacity that you see a bit underneath but mostyl
   see the interesting layer of view?"*

   He is right, and it is the same mistake in a new place: the quantity being
   changed was not the quantity in the way. What blocks a line of sight is
   OPACITY, so that is what moves. A ghosted building still shows where the
   fabric stands — the city is not deleted — and the street under it is
   readable through it.

   `depthWrite` comes off with it, deliberately: a translucent building that
   still wrote depth would hide the buildings behind it and the ghost would
   read as a solid pale mass rather than as glass. The cost is that ghosts do
   not occlude each other, which is right for a layer view and wrong for the
   default map — so it is only ever on while a system is chosen, and both
   fields are restored. */
const GHOST_OPACITY = 0.16;
const GHOST_TINT = 0.62;

/* ── AND HOW QUIET THE REFERENCE IS DEPENDS ON WHAT THE SUBJECT IS ────────
   One value here was wrong for the same reason one value for the mute was.
   With the buildings ghosted away, the STREET GRID became the loudest thing
   left on the frame — and it stayed that loud whether the reader had asked
   for the streets or for the transit network drawn along them. All three
   modes came out looking like the same picture. Daniel: *"now i no longer see
   public transport or bike any differen tthan street it basically just shows
   mpe streets, im pretty confused"*.

   The street grid is the SUBJECT in one mode and the BACKDROP in the others,
   and it cannot be drawn at one weight for both. So the reference weight is
   read off what was chosen: when the subject is the fabric itself the grid
   keeps its own tone, and when the subject is a network laid along that grid
   the grid drops behind it. */
const REFERENCE = 0.62;
const BACKDROP = 0.3;

/** the layers that stand between the eye and anything drawn on the street */
const OCCLUDERS = new Set([
  "buildings", "caps", "heroes", "trees", "canopy-shadow",
]);

/* ── AND A LAYER THAT IS ALREADY THE WHOLE FRAME MUST NOT BE "LIT" ─────────
   Lifting the chosen system by 1.7 is right for a line and wrong for an area.
   The track is a few pixels of near-white steel and a lift puts it at the top
   of the frame's range. BUILDINGS are most of the map already: multiplying
   every roof by 1.7 clips them to white, destroys the material tones
   `materials.ts` derives from the roll, and differentiates nothing — which is
   exactly what "buildings i dont even get shit" looks like.

   So an AREA system is lit at 1.0 — its own colour, unaltered — and the
   separation comes entirely from the mute around it. Only a LINE system, which
   has to be found before it can be read, is lifted. */
const LIT_LINE = 1.45;
const LIT_AREA = 1.0;

/** systems drawn as lines on top of the city, rather than as the city itself */
const LINE_LAYERS = new Set([
  "rail", "rail-overlay", "rail-history", "bikeways", "bikeway-overlay",
]);

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
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  needsUpdate?: boolean;
};

/* ── AND THE ORIGINAL MEANS THE WHOLE ORIGINAL ─────────────────────────────
   This kept the colour and not the depth test, then wrote `depthTest = true`
   onto every material it saw — including the ones that ship it FALSE on
   purpose. MEASURED by clicking PUBLIC TRANSPORT and reading the materials
   back: `sky` went `depthTest false -> true` and stayed there, because nothing
   remembered what it had been. The sky is in `NEVER_MUTED`, so the mode was
   not even trying to touch it; the depth line simply ran outside that guard.

   A mode that cannot be undone is not a mode. Both fields are stored, and a
   layer's own depth state is restored unless this mode is deliberately
   overriding it. */
const ORIGINAL = new WeakMap<object, {
  rgb: [number, number, number];
  depthTest: boolean | undefined;
  transparent: boolean | undefined;
  opacity: number | undefined;
  depthWrite: boolean | undefined;
}>();

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
  /* is the thing chosen a NETWORK laid along the city, or the city's own
     fabric? Derived from the system's own layers rather than declared twice —
     see §AND HOW QUIET THE REFERENCE IS DEPENDS ON WHAT THE SUBJECT IS */
  const subjectIsNetwork =
    sys !== null && sys.layers.every((l) => LINE_LAYERS.has(l));
  let touched = 0;
  root.traverse((o) => {
    const layer = (o.userData as { layer?: string }).layer;
    if (!layer) return;
    /* the diagram ribbon is drawn ONLY for the system that asked for it, and
       the layer itself decides whether the camera is far enough out to want
       one -- see `rail.ts` §AND AT CITY ZOOM THE TRACK IS HALF A PIXEL. Both
       conditions are kept on the mesh so neither module has to know the
       other's state. */
    /* A LAYER OPTS IN BY DECLARING THE FLAG, rather than by being named here.
       This was a list of two layer names, and adding the bike diagram to it
       meant editing this file to teach it about a layer it does not otherwise
       know — the same coupling `engine.claim()` exists to avoid. A layer that
       wants to be switched by the system control ships `systemLit` on its mesh;
       one that does not, is muted like everything else. */
    if ("systemLit" in (o.userData as Record<string, unknown>)) {
      const u = o.userData as { systemLit?: boolean; stepOK?: boolean };
      const want = lit !== null && lit.has(layer);
      if (u.systemLit !== want) {
        u.systemLit = want;
        touched++;
      }
      /* A LAYER MAY GATE BY GROUPS OR BY drawRange, and reading the wrong one
         reports a working gate as empty — `rail-history` switches whole routes
         on and off with `group.count` because a route that ENDS is not a
         prefix of a buffer. Sum whichever it uses. */
      const geom = (o as unknown as {
        geometry?: { drawRange: { count: number }; groups?: { count: number }[] };
      }).geometry;
      let drawn = 1;
      if (geom) {
        drawn = geom.groups && geom.groups.length
          ? geom.groups.reduce((a, gr) => a + gr.count, 0)
          : geom.drawRange.count;
      }
      o.visible = want && u.stepOK !== false && drawn > 0;
      /* `rail-history` re-derives its own visibility when the YEAR moves, from
         these same three flags — see its §ONE PLACE DECIDES. Setting the flag
         here is enough; the layer does the rest. */
      return;
    }
    for (const mat of materialsOf(o)) {
      const c = mat.color;
      if (!c) continue;
      if (!ORIGINAL.has(mat)) {
        ORIGINAL.set(mat, {
          rgb: [c.r, c.g, c.b],
          depthTest: mat.depthTest,
          transparent: mat.transparent,
          opacity: mat.opacity,
          depthWrite: mat.depthWrite,
        });
      }
      const O = ORIGINAL.get(mat)!;
      const base = O.rgb;
      const isLit = lit !== null && lit.has(layer);
      const quiet = lit !== null && !isLit && !NEVER_MUTED.has(layer);
      const ghost = quiet && OCCLUDERS.has(layer);
      const k = ghost
        ? GHOST_TINT
        : quiet
          ? (subjectIsNetwork ? BACKDROP : REFERENCE)
          : isLit
            ? (LINE_LAYERS.has(layer) ? LIT_LINE : LIT_AREA)
            : 1;
      /* §AND DARKENING AN OCCLUDER DOES NOT UNBLOCK IT — what is in the way is
         opacity, so that is what moves */
      const wantT = ghost ? true : O.transparent;
      const wantO = ghost ? GHOST_OPACITY : O.opacity;
      const wantW = ghost ? false : O.depthWrite;
      if (mat.transparent !== undefined && mat.transparent !== wantT) {
        mat.transparent = wantT;
        mat.needsUpdate = true;
        touched++;
      }
      if (mat.opacity !== undefined && wantO !== undefined && mat.opacity !== wantO) {
        mat.opacity = wantO;
        touched++;
      }
      if (mat.depthWrite !== undefined && wantW !== undefined && mat.depthWrite !== wantW) {
        mat.depthWrite = wantW;
        touched++;
      }
      /* the overlay's depth test comes OFF while this mode owns it and goes
         back to whatever the layer shipped when it does not — never to a
         constant `true`, which is what broke the sky */
      const wantDepth = isLit && sys?.overlay ? false : O.depthTest;
      if (wantDepth !== undefined && mat.depthTest !== wantDepth) {
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
