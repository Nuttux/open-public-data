"use client";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import SignauxFaibles from "@/components/fusion/SignauxFaibles";
import ProjectMap from "@/components/fusion/ProjectMap";
import ProjetThumb from "@/components/fusion/ProjetThumb";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import PageTOC from "@/components/fusion/PageTOC";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { InvestissementsData } from "@/lib/fusion-data";
import { slugifyChapitre } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function InvestissementsClient({ d }: { d: InvestissementsData }) {
  const t = useT();
  const { locale } = useLocale();
  const trL = (s: string | undefined) => trLabel(s, locale);
  const ytrend = d.yearsSummary;
  const delta5y =
    ytrend.length >= 2
      ? ((ytrend[ytrend.length - 1].total - ytrend[0].total) / ytrend[0].total) * 100
      : 0;
  const delta5yDir: "up" | "down" | "flat" = delta5y > 0.1 ? "up" : delta5y < -0.1 ? "down" : "flat";

  const arrSuf = (n: number) => (n === 1 ? t("fx.s.arr.1_suffix") : t("fx.s.arr.suffix"));
  const geoLocTotal = d.byArrondissement.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-projets", label: t("fx.toc.projets") },
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-carte", label: t("fx.toc.carte") },
          { id: "sec-chapitre", label: t("fx.toc.chapitres") },
          { id: "sec-arrondissement", label: t("fx.toc.arrondissements") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-signaux", label: t("fx.toc.signaux") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.inv.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.inv.title.before")}
            <em>{t("fx.inv.title.em")}</em>
            {t("fx.inv.title.after")}
          </h1>
          <p className="fx-page-lede">
            {fmtInt(d.nbProjets)}{t("fx.inv.lede.a")}{d.year},{t("fx.inv.lede.b")}
            <b>{fill(t("fx.inv.lede.pct"), { pct: fmtDec(d.pctGeo, 0) })}</b>
            {t("fx.inv.lede.c")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/investissements"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-projets">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.inv.s01.kind")}
            title={
              <>
                {t("fx.inv.s01.title.before")}
                <em>{t("fx.inv.s01.title.em")}</em>
                {fill(t("fx.inv.s01.title.after"), { year: d.year })}
              </>
            }
          />
          <div className="fx-projet-grid">
            {d.topProjets.slice(0, 12).map((p, i) => (
              <Link
                key={p.id}
                href={`/investissements/projet/${encodeURIComponent(p.id)}`}
                className="fx-projet-card"
                scroll={false}
              >
                <div className="fx-projet-card-thumb">
                  <ProjetThumb photo={p.photo.photo} generic={p.photo.generic} typologie={p.photo.typologie} aspectRatio="4 / 3" fallbackLabel={p.name} />
                </div>
                <div className="fx-projet-card-body">
                  <div className="fx-projet-card-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="fx-projet-card-name">{(p.name ?? "—").slice(0, 90)}</div>
                  <div className="fx-projet-card-meta">
                    <span>
                      {p.arr > 0
                        ? fill(t("fx.inv.s01.arr"), { n: p.arr }) + arrSuf(p.arr)
                        : t("fx.s.transverse")}
                    </span>
                    <span className="fx-projet-card-amount">
                      {p.amount >= 1e6 ? `${fmtMillions(p.amount, 1)} M€` : `${fmtInt(p.amount / 1000)} k€`}
                    </span>
                  </div>
                  <div className="fx-projet-card-chapitre">{trL(p.chapitre)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.inv.s02.kind")}
            title={
              <>
                {t("fx.inv.s02.title.before")}
                <em>{t("fx.inv.s02.title.em")}</em>
                {t("fx.inv.s02.title.after")}
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.inv.s02.hero_label"), { year: d.year })}
              value={fmtBillions(d.total)}
              unit={t("fx.s.md_eur")}
              delta={{
                direction: delta5yDir,
                value: `${fmtDec(Math.abs(delta5y), 1)} %`,
                base: fill(t("fx.inv.s02.hero_base"), { year: String(ytrend[0]?.year ?? "") }),
              }}
              caption={
                <>
                  {t("fx.inv.s02.hero_cap.a")}
                  <b>{fmtBillions(d.totalHorsDette)} {t("fx.s.md_eur")}</b>.{" "}
                  {t("fx.inv.s02.hero_cap.b")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: t("fx.inv.s02.kpi.projets"),
                  value: fmtInt(d.nbProjets),
                  delta: t("fx.inv.s02.kpi.projets_delta"),
                },
                {
                  label: t("fx.inv.s02.kpi.geo"),
                  value: `${fmtDec(d.pctGeo, 0)} %`,
                  delta: fill(t("fx.inv.s02.kpi.geo_delta"), { n: fmtInt(d.nbGeo) }),
                },
                {
                  label: t("fx.inv.s02.kpi.top_chap"),
                  value: trL(d.byChapitre[0]?.label) || "—",
                  delta: d.byChapitre[0] ? fmtMillions(d.byChapitre[0].amount) + " M €" : "—",
                },
                {
                  label: t("fx.inv.s02.kpi.arr1"),
                  value: d.byArrondissement[0]
                    ? `${d.byArrondissement[0].arr}${arrSuf(d.byArrondissement[0].arr)}`
                    : "—",
                  delta: d.byArrondissement[0]
                    ? fmtMillions(d.byArrondissement[0].amount) + " M €"
                    : "—",
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-carte">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.inv.s03.kind")}
            title={
              <>
                {t("fx.inv.s03.title.before")}
                <em>{t("fx.inv.s03.title.em")}</em>
              </>
            }
            subtitle={fill(t("fx.inv.s03.sub"), { n: fmtInt(d.nbGeo) })}
          />
          <ProjectMap points={d.geoPoints} year={d.year} height={620} />
          <p className="fx-note">
            <b>{t("fx.inv.s03.note.b")}</b> :{" "}
            {fill(t("fx.inv.s03.note"), { pct: fmtDec(100 - d.pctGeo, 0) })}
          </p>
        </div>
      </section>

      <section className="fx-section" id="sec-chapitre">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.inv.s04.kind")}
            title={
              <>
                {t("fx.inv.s04.title.before")}
                <em>{t("fx.inv.s04.title.em")}</em>
              </>
            }
            subtitle={t("fx.inv.s04.sub")}
          />
          <StackedBarTheme
            items={d.byChapitre.map((c) => ({ theme: c.label, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={d.top10ProjetsPct}
            year={d.year}
            basePath="/investissements"
            kicker={fill(t("fx.inv.s04.kicker"), { year: d.year })}
            entityNoun={t("fx.inv.s04.entity_noun")}
            paretoContrast={t("fx.inv.s04.pareto_contrast")}
            hrefBuilder={(theme) => `/investissements/chapitre/${slugifyChapitre(theme)}`}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-arrondissement">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.inv.s05.kind")}
            title={
              <>
                {t("fx.inv.s05.title.before")}
                <em>{t("fx.inv.s05.title.em")}</em>
              </>
            }
            subtitle={t("fx.inv.s05.sub")}
          />
          <ParisChoropleth
            items={d.byArrondissement.map((a) => ({ arr: a.arr, amount: a.amount, count: a.count }))}
            height={420}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.inv.s06.kind")}
            title={
              <>
                {t("fx.inv.s06.title.before")}
                <em>{fill(t("fx.inv.s06.title.em"), { year: d.year })}</em>
              </>
            }
          />
          <BudgetTimeline
            points={ytrend.map((y) => ({
              year: y.year,
              value: y.total / 1_000_000_000,
              type: "execute" as const,
            }))}
            activeYear={d.year}
          />
          <p className="fx-note">
            <b>{t("fx.inv.s06.note.b")}</b> :{" "}
            {fill(t("fx.inv.s06.note"), { pct: Math.round(100 - d.pctGeo) })}
          </p>
        </div>
      </section>

      <section className="fx-section" id="sec-signaux">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("fx.inv.s07.kind")}
            title={
              <>
                {t("fx.inv.s07.title.before")}
                <em>{t("fx.inv.s07.title.em")}</em>
              </>
            }
            subtitle={t("fx.inv.s07.sub")}
          />
          <SignauxFaibles
            note={
              <>
                <b>{t("fx.s.methode")}</b> : {t("fx.inv.s07.signal.note")}
              </>
            }
            items={[
              {
                flag: t("fx.inv.s07.sig1.flag"),
                title: (d.topProjets[0]?.name ?? "—").slice(0, 60),
                body: fill(t("fx.inv.s07.sig1.body"), {
                  year: d.year,
                  m: fmtMillions(d.topProjets[0]?.amount ?? 0, 1),
                  pct: fmtDec(((d.topProjets[0]?.amount ?? 0) / d.total) * 100, 2),
                }),
                stats: [
                  {
                    label: t("fx.inv.s07.sig1.stat1"),
                    value: `${fmtMillions(d.topProjets[0]?.amount ?? 0, 1)} M €`,
                  },
                  {
                    label: t("fx.inv.s07.sig1.stat2"),
                    value:
                      d.topProjets[0] && d.topProjets[0].arr > 0
                        ? `${d.topProjets[0].arr}${arrSuf(d.topProjets[0].arr)}`
                        : t("fx.inv.s07.sig1.transv"),
                  },
                  {
                    label: t("fx.inv.s07.sig1.stat3"),
                    value: trL(d.topProjets[0]?.chapitre).slice(0, 14),
                  },
                ],
              },
              {
                flag: t("fx.inv.s07.sig2.flag"),
                title: d.byArrondissement[0]
                  ? `${d.byArrondissement[0].arr}${arrSuf(d.byArrondissement[0].arr)} ${t("fx.inv.s07.sig2.title.suffix")}`
                  : "—",
                body: fill(t("fx.inv.s07.sig2.body"), {
                  m: fmtMillions(d.byArrondissement[0]?.amount ?? 0, 0),
                  pct: fmtDec(
                    ((d.byArrondissement[0]?.amount ?? 0) / (geoLocTotal || 1)) * 100,
                    0
                  ),
                }),
                stats: [
                  {
                    label: t("fx.inv.s07.sig2.stat1"),
                    value: `${fmtMillions(d.byArrondissement[0]?.amount ?? 0, 0)} M €`,
                  },
                  { label: t("fx.inv.s07.sig2.stat2"), value: String(d.byArrondissement[0]?.count ?? 0) },
                  {
                    label: t("fx.inv.s07.sig2.stat3"),
                    value: `${fmtDec(((d.byArrondissement[0]?.amount ?? 0) / (geoLocTotal || 1)) * 100, 0)} %`,
                  },
                ],
              },
              {
                flag: t("fx.inv.s07.sig3.flag"),
                title: t("fx.inv.s07.sig3.title"),
                body: fill(t("fx.inv.s07.sig3.body"), {
                  pct: fmtDec(100 - d.pctGeo, 0),
                  year: d.year,
                }),
                stats: [
                  { label: t("fx.inv.s07.sig3.stat1"), value: `${fmtDec(100 - d.pctGeo, 0)} %` },
                  { label: t("fx.inv.s07.sig3.stat2"), value: fmtInt(d.nbProjets - d.nbGeo) },
                  { label: t("fx.inv.s07.sig3.stat3"), value: t("fx.inv.s07.sig3.to_produce") },
                ],
                cta: { href: "/methode#investissements", label: t("fx.inv.s07.sig3.cta") },
              },
              {
                flag: t("fx.inv.s07.sig4.flag"),
                title: trL(d.byChapitre[0]?.label) || "—",
                body: fill(t("fx.inv.s07.sig4.body"), {
                  m: fmtMillions(d.byChapitre[0]?.amount ?? 0, 0),
                  pct: fmtDec(((d.byChapitre[0]?.amount ?? 0) / d.total) * 100, 0),
                }),
                stats: [
                  {
                    label: t("fx.inv.s07.sig4.stat1"),
                    value: `${fmtMillions(d.byChapitre[0]?.amount ?? 0, 0)} M €`,
                  },
                  {
                    label: t("fx.inv.s07.sig4.stat2"),
                    value: `${fmtDec(((d.byChapitre[0]?.amount ?? 0) / d.total) * 100, 0)} %`,
                  },
                  { label: t("fx.inv.s07.sig4.stat3"), value: "#01" },
                ],
              },
            ]}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-sources">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={t("fx.inv.src.kind")}
            title={
              <>
                {t("fx.s.verifiable")} <em>{t("fx.s.line_by_line")}</em>
              </>
            }
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.inv.src.c1.n")}</div>
              <h3>{fill(t("fx.inv.src.c1.h"), { year: d.year })}</h3>
              <p>{fill(t("fx.inv.src.c1.p"), { n: fmtInt(d.nbProjets), year: d.year })}</p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                {t("fx.s.opendata")}
              </a>
            </div>
            <div>
              <div className="n">{t("fx.inv.src.c2.n")}</div>
              <h3>{t("fx.inv.src.c2.h")}</h3>
              <p>{t("fx.inv.src.c2.p")}</p>
              <a href="/methode#investissements">{t("fx.s.methode_lien")}</a>
            </div>
            <div>
              <div className="n">{t("fx.inv.src.c3.n")}</div>
              <h3>{fill(t("fx.inv.src.c3.h"), { pct: fmtDec(100 - d.pctGeo, 0) })}</h3>
              <p>{t("fx.inv.src.c3.p")}</p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                {t("fx.s.github")}
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              {
                label: fill(t("fx.inv.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/map/investissements_complet_${d.year}.json`,
              },
              { label: t("fx.inv.src.export.json"), href: `/data/map/investissements_complet_${d.year}.json` },
              { label: t("fx.inv.src.export.trend"), href: "/data/investissement_tendances.json" },
              { label: t("fx.inv.src.export.method"), href: "/methode#investissements" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="09" kind={t("fx.inv.s09.kind")} title={t("fx.inv.s09.title")} />
          <div className="fx-grid-tiles">
            <TileCard
              href="/marches-publics"
              number={t("fx.inv.s09.t1.n")}
              kind={t("fx.inv.s09.t1.kind")}
              title={t("fx.inv.s09.t1.title")}
              description={t("fx.inv.s09.t1.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="10" y="20" width="80" height="10" fill="#0a0a0a" />
                  <rect x="10" y="38" width="60" height="10" fill="#0a0a0a" />
                  <rect x="10" y="56" width="100" height="10" fill="#e11d1d" />
                  <rect x="10" y="74" width="40" height="10" fill="#0a0a0a" />
                </svg>
              }
              kpi="2,1"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={fill(t("fx.inv.s09.t1.delta"), { year: d.year })}
            />
            <TileCard
              href="/logement-social"
              number={t("fx.inv.s09.t2.n")}
              kind={t("fx.inv.s09.t2.kind")}
              title={t("fx.inv.s09.t2.title")}
              description={t("fx.inv.s09.t2.desc")}
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
              kpiDelta={t("fx.inv.s09.t2.delta")}
            />
            <TileCard
              href="/dette-patrimoine"
              number={t("fx.inv.s09.t3.n")}
              kind={t("fx.inv.s09.t3.kind")}
              title={t("fx.inv.s09.t3.title")}
              description={t("fx.inv.s09.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="32" y="10" width="60" height="40" fill="#0a0a0a" />
                  <rect x="32" y="52" width="60" height="24" fill="#0a0a0a" opacity=".75" />
                  <rect x="108" y="10" width="60" height="46" fill="#0a0a0a" />
                  <rect x="108" y="58" width="60" height="32" fill="#e11d1d" />
                </svg>
              }
              kpi="26"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={t("fx.inv.s09.t3.delta")}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}