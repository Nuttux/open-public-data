"use client";

/**
 * THE FILM'S CHROME, OVER THE GL STAGE.
 *
 * `lib/citygl/film.ts` moves a camera and runs a year and does nothing else,
 * and for one build that was the whole film. Daniel, watching it: *"i click
 * camera moves but theres none of the stuff we had before: the year shown,
 * the box with the text, the scans sometimes showing, etc its just really
 * weirdly behaving."* He is right and the reason is worth stating plainly:
 * this film's entire claim is that every sentence in it is a page somebody
 * can open. A camera move with no sentence and no citation is a screensaver.
 *
 * ── WHY THIS IS DOM AND NOT A PASS IN `overlay.ts` ───────────────────────
 * The same call `help-row.tsx` makes, and for the same reasons. The overlay
 * canvas is right for TYPE OVER A MAP — a street name that has to sit at a
 * particular place on the ground, a label that has to be clipped by the
 * frame. It is wrong for PROSE. A reader has to be able to select this copy,
 * a screen reader has to be able to read it, and every citation on the plate
 * is a link that has to be clickable, focusable and openable in a new tab.
 * None of that exists inside a canvas.
 *
 * ── PORTED, NOT DESIGNED ─────────────────────────────────────────────────
 * Every rule and every measurement below is read out of the published film,
 * `components/us/city/CityFilm.tsx`, whose own comments carry the parity runs
 * that produced them. The class names are prefixed `fxgl-` rather than reused
 * so the two stylesheets can never be in one document arguing; the
 * declarations inside them are the published ones.
 *
 * WHAT IS NOT PORTED, stated rather than left to be found:
 * · THE FULL-SCREEN TAKEOVER. The published page pins its shell to the
 *   viewport and gives the stage `100vh` for the duration. Here the stage is
 *   `min(74vh, 720px)` and it is not this component's to seize: a stage that
 *   changes height mid-film re-measures every framing in the script on the
 *   frame the film starts (`ox`/`oy` are fractions of the viewport), which is
 *   a lurch on the first cut to buy a taller picture. What IS ported is the
 *   subtraction that made the takeover worth having — the record margin, the
 *   zoom presets, the year rail and the help row all go quiet for the
 *   duration, and that density is what was called overwhelming.
 * · THE FILM'S OWN MARKS ON THE GLASS. The published chrome also paints
 *   subject names, placemarks and the 1906 loss schedule onto the overlay
 *   canvas. Those are LAYERS, they belong to the renderer, and the port does
 *   not have them yet.
 * · NO REDUCED-MOTION VARIANT here either. The film's own player is where
 *   that belongs; `seek()` and `stateAt()` are public for it.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  cardAt,
  plateAt,
  plateYearAt,
  scanFor,
  type FilmScanPage,
  type FilmScansPayload,
} from "@/lib/citygl/film-plate";
import type {
  FilmCard,
  FilmPlate,
  FilmPlayer,
  FilmScript,
  FilmState,
  FilmStopReason,
} from "@/lib/citygl/film";
import { useT } from "@/lib/localeContext";

/* ── the stylesheet ─────────────────────────────────────────────────────────
   Inline and scoped to this component, the idiom `CityFilm` and `CityEntry`
   already use on this page, and for their stated reason: `fusion.css` is
   17,000 lines that several people are in at once, and this is one variant
   belonging to one component. */
