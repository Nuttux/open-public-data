"use client";

import { fmtDec, fmtInt } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import Tip from "@/components/fusion/Tip";

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
            <div className="fx-tension-paris-lbl">Demandes actives</div>
            <div className="fx-tension-paris-val tnum">
              {fmtInt(paris.demandesActives)}
            </div>
            <div className="fx-tension-paris-note">au 31/12/{year}</div>
          </div>
          <div className="fx-tension-paris-cell">
            <div className="fx-tension-paris-lbl">Attributions</div>
            <div className="fx-tension-paris-val tnum">
              {fmtInt(paris.attributions)}
            </div>
            <div className="fx-tension-paris-note">en {year}</div>
          </div>
          <div className="fx-tension-paris-cell fx-tension-paris-cell-hero">
            <div className="fx-tension-paris-lbl">
              <Tip label={methodology.ratioDefinition}>Tension Paris global</Tip>
            </div>
            <div className="fx-tension-paris-val tnum">
              {fmtDec(paris.ratio, 1)}
            </div>
            <div className="fx-tension-paris-note">
              demandes pour 1 attribution
            </div>
          </div>
          {paris.delaiMedianMois != null && (
            <div className="fx-tension-paris-cell">
              <div className="fx-tension-paris-lbl">
                <Tip label={methodology.delaiMedianCaveat}>
                  Délai médian ⚠️
                </Tip>
              </div>
              <div className="fx-tension-paris-val tnum">
                {fmtDec(paris.delaiMedianMois, 1)}
              </div>
              <div className="fx-tension-paris-note">
                mois — uniquement pour les attribués
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arr-level bars */}
      <div className="fx-tension-arr-list">
        <div className="fx-tension-arr-header">
          <span>Arrondissement</span>
          <span className="fx-tension-arr-ratio-lbl">
            Demandes pour 1 attribution
          </span>
        </div>
        {sorted.map((a) => (
          <div key={a.arr} className="fx-tension-arr-row">
            <div className="fx-tension-arr-lbl">
              <span className="fx-tension-arr-rank tnum">#{a.rangTension}</span>
              <span className="fx-tension-arr-name">
                {a.arr === 1
                  ? "1er"
                  : `${a.arr}e`}{" "}
                arrondissement
              </span>
            </div>
            <div className="fx-tension-arr-bar-wrap">
              <div
                className="fx-tension-arr-bar"
                style={{ width: `${(a.ratio / maxRatio) * 100}%` }}
              />
            </div>
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
          <strong>Méthode.</strong> {methodology.ratioDefinition}
        </p>
        <p>
          <strong>À savoir sur le délai médian.</strong>{" "}
          {methodology.delaiMedianCaveat}
        </p>
        <p className="fx-tension-arr-source">
          Source :{" "}
          <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
            {source}
          </a>{" "}
          · année de référence {year}
        </p>
      </div>
    </div>
  );
}
