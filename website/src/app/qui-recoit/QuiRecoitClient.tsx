"use client";
import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import QuiRecoitExplorer from "./QuiRecoitExplorer";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { QuiRecoitData } from "@/lib/fusion-data";
import { slugifyLabel } from "@/lib/projet-utils";
import { useT } from "@/lib/localeContext";

type QuiRecoitIndex = { availableYears: number[] };

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function QuiRecoitClient({
  idx,
  d,
}: {
  idx: QuiRecoitIndex;
  d: QuiRecoitData;
}) {
  const t = useT();
  const dir: "up" | "down" | "flat" =
    d.deltaMontantPct > 0.1 ? "up" : d.deltaMontantPct < -0.1 ? "down" : "flat";
  const arrow = dir === "down" ? "↓" : dir === "flat" ? "→" : "↑";

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-themes", label: t("fx.toc.themes") },
          { id: "sec-top", label: t("fx.toc.top_benef") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />


      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.qr.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.qr.title.before")}
            <em>{t("fx.qr.title.em")}</em>
            {t("fx.qr.title.after")}
          </h1>
          <p className="fx-page-lede">
            <b>{fmtInt(d.nbSubventions)}{t("fx.qr.lede.a")}</b>
            {fill(t("fx.qr.lede.b"), { year: d.year })}
            {t("fx.qr.lede.c")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={idx.availableYears.slice().sort((a, b) => a - b)}
              current={d.year}
              basePath="/qui-recoit"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.qr.s01.kind")}
            title={
              <>
                {t("fx.qr.s01.title.before")}
                <em>{t("fx.qr.s01.title.em")}</em>
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.qr.s01.hero_label"), { year: d.year })}
              value={fmtBillions(d.total)}
              unit={t("fx.s.md_eur")}
              delta={{
                direction: dir,
                value: `${fmtDec(Math.abs(d.deltaMontantPct), 1)} %`,
                base: fill(t("fx.qr.s01.hero_base"), { year: String(d.previousYear) }),
              }}
              caption={
                <>
                  {t("fx.qr.s01.hero_cap.a")}
                  <b>{fmtInt(d.nbSubventions)}</b>
                  {t("fx.qr.s01.hero_cap.b")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: t("fx.qr.s01.kpi.versees"),
                  value: fmtInt(d.nbSubventions),
                  delta: fill(t("fx.qr.s01.kpi.versees_delta"), {
                    arrow,
                    pct: fmtDec(Math.abs(d.deltaNbPct), 1),
                    year: String(d.previousYear),
                  }),
                },
                {
                  label: t("fx.qr.s01.kpi.mediane"),
                  value:
                    d.medianSubvention >= 1_000_000
                      ? fmtMillions(d.medianSubvention, 1) + " M"
                      : fmtInt(d.medianSubvention / 1_000) + " k",
                  unit: "€",
                  delta: t("fx.qr.s01.kpi.mediane_delta"),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-themes">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.qr.s02.kind")}
            title={
              <>
                {t("fx.qr.s02.title.before")}
                <em>{t("fx.qr.s02.title.em")}</em>
                {t("fx.qr.s02.title.after")}
              </>
            }
            subtitle={t("fx.qr.s02.sub")}
          />
          <StackedBarTheme
            items={d.byTheme.map((th) => ({ theme: th.theme, amount: th.amount, count: th.count }))}
            total={d.total}
            concentrationTop10Pct={d.concentrationTop10Pct}
            year={d.year}
            basePath="/qui-recoit"
            entityNoun={t("fx.qr.s02.entity_noun")}
            paretoContrast={t("fx.qr.s02.pareto_contrast")}
            hrefBuilder={(theme) =>
              `/qui-recoit/theme/${slugifyLabel(theme)}?year=${d.year}`
            }
          />
        </div>
      </section>

      <Suspense fallback={null}>
        <QuiRecoitExplorer
          year={d.year}
          top10={d.top10}
          themes={d.availableThemes}
          concentrationTop10Pct={d.concentrationTop10Pct}
        />
      </Suspense>

      <section className="fx-section" id="sec-top">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.qr.s05.kind")}
            title={
              <>
                {t("fx.qr.s05.title.before")}
                <em>{fill(t("fx.qr.s05.title.em"), { year: String(d.yearsSummary[0]?.year ?? 2019) })}</em>
                {t("fx.qr.s05.title.after")}
              </>
            }
            subtitle={t("fx.qr.s05.sub")}
          />
          <BudgetTimeline
            points={d.yearsSummary.map((y) => ({
              year: y.year,
              value: y.total / 1_000_000_000,
              type: "execute" as const,
            }))}
            activeYear={d.year}
          />
          {(() => {
            const maxHausse = Math.max(1, ...d.movers.hausses.map((m) => Math.abs(m.delta)));
            const maxBaisse = Math.max(1, ...d.movers.baisses.map((m) => Math.abs(m.delta)));
            return (
              <div className="fx-movers">
                <div className="fx-movers-col">
                  <div className="fx-movers-head">
                    <span>
                      {t("fx.qr.s05.movers.hausses")}
                      <b>{fill(t("fx.qr.s05.movers.vs"), { year: String(d.previousYear) })}</b>
                    </span>
                    <span>{t("fx.qr.s05.movers.variation")}</span>
                  </div>
                  {d.movers.hausses.map((m, i) => (
                    <Link
                      key={i}
                      href={`/qui-recoit/association/${encodeURIComponent(m.name)}`}
                      scroll={false}
                      className="fx-mover-row"
                    >
                      <span className="l">{m.name}</span>
                      <span className="v">
                        {m.amount >= 1e6 ? fmtMillions(m.amount, 1) + " M €" : fmtInt(m.amount / 1000) + " k €"}
                      </span>
                      <span className="mbar" aria-hidden="true">
                        <span className="mfill" style={{ width: `${(Math.abs(m.delta) / maxHausse) * 100}%` }} />
                      </span>
                      <span className="d up">↑ {fmtDec(m.delta, 1)} %</span>
                    </Link>
                  ))}
                </div>
                <div className="fx-movers-col">
                  <div className="fx-movers-head">
                    <span>
                      {t("fx.qr.s05.movers.baisses")}
                      <b>{fill(t("fx.qr.s05.movers.vs"), { year: String(d.previousYear) })}</b>
                    </span>
                    <span>{t("fx.qr.s05.movers.variation")}</span>
                  </div>
                  {d.movers.baisses.map((m, i) => (
                    <Link
                      key={i}
                      href={`/qui-recoit/association/${encodeURIComponent(m.name)}`}
                      scroll={false}
                      className="fx-mover-row"
                    >
                      <span className="l">{m.name}</span>
                      <span className="v">
                        {m.amount >= 1e6 ? fmtMillions(m.amount, 1) + " M €" : fmtInt(m.amount / 1000) + " k €"}
                      </span>
                      <span className="mbar" aria-hidden="true">
                        <span className="mfill" style={{ width: `${(Math.abs(m.delta) / maxBaisse) * 100}%` }} />
                      </span>
                      <span className="d down">↓ {fmtDec(Math.abs(m.delta), 1)} %</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.qr.src.kind")}
            title={
              <>
                {t("fx.s.verifiable")} <em>{t("fx.s.line_by_line")}</em>
              </>
            }
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.qr.src.c1.n")}</div>
              <h3>{fill(t("fx.qr.src.c1.h"), { year: d.year })}</h3>
              <p>{t("fx.qr.src.c1.p")}</p>
              <a
                href="https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("fx.s.opendata")}
              </a>
            </div>
            <div>
              <div className="n">{t("fx.qr.src.c2.n")}</div>
              <h3>{t("fx.qr.src.c2.h")}</h3>
              <p>{t("fx.qr.src.c2.p")}</p>
              <a href="/methode#subventions">{t("fx.s.methode_lien")}</a>
            </div>
            <div>
              <div className="n">{t("fx.qr.src.c3.n")}</div>
              <h3>{t("fx.qr.src.c3.h")}</h3>
              <p>{t("fx.qr.src.c3.p")}</p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                {t("fx.s.github")}
              </a>
            </div>
          </div>
          <p className="fx-note" style={{ marginTop: 22 }}>
            {t("fx.qr.src.scope_note")}
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.qr.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/subventions/beneficiaires_${d.year}.json`,
              },
              { label: t("fx.qr.src.export.json"), href: `/data/subventions/beneficiaires_${d.year}.json` },
              { label: t("fx.qr.src.export.treemap"), href: `/data/subventions/treemap_${d.year}.json` },
              { label: t("fx.qr.src.export.method"), href: "/methode#subventions" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-sources">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.qr.s06.kind")}
            title={t("fx.qr.s06.title")}
            subtitle={t("fx.qr.s06.sub")}
          />
          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number={t("fx.qr.s06.t1.n")}
              kind={t("fx.qr.s06.t1.kind")}
              title={t("fx.qr.s06.t1.title")}
              description={t("fx.qr.s06.t1.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 50 C 70 50 90 50 94 50" stroke="#0a0a0a" strokeWidth="10" fill="none" />
                  <rect x="92" y="40" width="16" height="20" fill="#0a0a0a" />
                  <path d="M 108 30 C 140 30 160 30 194 30" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <path d="M 108 50 C 140 50 160 60 194 60" stroke="#e11d1d" strokeWidth="7" fill="none" />
                  <path d="M 108 70 C 140 70 160 80 194 80" stroke="#0a0a0a" strokeWidth="4" fill="none" />
                </svg>
              }
              kpi={fmtBillions(d.total / 0.12, 1)}
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={fill(t("fx.qr.s06.t1.delta"), { year: d.year })}
            />
            <TileCard
              href="/marches-publics"
              number={t("fx.qr.s06.t2.n")}
              kind={t("fx.qr.s06.t2.kind")}
              title={t("fx.qr.s06.t2.title")}
              description={t("fx.qr.s06.t2.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="10" y="20" width="80" height="10" fill="#0a0a0a" />
                  <rect x="10" y="38" width="60" height="10" fill="#0a0a0a" />
                  <rect x="10" y="56" width="100" height="10" fill="#e11d1d" />
                  <rect x="10" y="74" width="40" height="10" fill="#0a0a0a" />
                  <rect x="120" y="20" width="70" height="10" fill="#9099a6" />
                  <rect x="120" y="56" width="60" height="10" fill="#9099a6" />
                </svg>
              }
              kpi="2,1"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={t("fx.qr.s06.t2.delta")}
            />
            <TileCard
              href="/logement-social"
              number={t("fx.qr.s06.t3.n")}
              kind={t("fx.qr.s06.t3.kind")}
              title={t("fx.qr.s06.t3.title")}
              description={t("fx.qr.s06.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" fill="#0a0a0a" />
                </svg>
              }
              kpi="24,5"
              kpiUnit="%"
              kpiDelta={t("fx.qr.s06.t3.delta")}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}