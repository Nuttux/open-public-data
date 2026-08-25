"use client";

/**
 * THE YEAR SCRUBBER — the rail under the map, and the one control that lets a
 * reader take the century apart by hand.
 *
 * `time.ts` holds the rule the clock runs on and `film.ts` holds the record it
 * is drawn from. This is the control surface: a rail from 1906 to 2025, the
 * years the Board voted marked on it, a play button, and a readout that says
 * what the year on the rail actually means.
 *
 * ── THE FILM AND THE SCRUB DO NOT FIGHT ──────────────────────────────────
 * The film owns the camera AND the clock for as long as it runs; the whole
 * transport row is hidden for the duration by the film's own CSS, and this
 * component stands down — `filmOn` stops the loop and stops it writing a year.
 * When the film exits it hands over the year it stopped on, which is the film's
 * own contract: **the frame it stopped on IS the explorer.** The reader picks
 * the rail up at that year rather than being thrown back to the present.
 *
 * ── WHAT THE YEAR MEANS, AND WHERE IT STOPS MEANING IT ───────────────────
 * A mark on this rail is a year the Board of Supervisors is recorded accepting
 * streets, out of the 27 volumes that have been swept. Three things about that
 * are true and are all said on screen rather than hidden:
 *
 *   - thirteen years inside the span have no ingested volume at all, so the
 *     rail is empty through them. That is the sweep and not the city, and those
 *     years are drawn hollow instead of simply being blank;
 *   - the sweep's last acceptance lands in 1947. After it the rail carries no
 *     bars, and the city on screen still fills in, because the buildings come
 *     from the assessor's roll and not from the Journal. That stretch is drawn
 *     as UNRECORDED rather than left blank — a dashed line rather than a solid
 *     one — on the block panel's own precedent, because eight empty decades
 *     read as eight quiet ones;
 *   - past 1999 the Board's Journal itself runs out. The record does not stop
 *     there: it moves to Legistar, 30,428 matters for 2000–2018, which carries
 *     no location and so cannot be placed on a block yet. The caption at those
 *     years is the same sentence the block panel prints under its own rail.
 *
 * The 1955 tree caveat used to be the fourth of these and is gone with the rule
 * it described: undated street trees are drawn in every year now, like the
 * canopy — `time.ts` §THE UNDATED TREES.
 *
 * ── NO FRAME GOES THROUGH REACT ──────────────────────────────────────────
 * `CityMap`'s own rule. While the rail is playing, the handle and the filled
 * track are written straight onto their nodes, and React state is touched only
 * when the INTEGER year changes — six times a second at 1×, not sixty.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FilmPayload } from "@/lib/city/film";
import {
  SCRUB_MAX,
  SCRUB_MIN,
  applyUndatedTreeGate,
  hasVolume,
  undatedTotal,
} from "@/lib/city/time";
import { useT } from "@/lib/localeContext";
/* THE YEAR THE BOARD'S OWN SERIES RUNS OUT, read from the block panel's file
   rather than typed a second time. The rail and the panel are two views of one
   corpus and they must not disagree about where it stops. */
import { SERIES_LAST_YEAR } from "./block-records";
import { FAM } from "./film-draw";
import type { CityRenderer } from "./renderer";

/** years per second at 1×. The whole span is 119 years, so a run is about
 *  twenty seconds — slow enough to watch the west side arrive. */
const YEARS_PER_SEC = 6;
const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

const SPAN = SCRUB_MAX - SCRUB_MIN;

function pct(y: number): number {
  return ((y - SCRUB_MIN) / SPAN) * 100;
}

function clampYear(y: number): number {
  return Math.max(SCRUB_MIN, Math.min(SCRUB_MAX, y));
}

/** one year the Board is recorded accepting streets in */
interface Vote {
  readonly y: number;
  readonly n: number;
  /** the bar's height in px, on the count's own log */
  readonly h: number;
}

/** one named thing the record dates, with its family's colour */
interface Moment {
  readonly id: string;
  readonly y: number;
  readonly name: string;
  readonly colour: string;
}

