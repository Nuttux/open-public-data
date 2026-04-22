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
import Tip from "@/components/fusion/Tip";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import QuiRecoitExplorer from "./QuiRecoitExplorer";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { QuiRecoitData } from "@/lib/fusion-data";
import { slugifyLabel } from "@/lib/projet-utils";
import { useT } from "@/lib/localeContext";

type QuiRecoitIndex = { availableYears: number[]; previewYears?: number[] };

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
            <b>
              {fmtInt(d.nbSubventions)}{" "}
              <Tip label={t("fx.qr.subv.tip")}>{t("fx.qr.lede.subv")}</Tip>
            </b>
            {fill(t("fx.qr.lede.versees"), { year: d.year })}
            {t("fx.qr.lede.c.pre")}
            <Tip label={t("fx.qr.lede.operateurs.tip")}>{t("fx.qr.lede.operateurs")}</Tip>
            {t("fx.qr.lede.c.post")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={idx.availableYears.slice().sort((a, b) => a - b)}
              previewYears={idx.previewYears ?? []}
              current={d.year}
              basePath="/qui-recoit"
              label={t("fx.s.year_label")}
            />
          </div>
          {(idx.previewYears ?? []).includes(d.year) && (
            <div className="fx-preview-banner" role="note">
              <span className="fx-preview-tag">Aperçu</span>
              <span>
                Données {d.year} issues des délibérations du Conseil de Paris,
                complétées par les transferts structurels du Budget Primitif
                (CASVP, AGOSPAP, caisses des écoles). Non-consolidées — la
                version officielle paraît sur data.gouv l&apos;année suivante.
                Deux écarts connus&nbsp;:
                {" "}(i) les subventions en capital aux bailleurs sociaux sont
                comptées en totalité au vote, vs étalées sur la durée des
                prêts dans le consolidé ;
                {" "}(ii) certaines subventions pluri-annuelles (CPO) sont
                comptabilisées en année de vote.
              </span>
            </div>
          )}
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
              delta={
                d.isPreview
                  ? {
                      direction: "flat",
                      value: "partiel",
                      base: `aperçu non consolidé`,
                    }
                  : {
                      direction: dir,
                      value: `${fmtDec(Math.abs(d.deltaMontantPct), 1)} %`,
                      base: fill(t("fx.qr.s01.hero_base"), { year: String(d.previousYear) }),
                    }
              }
              caption={
                <>
                  {t("fx.qr.s01.hero_cap.a")}
                  <b>{fmtInt(d.nbSubventions)}</b>
                  {t("fx.qr.s01.hero_cap.b.pre")}
                  <Tip label={t("fx.qr.avenants.tip")}>{t("fx.qr.s01.hero_cap.b.avenants")}</Tip>
                  {t("fx.qr.s01.hero_cap.b.post")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: <Tip label={t("fx.qr.s01.kpi.versees.tip")}>{t("fx.qr.s01.kpi.versees")}</Tip>,
                  value: fmtInt(d.nbSubventions),
                  delta: d.isPreview
                    ? "extraction en cours"
                    : fill(t("fx.qr.s01.kpi.versees_delta"), {
                        arrow,
                        pct: fmtDec(Math.abs(d.deltaNbPct), 1),
                        year: String(d.previousYear),
                      }),
                },
                {
                  label: <Tip label={t("fx.qr.s01.kpi.mediane.tip")}>{t("fx.qr.s01.kpi.mediane")}</Tip>,
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
            kind={<Tip label={t("fx.qr.s02.kind.tip")}>{t("fx.qr.s02.kind")}</Tip>}
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
              type: y.preview ? ("vote" as const) : ("execute" as const),
            }))}
            activeYear={d.year}
            activeBadge={(() => {
              const active = d.yearsSummary.find((y) => y.year === d.year);
              const label = active?.preview ? "voté" : "exéc.";
              return `${d.year} ${label}`;
            })()}
          />
          {d.isPreview ? (
            <div className="fx-movers-muted">
              Comparaisons par bénéficiaire masquées : les données {d.year}
              {" "}(délibérations du Conseil de Paris) ne couvrent pas encore
              l&apos;année complète. Elles réapparaîtront au fil des sessions.
            </div>
          ) : (() => {
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
                href={d.isPreview
                  ? "https://a06-v7.apps.paris.fr/a06/jsp/site/Portal.jsp?page_id=3"
                  : "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/"}
                target="_blank"
                rel="noopener noreferrer"
              >
                {d.isPreview ? t("fx.s.deliberations") : t("fx.s.opendata")}
              </a>
            </div>
            <div>
              <div className="n">{t("fx.qr.src.c2.n")}</div>
              <h3>{t("fx.qr.src.c2.h")}</h3>
              <p>{t("fx.qr.src.c2.p")}</p>
              <a href="/methode?tool=subventions#outils">{t("fx.s.methode_lien")}</a>
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
          <p className="fx-note" style={{ marginTop: 10 }}>
            {t("fx.qr.src.freshness_note")}
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
              { label: t("fx.qr.src.export.method"), href: "/methode?tool=subventions#outils" },
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