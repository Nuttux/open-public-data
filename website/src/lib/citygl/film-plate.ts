/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/film-plate.ts — WHAT THE READER IS TOLD, AT MILLISECOND t.

   `film.ts` drives the camera and the year and stops when a reader reaches
   for the map. It says nothing, and a silent film is not this film: the whole
   claim of this project is that every sentence on screen is a page somebody
   can open. Daniel, watching the port play: *"i click camera moves but theres
   none of the stuff we had before: the year shown, the box with the text, the
   scans sometimes showing."*

   This file is the second half of the lookup — given a `FilmState`, which
   card is up, which words are up, and which year the plate prints. Pure, and
   CITY-FREE for the same reason the player is: not one string below is
   written here. The words arrive on the script (`FilmPlate`, `FilmCard`) and
   the scanned pages arrive as a payload the script names. What is here is the
   RULES, and every one of them is read out of the published Canvas film
   (`lib/city/film.ts` §pickLine, §THE YEAR ON THE PLATE, §cardAlpha) rather
   than invented for the port.
   ═══════════════════════════════════════════════════════════════════════ */

import { bezier } from "./film";
import type {
  FilmCard,
  FilmPlate,
  FilmScript,
  FilmState,
  FilmTimeline,
} from "./film";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * HOW LONG A STILL CARD TAKES TO GO, ms. `lib/city/film.ts` §CARD_WASH, and
 * its own note is that nothing on screen depends on the number being any
 * particular one: it is a declared motion constant, not a figure out of a
 * file. The opening card washes OUT over its last `CARD_WASH` so the city
 * comes up under the words; the closing card washes IN over its first.
 */
export const CARD_WASH = 700;

/* `cubic-bezier(0,0,.58,1)` — `CURVE.fade` in the published film, and the one
   curve of its seven that this port had no shot able to reach. A card is what
   reaches it. It is built here rather than added to `CURVE` so that the
   engine's curve table stays exactly the four a SHOT can name. */
const FADE = bezier(0, 0, 0.58, 1);

/** Which still card is up, and how opaque it is. `null` = the film proper. */
export interface FilmCardShown {
  readonly which: "title" | "end";
  readonly card: FilmCard;
  /** 0..1, on the FILM's clock and not on wall time — so a seek lands on the
   *  wash the same way playback does, and a card removed from the DOM does
   *  not have to transition out (it never could: `transition:opacity` does
   *  not run on an element that has been unmounted). */
  readonly alpha: number;
}

export function cardAt(
  script: FilmScript,
  tl: FilmTimeline,
  st: FilmState,
): FilmCardShown | null {
  const sg = tl.segs[st.seg];
  if (sg.k === "title") {
    if (!script.titleCard) return null;
    const u = clamp01((st.t - sg.t0 - (sg.ms - CARD_WASH)) / CARD_WASH);
    return { which: "title", card: script.titleCard, alpha: 1 - FADE(u) };
  }
  if (sg.k === "end") {
    if (!script.endCard) return null;
    return {
      which: "end",
      card: script.endCard,
      alpha: FADE(clamp01((st.t - sg.t0) / CARD_WASH)),
    };
  }
  return null;
}

/**
 * THE YEAR THE PLATE PRINTS — which is NOT the year the fabric is drawn at.
 *
 * The two are different questions and conflating them is what put **1987 over
 * the 1989 earthquake** on the published film. The fabric wants the counter,
 * fractionally, every frame: that is what makes a decade of building arrive as
 * a wave. The plate is a CAPTION for a sentence, and a caption that reads 1987
 * over a sentence about an earthquake in 1989 is simply wrong.
 *
 * So the default is the year the shot SETTLES on — the last year any of its
 * own segments reaches — and it is read off the timeline rather than off the
 * shot's own stated `y1`, for the same reason `buildFilm` derives the year
 * line from the acts: two statements of one fact can drift, one cannot.
 *
 * Two shots-worth of exception, both stated by the shot:
 *   · `pinYear` beats everything. For a sentence naming two events a year
 *     apart and no year at all, where no reading of the counter is right.
 *   · `yearRuns` says the CLIMB is the subject, so the plate counts. On the
 *     published film that is the three long runs — the shots whose whole
 *     point is how many years went by.
 *
 * `lib/city/film.ts` §THE YEAR ON THE PLATE.
 */