interface Rail {
  readonly votes: readonly Vote[];
  readonly moments: readonly Moment[];
  /** cumulative accepted segments, by index into `votes` */
  readonly cum: readonly number[];
  readonly total: number;
  /** the last year the sweep carries an acceptance */
  readonly lastSwept: number;
  /** years inside the span with no ingested volume at all */
  readonly gaps: readonly number[];
}

export interface CityScrubApi {
  /** the year the city is drawn to; `undefined` is the whole roll */
  readonly year: number | undefined;
  /** the row that goes in `CityMap`'s `transport` slot */
  readonly transport: ReactNode;
}

export interface CityScrubOpts {
  /** the film's payload, already fetched by `useCityFilm` — not fetched twice */
  readonly payload: FilmPayload | null;
  /** the film is running: it owns the camera and the clock */
  readonly filmOn: boolean;
  /** the year the film stopped on, or null while it has not stopped */
  readonly handoff: number | null;
  /** the reader took the rail, so the entry plate should get out of the way */
  readonly onEngage?: () => void;
}

export function useCityScrub(
  renderer: CityRenderer | null,
  { payload, filmOn, handoff, onEngage }: CityScrubOpts,
): CityScrubApi {
  const t = useT();
  const [year, setYearState] = useState<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);

  const railRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  /** the float year the loop advances; React only ever sees its floor */
  const floatRef = useRef<number>(SCRUB_MAX);
  const intRef = useRef<number | undefined>(undefined);
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(1);
  const engagedRef = useRef(false);
  const engageRef = useRef(onEngage);
  engageRef.current = onEngage;

  /* ── the rail, out of the record ──────────────────────────────────────
     Nothing here is a shape somebody drew. Every mark is a year the record
     puts something in, and the hollow ones are the years it cannot speak to. */
  const rail = useMemo<Rail | null>(() => {
    if (!payload) return null;
    const counts = new Map<number, number>();
    for (const y of payload.st.y) counts.set(y, (counts.get(y) ?? 0) + 1);
    if (counts.size === 0) return null;
    const max = Math.max(...counts.values());
    const votes: Vote[] = [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, n]) => ({
        y,
        n,
        // log, because 1947's three segments and 1917's 266 both have to be
        // visible on a 16 px rail
        h: 3 + 12 * (Math.log(n + 1) / Math.log(max + 1)),
      }));
    const cum: number[] = [];
    let run = 0;
    for (const v of votes) {
      run += v.n;
      cum.push(run);
    }
    const lastSwept = votes[votes.length - 1].y;
    const gaps: number[] = [];
    for (let y = SCRUB_MIN; y <= lastSwept; y++) if (!hasVolume(y)) gaps.push(y);
    const moments: Moment[] = Object.entries(payload.ents)
      .map(([id, e]) => ({
        id,
        y: e.y,
        name: e.n,
        colour: FAM[e.f] ?? "var(--ink)",
      }))
      .sort((a, b) => a.y - b.y || a.name.localeCompare(b.name));
    return { votes, moments, cum, total: payload.st.n, lastSwept, gaps };
  }, [payload]);

  const decades = useMemo(() => {
    const out: number[] = [];
    for (let y = Math.ceil(SCRUB_MIN / 10) * 10; y <= SCRUB_MAX; y += 10) out.push(y);
    return out;
  }, []);

  /** the handle and the filled track, written straight onto the nodes */
  const paint = useCallback((y: number) => {
    const p = pct(y);
    if (headRef.current) headRef.current.style.left = `${p}%`;
    if (doneRef.current) doneRef.current.style.width = `${p}%`;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastRef.current = 0;
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    stop();
  }, [stop]);

  /** put the city on a year. `commit` is what React and the renderer see. */
  const commit = useCallback(
    (y: number) => {
      const c = clampYear(y);
      floatRef.current = c;
      paint(c);
      const iy = Math.floor(c);
      if (iy !== intRef.current) {
        intRef.current = iy;
        setYearState(iy);
      }
    },
    [paint],
  );

  const engage = useCallback(() => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    engageRef.current?.();
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (!playingRef.current) return;
      const dt = lastRef.current ? Math.min(0.05, (now - lastRef.current) / 1000) : 0.016;
      lastRef.current = now;
      let y = floatRef.current + dt * YEARS_PER_SEC * speedRef.current;
      if (y >= SCRUB_MAX) {
        y = SCRUB_MAX;
        playingRef.current = false;
        setPlaying(false);
      }
      commit(y);
      if (playingRef.current) rafRef.current = requestAnimationFrame(tick);
      else stop();
    },
    [commit, stop],
  );

  const play = useCallback(() => {
    if (!renderer) return;
    engage();
    // at the far end, pressing play starts the century again rather than
    // doing nothing, which is what the button looks like it should do
    if (floatRef.current >= SCRUB_MAX - 0.001) commit(SCRUB_MIN);
    playingRef.current = true;
    setPlaying(true);
    stop();
    rafRef.current = requestAnimationFrame(tick);
  }, [renderer, engage, commit, stop, tick]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  useEffect(() => stop, [stop]);

  /* ── THE FILM TAKES THE CLOCK ─────────────────────────────────────────── */
  useEffect(() => {
    if (filmOn) pause();
  }, [filmOn, pause]);

  /* ── AND HANDS IT BACK ON THE YEAR IT STOPPED ON ──────────────────────── */
  useEffect(() => {
    if (handoff === null) return;
    engagedRef.current = true;
    commit(handoff);
  }, [handoff, commit]);

  /* ── the one place the year reaches the city ──────────────────────────── */
  useEffect(() => {
    if (!renderer || filmOn) return;
    /* ── THE UNDATED TREES, AND THE SEAM IS ONE CALL AGAIN ────────────────
       This used to be `WFLG.undated = year === undefined || year >= 1955`,
       written out here because `time.ts`'s constant was the storage offset
       and not the file's earliest date. That constant was fixed, and then the
       rule itself changed: `time.ts` §THE UNDATED TREES now draws the undated
       cohort in EVERY year, like the canopy beside it, so there is no
       125,234-tree pop across 1955 to scrub through. The decision, the
       measurement and the cost live in that one file; this is one call to it. */
    applyUndatedTreeGate(year);
    renderer.setYear(year);
  }, [renderer, filmOn, year]);

  /* ── drag ─────────────────────────────────────────────────────────────── */
  const yearAt = useCallback((clientX: number): number => {
    const el = railRef.current;
    if (!el) return SCRUB_MAX;
    const r = el.getBoundingClientRect();
    const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return Math.round(SCRUB_MIN + Math.max(0, Math.min(1, f)) * SPAN);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // the shell listens for a press on the canvas to dismiss the plate; a
      // press on the rail is the reader saying the same thing more clearly
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      engage();
      pause();
      commit(yearAt(e.clientX));
    },
    [engage, pause, commit, yearAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      commit(yearAt(e.clientX));
    },
    [commit, yearAt],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  /* ── keyboard ─────────────────────────────────────────────────────────
     `role="slider"`'s own contract, which is what the film's bar and the
     mock's axis both use: arrows a year, Page a decade, Home and End the two
     ends. Every one of them pauses first, because a key is the reader asking
     for a year and not for a run. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const cur = floatRef.current;
      let next: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          next = Math.floor(cur) + 1;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          next = Math.ceil(cur) - 1;
          break;
        case "PageUp":
          next = Math.floor(cur) + 10;
          break;
        case "PageDown":
          next = Math.ceil(cur) - 10;
          break;
        case "Home":
          next = SCRUB_MIN;
          break;
        case "End":
          next = SCRUB_MAX;
          break;
        default:
          return;
      }
      e.preventDefault();
      engage();
      pause();
      commit(next);
    },
    [engage, pause, commit],
  );

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // the head has to be right on the first paint too, and after every re-render
  useEffect(() => {
    paint(floatRef.current);
  });

  const iy = year ?? SCRUB_MAX;
  const transport = rail ? (
    <div className="fx-city-scrub">
      <button
        type="button"
        className="fx-city-scrub-play"
        onClick={toggle}
        aria-label={t(playing ? "us.sf.thecity.scrub.pause" : "us.sf.thecity.scrub.play")}
      >
        {playing ? (
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path d="M0 0h4v14H0zM8 0h4v14H8z" />
          </svg>
        ) : (
          <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden="true">
            <path d="M0 0l13 7-13 7z" />
          </svg>
        )}
      </button>

      <div className="fx-city-scrub-year tnum" aria-hidden="true">
        {iy}
      </div>

      <div
        ref={railRef}
        className="fx-city-scrub-rail"
        role="slider"
        tabIndex={0}
        aria-label={t("us.sf.thecity.scrub.label")}
        aria-valuemin={SCRUB_MIN}
        aria-valuemax={SCRUB_MAX}
        aria-valuenow={iy}
        aria-valuetext={t("us.sf.thecity.scrub.valuetext").replace("{year}", String(iy))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="fx-city-scrub-base" />
        <div ref={doneRef} className="fx-city-scrub-done" />

        {/* ── UNRECORDED, NOT EMPTY ──────────────────────────────────────
            Everything past the last swept acceptance carried no mark at all,
            which is 78 of the rail's 119 years drawn as blank — and blank
            reads as *the city stopped*. It did not: the buildings keep
            arriving across that whole stretch out of the assessor's roll,
            which the reader can watch happening on the map while the rail
            says nothing. So the stretch is HATCHED rather than left bare, on
            `block-records.ts` §SERIES_LAST_YEAR's own precedent — its decade
            rail draws the same decades faint rather than dropping them.

            Inline rather than in `fusion.css` on purpose: the geometry is a
            function of `lastSwept`, which comes out of the payload, and the
            stylesheet is another block's file. It sits in the bar zone above
            the line (the bars grow up from y=20 in a 44 px rail), so it
            touches neither the baseline, the filled track nor the handle. */}
        <div
          className="fx-city-scrub-unrec"
          aria-hidden="true"
          title={t("us.sf.thecity.scrub.past_sweep").replace(
            "{year}",
            String(rail.lastSwept),
          )}
          style={{
            position: "absolute",
            left: `${pct(rail.lastSwept)}%`,
            right: 0,
            top: 5,
            height: 15,
            pointerEvents: "none",
            opacity: 0.2,
            background:
              "repeating-linear-gradient(135deg, var(--muted) 0 1px, transparent 1px 5px)",
          }}
        />

        {/* the years the record accepts streets in, on their own count */}
        {rail.votes.map((v) => (
          <div
            key={`v${v.y}`}
            className="fx-city-scrub-vote"
            style={{ left: `${pct(v.y)}%`, height: `${v.h.toFixed(1)}px` }}
          />
        ))}

        {/* THE SWEEP AND NOT THE CITY: a year with no ingested volume is drawn
            hollow, so a flat stretch cannot be read as a quiet one. */}
        {rail.gaps.map((y) => (
          <div key={`g${y}`} className="fx-city-scrub-gap" style={{ left: `${pct(y)}%` }} />
        ))}

        {/* the named things the record dates, in their family's colour */}
        {rail.moments.map((m) => (
          <div
            key={m.id}
            className="fx-city-scrub-moment"
            style={{ left: `${pct(m.y)}%`, background: m.colour }}
            title={`${m.y} · ${m.name}`}
          />
        ))}

        {decades.map((y) => (
          <div
            key={`d${y}`}
            // every decade is labelled on a wide rail; on a phone there is
            // room for half of them and the other half are hidden in CSS
            className={
              y % 20 === 0 ? "fx-city-scrub-dec" : "fx-city-scrub-dec fx-city-scrub-dec-minor"
            }
            style={{ left: `${pct(y)}%` }}
          >
            {y < 2000 ? y : `’${String(y).slice(2)}`}
          </div>
        ))}

        <div ref={headRef} className="fx-city-scrub-head" />
      </div>

      <div className="fx-city-scrub-speed" role="group" aria-label={t("us.sf.thecity.scrub.speed")}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
            className="tnum"
          >
            {s}×
          </button>
        ))}
      </div>

      <ScrubNote
        rail={rail}
        year={year}
        onSeek={(y) => {
          pause();
          engage();
          commit(y);
        }}
      />
    </div>
  ) : null;

  return { year, transport };
}

