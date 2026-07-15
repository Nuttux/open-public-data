"use client";

import Link from "next/link";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle client-side (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import PageTOC from "@/components/fusion/PageTOC";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import EmptyState from "@/components/fusion/EmptyState";
import DualFlowBars from "@/components/fusion/DualFlowBars";
import Tip from "@/components/fusion/Tip";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { BudgetPageData, VoteExecuteData } from "@/lib/fusion-data";
import { slugifyLabel } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION } from "@/lib/methodology";

type BudgetIndexLite = {
  availableYears: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute" }[];
};

type Props = {
  index: BudgetIndexLite;
  d: BudgetPageData;
  voteExec: VoteExecuteData;
  posts: BlogPostMeta[];
};

const BUD_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Explication",
    title: "Vote, exécution, report : trois chiffres différents pour une même ligne budgétaire.",
    description:
      "Ce qu'une Ville annonce en décembre, paie sur l'année, puis reporte à l'année suivante — lecture pas-à-pas d'un même chapitre.",
  },
  {
    category: "Analyse",
    title: "Opérations pour ordre : pourquoi la moitié du budget parisien apparaît deux fois.",
    description:
      "Écritures internes, reversements, amortissements. Ce qui gonfle artificiellement le total, et ce que cela signifie pour comparer Paris à d'autres villes.",
  },
];

