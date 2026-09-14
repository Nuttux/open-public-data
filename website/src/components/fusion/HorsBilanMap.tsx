"use client";

import ParisChoropleth from "./ParisChoropleth";
import { useCity } from "./CityContext";
import Link from "@/components/LocalizedLink";
import { useT, useLocale } from "@/lib/localeContext";
import { sufOrdinal } from "@/lib/fmt";
import { useFmt } from "@/lib/use-fmt";

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

// Central arrondissements (1-4) merged into Paris Centre (c_ar = 0)
const CENTRAL_ARRS = [1, 2, 3, 4];

export default function HorsBilanMap({ byArrondissement, nonLocalised, totalCapital, year }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { fmtBillions, fmtMillions } = useFmt();
  const { basePath } = useCity();

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
   * ParisChoropleth consolide arr 1-4 → c_ar=0 (Paris Centre). La fiche
   * s'ouvre désormais en drawer via une vraie route — c_ar=0 est agrégé côté
   * loader (loadArrondissementGaranties(0)). Tuiles sans emprunt → null
   * (non cliquables).
   */
  const hrefFor = (cAr: number): string | null => {
    const hasData = cAr === 0
      ? byArrondissement.some((a) => CENTRAL_ARRS.includes(a.arr) && a.count_emprunts > 0)
      : byArrondissement.some((a) => a.arr === cAr && a.count_emprunts > 0);
    if (!hasData) return null;
    return `${basePath}/dette/garanties/arrondissement/${cAr}?year=${year}`;
  };

  /* La carte ouvre chaque fiche d'un clic sur une tuile, sans lien que le
   * clavier ou un moteur puisse suivre. La même liste en liens simples, sous
   * la carte : Paris Centre (1er–4e fusionnés), puis les arrondissements qui
   * portent au moins un emprunt garanti. */
  const centre = byArrondissement.filter((a) => CENTRAL_ARRS.includes(a.arr));
  const listItems = [
    ...(centre.some((a) => a.count_emprunts > 0)
      ? [{ key: 0, label: t("fx.hbmap.centre"), amount: centre.reduce((sum, a) => sum + a.capital_restant, 0) }]
      : []),
    ...byArrondissement
      .filter((a) => !CENTRAL_ARRS.includes(a.arr) && a.count_emprunts > 0)
      .sort((a, b) => a.arr - b.arr)
      .map((a) => ({ key: a.arr, label: `${a.arr}${sufOrdinal(a.arr, locale)}`, amount: a.capital_restant })),
  ];

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
        hrefFor={hrefFor}
        showRanking
      />

      {listItems.length > 0 && (
        <nav className="fx-hbmap-list" aria-label={t("fx.hbmap.list_aria")}>
          {listItems.map((it) => {
            const href = hrefFor(it.key);
            return href ? (
              <Link key={it.key} href={href} scroll={false}>
                {it.label} <span className="tnum">{formatValue(it.amount)}</span>
              </Link>
            ) : null;
          })}
        </nav>
      )}

      {nonLocalised.capital_restant > 0 && (
        <p className="fx-hbmap-footnote muted">
          <b>{t("fx.hbmap.non_loc")}</b> · {formatValue(nonLocalised.capital_restant)}{" "}
          ({Math.round(nonLocalised.share * 100)} %) {t("fx.hbmap.non_loc_desc")}
        </p>
      )}
    </div>
  );
}
