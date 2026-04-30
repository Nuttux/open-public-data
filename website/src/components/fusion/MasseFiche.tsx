"use client";

import { useEffect } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION } from "@/lib/methodology";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

type Props = {
  masse: PatrimoineMasse | null;
  year: number;
  onClose: () => void;
};

export default function MasseFiche({ masse, year, onClose }: Props) {
  const t = useT();
  const { locale } = useLocale();

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
  const unit = masse.value >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur");
  const display = masse.value >= 1e9 ? fmtBillions(masse.value) : fmtMillions(masse.value, 0);
  const subitemsTotal = masse.subitems.reduce((s, i) => s + i.value, 0);
  const hasAmort = masse.subitems.some((i) => i.amort > 0);

  return (
    <>
      <div className="fx-fiche-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="fx-fiche-panel" role="dialog" aria-modal="true" aria-label={trLabel(masse.label, locale)}>
        <button type="button" className="fx-fiche-close" onClick={onClose} aria-label={t("fx.fiche.close_label")}>×</button>

        <div className="fx-fiche-head">
          <div className="fx-fiche-meta">
            <span className="tag sol">{trLabel(masse.tag, locale)}</span>
            <span>{fmtDec(masse.share * 100, 1)} {fill(t("fx.fiche.masse.pct_side"), { side: masse.side })}</span>
            <span className="sep">·</span>
            <span>{fill(t("fx.fiche.masse.bilan"), { year })}</span>
          </div>
          <h2>{trLabel(masse.label, locale)} · {display} {unit}</h2>
          {masse.sub && <div className="fx-fiche-sub">{trLabel(masse.sub, locale)}</div>}
        </div>

        <div className="fx-fiche-kpis">
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.masse.valeur_nette")}</div>
            <div className="fk-value tnum">{display}<span className="u">{unit}</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">{fill(t("fx.fiche.masse.part_side"), { side: masse.side })}</div>
            <div className="fk-value tnum">{fmtDec(masse.share * 100, 1)}<span className="u">%</span></div>
          </div>
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.masse.par_hab")}</div>
            <div className="fk-value tnum">
              {fmtInt(masse.value / PARIS_POPULATION)}<span className="u">€</span>
            </div>
          </div>
          <div className="fk">
            <div className="fk-label">{t("fx.fiche.masse.sous_postes")}</div>
            <div className="fk-value tnum">{masse.subitems.length}</div>
          </div>
        </div>

        <div className="fx-fiche-body">
          <h3>{t("fx.fiche.masse.recouvre")}</h3>
          <p>{masse.details || t("fx.fiche.masse.no_detail")}</p>

          {masse.subitems.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>
                {fill(t("fx.fiche.masse.sous_postes_title"), {
                  n: masse.subitems.length,
                  s: masse.subitems.length > 1 ? "s" : "",
                })}
              </h3>
              <table className="fx-fiche-table">
                <thead>
                  <tr>
                    <th>{t("fx.fiche.masse.col.poste")}</th>
                    {hasAmort && <th className="num">{t("fx.fiche.masse.col.brut")}</th>}
                    {hasAmort && <th className="num">{t("fx.fiche.masse.col.amort")}</th>}
                    <th className="num">{t("fx.fiche.masse.col.net")}</th>
                    <th className="num">{t("fx.fiche.masse.col.part")}</th>
                  </tr>
                </thead>
                <tbody>
                  {masse.subitems.map((s, i) => {
                    const subUnit = s.value >= 1e9 ? t("fx.s.md_eur") : s.value >= 1e6 ? t("fx.s.m_eur") : "€";
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

          <h3 style={{ marginTop: 28 }}>{t("fx.fiche.masse.limites")}</h3>
          <p className="muted">{t("fx.fiche.masse.limites_desc")}</p>
        </div>
      </aside>
    </>
  );
}
