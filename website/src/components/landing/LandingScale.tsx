import type { ScaleAct } from "./types";

/**
 * Scale act — the signature per-resident number (Paris €462/mo · SF $1,606/mo).
 * The number IS the headline, so there is no H2. `unitLeading` places the
 * currency mark before ($1,606) or after (462 €) the magnitude.
 */
export default function LandingScale({ scale }: { scale: ScaleAct }) {
  const num = <span className="fx-echelle-num">{scale.value}</span>;
  const unit = <span className="fx-echelle-u">{scale.unit}</span>;
  return (
    <section className="fx-echelle" id="echelle">
      <div className="fx-wrap">
        <p className="fx-echelle-big tnum">
          {scale.unitLeading ? (
            <>
              {unit}
              {num}
            </>
          ) : (
            <>
              {num}
              {unit}
            </>
          )}
          <span className="fx-echelle-per">{scale.per}</span>
        </p>
        <p className="fx-echelle-delta">{scale.delta}</p>
      </div>
    </section>
  );
}