// Mapping exact des sources utilisées par le pipeline (cf. pipeline/scripts/tools/extract_pdf_budget_vote.py).
export default function BudgetClient({ index, d, voteExec, posts }: Props) {
  const t = useT();
  const { locale } = useLocale();

  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  const yearType = index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVoted = yearType === "vote";

  const deltaDir: "up" | "down" | "flat" =
    d.deltaDepensesPct > 0.1 ? "up" : d.deltaDepensesPct < -0.1 ? "down" : "flat";

  const topDep = d.topDepenses.slice(0, 7);
  const topRec = d.recettesBreakdown.slice(0, 6);

  const veRow = voteExec.rows.find((r) => r.year === d.year);
  const hasExecution = veRow?.executed != null;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-flux", label: t("fx.toc.flux") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "execution", label: t("fx.toc.execution") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />


      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.bud.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.bud.title.before")}<em>{t("fx.bud.title.em")}</em>{t("fx.bud.title.after")}
          </h1>
          <p className="fx-page-lede">{t("fx.bud.lede.l1")}</p>
          <p className="fx-page-source">
            {t("fx.bud.lede.l2.prefix")}
            <Tip label={t("fx.bud.lede.l2.ca.tip")}>{t("fx.bud.lede.l2.ca")}</Tip>
            {t("fx.bud.lede.l2.sep1")}
            <Tip label={t("fx.bud.s06.c1.m57.tip")}>M57</Tip>
            {t("fx.bud.lede.l2.mid")}
            <Tip label={t("fx.bud.lede.l2.delib.tip")}>{t("fx.bud.lede.l2.delib")}</Tip>
            {t("fx.bud.lede.l2.suffix")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={index.availableYears.slice().sort((a, b) => a - b)}
              votedYears={index.votedYears ?? []}
              current={d.year}
              basePath="/fr/city/paris/budget"
              label={t("fx.bud.year_label")}
            />
          </div>
          {isVoted && (() => {
            const lastExecuted = index.summary
              .filter((s) => s.type_budget === "execute" && s.year < d.year)
              .map((s) => s.year)
              .sort((a, b) => b - a)[0];
            return (
              <p style={{
                marginTop: 18,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                color: "var(--ink-2)",
                letterSpacing: ".04em",
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                <span>{fill("fx.bud.voted_notice", { year: d.year, next: d.year + 1 })}</span>
                {lastExecuted && (
                  <Link
                    href={`/fr/city/paris/budget?year=${lastExecuted}`}
                    style={{
                      color: "var(--bleu)",
                      borderBottom: "1px solid var(--bleu)",
                      paddingBottom: 1,
                      textDecoration: "none",
                    }}
                  >
                    {fill("fx.bud.voted_notice_cta", { year: lastExecuted })}
                  </Link>
                )}
              </p>
            );
          })()}
        </div>
      </section>

      {(() => {
        const parHab = d.depenses / PARIS_POPULATION;
        const pctFonct = Math.round((d.fonctionnement / d.depenses) * 100);
        const pctInvest = Math.round((d.investissement / d.depenses) * 100);
        const vars = {
          year: d.year,
          depenses: fmtBillions(d.depenses),
          perHab: fmtInt(parHab),
          pctFonct,
          pctInvest,
        };
        return (
          <PageHook
            cite={fill("fx.bud.hook.cite", { year: d.year })}
            shareText={fill("fx.bud.hook.share", vars)}
          >
            <span dangerouslySetInnerHTML={{ __html: fill("fx.bud.hook.body.l1", vars) }} />
            {" "}
            <span dangerouslySetInnerHTML={{ __html: fill("fx.bud.hook.body.l2", vars) }} />
          </PageHook>
        );
      })()}

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.bud.s01.kind")}
            title={<>{t("fx.bud.s01.title.before")}<em>{t("fx.bud.s01.title.em")}</em>{t("fx.bud.s01.title.after")}</>}
          />
          <div className="fx-overview">
            <HeroNumber
              label={<>{fill("fx.bud.s01.hero.label", { year: d.year })}</>}
              value={<AnimatedNumber value={d.depenses} format={(n) => fmtBillions(n)} />}
              unit="Md €"
              delta={{
                direction: deltaDir,
                value: <AnimatedNumber value={Math.abs(d.deltaDepensesPct)} format={(n) => `${fmtDec(n, 1)} %`} />,
                base: fill("fx.bud.s01.hero.base", { year: d.previousYear }),
              }}
              caption={
                isVoted ? (
                  <>
                    {t("fx.bud.s01.hero.cap_voted.prefix")}
                    <Tip label={t("fx.bud.s01.hero.cap_voted.voted.tip")}>{t("fx.bud.s01.hero.cap_voted.voted")}</Tip>
                    {t("fx.bud.s01.hero.cap_voted.mid")}
                    <Tip label={t("fx.bud.s01.hero.cap_voted.bp.tip")}>{t("fx.bud.s01.hero.cap_voted.bp")}</Tip>
                    {t("fx.bud.s01.hero.cap_voted.suffix")}
                  </>
                ) : (
                  <>
                    {t("fx.bud.s01.hero.cap_exec.prefix")}
                    <Tip label={t("fx.bud.s01.hero.cap_exec.exec.tip")}>{t("fx.bud.s01.hero.cap_exec.exec")}</Tip>
                    {t("fx.bud.s01.hero.cap_exec.mid")}
                  </>
                )
              }
            />
            <KPIGrid
              cols={3}
              items={[
                {
                  label: <Tip label={t("fx.bud.s01.kpi.per_hab.tip")}>{t("fx.bud.s01.kpi.per_hab")}</Tip>,
                  value: <AnimatedNumber value={d.depenses / PARIS_POPULATION} format={(n) => fmtInt(n)} />,
                  unit: "€",
                  delta: fill("fx.bud.s01.kpi.per_hab.delta", { pop: "2,13 M" }),
                },
                {
                  label: <Tip label={t("fx.bud.s01.kpi.recettes.tip")}>{t("fx.bud.s01.kpi.recettes")}</Tip>,
                  value: <AnimatedNumber value={d.recettes} format={(n) => fmtBillions(n)} />,
                  unit: "Md €",
                  delta: isVoted ? t("fx.bud.s01.kpi.voted") : t("fx.bud.s01.kpi.executed"),
                },
                {
                  label: <Tip label={t("fx.bud.s01.kpi.solde.tip")}>{t("fx.bud.s01.kpi.solde")}</Tip>,
                  value: <AnimatedNumber value={d.solde} format={(n) => (n >= 0 ? "+ " : "− ") + fmtMillions(Math.abs(n))} />,
                  unit: "M €",
                  delta: d.solde < 0 ? t("fx.bud.s01.kpi.need") : t("fx.bud.s01.kpi.excess"),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-flux">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.bud.s02.kind")}
            title={<><em>{t("fx.bud.s02.title.em1")}</em>{t("fx.bud.s02.title.mid")}<em>{t("fx.bud.s02.title.em2")}</em>{t("fx.bud.s02.title.after")}</>}
            subtitle={t("fx.bud.s02.sub")}
          />

          {/* Pareto line — one stat anchor above the symmetric DualFlowBars. */}
          {(() => {
            const depSum = d.topDepenses.reduce((s, x) => s + x.value, 0);
            const top3Sum = d.topDepenses.slice(0, 3).reduce((s, x) => s + x.value, 0);
            const top3Pct = depSum > 0 ? (top3Sum / depSum) * 100 : 0;
            return (
              <p className="fx-note" style={{ marginTop: 0, marginBottom: 22 }}>
                {fill("fx.bud.s03.pareto_line", { year: d.year, pct: `${Math.round(top3Pct)} €` })}
              </p>
            );
          })()}

          <DualFlowBars
            left={{
              title: <>{fill("fx.bud.s02.left_title", { amount: fmtBillions(d.recettes) })}</>,
              rows: topRec.map((r) => ({
                label: r.label === "Autres (R)" ? t("fx.bud.autres") : trLabel(r.label, locale),
                value: r.value,
                display: `${fmtBillions(r.value)} Md €`,
                rouge: false,
                href: `/fr/city/paris/budget/poste/${slugifyLabel(r.label)}?year=${d.year}`,
              })),
            }}
            right={{
              title: <>{fill("fx.bud.s02.right_title", { amount: fmtBillions(d.depenses) })}</>,
              rows: topDep.map((x) => ({
                label: x.label === "Autres (D)" ? t("fx.bud.autres") : trLabel(x.label, locale),
                value: x.value,
                display: `${fmtBillions(x.value)} Md €`,
                rouge: false,
                href: `/fr/city/paris/budget/poste/${slugifyLabel(x.label)}?year=${d.year}`,
              })),
            }}
            center={{
              label: t("fx.bud.s02.center_label"),
              value: fmtBillions(Math.max(d.recettes, d.depenses)),
              unit: "Md €",
            }}
            callout={
              <>
                {t("fx.bud.s02.callout.c1")}
                <Tip label={t("fx.bud.s02.callout.tip.fonct")}>
                  <b>{t("fx.bud.s02.callout.word.fonct")}</b>
                </Tip>
                {t("fx.bud.s02.callout.c2")}
                <Tip label={t("fx.bud.s02.callout.tip.invest")}>
                  <b>{t("fx.bud.s02.callout.word.invest")}</b>
                </Tip>
                {t("fx.bud.s02.callout.c3")}
                <Tip label={t("fx.bud.s02.callout.tip.emprunt")}>
                  <b>{t("fx.bud.s02.callout.word.emprunt")}</b>
                </Tip>
                {t("fx.bud.s02.callout.c4")}
                <Tip label={t("fx.bud.s02.callout.tip.regle")}>
                  <b>{t("fx.bud.s02.callout.word.regle")}</b>
                </Tip>
                {t("fx.bud.s02.callout.c5")}
              </>
            }
          />
          <ChartSource
            source={<>Ville de Paris · Comptes administratifs M57 {d.year}</>}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="budget"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.bud.s04.kind")}
            title={<>{t("fx.bud.s04.title.before")}<em>{t("fx.bud.s04.title.em")}</em>{t("fx.bud.s04.title.after")}</>}
            subtitle={t("fx.bud.s04.sub")}
          />
          <BudgetTimeline
            points={d.yearsSummary.map((y) => ({
              year: y.year,
              value: y.depenses / 1_000_000_000,
              type: (y.type === "vote" ? "vote" : "execute") as "vote" | "execute",
            }))}
            activeYear={d.year}
            annotations={[
              { year: 2020, label: t("fx.bud.s04.annot.covid") },
              { year: 2024, label: t("fx.bud.s04.annot.jo") },
            ]}
          />
          <ChartSource
            source={t("fx.bud.s03.source.cite")}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="budget"
          />
          {d.yearsSummary.length >= 2 && (() => {
            const first = d.yearsSummary[0];
            const last = d.yearsSummary[d.yearsSummary.length - 1];
            const delta = ((last.depenses - first.depenses) / first.depenses) * 100;
            return (
              <p className="fx-viz-meta">
                <span>
                  {t("fx.bud.s04.meta_between")}{first.year} ({first.type === "vote" ? t("fx.bud.s04.meta_vote_short") : t("fx.bud.s04.meta_exec_short")})
                  {t("fx.bud.s04.meta_and")}{last.year} ({last.type === "vote" ? t("fx.bud.s04.meta_vote_short") : t("fx.bud.s04.meta_exec_short")})
                  {t("fx.bud.s04.meta_cont")}<strong>{delta >= 0 ? "+" : "−"} {fmtDec(Math.abs(delta), 1)} %</strong>
                  {t("fx.bud.s04.meta_cont2")}
                </span>
                <Link href="/analyses" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}>
                  {t("fx.bud.s04.cta_poste")}
                </Link>
              </p>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="execution">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.bud.s05.kind")}
            title={
              <>
                {t("fx.bud.s05.title.a")}
                <Tip label={t("fx.bud.s05.title.vote_tip")}>
                  <em>{t("fx.bud.s05.title.voted_em")}</em>
                </Tip>
                {t("fx.bud.s05.title.b")}
                <Tip label={t("fx.bud.s05.title.exec_tip")}>
                  <b>{t("fx.bud.s05.title.depense_b")}</b>
                </Tip>
                {t("fx.bud.s05.title.c")}
              </>
            }
            subtitle={<>{t("fx.bud.s05.sub")}</>}
          />

          {!hasExecution ? (
            <EmptyState
              label={t("fx.bud.s05.empty.label")}
              title={<>{fill("fx.bud.s05.empty.title", { year: d.year, next: d.year + 1 })}</>}
              body={<>{t("fx.bud.s05.empty.body")}</>}
              actions={
                <>
                  {voteExec.rows
                    .filter((r) => r.executed != null)
                    .slice(-3)
                    .reverse()
                    .map((r) => (
                      <Button key={r.year} href={`/fr/city/paris/budget?year=${r.year}#execution`}>
                        {fill("fx.bud.s05.empty.cta", { year: r.year })}
                      </Button>
                    ))}
                </>
              }
            />
          ) : (
            <>
              <div className="fx-overview">
                <HeroNumber
                  label={<>{fill("fx.bud.s05.hero_label", { year: d.year })}</>}
                  value={<AnimatedNumber value={veRow?.tauxGlobal ?? 0} format={(n) => fmtDec(n, 1)} />}
                  unit="%"
                  caption={
                    <>
                      {t("fx.bud.s05.hero_cap.voted")}<b>{fmtBillions(veRow?.voted ?? 0)} Md €</b>
                      {t("fx.bud.s05.hero_cap.executed")}<b>{fmtBillions(veRow?.executed ?? 0)} Md €</b>
                      {t("fx.bud.s05.hero_cap.after")}
                    </>
                  }
                />
                <KPIGrid
                  cols={2}
                  items={[
                    {
                      label: <Tip label={t("fx.bud.s05.kpi.voted.tip")}>{t("fx.bud.s05.kpi.voted")}</Tip>,
                      value: <AnimatedNumber value={veRow?.voted ?? 0} format={(n) => fmtBillions(n)} />,
                      unit: "Md €",
                    },
                    {
                      label: <Tip label={t("fx.bud.s05.kpi.executed.tip")}>{t("fx.bud.s05.kpi.executed")}</Tip>,
                      value: <AnimatedNumber value={veRow?.executed ?? 0} format={(n) => fmtBillions(n)} />,
                      unit: "Md €",
                    },
                    {
                      label: <Tip label={t("fx.bud.s05.kpi.gap.tip")}>{t("fx.bud.s05.kpi.gap")}</Tip>,
                      value:
                        veRow && veRow.executed != null
                          ? <AnimatedNumber value={veRow.executed - veRow.voted} format={(n) => (n >= 0 ? "+ " : "− ") + fmtMillions(Math.abs(n))} />
                          : "—",
                      unit: "M €",
                    },
                    {
                      label: <Tip label={t("fx.bud.s05.kpi.status.tip")}>{t("fx.bud.s05.kpi.status")}</Tip>,
                      value: (veRow?.tauxGlobal ?? 0) >= 95 ? t("fx.bud.s05.kpi.status.exec") : t("fx.bud.s05.kpi.status.sous"),
                      delta: fill("fx.bud.s05.kpi.status.delta", { pct: fmtDec(veRow?.tauxGlobal ?? 0, 1) }),
                    },
                  ]}
                />
              </div>
              {veRow?.executed != null && veRow.voted > 0 && (() => {
                const taux = Math.min(100, (veRow.executed / veRow.voted) * 100);
                return (
                  <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      {t("fx.bud.s05.compare_kicker")}
                    </div>
                    <div style={{ display: "grid", gap: 14 }}>
                      <CompareBar
                        label={t("fx.bud.s05.kpi.voted")}
                        value={`${fmtBillions(veRow.voted)} Md €`}
                        widthPct={100}
                        muted={false}
                      />
                      <CompareBar
                        label={t("fx.bud.s05.kpi.executed")}
                        value={`${fmtBillions(veRow.executed)} Md €`}
                        widthPct={taux}
                        muted
                      />
                    </div>
                    <p style={{ fontFamily: "var(--f-ui)", fontSize: 13.5, color: "var(--ink-2)", marginTop: 16, maxWidth: 720, lineHeight: 1.55 }}>
                      {fill("fx.bud.s05.compare_caption", {
                        pct: fmtDec(taux, 1),
                        gap: fmtMillions(Math.max(0, veRow.voted - veRow.executed)),
                      })}
                    </p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </section>

      <RelatedArticles number="06" posts={posts} placeholders={BUD_PLACEHOLDERS} />

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("fx.bud.s07.kind")}
            subtitle={t("fx.bud.s07.sub")}
          />
          <div className="fx-grid-tiles fx-grid-tiles-4">
            <TileCard
              href="/fr/city/paris/subventions"
              number={t("fx.bud.s07.t1.n")}
              kind={t("fx.bud.s07.t1.kind")}
              title={t("fx.bud.s07.t1.title")}
              description={t("fx.bud.s07.t1.desc")}
              preview={<SvgClassement />}
              kpi="312"
              kpiUnit="M €"
              kpiDelta={<>{t("fx.bud.s07.t1.delta")}</>}
            />
            <TileCard
              href="/fr/city/paris/investissements"
              number={t("fx.bud.s07.t2.n")}
              kind={t("fx.bud.s07.t2.kind")}
              title={t("fx.bud.s07.t2.title")}
              description={t("fx.bud.s07.t2.desc")}
              preview={<SvgCarte />}
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>{t("fx.bud.s07.t2.delta")}</>}
            />
            <TileCard
              href="/fr/city/paris/dette"
              number={t("fx.bud.s07.t3.n")}
              kind={t("fx.bud.s07.t3.kind")}
              title={t("fx.bud.s07.t3.title")}
              description={t("fx.bud.s07.t3.desc")}
              preview={<SvgBilan />}
              kpi="36"
              kpiUnit="Md €"
              kpiDelta={<>{t("fx.bud.s07.t3.delta")}</>}
            />
            <TileCard
              href="/analyses"
              number={t("fx.bud.s07.t4.n")}
              kind={t("fx.bud.s07.t4.kind")}
              title={t("fx.bud.s07.t4.title")}
              description={t("fx.bud.s07.t4.desc")}
              preview={<SvgAnalyses />}
              kpi="2"
              kpiUnit={t("fx.bud.s07.t4.unit")}
              kpiDelta={<>{t("fx.bud.s07.t4.delta")}</>}
            />
          </div>
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#budget" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b> : {t("fx.bud.footer.source")} <span className="sep">·</span> <b>{t("fx.footer.coverage_label")}</b> : {t("fx.bud.footer.coverage")}
          </p>
          <ExportRow
            items={[
              {
                label: fill("fx.bud.s06.export.csv", { year: d.year, status: isVoted ? t("fx.bud.s01.kpi.voted").toLowerCase() : t("fx.bud.s01.kpi.executed").toLowerCase() }),
                primary: true,
                href: `/api/budget/${d.year}/csv`,
                download: `budget-paris-${d.year}.csv`,
              },
              {
                label: t("fx.bud.s06.export.json"),
                href: `/data/budget_sankey_${d.year}.json`,
                download: `budget-paris-${d.year}.json`,
              },
              { label: t("fx.bud.s06.export.api"), href: undefined },
              { label: t("fx.bud.s06.export.method"), href: "/methode?tool=budget#outils" },
            ]}
          />
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}

function CompareBar({
  label,
  value,
  widthPct,
  muted,
}: {
  label: string;
  value: string;
  widthPct: number;
  muted: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr minmax(100px, auto)", gap: 16, alignItems: "center" }}>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-2)", letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ position: "relative", height: 18, background: "var(--rule)" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${widthPct}%`,
            background: muted ? "var(--ink-2)" : "var(--ink)",
            transition: "width 300ms",
          }}
        />
      </div>
      <div className="tnum" style={{ fontFamily: "var(--f-num)", fontSize: 15, fontWeight: 600, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function _GroupedSubRows({
  items,
  max,
  numLocale,
  detailFallback,
  locale,
}: {
  items: { name: string; value: number }[];
  max: number;
  numLocale: string;
  detailFallback: string;
  locale: "fr" | "en";
}) {
  const groupOrder: string[] = [];
  const groups = new Map<string, { total: number; items: { globalRank: number; n3: string; value: number }[] }>();
  items.forEach((it, i) => {
    const idx = it.name.indexOf(":");
    const n2Raw = idx > 0 ? it.name.slice(0, idx).trim() : detailFallback;
    const n2 = trLabel(n2Raw, locale);
    const n3 = idx > 0 ? it.name.slice(idx + 1).trim() : it.name.trim();
    if (!groups.has(n2)) {
      groupOrder.push(n2);
      groups.set(n2, { total: 0, items: [] });
    }
    const g = groups.get(n2)!;
    g.total += it.value;
    g.items.push({ globalRank: i + 1, n3, value: it.value });
  });

  return (
    <div>
      {groupOrder.map((n2) => {
        const g = groups.get(n2)!;
        return (
          <div key={n2} style={{ marginBottom: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "8px 0",
                borderBottom: "1px solid var(--rule)",
                marginBottom: 4,
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
              }}
            >
              <span>{n2}</span>
              <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                {g.total >= 1e9
                  ? new Intl.NumberFormat(numLocale, { maximumFractionDigits: 2 }).format(g.total / 1e9) + " Md €"
                  : new Intl.NumberFormat(numLocale, { maximumFractionDigits: 0 }).format(g.total / 1e6) + " M €"}
              </span>
            </div>
            {g.items.map((it) => (
              <div key={it.globalRank} className="fx-mini-row" style={{ gridTemplateColumns: "32px 2fr 3fr 110px" }}>
                <span className="rank">#{String(it.globalRank).padStart(2, "0")}</span>
                <span style={{ fontWeight: 500 }}>{it.n3}</span>
                <span className="muted fx-mini-hide-mobile" style={{ position: "relative", height: 8 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 2,
                      height: 6,
                      width: `${(it.value / max) * 100}%`,
                      background: "var(--ink)",
                    }}
                  />
                </span>
                <span className="num">
                  {it.value >= 1e9
                    ? new Intl.NumberFormat(numLocale, { maximumFractionDigits: 2 }).format(it.value / 1e9) + " Md €"
                    : new Intl.NumberFormat(numLocale, { maximumFractionDigits: 0 }).format(it.value / 1e6) + " M €"}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SvgClassement() {
  return (
    <svg viewBox="0 0 200 100">
      {[14, 28, 42, 56, 70, 84].map((y, i) => (
        <g key={y}>
          <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
          <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
          <rect x="160" y={y - 1} width="30" height="6" className="fill-muted" fill="#9099a6" />
        </g>
      ))}
    </svg>
  );
}

function SvgCarte() {
  return (
    <svg viewBox="0 0 200 100">
      <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
      {[[60, 34], [86, 42], [110, 30], [140, 36], [72, 70], [104, 78], [132, 72], [158, 68]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
      ))}
      <circle cx="118" cy="54" r="4" className="fill-sig" fill="#e11d1d" />
    </svg>
  );
}

function SvgBilan() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="32" y="10" width="60" height="40" className="fill" fill="#0a0a0a" />
      <rect x="32" y="52" width="60" height="24" className="fill" fill="#0a0a0a" opacity=".75" />
      <rect x="108" y="10" width="60" height="46" className="fill" fill="#0a0a0a" />
      <rect x="108" y="58" width="60" height="32" className="fill-sig" fill="#e11d1d" />
    </svg>
  );
}

function SvgAnalyses() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="10" y="14" width="180" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="28" width="140" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="42" width="160" height="4" className="fill-sig" fill="#e11d1d" />
      <rect x="10" y="56" width="120" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="70" width="150" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="84" width="100" height="4" className="fill-muted" fill="#9099a6" />
    </svg>
  );
}