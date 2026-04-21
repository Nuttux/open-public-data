"use client";

import { useEffect } from "react";
import type { BondIssuance, DetteInstrument } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";

type Props = {
  instrument: DetteInstrument | null;
  year: number;
  bondIssuances?: BondIssuance[];
  onClose: () => void;
};

export default function InstrumentDetteFiche({ instrument, year, bondIssuances, onClose }: Props) {
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

  const unit = instrument.encours >= 1e9 ? "Md €" : "M €";
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
      <aside className="fx-fiche-panel" role="dialog" aria-modal="true" aria-label={instrument.label}>
        <button type="button" className="fx-fiche-close" onClick={onClose} aria-label="Fermer (Échap)">×</button>

        <div className="fx-fiche-head">
          <div className="fx-fiche-meta">
            <span className="tag sol">{instrument.tag}</span>
            <span>{fmtInt(instrument.part * 100)} % de l&apos;encours</span>
            <span className="sep">·</span>
            <span>{instrument.subtitle}</span>
          </div>
          <h2>{instrument.label} · {display} {unit}</h2>
          <div className="fx-fiche-sub">{instrument.description}</div>
        </div>

        <div className="fx-fiche-kpis">
          <div className="fk">
            <div className="fk-label">Encours · {year}</div>
            <div className="fk-value tnum">{display}<span className="u">{unit}</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">Taux moyen pondéré</div>
            <div className="fk-value tnum">{fmtDec(instrument.taux_moyen_pct, 1)}<span className="u">%</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">Maturité moyenne</div>
            <div className="fk-value tnum">{fmtDec(instrument.maturite_moyenne_ans, 1)}<span className="u">ans</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">Part taux fixe</div>
            <div className="fk-value tnum">{fmtInt(instrument.part_taux_fixe * 100)}<span className="u">%</span></div>
          </div>
        </div>

        <div className="fx-fiche-body">
          {!showIssuances && instrument.key !== "obligataire" && (
            <div className="fx-fiche-empty">
              <div className="fx-fiche-empty-mark">—</div>
              <div>
                <b>Liste ligne par ligne non publiée en open data</b>
                <p className="muted">
                  Pour cet instrument ({instrument.label.toLowerCase()}), la Ville de
                  Paris ne publie pas le détail des contrats individuels (contrepartie,
                  date de signature, taux par ligne, amortissement). Les chiffres
                  affichés en KPI proviennent du compte administratif M57 pour
                  l&apos;encours, et du Rapport d&apos;Orientation Budgétaire pour les
                  taux et maturités — agrégés.
                </p>
              </div>
            </div>
          )}
          {showIssuances && (
            <>
              <h3>Émissions obligataires actives · par année</h3>
              <p className="muted" style={{ fontSize: 13.5 }}>
                Principales lignes obligataires publiques émises par la Ville et
                encore dans l&apos;encours. Liste reconstituée depuis Euronext Paris,
                les communiqués Paris IR et le rapport annuel de l&apos;Agence France
                Trésor.
              </p>
              <table className="fx-fiche-table fx-issuances">
                <thead>
                  <tr>
                    <th>Année</th>
                    <th className="num">Montant</th>
                    <th>Ligne</th>
                    <th className="num">Taux</th>
                    <th className="num">Maturité</th>
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
                      <td className="num tnum mono"><b>{b.maturity_years}</b> ans</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num tnum">
                      <b>{fmtInt(sortedIssuances.reduce((s, b) => s + b.amount_m_eur, 0))}</b>{" "}
                      <span className="muted">M €</span>
                    </td>
                    <td colSpan={3} className="muted">
                      {sortedIssuances.length} ligne{sortedIssuances.length > 1 ? "s" : ""} active{sortedIssuances.length > 1 ? "s" : ""} au {year}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          <h3 style={{ marginTop: showIssuances ? 28 : 0 }}>Ce que ces chiffres veulent dire</h3>
          <p>
            La part <b>{fmtInt(instrument.part * 100)} %</b> dans l&apos;encours total
            indique le poids relatif de cet instrument dans le financement de la Ville.
            Le taux moyen pondéré de <b>{fmtDec(instrument.taux_moyen_pct, 1)} %</b> reflète
            le coût de financement constaté, pondéré par le nominal de chaque ligne.
          </p>
          <p>
            La maturité moyenne de <b>{fmtDec(instrument.maturite_moyenne_ans, 1)} ans</b> indique
            combien de temps reste à courir en moyenne avant remboursement intégral —
            plus la maturité est longue, plus la dette est étalée dans le temps.
          </p>

          <h3 style={{ marginTop: 28 }}>Limites de la donnée</h3>
          <p className="muted">
            La ventilation par instrument vient directement du compte administratif M57.
            Les taux, maturités et lignes individuelles ci-dessus sont reconstitués
            depuis le Rapport d&apos;Orientation Budgétaire Paris, les annexes IV du
            compte administratif et les communiqués publics Paris IR / Euronext.
            Certaines lignes peuvent avoir été remboursées ou restructurées depuis.
          </p>

          <div className="fx-fiche-foot-cta">
            <a className="fx-btn" href="/methode#dette-patrimoine">Méthode complète →</a>
            <a className="fx-btn" href={`/data/patrimoine_structure_${year}.json`} target="_blank" rel="noopener noreferrer">JSON · structure dette</a>
          </div>
        </div>
      </aside>
    </>
  );
}
