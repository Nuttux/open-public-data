"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { citySlugFromPathname } from "@/lib/methodology";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import PageTOC from "@/components/fusion/PageTOC";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import QuiRecoitExplorer from "./QuiRecoitExplorer";
import SubventionsBeeswarm from "@/components/fusion/SubventionsBeeswarm";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { QuiRecoitData } from "@/lib/fusion-data";
import { slugifyLabel } from "@/lib/projet-utils";
import { useT } from "@/lib/localeContext";

type QuiRecoitIndex = { availableYears: number[]; previewYears?: number[] };

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const QR_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Enquête",
    title: "Subventions aux opérateurs : ce que la Ville finance hors vote annuel.",
    description:
      "CASVP, AGOSPAP, caisses des écoles — les transferts structurels représentent plus de la moitié du total. Anatomie d'un budget invisible.",
  },
  {
    category: "Explication",
    title: "Conventions pluri-annuelles : comment lire une ligne de subvention sur plusieurs exercices.",
    description:
      "Engagement, versement, solde — trois moments comptables pour un même euro. Ce que le CA publie, et ce qu'il ne publie pas.",
  },
];

export default function QuiRecoitClient({
  idx,
  d,
  posts,
}: {
  idx: QuiRecoitIndex;
  d: QuiRecoitData;
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const cityBasePath = `/fr/city/${citySlug}/subventions`;
  const swarmIndexUrl =
    citySlug === "paris"
      ? "/data/subventions/beneficiaires_search.json"
      : `/data/${citySlug}/subventions/beneficiaires_search.json`;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-nuee", label: t("fx.toc.nuee") },
          { id: "sec-themes", label: t("fx.toc.themes") },
          { id: "sec-top-benef", label: t("fx.toc.top_benef") },
          { id: "recherche", label: t("fx.toc.recherche") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <PageIntro
        title={
          <>
            {t("fx.qr.title.before")}
            <em>{t("fx.qr.title.em")}</em>
            {t("fx.qr.title.after")}
          </>
        }
        lede={
          <>
            <b>
              {fmtInt(d.nbSubventions)}{" "}
              <Tip label={t("fx.qr.subv.tip")}>{t("fx.qr.lede.subv")}</Tip>
            </b>
            {fill(t("fx.qr.lede.versees"), { year: d.year })}
            {t("fx.qr.lede.c.pre")}
            <Tip label={t("fx.qr.lede.operateurs.tip")}>{t("fx.qr.lede.operateurs")}</Tip>
            {t("fx.qr.lede.c.post")}
          </>
        }
        actions={
          <YearPicker
            years={idx.availableYears.slice().sort((a, b) => a - b)}
            previewYears={idx.previewYears ?? []}
            current={d.year}
            basePath={cityBasePath}
            label={t("fx.s.year_label")}
          />
        }
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={d.total} format={(n) => fmtBillions(n)} />}
              unit={t("fx.s.md_eur")}
              label={fill(t("fx.qr.s01.hero_label"), { year: d.year })}
            />
            <IntroStat
              value={<AnimatedNumber value={d.nbSubventions} format={(n) => fmtInt(n)} />}
              label={<Tip label={t("fx.qr.s01.kpi.versees.tip")}>{t("fx.qr.s01.kpi.versees")}</Tip>}
            />
            <IntroStat
              value={
                <AnimatedNumber
                  value={d.medianSubvention}
                  format={(n) =>
                    n >= 1_000_000 ? fmtMillions(n, 1) + " M" : fmtInt(n / 1_000) + " k"
                  }
                />
              }
              unit="€"
              label={<Tip label={t("fx.qr.s01.kpi.mediane.tip")}>{t("fx.qr.s01.kpi.mediane")}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.concentrationTop10Pct} format={(n) => `${fmtDec(n, 0)} %`} />}
              label={<Tip label={t("fx.mp.s01.kpi.concentration_tip")}>{t("fx.mp.s01.kpi.concentration")}</Tip>}
            />
          </>
        }
      >
        {(idx.previewYears ?? []).includes(d.year) && (
          <div className="fx-preview-banner" role="note">
            <span className="fx-preview-tag">{t("fx.qr.preview.tag")}</span>
            <span dangerouslySetInnerHTML={{ __html: fill(t("fx.qr.preview.body"), { year: d.year }) }} />
          </div>
        )}
      </PageIntro>

      <section className="fx-section" id="sec-nuee">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.qr.swarm.title.before")}
                <em>{t("fx.qr.swarm.title.em")}</em>
                {t("fx.qr.swarm.title.after")}
              </>
            }
            subtitle={fill(t("fx.qr.swarm.sub"), { year: d.year, nb: fmtInt(d.nbBeneficiaires) })}
          />
          <SubventionsBeeswarm year={d.year} searchIndexUrl={swarmIndexUrl} ficheBase={cityBasePath} />
          {(() => {
            const medianStr = d.medianSubvention >= 1_000_000
              ? `${fmtMillions(d.medianSubvention, 1)} M€`
              : `${fmtInt(d.medianSubvention / 1_000)} k€`;
            const concentr = Math.round(d.concentrationTop10Pct);
            const vars = {
              year: d.year,
              total: fmtBillions(d.total),
              nb: fmtInt(d.nbSubventions),
              median: medianStr,
              concentr,
              prev: d.previousYear,
              pct: fmtDec(Math.abs(d.deltaMontantPct), 1),
            };
            const showDelta = !d.isPreview && Math.abs(d.deltaMontantPct) > 1;
            const deltaKey =
              d.deltaMontantPct >= 0 ? "fx.qr.hook.body.delta_up" : "fx.qr.hook.body.delta_down";
            return (
              <PageHook
                variant="card"
                cite={fill(t("fx.qr.hook.cite"), { year: d.year })}
                shareText={fill(t("fx.qr.hook.share"), vars)}
              >
                <span dangerouslySetInnerHTML={{ __html: fill(t("fx.qr.hook.body.intro"), vars) }} />
                {showDelta ? (
                  <span dangerouslySetInnerHTML={{ __html: fill(t(deltaKey), vars) }} />
                ) : null}
                <span dangerouslySetInnerHTML={{ __html: fill(t("fx.qr.hook.body.tail"), vars) }} />
              </PageHook>
            );
          })()}
          <ChartSource
            source={fill(t("fx.qr.s02.source.cite"), { year: d.year })}
            dataHref="https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/"
            methodAnchor="subventions"
          />
        </div>
      </section>

      {/* « Par exemple » — même grammaire que marchés/investissements. */}

      <section className="fx-section" id="sec-themes">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.qr.s02.title.before")}
                <em><Tip label={t("fx.qr.s02.kind.tip")}>{t("fx.qr.s02.title.em")}</Tip></em>
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
            basePath={cityBasePath}
            entityNoun={t("fx.qr.s02.entity_noun")}
            paretoContrast={t("fx.qr.s02.pareto_contrast")}
            hrefBuilder={(theme) =>
              `${cityBasePath}/theme/${slugifyLabel(theme)}?year=${d.year}`
            }
          />
          <ChartSource
            source={fill(t("fx.qr.s02.source.cite"), { year: d.year })}
            dataHref="https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/"
            methodAnchor="subventions"
          />
        </div>
      </section>

      <Suspense fallback={null}>
        <QuiRecoitExplorer
          year={d.year}
          top10={d.top10}
          themes={d.availableThemes}
          concentrationTop10Pct={d.concentrationTop10Pct}
          personnesPhysiques={d.personnesPhysiques}
        />
      </Suspense>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.qr.s05.title.before")}
                <em>{fill(t("fx.qr.s05.title.em"), { year: String(d.yearsSummary[0]?.year ?? 2019) })}</em>
                {t("fx.qr.s05.title.after")}
              </>
            }
            subtitle={t("fx.qr.s05.sub")}
          />
          {(() => {
            // Preview years use a vote-cumulative scope that isn't
            // comparable to consolidated payment-flow totals. Showing them
            // on the timeline creates a misleading spike, so we plot only
            // consolidated years and surface the preview total in a note.
            const consolidated = d.yearsSummary.filter((y) => !y.preview);
            const previewYear = d.yearsSummary.find((y) => y.preview);
            const activeForChart = consolidated.some((y) => y.year === d.year)
              ? d.year
              : consolidated[consolidated.length - 1]?.year ?? d.year;
            const showPreviewNote = d.isPreview && previewYear;
            return (
              <>
                {showPreviewNote && (
                  <div className="fx-timeline-preview-note">
                    <span className="fx-preview-tag">Hors courbe</span>
                    <span>
                      {previewYear.year} voté à ce jour :
                      {" "}<b>{fmtBillions(previewYear.total)} Md €</b> sur
                      {" "}{fmtInt(previewYear.count)} délibérations. Non tracé
                      {" "}car le périmètre de vote n&apos;est pas comparable
                      {" "}aux années consolidées en flux annuel.
                    </span>
                  </div>
                )}
                <BudgetTimeline
                  points={consolidated.map((y) => ({
                    year: y.year,
                    value: y.total / 1_000_000_000,
                    type: "execute" as const,
                  }))}
                  activeYear={activeForChart}
                />
                <ChartSource
                  source={t("fx.qr.s05.source.cite")}
                  dataHref="https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/"
                  methodAnchor="subventions"
                />
              </>
            );
          })()}
        </div>
      </section>

      <RelatedArticles posts={posts} placeholders={QR_PLACEHOLDERS} />

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#subventions" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b> : {t("fx.qr.footer.source")} <span className="sep">·</span> <b>{t("fx.footer.coverage_label")}</b> : {t("fx.qr.footer.coverage")}
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.qr.src.export.csv"), { year: d.year }),
                primary: true,
                href: citySlug === "paris"
                  ? `/data/subventions/beneficiaires_${d.year}.json`
                  : `/data/${citySlug}/subventions/beneficiaires_${d.year}.json`,
              },
              {
                label: t("fx.qr.src.export.json"),
                href: citySlug === "paris"
                  ? `/data/subventions/beneficiaires_${d.year}.json`
                  : `/data/${citySlug}/subventions/beneficiaires_${d.year}.json`,
              },
              ...(citySlug === "paris"
                ? [{ label: t("fx.qr.src.export.treemap"), href: `/data/subventions/treemap_${d.year}.json` }]
                : []),
              { label: t("fx.qr.src.export.method"), href: "/methode?tool=subventions#outils" },
            ]}
          />
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}