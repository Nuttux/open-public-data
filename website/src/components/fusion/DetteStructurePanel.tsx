"use client";

import { useState } from "react";
import type { DetteInstrument, PatrimoineStructure } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtMillions, fmtInt } from "@/lib/fmt";
import InstrumentDetteFiche from "./InstrumentDetteFiche";

type Props = {
  structure: PatrimoineStructure["structure_dette"];
  year: number;
};

export default function DetteStructurePanel({ structure, year }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = openKey
    ? structure.instruments.find((i) => i.key === openKey) ?? null
    : null;

  const partFixePct = structure.taux.part_fixe * 100;
  const partVarPct = structure.taux.part_variable * 100;

  return (
    <div className="fx-dette-structure">
      <div className="fx-ds-grid">
        {/* Col 1 — taux + maturité */}
        <div className="fx-ds-col">
          <h4>Répartition par type de taux</h4>
          <div className="fx-fixvar-wrap">
            <div className="fx-fixvar-labels">
              <span className="fx-fv-lbl fixed tnum">
                <b>{fmtInt(partFixePct)} %</b> taux fixe
              </span>
              <span className="fx-fv-lbl var tnum">
                <b>{fmtInt(partVarPct)} %</b> variable
              </span>
            </div>
            <div className="fx-fixvar-bar" role="img" aria-label={`${fmtInt(partFixePct)} % de taux fixe, ${fmtInt(partVarPct)} % de taux variable`}>
              <div className="fx-fv-seg fixed" style={{ flex: `0 0 ${partFixePct}%` }} />
              <div className="fx-fv-seg var" style={{ flex: `0 0 ${partVarPct}%` }} />
            </div>
          </div>
          <div className="fx-fv-legend">
            <span>
              <b>Taux fixe</b> · {fmtBillions(structure.taux.encours_taux_fixe)} Md € ·
              taux moyen pondéré {fmtDec(structure.taux.taux_fixe_moyen_pondere_pct, 1)} %
            </span>
            <span>
              <b>Variable</b> · {fmtBillions(structure.taux.encours_taux_variable)} Md € ·
              indexé {structure.taux.indice_variable}
            </span>
          </div>

          <h4 style={{ marginTop: 26 }}>Maturité moyenne de l&apos;encours</h4>
          <div className="fx-maturite-kpi tnum">
            {fmtDec(structure.maturite_moyenne_ans, 1)}
            <span className="u">ans</span>
          </div>
          <div className="fx-maturite-sub">
            <b>Durée résiduelle pondérée</b> · prochaine échéance lourde{" "}
            <b>{structure.prochaine_echeance_lourde.mois} {structure.prochaine_echeance_lourde.annee}</b>{" "}
            ({fmtInt(structure.prochaine_echeance_lourde.montant_m_eur)} M € · {structure.prochaine_echeance_lourde.libelle})
          </div>
        </div>

        {/* Col 2 — 4 instruments cliquables */}
        <div className="fx-ds-col">
          <h4>Ventilation par instrument financier</h4>
          <div className="fx-instruments">
            {structure.instruments.map((inst, i) => (
              <Row
                key={inst.key}
                inst={inst}
                maxValue={structure.instruments[0]?.encours ?? 1}
                onClick={() => setOpenKey(inst.key)}
                first={i === 0}
              />
            ))}
          </div>
          <div className="fx-instruments-note">
            <b>Total · {fmtBillions(structure.total_dette_financiere)} Md €</b>
            {" · "}
            {structure.instruments
              .map((i) => `${fmtInt(i.part * 100)} % ${i.label.toLowerCase().split(" ")[0]}`)
              .join(" · ")}
            . Le stock structuré est en extinction naturelle (maturité &lt; 6 ans).
          </div>
        </div>
      </div>

      <InstrumentDetteFiche
        instrument={open}
        year={year}
        bondIssuances={structure.bond_issuances}
        onClose={() => setOpenKey(null)}
      />
    </div>
  );
}

type RowProps = {
  inst: DetteInstrument;
  maxValue: number;
  onClick: () => void;
  first: boolean;
};

function Row({ inst, maxValue, onClick, first }: RowProps) {
  const pct = Math.max(0, Math.min(100, (inst.encours / maxValue) * 100));
  const unit = inst.encours >= 1e9 ? "Md €" : "M €";
  const display = inst.encours >= 1e9 ? fmtBillions(inst.encours) : fmtMillions(inst.encours, 0);
  return (
    <button
      type="button"
      className={`fx-inst-row${first ? " first" : ""}`}
      onClick={onClick}
      aria-label={`Détail ${inst.label}`}
    >
      <span className="l">
        {inst.label}
        <span className="sub">{inst.subtitle}</span>
      </span>
      <span className="bar">
        <span className="fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="v tnum">
        {display}
        <span className="u">{unit}</span>
      </span>
      <span className="arrow">→</span>
    </button>
  );
}
