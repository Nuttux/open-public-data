"use client";

import Link from "next/link";
import type { ArrondissementLogementData } from "@/lib/fusion-data";
import { useT } from "@/lib/localeContext";
import { fill, fmtDec, fmtInt } from "@/lib/fmt";
import { useCity } from "./CityContext";
import FicheKpis from "./FicheKpis";

export default function ArrondissementLogementFiche({
  data,
  topN = 6,
}: {
  data: ArrondissementLogementData;
  topN?: number;
}) {
  const t = useT();
  const { basePath } = useCity();
  const shown = data.projects.slice(0, topN);
  const remaining = data.projects.length - shown.length;

  return (
    <div className="fx-arr-log-fiche">
      <FicheKpis
        items={[
          { label: fill(t("fx.arr_log.kpi.logements"), { year: data.year }), value: fmtInt(data.totalLogements) },
          { label: t("fx.arr_log.kpi.operations"), value: data.nbOperations },
          { label: t("fx.arr_log.kpi.part_ville"), value: <>{fmtDec(data.shareCity, 1)}{" "}</>, unit: "%" },
          { label: t("fx.arr_log.kpi.rang"), value: <>#{data.rank}</> },
        ]}
      />

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">
          {fill(t("fx.arr_log.top.head"), { n: topN, year: data.year })}
        </div>
        <ul className="fx-arr-log-list">
          {shown.map((p, i) => (
            <li key={p.id} className="fx-arr-log-item">
              <span className="fx-arr-log-rank tnum">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="fx-arr-log-meta">
                <div className="fx-arr-log-addr">{p.adresse}</div>
                <div className="fx-arr-log-sub">
                  <span className="fx-arr-log-bailleur">{p.bailleur}</span>
                  <span className="fx-arr-log-sep">·</span>
                  <span className="fx-arr-log-nature">{p.natureProgramme}</span>
                </div>
              </div>
              <div className="fx-arr-log-count">
                <span className="fx-arr-log-count-v tnum">{fmtInt(p.nbLogements)}</span>
                <span className="fx-arr-log-count-u">{t("fx.arr_log.unit")}</span>
              </div>
            </li>
          ))}
        </ul>
        {remaining > 0 && (
          <div className="fx-arr-log-more">
            <Link href={`${basePath}/logement/arrondissement/${data.slug}`} scroll={false}>
              {fill(t("fx.arr_log.see_all"), { n: remaining })}
            </Link>
          </div>
        )}
      </section>

      {data.byBailleur.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.arr_log.bailleurs.head")}</div>
          <ul className="fx-arr-log-bailleurs">
            {data.byBailleur.map((b) => {
              const pct = data.totalLogements > 0
                ? (b.nbLogements / data.totalLogements) * 100
                : 0;
              return (
                <li key={b.name} className="fx-arr-log-bailleur-row">
                  <span className="fx-arr-log-bailleur-name">{b.name}</span>
                  <span className="fx-arr-log-bailleur-ops">
                    {b.nbOperations}{" "}
                    {b.nbOperations > 1
                      ? t("fx.arr_log.ops_plural")
                      : t("fx.arr_log.ops_singular")}
                  </span>
                  <span className="fx-arr-log-bailleur-v tnum">
                    {fmtInt(b.nbLogements)}
                    <span className="fx-arr-log-bailleur-pct">
                      {" "}
                      · {fmtDec(pct, 0)} %
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
