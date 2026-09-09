"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle client-side (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import PageTOC from "@/components/fusion/PageTOC";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageIntro from "@/components/fusion/PageIntro";
import { fmtBillions, fmtDec, fmtInt } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { BudgetPageData, VoteExecuteData } from "@/lib/fusion-data";
import { slugifyLabel } from "@/lib/projet-utils";
import { useT, useLocale, type Locale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { cityPopulation, citySlugFromPathname } from "@/lib/methodology";
import fonctionLabels from "@/data/budget-fonction-labels.json";
import { NATURE_GROUPS } from "@/lib/budget-natures";

type FonctionLabel = { fr: string; en: string; sub_fr?: string; sub_en?: string };
const FONCTIONS: Record<string, FonctionLabel> = fonctionLabels as Record<string, FonctionLabel>;
/** Le libellé clair d'une mission, avec les mots de la fiche de poste
 *  (`budget-fonction-labels.json`), repli sur la traduction générique. */
function missionLabel(key: string, locale: Locale): string {
  const fl = FONCTIONS[key];
  return fl ? (locale === "en" ? fl.en : fl.fr) : trLabel(key, locale);
}

type BudgetIndexLite = {
  availableYears: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute" }[];
};

type Props = {
  index: BudgetIndexLite;
  d: BudgetPageData;
  /** Conservé pour la signature des pages appelantes ; la page v3 ne montre plus
   *  le voté/exécuté (retiré à la demande de Daniel, 2026-09-04). */
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

/** Les catégories de flux du pipeline, regroupées en mots de tous les jours —
 *  la même table que le ruban de chaque fiche de poste et la fiche de nature. */
const FLOW_GROUPS = NATURE_GROUPS.filter((g) => g.key !== "autres");

/**
 * Page budget v3 (2026-09-08) — deux temps, validés en maquette avec Daniel :
 *   1. Combien : le chiffre de l'année, deux repères (par habitant, encaissé),
 *      la tendance en barres à côté (années votées hachurées). Le graphe
 *      « Évolution depuis 2019 » n'est plus une section.
 *   2. Dépenses et recettes : les deux colonnes, avec sur chaque ligne sa
 *      tendance et sa part, chaque ligne ouvrant la fiche de poste ; et une
 *      fois pour tout le budget, « sous quelle forme la Ville dépense ».
 * Puis les articles et les sources. Disparaissent : la bande de quatre
 * chiffres, la phrase « sur 100 € », le voté/exécuté, les écarts.
 * Partagée avec Marseille : population, chemins et libellés viennent de la
 * ville dans l'URL ; les blocs sans donnée (flux) ne se rendent pas.
 */
export default function BudgetClient({ index, d, posts }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const population = cityPopulation(citySlug);
  const cityBasePath = `/fr/city/${citySlug}/budget`;

  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const eur = (n: number) => (n >= 1e9 ? `${fmtBillions(n)} ${t("fx.s.md_eur")}` : `${fmtInt(n / 1e6)} ${t("fx.s.m_eur")}`);
  const Amt = ({ n, size = 15 }: { n: number; size?: number }) => (
    <span className="fx-v3-amt tnum" style={{ fontSize: size }}>
      {n >= 1e9 ? fmtBillions(n) : fmtInt(n / 1e6)}<span className="u">{n >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur")}</span>
    </span>
  );

  const yearType = index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVoted = yearType === "vote";
  const lastExecuted = index.summary.filter((s) => s.type_budget === "execute" && s.year < d.year).map((s) => s.year).sort((a, b) => b - a)[0];

  /* ── La tendance : toutes les années publiées, la courante en noir ── */
  const years = d.yearsSummary;
  const maxDep = Math.max(...years.map((y) => y.depenses), 1);
  const first = years[0];
  const sinceFirst = first && first.year !== d.year && first.depenses > 0 ? ((d.depenses - first.depenses) / first.depenses) * 100 : null;
  // « sur un an » = vs l'année publiée juste avant, quel que soit son statut —
  // pas vs la dernière année complète (2022), qui faisait dire « vs 2022 » en 2024.
  const prevYear = years.filter((y) => y.year < d.year).sort((a, b) => b.year - a.year)[0];
  const deltaYear = prevYear && prevYear.depenses > 0 ? ((d.depenses - prevYear.depenses) / prevYear.depenses) * 100 : null;
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${fmtDec(Math.abs(x), 1)} %`;

  /* ── Les lignes : libellé, courbe, montant, part ── */
  const Spark = ({ label }: { label: string }) => {
    const pts = (d.series[label] ?? []).filter((p) => p.year <= d.year);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `${p.year} : ${eur(p.value)}`).join(" · ")}>
        {pts.map((p) => (
          <i key={p.year} className={p.year === d.year ? "now" : p.type === "vote" ? "vote" : ""} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />
        ))}
      </span>
    );
  };
  // « Autres (D) », « Personnel (R) » : le suffixe de sens est un artefact du
  // sankey (deux nœuds homonymes), pas un mot pour le lecteur.
  const label = (raw: string) => (raw.startsWith("Autres (") || raw.startsWith("Autre (") ? t("fx.bud.autres") : trLabel(raw.replace(/\s\((D|R)\)$/, ""), locale));
  // Au survol, la ligne dit ce qu'elle contient (trois missions, mêmes mots que
  // la fiche) ; le chevron dit qu'elle s'ouvre. Sur écran tactile, le chevron seul.
  const Row = ({ raw, value, total, missions = [] }: { raw: string; value: number; total: number; missions?: { key: string; value: number }[] }) => {
    const peek = missions.length ? fill("fx.bud.v3.peek", { list: missions.map((m) => `${missionLabel(m.key, locale)} ${eur(m.value)}`).join(" · ") }) : undefined;
    return (
      <Link href={`${cityBasePath}/poste/${slugifyLabel(raw)}?year=${d.year}`} scroll={false} className="fx-bud-row" data-peek={peek}>
        <span className="n">{label(raw)}</span>
        <Spark label={raw} />
        <Amt n={value} size={14} />
        <span className="p tnum">{Math.round((value / total) * 100)} %</span>
        <span className="c" aria-hidden="true">›</span>
      </Link>
    );
  };
  // Une ligne sous 0,5 % du total n'apporte qu'un « 0 % » : on la tait.
  const dep = d.topDepenses.filter((x) => x.value / d.depenses >= 0.005);
  const rec = d.recettesBreakdown.filter((x) => x.value / d.recettes >= 0.005);
  const sparkSpan = (() => { const ys = years.filter((y) => y.year <= d.year).map((y) => y.year); return ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : String(d.year); })();

  /* ── Sous quelle forme : les flux du drilldown regroupés en mots simples ── */
  const flowTotal = d.flowSplit.reduce((s, f) => s + f.value, 0);
  const groups = FLOW_GROUPS.map((g) => ({ ...g, value: d.flowSplit.filter((f) => g.flows.includes(f.key)).reduce((s, f) => s + f.value, 0) }));
  const grouped = groups.reduce((s, g) => s + g.value, 0);
  const autres = flowTotal - grouped;
  const flowRows = [...groups.filter((g) => g.value > 0), ...(autres > 0 ? [{ key: "autres", flows: [], color: "#c8ccd3", value: autres }] : [])]
    .map((g) => ({ ...g, pct: flowTotal > 0 ? Math.round((g.value / flowTotal) * 100) : 0 }))
    .filter((g) => g.pct >= 1);

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-flux", label: t("fx.toc.flux") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <PageIntro
        title={<>{t("fx.bud.title.before")}<em>{t("fx.bud.title.em")}</em>{t("fx.bud.title.after")}</>}
        lede={t("fx.bud.lede.l1")}
        actions={
          <YearPicker
            years={index.availableYears.slice().sort((a, b) => a - b)}
            votedYears={index.votedYears ?? []}
            current={d.year}
            basePath={cityBasePath}
            label={t("fx.bud.year_label")}
          />
        }
      >
        {isVoted && (
          <p className="fx-bud-voted">
            <span>{fill("fx.bud.voted_notice", { year: d.year, next: d.year + 1 })}</span>
            {lastExecuted && <Link href={`${cityBasePath}?year=${lastExecuted}`}>{fill("fx.bud.voted_notice_cta", { year: lastExecuted })}</Link>}
          </p>
        )}
      </PageIntro>

      <section className="fx-section" id="sec-flux">
        <div className="fx-wrap fx-v3 fx-bud-v3">

          <div className="fx-v3-herogrid">
            <div>
              <div className="fx-v3-hero-num tnum">{fmtBillions(d.depenses)}<span className="u">{t("fx.s.md_eur")}</span></div>
              <div className="fx-v3-hero-cap">{fill(isVoted ? "fx.bud.v3.cap_vote" : "fx.bud.v3.cap_exec", { year: d.year })}</div>
              <div className="fx-v3-hero-meta">
                {population > 0 ? `${fill("fx.bud.v3.par_hab", { n: fmtInt(d.depenses / population) })} · ` : ""}
                {fill(isVoted ? "fx.bud.v3.recettes_vote" : "fx.bud.v3.recettes_exec", { rec: eur(d.recettes) })}
              </div>
            </div>
            {years.length > 1 && (
              <div className="fx-v3-trend">
                <div className="t">
                  {deltaYear != null && <b>{signed(deltaYear)} {fill("fx.bud.v3.vs", { y: prevYear.year })}</b>}
                  {sinceFirst != null && <span> · {signed(sinceFirst)} {fill("fx.bud.v3.depuis", { y: first.year })}</span>}
                </div>
                <div className="bars" aria-hidden="true">
                  {years.map((y) => (
                    <div key={y.year} className={y.year === d.year ? "now" : y.type === "vote" ? "vote" : ""} title={`${y.year} · ${eur(y.depenses)}`}>
                      <b style={{ height: Math.max(3, Math.round((y.depenses / maxDep) * 50)) }} />
                      <span>{y.year}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h2 className="fx-v3-h2">{t("fx.bud.v3.h2")}</h2>
          <p className="fx-v3-h2sub">{fill("fx.bud.v3.h2sub", { span: sparkSpan })}</p>

          <div className="fx-bud-cols">
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_dep")}</span><span className="tnum">{eur(d.depenses)}</span></h3>
              {dep.map((x) => <Row key={x.label} raw={x.label} value={x.value} total={d.depenses} missions={x.topMissions} />)}
            </div>
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_rec")}</span><span className="tnum">{eur(d.recettes)}</span></h3>
              {rec.map((x) => <Row key={x.label} raw={x.label} value={x.value} total={d.recettes} missions={x.topMissions} />)}
              {flowRows.length > 1 && (
                <div className="fx-bud-forme">
                  <div className="h">{t("fx.bud.v3.forme")}</div>
                  {/* Chaque segment et chaque mot de la légende ouvrent la fiche de la nature :
                      « les salaires, combien, et où ils vont poste par poste ». Pas de fiche pour « autres ». */}
                  <div className="stack">
                    {flowRows.map((g) => g.key === "autres"
                      ? <span key={g.key} style={{ width: `${g.pct}%`, background: g.color }} title={`${t(`fx.bud.v3.flow.${g.key}`)} · ${g.pct} %`} />
                      : <Link key={g.key} href={`${cityBasePath}/nature/${g.key}?year=${d.year}`} scroll={false} style={{ width: `${g.pct}%`, background: g.color }} title={`${t(`fx.bud.v3.flow.${g.key}`)} · ${g.pct} %`} aria-label={t(`fx.bud.v3.flow.${g.key}`)} />)}
                  </div>
                  <div className="legend">
                    {flowRows.map((g) => g.key === "autres"
                      ? <span key={g.key}><i style={{ background: g.color }} /><b>{g.pct} %</b> {t(`fx.bud.v3.flow.${g.key}`)}</span>
                      : <Link key={g.key} href={`${cityBasePath}/nature/${g.key}?year=${d.year}`} scroll={false}><i style={{ background: g.color }} /><b>{g.pct} %</b> {t(`fx.bud.v3.flow.${g.key}`)}</Link>)}
                  </div>
                  <p className="note">{fill("fx.bud.v3.forme_note", { pct: Math.round(d.flowCoveragePct) })}</p>
                </div>
              )}
            </div>
          </div>

          <ChartSource
            source={t("fx.bud.s03.source.cite")}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="budget"
          />
        </div>
      </section>

      <RelatedArticles posts={posts} placeholders={BUD_PLACEHOLDERS} />

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
                download: `budget-${citySlug}-${d.year}.csv`,
              },
              {
                label: t("fx.bud.s06.export.json"),
                href: `/data/budget_sankey_${d.year}.json`,
                download: `budget-${citySlug}-${d.year}.json`,
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
