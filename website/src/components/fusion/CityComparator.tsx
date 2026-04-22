"use client";

import type { CityDebtSnapshot } from "@/lib/fusion-data";
import { fmtDec, fmtInt } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

const THRESHOLD = 12; // seuil d'alerte légal

type Props = {
  cities: CityDebtSnapshot[];
  highlightSlug?: string;
};

export default function CityComparator({ cities, highlightSlug = "paris" }: Props) {
  const t = useT();
  if (!cities.length) return null;

  // Ordre décroissant par capacité de désendettement (le "pire" en haut)
  const sorted = cities
    .slice()
    .sort((a, b) => b.capacite_desendettement - a.capacite_desendettement);
  const max = Math.max(
    ...sorted.map((c) => c.capacite_desendettement),
    THRESHOLD + 2,
  );

  return (
    <div className="fx-city-compare">
      <div className="fx-city-compare-head">
        <div className="fx-city-compare-title">
          {t("fx.det.compare.title")}
        </div>
        <div className="fx-city-compare-threshold">
          <span className="dot" /> {t("fx.det.compare.threshold_label")} {THRESHOLD} {t("fx.det.s02.kpi.ans")}
        </div>
      </div>
      <div className="fx-city-compare-list">
        {sorted.map((c) => {
          const pct = (c.capacite_desendettement / max) * 100;
          const threshPct = (THRESHOLD / max) * 100;
          const isHighlight = c.slug === highlightSlug;
          const overThreshold = c.capacite_desendettement >= THRESHOLD;
          return (
            <div
              key={c.slug}
              className={`fx-city-compare-row ${isHighlight ? "highlight" : ""}`}
            >
              <span className="fx-city-compare-name">{c.name}</span>
              <span className="fx-city-compare-bar">
                <span
                  className={`fill ${overThreshold ? "over" : ""}`}
                  style={{ width: `${pct}%` }}
                />
                <span
                  className="thresh"
                  style={{ left: `${threshPct}%` }}
                  aria-hidden
                />
              </span>
              <span className="fx-city-compare-val tnum">
                {fmtDec(c.capacite_desendettement, 1)}
                <span className="u"> {t("fx.det.s02.kpi.ans")}</span>
              </span>
              <span className="fx-city-compare-meta muted tnum">
                {fmtInt(c.dette_par_hab)} €/hab
              </span>
            </div>
          );
        })}
      </div>
      <p className="fx-city-compare-note muted">
        {t("fx.det.compare.note")}
      </p>
    </div>
  );
}
