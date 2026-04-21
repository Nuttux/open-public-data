"use client";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import BarRow from "@/components/fusion/BarRow";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import { fmtDec, fmtInt } from "@/lib/fmt";
import type { LogementSocialData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function LogementSocialClient({ d }: { d: LogementSocialData }) {
  const t = useT();
  const { locale } = useLocale();
  const gap = d.sruRatio - d.sruTarget;
  const gapDir: "up" | "down" | "flat" = gap > 0.1 ? "up" : gap < -0.1 ? "down" : "flat";
  const arrSuf = (n: number) => (n === 1 ? t("fx.s.arr.1_suffix") : t("fx.s.arr.suffix"));

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.log.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.log.title.before")}
            <em>{t("fx.log.title.em")}</em>
            {t("fx.log.title.mid")}
            <br />
            {t("fx.log.title.b")}
            <b>{t("fx.log.title.b_b")}</b>
            {t("fx.log.title.b_after")}
          </h1>
          <p className="fx-page-lede">{fill(t("fx.log.lede"), { year: d.year })}</p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/logement-social"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.log.s01.kind")}
            title={
              <>
                {t("fx.log.s01.title.before")}
                <em>{t("fx.log.s01.title.em")}</em>
                {t("fx.log.s01.title.after")}
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.log.s01.hero_label"), { year: d.year })}
              value={fmtDec(d.sruRatio, 1)}
              unit="%"
              delta={{
                direction: gapDir,
                value: `${fmtDec(Math.abs(gap), 1)} ${t("fx.log.s01.hero_pt")}`,
                base: fill(t("fx.log.s01.hero_base"), { target: String(d.sruTarget) }),
              }}
              caption={fill(t("fx.log.s01.hero_cap"), { stock: fmtInt(d.stockTotal) })}
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: t("fx.log.s01.kpi.stock"),
                  value: fmtInt(d.stockTotal),
                  delta: t("fx.log.s01.kpi.stock_delta"),
                },
                {
                  label: fill(t("fx.log.s01.kpi.new"), { year: d.year }),
                  value: fmtInt(d.nouveauxParAn),
                  delta: fill(t("fx.log.s01.kpi.new_delta"), { n: fmtInt(d.nbOperations) }),
                },
                {
                  label: t("fx.log.s01.kpi.cible"),
                  value: `${d.sruTarget} %`,
                  delta: t("fx.log.s01.kpi.cible_delta"),
                },
                {
                  label: t("fx.log.s01.kpi.ecart"),
                  value: `${gap >= 0 ? "+" : "−"} ${fmtDec(Math.abs(gap), 1)} pt`,
                  delta: gap < 0 ? t("fx.log.s01.kpi.deficit") : t("fx.log.s01.kpi.atteinte"),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.log.s02.kind")}
            title={
              <>
                {t("fx.log.s02.title.before")}
                <em>{t("fx.log.s02.title.em")}</em>
              </>
            }
            subtitle={t("fx.log.s02.sub")}
          />
          <BarRow
            header={{
              left: (
                <>
                  {t("fx.log.s02.bar.left")} <b>{d.year}</b>
                </>
              ),
              right: (
                <>
                  {t("fx.log.s02.bar.right")}{" "}
                  <b>{fill(t("fx.log.s02.bar.right_v"), { n: fmtInt(d.nouveauxParAn) })}</b>
                </>
              ),
            }}
            items={d.byArrondissement.map((a) => ({
              label:
                a.arr === 1
                  ? t("fx.log.s02.arr1_label")
                  : fill(t("fx.log.s02.arr_label"), { arr: a.arr }) + arrSuf(a.arr),
              value: a.logements,
              display: fmtInt(a.logements),
              unit: t("fx.log.s02.unit"),
            }))}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.log.s03.kind")}
            title={
              <>
                {t("fx.log.s03.title.before")}
                <em>{t("fx.log.s03.title.em")}</em>
                {t("fx.log.s03.title.after")}
              </>
            }
            subtitle={t("fx.log.s03.sub")}
          />
          <div className="fx-sources">
            {d.bailleurs.slice(0, 3).map((b) => (
              <div key={b.name}>
                <div className="n" style={{ color: b.color }}>
                  {trLabel(b.type, locale)}
                </div>
                <h3>{b.name}</h3>
                <p>{trLabel(b.description, locale)}</p>
                <span
                  style={{
                    fontFamily: "var(--f-disp)",
                    fontWeight: 700,
                    fontSize: 22,
                    color: b.color,
                  }}
                >
                  ~ {b.share} %
                </span>
                <span
                  style={{
                    fontFamily: "var(--f-mono)",
                    fontSize: 11,
                    color: "var(--muted)",
                    marginLeft: 8,
                  }}
                >
                  {t("fx.log.s03.du_parc")}
                </span>
              </div>
            ))}
          </div>
          <div className="fx-sources" style={{ marginTop: 1 }}>
            {d.bailleurs.slice(3).map((b) => (
              <div key={b.name}>
                <div className="n" style={{ color: b.color }}>
                  {trLabel(b.type, locale)}
                </div>
                <h3>{b.name}</h3>
                <p>{trLabel(b.description, locale)}</p>
                <span
                  style={{
                    fontFamily: "var(--f-disp)",
                    fontWeight: 700,
                    fontSize: 22,
                    color: b.color,
                  }}
                >
                  ~ {b.share} %
                </span>
                <span
                  style={{
                    fontFamily: "var(--f-mono)",
                    fontSize: 11,
                    color: "var(--muted)",
                    marginLeft: 8,
                  }}
                >
                  {t("fx.log.s03.du_parc")}
                </span>
              </div>
            ))}
          </div>
          <p className="fx-note">
            <b>{t("fx.s.methode")}</b> : {t("fx.log.s03.note")}
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.log.s04.kind")}
            title={
              <>
                {t("fx.log.s04.title.before")}
                <em>{t("fx.log.s04.title.em")}</em>
              </>
            }
            subtitle={t("fx.log.s04.sub")}
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>{t("fx.log.s04.col.year")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.log.s04.col.logements")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.log.s04.col.evolution")}</th>
              </tr>
            </thead>
            <tbody>
              {d.yearsSummary
                .slice()
                .reverse()
                .map((y, i, arr) => {
                  const prev = arr[i + 1];
                  const delta =
                    prev && prev.logements > 0
                      ? ((y.logements - prev.logements) / prev.logements) * 100
                      : null;
                  return (
                    <tr key={y.year}>
                      <td className="rank">{y.year}</td>
                      <td className="num">{fmtInt(y.logements)}</td>
                      <td className="num muted">
                        {delta === null
                          ? "—"
                          : `${delta >= 0 ? "+" : "−"} ${fmtDec(Math.abs(delta), 0)} %`}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <p className="fx-note">
            <b>{t("fx.s.limite")}</b> : {t("fx.log.s04.note")}
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.log.src.kind")}
            title={
              <>
                {t("fx.s.verifiable")} <em>{t("fx.s.line_by_line")}</em>
              </>
            }
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.log.src.c1.n")}</div>
              <h3>{t("fx.log.src.c1.h")}</h3>
              <p>{t("fx.log.src.c1.p")}</p>
              <a href="https://www.paris.fr/logement-social" target="_blank" rel="noopener noreferrer">
                paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">{t("fx.log.src.c2.n")}</div>
              <h3>{t("fx.log.src.c2.h")}</h3>
              <p>{t("fx.log.src.c2.p")}</p>
              <a href="/methode#logement-social">{t("fx.s.methode_lien")}</a>
            </div>
            <div>
              <div className="n">{t("fx.log.src.c3.n")}</div>
              <h3>{t("fx.log.src.c3.h")}</h3>
              <p>{t("fx.log.src.c3.p")}</p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                {t("fx.s.github")}
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              {
                label: fill(t("fx.log.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/map/arrondissements_stats_${d.year}.json`,
              },
              { label: t("fx.log.src.export.geo"), href: "/data/map/arrondissements.geojson" },
              { label: t("fx.log.src.export.method"), href: "/methode#logement-social" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="06" kind={t("fx.log.s06.kind")} title={t("fx.log.s06.title")} />
          <div className="fx-grid-tiles">
            <TileCard
              href="/investissements"
              number={t("fx.log.s06.t1.n")}
              kind={t("fx.log.s06.t1.kind")}
              title={t("fx.log.s06.t1.title")}
              description={t("fx.log.s06.t1.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path
                    d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z"
                    fill="none"
                    stroke="#0a0a0a"
                    strokeWidth="1.5"
                  />
                  {[
                    [60, 34],
                    [110, 30],
                    [140, 36],
                    [72, 70],
                    [158, 68],
                  ].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#0a0a0a" />
                  ))}
                  <circle cx="118" cy="54" r="4" fill="#e11d1d" />
                </svg>
              }
              kpi="2,1"
              kpiUnit="Md €"
              kpiDelta={t("fx.log.s06.t1.delta")}
            />
            <TileCard
              href="/qui-recoit"
              number={t("fx.log.s06.t2.n")}
              kind={t("fx.log.s06.t2.kind")}
              title={t("fx.log.s06.t2.title")}
              description={t("fx.log.s06.t2.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  {[14, 28, 42, 56, 70, 84].map((y, i) => (
                    <g key={y}>
                      <rect x="10" y={y - 1} width="4" height="4" fill="#9099a6" />
                      <rect x="20" y={y - 1} width={90 - i * 12} height="6" fill="#0a0a0a" />
                    </g>
                  ))}
                </svg>
              }
              kpi="1,35"
              kpiUnit="Md €"
              kpiDelta="2024"
            />
            <TileCard
              href="/dette-patrimoine"
              number={t("fx.log.s06.t3.n")}
              kind={t("fx.log.s06.t3.kind")}
              title={t("fx.log.s06.t3.title")}
              description={t("fx.log.s06.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="32" y="10" width="60" height="40" fill="#0a0a0a" />
                  <rect x="32" y="52" width="60" height="24" fill="#0a0a0a" opacity=".75" />
                  <rect x="108" y="10" width="60" height="46" fill="#0a0a0a" />
                  <rect x="108" y="58" width="60" height="32" fill="#e11d1d" />
                </svg>
              }
              kpi="36"
              kpiUnit="Md €"
              kpiDelta={t("fx.log.s06.t3.delta")}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
