"use client";

import { useEffect } from "react";
import Link from "next/link";
import { fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import { slugifyBailleur } from "@/lib/projet-utils";
import { useT } from "@/lib/localeContext";

type TopBenef = {
  name: string;
  capital_restant: number;
  count_emprunts: number;
  share_of_arr: number;
};

type Emprunt = {
  objet: string;
  beneficiaire: string;
  preteur: string;
  annee_mobilisation: number | null;
  capital_restant: number;
  taux_type: string;
  taux_actuariel: number | null;
};

type Arr = {
  arr: number;
  capital_restant: number;
  count_emprunts: number;
  share_of_localized: number;
  top_beneficiaires: TopBenef[];
  emprunts_top: Emprunt[];
};

type Props = {
  arr: Arr | null;
  year: number;
  onClose: () => void;
};

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

export default function ArrondissementGarantiesFiche({ arr, year, onClose }: Props) {
  const t = useT();

  useEffect(() => {
    if (!arr) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [arr, onClose]);

  if (!arr) return null;

  const fmtAmount = (v: number) =>
    v >= 1e9
      ? { value: fmtBillions(v), unit: t("fx.s.md_eur") }
      : { value: fmtMillions(v, 0), unit: t("fx.s.m_eur") };

  const cap = fmtAmount(arr.capital_restant);
  const arrLabel = `${arr.arr}${suf(arr.arr)}`;

  return (
    <>
      <div className="fx-fiche-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="fx-fiche-panel" role="dialog" aria-modal="true" aria-label={`Arrondissement ${arrLabel}`}>
        <button type="button" className="fx-fiche-close" onClick={onClose} aria-label={t("fx.fiche.close_label")}>×</button>

        <div className="fx-fiche-head">
          <div className="fx-fiche-meta">
            <span className="tag sol">{t("fx.ag.kicker")}</span>
            <span>{fmtInt(arr.count_emprunts)} {t("fx.ag.emprunts")}</span>
            <span className="sep">·</span>
            <span>{fmtDec(arr.share_of_localized * 100, 1)} % {t("fx.ag.of_localized")}</span>
          </div>
          <h2>{fill(t("fx.ag.title"), { arr: arrLabel })}</h2>
          <div className="fx-fiche-sub">{t("fx.ag.sub")}</div>
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

        <div className="fx-fiche-body">
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
                    const slug = slugifyBailleur(b.name);
                    return (
                      <tr key={i}>
                        <td>
                          <Link
                            href={`/dette-patrimoine/bailleur/${encodeURIComponent(slug)}`}
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
              <table className="fx-fiche-table">
                <thead>
                  <tr>
                    <th>{t("fx.ag.col.objet")}</th>
                    <th>{t("fx.ag.col.benef")}</th>
                    <th className="num">{t("fx.ag.col.an")}</th>
                    <th className="num">{t("fx.ag.col.capital")}</th>
                    <th className="num">{t("fx.ag.col.taux")}</th>
                  </tr>
                </thead>
                <tbody>
                  {arr.emprunts_top.map((e, i) => {
                    const f = fmtAmount(e.capital_restant);
                    const isFixed = e.taux_type.startsWith("F");
                    const slug = slugifyBailleur(e.beneficiaire);
                    return (
                      <tr key={i}>
                        <td>
                          <div>{e.objet || "—"}</div>
                          {e.preteur && <div className="meta">{e.preteur}</div>}
                        </td>
                        <td>
                          <Link
                            href={`/dette-patrimoine/bailleur/${encodeURIComponent(slug)}`}
                            scroll={false}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {e.beneficiaire || "—"}
                          </Link>
                        </td>
                        <td className="num tnum mono">{e.annee_mobilisation ?? "—"}</td>
                        <td className="num tnum"><b>{f.value}</b> <span className="muted">{f.unit}</span></td>
                        <td className="num tnum mono">
                          {e.taux_actuariel != null ? `${fmtDec(e.taux_actuariel, 2)} %` : "—"}
                          <div className="meta">{isFixed ? t("fx.fiche.bg.fixe") : t("fx.fiche.bg.variable")}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
