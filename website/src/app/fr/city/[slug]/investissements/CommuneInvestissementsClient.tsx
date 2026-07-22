"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import DualFlowBars from "@/components/fusion/DualFlowBars";
import { useT, useLocale } from "@/lib/localeContext";
import type { InvestissementsData } from "@/lib/commune-investissements";

type CommuneMeta = { slug: string; nom: string; dep_name: string; reg_name: string; pop: number };

function useEuro() {
  const { locale } = useLocale();
  return (eur: number): string => {
    const nf = (o: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", o);
    const a = Math.abs(eur);
    if (a >= 1e9) return nf({ maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(eur / 1e9) + " Md€";
    if (a >= 1e6) return nf({ maximumFractionDigits: 1 }).format(eur / 1e6) + " M€";
    if (a >= 1e3) return nf({ maximumFractionDigits: 0 }).format(eur / 1e3) + " k€";
    return nf({ maximumFractionDigits: 0 }).format(eur) + " €";
  };
}

export default function CommuneInvestissementsClient({
  commune,
  data,
  sourceUrl,
}: {
  commune: CommuneMeta;
  data: InvestissementsData;
  sourceUrl: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const euro = useEuro();
  const nfInt = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR");

  const finRows = data.financement_par_groupe.map((g) => ({
    label: g.groupe,
    value: g.montant,
    display: euro(g.montant),
  }));
  const depRows = data.depenses_par_groupe.map((g) => ({
    label: g.groupe,
    value: g.montant,
    rouge: true,
    display: euro(g.montant),
  }));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="investissements"
            title={`${commune.nom} — ${t("fx.natinv.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${nfInt.format(commune.pop)} ${t("fx.natbud.hab")} · ${data.year}`}
          />
          <p className="fx-lede">{t("fx.natinv.lede")}</p>

          <div className="fx-kpi-grid" style={{ marginTop: 28 }}>
            <div className="fx-kpi-card is-hero">
              <p className="fx-kpi-label">{t("fx.natinv.depenses")}</p>
              <p className="fx-kpi-value tnum">{euro(data.total.depenses)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natinv.financement")}</p>
              <p className="fx-kpi-value tnum">{euro(data.total.recettes)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natbud.depenses_hab")}</p>
              <p className="fx-kpi-value tnum">
                {data.total.depenses_eur_hab != null ? nfInt.format(data.total.depenses_eur_hab) + " €" : "—"}
              </p>
            </div>
          </div>

          <p className="fx-note">{t("fx.natinv.note")}</p>

          <DualFlowBars
            left={{ title: t("fx.natinv.fin_title"), rows: finRows }}
            right={{ title: t("fx.natinv.dep_title"), rows: depRows }}
          />

          <ChartSource source={t("fx.natinv.source")} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
