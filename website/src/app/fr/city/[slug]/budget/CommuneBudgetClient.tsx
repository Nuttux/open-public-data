"use client";

import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import BudgetSankey from "@/components/fusion/BudgetSankey";
import { useT, useLocale } from "@/lib/localeContext";
import { fmtDec } from "@/lib/fmt";
import type { BudgetPageData } from "@/lib/fusion-data";
import RelatedLinks, { type RelatedBlock } from "@/components/fiche/RelatedLinks";

export type CommuneMeta = {
  slug: string;
  insee: string;
  nom: string;
  dep_name: string;
  reg_name: string;
  pop: number;
};

export type CommuneHealth = {
  /** Encours de dette €/hab (OFGL). */
  detteEurHab: number | null;
  epargneBrute: number | null;
  /** Capacité de désendettement, en années (dette / épargne brute). */
  capaciteDesend: number | null;
  year: number;
};

type Props = {
  commune: CommuneMeta;
  data: BudgetPageData;
  availableYears: number[];
  year: number;
  /** Upgrade layer present? (data-derived, from getCommuneCapabilities) */
  hasFonction: boolean;
  sourceUrl: string;
  /** « Voir aussi », calculé côté serveur (page.tsx). */
  related?: RelatedBlock | null;
  /** OFGL financial-health strip (dette, capacité de désendettement, épargne). */
  health?: CommuneHealth | null;
  /** Set (from getCommuneCapabilities) when the commune has a marchés page. */
  marchesHref?: string;
  /** Set when the commune has an investissements page. */
  investissementsHref?: string;
  /** Set when the commune has an évolution page. */
  evolutionHref?: string;
  /** Set when the commune has a comparaison-à-la-strate page (universal). */
  comparaisonHref?: string;
};

