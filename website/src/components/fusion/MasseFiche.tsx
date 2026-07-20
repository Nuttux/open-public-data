"use client";

import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION } from "@/lib/methodology";

type Props = {
  masse: PatrimoineMasse;
  /** Année du bilan — affichée par le kicker (drawer) / header (page). */
  year?: number;
};

/**
 * Corps de fiche d'une masse du bilan (actif/passif) — rendu par DetailDrawer
 * (route interceptée) ou par le scaffold page entière via lib/entities/masse.
 * L'ancien shell modal (backdrop, Esc, scroll-lock, bouton ×) vit désormais
 * dans DetailDrawer.
 */
export default function MasseFiche({ masse }: Props) {
  const t = useT();
  const { locale } = useLocale();

  const unit = masse.value >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur");
  const display = masse.value >= 1e9 ? fmtBillions(masse.value) : fmtMillions(masse.value, 0);
  const subitemsTotal = masse.subitems.reduce((s, i) => s + i.value, 0);
  const hasAmort = masse.subitems.some((i) => i.amort > 0);

  return (
    <div>
      {masse.sub && (
        <div className="fx-fiche-sub" style={{ marginBottom: 16 }}>
          {trLabel(masse.sub, locale)}
        </div>
      )}

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

      <div className="fx-fiche-body" style={{ padding: "28px 0 0" }}>
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
    </div>
  );
}
