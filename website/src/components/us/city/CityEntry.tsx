"use client";

/**
 * THE ENTRY PLATE — the first thing on the page, and the thing that says
 * what a reader can do here.
 *
 * It sits OVER the map rather than above it, so the map still fills the
 * frame, and it goes away the moment the reader takes it up.
 *
 * It lives outside `CityMap` on purpose. `CityMap` is loaded with
 * `ssr: false` — the canvas cannot be server-rendered — and the page's
 * <h1> has to be in the HTML the server sends. So the plate is a plain
 * client component the route renders itself, positioned against
 * `.fx-city-shell`, and `--fx-city-h` is what keeps it the same height as
 * the stage underneath.
 *
 * ── TWO DOORS, NOT ONE ───────────────────────────────────────────────
 * *"When you land on the page it has 'play the century'. It should be two
 * buttons: one is explore the map, the second is watch the century's
 * highlights."*
 *
 * `primary` WAS the seam the film needed — it said "explore the city" and
 * handed the reader the map, and when the film landed it became the play
 * button instead. That was right while the film was arriving and wrong once
 * it had: the map and the film are two different things a reader might have
 * come for, and taking one over for the other left the page offering one.
 *
 * So the row takes two buttons. `primary` is the film, `secondary` is the
 * map, and `alt` — which used to be called `secondary` — is the quiet link
 * under them that opens the method. Both doors say where they go and neither
 * is a guess about which the reader wanted.
 *
 * The second button is styled HERE and not in `fusion.css`, the same idiom
 * `CityFilm` uses for the film's chrome and for the same reason: it is one
 * variant belonging to one component, and `fusion.css` is 17,000 lines that
 * several people are in at once.
 */

import type { ReactNode } from "react";

export interface CityEntryAction {
  label: string;
  onClick: () => void;
  /**
   * ── THE TRIANGLE BELONGS TO WHATEVER PLAYS ──────────────────────────
   * The primary button carried a play glyph unconditionally, from when the
   * primary WAS the film. With the map promoted to the filled button, that
   * put a ▶ on *Explore the map* — a control that starts nothing, wearing
   * the one mark that means something starts. The glyph follows the ACTION
   * now rather than the position.
   */
  plays?: boolean;
}

/* the second door. An outline of `.fx-city-start` rather than a new shape, so
   the two read as a pair and the primary is still visibly the primary.
   ── AND THE ROW WRAPS BEFORE IT SQUEEZES. At 390 px two 48 px buttons and a
   meta line do not fit across, and a flex row that shrinks them would put two
   ellipsised labels side by side. `.fx-city-entry-row` already wraps; this
   makes each button take the full width once it does, so the narrow case is
   two full-width doors stacked, which is the readable one. */
const CSS = `
.fx-city-second{display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 20px;
  border:1px solid var(--ink,#161310);background:transparent;color:var(--ink,#161310);
  font-family:var(--f-disp,Georgia,serif);font-weight:600;font-size:15px;cursor:pointer}
.fx-city-second:hover{background:var(--ink,#161310);color:var(--bg,#fafaf7)}
@media (max-width:820px){
  .fx-city-entry-row .fx-city-start,.fx-city-entry-row .fx-city-second{
    flex:1 1 100%;justify-content:center}
}
`;

export default function CityEntry({
  kicker,
  title,
  lede,
  ledeShort,
  meta,
  primary,
  secondary,
  alt,
}: {
  kicker: string;
  /** the page's <h1> */
  title: ReactNode;
  lede: string;
  /** the one instruction, for the narrow plate where `lede` is dropped */
  ledeShort?: string;
  /** one line under the button: what is behind it */
  meta?: ReactNode;
  /** the door the page is FOR */
  primary: CityEntryAction;
  /** the other door, beside it */
  secondary?: CityEntryAction;
  /** the quiet link under both: the method */
  alt?: CityEntryAction;
}) {
  return (
    <div className="fx-city-entry">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="fx-city-entry-in">
        <div className="fx-city-kicker">{kicker}</div>
        <h1 className="fx-city-title">{title}</h1>
        <p className="fx-city-entry-lede">{lede}</p>
        {/* UNDER 820 px THE LEDE IS DROPPED so the card does not cover the
            city. What went with it was the only sentence that says a block
            can be clicked — the note under the map repeats the half about
            the buildings and not this half. So the instruction stays, on its
            own line, and the description is what the narrow plate loses. */}
        {ledeShort ? (
          <p className="fx-city-entry-lede-short">{ledeShort}</p>
        ) : null}

        <div className="fx-city-entry-row">
          <button type="button" className="fx-city-start" onClick={primary.onClick}>
            {primary.plays ? (
              <svg width="14" height="15" viewBox="0 0 14 15" aria-hidden="true">
                <path d="M0 0l14 7.5L0 15z" />
              </svg>
            ) : null}
            {primary.label}
          </button>
          {secondary ? (
            <button
              type="button"
              className="fx-city-second"
              onClick={secondary.onClick}
            >
              {secondary.plays ? (
                <svg width="13" height="14" viewBox="0 0 14 15" aria-hidden="true">
                  <path d="M0 0l14 7.5L0 15z" />
                </svg>
              ) : null}
              {secondary.label}
            </button>
          ) : null}
        </div>
        {meta ? <p className="fx-city-entry-meta">{meta}</p> : null}

        {alt ? (
          <button type="button" className="fx-city-entry-alt" onClick={alt.onClick}>
            {alt.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