function useEuro() {
  const { locale } = useLocale();
  const nf = (opts: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", opts);
  return (eur: number, signed = false): string => {
    const abs = Math.abs(eur);
    const sign = signed ? { signDisplay: "exceptZero" as const } : {};
    if (abs >= 1e9)
      return nf({ maximumFractionDigits: 2, minimumFractionDigits: 2, ...sign }).format(eur / 1e9) + " Md€";
    if (abs >= 1e6)
      return nf({ maximumFractionDigits: 1, ...sign }).format(eur / 1e6) + " M€";
    return nf({ maximumFractionDigits: 0, ...sign }).format(eur) + " €";
  };
}

/**
 * Page budget d'une commune nationale (DGFiP, axe nature), v3 (2026-09-08) —
 * même squelette que la page budget de Paris : le chiffre de l'année avec ses
 * repères et sa tendance, la santé financière OFGL en une ligne, puis
 * « Dépenses et recettes » en deux colonnes avec la courbe et la part sur
 * chaque ligne. Les lignes n'ouvrent rien : il n'y a pas de fiche de poste
 * par nature. Le sankey reste, comme vue d'ensemble, sous les colonnes.
 */
export default function CommuneBudgetClient({
  commune,
  data,
  availableYears,
  year,
  hasFonction,
  sourceUrl,
  health,
  marchesHref,
  investissementsHref,
  evolutionHref,
  comparaisonHref,
  related,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const euro = useEuro();
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };

  const central =
    data.sankeyNodes.find((n) => n.category === "central")?.name ?? `Budget ${commune.nom}`;

  const perHab = commune.pop > 0 ? data.depenses / commune.pop : 0;
  const nfHab = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
  });
  const yearType = data.yearsSummary.find((y) => y.year === year)?.type ?? "execute";
  const isVoted = yearType === "vote";

  /* ── La tendance : toutes les années publiées ── */
  const years = data.yearsSummary;
  const maxDep = Math.max(...years.map((y) => y.depenses), 1);
  const first = years[0];
  const sinceFirst = first && first.year !== year && first.depenses > 0 ? ((data.depenses - first.depenses) / first.depenses) * 100 : null;
  const prevYear = years.filter((y) => y.year < year).sort((a, b) => b.year - a.year)[0];
  const deltaYear = prevYear && prevYear.depenses > 0 ? ((data.depenses - prevYear.depenses) / prevYear.depenses) * 100 : null;
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${fmtDec(Math.abs(x), 1)} %`;

  /* ── Les lignes : libellé, courbe, montant, part (pas de fiche par nature) ── */
  const Amt = ({ n }: { n: number }) => {
    const abs = Math.abs(n);
    const v = abs >= 1e9 ? (n / 1e9).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 }) : abs >= 1e6 ? (n / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: abs >= 1e8 ? 0 : 1 }) : nfHab.format(n / 1e3);
    const u = abs >= 1e9 ? t("fx.s.md_eur") : abs >= 1e6 ? t("fx.s.m_eur") : "k €";
    return <span className="fx-v3-amt tnum" style={{ fontSize: 14, textAlign: "right" }}>{v}<span className="u">{u}</span></span>;
  };
  const Spark = ({ label }: { label: string }) => {
    const pts = (data.series[label] ?? []).filter((p) => p.year <= year);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `${p.year} : ${euro(p.value)}`).join(" · ")}>
        {pts.map((p) => <i key={p.year} className={p.year === year ? "now" : p.type === "vote" ? "vote" : ""} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />)}
      </span>
    );
  };
  const Row = ({ label, value, total }: { label: string; value: number; total: number }) => (
    <div className="fx-bud-row fx-bud-row--static">
      <span className="n">{label.replace(/\s\((D|R)\)$/, "")}</span>
      <Spark label={label} />
      <Amt n={value} />
      <span className="p tnum">{Math.round((value / total) * 100)} %</span>
    </div>
  );
  const dep = data.topDepenses.filter((x) => x.value / data.depenses >= 0.005);
  const rec = data.recettesBreakdown.filter((x) => x.value / data.recettes >= 0.005);
  const hasSeries = Object.values(data.series).some((s) => s.length > 1);
  const sparkSpan = (() => { const ys = years.filter((y) => y.year <= year).map((y) => y.year); return ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : String(year); })();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-bud-v3" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="budget"
            title={`${commune.nom} — ${t("fx.natbud.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${nfHab.format(commune.pop)} ${t("fx.natbud.hab")}`}
          />

          {availableYears.length > 1 && (
            <nav className="fx-yearpicker" aria-label={t("fx.natbud.year_label")}>
              {availableYears.map((y) => (
                <Link key={y} href={`/fr/city/${commune.slug}/budget?year=${y}`} className={y === year ? "is-active" : ""} aria-current={y === year ? "page" : undefined}>{y}</Link>
              ))}
            </nav>
          )}

          <div className="fx-v3-herogrid">
            <div>
              <div className="fx-v3-hero-num tnum">{euro(data.depenses).replace(/\s?(Md€|M€|€)$/, "")}<span className="u">{euro(data.depenses).match(/(Md€|M€|€)$/)?.[0]}</span></div>
              <div className="fx-v3-hero-cap">{fill(isVoted ? "fx.bud.v3.cap_vote" : "fx.natbud.v3.cap_exec", { year })}</div>
              <div className="fx-v3-hero-meta">
                {perHab > 0 ? `${fill("fx.bud.v3.par_hab", { n: nfHab.format(perHab) })} · ` : ""}
                {fill("fx.bud.v3.recettes_exec", { rec: euro(data.recettes) })}
                {` · ${t("fx.natbud.solde").toLowerCase()} ${euro(data.solde, true)}`}
              </div>
              {health && (health.detteEurHab != null || health.capaciteDesend != null || health.epargneBrute != null) && (
                <div className="fx-v3-hero-meta">
                  {[
                    health.detteEurHab != null ? `${t("fx.natbud.health_dette")} ${nfHab.format(Math.round(health.detteEurHab))} €/hab` : null,
                    health.capaciteDesend != null ? `${t("fx.natbud.health_capacite")} ${health.capaciteDesend.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })} ${t("fx.natbud.years")}` : null,
                    health.epargneBrute != null ? `${t("fx.natbud.health_epargne")} ${euro(health.epargneBrute)}` : null,
                  ].filter(Boolean).join(" · ")}
                  {" · "}
                  <span className="fx-def" title={t("fx.natbud.ofgl_tip")} tabIndex={0}>{t("fx.natbud.health_source")}</span>
                </div>
              )}
            </div>
            {years.length > 1 && (
              <div className="fx-v3-trend">
                <div className="t">
                  {deltaYear != null && <b>{signed(deltaYear)} {fill("fx.bud.v3.vs", { y: prevYear.year })}</b>}
                  {sinceFirst != null && first.year !== prevYear?.year && <span> · {signed(sinceFirst)} {fill("fx.bud.v3.depuis", { y: first.year })}</span>}
                </div>
                <div className="bars" aria-hidden="true">
                  {years.map((y) => (
                    <div key={y.year} className={y.year === year ? "now" : y.type === "vote" ? "vote" : ""} title={`${y.year} · ${euro(y.depenses)}`}>
                      <b style={{ height: Math.max(3, Math.round((y.depenses / maxDep) * 50)) }} />
                      <span>{y.year}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(marchesHref || investissementsHref || evolutionHref || comparaisonHref) && (
            <nav className="fx-natlinks">
              {investissementsHref && <Link href={investissementsHref} className="fx-cta-link">{t("fx.natinv.link")} →</Link>}
              {marchesHref && <Link href={marchesHref} className="fx-cta-link">{t("fx.natmar.link")} →</Link>}
              {evolutionHref && <Link href={evolutionHref} className="fx-cta-link">{t("fx.natev.link")} →</Link>}
              {comparaisonHref && <Link href={comparaisonHref} className="fx-cta-link">{t("fx.natcmp.link")} →</Link>}
            </nav>
          )}

          <h2 className="fx-v3-h2" style={{ marginTop: 40 }}>{t("fx.bud.v3.h2")}</h2>
          <p className="fx-v3-h2sub">
            {t("fx.natbud.v3.h2sub")}
            {hasSeries ? ` ${fill("fx.natbud.v3.span", { span: sparkSpan })}` : ""}
          </p>

          <div className="fx-bud-cols">
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_dep")}</span><span className="tnum">{euro(data.depenses)}</span></h3>
              {dep.map((x) => <Row key={x.label} label={x.label} value={x.value} total={data.depenses} />)}
            </div>
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_rec")}</span><span className="tnum">{euro(data.recettes)}</span></h3>
              {rec.map((x) => <Row key={x.label} label={x.label} value={x.value} total={data.recettes} />)}
            </div>
          </div>

          {hasFonction ? (
            <section className="fx-section" aria-label={t("fx.natbud.fonction_title")}>
              <SectionHead kind="budget" title={t("fx.natbud.fonction_title")} />
              <p className="fx-note">{t("fx.natbud.fonction_present")}</p>
            </section>
          ) : (
            <p className="fx-v3-foot">{t("fx.natbud.fonction_absent")}</p>
          )}

          {data.sankeyLinks.length > 0 && (
            <div className="fx-sankey-wrap" style={{ marginTop: 36 }}>
              <BudgetSankey nodes={data.sankeyNodes} links={data.sankeyLinks} central={central} height={520} />
            </div>
          )}

          <RelatedLinks block={related} />

          <ChartSource source={`${t("fx.natbud.source")} · ${year}`} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