/* ── WHAT THE YEAR ON THE RAIL ACTUALLY MEANS ─────────────────────────────
   One line, and it changes with the year rather than saying the same thing
   everywhere. The three cases it has to cover are the three ways this rail can
   mislead a reader who takes it at face value.

   ── AND IT IS THE RAIL'S ONLY LEGEND ────────────────────────────────────
   Read as a reader rather than as its author (`out-m1d/rail-sheet.png`), the
   rail puts FIVE distinct visual codes on screen and explains none of them:
   ochre bars of varying height, grey ticks hanging below the line, coloured
   diamonds, a hatched band, and decade labels. The only key anywhere is a
   `title` attribute on an 8 px diamond — invisible on a touch screen and
   undiscoverable on a mouse.

   The fix is not a new legend block. **The sentences under the rail already
   say what two of the three marks mean** — "…streets the Board voted to accept
   are drawn by 1906" is the ochre bars, and "the last street acceptance …
   lands in 1947" is the hatch. They were simply never attached to the mark
   they describe. So each phrase now carries the mark itself, at the size it is
   drawn on the rail, and the third gets a phrase of its own: the moments,
   which are the most useful thing on the rail and were reachable only by
   hovering.

   `next` stops being a sentence and becomes the control it was describing: it
   names the next dated moment and MOVES THE RAIL THERE. */