export function plateYearAt(
  script: FilmScript,
  tl: FilmTimeline,
  st: FilmState,
): number {
  const sg = tl.segs[st.seg];
  /* the two cards sit outside every shot, so there is nothing to caption and
     the counter is the only year there is */
  if (sg.si == null) return Math.floor(st.yearOut);
  const s = script.shots[sg.si];
  if (s.pinYear != null) return s.pinYear;
  if (s.yearRuns) return Math.floor(st.yearOut);
  let settle = -1;
  for (const q of tl.segs) if (q.si === sg.si && q.yTo > settle) settle = q.yTo;
  return settle > 0 ? settle : Math.floor(st.yearOut);
}

/**
 * WHICH WORDS ARE UP.
 *
 * ── AND THEY CUT WHEN THE SHOT CUTS ──────────────────────────────────────
 * This is the one rule in the file worth stating twice, because the published
 * film shipped its opposite and it was the complaint that got it changed. It
 * used to return `null` for the whole of a camera move — *"a move arrives
 * before its line does"* — so every travel put a year on screen and nothing
 * to read. Daniel: *"1942 shot starts with a big pause before any box or text
 * comes — is weird"*. `.parity/s1head.py` costed the class at **21.6 s of a
 * 130 s film with nothing to read**. The words now cut at the same instant
 * the camera does, which is this film's own grammar — cuts and holds, no
 * dissolves — and every shot's reading time GROWS by its travel.
 *
 * `sayFromAct` is what a shot uses when its words must still wait: a shot
 * that opens by running the counter a long way toward the date its sentence
 * is about would otherwise sit that sentence over a year it did not happen
 * in. A move segment carries no act index, so it counts as before all of
 * them and the wait covers the travel too.
 */
export function plateAt(
  script: FilmScript,
  tl: FilmTimeline,
  st: FilmState,
): FilmPlate | null {
  const sg = tl.segs[st.seg];
  /* the cards speak for themselves and the plate is not up under them */
  if (sg.si == null) return null;
  const s = script.shots[sg.si];
  if (!s.plate) return null;
  if (s.sayFromAct != null && (sg.ai ?? -1) < s.sayFromAct) return null;
  return s.plate;
}

/* ── the scanned pages ──────────────────────────────────────────────────────
   The crops are PUBLISHED — one payload holding, per page, its pixel size, the
   OCR-derived boxes to mark, the volume it came out of and the leaf it is. The
   engine holds the shape and never the path: `FilmScript.scansUrl` is the
   city's, and a shot names a number rather than a file. */

/** One mark on a page, as fractions of the image's own width and height — so
 *  the same numbers hold at any rendered size. */
export interface FilmScanMark {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FilmScanPage {
  /** which shot's number this is the page for; `FilmPlate.scan` names it */
  readonly n: number;
  readonly src: string;
  /** the crop's own pixels, so the box can be reserved before the image lands */
  readonly w: number;
  readonly h: number;
  /** the page in the archive that holds it */
  readonly url: string;
  /** the volume as a reader would say it */
  readonly vol: string;
  /** the printed page number, as printed */
  readonly page: string;
  /** the date the page carries, or the section it sits in */
  readonly when: string;
  /** what the page shows, for a reader who cannot see it */
  readonly alt: string;
  readonly hl: readonly FilmScanMark[];
}

export interface FilmScansPayload {
  readonly scans: readonly FilmScanPage[];
}

/** The page beside one shot, or `null` where nobody has cropped one. Most
 *  shots cite a leaf that has no crop, and that is not a fault: the citation
 *  is still a link to the page. */
export function scanFor(
  scans: readonly FilmScanPage[] | null,
  plate: FilmPlate | null,
): FilmScanPage | null {
  if (!scans || !plate || plate.scan == null) return null;
  return scans.find((q) => q.n === plate.scan) ?? null;
}
