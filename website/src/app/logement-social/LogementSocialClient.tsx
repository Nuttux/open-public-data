"use client";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import TileCard from "@/components/fusion/TileCard";
import WaitSimulator from "@/components/fusion/WaitSimulator";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import { fmtDec, fmtInt } from "@/lib/fmt";
import type { LogementSocialData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyBailleur } from "@/lib/projet-utils";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

/** Produces 5-7 rounded Y-axis ticks covering [min, max] with a nice round
 *  step (1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, …). Returned top→bottom. */
const niceYTicks = (min: number, max: number, target = 5): number[] => {
  if (max <= min) return [max];
  const niceSteps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  const rawStep = (max - min) / target;
  const step = niceSteps.find((s) => s >= rawStep) ?? niceSteps[niceSteps.length - 1];
  const top = Math.ceil(max / step) * step;
  const bottom = Math.max(0, Math.floor(min / step) * step);
  const ticks: number[] = [];
  for (let v = top; v >= bottom - 1e-9; v -= step) ticks.push(Math.round(v));
  return ticks;
};

export default function LogementSocialClient({ d }: { d: LogementSocialData }) {
  const t = useT();
  const { locale } = useLocale();
  const gap = d.sruRatio - d.sruTarget;
  const gapDir: "up" | "down" | "flat" = gap > 0.1 ? "up" : gap < -0.1 ? "down" : "flat";

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.log.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.log.title.before")}
            <em>{t("fx.log.title.em")}</em>
            {t("fx.log.title.mid")} {t("fx.log.title.b")}
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

      {/* §01 — Vue d'ensemble SRU */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.log.s01.kind")}
            title={
              <>
                {t("fx.log.s01.title.before")}
                <em><Tip label={t("fx.log.sru.tip")}>{t("fx.log.s01.title.em")}</Tip></em>
                {t("fx.log.s01.title.after")}
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.log.s01.hero_label"), { year: d.sruYear })}
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
                  label: <Tip label={t("fx.log.s01.kpi.stock.tip")}>{t("fx.log.s01.kpi.stock")}</Tip>,
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
          <p className="fx-note">
            <b>{t("fx.log.s04.sru_target_label")}</b> : {t("fx.log.s04.sru_target_note")}
          </p>
        </div>
      </section>

      {/* §02 — Par arrondissement */}
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
          <ParisChoropleth
            items={d.byArrondissement.map((a) => ({
              arr: a.arr,
              amount: a.logements,
              count: a.operations,
            }))}
            formatValue={(n) => `${fmtInt(n)} ${t("fx.log.s02.unit_long")}`}
            unitLabel={t("fx.log.s02.unit_ops")}
          />
        </div>
      </section>

      {/* §03 — Bailleurs */}
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
            {d.bailleurs.map((b) => (
              <Link
                key={b.name}
                href={`/dette-patrimoine/bailleur/${slugifyBailleur(b.name)}`}
                className="fx-bailleur-card"
              >
                <div className="n" style={{ color: b.color }}>
                  {trLabel(b.type, locale)}
                </div>
                <h3>{b.name}</h3>
                <p>{trLabel(b.description, locale)}</p>
                <div className="fx-bailleur-share-row">
                  <span className="fx-bailleur-share" style={{ color: b.color }}>
                    ~{b.share} %
                  </span>
                  <span className="fx-bailleur-share-unit">{t("fx.log.s03.du_parc")}</span>
                </div>
              </Link>
            ))}
          </div>
          <p className="fx-note">
            <b>{t("fx.s.methode")}</b> : {t("fx.log.s03.note")}
          </p>
        </div>
      </section>

      {/* §04 — Tension locative */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.log.tension.kind")}
            title={
              <>
                {t("fx.log.tension.title.before")}
                <em>{t("fx.log.tension.title.em")}</em>
                {t("fx.log.tension.title.after")}
              </>
            }
            subtitle={t("fx.log.tension.lede")}
          />
          <div className="fx-overview">
            <div className="fx-funnel-wrap">
              <div className="fx-funnel-kicker">{t("fx.log.tension.funnel.kicker")}</div>
              <div className="fx-funnel">
                <div className="fx-funnel-step fx-funnel-step-1">
                  <span className="v tnum">{fmtInt(d.tension.demandesActives)}</span>
                  <span className="lbl">{t("fx.log.tension.funnel.s1.lbl")}</span>
                </div>
                <div className="fx-funnel-step fx-funnel-step-2">
                  <span className="v tnum">{fmtInt(d.tension.passeesCommission)}</span>
                  <span className="lbl">{t("fx.log.tension.funnel.s2.lbl")}</span>
                </div>
                <div className="fx-funnel-step fx-funnel-step-3">
                  <span className="v tnum">{fmtInt(d.tension.attributions)}</span>
                  <span className="lbl">{t("fx.log.tension.funnel.s3.lbl")}</span>
                </div>
              </div>
              <p className="fx-funnel-foot">
                {fill(t("fx.log.tension.funnel.foot"), { ratio: d.tension.ratio })}
              </p>
            </div>
            <div className="fx-stat-cards">
              <div className="fx-stat-card">
                <div className="kicker">{t("fx.log.tension.kpi.ratio.kicker")}</div>
                <div className="v tnum">
                  {d.tension.ratio}
                  <span className="u">{t("fx.log.tension.kpi.ratio.u")}</span>
                </div>
                <p>{t("fx.log.tension.kpi.ratio.p")}</p>
              </div>
              <div className="fx-stat-card">
                <div className="kicker">{t("fx.log.tension.kpi.delai.kicker")}</div>
                <div className="v tnum">
                  {fmtDec(d.tension.delaiMedian, 1)}
                  <span className="u">{t("fx.log.tension.kpi.delai.u")}</span>
                </div>
                <p>{t("fx.log.tension.kpi.delai.p")}</p>
              </div>
              <div className="fx-stat-card">
                <div className="kicker">{t("fx.log.tension.kpi.nonpourvus.kicker")}</div>
                <div className="v tnum">{fmtInt(d.tension.nonPourvus)}</div>
                <p>{t("fx.log.tension.kpi.nonpourvus.p")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* §05 — Simulateur */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.log.sim.kind")}
            title={
              <>
                {t("fx.log.sim.title.before")}
                <em>{t("fx.log.sim.title.em")}</em>
                {t("fx.log.sim.title.after")}
              </>
            }
            subtitle={t("fx.log.sim.sub")}
          />
          <WaitSimulator />
        </div>
      </section>

      {/* §06 — Production annuelle */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.log.s04.kind")}
            title={
              <>
                {t("fx.log.s04.title.before")}
                <em>{t("fx.log.s04.title.em")}</em>
              </>
            }
            subtitle={t("fx.log.s04.sub")}
          />
          {(() => {
            const vals = d.yearsSummary.map((y) => y.logements);
            const ticks = niceYTicks(Math.min(...vals), Math.max(...vals));
            return (
              <BudgetTimeline
                points={d.yearsSummary.map((y) => ({
                  year: y.year,
                  value: y.logements,
                  type: "execute" as const,
                }))}
                activeYear={d.year}
                annotations={[
                  { year: 2020, label: t("fx.log.s04.ann.covid") },
                  { year: 2024, label: t("fx.log.s04.ann.jo") },
                ]}
                yTicks={ticks}
                formatYTick={(v) => fmtInt(v)}
                activeBadge={`${d.year} · ${fmtInt(d.nouveauxParAn)} ${t("fx.log.s02.unit_long")}`}
                showStatus={false}
                ariaLabel={t("fx.log.s04.aria")}
              />
            );
          })()}
          <p className="fx-note">
            <b>{t("fx.s.limite")}</b> : {t("fx.log.s04.note")}
          </p>
        </div>
      </section>

      {/* §07 — Sources & méthode */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="07"
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
              <a href="/methode?tool=logement-social#outils">{t("fx.s.methode_lien")}</a>
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
              { label: t("fx.log.src.export.method"), href: "/methode?tool=logement-social#outils" },
            ]}
          />
        </div>
      </section>

      {/* §08 — Explorer plus loin */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="08" kind={t("fx.log.s06.kind")} title={t("fx.log.s06.title")} />
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
                  <circle cx="118" cy="54" r="4" fill="#a67638" />
                </svg>
              }
              kpi="2,6"
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
              kpi="312"
              kpiUnit="M €"
              kpiDelta={t("fx.log.s06.t2.delta")}
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
                  <rect x="108" y="58" width="60" height="32" fill="#a67638" />
                </svg>
              }
              kpi="26"
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
