"use client";

import Link from "next/link";
import type { ArrondissementGaranties } from "@/lib/fusion-data";
import { fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { slugifyBailleur } from "@/lib/projet-utils";
import { useT } from "@/lib/localeContext";
import { useCity } from "./CityContext";
import EmpruntsTable from "./EmpruntsTable";

type Props = {
  arr: ArrondissementGaranties;
  year: number;
};

/**
 * Corps de fiche des garanties d'emprunt d'un arrondissement — rendu par
 * DetailDrawer (route interceptée) ou par le scaffold page entière via
 * lib/entities/arrondissement-garanties. L'ancien shell modal (backdrop, Esc,
 * scroll-lock, bouton ×) vit désormais dans DetailDrawer.
 */
export default function ArrondissementGarantiesFiche({ arr, year }: Props) {
  const t = useT();
  const { basePath } = useCity();

  const fmtAmount = (v: number) =>
    v >= 1e9
      ? { value: fmtBillions(v), unit: t("fx.s.md_eur") }
      : { value: fmtMillions(v, 0), unit: t("fx.s.m_eur") };

  const cap = fmtAmount(arr.capital_restant);
  const bailleurHref = (name: string) =>
    `${basePath}/dette/bailleur/${encodeURIComponent(slugifyBailleur(name))}`;

  return (
    <div>
      <div className="fx-fiche-sub" style={{ marginBottom: 16 }}>
        {t("fx.ag.sub")}{" "}
        {fmtDec(arr.share_of_localized * 100, 1)} % {t("fx.ag.of_localized")}.
      </div>

      <div className="fx-fiche-kpis">
        <div className="fk">
          <div className="fk-label">{fill(t("fx.ag.kpi.capital"), { year })}</div>
          <div className="fk-value tnum">{cap.value}<span className="u">{cap.unit}</span></div>
        </div>
        <div className="fk">
          <div className="fk-label">{t("fx.ag.kpi.count")}</div>
          <div className="fk-value tnum">{fmtInt(arr.count_emprunts)}</div>
        </div>
        <div className="fk">
          <div className="fk-label">{t("fx.ag.kpi.benef_count")}</div>
          <div className="fk-value tnum">{arr.top_beneficiaires.length}+</div>
        </div>
      </div>

      <div className="fx-fiche-body" style={{ padding: "28px 0 0" }}>
        {arr.top_beneficiaires.length > 0 && (
          <>
            <h3>{t("fx.ag.benef_title")}</h3>
            <table className="fx-fiche-table">
              <thead>
                <tr>
                  <th>{t("fx.ag.col.benef")}</th>
                  <th className="num">{t("fx.ag.col.encours")}</th>
                  <th className="num">{t("fx.ag.col.share")}</th>
                  <th className="num">{t("fx.ag.col.emprunts")}</th>
                </tr>
              </thead>
              <tbody>
                {arr.top_beneficiaires.map((b, i) => {
                  const f = fmtAmount(b.capital_restant);
                  return (
                    <tr key={i}>
                      <td>
                        <Link
                          href={bailleurHref(b.name)}
                          scroll={false}
                          style={{ color: "var(--ink)", textDecoration: "none", borderBottom: "1px dotted var(--muted)" }}
                        >
                          {b.name}
                        </Link>
                      </td>
                      <td className="num tnum"><b>{f.value}</b> <span className="muted">{f.unit}</span></td>
                      <td className="num tnum mono">{fmtDec(b.share_of_arr * 100, 0)} %</td>
                      <td className="num tnum mono">{fmtInt(b.count_emprunts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {arr.emprunts_top.length > 0 && (
          <>
            <h3 style={{ marginTop: 28 }}>
              {fill(t("fx.ag.emprunts_title"), { n: arr.emprunts_top.length })}
            </h3>
            <p className="muted" style={{ fontSize: 13 }}>{t("fx.ag.emprunts_desc")}</p>
            <EmpruntsTable
              variant="arrondissement"
              emprunts={arr.emprunts_top}
              beneficiaireHref={bailleurHref}
            />
          </>
        )}
      </div>
    </div>
  );
}
