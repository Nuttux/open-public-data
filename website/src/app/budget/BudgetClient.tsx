"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle client-side (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import EmptyState from "@/components/fusion/EmptyState";
import DualFlowBars from "@/components/fusion/DualFlowBars";
import ExpandableList from "@/components/fusion/ExpandableList";
import Tip from "@/components/fusion/Tip";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BudgetPageData, VoteExecuteData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type BudgetIndexLite = {
  availableYears: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute" }[];
};

type Props = {
  index: BudgetIndexLite;
  d: BudgetPageData;
  voteExec: VoteExecuteData;
};

export default function BudgetClient({ index, d, voteExec }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const numLocale = locale === "en" ? "en-GB" : "fr-FR";

  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  const yearType = index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVoted = yearType === "vote";

  // Deep link from landing/other pages: ?theme=X opens + scrolls to that
  // poste in the S03 dépenses list. Tolerant match: exact → prefix → contains.
  const searchParams = useSearchParams();
  const themeParam = searchParams.get("theme");
  const matchedTheme = themeParam
    ? d.topDepenses.find((x) => x.label === themeParam)?.label
      ?? d.topDepenses.find((x) => x.label.toLowerCase().startsWith(themeParam.toLowerCase()))?.label
      ?? d.topDepenses.find((x) => x.label.toLowerCase().includes(themeParam.toLowerCase()))?.label
      ?? null
    : null;
  const depSectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (matchedTheme && depSectionRef.current) {
      const timer = setTimeout(() => {
        depSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [matchedTheme]);

  const deltaDir: "up" | "down" | "flat" =
    d.deltaDepensesPct > 0.1 ? "up" : d.deltaDepensesPct < -0.1 ? "down" : "flat";

  const topDep = d.topDepenses.slice(0, 7);
  const topRec = d.recettesBreakdown.slice(0, 6);

  const veRow = voteExec.rows.find((r) => r.year === d.year);
  const hasExecution = veRow?.executed != null;

  const recDescKey = (label: string): string => {
    switch (label) {
      case "Impôts & Taxes": return "fx.bud.rec_desc.impots";
      case "Dotations & Subventions": return "fx.bud.rec_desc.dotations";
      case "Services Publics": return "fx.bud.rec_desc.services";
      case "Emprunts": return "fx.bud.rec_desc.emprunts";
      case "Investissement": return "fx.bud.rec_desc.invest";
      case "Autres (R)": return "fx.bud.rec_desc.autres";
      default: return "fx.bud.s03.no_desc";
    }
  };

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-flux", label: t("fx.toc.flux") },
          { id: "sec-detail", label: t("fx.toc.detail") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "execution", label: t("fx.toc.execution") },
          { id: "sec-sources", label: t("fx.toc.sources") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
        ]}
      />


      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.bud.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.bud.title.before")}<em>{t("fx.bud.title.em")}</em>{t("fx.bud.title.after")}
          </h1>
          <p className="fx-page-lede">
            {t("fx.bud.lede.l1")}
            <br />
            {t("fx.bud.lede.l2")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={index.availableYears.slice().sort((a, b) => a - b)}
              votedYears={index.votedYears ?? []}
              current={d.year}
              basePath="/budget"
              label={t("fx.bud.year_label")}
            />
          </div>
          {isVoted && (
            <p style={{
              marginTop: 18,
              fontFamily: "var(--f-mono)",
              fontSize: 11.5,
              color: "var(--ink-2)",
              letterSpacing: ".04em",
            }}>
              {fill("fx.bud.voted_notice", { year: d.year, next: d.year + 1 })}
            </p>
          )}
        </div>
      </section>

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
              value={fmtBillions(d.depenses)}
              unit="Md €"
              delta={{
                direction: deltaDir,
                value: `${fmtDec(Math.abs(d.deltaDepensesPct), 1)} %`,
                base: fill("fx.bud.s01.hero.base", { year: d.previousYear }),
              }}
              caption={
                <>
                  {isVoted ? t("fx.bud.s01.hero.cap_voted") : t("fx.bud.s01.hero.cap_exec")}
                </>
              }
            />
            <KPIGrid
              cols={3}
              items={[
                {
                  label: t("fx.bud.s01.kpi.per_hab"),
                  value: fmtInt(d.depenses / 2_133_111),
                  unit: "€",
                  delta: fill("fx.bud.s01.kpi.per_hab.delta", { pop: "2,13 M" }),
                },
                { label: t("fx.bud.s01.kpi.recettes"), value: fmtBillions(d.recettes), unit: "Md €", delta: isVoted ? t("fx.bud.s01.kpi.voted") : t("fx.bud.s01.kpi.executed") },
                {
                  label: t("fx.bud.s01.kpi.solde"),
                  value: (d.solde >= 0 ? "+ " : "− ") + fmtMillions(Math.abs(d.solde)),
                  unit: "M €",
                  delta: d.solde < 0 ? t("fx.bud.s01.kpi.need") : t("fx.bud.s01.kpi.excess"),
                },
                {
                  label: (
                    <Tip label={t("fx.bud.s01.kpi.fonct.tip")}>
                      {t("fx.bud.s01.kpi.fonct")}
                    </Tip>
                  ),
                  value: fmtBillions(d.fonctionnement),
                  unit: "Md €",
                  delta: fill("fx.bud.s01.kpi.of_total", { pct: Math.round((d.fonctionnement / d.depenses) * 100) }),
                },
                {
                  label: (
                    <Tip label={t("fx.bud.s01.kpi.invest.tip")}>
                      {t("fx.bud.s01.kpi.invest")}
                    </Tip>
                  ),
                  value: fmtBillions(d.investissement),
                  unit: "Md €",
                  delta: fill("fx.bud.s01.kpi.of_total", { pct: Math.round((d.investissement / d.depenses) * 100) }),
                },
                {
                  label: (
                    <Tip label={t("fx.bud.s01.kpi.epargne.tip")}>
                      {t("fx.bud.s01.kpi.epargne")}
                    </Tip>
                  ),
                  value: fmtBillions(d.epargneBrute),
                  unit: "Md €",
                  delta: fill("fx.bud.s01.kpi.of_total", { pct: Math.round((d.epargneBrute / d.recettes) * 100) }),
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
            title={<>{t("fx.bud.s02.title.before")}<em>{t("fx.bud.s02.title.em")}</em>{t("fx.bud.s02.title.after")}</>}
            subtitle={t("fx.bud.s02.sub")}
          />
          <DualFlowBars
            left={{
              title: <>{fill("fx.bud.s02.left_title", { amount: fmtBillions(d.recettes) })}</>,
              rows: topRec.map((r) => ({
                label: r.label === "Autres (R)" ? t("fx.bud.autres") : trLabel(r.label, locale),
                value: r.value,
                display: `${fmtBillions(r.value)} Md`,
                rouge: false,
              })),
            }}
            right={{
              title: <>{fill("fx.bud.s02.right_title", { amount: fmtBillions(d.depenses) })}</>,
              rows: topDep.map((x) => ({
                label: x.label === "Autres (D)" ? t("fx.bud.autres") : trLabel(x.label, locale),
                value: x.value,
                display: `${fmtBillions(x.value)} Md`,
                rouge: false,
              })),
            }}
            center={{
              label: t("fx.bud.s02.center_label"),
              value: fmtBillions(Math.max(d.recettes, d.depenses)),
              unit: "Md €",
            }}
            callout={
              <>
                {t("fx.bud.s02.callout.p1_a")}
                <b>{fill("fx.bud.s02.callout.p1_pct", { pct: Math.round((d.fonctionnement / d.depenses) * 100) })}</b>
                {t("fx.bud.s02.callout.p1_b")}
                <Tip label={t("fx.bud.s02.callout.tip.fonct")}>
                  <b>{t("fx.bud.s02.callout.word.fonct")}</b>
                </Tip>
                {t("fx.bud.s02.callout.p2")}
                <b>{fill("fx.bud.s02.callout.p3_pct", { pct: Math.round((d.investissement / d.depenses) * 100) })}</b>
                {t("fx.bud.s02.callout.p3")}
                <Tip label={t("fx.bud.s02.callout.tip.invest")}>
                  <b>{t("fx.bud.s02.callout.word.invest")}</b>
                </Tip>
                {t("fx.bud.s02.callout.p4")}
                <Tip label={t("fx.bud.s02.callout.tip.emprunt")}>
                  <b>{t("fx.bud.s02.callout.word.emprunt")}</b>
                </Tip>
                {t("fx.bud.s02.callout.p5")}
                <Tip label={t("fx.bud.s02.callout.tip.regle")}>
                  {t("fx.bud.s02.callout.word.regle")}
                </Tip>
                {t("fx.bud.s02.callout.p6")}
              </>
            }
          />
        </div>
      </section>

      <section className="fx-section" id="sec-detail">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.bud.s03.kind")}
            title={<>{t("fx.bud.s03.title.before")}<em>{t("fx.bud.s03.title.em")}</em>{t("fx.bud.s03.title.after")}</>}
            subtitle={t("fx.bud.s03.sub")}
          />
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
            {fill("fx.bud.s03.rec_header", { amount: fmtBillions(d.recettes) })}
          </div>
          <ExpandableList
            header={{
              left: <>{t("fx.bud.s03.sources_left_a")}<b>{fill("fx.bud.s03.sources_left_b", { amount: fmtBillions(d.recettes) })}</b></>,
              right: <>{fill("fx.bud.s03.postes", { n: topRec.length })}</>,
            }}
            items={topRec.map((r) => {
              const refMax = topRec[0].value || 1;
              const label = r.label === "Autres (R)" ? t("fx.bud.autres") : trLabel(r.label, locale);
              const desc = t(recDescKey(r.label));
              const subMax = r.subSources[0]?.value || 1;
              return {
                key: r.label,
                label,
                barPct: (r.value / refMax) * 100,
                meta: <>{fmtDec((r.value / d.recettes) * 100, 1)} %</>,
                value: fmtBillions(r.value),
                unit: "Md €",
                children: (
                  <div>
                    <p style={{ fontFamily: "var(--f-ui)", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 720, margin: "0 0 18px" }}>
                      {desc}
                    </p>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      {fill("fx.bud.s03.top_sub_sources", { label })}
                    </div>
                    {r.subSources.length > 0 ? (
                      <GroupedSubRows
                        items={r.subSources}
                        max={subMax}
                        numLocale={numLocale}
                        detailFallback={t("fx.bud.s03.detail_fallback")}
                        locale={locale}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>
                        {t("fx.bud.s03.no_sub_sources")}
                      </p>
                    )}
                  </div>
                ),
              };
            })}
          />

          <div ref={depSectionRef} id="sec-depenses" style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", margin: "36px 0 12px" }}>
            {fill("fx.bud.s03.dep_header", { amount: fmtBillions(d.depenses) })}
          </div>
          {(() => {
            const depSum = d.topDepenses.reduce((s, x) => s + x.value, 0);
            const top3Sum = d.topDepenses.slice(0, 3).reduce((s, x) => s + x.value, 0);
            const top3Pct = depSum > 0 ? (top3Sum / depSum) * 100 : 0;
            return (
              <div style={{ marginBottom: 28 }}>
                <StackedBarTheme
                  items={d.topDepenses.map((x) => ({
                    theme: x.label === "Autres (D)" ? t("fx.bud.autres") : x.label,
                    amount: x.value,
                    count: x.subPostes.length,
                  }))}
                  total={depSum}
                  concentrationTop10Pct={top3Pct}
                  paretoTopN={3}
                  year={d.year}
                  basePath="/budget"
                  kicker={fill("fx.bud.s03.stack_kicker", { year: d.year })}
                  entityNoun={t("fx.bud.s03.stack_entity")}
                  paretoContrast={t("fx.bud.s03.stack_contrast")}
                />
              </div>
            );
          })()}
          <ExpandableList
            initialOpen={matchedTheme ?? undefined}
            header={{
              left: <>{t("fx.bud.s03.thematiques_left_a")}<b>{fill("fx.bud.s03.sources_left_b", { amount: fmtBillions(d.depenses) })}</b></>,
              right: <>{fill("fx.bud.s03.postes", { n: d.topDepenses.length })}</>,
            }}
            items={d.topDepenses.map((x) => {
              const refMax = d.topDepenses[0].value || 1;
              const label = x.label === "Autres (D)" ? t("fx.bud.autres") : trLabel(x.label, locale);
              const subMax = x.subPostes[0]?.value || 1;
              return {
                key: x.label,
                label,
                barPct: (x.value / refMax) * 100,
                meta: <>{fmtDec((x.value / d.depenses) * 100, 1)} %</>,
                value: fmtBillions(x.value),
                unit: "Md €",
                children: (
                  <div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      {fill("fx.bud.s03.top_sub_postes", { label })}
                    </div>
                    {x.subPostes.length > 0 ? (
                      <GroupedSubRows
                        items={x.subPostes}
                        max={subMax}
                        numLocale={numLocale}
                        detailFallback={t("fx.bud.s03.detail_fallback")}
                        locale={locale}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>
                        {t("fx.bud.s03.no_sub_postes")}
                      </p>
                    )}
                  </div>
                ),
              };
            })}
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
                      <Button key={r.year} href={`/budget?year=${r.year}#execution`}>
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
                  value={fmtDec(veRow?.tauxGlobal ?? 0, 1)}
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
                    { label: t("fx.bud.s05.kpi.voted"), value: fmtBillions(veRow?.voted ?? 0), unit: "Md €" },
                    { label: t("fx.bud.s05.kpi.executed"), value: fmtBillions(veRow?.executed ?? 0), unit: "Md €" },
                    {
                      label: t("fx.bud.s05.kpi.gap"),
                      value:
                        (veRow && veRow.executed != null
                          ? (veRow.executed - veRow.voted >= 0 ? "+ " : "− ") +
                            fmtMillions(Math.abs(veRow.executed - veRow.voted))
                          : "—"),
                      unit: "M €",
                    },
                    {
                      label: t("fx.bud.s05.kpi.status"),
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

      <section className="fx-section" id="sec-sources">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.bud.s06.kind")}
            title={<>{t("fx.bud.s06.title.before")}<em>{t("fx.bud.s06.title.em")}</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.bud.s06.c1.n")}</div>
              <h3>
                {t("fx.bud.s06.c1.h.prefix")}
                {isVoted ? t("fx.bud.s06.c1.h.voted") : t("fx.bud.s06.c1.h.exec")}
                {fill("fx.bud.s06.c1.h.suffix_a", { year: d.year })}
                <Tip label={t("fx.bud.s06.c1.m57.tip")}>M57</Tip>
                {t("fx.bud.s06.c1.h.suffix_b")}
              </h3>
              <p>
                {isVoted
                  ? fill("fx.bud.s06.c1.p.voted", { prev: d.year - 1, next: d.year + 1 })
                  : t("fx.bud.s06.c1.p.exec")}
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                {t("fx.bud.s06.c1.link")}
              </a>
            </div>
            <div>
              <div className="n">{t("fx.bud.s06.c2.n")}</div>
              <h3>
                {isVoted
                  ? fill("fx.bud.s06.c2.h.voted", { prev: d.year - 1 })
                  : fill("fx.bud.s06.c2.h.exec", { next: d.year + 1 })}
                {t("fx.bud.s06.c2.h.suffix")}
              </h3>
              <p>{t("fx.bud.s06.c2.p")}</p>
              <a href="#">{t("fx.bud.s06.c2.link")}</a>
            </div>
            <div>
              <div className="n">{t("fx.bud.s06.c3.n")}</div>
              <h3>{t("fx.bud.s06.c3.h")}</h3>
              <p>{t("fx.bud.s06.c3.p")}</p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                {t("fx.bud.s06.c3.link")}
              </a>
            </div>
          </div>
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
              { label: t("fx.bud.s06.export.method"), href: "/methode#budget" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("fx.bud.s07.kind")}
            title={t("fx.bud.s07.title")}
            subtitle={t("fx.bud.s07.sub")}
          />
          <div className="fx-grid-tiles fx-grid-tiles-4">
            <TileCard
              href="/qui-recoit"
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
              href="/investissements"
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
              href="/dette-patrimoine"
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

function GroupedSubRows({
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