"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

/**
 * Table « Top emprunts par capital restant » partagée entre BailleurFiche et
 * ArrondissementGarantiesFiche — même squelette (Mob. / Capital / Taux
 * fixe|variable), deux variantes de colonnes :
 *
 *  - "bailleur"       : Objet (+ montant initial) | Prêteur (+ index si
 *                       variable) | Mob. | Capital | Taux | Durée rés.
 *  - "arrondissement" : Objet (+ prêteur) | Bénéficiaire (lien fiche
 *                       bailleur) | Mob. | Capital | Taux
 */
export type EmpruntRow = {
  objet: string;
  preteur: string;
  annee_mobilisation: number | null;
  capital_restant: number;
  taux_type: string;
  taux_actuariel: number | null;
  /** Variante bailleur uniquement. */
  montant_initial?: number;
  taux_index?: string;
  duree_residuelle?: number | null;
  /** Variante arrondissement uniquement. */
  beneficiaire?: string;
};

type Props = {
  emprunts: EmpruntRow[];
  variant: "bailleur" | "arrondissement";
  /** Href de la fiche du bénéficiaire (variante arrondissement). */
  beneficiaireHref?: (name: string) => string;
};

export default function EmpruntsTable({ emprunts, variant, beneficiaireHref }: Props) {
  const t = useT();

  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtAmount = (v: number) =>
    v >= 1e9
      ? { value: fmtBillions(v), unit: mdLabel }
      : { value: fmtMillions(v, 0), unit: mLabel };

  const isBailleur = variant === "bailleur";
  const cols = isBailleur
    ? {
        objet: t("fx.fiche.bg.col.objet"),
        second: t("fx.fiche.bg.col.preteur"),
        an: t("fx.fiche.bg.col.an"),
        capital: t("fx.fiche.bg.col.capital"),
        taux: t("fx.fiche.bg.col.taux"),
      }
    : {
        objet: t("fx.ag.col.objet"),
        second: t("fx.ag.col.benef"),
        an: t("fx.ag.col.an"),
        capital: t("fx.ag.col.capital"),
        taux: t("fx.ag.col.taux"),
      };

  return (
    <table className="fx-fiche-table">
      <thead>
        <tr>
          <th>{cols.objet}</th>
          <th>{cols.second}</th>
          <th className="num">{cols.an}</th>
          <th className="num">{cols.capital}</th>
          <th className="num">{cols.taux}</th>
          {isBailleur && <th className="num">{t("fx.fiche.bg.col.duree")}</th>}
        </tr>
      </thead>
      <tbody>
        {emprunts.map((e, i) => {
          const f = fmtAmount(e.capital_restant);
          const isFixed = e.taux_type.startsWith("F");
          let firstMeta: ReactNode = null;
          let secondCell: ReactNode;
          if (isBailleur) {
            if ((e.montant_initial ?? 0) > 0) {
              firstMeta = (
                <div className="meta">
                  {t("fx.fiche.bg.montant_init")} ·{" "}
                  {fmtAmount(e.montant_initial!).value}{" "}
                  {fmtAmount(e.montant_initial!).unit}
                </div>
              );
            }
            secondCell = (
              <>
                <div>{e.preteur || "—"}</div>
                {!isFixed && e.taux_index && (
                  <div className="meta">{e.taux_index}</div>
                )}
              </>
            );
          } else {
            if (e.preteur) firstMeta = <div className="meta">{e.preteur}</div>;
            secondCell = beneficiaireHref && e.beneficiaire ? (
              <Link
                href={beneficiaireHref(e.beneficiaire)}
                scroll={false}
                style={{ color: "var(--ink)", textDecoration: "none" }}
              >
                {e.beneficiaire}
              </Link>
            ) : (
              <>{e.beneficiaire || "—"}</>
            );
          }
          return (
            <tr key={i}>
              <td>
                <div>{e.objet || "—"}</div>
                {firstMeta}
              </td>
              <td>{secondCell}</td>
              <td className="num tnum mono">{e.annee_mobilisation ?? "—"}</td>
              <td className="num tnum">
                <b>{f.value}</b> <span className="muted">{f.unit}</span>
              </td>
              <td className="num tnum mono">
                {e.taux_actuariel != null ? `${fmtDec(e.taux_actuariel, 2)} %` : "—"}
                <div className="meta">
                  {isFixed ? t("fx.fiche.bg.fixe") : t("fx.fiche.bg.variable")}
                </div>
              </td>
              {isBailleur && (
                <td className="num tnum mono">
                  {e.duree_residuelle != null ? fmtDec(e.duree_residuelle, 1) : "—"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
