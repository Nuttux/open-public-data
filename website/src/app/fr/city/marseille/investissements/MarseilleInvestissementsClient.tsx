"use client";
// Marseille-specific investissements client (POC v1).
//
// Why a dedicated client (not just a city-aware fork of InvestissementsClient
// Paris)? Pragmatic reasons:
//   - The Paris client is densely worded around « Paris »: hero ("Les
//     chantiers de Paris"), hooks ("En 2024, Paris a investi…"), per-page
//     editorial copy. Per playbook P3.3, ~5 editorial keys must be forked
//     per city — easier to do here in a small component than thread
//     conditional copy through 480 lines of Paris client.
//   - The Paris client renders the Paris SVG choropleth + ProjectMap which
//     have no Marseille equivalent (P0.4 ranked us at arrondissement level
//     only; lat/lon out of scope for the POC). P3.2 option a stricte:
//     section degrades to a ranking list.
//   - Drill-down routes (chapitre, projet, arrondissement) aren't created
//     yet for Marseille — links would 404. The Marseille client renders
//     non-clickable cards for now.
//
// Same look-and-feel as Paris (same SectionHead/KPIGrid/StackedBarTheme/
// BudgetTimeline/etc.) so the user immediately recognises the page.
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import PageTOC from "@/components/fusion/PageTOC";
import PageHook from "@/components/fusion/PageHook";
import DistrictChoropleth from "@/components/fusion/DistrictChoropleth";
import {
  MARSEILLE_ARRONDISSEMENT_PATHS,
  MARSEILLE_VIEWBOX,
} from "@/components/fusion/marseille-arrondissements";

