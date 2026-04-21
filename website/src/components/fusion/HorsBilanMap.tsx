"use client";

import ParisChoropleth from "./ParisChoropleth";
import { fmtBillions, fmtMillions } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

type ArrItem = {
  arr: number;
  capital_restant: number;
  count_emprunts: number;
  share_of_localized: number;
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

export default function HorsBilanMap({ byArrondissement, nonLocalised, totalCapital, year }: Props) {
  const t = useT();

  const items = byArrondissement
    .filter((a) => a.capital_restant > 0)
    .map((a) => ({
      arr: a.arr,
      amount: a.capital_restant,
      count: a.count_emprunts,
    }));

  const formatValue = (v: number) =>
    v >= 1e9 ? `${fmtBillions(v)} ${t("fx.s.md_eur")}` : `${fmtMillions(v, 0)} ${t("fx.s.m_eur")}`;

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

      <ParisChoropleth
        items={items}
        height={460}
        formatValue={formatValue}
        unitLabel={t("fx.hbmap.emprunts")}
        hrefFor={() => null}
        showRanking
      />

      {nonLocalised.capital_restant > 0 && (
        <p className="fx-hbmap-footnote muted">
          <b>{t("fx.hbmap.non_loc")}</b> · {formatValue(nonLocalised.capital_restant)}{" "}
          ({Math.round(nonLocalised.share * 100)} %) {t("fx.hbmap.non_loc_desc")}
        </p>
      )}
    </div>
  );
}