const CSS = `
/* ── EVERYTHING ELSE GOES QUIET FOR NINETY-SEVEN SECONDS ─────────────────
   The published film hides the record margin, the zoom presets, the year rail
   and the help row outright, and that subtraction is most of what makes the
   piece read as a film rather than as a busy page with a camera on it.

   TWO TREATMENTS, and which one a thing gets is decided by whether hiding it
   MOVES anything:
   · the margin and the presets are absolutely positioned OVER the frame, so
     'display:none' costs no layout and is what they get. The margin also has
     to go rather than merely be ignored: it is z-index 8 over a full-width
     stage, and the scanned page sits in exactly the 288 px it occupies.
   · the year rail and the help row are in FLOW under the stage. Hiding them
     would pull the whole page up by their height while the reader is watching
     the frame directly above. They get 'visibility:hidden', which keeps the
     layout, takes them out of the tab order and out of the accessibility
     tree, and — the point — stops the rail printing 2026 beside a plate that
     says 1942. */
html[data-citygl-film] .fx-city-ledger,
html[data-citygl-film] .fx-city-controls,
html[data-citygl-film] .fx-city-entry{display:none!important}
html[data-citygl-film] .fx-city-transport,
html[data-citygl-film] .fx-city-help{visibility:hidden}

/* THE STAGE'S OWN BOX, MEASURED THE WAY THE ENTRY PLATE MEASURES IT.
   This is rendered against '.fx-city-shell' and not inside the stage, for the
   reason 'CityEntry' is: the map is loaded with 'ssr:false' and the page owns
   everything that has to exist before the canvas does. The shell is TALLER
   than the stage — it carries the year rail and the help row underneath — so
   'inset:0' would hang the plate and the progress hairline below the picture.
   '--fx-city-h' is the stage height and the three things that have to agree on
   it already read it from there. */
[data-citygl-film-chrome]{position:absolute;left:0;top:0;right:0;
  height:var(--fx-city-h);min-height:380px;pointer-events:none;z-index:9;
  font-family:var(--f-sans,system-ui);color:#161310}
[data-citygl-film-chrome] *{box-sizing:border-box}

/* ── THE COPY IS ON PAPER, AND THERE IS NO SCRIM ─────────────────────────
   The published film's own answer, and its own measurement of the thing it
   replaced. A gradient ramp behind the narration touched 38.6 % of the frame
   and BLEACHED 23.4 % of it (ΔL > 24), reaching the frame's own middle row —
   on the widest shots that is the entire southern half of the city turned to
   ghost labels on white, to make one sentence legible. Four treatments were
   shot on the real frames; this one washes 9.0 %, and what it washes is a
   rectangle with an edge the reader can see, which is the whole difference
   between a plate and a fog.

   The same paper as the scan's caption, so on a shot that carries both, the
   sentence and the scanned leaf read as two documents of one material. */
.fxgl-film-plate{position:absolute;left:44px;bottom:74px;max-width:min(58ch,52vw);
  background:rgba(250,250,247,.93);border:1px solid rgba(22,19,16,.20);
  box-shadow:0 14px 34px rgba(22,19,16,.16),0 2px 5px rgba(22,19,16,.10);
  padding:17px 22px 19px}
/* THE SHOT'S OWN NAME FOR WHAT IS HAPPENING. This line is a DEPARTURE from
   the published plate, which prints the year and the sentence and no title at
   all — so it is set as a kicker rather than as a heading: quiet, small, and
   subordinate to the year under it, because the sentence is still the shot.
   Not one word of it is written here; 'title' is a field of the same payload
   the sentence comes out of. */
.fxgl-film-kicker{margin:0 0 8px;font-family:var(--f-mono,ui-monospace,monospace);
  font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#5a5348}
.fxgl-film-year{font-family:var(--f-disp,Georgia,serif);font-weight:700;letter-spacing:-.04em;
  line-height:.9;font-size:clamp(40px,4.4vw,62px);font-variant-numeric:tabular-nums;
  margin:0 0 12px}
.fxgl-film-copy{margin:0;font-size:clamp(16px,1.42vw,21px);line-height:1.45;font-weight:500;
  max-width:52ch;text-wrap:balance}
/* THE SOURCES STACK, ONE PER ROW. Published note: as 'inline-flex' siblings
   they are invisible while a shot carries one source and wrap into a
   paragraph the moment a shot carries three — and the rebuild shot's sentence
   is a COMPARISON, so it needs the count it beat and the count it was beaten
   against on the plate at the same time. */
.fxgl-film-srcs{display:flex;flex-direction:column;align-items:flex-start;gap:5px;
  margin-top:14px}
.fxgl-film-cite{display:inline-flex;align-items:baseline;gap:8px;
  font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em;
  text-transform:uppercase;color:#5a5348;text-decoration:none;
  border-bottom:1px solid rgba(90,83,72,.42);padding-bottom:2px;pointer-events:auto}
.fxgl-film-cite:hover{color:#161310;border-bottom-color:#161310}
.fxgl-film-cite b{font-weight:600;letter-spacing:.06em;flex:none}
/* Narrower and quieter than the copy on purpose: the copy is the shot, this
   is the footnote it earned, and the two must not compete for the same read. */
.fxgl-film-note{margin:10px 0 0;max-width:44ch;font-size:12.5px;line-height:1.45;
  color:#5a5348}

/* ── THE SCANNED PAGE, BESIDE THE MAP ───────────────────────────────────
   Sized off the FRAME and not off the image: the crop is ~1,700 px of a
   400-dpi page, so the constraint that matters is how many CSS pixels a
   printed line gets. At a 520 px panel a Journal line lands at about 16 px,
   which is readable; below ~420 px it stops being a page you can read and
   becomes a picture of one, which is the thing this is not.

   THE ONE DIVERGENCE FROM THE PUBLISHED RULE is the height. There it is
   'max-height:74vh' against a stage that IS the viewport; here the stage is
   'min(74vh,720px)' and 74vh of a tall window would hang out of the bottom of
   it. So the figure is pinned to the stage's own top and bottom and centres
   what fits — which lands on the published behaviour anyway, because that
   rule clips a tall page too. */
.fxgl-film-scan{position:absolute;right:40px;top:16px;bottom:16px;
  width:min(36vw,530px);margin:0;pointer-events:auto;
  display:flex;flex-direction:column;justify-content:center}
.fxgl-film-scan-page{position:relative;width:100%;min-height:0;flex:0 1 auto;
  overflow:hidden;background:#f4efe2;border:1px solid rgba(22,19,16,.28);
  box-shadow:0 18px 44px rgba(22,19,16,.22),0 2px 6px rgba(22,19,16,.14)}
.fxgl-film-scan-page canvas{display:block;width:100%;height:auto}
/* A HIGHLIGHTER, NOT A REDACTION AND NOT A BOX. CSS multiply lays a warm wash
   over the paper the way a marker does, so the type stays black and stays
   readable THROUGH the mark — a solid box or an outline would either hide the
   words or turn the page into a diagram. Warm ochre and not the decision
   family's blue: a saturated blue on a 1942 page reads as an interface, not
   as a mark on paper. */
.fxgl-film-scan-page i{position:absolute;display:block;
  background:rgba(240,176,32,.46);mix-blend-mode:multiply;
  box-shadow:0 0 0 2px rgba(240,176,32,.20)}
/* ON A PLAQUE, BECAUSE IT LANDS ON THE MAP. Grey mono over a city of roofs
   and street trees is unreadable at any size. It gets the same paper the page
   is on, so it reads as part of the document. */
.fxgl-film-scan figcaption{flex:none;font-family:var(--f-mono,ui-monospace,monospace);
  font-size:10.5px;letter-spacing:.045em;text-transform:uppercase;color:#5a5348;
  text-align:right;background:rgba(250,250,247,.94);
  border:1px solid rgba(22,19,16,.28);border-top:0;padding:7px 10px}
.fxgl-film-scan figcaption a{color:inherit;text-decoration:none;
  border-bottom:1px solid rgba(90,83,72,.42)}
.fxgl-film-scan figcaption a:hover{color:#161310;border-bottom-color:#161310}

/* ── THE WAY OUT ────────────────────────────────────────────────────────
   A ninety-seven-second piece a reader cannot leave is a trap, so there is
   always an exit and it is always in the same corner.

   It fades in on hover of the frame, which is the published treatment, plus
   one addition: on a device with no hover there is no gesture that can reveal
   it, so it is simply up. That is not a style preference, it is the
   difference between an exit and a decorative button. */
.fxgl-film-ctl{position:absolute;right:36px;bottom:70px;display:flex;gap:10px;
  align-items:center;pointer-events:auto;opacity:0;transition:opacity 200ms}
[data-citygl-film-chrome]:hover .fxgl-film-ctl,
[data-citygl-film-chrome][data-paused="1"] .fxgl-film-ctl{opacity:1}
@media (hover:none){.fxgl-film-ctl{opacity:1}}
.fxgl-film-ctl button{font-family:var(--f-mono,ui-monospace,monospace);font-size:11px;
  letter-spacing:.06em;text-transform:uppercase;padding:8px 14px;cursor:pointer;
  border:1px solid rgba(22,19,16,.34);background:rgba(250,250,247,.94);color:#161310}
.fxgl-film-ctl button.pri{background:#161310;color:#faf9f5;border-color:#161310}
/* a hairline, not a timeline. Eleven notches, no labels and no numbers: it
   says how far through you are and nothing else. A scrub bar with labels IS
   the timeline, and the timeline is what we are hiding. */
.fxgl-film-bar{position:absolute;left:0;right:0;bottom:0;height:22px;pointer-events:auto;
  cursor:pointer}
.fxgl-film-bar i{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(22,19,16,.16)}
.fxgl-film-bar u{position:absolute;left:0;bottom:0;height:2px;background:#161310}
.fxgl-film-bar s{position:absolute;bottom:0;width:1px;height:6px;background:rgba(22,19,16,.3)}
.fxgl-film-bar:hover i,.fxgl-film-bar:hover u{height:5px}

/* .78, not .9: at .9 the opening card is a white page with a ghost of a city
   behind it, which throws away the three seconds it has to say what you are
   about to look at. At .78 the city is legible under the words. */
.fxgl-film-card{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;gap:14px;padding:0 24px;
  background:radial-gradient(ellipse at 50% 45%,rgba(250,248,242,.82) 0%,
    rgba(250,248,242,.58) 38%,rgba(236,230,216,.30) 100%);
  box-shadow:inset 0 0 220px rgba(52,38,22,.26)}
.fxgl-film-card h2,.fxgl-film-card p{text-shadow:0 0 18px rgba(250,248,242,.9),0 0 6px rgba(250,248,242,.9)}
.fxgl-film-card h2{margin:0;font-family:var(--f-disp,Georgia,serif);font-weight:700;
  font-size:clamp(28px,3.4vw,46px);letter-spacing:-.03em;max-width:22ch}
.fxgl-film-card p{margin:0;font-size:15.5px;color:#5a5348;max-width:56ch;line-height:1.5}
/* quieter than the sub and set apart from it: the sub says what the film is
   and this says what it is made of */
.fxgl-film-card .fxgl-film-card-note{margin-top:6px;font-size:13px;
  font-family:var(--f-mono,ui-monospace,monospace);letter-spacing:.02em;
  color:#6b6355;max-width:52ch}

/* the plate reaches 52ch and the page takes the right 38 %; below this the two
   would meet, so the page moves to the top half and the copy keeps the
   bottom. It is still the page and it is still readable. */
@media (max-width:1180px){
  /* MEASURED at 1100 x 800: the published rule is 'max-height:34vh' on the
     page against a stage that IS the viewport. Here the stage is 592 px, and
     34vh of page plus a caption ran the figure to y=402 with the plate's own
     top edge at y=388 — the caption ended up UNDER the plate. So the figure
     is capped as a fraction of the STAGE rather than of the window, and the
     cap covers the caption too, because the caption is the citation and it is
     the half that must not be the half that gets clipped. */
  .fxgl-film-scan{right:20px;left:20px;top:14px;bottom:auto;width:auto;
    max-height:42%}
  .fxgl-film-scan figcaption{text-align:left}
}
@media (max-width:820px){
  /* the plate takes the full width here, so the page above it gets less */
  .fxgl-film-scan{max-height:34%}
  /* 78 and not the published 60: the plate is full width here, so the two
     controls sit ON it rather than beside it. MEASURED at 430 x 900 — a 40 px
     button at 'bottom:26' reaches y=66 and the plate's own edge was at 60. */
  .fxgl-film-plate{left:20px;right:20px;bottom:78px;max-width:none}
  .fxgl-film-ctl{right:20px;bottom:26px}
  /* target size, WCAG 2.2 SC 2.5.8: the hairline stays a hairline and only
     the region that takes the touch grows */
  .fxgl-film-bar{height:30px}
  .fxgl-film-cite{padding-bottom:8px;padding-top:8px}
  .fxgl-film-ctl button{padding:12px 16px}
}
`;

