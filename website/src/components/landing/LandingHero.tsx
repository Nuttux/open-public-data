import type { LandingHeroModel } from "./types";

/**
 * Hero act — the headline over a place-motif SVG masked to the lower-right
 * corner (Paris arrondissements, the SF peninsula). Presentational only: the
 * headline node and the SVG paths come from the city adapter.
 */
export default function LandingHero({ hero }: { hero: LandingHeroModel }) {
  const { bg, headline } = hero;
  return (
    <section className="fx-hero" id="hero">
      {bg && "paths" in bg && (
        <svg className="fx-hero-bg" viewBox={bg.viewBox} aria-hidden="true">
          <g className="arr">
            {bg.paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
      )}
      {bg && "node" in bg && bg.node}
      <div className="fx-wrap">
        <h1>{headline}</h1>
      </div>
    </section>
  );
}
