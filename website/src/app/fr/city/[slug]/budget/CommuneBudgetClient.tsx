"use client";

import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import DualFlowBars from "@/components/fusion/DualFlowBars";
import BudgetSankey from "@/components/fusion/BudgetSankey";
import { useT, useLocale } from "@/lib/localeContext";
import type { BudgetPageData } from "@/lib/fusion-data";

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
  /** OFGL financial-health strip (dette, capacité de désendettement, épargne). */
  health?: CommuneHealth | null;
  /** Set (from getCommuneCapabilities) when the commune has a marchés page. */
  marchesHref?: string;
  /** Set when the commune has an investissements page. */
  investissementsHref?: string;
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
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const euro = useEuro();

  // Capacité de désendettement — santé financière (OFGL). Bandes usuelles.
  const capBand = (y: number | null) =>
    y == null ? null : y < 8 ? "sain" : y <= 12 ? "vigilance" : "alerte";

  const central =
    data.sankeyNodes.find((n) => n.category === "central")?.name ?? `Budget ${commune.nom}`;

  const perHab = commune.pop > 0 ? data.depenses / commune.pop : 0;
  const nfHab = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
  });

  const leftRows = data.recettesBreakdown.map((r) => ({
    label: r.label,
    value: r.value,
    display: euro(r.value),
  }));
  const rightRows = data.topDepenses.map((d) => ({
    label: d.label,
    value: d.value,
    rouge: true,
    display: euro(d.value),
  }));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="budget"
            title={`${commune.nom} — ${t("fx.natbud.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${nfHab.format(commune.pop)} ${t("fx.natbud.hab")} · ${year}`}
          />

          <p className="fx-lede">{t("fx.natbud.lede")}</p>

          {/* Year picker */}
          {availableYears.length > 1 && (
            <nav className="fx-yearpicker" aria-label={t("fx.natbud.year_label")}>
              {availableYears.map((y) => (
                <Link
                  key={y}
                  href={`/fr/city/${commune.slug}/budget?year=${y}`}
                  className={y === year ? "is-active" : ""}
                  aria-current={y === year ? "page" : undefined}
                >
                  {y}
                </Link>
              ))}
            </nav>
          )}

          {/* KPI row */}
          <div className="fx-kpi-grid" style={{ marginTop: 28 }}>
            <div className="fx-kpi-card is-hero">
              <p className="fx-kpi-label">{t("fx.natbud.recettes")}</p>
              <p className="fx-kpi-value tnum">{euro(data.recettes)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natbud.depenses")}</p>
              <p className="fx-kpi-value tnum">{euro(data.depenses)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natbud.solde")}</p>
              <p className="fx-kpi-value tnum">{euro(data.solde, true)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natbud.depenses_hab")}</p>
              <p className="fx-kpi-value tnum">{nfHab.format(perHab)} €</p>
            </div>
          </div>

          {/* Santé financière (OFGL) — dette, capacité de désendettement, épargne */}
          {health && (
            <div className="fx-health">
              <span className="fx-health-title">{t("fx.natbud.health_title")}</span>
              {health.detteEurHab != null && (
                <span className="fx-health-item">
                  <b className="tnum">{nfHab.format(Math.round(health.detteEurHab))} €/hab</b>
                  {t("fx.natbud.health_dette")}
                </span>
              )}
              {health.capaciteDesend != null && (
                <span className={`fx-health-item fx-health-${capBand(health.capaciteDesend)}`}>
                  <b className="tnum">
                    {health.capaciteDesend.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })} {t("fx.natbud.years")}
                  </b>
                  {t("fx.natbud.health_capacite")} · {t(`fx.natbud.health_${capBand(health.capaciteDesend)}`)}
                </span>
              )}
              {health.epargneBrute != null && (
                <span className="fx-health-item">
                  <b className="tnum">{euro(health.epargneBrute)}</b>
                  {t("fx.natbud.health_epargne")}
                </span>
              )}
              <span className="fx-health-src">{t("fx.natbud.health_source")}</span>
            </div>
          )}

          {/* Cross-links to other national pages this commune has */}
          {(marchesHref || investissementsHref) && (
            <nav className="fx-natlinks">
              {investissementsHref && (
                <Link href={investissementsHref} className="fx-cta-link">
                  {t("fx.natinv.link")} →
                </Link>
              )}
              {marchesHref && (
                <Link href={marchesHref} className="fx-cta-link">
                  {t("fx.natmar.link")} →
                </Link>
              )}
            </nav>
          )}

          {/* Honest axis note: this is NATURE, not fonction */}
          <p className="fx-note">{t("fx.natbud.nature_note")}</p>

          {/* Dual flow bars — recettes / dépenses par nature */}
          <DualFlowBars
            left={{ title: t("fx.natbud.recettes_title"), rows: leftRows }}
            right={{ title: t("fx.natbud.depenses_title"), rows: rightRows }}
            center={{ label: t("fx.natbud.solde"), value: euro(data.solde, true) }}
          />

          {/* Sankey (reused fusion component, city-agnostic via `central`) */}
          {data.sankeyLinks.length > 0 && (
            <div className="fx-sankey-wrap">
              <BudgetSankey
                nodes={data.sankeyNodes}
                links={data.sankeyLinks}
                central={central}
                height={520}
              />
            </div>
          )}

          {/* Upgrade layer — budget par FONCTION. Renders IFF data-derived
              capability present. Absent today for national-only communes; flips
              on automatically when a fonction export exists (no code edit). */}
          {hasFonction ? (
            <section className="fx-section" aria-label={t("fx.natbud.fonction_title")}>
              <SectionHead kind="budget" title={t("fx.natbud.fonction_title")} />
              <p className="fx-note">{t("fx.natbud.fonction_present")}</p>
            </section>
          ) : (
            <p className="fx-note fx-note-muted">{t("fx.natbud.fonction_absent")}</p>
          )}

          <ChartSource
            source={`${t("fx.natbud.source")} · ${year}`}
            dataHref={sourceUrl}
            methodAnchor="c-villes"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
