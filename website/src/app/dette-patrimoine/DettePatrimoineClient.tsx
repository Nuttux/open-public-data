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
import Tip from "@/components/fusion/Tip";
import PullQuote from "@/components/fusion/PullQuote";
import BilanBoard from "@/components/fusion/BilanBoard";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import DetteStructurePanel from "@/components/fusion/DetteStructurePanel";
import PageTOC from "@/components/fusion/PageTOC";
import PatrimoineDrillList from "@/components/fusion/PatrimoineDrillList";
import CityComparator from "@/components/fusion/CityComparator";
import HorsBilanMap from "@/components/fusion/HorsBilanMap";
import ChartSource from "@/components/fusion/ChartSource";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import { slugifyBailleur } from "@/lib/projet-utils";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { PatrimoineData, PatrimoineStructure, HorsBilanData, CityDebtSnapshot } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION, parisCrcDebtYearsFor } from "@/lib/methodology";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function DettePatrimoineClient({
  d,
  structure,
  horsBilan,
  horsBilanTrajectory,
  citiesSnapshot,
  posts,
}: {
  d: PatrimoineData;
  structure: PatrimoineStructure | null;
  horsBilan: HorsBilanData | null;
  horsBilanTrajectory: Array<{ year: number; capital_restant: number }>;
  citiesSnapshot: CityDebtSnapshot[];
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const DET_PLACEHOLDERS: ArticlePlaceholder[] = [
    {
      category: t("fx.dp.placeholders.a1.cat"),
      title: t("fx.dp.placeholders.a1.title"),
      description: t("fx.dp.placeholders.a1.desc"),
    },
    {
      category: t("fx.dp.placeholders.a2.cat"),
      title: t("fx.dp.placeholders.a2.title"),
      description: t("fx.dp.placeholders.a2.desc"),
    },
  ];
  const net = d.fondsPropres;
  const detteParHab = d.detteFinanciere / PARIS_POPULATION;

  // Évolution de la dette depuis 2020 pour le hook viral (fallback 0 si
  // l'année de référence n'est pas dans la série).
  const dette2020 = d.yearsSummary.find((y) => y.year === 2020)?.dette ?? 0;
  const deltaDetteDepuis2020Pct = dette2020 > 0
    ? ((d.detteFinanciere - dette2020) / dette2020) * 100
    : 0;

  // Chiffre CRC pour le hook "deux lectures" (méthodologie Ville vs CRC).
  const crcSnap = parisCrcDebtYearsFor(d.year);

  // Unité auto Md € / M € pour les montants hors bilan
  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtAmount = (v: number): { value: string; unit: string } =>
    v >= 1e9
      ? { value: fmtBillions(v), unit: mdLabel }
      : { value: fmtMillions(v, 0), unit: mLabel };

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.det.toc.overview") },
          { id: "sec-bilan", label: t("fx.det.toc.bilan") },
          { id: "sec-actifs", label: t("fx.det.toc.actifs") },
          { id: "sec-dette", label: t("fx.det.toc.dette") },
          { id: "sec-trajectoire", label: t("fx.det.toc.trajectoire") },
          { id: "sec-hors-bilan", label: t("fx.det.toc.hors_bilan") },
          { id: "sec-regles", label: t("fx.det.toc.regles") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
          { id: "sec-sources", label: t("fx.det.toc.sources") },
        ]}
      />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.det.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.det.title.before")}
            <em>{t("fx.det.title.em")}</em>
            {t("fx.det.title.mid")}
            <br />
            {t("fx.det.title.b")}
            <b>{t("fx.det.title.b_b")}</b>
            {t("fx.det.title.b_after")}
          </h1>
          <p className="fx-page-lede">
            <Tip label={t("fx.det.lede.bilan.tip")}>{t("fx.det.lede.bilan")}</Tip>
            {fill(t("fx.det.lede.consolid"), { year: d.year })}
            <Tip label={t("fx.det.lede.actif.tip")}>{t("fx.det.lede.actif")}</Tip>
            {t("fx.det.lede.c1")}
            <Tip label={t("fx.det.lede.passif.tip")}>{t("fx.det.lede.passif")}</Tip>
            {t("fx.det.lede.c2")}
            {t("fx.det.lede.dette")}
            {t("fx.det.lede.c3")}
            {t("fx.det.lede.regleor")}
            {t("fx.det.lede.post")}
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/dette-patrimoine"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <PageHook
        cite={
          <>
            {fill(t("fx.dp.hook.cite.bilan"), { year: d.year })}
            {crcSnap ? (
              <>
                {" · "}{t("fx.dp.hook.cite.crc")}
              </>
            ) : null}
          </>
        }
        shareText={
          fill(t("fx.dp.hook.share.head"), {
            year: d.year,
            total: fmtBillions(d.detteFinanciere),
            perHab: fmtInt(detteParHab),
          }) +
          (deltaDetteDepuis2020Pct > 0
            ? fill(t("fx.dp.hook.share.delta"), { pct: fmtDec(deltaDetteDepuis2020Pct, 0) })
            : "") +
          fill(t("fx.dp.hook.share.cap.ville"), { ans: fmtDec(d.capaciteDesendettement, 1).replace(".", ",") }) +
          (crcSnap
            ? fill(t("fx.dp.hook.share.cap.crc"), { ans: fmtDec(crcSnap.value_crc_ans, 1).replace(".", ",") })
            : "") +
          t("fx.dp.hook.share.tail")
        }
      >
        {fill(t("fx.dp.hook.body.intro"), { year: d.year })}
        <b>{fmtBillions(d.detteFinanciere)}{t("fx.dp.hook.body.md")}</b>
        {t("fx.dp.hook.body.dette")}
        <b>{fmtInt(detteParHab)}{t("fx.dp.hook.body.perhab")}</b>
        {deltaDetteDepuis2020Pct > 0 ? (
          <>{t("fx.dp.hook.body.delta.before")}<b>+{fmtDec(deltaDetteDepuis2020Pct, 0)}{t("fx.dp.hook.body.delta.after")}</b></>
        ) : null}
        {t("fx.dp.hook.body.cap.before")}
        <b>{fmtDec(d.capaciteDesendettement, 1).replace(".", ",")}{t("fx.dp.hook.body.cap.ans")}</b>
        {t("fx.dp.hook.body.cap.ville")}
        {crcSnap ? (
          <>
            {t("fx.dp.hook.body.cap.crc.before")}
            <b>{fmtDec(crcSnap.value_crc_ans, 1).replace(".", ",")}{t("fx.dp.hook.body.cap.ans")}</b>
            {t("fx.dp.hook.body.cap.crc.after")}
          </>
        ) : null}
        .
      </PageHook>

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.det.s02.kind")}
            title={
              <>
                {t("fx.det.s02.title.before")}
                <em>{t("fx.det.s02.title.em")}</em>
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.det.s02.hero_label"), { year: d.year })}
              value={fmtBillions(net)}
              unit={t("fx.s.md_eur")}
              caption={
                <>
                  {t("fx.det.s02.hero_cap.per_hab").replace("{n}", fmtInt(net / PARIS_POPULATION))}
                </>
              }
            />
            <KPIGrid
              cols={3}
              items={[
                {
                  label: <Tip label={t("fx.det.s02.kpi.per_hab.tip")}>{t("fx.det.s02.kpi.per_hab")}</Tip>,
                  value: fmtInt(detteParHab),
                  unit: "€",
                  delta: t("fx.det.s02.kpi.per_hab_delta"),
                },
                {
                  label: <Tip label={t("fx.det.s02.kpi.dette_fin.tip")}>{t("fx.det.s02.kpi.dette_fin")}</Tip>,
                  value: fmtBillions(d.detteFinanciere),
                  unit: t("fx.s.md_eur"),
                  delta: fill(t("fx.det.s02.kpi.dette_fin_delta"), { n: fmtInt(detteParHab) }),
                },
                {
                  label: <Tip label={t("fx.det.s02.kpi.cap_desen.tip")}>{t("fx.det.s02.kpi.cap_desen")}</Tip>,
                  value: fmtDec(d.capaciteDesendettement, 1),
                  unit: t("fx.det.s02.kpi.ans"),
                  delta: t("fx.det.s02.kpi.cap_desen_delta"),
                },
              ]}
            />
          </div>

          {citiesSnapshot.length > 0 && (
            <>
              <CityComparator cities={citiesSnapshot} highlightSlug="paris" />
              <ChartSource
                source={<>{t("fx.dp.cities.source")}</>}
                methodAnchor="dette-patrimoine"
              />
            </>
          )}
        </div>
      </section>

      <section className="fx-section" id="sec-bilan">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={<Tip label={t("fx.det.s03.kind.tip")}>{t("fx.det.s03.kind")}</Tip>}
            title={
              <>
                <em>{t("fx.det.s03.title.em_a")}</em>
                {t("fx.det.s03.title.and")}
                <b>{t("fx.det.s03.title.b_b")}</b>
              </>
            }
            subtitle={t("fx.det.s03.sub")}
          />
          {structure ? (
            <BilanBoard
              year={d.year}
              actif={structure.masses_actif}
              passif={structure.masses_passif}
              totals={{ actif: d.actif, passif: d.passif }}
            />
          ) : (
            <p className="fx-note">{fill(t("fx.dp.bilan.actif_unavailable"), { label: t("fx.det.s03.actif") })}</p>
          )}
          <ChartSource
            source={<>{fill(t("fx.dp.bilan.source"), { year: d.year })}</>}
            dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
            methodAnchor="dette-patrimoine"
          />
        </div>
      </section>

      <section className="fx-section fx-section-annexe" id="sec-actifs">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={<Tip label={t("fx.det.s04b.kind.tip")}>{t("fx.det.s04b.kind")}</Tip>}
            title={
              <>
                {t("fx.det.s04b.title.before")}
                <em>{t("fx.det.s04b.title.em")}</em>
              </>
            }
            subtitle={t("fx.det.s04b.sub")}
          />
          {structure && structure.masses_actif.length > 0 ? (
            <PatrimoineDrillList masses={structure.masses_actif} year={d.year} />
          ) : (
            <p className="fx-note">{t("fx.dp.unavailable")}</p>
          )}
          <p className="fx-note">{t("fx.det.s04b.note")}</p>
        </div>
      </section>

      <section className="fx-section fx-section-annexe" id="sec-dette">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={<Tip label={t("fx.det.s04.kind.tip")}>{t("fx.det.s04.kind")}</Tip>}
            title={
              <>
                {t("fx.det.s04.title.before")}
                <em>{t("fx.det.s04.title.em")}</em>
                {t("fx.det.s04.title.after")}
              </>
            }
            subtitle={t("fx.det.s04.sub")}
          />
          {structure ? (
            <DetteStructurePanel structure={structure.structure_dette} year={d.year} />
          ) : (
            <p className="fx-note">{t("fx.dp.unavailable")}</p>
          )}
          <ChartSource
            source={<>{fill(t("fx.dp.dette.source"), { year: d.year })}</>}
            dataHref="https://opendata.paris.fr/explore/dataset/bilan-comptable/"
            methodAnchor="dette-patrimoine"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-trajectoire">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.det.s04d.kind")}
            title={
              <>
                {t("fx.det.s04d.title.before")}
                <em>{fill(t("fx.det.s04d.title.em"), { year: d.year })}</em>
                {t("fx.det.s04d.title.after")}
              </>
            }
            subtitle={t("fx.det.s04d.sub")}
          />
          {d.yearsSummary.length >= 2 && (() => {
            const first = d.yearsSummary[0];
            const last = d.yearsSummary[d.yearsSummary.length - 1];
            const ratio = (last.dette / last.actif) * 100;
            const ratio0 = (first.dette / first.actif) * 100;
            return (
              <>
                <BudgetTimeline
                  points={d.yearsSummary.map((y) => ({
                    year: y.year,
                    value: y.dette / 1_000_000_000,
                    type: "execute" as const,
                  }))}
                  activeYear={d.year}
                  annotations={[
                    { year: 2020, label: t("fx.dp.timeline.covid") },
                    { year: 2024, label: t("fx.dp.timeline.jo") },
                  ]}
                />
                <ChartSource
                  source={<>{t("fx.dp.traj.source")}</>}
                  dataHref="https://opendata.paris.fr/explore/dataset/bilan-comptable/"
                  methodAnchor="dette-patrimoine"
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 1,
                    background: "var(--ink)",
                    border: "1px solid var(--ink)",
                    marginTop: 28,
                  }}
                >
                  {([
                    { k: "actif", val: last.actif, val0: first.actif, labelKey: "fx.det.s04d.legend.actif" },
                    { k: "fp", val: last.fondsPropres, val0: first.fondsPropres, labelKey: "fx.det.s04d.legend.fp" },
                    { k: "dette", val: last.dette, val0: first.dette, labelKey: "fx.det.s04d.legend.dette" },
                  ] as const).map((r) => {
                    const delta = ((r.val - r.val0) / r.val0) * 100;
                    return (
                      <div key={r.k} style={{ background: "var(--bg)", padding: "18px 20px" }}>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                          {t(r.labelKey)}
                        </div>
                        <div className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1 }}>
                          {fmtBillions(r.val)}
                          <span style={{ fontSize: ".5em", color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>{t("fx.s.md_eur")}</span>
                        </div>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-2)", marginTop: 8, letterSpacing: ".02em" }}>
                          {delta >= 0 ? "+" : "−"} {fmtDec(Math.abs(delta), 0)} {fill(t("fx.dp.traj.delta_vs"), { year: first.year })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="fx-note" style={{ marginTop: 18 }}>
                  {fill(t("fx.det.s04d.note"), { ratio: fmtDec(ratio, 0), year: d.year, ratio0: fmtDec(ratio0, 0), y0: first.year })}
                </p>
              </>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="sec-hors-bilan">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("fx.det.s04c.kind")}
            title={
              <>
                {t("fx.det.s04c.title.before")}
                <em><Tip label={t("fx.det.s04c.horsbilan.tip")}>{t("fx.det.s04c.title.em")}</Tip></em>
              </>
            }
            subtitle={t("fx.det.s04c.sub")}
          />

          {horsBilan ? (
            <>
              <p className="fx-hb-lead muted">
                {fill(t("fx.det.s04c.hero_cap"), {
                  count: horsBilan.totals.count_emprunts.toLocaleString("fr-FR"),
                  benef: horsBilan.totals.count_beneficiaires,
                })}
              </p>
              <KPIGrid
                cols={4}
                items={[
                  {
                    label: <Tip label={t("fx.det.s04c.hero.tip")}>{fill(t("fx.det.s04c.hero_label"), { year: horsBilan.year })}</Tip>,
                    value: fmtBillions(horsBilan.totals.capital_restant),
                    unit: t("fx.s.md_eur"),
                    delta: t("fx.det.s04c.kpi.capital_delta"),
                  },
                  {
                    label: <Tip label={t("fx.det.s04c.kpi.annuite.tip")}>{t("fx.det.s04c.kpi.annuite")}</Tip>,
                    value: fmtMillions(horsBilan.totals.annuite_totale, 0),
                    unit: t("fx.s.m_eur"),
                    delta: t("fx.det.s04c.kpi.annuite_delta"),
                  },
                  {
                    label: t("fx.det.s04c.kpi.taux"),
                    value: fmtDec(horsBilan.taux.taux_moyen_pondere_pct, 2),
                    unit: "%",
                    delta: t("fx.det.s04c.kpi.taux_delta"),
                  },
                  {
                    label: t("fx.det.s04c.kpi.duree"),
                    value: fmtDec(horsBilan.taux.duree_residuelle_moyenne_ans, 1),
                    unit: t("fx.det.s02.kpi.ans"),
                    delta: t("fx.det.s04c.kpi.duree_delta"),
                  },
                ]}
              />

              <h4 className="fx-h4">{t("fx.det.s04c.benef_title")}</h4>
              <p className="fx-bc-hint" style={{ marginTop: -6 }}>{t("fx.det.s04c.click_hint")}</p>
              <div className="fx-hb-list">
                {horsBilan.top_beneficiaires.slice(0, 10).map((b) => {
                  const f = fmtAmount(b.capital_restant);
                  const slug = slugifyBailleur(b.name);
                  return (
                    <Link
                      key={b.key}
                      href={`/dette-patrimoine/bailleur/${encodeURIComponent(slug)}`}
                      scroll={false}
                      className="fx-hb-row clickable"
                      aria-label={b.name}
                    >
                      <span className="fx-hb-l">{b.name}</span>
                      <span className="fx-hb-bar" aria-hidden>
                        <span className="fill" style={{ width: `${Math.max(2, b.share * 100)}%` }} />
                      </span>
                      <span className="fx-hb-v tnum">
                        {f.value}
                        <span className="u"> {f.unit}</span>
                      </span>
                      <span className="fx-hb-meta muted">
                        {fill(t("fx.det.s04c.benef_meta"), {
                          pct: fmtDec(b.share * 100, 1),
                          n: b.count_emprunts,
                        })}
                        <span className="fx-hb-arrow" aria-hidden>→</span>
                      </span>
                    </Link>
                  );
                })}
                {horsBilan.autres_beneficiaires.count > 0 && (() => {
                  const f = fmtAmount(horsBilan.autres_beneficiaires.capital_restant);
                  return (
                    <div className="fx-hb-row tiny">
                      <span className="fx-hb-l muted">
                        {fill(t("fx.det.s04c.benef_autres"), {
                          n: horsBilan.autres_beneficiaires.count,
                        })}
                      </span>
                      <span className="fx-hb-bar" aria-hidden>
                        <span className="fill light" style={{ width: `${Math.max(2, horsBilan.autres_beneficiaires.share * 100)}%` }} />
                      </span>
                      <span className="fx-hb-v tnum muted">
                        {f.value}
                        <span className="u"> {f.unit}</span>
                      </span>
                      <span className="fx-hb-meta muted">
                        {fill(t("fx.det.s04c.benef_meta"), {
                          pct: fmtDec(horsBilan.autres_beneficiaires.share * 100, 1),
                          n: horsBilan.autres_beneficiaires.count_emprunts,
                        })}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <HorsBilanMap
                byArrondissement={horsBilan.by_arrondissement}
                nonLocalised={horsBilan.non_localised}
                totalCapital={horsBilan.totals.capital_restant}
                year={horsBilan.year}
              />
              <ChartSource
                source={<>{fill(t("fx.dp.hb.source"), { year: horsBilan.year })}</>}
                methodAnchor="dette-patrimoine"
              />

              <p className="fx-hb-preteur">
                {fill(t("fx.det.s04c.preteur_lead"), {
                  top: horsBilan.top_preteurs[0]?.name ?? "—",
                  pct: fmtDec((horsBilan.top_preteurs[0]?.share ?? 0) * 100, 0),
                })}
              </p>

              {horsBilanTrajectory.length >= 2 && (() => {
                const first = horsBilanTrajectory[0];
                const last = horsBilanTrajectory[horsBilanTrajectory.length - 1];
                const growth = (last.capital_restant / first.capital_restant - 1) * 100;
                return (
                  <p className="fx-hb-traj muted tnum">
                    {fill(t("fx.det.s04c.traj"), {
                      y0: first.year,
                      v0: fmtBillions(first.capital_restant),
                      y1: last.year,
                      v1: fmtBillions(last.capital_restant),
                      growth: growth >= 0 ? `+${fmtDec(growth, 0)}` : fmtDec(growth, 0),
                    })}
                  </p>
                );
              })()}

              <p className="fx-note">{trLabel(horsBilan.sources.note, locale)}</p>
            </>
          ) : (
            <p className="fx-note">{t("fx.det.s04c.note")}</p>
          )}
        </div>
      </section>

      <section className="fx-section" id="sec-regles">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={t("fx.det.s01.kind")}
            title={
              <>
                {t("fx.det.s01.title.before")}
                <em>{t("fx.det.s01.title.em")}</em>
              </>
            }
            subtitle={t("fx.det.s01.sub")}
          />
          <details className="fx-collapsible">
            <summary>{t("fx.det.s01.show_rules")}</summary>
            <div className="fx-sources fx-sources-2" style={{ marginTop: 18 }}>
              <div>
                <div className="n">{t("fx.det.s01.r1.n")}</div>
                <h3>{t("fx.det.s01.r1.h")}</h3>
                <p>{t("fx.det.s01.r1.p")}</p>
                <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
              </div>
              <div>
                <div className="n">{t("fx.det.s01.r2.n")}</div>
                <h3>{t("fx.det.s01.r2.h")}</h3>
                <p>{t("fx.det.s01.r2.p")}</p>
                <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
              </div>
              <div>
                <div className="n">{t("fx.det.s01.r3.n")}</div>
                <h3>{t("fx.det.s01.r3.h")}</h3>
                <p>{t("fx.det.s01.r3.p")}</p>
                <span className="fx-rule-ref">Article L.1612-4 CGCT · circulaire DGCL</span>
              </div>
              <div>
                <div className="n">{t("fx.det.s01.r4.n")}</div>
                <h3>{t("fx.det.s01.r4.h")}</h3>
                <p>{t("fx.det.s01.r4.p")}</p>
                <span className="fx-rule-ref">Loi de programmation des finances publiques 2023-2027</span>
              </div>
            </div>
          </details>

          <PullQuote cite={t("fx.det.s01.note.cite")}>
            {t("fx.det.s01.note.before")}
            <b>{t("fx.det.s01.note.em")}</b>
            {t("fx.det.s01.note.after")}
          </PullQuote>
        </div>
      </section>

      <RelatedArticles number="10" posts={posts} placeholders={DET_PLACEHOLDERS} />

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead number="11" kind={t("fx.det.s07.kind")} />
          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number={t("fx.det.s07.t1.n")}
              kind={t("fx.det.s07.t1.kind")}
              title={t("fx.det.s07.t1.title")}
              description={t("fx.det.s07.t1.desc")}
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
              kpiDelta={t("fx.det.s07.t1.delta")}
            />
            <TileCard
              href="/investissements"
              number={t("fx.det.s07.t2.n")}
              kind={t("fx.det.s07.t2.kind")}
              title={t("fx.det.s07.t2.title")}
              description={t("fx.det.s07.t2.desc")}
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
              kpi="2,1"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta="2024"
            />
            <TileCard
              href="/logement-social"
              number={t("fx.det.s07.t3.n")}
              kind={t("fx.det.s07.t3.kind")}
              title={t("fx.det.s07.t3.title")}
              description={t("fx.det.s07.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" fill="#0a0a0a" />
                </svg>
              }
              kpi="258"
              kpiUnit="k logements"
              kpiDelta={t("fx.det.s07.t3.delta")}
            />
          </div>
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#dette-patrimoine" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b> : {t("fx.dp.footer.source")} <span className="sep">·</span> <b>{t("fx.footer.coverage_label")}</b> : {t("fx.dp.footer.coverage")}
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.det.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/bilan_sankey_${d.year}.json`,
              },
              { label: t("fx.det.src.export.json"), href: `/data/bilan_sankey_${d.year}.json` },
              { label: t("fx.det.src.export.index"), href: "/data/bilan_index.json" },
              { label: t("fx.det.src.export.method"), href: "/methode?tool=dette-patrimoine#outils" },
            ]}
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}