/**
 * WHAT CHANGES A FEW TIMES A MINUTE, as opposed to sixty times a second.
 *
 * `CityMap`'s rule, which this port follows for the same profiled reason: the
 * frame loop touches React state only when something DISCRETE changes. The
 * published film's loop once called `setState` on every frame and a CDP
 * profile of a single 2.4 s travel showed ~130 ms of `jsxDEV` inside it — a
 * whole chrome re-render, style diff and recalc per frame, to move two
 * numbers. Exactly two things here genuinely change every frame: the width of
 * the progress hairline and the opacity of a card's wash. Both are one style
 * on one node, and both are written straight onto their node.
 */
interface Shown {
  readonly card: FilmCard | null;
  readonly which: "title" | "end" | null;
  readonly year: number;
  readonly plate: FilmPlate | null;
  /** each shot's start as a fraction of the whole, for the hairline's notches */
  readonly marks: readonly number[];
}

const BLANK: Shown = { card: null, which: null, year: 0, plate: null, marks: [] };

/** the one attribute the stylesheet above hangs the page's subtraction off */
const ATTR = "data-citygl-film";

export interface CityGLFilmChromeProps {
  /** the city's own shot list, off its descriptor. No script, no chrome. */
  script?: FilmScript;
  /**
   * THE PLAYER, once the map has built one. `null` until then — it is created
   * inside the map's one big async effect, after a manifest and eleven layers
   * have been fetched, so for the first second or so of the page there is
   * nothing to watch and nothing to show.
   */
  film: FilmPlayer | null;
}

