/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/help-row.tsx — WHAT A READER CAN DO, IN WORDS, UNDER THE MAP.

   The published page ends its map with a row of three sentences: the pointer,
   the year rail, the keyboard. `components/us/city/CityMap.tsx` renders it as
   the last child of `.fx-city-wrap`, and the GL port had nothing there at all
   — so a reader arriving on the port was told the map could be dragged,
   zoomed, scrubbed and keyed by nobody.

   ── WHY THIS IS DOM AND NOT A PASS IN `overlay.ts` ───────────────────────
   Every other piece of chrome this port was missing IS a pass in `overlay.ts`,
   because every other piece sits ON the map: the pin, the division scrim, the
   picked block's edge. This one does not. It sits UNDER the frame, outside the
   stage the two canvases fill, in the page's own 1240 px measure — so there is
   no pixel of it a canvas over the stage could paint.

   And it should not be painted anyway. It is the one piece of chrome on this
   page that is pure prose: a screen reader has to be able to read it, a reader
   has to be able to select it, and `fx-city-help-keys` is hidden under 819 px
   by a media query because a keyboard line is written for a keyboard. Text in
   a canvas has none of that.

   ── NO COPY OF ITS OWN ───────────────────────────────────────────────────
   Three strings in, three strings out. The keys stay with the page that knows
   which city it is — `lib/citygl/` may not name one — and this file cannot
   invent a sentence because it has nowhere to invent one from.
   ═══════════════════════════════════════════════════════════════════════ */

export interface CityHelpRowProps {
  /** what the pointer does */
  move: string;
  /**
   * what the year rail does. Optional for the same reason `CityMap` guards it
   * on `transport`: a city drawn with no rail under it must not be told to
   * drag one.
   */
  years?: string;
  /** what the keyboard does — hidden under 819 px by `.fx-city-help-keys` */
  keys: string;
}

/**
 * The published row, class for class.
 *
 * `.fx-wrap` is the page measure and `.fx-city-help` the flex row; both are
 * already in `fusion.css` and neither is styled here, so the port cannot drift
 * from the page it is a port of by way of a second stylesheet.
 */
export function CityHelpRow({ move, years, keys }: CityHelpRowProps) {
  return (
    <div className="fx-wrap">
      <div className="fx-city-help">
        <span>{move}</span>
        {years ? <span>{years}</span> : null}
        <span className="fx-city-help-keys">{keys}</span>
      </div>
    </div>
  );
}
