"use client";

import Link from "next/link";
import type { ArrondissementLogementData } from "@/lib/fusion-data";
import { useT } from "@/lib/localeContext";
import { fmtDec, fmtInt } from "@/lib/fmt";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function ArrondissementLogementFiche({
  data,
  topN = 6,
}: {
  data: ArrondissementLogementData;
  topN?: number;
}) {
  const t = useT();
  const shown = data.projects.slice(0, topN);
  const remaining = data.projects.length - shown.length;

  return (
    <div className="fx-arr-log-fiche">
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {fill(t("fx.arr_log.kpi.logements"), { year: data.year })}
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtInt(data.totalLogements)}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.arr_log.kpi.operations")}</div>
          <div className="fx-fiche-kpi-value tnum">{data.nbOperations}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.arr_log.kpi.part_ville")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtDec(data.shareCity, 1)} <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.arr_log.kpi.rang")}</div>
          <div className="fx-fiche-kpi-value tnum">#{data.rank}</div>
        </div>
      </div>

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
            <Link href={`/logement-social/arrondissement/${data.slug}`} scroll={false}>
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