export default function CityGLFilmChrome({ script, film }: CityGLFilmChromeProps) {
  const t = useT();
  const [on, setOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [scans, setScans] = useState<readonly FilmScanPage[] | null>(null);
  const [shown, setShown] = useState<Shown>(BLANK);
  /* the crops that are decoded and in hand, by src; see §THE PAGES ARE
     FETCHED OFF THE DOM. The decoded element itself is kept, not just a flag,
     because the plate paints FROM it. */
  const [held, setHeld] = useState<ReadonlyMap<string, HTMLImageElement>>(
    () => new Map(),
  );

  const barRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ progress: 0, cardAlpha: 0 });
  /** set only between OUR pause and OUR resume, so a stop can be told apart
   *  from a reader reaching for the map — which is the same call */
  const pausing = useRef(false);
  /** the discrete state last committed, as one string */
  const key = useRef("");
  const scriptRef = useRef(script);
  scriptRef.current = script;
  /* the same value the prop carries, readable from the callbacks below
     without making every one of them change identity when it lands */
  const filmRef = useRef(film);
  filmRef.current = film;

  /**
   * THE FILM IS ON, AND THE PAGE AROUND IT KNOWS — WRITTEN HERE, NOT IN AN
   * EFFECT.
   *
   * MEASURED, at 1600 x 1000 against the dev server: as a passive
   * `useEffect([on])` this landed **~500 ms late on a replay** — twice, and
   * within 3 s both times. React commits the render but flushes passive
   * effects after paint, and a `play()` that starts mid-film re-gates the
   * whole city's geometry on that same frame, so the flush queues behind the
   * engine. What the reader saw was the plate arriving with the record margin
   * still standing beside it and the year rail still reading 2026 under it.
   *
   * It is one attribute on one node and it is not state anything renders
   * from, so it goes where the decision is made — the same idiom the progress
   * hairline and the card's wash already use in this file.
   */
  const show = useCallback((v: boolean): void => {
    setOn(v);
    if (v) document.documentElement.setAttribute(ATTR, "");
    else document.documentElement.removeAttribute(ATTR);
  }, []);

  const writeLive = useCallback((): void => {
    const v = live.current;
    if (barRef.current) barRef.current.style.width = `${v.progress * 100}%`;
    if (cardRef.current) cardRef.current.style.opacity = String(v.cardAlpha);
  }, []);

  /* NO DEPENDENCY ARRAY: after EVERY render, before paint. The two continuous
     values are not in the tree, so this is the only thing that puts them back
     when React rebuilds these nodes — a pause, a new line of copy, a card
     mounting. Without it the hairline would show its width at the last
     discrete change instead of now. */
  useLayoutEffect(writeLive);

  const onFrame = useCallback(
    (st: FilmState): void => {
      const p = filmRef.current;
      const sc = scriptRef.current;
      if (!p || !sc) return;
      const tl = p.timeline;
      const card = cardAt(sc, tl, st);
      const plate = plateAt(sc, tl, st);
      const year = plateYearAt(sc, tl, st);

      live.current.progress = tl.total > 0 ? st.t / tl.total : 0;
      live.current.cardAlpha = card ? card.alpha : 0;
      writeLive();

      /* the plate is identified by WHICH SHOT it belongs to and not by the
         object, because a shot's plate is a constant on the script and
         comparing it by identity would never see a change within one shot —
         and by its title as well, so a script that later turns a line over
         mid-shot is not silently ignored here */
      const k = `${card?.which ?? "-"}|${year}|${plate ? st.si : "-"}|${plate?.title ?? ""}`;
      if (k === key.current) return;
      key.current = k;
      setShown({
        card: card?.card ?? null,
        which: card?.which ?? null,
        year,
        plate,
        marks: p.total > 0 ? tl.shotT0.map((x) => x / p.total) : [],
      });
    },
    [writeLive],
  );

  const watcher = useMemo(
    () => ({
      onPlay: (st: FilmState): void => {
        pausing.current = false;
        show(true);
        setPaused(false);
        setAtEnd(false);
        onFrame(st);
      },
      onState: onFrame,
      onStop: (reason: FilmStopReason, st: FilmState): void => {
        /* land the frame it stopped on before deciding anything: an interrupt
           two thirds of the way through a shot must not leave the previous
           shot's words on screen for the instant before they are taken down */
        onFrame(st);
        /* THE END CARD IS NOT AN EXIT. The film stops on the last millisecond
           of it, and that card is the one that tells the reader the map is
           the point — so the chrome stays up with a Replay on it and the
           reader leaves when they choose. */
        if (reason === "end") {
          setAtEnd(true);
          setPaused(true);
          return;
        }
        if (pausing.current) {
          setPaused(true);
          return;
        }
        /* an interrupt, our own exit, or the mount tearing the player down —
           in all three the reader is being handed the map */
        show(false);
      },
    }),
    [onFrame, show],
  );

  /* ── ONE SUBSCRIPTION, FOR AS LONG AS THIS PLAYER LIVES ─────────────────
     `watch` exists so that chrome can attach to a film it did not build. The
     map builds the player, the page holds it, and this is the seam between
     them; when the map disposes and rebuilds one, the prop changes identity
     and the effect re-runs, so there is no way to be left watching a dead
     film. */
  useEffect(() => {
    if (!film || !script) return;
    return film.watch(watcher);
  }, [film, script, watcher]);

  /* ── THE PAGES ──────────────────────────────────────────────────────────
     4.8 kB of JSON on mount; the pictures themselves are only requested when
     a shot that has one is on screen. A failure is silent ON PURPOSE: a
     missing crop costs the reader a picture of a page, and the citation under
     the sentence still opens the same leaf in the archive. A film that
     refused to play because a JPEG 404'd would be the worse failure. */
  useEffect(() => {
    const url = script?.scansUrl;
    if (!url) return;
    let dead = false;
    void (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const j = (await r.json()) as FilmScansPayload;
        if (!dead && Array.isArray(j.scans)) setScans(j.scans);
      } catch {
        /* see above: the film plays without them */
      }
    })();
    return () => {
      dead = true;
    };
  }, [script?.scansUrl]);

  /* ── AND THE PAGES ARE FETCHED OFF THE DOM, WHICH IS NOT FUSSINESS ──────
     The obvious thing is to let the <img> in the plate fetch its own src, and
     it does not work here: the plate rendered EMPTY — frame, paper and
     highlighter marks all painted, the page itself never arriving. The
     element sat at `complete:false`, `naturalWidth:0`, `currentSrc:""` for as
     long as the film ran, and NO network request was ever issued for it.

     Measured rather than guessed, and the shape of it is specific. The same
     URL through `new Image()` fetched instantly. An identical <img> appended
     to <body> at the same instant loaded. Walking the ancestors, the boundary
     was exactly the <figure>: inside it blocked, one level out fine, and
     moving that same <figure> to <body> unblocked it. Then the tell — across
     runs, the FIRST image inserted into that subtree was always blocked and
     every one after it loaded, whatever attributes it carried. So it is not
     `loading`, not priority and not the URL: Chrome defers an image it has
     not yet decided is visible, this absolutely-positioned layer over a
     canvas loses that decision, and the film — which never scrolls and never
     dirties this subtree — gives it no occasion to revisit it. The image
     waits on an event that cannot happen.

     `new Image()` is outside all of that, and it is measured to work. Four
     crops, about 1.3 MB, requested once when the manifest lands and long
     before the first one is due on screen. The plate then renders from cache.

     A failure stays silent, for the reason the fetch above gives: the reader
     loses a picture of a page and keeps the citation that opens the same
     leaf. What they must never get is the empty frame. */
  useEffect(() => {
    if (!scans?.length) return;
    let dead = false;
    for (const s of scans) {
      const im = new Image();
      im.src = s.src;
      void im
        .decode()
        .then(() => {
          if (dead) return;
          setHeld((prev) => {
            if (prev.has(s.src)) return prev;
            const next = new Map(prev);
            next.set(s.src, im);
            return next;
          });
        })
        .catch(() => {
          /* see above: the film plays without this one */
        });
    }
    return () => {
      dead = true;
    };
  }, [scans]);

  /* nothing left behind if this unmounts mid-film — a route change while the
     film is running must not leave the page's own chrome hidden for ever */
  useEffect(
    () => () => document.documentElement.removeAttribute(ATTR),
    [],
  );

  const toggle = useCallback((): void => {
    const p = filmRef.current;
    if (!p) return;
    if (p.running) {
      pausing.current = true;
      /* PAUSE IS A STOP. The player has one clock and no paused state, and it
         does not need one: `play()` with no argument resumes from exactly the
         millisecond it left off, and a film that has run to the end starts
         again from the top. */
      p.stop("stop");
    } else {
      pausing.current = false;
      p.play();
    }
  }, []);

  const exit = useCallback((): void => {
    const p = filmRef.current;
    pausing.current = false;
    if (p?.running) p.stop("stop");
    /* the camera is already exactly where the film left it, so leaving paints
       nothing new — and the mount's own `onStop` has handed the year the film
       stopped on to the rail, which is what makes the frame you left on the
       map you get */
    show(false);
  }, [show]);

  const seek = useCallback(
    (f: number): void => {
      const p = filmRef.current;
      if (!p) return;
      p.seek(Math.max(0, Math.min(1, f)) * p.total);
    },
    [],
  );

  /* ── THE KEYBOARD ───────────────────────────────────────────────────────
     Escape leaves, space pauses, the arrows step a whole shot. Ported from
     the published film, with one addition it needs here and did not there:
     `stopPropagation`. The player binds its own `keydown` on the canvas in
     the capture phase precisely so that ANY key hands the map back — so
     without this, space would pause the film and stop it in the same gesture. */
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent): void => {
      const p = filmRef.current;
      if (!p) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exit();
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        const t0 = p.timeline.shotT0;
        let cur = 0;
        for (let i = 0; i < t0.length; i++) if (p.t >= t0[i]) cur = i;
        const j = Math.max(0, Math.min(t0.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
        p.seek(t0[j]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [on, exit, toggle]);

  /* THE PAGE ARRIVES ON THE SAME CUT THE WORDS DO, and it is tied to the
     WORDS rather than to the segment so that a shot which holds its copy back
     holds its page back with it: a sentence and the document it is drawn from
     can never arrive apart.

     ── AND IT STAYS UP WHEN THE READER PAUSES ──────────────────────────────
     The published film takes it down on a pause and that is the one rule here
     NOT ported. It was written when a pause swapped the plate out for a panel
     headed "what is on this frame", which needed the room; that panel was
     removed and its own note now reads *"the plate is the only thing that
     speaks, paused or running."* The same sentence settles this: a reader who
     pauses is a reader who has stopped to READ, and the scanned page is the
     thing they stopped for. Taking it away on the press would read as a
     fault. It still goes under a still card, because a card is the whole
     frame. */
  const due = !shown.card ? scanFor(scans, shown.plate) : null;
  /* the whole figure waits on the bytes, not just the picture inside it: an
     empty sheet of paper with two highlighter marks floating on it is worse
     than no plate at all */
  const page = due ? held.get(due.src) ?? null : null;
  const scan = page ? due : null;

  /* ── AND THE PAINT ITSELF ───────────────────────────────────────────────
     A layout effect and not a plain one, so the page is on the canvas in the
     same frame the plate appears in and the reader never sees the paper blank
     for a beat. `page` is already decoded — the preload above awaited
     `decode()` — so this is a copy, not a load, and it cannot fail late. */
  useLayoutEffect(() => {
    const c = pageRef.current;
    if (!c || !page) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(page, 0, 0, c.width, c.height);
  }, [page, on]);

  if (!on) return null;

  const plate = shown.plate;

  return (
    <div data-citygl-film-chrome="" data-paused={paused ? "1" : "0"}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {scan ? (
        <figure className="fxgl-film-scan">
          <div
            className="fxgl-film-scan-page"
            /* the crop's own pixels, so the box is the right shape before the
               image lands and the caption does not jump when it does */
            style={{ aspectRatio: `${scan.w} / ${scan.h}` }}
          >
            {/* ── AND IT IS PAINTED, NOT LOADED ──────────────────────────
                A <canvas> where the obvious thing is an <img>, and the reason
                is measured rather than stylistic: an <img> in this subtree
                never fetches. See §AND THE PAGES ARE FETCHED OFF THE DOM for
                the hunt; the last two probes are what chose this element. A
                `data:` URI in the very same container loads INSTANTLY, so the
                element's own load algorithm runs fine here — it is
                specifically the network fetch for an in-DOM image that never
                gets scheduled, and it is not a cache miss either: the bytes
                are already decoded in hand by then and the element still sits
                at `complete:false`. Drawing those same bytes to a canvas in
                the same container paints, first try, every try.

                So the picture arrives the way everything else on this page
                does — as pixels we put there. The backing store is the crop's
                own pixel count, so the paper is as sharp as the scan is, and
                CSS scales it into the plate exactly as the <img> did. */}
            <canvas
              ref={pageRef}
              width={scan.w}
              height={scan.h}
              role="img"
              aria-label={scan.alt}
            />
            {scan.hl.map((h, i) => (
              <i
                key={`${h.x}:${h.y}:${i}`}
                style={{
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  width: `${h.w * 100}%`,
                  height: `${h.h * 100}%`,
                }}
              />
            ))}
          </div>
          <figcaption>
            <a href={scan.url} target="_blank" rel="noopener noreferrer">
              {scan.vol} · p. {scan.page} · {scan.when}
            </a>
          </figcaption>
        </figure>
      ) : null}

      {shown.card ? (
        /* THE WASH IS ON THE FILM'S CLOCK. `transition:opacity` never ran on
           the published one — an element removed from the DOM does not
           transition out — and a wall-clock transition could not be scrubbed
           to anyway. `film-plate.ts` §cardAt. */
        <div ref={cardRef} className="fxgl-film-card">
          <h2>{shown.card.head}</h2>
          <p>{shown.card.sub}</p>
          {/* THE OPENING CARD'S THIRD LINE, and only the opening card has one:
              where every building, street and decision in the next ninety
              seconds came from. It is not narration and it is not a quotation. */}
          {shown.card.note ? (
            <p className="fxgl-film-card-note">{shown.card.note}</p>
          ) : null}
        </div>
      ) : null}

      {/* THE PLATE IS THE ONLY THING THAT SPEAKS, PAUSED OR RUNNING. The
          published film once swapped it out on pause for a panel headed "what
          is on this frame", which Daniel had removed — *"that white
          notification frame with x streets appears sometimes and is weird —
          remove"* — and everything a reader actually wanted off it is on this
          plate already. */}
      {!shown.card ? (
        <div className="fxgl-film-plate">
          {plate?.title ? <p className="fxgl-film-kicker">{plate.title}</p> : null}
          <div className="fxgl-film-year tnum">{shown.year}</div>
          {plate?.copy ? <p className="fxgl-film-copy">{plate.copy}</p> : null}
          <div className="fxgl-film-srcs">
            {plate?.cite ? (
              <a
                className="fxgl-film-cite"
                href={plate.cite.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <b>{t("us.sf.thecity.film.scan")}</b>{" "}
                <span>
                  {plate.cite.vol} · {t("us.sf.thecity.film.leaf")} {plate.cite.leaf}
                </span>
              </a>
            ) : null}
            {(plate?.also ?? []).map((a) => (
              <a
                key={a.u + a.t}
                className="fxgl-film-cite"
                href={a.u}
                target="_blank"
                rel="noopener noreferrer"
              >
                <b>
                  {t(a.k === "scan" ? "us.sf.thecity.film.scan" : "us.sf.thecity.film.data")}
                </b>{" "}
                <span>{a.t}</span>
              </a>
            ))}
          </div>
          {/* THE CAVEAT A DERIVED FIGURE HAS TO CARRY, and it is deliberately
              NOT in the sentence. Saying so in the narration would make the
              line an essay; saying it nowhere would make the line a claim the
              sources do not carry. */}
          {plate?.note ? <p className="fxgl-film-note">{plate.note}</p> : null}
        </div>
      ) : null}

      <div className="fxgl-film-ctl">
        <button type="button" onClick={toggle}>
          {atEnd
            ? t("us.sf.thecity.film.replay")
            : paused
              ? t("us.sf.thecity.film.resume")
              : t("us.sf.thecity.film.pause")}
        </button>
        <button type="button" className="pri" onClick={exit}>
          {t("us.sf.thecity.film.explore")}
        </button>
      </div>

      <div
        className="fxgl-film-bar"
        role="slider"
        tabIndex={0}
        aria-label={t("us.sf.thecity.film.scrub")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(live.current.progress * 100)}
        onPointerDown={(e) => {
          /* the film's own player interrupts on any pointer that reaches the
             canvas; this one is the film's control, not the map's */
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - r.left) / r.width);
        }}
      >
        <i />
        <u ref={barRef} />
        {shown.marks.map((x) => (
          <s key={x} style={{ left: `${x * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   THE DOOR — what the entry plate needs to offer the film.
   ═══════════════════════════════════════════════════════════════════════ */

export interface FilmDoor {
  /** the player exists and the city is drawn: pressing it will play */
  readonly ready: boolean;
  /** `Watch`, or `Resume` for a reader who left part-way through */
  readonly resumeLabel: "watch" | "resume";
  /** how long the piece runs, as the reader is told it */
  readonly runtimeLabel: string;
  /** play from the top, or from wherever the reader walked out */
  play(): void;
}

/**
 * THE FILM, AS THE PAGE'S FRONT DOOR.
 *
 * Daniel: *"no play the film on arrival."* The GL page's entry plate offered
 * the map and the method and never the film, so the one thing the page was
 * built to show had to be found in a control bar under the stage.
 *
 * ── AND IT DOES NOT TAKE THE MAP'S DOOR AWAY ─────────────────────────────
 * The published plate's own note, which is the part worth keeping: *"The film
 * used to TAKE OVER this button the moment it could play, so a reader who
 * came for the map was offered the film and nothing else. They are two
 * different things to want."* So the film becomes the PRIMARY and the map
 * moves to a second button beside it — and only once the film can actually
 * play, because before that the primary IS the map's door and two of it would
 * be a bug rather than a choice.
 *
 * ── WHY A HOOK AND NOT A PROP ────────────────────────────────────────────
 * The three things the plate needs are all facts about the player, and the
 * player is built inside the map's own effect. `resumeLabel` in particular
 * changes on a stop, which is an event nobody upstream is watching — so the
 * plate subscribes for itself.
 */
export function useFilmDoor(film: FilmPlayer | null): FilmDoor {
  const t = useT();
  /** the millisecond the reader last walked out on; 0 = they have not */
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!film) return;
    return film.watch({
      onPlay: () => setLeft(0),
      onStop: (reason, st) => setLeft(reason === "end" ? 0 : st.t),
    });
  }, [film]);

  const total = film?.total ?? 0;
  const mins = Math.floor(total / 60000);
  const secs = Math.round((total % 60000) / 1000);

  return {
    ready: !!film,
    /* the published thresholds: under 1.2 s in is a reader who pressed play
       and changed their mind, not a reader with a film to come back to, and
       the last 200 ms is the end card */
    resumeLabel: left > 1200 && left < total - 200 ? "resume" : "watch",
    runtimeLabel: t("us.sf.thecity.film.runtime")
      .replace("{min}", String(mins))
      .replace("{sec}", String(secs).padStart(2, "0")),
    play: () => film?.play(),
  };
}
