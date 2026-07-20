"use client";

import { useState } from "react";
import type { DetteInstrument, PatrimoineStructure } from "@/lib/fusion-data";
import { fill, fmtBillions, fmtDec, fmtMillions, fmtInt } from "@/lib/fmt";
import InstrumentDetteFiche from "./InstrumentDetteFiche";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type Props = {
  structure: PatrimoineStructure["structure_dette"];
  year: number;
};

export default function DetteStructurePanel({ structure, year }: Props) {
  const t = useT();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = openKey
    ? structure.instruments.find((i) => i.key === openKey) ?? null
    : null;

  const partFixePct = structure.taux.part_fixe * 100;
  const partVarPct = structure.taux.part_variable * 100;

  return (
    <div className="fx-dette-structure">
      <div className="fx-ds-grid">
        <div className="fx-ds-col">
          <h4>{t("fx.ds.title_taux")}</h4>
          <div
            className="fx-ratebar"
            role="img"
            aria-label={fill(t("fx.ds.aria_taux"), { fixe: fmtInt(partFixePct), var: fmtInt(partVarPct) })}
          >
            <div className="fx-ratebar-seg seg-fixed" style={{ flexBasis: `${partFixePct}%` }}>
              <div className="pct tnum">{fmtInt(partFixePct)} %</div>
              <div className="lbl">{t("fx.ds.fixe_short")}</div>
            </div>
            <div className="fx-ratebar-seg seg-var" style={{ flexBasis: `${partVarPct}%` }}>
              <div className="pct tnum">{fmtInt(partVarPct)} %</div>
              <div className="lbl">{t("fx.ds.var_short")}</div>
            </div>
          </div>
          <div className="fx-ratebar-legend">
            <span>
              <b>{t("fx.ds.fixe_b")}</b> ·{" "}
              {fill(t("fx.ds.fixe_legend"), {
                amount: fmtBillions(structure.taux.encours_taux_fixe),
                pct: fmtDec(structure.taux.taux_fixe_moyen_pondere_pct, 1),
              })}
            </span>
            <span>
              <b>{t("fx.ds.var_b")}</b> ·{" "}
              {fill(t("fx.ds.var_legend"), {
                amount: fmtBillions(structure.taux.encours_taux_variable),
                index: structure.taux.indice_variable,
              })}
            </span>
          </div>

          <h4 style={{ marginTop: 26 }}>{t("fx.ds.title_maturite")}</h4>
          <div className="fx-maturite-kpi tnum">
            {fmtDec(structure.maturite_moyenne_ans, 1)}
            <span className="u">{t("fx.ds.maturite_unit")}</span>
          </div>
          <div className="fx-maturite-sub">
            {t("fx.ds.maturite_sub")}{" "}
            <b>{structure.prochaine_echeance_lourde.mois} {structure.prochaine_echeance_lourde.annee}</b>{" "}
            ({fmtInt(structure.prochaine_echeance_lourde.montant_m_eur)} M €)
          </div>
        </div>

        <div className="fx-ds-col">
          <h4>{t("fx.ds.title_instruments")}</h4>
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
            <b>{t("fx.ds.total_b")} · {fmtBillions(structure.total_dette_financiere)} {t("fx.s.md_eur")}</b>
          </div>
        </div>
      </div>

      <p className="fx-ds-disclaimer">{t("fx.ds.ratios_indicatifs")}</p>

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
  const t = useT();
  const { locale } = useLocale();
  const pct = Math.max(0, Math.min(100, (inst.encours / maxValue) * 100));
  const unit = inst.encours >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur");
  const display = inst.encours >= 1e9 ? fmtBillions(inst.encours) : fmtMillions(inst.encours, 0);
  return (
    <button
      type="button"
      className={`fx-inst-row${first ? " first" : ""}`}
      onClick={onClick}
      aria-label={fill(t("fx.ds.row_aria"), { label: trLabel(inst.label, locale) })}
    >
      <span className="l">
        {trLabel(inst.label, locale)}
        <span className="sub">{trLabel(inst.subtitle, locale)}</span>
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
