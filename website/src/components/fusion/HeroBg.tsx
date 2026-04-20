import { ARRONDISSEMENT_PATHS } from "./paris-arrondissements";

/**
 * Hero background — Paris arrondissement silhouettes. Masked with a
 * gradient so only the lower-right corner is visible, adding a sense
 * of place without competing with the H1.
 */
export default function HeroBg() {
  return (
    <svg className="fx-hero-bg" viewBox="0 0 200 140" aria-hidden="true">
      <g className="arr">
        {ARRONDISSEMENT_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
