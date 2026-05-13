"use client";

import { useEffect } from "react";
import type { BondIssuance, DetteInstrument } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

type Props = {
  instrument: DetteInstrument | null;
  year: number;
  bondIssuances?: BondIssuance[];
  onClose: () => void;
};

export default function InstrumentDetteFiche({ instrument, year, bondIssuances, onClose }: Props) {
  const t = useT();
  const { locale } = useLocale();

  useEffect(() => {
    if (!instrument) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [instrument, onClose]);

  if (!instrument) return null;

  const unit = instrument.encours >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur");
  const display = instrument.encours >= 1e9
    ? fmtBillions(instrument.encours)
    : fmtMillions(instrument.encours, 0);

  const showIssuances = instrument.key === "obligataire" && bondIssuances && bondIssuances.length > 0;
  const sortedIssuances = showIssuances
    ? bondIssuances.slice().sort((a, b) => b.year - a.year)
    : [];

  return (
    <>
      <div className="fx-fiche-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="fx-fiche-panel" role="dialog" aria-modal="true" aria-label={trLabel(instrument.label, locale)}>
        <button type="button" className="fx-fiche-close" onClick={onClose} aria-label={t("fx.fiche.close_label")}>×</button>

        <div className="fx-fiche-head">
          <div className="fx-fiche-meta">
            <span className="tag sol">{trLabel(instrument.tag, locale)}</span>
            <span>{fmtInt(instrument.part * 100)} % {t("fx.fiche.instr.encours_pct")}</span>
            <span className="sep">·</span>
            <span>{trLabel(instrument.subtitle, locale)}</span>
          </div>
          <h2>{trLabel(instrument.label, locale)} · {display} {unit}</h2>
          <div className="fx-fiche-sub">{trLabel(instrument.description, locale)}</div>
        </div>

        <div className="fx-fiche-kpis">
          <div className="fk">
            <div className="fk-label">{fill(t("fx.fiche.instr.encours"), { year })}</div>
            <div className="fk-value tnum">{display}<span className="u">{unit}</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.instr.taux")}</div>
            <div className="fk-value tnum">{fmtDec(instrument.taux_moyen_pct, 1)}<span className="u">%</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.instr.maturite")}</div>
            <div className="fk-value tnum">{fmtDec(instrument.maturite_moyenne_ans, 1)}<span className="u">{t("fx.fiche.instr.maturite_unit")}</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.instr.taux_fixe")}</div>
            <div className="fk-value tnum">{fmtInt(instrument.part_taux_fixe * 100)}<span className="u">%</span></div>
          </div>
        </div>

        <div className="fx-fiche-body">
          {!showIssuances && instrument.key !== "obligataire" && (
            <div className="fx-fiche-empty">
              <div className="fx-fiche-empty-mark">—</div>
              <div>
                <b>{t("fx.fiche.instr.no_detail_title")}</b>
                <p className="muted">
                  {fill(t("fx.fiche.instr.no_detail_desc"), { label: instrument.label.toLowerCase() })}
                </p>
              </div>
            </div>
          )}
          {showIssuances && (
            <>
              <h3>{t("fx.fiche.instr.emissions")}</h3>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {t("fx.fiche.instr.emissions_desc")}
              </p>
              <table className="fx-fiche-table fx-issuances">
                <thead>
                  <tr>
                    <th>{t("fx.fiche.instr.col.annee")}</th>
                    <th className="num">{t("fx.fiche.instr.col.montant")}</th>
                    <th>{t("fx.fiche.instr.col.ligne")}</th>
                    <th className="num">{t("fx.fiche.instr.col.taux")}</th>
                    <th className="num">{t("fx.fiche.instr.col.maturite")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedIssuances.map((b, i) => (
                    <tr key={i}>
                      <td className="tnum mono">{b.year}</td>
                      <td className="num tnum"><b>{fmtInt(b.amount_m_eur)}</b> <span className="muted">M €</span></td>
                      <td>
                        <div>{b.label}</div>
                        <div className="meta">{b.meta}</div>
                      </td>
                      <td className="num tnum mono">{fmtDec(b.rate_pct, 2)} %</td>
                      <td className="num tnum mono"><b>{b.maturity_years}</b> {t("fx.fiche.instr.maturite_unit")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t("fx.fiche.instr.total")}</td>
                    <td className="num tnum">
                      <b>{fmtInt(sortedIssuances.reduce((s, b) => s + b.amount_m_eur, 0))}</b>{" "}
                      <span className="muted">M €</span>
                    </td>
                    <td colSpan={3} className="muted">
                      {sortedIssuances.length} {fill(t("fx.fiche.instr.lignes_actives"), {
                        s: sortedIssuances.length > 1 ? "s" : "",
                        ss: sortedIssuances.length > 1 ? "s" : "",
                        year,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          <h3 style={{ marginTop: showIssuances ? 28 : 0 }}>{t("fx.fiche.instr.meaning")}</h3>
          <p>
            {fill(t("fx.fiche.instr.meaning_p1"), {
              pct: fmtInt(instrument.part * 100),
              taux: fmtDec(instrument.taux_moyen_pct, 1),
            })}
          </p>
          <p>
            {fill(t("fx.fiche.instr.meaning_p2"), { mat: fmtDec(instrument.maturite_moyenne_ans, 1) })}
          </p>

          <h3 style={{ marginTop: 28 }}>{t("fx.fiche.instr.limites")}</h3>
          <p className="muted">{t("fx.fiche.instr.limites_desc")}</p>

          <div className="fx-fiche-foot-cta">
            <a className="fx-btn" href="/methode?tool=dette-patrimoine#outils">{t("fx.fiche.instr.methode")}</a>
            <a className="fx-btn" href={`/data/patrimoine_structure_${year}.json`} target="_blank" rel="noopener noreferrer">{t("fx.fiche.instr.json")}</a>
          </div>
        </div>
      </aside>
    </>
  );
}
