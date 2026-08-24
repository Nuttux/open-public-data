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
 * `primary` is the seam the film needs: today it says "explore the city"
 * and hands the reader the map, and when the film lands it becomes its
 * play button without anything else on the page moving. See PAGE.md.
 */

import type { ReactNode } from "react";

export interface CityEntryAction {
  label: string;
  onClick: () => void;
}

export default function CityEntry({
  kicker,
  title,
  lede,
  ledeShort,
  meta,
  primary,
  secondary,
}: {
  kicker: string;
  /** the page's <h1> */
  title: ReactNode;
  lede: string;
  /** the one instruction, for the narrow plate where `lede` is dropped */
  ledeShort?: string;
  /** one line under the button: what is behind it */
  meta?: ReactNode;
  primary: CityEntryAction;
  secondary?: CityEntryAction;
}) {
  return (
    <div className="fx-city-entry">
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
            <svg width="14" height="15" viewBox="0 0 14 15" aria-hidden="true">
              <path d="M0 0l14 7.5L0 15z" />
            </svg>
            {primary.label}
          </button>
          {meta ? <span className="fx-city-entry-meta">{meta}</span> : null}
        </div>

        {secondary ? (
          <button
            type="button"
            className="fx-city-entry-alt"
            onClick={secondary.onClick}
          >
            {secondary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
