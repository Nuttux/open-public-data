import type { LandingClosing as ClosingModel } from "./types";

/**
 * Closing act of a city landing — the one commercial surface on an otherwise
 * citizen-facing page. Deliberately quiet: a line, a sentence and a text link,
 * no button chrome or accent fill competing with the section chips above it.
 */
export default function LandingClosing({ closing }: { closing: ClosingModel }) {
  return (
    <section className="fx-closing">
      <div className="fx-wrap">
        <div className="fx-closing-inner">
          <div className="fx-closing-text">
            <h2 className="fx-closing-title">{closing.title}</h2>
            <p className="fx-closing-sub">{closing.text}</p>
          </div>
          <a className="fx-closing-cta" href={closing.href} data-cta="for_cities_closing">
            {closing.cta} <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
