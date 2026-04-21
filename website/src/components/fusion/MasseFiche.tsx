"use client";

import { useEffect } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";

type Props = {
  masse: PatrimoineMasse | null;
  year: number;
  onClose: () => void;
};

export default function MasseFiche({ masse, year, onClose }: Props) {
  useEffect(() => {
    if (!masse) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [masse, onClose]);

  if (!masse) return null;
  const unit = masse.value >= 1e9 ? "Md €" : "M €";
  const display = masse.value >= 1e9 ? fmtBillions(masse.value) : fmtMillions(masse.value, 0);
  const subitemsTotal = masse.subitems.reduce((s, i) => s + i.value, 0);
  const hasAmort = masse.subitems.some((i) => i.amort > 0);

  return (
    <>
      <div className="fx-fiche-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="fx-fiche-panel" role="dialog" aria-modal="true" aria-label={masse.label}>
        <button type="button" className="fx-fiche-close" onClick={onClose} aria-label="Fermer (Échap)">×</button>

        <div className="fx-fiche-head">
          <div className="fx-fiche-meta">
            <span className="tag sol">{masse.tag}</span>
            <span>{fmtDec(masse.share * 100, 1)} % du {masse.side}</span>
            <span className="sep">·</span>
            <span>Bilan {year}</span>
          </div>
          <h2>{masse.label} · {display} {unit}</h2>
          {masse.sub && <div className="fx-fiche-sub">{masse.sub}</div>}
        </div>

        <div className="fx-fiche-kpis">
          <div className="fk">
            <div className="fk-label">Valeur nette</div>
            <div className="fk-value tnum">{display}<span className="u">{unit}</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">Part du {masse.side}</div>
            <div className="fk-value tnum">{fmtDec(masse.share * 100, 1)}<span className="u">%</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">Par habitant</div>
            <div className="fk-value tnum">
              {fmtInt(masse.value / 2_133_111)}<span className="u">€</span>
            </div>
          </div>
          <div className="fk">
            <div className="fk-label">Sous-postes</div>
            <div className="fk-value tnum">{masse.subitems.length}</div>
          </div>
        </div>

        <div className="fx-fiche-body">
          <h3>Ce que recouvre cette masse</h3>
          <p>{masse.details || "Détail non documenté à ce jour."}</p>

          {masse.subitems.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>
                Sous-postes · {fmtInt(masse.subitems.length)} ligne{masse.subitems.length > 1 ? "s" : ""}
              </h3>
              <table className="fx-fiche-table">
                <thead>
                  <tr>
                    <th>Poste</th>
                    {hasAmort && <th className="num">Brut</th>}
                    {hasAmort && <th className="num">Amort.</th>}
                    <th className="num">Net</th>
                    <th className="num">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {masse.subitems.map((s, i) => {
                    const subUnit = s.value >= 1e9 ? "Md €" : s.value >= 1e6 ? "M €" : "€";
                    const subDisplay = s.value >= 1e9
                      ? fmtBillions(s.value)
                      : s.value >= 1e6
                      ? fmtMillions(s.value, 0)
                      : fmtInt(s.value);
                    const subPct = subitemsTotal > 0 ? (s.value / subitemsTotal) * 100 : 0;
                    return (
                      <tr key={i}>
                        <td>{s.name}</td>
                        {hasAmort && (
                          <td className="num muted tnum">
                            {s.brut >= 1e6 ? fmtMillions(s.brut, 0) : fmtInt(s.brut)}
                          </td>
                        )}
                        {hasAmort && (
                          <td className="num muted tnum">
                            {s.amort > 0 ? `−${fmtMillions(s.amort, 0)}` : "—"}
                          </td>
                        )}
                        <td className="num tnum"><b>{subDisplay}</b> <span className="muted">{subUnit}</span></td>
                        <td className="num muted tnum">{fmtDec(subPct, 1)} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <h3 style={{ marginTop: 28 }}>Limites de la donnée</h3>
          <p className="muted">
            Valorisation en <b>valeur comptable historique</b> (coût d&apos;acquisition
            diminué des amortissements), non à la valeur de marché. Certaines masses —
            monuments classés, terrains acquis avant 1980, œuvres d&apos;art en dépôt —
            sont structurellement sous-évaluées ou inscrites à l&apos;euro symbolique.
            Détail par bâtiment ou par parcelle non publié en open data.
          </p>
        </div>
      </aside>
    </>
  );
}