/** `useT` returns THE KEY ITSELF when a key is missing, so a bare `t()` would
    print `us.sf.thecity.panel.rail_shelf_end` on the frame. Disposes of itself
    the day the key lands — same helper as `CityBlockPanel`'s. */
function tOr(t: (k: string) => string, k: string, en: string): string {
  const v = t(k);
  return v === k ? en : v;
}

function ScrubNote({
  rail,
  year,
  onSeek,
}: {
  rail: Rail;
  year: number | undefined;
  onSeek: (y: number) => void;
}): ReactNode {
  const t = useT();
  const nf = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const iy = year ?? SCRUB_MAX;

  const next = rail.moments.find((m) => m.y > iy) ?? null;
  const un = undatedTotal();

  /* ── THE RUNNING COUNT IS GONE ──────────────────────────────────────────
     > "basically the what is on this frame stuff can be removed"

     It read *"2,051 of the 2,051 streets the Board voted to accept are drawn
     by 2025"* — a readout of what the renderer had finished drawing, which is
     the "what is on this frame" panel Daniel had deleted, surviving in a
     different element. At the end of the rail it says a number over itself,
     which is the form the deletion was about.

     It was also the ochre bars' only key, and that is a real loss rather than
     a hidden one: `us.sf.thecity.scrub.streets` stays in both dictionaries and
     `.fx-city-key-vote` stays in the stylesheet, so re-attaching the sentence
     to the mark is one line if the legend is wanted back. What the note keeps
     is a CONTROL (the next dated moment, which moves the rail) and a CAVEAT
     (the one the year has earned) — neither of which is a readout. */

  /* ONE caveat, and it is whichever one the year the reader is on has earned.
     Stacking them reads as a disclaimer and gets skipped, which is the one
     outcome that makes the rail dishonest.

     THE TREE CAVEAT IS GONE, and that is the point of it. It read "the earliest
     planting date anywhere in the street tree file is 1955, so the 125,234 it
     does not date are not drawn before then" — a true sentence about a rule
     that no longer exists. `time.ts` §THE UNDATED TREES draws that cohort in
     every year now, so those trees fall into the LAST branch here along with
     the undated centrelines, the `FLAG_NOYEAR` footprints and the undated
     places, which is where the caption had already been counting them. The key
     `us.sf.thecity.scrub.trees` is left in both dictionaries and is now unused;
     see FILM.md §17 for the replacement text proposed for it. */
  let caveat: string | null = null;
  /* which MARK the caveat is about, so the glyph in front of it is the thing
     on the rail the sentence is explaining and not a decoration */
  let caveatMark: "gap" | "hatch" | null = null;
  if (!hasVolume(iy) && iy <= rail.lastSwept) {
    caveatMark = "gap";
    caveat = t("us.sf.thecity.scrub.no_volume").replace("{year}", String(iy));
  } else if (year !== undefined && iy > SERIES_LAST_YEAR) {
    caveatMark = "hatch";
    /* PAST THE SCANNED SERIES: the same sentence the block panel prints under
       its own decade rail, and deliberately the same one rather than a second
       wording for the same fact. The Board's Journal is scanned to 1999; what
       comes after it is UNRECORDED here, not empty — the record moves to
       Legistar, which carries 30,428 Board matters for 2000–2018 in the same
       form, and placing them on blocks needs the address-extraction pass the
       Journal got. `block-records.ts` §SERIES_LAST_YEAR owns the year. */
    caveat = tOr(
      t,
      "us.sf.thecity.panel.rail_shelf_end",
      "The Board's minutes are scanned through {y} — under three different titles, which is why they were once thought to stop in 1999. After 2016 the Clerk still publishes every meeting; no library has bound and paginated them into this series.",
    ).replace("{y}", String(SERIES_LAST_YEAR));
  } else if (year !== undefined && iy > rail.lastSwept) {
    caveatMark = "hatch";
    caveat = t("us.sf.thecity.scrub.past_sweep").replace(
      "{year}",
      String(rail.lastSwept),
    );
  } else if (year !== undefined) {
    /* `everyYear`, NOT `n`. The sentence this key holds ends "…carry no date in
       any published file, and are drawn in every year", which is the narrower
       of the two claims `time.ts` §UNDATED separates: 128,690 things carry no
       date at all — 125,234 of them street trees — and a further 20,571
       footprints carry one that is not their own, a block's p25 estimate rather
       than their own parcel's roll year. Those arrive once, in the wrong year,
       and calling them "drawn in every year" would be a second wrong sentence.
       The copy for the borrowed years belongs with the `FLAG_BLOCKYEAR`
       treatment (DATA-TRUTH §5b), which is landing elsewhere. */
    caveat = t("us.sf.thecity.scrub.undated")
      .replace("{n}", nf.format(un.everyYear))
      .replace("{of}", nf.format(un.of));
  }

  return (
    <p className="fx-city-scrub-note" aria-live="polite">
      {next ? (
        /* THE ARROW IS THE POINT. It named a year and a building and left the
           reader to find an 8 px diamond among a hundred and nineteen years.
           It is a button now: the mark in front of it is the diamond it is
           talking about, in that moment's own family colour, and pressing it
           puts the rail on that year. */
        <button
          type="button"
          className="fx-city-scrub-next"
          onClick={() => onSeek(next.y)}
        >
          <i
            className="fx-city-key fx-city-key-moment"
            style={{ background: next.colour }}
            aria-hidden="true"
          />
          {t("us.sf.thecity.scrub.next")
            .replace("{year}", String(next.y))
            .replace("{what}", next.name)}
          <span className="fx-city-scrub-go" aria-hidden="true">
            →
          </span>
        </button>
      ) : null}
      {caveat ? (
        <span className="fx-city-scrub-caveat">
          {caveatMark ? (
            <i
              className={`fx-city-key fx-city-key-${caveatMark}`}
              aria-hidden="true"
            />
          ) : null}
          {caveat}
        </span>
      ) : null}
    </p>
  );
}
