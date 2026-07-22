"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import { useT, useLocale } from "@/lib/localeContext";
import type { PeerComparison } from "@/lib/commune-peers";

type CommuneMeta = {
  slug: string;
  nom: string;
  dep_name: string;
  reg_name: string;
  pop: number;
};

type Props = {
  commune: CommuneMeta;
  data: PeerComparison;
  sourceUrl: string;
};

export default function ComparaisonClient({ commune, data, sourceUrl }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
    maximumFractionDigits: 0,
  });
  const perHab = t("fx.natcmp.per_hab");
  const strata = t(`fx.natcmp.strata_${data.strataIndex}`);

  const peerLine = t("fx.natcmp.peer_line")
    .replace("{strata}", strata)
    .replace("{n}", nf.format(data.peerCount));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap" style={{ padding: "48px 0" }}>
          <SectionHead
            kind="budget"
            title={`${commune.nom} — ${t("fx.natcmp.kicker")}`}
            subtitle={`${commune.dep_name} · ${commune.reg_name} · ${nf.format(commune.pop)} ${t("fx.natcmp.hab")}`}
          />

          <p className="fx-lede">{t("fx.natcmp.lede")}</p>

          <p className="fx-cmp-peerline">
            <span
              className="fx-def"
              title={t("fx.natcmp.method_tip")}
              tabIndex={0}
            >
              {peerLine}
            </span>
          </p>

          <div className="fx-cmp" role="table" aria-label={t("fx.natcmp.kicker")}>
            <div className="fx-cmp-legend" role="row">
              <span className="fx-cmp-legend-item">
                <i className="fx-cmp-swatch is-commune" aria-hidden />
                {commune.nom}
              </span>
              <span className="fx-cmp-legend-item">
                <i className="fx-cmp-swatch is-median" aria-hidden />
                {t("fx.natcmp.median_label")}
              </span>
            </div>

            {data.rows.map((r) => {
              const label = t(`fx.natcmp.kpi_${r.key}`);
              const rowMax =
                Math.max(Math.abs(r.value ?? 0), Math.abs(r.median ?? 0)) * 1.12 || 1;
              const fillW = r.value != null ? (Math.abs(r.value) / rowMax) * 100 : 0;
              const medL = r.median != null ? (Math.abs(r.median) / rowMax) * 100 : 0;
              const deltaTxt =
                r.deltaPct == null
                  ? ""
                  : `${r.deltaPct > 0 ? "+" : ""}${nf.format(Math.round(r.deltaPct))} %`;
              return (
                <div className="fx-cmp-row" role="row" key={r.key}>
                  <div className="fx-cmp-head">
                    <span className="fx-cmp-label">{label}</span>
                    <span className="fx-cmp-nums">
                      <b className="tnum">
                        {r.value != null ? nf.format(Math.round(r.value)) : "—"} {perHab}
                      </b>
                      <span className="fx-cmp-med tnum">
                        {t("fx.natcmp.median_label")} {r.median != null ? nf.format(Math.round(r.median)) : "—"}
                      </span>
                      {deltaTxt && <span className="fx-cmp-delta tnum">{deltaTxt}</span>}
                    </span>
                  </div>
                  <div className="fx-cmp-track" aria-hidden>
                    <span className="fx-cmp-fill" style={{ width: `${fillW}%` }} />
                    {r.median != null && (
                      <span className="fx-cmp-median-mark" style={{ left: `${medL}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="fx-note fx-note-muted">{t("fx.natcmp.foot_note")}</p>

          <ChartSource
            source={`${t("fx.natcmp.source")} · ${data.year}`}
            dataHref={sourceUrl}
            methodAnchor="c-villes"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
