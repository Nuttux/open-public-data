"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import DualFlowBars from "@/components/fusion/DualFlowBars";
import { useT, useLocale } from "@/lib/localeContext";
import type { MarchesData } from "@/lib/commune-marches";

type CommuneMeta = { slug: string; nom: string; dep_name: string; reg_name: string; pop: number };

function useEuro() {
  const { locale } = useLocale();
  return (eur: number): string => {
    const nf = (o: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", o);
    const abs = Math.abs(eur);
    if (abs >= 1e9) return nf({ maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(eur / 1e9) + " Md€";
    if (abs >= 1e6) return nf({ maximumFractionDigits: 1 }).format(eur / 1e6) + " M€";
    if (abs >= 1e3) return nf({ maximumFractionDigits: 0 }).format(eur / 1e3) + " k€";
    return nf({ maximumFractionDigits: 0 }).format(eur) + " €";
  };
}

export default function CommuneMarchesClient({
  commune,
  data,
  sourceUrl,
}: {
  commune: CommuneMeta;
  data: MarchesData;
  sourceUrl: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const euro = useEuro();
  const nfInt = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR");

  const catRows = data.by_category.slice(0, 10).map((c) => ({
    label: c.categorie,
    value: c.montant,
    display: euro(c.montant),
  }));
  const tituRows = data.top_titulaires.slice(0, 10).map((tt) => ({
    label: tt.nom,
    value: tt.montant,
    rouge: true,
    display: euro(tt.montant),
  }));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="marches"
            title={`${commune.nom} — ${t("fx.natmar.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${nfInt.format(commune.pop)} ${t("fx.natbud.hab")}`}
          />
          <p className="fx-lede">{t("fx.natmar.lede")}</p>

          <div className="fx-kpi-grid" style={{ marginTop: 28 }}>
            <div className="fx-kpi-card is-hero">
              <p className="fx-kpi-label">{t("fx.natmar.total_montant")}</p>
              <p className="fx-kpi-value tnum">{euro(data.total.montant)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natmar.nb_marches")}</p>
              <p className="fx-kpi-value tnum">{nfInt.format(data.total.nb_marches)}</p>
            </div>
            <div className="fx-kpi-card">
              <p className="fx-kpi-label">{t("fx.natmar.nb_titulaires")}</p>
              <p className="fx-kpi-value tnum">{nfInt.format(data.total.nb_titulaires)}</p>
            </div>
          </div>

          <p className="fx-note">{data.coverage_note}</p>

          <DualFlowBars
            left={{ title: t("fx.natmar.by_cat_title"), rows: catRows }}
            right={{ title: t("fx.natmar.titulaires_title"), rows: tituRows }}
          />

          {/* Biggest marchés */}
          <section className="fx-section" style={{ marginTop: 40 }}>
            <h3 className="fx-h3">{t("fx.natmar.biggest_title")}</h3>
            <ul className="fx-marches-list">
              {data.top_marches.slice(0, 10).map((m, i) => (
                <li key={i} className="fx-marche-row">
                  <span className="fx-marche-obj">{m.objet || "—"}</span>
                  <span className="fx-marche-meta">
                    {m.titulaire ? `${m.titulaire} · ` : ""}
                    {m.annee ?? ""}
                    {m.categorie ? ` · ${m.categorie}` : ""}
                  </span>
                  <span className="fx-marche-val tnum">{euro(m.montant)}</span>
                </li>
              ))}
            </ul>
          </section>

          <ChartSource source={t("fx.natmar.source")} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
