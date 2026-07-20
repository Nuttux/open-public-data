"use client";

import { fill, fmtDec, fmtInt } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import Tip from "@/components/fusion/Tip";
import BarTrack from "./BarTrack";

type ArrRow = {
  arr: number;
  demandesActives: number;
  attributions: number;
  ratio: number;
  delaiMedianMois: number | null;
  rangTension: number;
};

type Props = {
  year: number;
  source: string;
  sourceUrl: string;
  paris: {
    demandesActives: number;
    attributions: number;
    ratio: number;
    delaiMedianMois: number | null;
  };
  parArrondissement: ArrRow[];
  methodology: {
    ratioDefinition: string;
    delaiMedianCaveat: string;
  };
};

/**
 * Dashboard data-driven : tension SLS par arrondissement Paris.
 * Zéro calcul factice — tous les chiffres viennent du seed DRIHL XLSX via
 * le pipeline dbt (core_logement_attente_arr → logement_attente_paris.json).
 */
export default function TensionParArrondissement({
  year,
  source,
  sourceUrl,
  paris,
  parArrondissement,
  methodology,
}: Props) {
  const t = useT();
  const maxRatio = Math.max(...parArrondissement.map((a) => a.ratio));
  // Sorted by tension desc — most tense first
  const sorted = [...parArrondissement].sort((a, b) => b.ratio - a.ratio);

  return (
    <div className="fx-tension-arr">
      {/* Paris overview */}
      <div className="fx-tension-paris">
        <div className="fx-tension-paris-grid">
          <div className="fx-tension-paris-cell">
            <div className="fx-tension-paris-lbl">{t("fx.tension.demands_active")}</div>
            <div className="fx-tension-paris-val tnum">
              {fmtInt(paris.demandesActives)}
            </div>
            <div className="fx-tension-paris-note">{fill(t("fx.tension.note.at_31_12"), { year })}</div>
          </div>
          <div className="fx-tension-paris-cell">
            <div className="fx-tension-paris-lbl">{t("fx.tension.attributions")}</div>
            <div className="fx-tension-paris-val tnum">
              {fmtInt(paris.attributions)}
            </div>
            <div className="fx-tension-paris-note">{fill(t("fx.tension.note.in"), { year })}</div>
          </div>
          <div className="fx-tension-paris-cell fx-tension-paris-cell-hero">
            <div className="fx-tension-paris-lbl">
              <Tip label={methodology.ratioDefinition}>{t("fx.tension.tension_paris")}</Tip>
            </div>
            <div className="fx-tension-paris-val tnum">
              {fmtDec(paris.ratio, 1)}
            </div>
            <div className="fx-tension-paris-note">
              {t("fx.tension.demands_per_one")}
            </div>
          </div>
          {paris.delaiMedianMois != null && (
            <div className="fx-tension-paris-cell">
              <div className="fx-tension-paris-lbl">
                <Tip label={methodology.delaiMedianCaveat}>
                  {t("fx.tension.delai_median")}
                </Tip>
              </div>
              <div className="fx-tension-paris-val tnum">
                {fmtDec(paris.delaiMedianMois, 1)}
              </div>
              <div className="fx-tension-paris-note">
                {t("fx.tension.delai_caveat_unit")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arr-level bars */}
      <div className="fx-tension-arr-list">
        <div className="fx-tension-arr-header">
          <span>{t("fx.tension.col.arr")}</span>
          <span className="fx-tension-arr-ratio-lbl">
            {t("fx.tension.col.ratio")}
          </span>
        </div>
        {sorted.map((a) => (
          <div key={a.arr} className="fx-tension-arr-row">
            <div className="fx-tension-arr-lbl">
              <span className="fx-tension-arr-rank tnum">#{a.rangTension}</span>
              <span className="fx-tension-arr-name">
                {a.arr === 1
                  ? t("fx.tension.arr_label_first")
                  : fill(t("fx.tension.arr_label_other"), { n: a.arr })}
              </span>
            </div>
            <BarTrack
              value={a.ratio}
              max={maxRatio}
              as="div"
              trackClassName="fx-tension-arr-bar-wrap"
              fillClassName="fx-tension-arr-bar"
            />
            <div className="fx-tension-arr-ratio tnum">
              {fmtDec(a.ratio, 0)}
            </div>
            <div className="fx-tension-arr-detail tnum">
              {fmtInt(a.demandesActives)} / {fmtInt(a.attributions)}
            </div>
          </div>
        ))}
      </div>

      {/* Caveats */}
      <div className="fx-tension-arr-caveats">
        <p>
          <strong>{t("fx.tension.method_h")}</strong> {methodology.ratioDefinition}
        </p>
        <p>
          <strong>{t("fx.tension.delai_h")}</strong>{" "}
          {methodology.delaiMedianCaveat}
        </p>
        <p className="fx-tension-arr-source">
          {t("fx.tension.source_prefix")}{" "}
          <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
            {source}
          </a>{" "}
          {fill(t("fx.tension.source_year_suffix"), { year })}
        </p>
      </div>
    </div>
  );
}
