/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/theme-ink.ts — THE SUBJECTS' INK, AND THE TWO NUMBERS A READER
   CAN SEE THE EFFECT OF. Split out of `layers/theme-marks.ts` so that the
   tile page — which draws the same marks in 2D (`tile-marks.ts`) — can share
   them without pulling three.js into a phone's bundle. `theme-marks.ts`
   re-exports them, so nothing that imported from there moved.
   ═══════════════════════════════════════════════════════════════════════ */

/** one ink per subject bit, and it never changes with the view — a subject
 *  is the same colour on the map, in the chip and in the record */
export const THEME_INK = [
  "#a80391", // magenta
  "#e15f0a", // orange
  "#6029c6", // violet
  "#04a322", // green
  "#058dfa", // blue
  "#d60b49", // crimson
  "#006b9a", // deep cyan
  "#00a19d", // teal
] as const;

/** above this many lit blocks a subject is drawn as density, not as dots */
export const CARPET_BLOCKS = 600;

/** the scrub names a year; the layer lights this many years around it */
export const WINDOW_YEARS = 10;

/** a mark's size on screen, CSS px, at every zoom — a record has no size of
 *  its own, so the only size it can honestly have is the legible one */
export const MARK_PX = 14;
