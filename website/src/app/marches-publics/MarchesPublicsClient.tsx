"use client";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import PageTOC from "@/components/fusion/PageTOC";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import ExpandableList from "@/components/fusion/ExpandableList";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import Tip from "@/components/fusion/Tip";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import MarchesSearch from "./MarchesSearch";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { MarchesPageData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type MarchesIndex = { availableYears?: number[] };

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

const cleanName = (n: string) => n.replace(/\s{2,}/g, " ").trim().slice(0, 60);

const MP_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Enquête",
    title: "Les avenants BTP : +18 % en moyenne, pourquoi ?",
    description:
      "Entre montant notifié et montant final, la dérive est structurelle sur les chantiers urbains. Cinq causes qui reviennent partout.",
  },
  {
    category: "Explication",
    title: "CPV, MAPA, accord-cadre : lire un marché sans se perdre.",
    description:
      "Le vocabulaire de la commande publique en version courte, illustré avec des cas réels de la Ville de Paris.",
  },
];

export default function MarchesPublicsClient({
  idx,
  d,
  posts,
}: {
  idx: MarchesIndex;
  d: MarchesPageData;
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const trL = (s: string | undefined) => trLabel(s, locale);
  const top10Pct = d.total > 0 ? (d.top10.reduce((s, ti) => s + ti.amount, 0) / d.total) * 100 : 0;
  const multiPct = d.total > 0 ? (d.multiAttributaires.amount / d.total) * 100 : 0;

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-categorie", label: t("fx.toc.categories") },
          { id: "sec-titulaires", label: t("fx.toc.titulaires") },
          { id: "sec-recherche", label: t("fx.toc.recherche") },
          { id: "sec-procedure", label: t("fx.toc.procedure") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />


      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.mp.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.mp.title.before")}
            <em>{t("fx.mp.title.em")}</em>
            {t("fx.mp.title.after")}
          </h1>
          <p className="fx-page-lede">
            {fmtInt(d.nb)}{" "}
            <Tip label={t("fx.mp.lede.a.contrats.tip")}>{t("fx.mp.lede.a.contrats")}</Tip>
            {t("fx.mp.lede.a.notifies")}{d.year}{t("fx.mp.lede.b")}{fmtInt(d.nbTitulaires)}{" "}
            <Tip label={t("fx.mp.titulaire.tip")}>fournisseurs</Tip>
            {t("fx.mp.lede.c")}
            <b>
              <Tip label={t("fx.mp.lede.em.tip")}>{t("fx.mp.lede.em")}</Tip>
            </b>
            {t("fx.mp.lede.d")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={(idx.availableYears ?? []).slice().sort((a, b) => a - b)}
              current={d.year}
              basePath="/marches-publics"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <PageHook
        cite={<>DECP · Données essentielles de la commande publique · Ville de Paris · {d.year}</>}
        shareText={
          `Marchés publics Ville de Paris ${d.year} : ${fmtBillions(d.total)} Md€ d'enveloppes contractuelles via ${fmtInt(d.nb)} contrats passés avec ${fmtInt(d.nbTitulaires)} fournisseurs. ` +
          `Top 10 = ${fmtDec(top10Pct, 0)}%.`
        }
      >
        En {d.year}, Paris a notifié <b>{fmtBillions(d.total)} Md€</b>{" "}
        d&apos;enveloppes contractuelles via <b>{fmtInt(d.nb)} contrats</b> passés
        avec <b>{fmtInt(d.nbTitulaires)} fournisseurs</b> distincts — top 10 à{" "}
        <b>{fmtDec(top10Pct, 0)} %</b> du total.
      </PageHook>

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.mp.s01.kind")}
            title={
              <>
                {t("fx.mp.s01.title.before")}
                <em>{t("fx.mp.s01.title.em")}</em>
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.mp.s01.hero_label"), { year: d.year })}
              value={fmtBillions(d.total)}
              unit={t("fx.s.md_eur")}
              caption={
                <>
                  {t("fx.mp.s01.hero_cap.a")}
                  <b>
                    <Tip label={t("fx.mp.s01.hero_cap.em.tip")}>{t("fx.mp.s01.hero_cap.em")}</Tip>
                  </b>
                  {t("fx.mp.s01.hero_cap.b")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: <Tip label={t("fx.mp.s01.kpi.notifies.tip")}>{t("fx.mp.s01.kpi.notifies")}</Tip>,
                  value: fmtInt(d.nb),
                  delta: String(d.year),
                },
                {
                  label: <Tip label={t("fx.mp.titulaire.tip")}>{t("fx.mp.s01.kpi.titulaires")}</Tip>,
                  value: fmtInt(d.nbTitulaires),
                  delta: t("fx.mp.s01.kpi.titulaires_delta"),
                },
                {
                  label: (
                    <Tip label={t("fx.mp.s01.kpi.concentration_tip")}>
                      {t("fx.mp.s01.kpi.concentration")}
                    </Tip>
                  ),
                  value: `${fmtDec(top10Pct, 0)} %`,
                  delta: t("fx.mp.s01.kpi.concentration_delta"),
                },
                {
                  label: (
                    <Tip label={t("fx.mp.s01.kpi.multi_tip")}>
                      {t("fx.mp.s01.kpi.multi")}
                    </Tip>
                  ),
                  value: fmtInt(d.multiAttributaires.count),
                  delta: fill(t("fx.mp.s01.kpi.multi_delta"), { pct: fmtDec(multiPct, 0) }),
                },
              ]}
            />
          </div>
          <div
            style={{
              marginTop: 24,
              padding: "14px 18px",
              border: "1px solid var(--line)",
              background: "rgba(59, 99, 173, 0.04)",
              fontFamily: "var(--f-ui)",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--ink-2)",
            }}
          >
            <b style={{ color: "var(--ink)" }}>{t("fx.mp.s01.cross.title")}</b> {t("fx.mp.s01.cross.body")}
            {" "}
            <Link href="/budget" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_budget")}</Link>
            {" · "}
            <Link href="/investissements" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_invest")}</Link>
            {" · "}
            <Link href="/methode#marches-publics" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_methode")}</Link>
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-categorie">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={<Tip label={t("fx.mp.s02.kind.tip")}>{t("fx.mp.s02.kind")}</Tip>}
            title={
              <>
                {t("fx.mp.s02.title.before")}
                <em>{t("fx.mp.s02.title.em")}</em>
              </>
            }
            subtitle={t("fx.mp.s02.sub")}
          />
          <StackedBarTheme
            items={d.byCategory.map((c) => ({ theme: c.category, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={top10Pct}
            year={d.year}
            basePath="/marches-publics"
            kicker={fill(t("fx.mp.s02.kicker"), { year: d.year })}
            entityNoun={t("fx.mp.s02.entity_noun")}
            paretoContrast={t("fx.mp.s02.pareto_contrast")}
          />
          <ChartSource
            source={<>DECP · Données essentielles de la commande publique · Ville de Paris</>}
            dataHref="https://opendata.paris.fr/explore/dataset/marches-publics-conclus-par-la-ville-de-paris/"
            methodAnchor="marches-publics"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-titulaires">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={<Tip label={t("fx.mp.s03.kind.tip")}>{t("fx.mp.s03.kind")}</Tip>}
            title={
              <>
                {t("fx.mp.s03.title.before")}
                <em>{t("fx.mp.s03.title.em")}</em>
                {t("fx.mp.s03.title.after")}
              </>
            }
            subtitle={fill(t("fx.mp.s03.sub"), {
              year: d.year,
              n: fmtInt(d.multiAttributaires.count),
              pct: fmtDec(multiPct, 0),
            })}
          />
          <ExpandableList
            header={{
              left: <>{t("fx.mp.s03.list.header_left")}</>,
              right: <>{fill(t("fx.mp.s03.list.header_right"), { year: d.year })}</>,
            }}
            items={d.top10.map((ti) => {
              const refMax = d.top10[0].amount || 1;
              const ficheHref = ti.siret
                ? `/marches-publics/fournisseur/${encodeURIComponent(ti.siret)}`
                : null;
              return {
                key: String(ti.rank),
                label: (
                  <span>
                    <span
                      style={{
                        fontFamily: "var(--f-mono)",
                        color: "var(--ocre)",
                        marginRight: 8,
                      }}
                    >
                      {String(ti.rank).padStart(2, "0")}
                    </span>
                    {cleanName(ti.name)}
                  </span>
                ),
                barPct: (ti.amount / refMax) * 100,
                meta: (
                  <>
                    {fill(t("fx.mp.s03.list.meta"), {
                      n: fmtInt(ti.nbContrats),
                      pct: fmtDec((ti.amount / d.total) * 100, 1),
                    })}
                  </>
                ),
                value: ti.amount >= 1e9 ? fmtBillions(ti.amount) : fmtMillions(ti.amount, 0),
                unit: ti.amount >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur"),
                children: (
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11,
                        color: "var(--muted)",
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        marginBottom: 14,
                      }}
                    >
                      {fill(t("fx.mp.s03.list.contrats_header"), {
                        shown: ti.contrats.length,
                        total: ti.nbContrats,
                      })}
                    </div>
                    <table className="fx-table" style={{ borderTop: 0 }}>
                      <thead>
                        <tr>
                          <th>{t("fx.mp.s03.list.col.objet")}</th>
                          <th>{t("fx.mp.s03.list.col.categorie")}</th>
                          <th>{t("fx.mp.s03.list.col.nature")}</th>
                          <th>{t("fx.mp.s03.list.col.date")}</th>
                          <th style={{ textAlign: "right" }}>{t("fx.mp.s03.list.col.enveloppe")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ti.contrats.map((c, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500, maxWidth: 360 }}>
                              {(() => {
                                const clean = c.objetClair || normalizeObjet(c.objet);
                                const shown = clean.length > 100 ? clean.slice(0, 100) + "…" : clean;
                                return c.numero ? (
                                  <Link
                                    href={`/marches-publics/contrat/${encodeURIComponent(c.numero)}`}
                                    style={{ color: "var(--ink)" }}
                                    scroll={false}
                                  >
                                    {shown}
                                  </Link>
                                ) : (
                                  <span>{shown}</span>
                                );
                              })()}
                            </td>
                            <td className="muted" style={{ maxWidth: 160 }}>
                              {(() => { const lbl = trL(c.categorie); return lbl.length > 30 ? lbl.slice(0, 30) + "…" : lbl; })()}
                            </td>
                            <td className="muted">{trL(c.nature)}</td>
                            <td className="muted">
                              {c.date
                                ? new Intl.DateTimeFormat("fr-FR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  }).format(new Date(c.date))
                                : "—"}
                            </td>
                            <td className="num">
                              {c.montant >= 1e6
                                ? fmtMillions(c.montant, 1) + " M €"
                                : fmtInt(c.montant / 1000) + " k €"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 14,
                        flexWrap: "wrap",
                        marginTop: 14,
                      }}
                    >
                      {ficheHref ? (
                        <Link
                          href={ficheHref}
                          style={{
                            fontFamily: "var(--f-mono)",
                            fontSize: 12,
                            color: "var(--bleu)",
                            borderBottom: "1px solid var(--bleu)",
                            paddingBottom: 1,
                          }}
                          scroll={false}
                        >
                          {t("fx.mp.s03.list.fiche_link")}
                        </Link>
                      ) : (
                        <span />
                      )}
                      {ti.nbContrats > ti.contrats.length && (
                        <span
                          style={{
                            fontFamily: "var(--f-mono)",
                            fontSize: 11,
                            color: "var(--muted)",
                          }}
                        >
                          {fill(t("fx.mp.s03.list.more"), { n: ti.nbContrats - ti.contrats.length })}
                        </span>
                      )}
                    </div>
                  </div>
                ),
              };
            })}
          />
          {(() => {
            const total = d.total || 1;
            const top1 = (d.top10.slice(0, 1).reduce((s, ti) => s + ti.amount, 0) / total) * 100;
            const top3 = (d.top10.slice(0, 3).reduce((s, ti) => s + ti.amount, 0) / total) * 100;
            const top5 = (d.top10.slice(0, 5).reduce((s, ti) => s + ti.amount, 0) / total) * 100;
            const top10cum = (d.top10.reduce((s, ti) => s + ti.amount, 0) / total) * 100;
            return (
              <p className="fx-note" style={{ marginTop: 18 }}>
                {fill(t("fx.mp.s03.concentration.note"), {
                  total: fmtBillions(d.total),
                  top1: fmtDec(top1, 0),
                  top3: fmtDec(top3, 0),
                  top5: fmtDec(top5, 0),
                  top10: fmtDec(top10cum, 0),
                })}
              </p>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="sec-recherche">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.mp.s04.kind")}
            title={
              <>
                {t("fx.mp.s04.title.before")}
                <em>{t("fx.mp.s04.title.em1")}</em>
                {t("fx.mp.s04.title.mid")}
                <em>{t("fx.mp.s04.title.em2")}</em>
              </>
            }
            subtitle={fill(t("fx.mp.s04.sub"), { n: fmtInt(d.nb), year: d.year })}
          />
          <MarchesSearch
            items={d.allMarches}
            categories={d.byCategory.map((c) => c.category)}
            natures={d.byNature.map((n) => n.nature)}
            year={d.year}
          />
        </div>
      </section>

      <section className="fx-section" id="sec-procedure">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={<Tip label={t("fx.mp.s05.kind.tip")}>{t("fx.mp.s05.kind")}</Tip>}
            title={
              <>
                {t("fx.mp.s05.title.before")}
                <em>{t("fx.mp.s05.title.em")}</em>
                {t("fx.mp.s05.title.after")}
              </>
            }
            subtitle={t("fx.mp.s05.sub")}
          />
          {(() => {
            const c = d.concurrence;
            const coveragePct = c.coverageTotal > 0 ? (c.coverageCount / c.coverageTotal) * 100 : 0;
            // Le champ offresRecues n'est pas historisé avant 2024 dans DECP :
            // on affiche un état vide honnête si la couverture est trop faible.
            if (coveragePct < 20 || c.coverageCount < 50) {
              return (
                <div
                  style={{
                    border: "1px solid var(--ink)",
                    padding: "28px 22px",
                    background: "var(--bg)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 14,
                    color: "var(--muted)",
                    lineHeight: 1.55,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--ink)",
                      marginBottom: 10,
                    }}
                  >
                    {t("fx.mp.s05.empty.kicker")}
                  </div>
                  <p style={{ margin: 0 }}>
                    {fill(t("fx.mp.s05.empty.body"), {
                      year: d.year,
                      n: fmtInt(c.coverageCount),
                      total: fmtInt(c.coverageTotal),
                    })}
                  </p>
                </div>
              );
            }
            const refMax = Math.max(...c.buckets.map((b) => b.count), 1);
            return (
              <>
                <div
                  style={{
                    border: "1px solid var(--ink)",
                    padding: "22px 22px 18px",
                    marginBottom: 0,
                    background: "var(--bg)",
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 1fr)",
                    gap: 28,
                    alignItems: "baseline",
                    borderBottom: "none",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        marginBottom: 8,
                      }}
                    >
                      <Tip label={t("fx.mp.s05.mono.tip")}>{t("fx.mp.s05.mono.label")}</Tip>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--f-disp)",
                        fontSize: 56,
                        fontWeight: 700,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {fmtDec(c.monoPct, 0)}
                      <span style={{ fontSize: ".45em", fontWeight: 500, marginLeft: 4 }}>%</span>
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11.5,
                        color: "var(--muted)",
                        marginTop: 6,
                      }}
                    >
                      {fill(t("fx.mp.s05.mono.sub"), { n: fmtInt(c.monoCount) })}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        marginBottom: 8,
                      }}
                    >
                      {t("fx.mp.s05.avg.label")}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--f-disp)",
                        fontSize: 56,
                        fontWeight: 700,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {fmtDec(c.avgOffres, 1)}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11.5,
                        color: "var(--muted)",
                        marginTop: 6,
                      }}
                    >
                      {t("fx.mp.s05.avg.sub")}
                    </div>
                  </div>
                </div>
                <div style={{ border: "1px solid var(--ink)", borderTop: "none" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "14px 22px",
                      borderBottom: "1px solid var(--ink)",
                      background: "var(--bg)",
                      fontFamily: "var(--f-mono)",
                      fontSize: 11.5,
                      letterSpacing: ".02em",
                      color: "var(--ink)",
                    }}
                  >
                    <span>{t("fx.mp.s05.hist.left")}</span>
                    <span>{t("fx.mp.s05.hist.right")}</span>
                  </div>
                  <div style={{ padding: "4px 0" }}>
                    {c.buckets.map((b) => {
                      const pct = c.coverageCount > 0 ? (b.count / c.coverageCount) * 100 : 0;
                      return (
                        <div
                          key={b.bucket}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, 2fr) 100px",
                            gap: 20,
                            padding: "14px 22px",
                            borderBottom: "1px solid var(--rule)",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontFamily: "var(--f-ui)", fontSize: 15, fontWeight: 500 }}>
                              {t(`fx.mp.s05.bucket.${b.bucket}`)}
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--f-mono)",
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 2,
                              }}
                            >
                              {fill(t("fx.mp.s05.bucket.sub"), { n: fmtInt(b.count) })}
                            </div>
                          </div>
                          <div style={{ position: "relative", height: 12 }}>
                            <span
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${(b.count / refMax) * 100}%`,
                                background: "var(--ink)",
                              }}
                            />
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--f-disp)",
                              fontWeight: 700,
                              fontSize: 18,
                              letterSpacing: "-0.02em",
                              textAlign: "right",
                            }}
                          >
                            {fmtDec(pct, 0)}
                            <span
                              style={{
                                fontSize: ".6em",
                                color: "var(--muted)",
                                fontWeight: 500,
                                marginLeft: 2,
                              }}
                            >
                              %
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="fx-note">
                  {fill(t("fx.mp.s05.note"), {
                    n: fmtInt(c.coverageCount),
                    total: fmtInt(c.coverageTotal),
                    pct: fmtDec(coveragePct, 0),
                  })}
                </p>
              </>
            );
          })()}
          <ChartSource
            source={<>DECP · Données essentielles de la commande publique · champ <code>offresRecues</code> · année {d.year}</>}
            dataHref="https://opendata.paris.fr/explore/dataset/marches-publics-conclus-par-la-ville-de-paris/"
            methodAnchor="marches-publics"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.mp.s07.kind")}
            title={
              <>
                {t("fx.mp.s07.title.before")}
                <em>{fill(t("fx.mp.s07.title.em"), { year: String(d.yearsSummary[0]?.year ?? "") })}</em>
                {t("fx.mp.s07.title.after")}
              </>
            }
            subtitle={t("fx.mp.s07.sub")}
          />
          <BudgetTimeline
            points={d.yearsSummary
              .filter((y) => y.total > 0)
              .map((y) => ({
                year: y.year,
                value: y.total / 1_000_000_000,
                type: "execute" as const,
              }))}
            activeYear={d.year}
          />
          <p className="fx-note">
            <b>{t("fx.s.note")}</b> : {t("fx.mp.s07.note")}
          </p>
          <ChartSource
            source={<>DECP — Ville de Paris · cumul annuel des plafonds notifiés</>}
            dataHref="https://opendata.paris.fr/explore/dataset/marches-publics-conclus-par-la-ville-de-paris/"
            methodAnchor="marches-publics"
          />
        </div>
      </section>

      <RelatedArticles number="07" posts={posts} placeholders={MP_PLACEHOLDERS} />

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={t("fx.mp.s08.kind")}
            subtitle={t("fx.mp.s08.sub")}
          />
          <div className="fx-grid-tiles">
            <TileCard
              href="/qui-recoit"
              number={t("fx.mp.s08.t1.n")}
              kind={t("fx.mp.s08.t1.kind")}
              title={t("fx.mp.s08.t1.title")}
              description={t("fx.mp.s08.t1.desc")}
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
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={String(d.year)}
            />
            <TileCard
              href="/investissements"
              number={t("fx.mp.s08.t2.n")}
              kind={t("fx.mp.s08.t2.kind")}
              title={t("fx.mp.s08.t2.title")}
              description={t("fx.mp.s08.t2.desc")}
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
              kpi="2,6"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={t("fx.mp.s08.t2.delta")}
            />
            <TileCard
              href="/budget"
              number={t("fx.mp.s08.t3.n")}
              kind={t("fx.mp.s08.t3.kind")}
              title={t("fx.mp.s08.t3.title")}
              description={t("fx.mp.s08.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 30 C 70 30 90 46 94 46" stroke="#0a0a0a" strokeWidth="8" fill="none" />
                  <path d="M 6 60 C 70 60 90 54 94 54" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <rect x="92" y="38" width="16" height="24" fill="#0a0a0a" />
                  <path d="M 108 46 C 140 46 160 32 194 32" stroke="#0a0a0a" strokeWidth="8" fill="none" />
                  <path d="M 108 58 C 140 58 160 74 194 74" stroke="#e11d1d" strokeWidth="6" fill="none" />
                </svg>
              }
              kpi="11,7"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={`Total ${d.year}`}
            />
          </div>
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#marches-publics" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>Source</b> : DECP — Ville de Paris (opendata.paris.fr) <span className="sep">·</span> <b>Couverture</b> : marchés notifiés depuis 2013. Montants affichés = plafonds contractuels maximaux.
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.mp.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/marches-publics/marches_${d.year}.json`,
              },
              { label: t("fx.mp.src.export.json"), href: `/data/marches-publics/marches_${d.year}.json` },
              { label: t("fx.mp.src.export.index"), href: "/data/marches-publics/index.json" },
              { label: t("fx.mp.src.export.method"), href: "/methode?tool=marches-publics#outils" },
            ]}
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}