"use client";
import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import PageTOC from "@/components/fusion/PageTOC";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import Tip from "@/components/fusion/Tip";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import FournisseursBumpChart from "@/components/fusion/FournisseursBumpChart";
import MarchesSearch from "./MarchesSearch";
import MarchesSignature from "@/components/fusion/MarchesSignature";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { fmtBillions, fmtDec, fmtInt } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { MarchesPageData , FournisseursRankingData } from "@/lib/fusion-data";
import { useT } from "@/lib/localeContext";

type MarchesIndex = { availableYears?: number[] };

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

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
  ranking,
  posts,
}: {
  idx: MarchesIndex;
  d: MarchesPageData;
  ranking: FournisseursRankingData | null;
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const top10Pct = d.total > 0 ? (d.top10.reduce((s, ti) => s + ti.amount, 0) / d.total) * 100 : 0;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-signature", label: t("fx.toc.signature") },
          { id: "sec-procedure", label: t("fx.toc.procedure") },
          { id: "sec-categorie", label: t("fx.toc.categories") },
          { id: "sec-classement", label: t("fx.toc.classement") },
          { id: "sec-recherche", label: t("fx.toc.recherche") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <PageIntro
        title={
          <>
            {t("fx.mp.title.before")}
            <em>{t("fx.mp.title.em")}</em>
            {t("fx.mp.title.after")}
          </>
        }
        lede={
          <>
            {fmtInt(d.nb)}{" "}
            <Tip label={t("fx.mp.lede.a.contrats.tip")}>{t("fx.mp.lede.a.contrats")}</Tip>
            {t("fx.mp.lede.a.notifies")}{d.year}{t("fx.mp.lede.b")}{fmtInt(d.nbTitulaires)}{" "}
            <Tip label={t("fx.mp.titulaire.tip")}>fournisseurs</Tip>
            {t("fx.mp.lede.c")}
            <b>
              <Tip label={t("fx.mp.lede.em.tip")}>{t("fx.mp.lede.em")}</Tip>
            </b>
            {t("fx.mp.lede.d")}
          </>
        }
        actions={
          <YearPicker
            years={(idx.availableYears ?? []).slice().sort((a, b) => a - b)}
            current={d.year}
            basePath="/fr/city/paris/marches"
            label={t("fx.s.year_label")}
          />
        }
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={d.total} format={(n) => fmtBillions(n)} />}
              unit={t("fx.s.md_eur")}
              label={<Tip label={t("fx.mp.s01.hero_cap.em.tip")}>{fill(t("fx.mp.s01.hero_label"), { year: d.year })}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.nb} format={(n) => fmtInt(n)} />}
              label={<Tip label={t("fx.mp.s01.kpi.notifies.tip")}>{t("fx.mp.s01.kpi.notifies")}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.nbTitulaires} format={(n) => fmtInt(n)} />}
              label={<Tip label={t("fx.mp.titulaire.tip")}>{t("fx.mp.s01.kpi.titulaires")}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={top10Pct} format={(n) => `${fmtDec(n, 0)} %`} />}
              label={<Tip label={t("fx.mp.s01.kpi.concentration_tip")}>{t("fx.mp.s01.kpi.concentration")}</Tip>}
            />
          </>
        }
      />

      {/* Scène signature — trois contrats réels de l'année, sélection par
       * règles fixes (cf. loadMarchesPageData). La page ne montrait que des
       * agrégats ; ces cartes donnent la matérialité et mènent aux fiches. */}
      {d.signature.length > 0 && (
        <section className="fx-section" id="sec-signature">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {fill(t("fx.mp.sig.title.before"), { year: d.year })}
                  <em>{t("fx.mp.sig.title.em")}</em>
                  {fill(t("fx.mp.sig.title.after"), { year: d.year })}
                </>
              }
              subtitle={fill(
                // Avant 2024, les DECP ne publient pas le nombre d'offres :
                // seuls les volets concurrence disparaissent, on l'explique.
                t(d.signature.some((s) => s.offres != null) ? "fx.mp.sig.sub" : "fx.mp.sig.sub_nooffres"),
                { year: d.year },
              )}
            />
            <MarchesSignature items={d.signature} />
          </div>
        </section>
      )}

      <section className="fx-section" id="sec-procedure">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.mp.s05.title.before")}
                <em><Tip label={t("fx.mp.s05.kind.tip")}>{t("fx.mp.s05.title.em")}</Tip></em>
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
                                // Ocre sur l'offre unique — même langage que les
                                // fiches contrat et les cartes de résultats.
                                background: b.bucket === "1" ? "var(--ocre)" : "var(--ink)",
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
            source={fill(t("fx.mp.s03.source.cite"), { year: d.year })}
            dataHref="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/"
            methodAnchor="marches-publics"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-categorie">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.mp.s02.title.before")}
                <em><Tip label={t("fx.mp.s02.kind.tip")}>{t("fx.mp.s02.title.em")}</Tip></em>
              </>
            }
            subtitle={t("fx.mp.s02.sub")}
          />
          <StackedBarTheme
            items={d.byCategory.map((c) => ({ theme: c.category, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={top10Pct}
            year={d.year}
            basePath="/fr/city/paris/marches"
            kicker={fill(t("fx.mp.s02.kicker"), { year: d.year })}
            entityNoun={t("fx.mp.s02.entity_noun")}
            paretoContrast={t("fx.mp.s02.pareto_contrast")}
          />
          <ChartSource
            source={t("fx.mp.s02.source.cite")}
            dataHref="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/"
            methodAnchor="marches-publics"
          />
          {(() => {
            const hookVars = {
              year: d.year,
              total: fmtBillions(d.total),
              nb: fmtInt(d.nb),
              nbT: fmtInt(d.nbTitulaires),
              top10: fmtDec(top10Pct, 0),
            };
            return (
              <PageHook
                variant="card"
                cite={fill(t("fx.mp.hook.cite"), { year: d.year })}
                shareText={fill(t("fx.mp.hook.share"), hookVars)}
              >
                <span dangerouslySetInnerHTML={{ __html: fill(t("fx.mp.hook.body"), hookVars) }} />
              </PageHook>
            );
          })()}
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
            <Link href="/fr/city/paris/budget" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_budget")}</Link>
            {" · "}
            <Link href="/fr/city/paris/investissements" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_invest")}</Link>
            {" · "}
            <Link href="/methode#marches-publics" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>{t("fx.mp.s01.cross.link_methode")}</Link>
          </div>
        </div>
      </section>

      {ranking && (
        <section className="fx-section" id="sec-classement">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("fx.mp.rank.title.before")}
                  <em>{t("fx.mp.rank.title.em")}</em>
                  {t("fx.mp.rank.title.after")}
                </>
              }
              subtitle={fill(t("fx.mp.rank.sub"), {
                n: ranking.rows.length,
                from: ranking.years[0],
                to: ranking.years[ranking.years.length - 1],
                share: Math.round(ranking.topSharePct),
              })}
            />
            <FournisseursBumpChart data={ranking} ficheBase="/fr/city/paris/marches" />
            <p className="fx-note">{t("fx.mp.rank.note")}</p>
            <ChartSource
              source={fill(t("fx.mp.rank.source.cite"), { from: ranking.years[0], to: ranking.years[ranking.years.length - 1] })}
              dataHref="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/"
              methodAnchor="marches"
            />
          </div>
        </section>
      )}

      <section className="fx-section" id="sec-recherche">
        <div className="fx-wrap">
          <SectionHead
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


      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
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
            source={t("fx.mp.s05.source.cite")}
            dataHref="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/"
            methodAnchor="marches-publics"
          />
        </div>
      </section>

      <RelatedArticles posts={posts} placeholders={MP_PLACEHOLDERS} />

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#marches-publics" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b> : {t("fx.mp.footer.source")} <span className="sep">·</span> <b>{t("fx.footer.coverage_label")}</b> : {t("fx.mp.footer.coverage")}
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

      </main>
      <Footer />
    </div>
  );
}