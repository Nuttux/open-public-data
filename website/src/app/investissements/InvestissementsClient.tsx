"use client";
import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import SignauxFaibles from "@/components/fusion/SignauxFaibles";
import ProjectMap from "@/components/fusion/ProjectMap";
import ProjetThumb from "@/components/fusion/ProjetThumb";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import PageTOC from "@/components/fusion/PageTOC";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { InvestissementsData } from "@/lib/fusion-data";
import { slugifyChapitre } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION } from "@/lib/methodology";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

const INV_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Analyse",
    title: "Le 13ᵉ et le 17ᵉ : deux géographies d'investissement.",
    description:
      "ZAC Paris Rive Gauche vs Clichy-Batignolles. Deux stratégies de foncier public, deux trajectoires de livraison.",
  },
  {
    category: "Explication",
    title: "AP, CP, CA : comprendre ce que comptabilise un investissement.",
    description:
      "Autorisations de programme, crédits de paiement, comptes administratifs — la chaîne budgétaire d'un chantier, expliquée sans jargon.",
  },
];

export default function InvestissementsClient({
  d,
  posts,
}: {
  d: InvestissementsData;
  posts: BlogPostMeta[];
}) {
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
  const [territoryView, setTerritoryView] = useState<"carte" | "liste">("liste");

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-chapitre", label: t("fx.toc.chapitres") },
          { id: "sec-territoire", label: t("fx.inv.s05.kind") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-signaux", label: t("fx.toc.signaux") },
          { id: "sec-projets", label: t("fx.toc.projets") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
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
            {fmtInt(d.nbProjets)}{t("fx.inv.lede.a.pre")}
            <Tip label={t("fx.inv.lede.a.operations.tip")}>{t("fx.inv.lede.a.operations")}</Tip>
            {t("fx.inv.lede.a.post")}{d.year}{t("fx.inv.lede.b")}
            <b>
              {fill(t("fx.inv.lede.pct.val"), { pct: fmtDec(d.pctGeo, 0) })}{" "}
              <Tip label={t("fx.inv.lede.pct.term.tip")}>{t("fx.inv.lede.pct.term")}</Tip>
            </b>
            {t("fx.inv.lede.c.pre")}
            <Tip label={t("fx.inv.lede.c.ca.tip")}>{t("fx.inv.lede.c.ca")}</Tip>
            {t("fx.inv.lede.c.post")}
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

      {(() => {
        const parHab = d.total / PARIS_POPULATION;
        const topChap = d.byChapitre[0];
        return (
          <PageHook
            cite={<>Ville de Paris · Annexes « Investissements localisés » · CA {d.year}</>}
            shareText={
              `Investissements Ville de Paris ${d.year} : ${fmtBillions(d.total)} Md€ sur ${fmtInt(d.nbProjets)} projets — ${fmtInt(parHab)} € par habitant.` +
              (topChap ? ` Premier poste : ${topChap.label} (${fmtMillions(topChap.amount, 0)} M€).` : "")
            }
          >
            En {d.year}, Paris a investi <b>{fmtBillions(d.total)} Md€</b> sur{" "}
            <b>{fmtInt(d.nbProjets)} projets</b> — soit{" "}
            <b>{fmtInt(parHab)} € par Parisien</b> sur l&apos;année.
            {topChap ? (
              <>
                {" "}Le premier poste, <b>{trL(topChap.label)}</b>, pèse à lui seul{" "}
                <b>{fmtMillions(topChap.amount, 0)} M€</b>.
              </>
            ) : null}
          </PageHook>
        );
      })()}

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
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
                  <Tip label={t("fx.inv.s02.hero_cap.a.term.tip")}>{t("fx.inv.s02.hero_cap.a.term")}</Tip>
                  {t("fx.inv.s02.hero_cap.a.post")}
                  <b>{fmtBillions(d.totalHorsDette)} {t("fx.s.md_eur")}</b>.{" "}
                  {t("fx.inv.s02.hero_cap.b")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: <Tip label={t("fx.inv.s02.kpi.projets.tip")}>{t("fx.inv.s02.kpi.projets")}</Tip>,
                  value: fmtInt(d.nbProjets),
                  delta: t("fx.inv.s02.kpi.projets_delta"),
                },
                {
                  label: <Tip label={t("fx.inv.s02.kpi.geo.tip")}>{t("fx.inv.s02.kpi.geo")}</Tip>,
                  value: `${fmtDec(d.pctGeo, 0)} %`,
                  delta: fill(t("fx.inv.s02.kpi.geo_delta"), { n: fmtInt(d.nbGeo) }),
                },
                {
                  label: <Tip label={t("fx.inv.s02.kpi.top_chap.tip")}>{t("fx.inv.s02.kpi.top_chap")}</Tip>,
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

      <section className="fx-section" id="sec-chapitre">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={<Tip label={t("fx.inv.classif_fonct.tip")}>{t("fx.inv.s04.kind")}</Tip>}
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
          <ChartSource
            source={<>Ville de Paris · Annexes investissement au CA {d.year}, ventilation par chapitre M57</>}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="investissements"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-territoire">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.inv.s05.kind")}
            title={
              <>
                {t("fx.inv.s05.title.before")}
                <em>{t("fx.inv.s05.title.em")}</em>
              </>
            }
            subtitle={
              territoryView === "carte"
                ? fill(t("fx.inv.s03.sub"), { n: fmtInt(d.nbGeo) })
                : t("fx.inv.s05.sub")
            }
          />
          <div className="fx-view-toggle" role="tablist" aria-label={t("fx.inv.s05.kind")}>
            <button
              type="button"
              role="tab"
              aria-selected={territoryView === "carte"}
              className={`fx-view-toggle-btn ${territoryView === "carte" ? "is-active" : ""}`}
              onClick={() => setTerritoryView("carte")}
            >
              {t("fx.toc.carte")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={territoryView === "liste"}
              className={`fx-view-toggle-btn ${territoryView === "liste" ? "is-active" : ""}`}
              onClick={() => setTerritoryView("liste")}
            >
              {t("fx.toc.arrondissements")}
            </button>
          </div>
          {territoryView === "carte" ? (
            <>
              <ProjectMap points={d.geoPoints} year={d.year} height={620} />
              <p className="fx-note">
                <b>{t("fx.inv.s03.note.b")}</b> :{" "}
                {fill(t("fx.inv.s03.note"), { pct: fmtDec(100 - d.pctGeo, 0) })}
              </p>
              <ChartSource
                source={<>Ville de Paris · Annexes investissement au CA {d.year} — projets géocodés via BAN</>}
                dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
                methodAnchor="investissements"
              />
            </>
          ) : (
            <>
              <ParisChoropleth
                items={d.byArrondissement.map((a) => ({ arr: a.arr, amount: a.amount, count: a.count }))}
                height={420}
              />
              <ChartSource
                source={<>Ville de Paris · Annexes investissement au CA {d.year}</>}
                dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
                methodAnchor="investissements"
              />
            </>
          )}
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="04"
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
          <ChartSource
            source={<>Ville de Paris · Investissements localisés (CA), série annuelle depuis 2018</>}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="investissements"
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
            number="05"
            kind={<Tip label={t("fx.inv.signaux.tip")}>{t("fx.inv.s07.kind")}</Tip>}
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
                cta: { href: "/methode?tool=investissements#outils", label: t("fx.inv.s07.sig3.cta") },
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

      <section className="fx-section" id="sec-projets">
        <div className="fx-wrap">
          <SectionHead
            number="06"
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

      <RelatedArticles number="07" posts={posts} placeholders={INV_PLACEHOLDERS} />

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead number="08" kind={t("fx.inv.s09.kind")} />
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

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#investissements" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>Source</b> : Ville de Paris — Annexes AP du CA + PDF « Investissements Localisés » <span className="sep">·</span> <b>Couverture</b> : dataset AP OpenData gelé depuis 2022 ; 2023-2026 reconstitués par parsing PDF.
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.inv.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/map/investissements_complet_${d.year}.json`,
              },
              { label: t("fx.inv.src.export.json"), href: `/data/map/investissements_complet_${d.year}.json` },
              { label: t("fx.inv.src.export.trend"), href: "/data/investissement_tendances.json" },
              { label: t("fx.inv.src.export.method"), href: "/methode?tool=investissements#outils" },
            ]}
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}