// Flatten the grouped Marseille geometry into the (paths, regionByIndex) shape
// DistrictChoropleth expects — one path per index, mapped to its arrondissement.
const MARSEILLE_PATHS = MARSEILLE_ARRONDISSEMENT_PATHS.flatMap((a) => a.paths);
const MARSEILLE_REGION_BY_INDEX = MARSEILLE_ARRONDISSEMENT_PATHS.flatMap((a) =>
  a.paths.map(() => a.arr),
);
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { InvestissementsData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { cityPopulation } from "@/lib/methodology";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const CITY_BASE = "/fr/city/marseille/investissements";

export default function MarseilleInvestissementsClient({
  d,
}: {
  d: InvestissementsData;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ytrend = d.yearsSummary;
  const delta5y =
    ytrend.length >= 2
      ? ((ytrend[ytrend.length - 1].total - ytrend[0].total) / ytrend[0].total) * 100
      : 0;
  const delta5yDir: "up" | "down" | "flat" = delta5y > 0.1 ? "up" : delta5y < -0.1 ? "down" : "flat";

  const arrSuf = (n: number) => (n === 1 ? t("fx.s.arr.1_suffix") : t("fx.s.arr.suffix"));
  const parHab = d.total / cityPopulation("marseille");

  const heroTitleParis = locale === "en" ? "Marseille" : "Marseille";
  const districtWord = locale === "en" ? "district" : "arrondissement";
  const projectsWord = locale === "en" ? "projects" : "projets";
  const projectWord = locale === "en" ? "project" : "projet";

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-chapitre", label: t("fx.toc.chapitres") },
          { id: "sec-territoire", label: t("fx.toc.arrondissements") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-projets", label: t("fx.toc.projets") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.inv.kicker")}</div>
          <h1 className="fx-page-title">
            {locale === "en" ? "The " : "Les "}
            <em>{locale === "en" ? "construction sites" : "chantiers"}</em>
            {locale === "en" ? ` of ${heroTitleParis}` : ` de ${heroTitleParis}`}
          </h1>
          <p className="fx-page-lede">
            {locale === "en"
              ? `${fmtInt(d.nbProjets)} investment operations recorded in ${d.year}, classified by theme and ${districtWord}. Extracted from the Ville de Marseille administrative account presentation reports (PDF).`
              : `${fmtInt(d.nbProjets)} opérations d'investissement recensées en ${d.year}, classées par thématique et ${districtWord}. Extraites des rapports de présentation des comptes administratifs (PDF) de la Ville de Marseille.`}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath={CITY_BASE}
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      {(() => {
        const topChap = d.byChapitre[0];
        const topAmt = topChap ? fmtMillions(topChap.amount, 0) : "";
        const topLabel = topChap ? topChap.label : "";
        const cite = locale === "en"
          ? `Marseille investment narrative — Compte Administratif ${d.year}`
          : `Récit investissement Marseille — Compte Administratif ${d.year}`;
        const shareText = locale === "en"
          ? `In ${d.year}, Marseille invested ${fmtMillions(d.total, 0)} M€ across ${fmtInt(d.nbProjets)} projects — that's ${fmtInt(parHab)} € per resident${topChap ? `. Top theme: ${topLabel} (${topAmt} M€)` : ""}.`
          : `En ${d.year}, Marseille a investi ${fmtMillions(d.total, 0)} M€ sur ${fmtInt(d.nbProjets)} projets — soit ${fmtInt(parHab)} € par Marseillais${topChap ? `. Premier poste : ${topLabel} (${topAmt} M€)` : ""}.`;
        return (
          <PageHook cite={cite} shareText={shareText}>
            <span>
              {locale === "en"
                ? `In ${d.year}, Marseille invested `
                : `En ${d.year}, Marseille a investi `}
              <b>{fmtMillions(d.total, 0)} M€</b>
              {locale === "en" ? ` across ` : ` sur `}
              <b>{fmtInt(d.nbProjets)} {projectsWord}</b>
              {" — "}
              {locale === "en" ? "that's " : "soit "}
              <b>{fmtInt(parHab)} € {locale === "en" ? "per resident" : "par Marseillais"}</b>
              {locale === "en" ? " for the year." : " sur l'année."}
            </span>
            {topChap ? (
              <span>
                {locale === "en" ? " The top theme, " : " Le premier poste, "}
                <b>{topLabel}</b>
                {locale === "en" ? `, accounts for ` : `, pèse à lui seul `}
                <b>{topAmt} M€</b>.
              </span>
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
                {locale === "en" ? "What " : "Combien "}
                <em>{locale === "en" ? "the city builds" : "Marseille investit"}</em>
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.inv.s02.hero_label"), { year: d.year })}
              value={<AnimatedNumber value={d.total} format={(n) => fmtBillions(n)} />}
              unit={t("fx.s.md_eur")}
              delta={
                ytrend.length >= 2
                  ? {
                      direction: delta5yDir,
                      value: (
                        <AnimatedNumber
                          value={Math.abs(delta5y)}
                          format={(n) => `${fmtDec(n, 1)} %`}
                        />
                      ),
                      base: fill(t("fx.inv.s02.hero_base"), {
                        year: String(ytrend[0]?.year ?? ""),
                      }),
                    }
                  : undefined
              }
              caption={
                <>
                  {locale === "en"
                    ? "Total investment expenses for the year (POC: dette/non-dette split not yet wired)."
                    : "Total des dépenses d'investissement pour l'exercice (POC : la séparation dette/hors-dette n'est pas encore branchée)."}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: t("fx.inv.s02.kpi.projets"),
                  value: <AnimatedNumber value={d.nbProjets} format={(n) => fmtInt(n)} />,
                  delta: locale === "en"
                    ? `extracted by regex from the CA PDF`
                    : `extraits par regex du PDF CA`,
                },
                {
                  label: locale === "en" ? "Top theme" : "Premier poste",
                  value: d.byChapitre[0]?.label ?? "—",
                  delta: d.byChapitre[0] ? `${fmtMillions(d.byChapitre[0].amount)} M€` : "—",
                },
                {
                  label: locale === "en" ? "Top district" : "Premier arr.",
                  value: d.byArrondissement[0]
                    ? `${d.byArrondissement[0].arr}${arrSuf(d.byArrondissement[0].arr)}`
                    : "—",
                  delta: d.byArrondissement[0]
                    ? `${fmtMillions(d.byArrondissement[0].amount)} M€`
                    : "—",
                },
                {
                  label: locale === "en" ? "Per resident" : "Par Marseillais",
                  value: <AnimatedNumber value={parHab} format={(n) => fmtInt(n)} />,
                  delta: locale === "en" ? "€ / habitant (INSEE 2021)" : "€ / habitant (INSEE 2021)",
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
            kind={t("fx.inv.s04.kind")}
            title={
              <>
                {locale === "en" ? "Where the " : "Où vont "}
                <em>{locale === "en" ? "money goes" : "les crédits"}</em>
              </>
            }
            subtitle={
              locale === "en"
                ? "Distribution by Marseille thematic axes (Schools, Security, Environment, etc.)"
                : "Répartition par axes thématiques Marseille (Écoles, Sécurité, Environnement, etc.)"
            }
          />
          <StackedBarTheme
            items={d.byChapitre.map((c) => ({ theme: c.label, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={d.top10ProjetsPct}
            year={d.year}
            basePath={CITY_BASE}
            kicker={fill(t("fx.inv.s04.kicker"), { year: d.year })}
            entityNoun={t("fx.inv.s04.entity_noun")}
            paretoContrast={t("fx.inv.s04.pareto_contrast")}
          />
          <ChartSource
            source={
              locale === "en"
                ? `Source: Ville de Marseille — CA presentation report ${d.year}`
                : `Source : Ville de Marseille — Rapport de présentation CA ${d.year}`
            }
            methodAnchor="investissements"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-territoire">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.toc.arrondissements")}
            title={
              <>
                {locale === "en" ? "On the " : "Sur la "}
                <em>{locale === "en" ? "map" : "carte"}</em>
              </>
            }
            subtitle={
              locale === "en"
                ? `Localised projects per district (sized by amount). Cross-cutting amounts are excluded.`
                : `Projets localisés par arrondissement (taille = montant). Les montants transverses ne sont pas inclus.`
            }
          />
          {d.byArrondissement.length === 0 ? (
            <p className="fx-note">
              {locale === "en"
                ? "No district-level project found in the CA narrative for this year."
                : "Aucun projet rattaché à un arrondissement dans le récit du CA pour cet exercice."}
            </p>
          ) : (
            <>
              <DistrictChoropleth
                items={d.byArrondissement}
                paths={MARSEILLE_PATHS}
                regionByIndex={MARSEILLE_REGION_BY_INDEX}
                viewBox={MARSEILLE_VIEWBOX}
                showRanking={false}
              />
              <ol
                className="fx-arr-ranking"
                aria-label={t("fx.toc.arrondissements")}
                style={{ marginTop: 24 }}
              >
                {d.byArrondissement.map((a, i) => (
                  <li key={a.arr} className="fx-arr-ranking-item">
                    <span className="fx-arr-ranking-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="fx-arr-ranking-label">
                      {a.arr}
                      {arrSuf(a.arr)} {districtWord}
                    </span>
                    <span className="fx-arr-ranking-amount">
                      {a.amount >= 1e6
                        ? `${fmtMillions(a.amount, 1)} M€`
                        : `${fmtInt(a.amount / 1000)} k€`}
                    </span>
                    <span className="fx-arr-ranking-count">
                      {fmtInt(a.count)} {a.count === 1 ? projectWord : projectsWord}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <ChartSource
            source={
              locale === "en"
                ? `Source: Ville de Marseille — CA presentation report ${d.year}`
                : `Source : Ville de Marseille — Rapport de présentation CA ${d.year}`
            }
            methodAnchor="investissements"
          />
        </div>
      </section>

      {ytrend.length >= 2 ? (
        <section className="fx-section" id="sec-evolution">
          <div className="fx-wrap">
            <SectionHead
              number="04"
              kind={t("fx.inv.s06.kind")}
              title={
                <>
                  {locale === "en" ? "Trajectory " : "Trajectoire "}
                  <em>
                    {ytrend[0].year}–{ytrend[ytrend.length - 1].year}
                  </em>
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
              source={
                locale === "en"
                  ? "Source: Ville de Marseille — CA presentation reports (PDF)"
                  : "Source : Ville de Marseille — Rapports de présentation des CA (PDF)"
              }
              methodAnchor="investissements"
            />
            <p className="fx-note">
              {locale === "en"
                ? "POC: only the years with parsed PDFs are shown. Earlier years use a different document layout and are not yet supported."
                : "POC : seuls les exercices dont le PDF a été parsé sont affichés. Les exercices antérieurs utilisent un autre gabarit et ne sont pas encore supportés."}
            </p>
          </div>
        </section>
      ) : null}

      <section className="fx-section" id="sec-projets">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.toc.projets")}
            title={
              <>
                {locale === "en" ? "Top " : "Plus "}
                <em>{locale === "en" ? "projects" : "gros projets"}</em>
                {locale === "en" ? ` ${d.year}` : ` ${d.year}`}
              </>
            }
          />
          <div className="fx-projet-grid">
            {d.topProjets.slice(0, 12).map((p, i) => {
              const photoUrl = (p.photo as unknown as { photo?: { url?: string } | null })?.photo?.url;
              const photoCredit = (p.photo as unknown as { photo?: { credit?: string } | null })?.photo?.credit;
              return (
              <div key={p.id} className="fx-projet-card fx-projet-card--static" aria-label={p.name}>
                <div className="fx-projet-card-thumb">
                  {photoUrl ? (
                    <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderBottom: "1px solid rgba(10,10,10,0.08)", overflow: "hidden" }}>
                      <img
                        src={photoUrl}
                        alt={p.name}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                      {photoCredit && (
                        <span
                          style={{
                            position: "absolute",
                            right: 4,
                            bottom: 4,
                            background: "rgba(0,0,0,0.55)",
                            color: "#fafaf7",
                            fontFamily: "var(--f-mono)",
                            fontSize: 9,
                            padding: "1px 4px",
                            borderRadius: 2,
                          }}
                          aria-label={`Crédit : ${photoCredit}`}
                        >
                          © {photoCredit.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        background: "#faf9f5",
                        borderBottom: "1px solid rgba(10,10,10,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#a67638",
                        fontFamily: "var(--f-mono)",
                        fontSize: "11px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {p.chapitre}
                    </div>
                  )}
                </div>
                <div className="fx-projet-card-body">
                  <div className="fx-projet-card-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="fx-projet-card-name">{p.name.slice(0, 100)}</div>
                  <div className="fx-projet-card-meta">
                    <span>
                      {p.arr > 0
                        ? `${p.arr}${arrSuf(p.arr)} ${districtWord}`
                        : t("fx.s.transverse")}
                    </span>
                    <span className="fx-projet-card-amount">
                      {p.amount >= 1e6
                        ? `${fmtMillions(p.amount, 1)} M€`
                        : `${fmtInt(p.amount / 1000)} k€`}
                    </span>
                  </div>
                  <div className="fx-projet-card-chapitre">{p.chapitre}</div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead number="06" kind={t("fx.inv.s09.kind")} />
          <div className="fx-grid-tiles">
            <TileCard
              href="/fr/city/marseille/budget"
              number="01"
              kind={t("fx.toc.budget")}
              title={locale === "en" ? "Marseille budget" : "Budget de Marseille"}
              description={
                locale === "en"
                  ? "Revenue and expenses, by-nature breakdown, Sankey flow."
                  : "Recettes et dépenses, ventilation par nature, Sankey des flux."
              }
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="10" y="20" width="80" height="10" fill="#0a0a0a" />
                  <rect x="10" y="38" width="60" height="10" fill="#0a0a0a" />
                  <rect x="10" y="56" width="100" height="10" fill="#e11d1d" />
                  <rect x="10" y="74" width="40" height="10" fill="#0a0a0a" />
                </svg>
              }
              kpi="1,84"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={`CA ${d.year}`}
            />
            <TileCard
              href="/fr/city/marseille/marches"
              number="02"
              kind={t("fx.inv.s09.t1.kind")}
              title={
                locale === "en"
                  ? "Marseille public contracts"
                  : "Marchés publics de Marseille"
              }
              description={
                locale === "en"
                  ? "Contracts awarded by the Ville de Marseille (SCDL)."
                  : "Contrats attribués par la Ville de Marseille (SCDL)."
              }
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" fill="#0a0a0a" />
                </svg>
              }
              kpi="438"
              kpiUnit=""
              kpiDelta="2020"
            />
          </div>
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a
              href="/methode#investissements"
              className="fx-footer-sources-methode"
            >
              {t("fx.s.methode_complete")}
            </a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b>{" "}
            {locale === "en"
              ? ": Ville de Marseille — Compte Administratif presentation reports (PDF)"
              : ": Ville de Marseille — Rapports de présentation des Comptes Administratifs (PDF)"}{" "}
            <span className="sep">·</span>{" "}
            <b>{t("fx.footer.coverage_label")}</b>{" "}
            {locale === "en"
              ? `: ${d.availableYears.join(", ")} (POC v1)`
              : `: ${d.availableYears.join(", ")} (POC v1)`}
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.inv.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/marseille/investissements/investissements_${d.year}.json`,
              },
              {
                label: t("fx.inv.src.export.json"),
                href: `/data/marseille/investissements/investissements_${d.year}.json`,
              },
              {
                label: t("fx.inv.src.export.trend"),
                href: `/data/marseille/investissements/investissement_tendances.json`,
              },
              {
                label: t("fx.inv.src.export.method"),
                href: "/methode?tool=investissements#outils",
              },
            ]}
          />
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
