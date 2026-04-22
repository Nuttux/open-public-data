"use client";

import { useState } from "react";
import ParisChoropleth from "./ParisChoropleth";
import ArrondissementGarantiesFiche from "./ArrondissementGarantiesFiche";
import { fmtBillions, fmtMillions } from "@/lib/fmt";
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

type ArrItem = {
  arr: number;
  capital_restant: number;
  count_emprunts: number;
  share_of_localized: number;
  top_beneficiaires: TopBenef[];
  emprunts_top: Emprunt[];
};

type Props = {
  byArrondissement: ArrItem[];
  nonLocalised: {
    capital_restant: number;
    count_emprunts: number;
    share: number;
  };
  totalCapital: number;
  year: number;
};

// Central arrondissements (1-4) merged into Paris Centre (c_ar = 0)
const CENTRAL_ARRS = [1, 2, 3, 4];

export default function HorsBilanMap({ byArrondissement, nonLocalised, totalCapital, year }: Props) {
  const t = useT();
  const [openArr, setOpenArr] = useState<ArrItem | null>(null);

  const items = byArrondissement
    .filter((a) => a.capital_restant > 0)
    .map((a) => ({
      arr: a.arr,
      amount: a.capital_restant,
      count: a.count_emprunts,
    }));

  const formatValue = (v: number) =>
    v >= 1e9 ? `${fmtBillions(v)} ${t("fx.s.md_eur")}` : `${fmtMillions(v, 0)} ${t("fx.s.m_eur")}`;

  /**
   * ParisChoropleth consolide arr 1-4 → c_ar=0 (Paris Centre). Quand on clique
   * ce c_ar, on agrège à la volée les 4 arrondissements centraux pour
   * construire une fiche virtuelle « Paris Centre ».
   */
  const handleTileClick = (cAr: number) => {
    if (cAr === 0) {
      const centraux = byArrondissement.filter((a) => CENTRAL_ARRS.includes(a.arr));
      const totalCrd = centraux.reduce((s, a) => s + a.capital_restant, 0);
      const totalCount = centraux.reduce((s, a) => s + a.count_emprunts, 0);
      if (totalCount === 0) return;
      // Fusion des top_beneficiaires
      const benefMap = new Map<string, TopBenef>();
      for (const c of centraux) {
        for (const b of c.top_beneficiaires) {
          const cur = benefMap.get(b.name);
          if (cur) {
            cur.capital_restant += b.capital_restant;
            cur.count_emprunts += b.count_emprunts;
          } else {
            benefMap.set(b.name, { ...b });
          }
        }
      }
      const topBenefs = Array.from(benefMap.values())
        .map((b) => ({ ...b, share_of_arr: totalCrd ? b.capital_restant / totalCrd : 0 }))
        .sort((a, b) => b.capital_restant - a.capital_restant)
        .slice(0, 3);
      // Fusion des emprunts_top
      const emprunts = centraux
        .flatMap((c) => c.emprunts_top)
        .sort((a, b) => b.capital_restant - a.capital_restant)
        .slice(0, 15);

      setOpenArr({
        arr: 0,
        capital_restant: totalCrd,
        count_emprunts: totalCount,
        share_of_localized: centraux.reduce((s, a) => s + a.share_of_localized, 0),
        top_beneficiaires: topBenefs,
        emprunts_top: emprunts,
      });
      return;
    }
    const match = byArrondissement.find((a) => a.arr === cAr);
    if (match && match.count_emprunts > 0) setOpenArr(match);
  };

  return (
    <div className="fx-hbmap">
      <div className="fx-hbmap-head">
        <div>
          <div className="fx-hbmap-kicker">{t("fx.hbmap.kicker")}</div>
          <h3 className="fx-hbmap-title">
            {t("fx.hbmap.title.before")}
            <em>{t("fx.hbmap.title.em")}</em>
          </h3>
        </div>
        <div className="fx-hbmap-totals muted tnum">
          {t("fx.hbmap.total")} · <b>{formatValue(totalCapital)}</b>{" "}
          · {t("fx.hbmap.year_prefix")} {year}
        </div>
      </div>

      <p className="fx-bc-hint" style={{ marginBottom: 12 }}>
        {t("fx.hbmap.click_hint")}
      </p>

      <ParisChoropleth
        items={items}
        height={460}
        formatValue={formatValue}
        unitLabel={t("fx.hbmap.emprunts")}
        onTileClick={handleTileClick}
        showRanking
      />

      {nonLocalised.capital_restant > 0 && (
        <p className="fx-hbmap-footnote muted">
          <b>{t("fx.hbmap.non_loc")}</b> · {formatValue(nonLocalised.capital_restant)}{" "}
          ({Math.round(nonLocalised.share * 100)} %) {t("fx.hbmap.non_loc_desc")}
        </p>
      )}

      <ArrondissementGarantiesFiche
        arr={openArr}
        year={year}
        onClose={() => setOpenArr(null)}
      />
    </div>
  );
}
