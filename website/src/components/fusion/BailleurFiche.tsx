"use client";

import type { BailleurFiche as BailleurFicheType } from "@/lib/fusion-data";
import { useT } from "@/lib/localeContext";

export default function BailleurFiche({ bailleur }: { bailleur: BailleurFicheType }) {
  const t = useT();

  return (
    <div>
      <p className="fx-fiche-lead">
        <b>{t("fx.fiche.bail.en_clair")}</b> — {bailleur.description}
      </p>

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.bail.part")}</div>
          <div className="fx-fiche-kpi-value tnum">
            ~ {bailleur.share}
            <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.bail.type")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 16 }}>
            {bailleur.type}
          </div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.bail.identite")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.shared.nom")}</dt>
            <dd>{bailleur.name}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.bail.statut")}</dt>
            <dd>{bailleur.type}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.bail.desc_label")}</dt>
            <dd>{bailleur.description}</dd>
          </div>
        </dl>
      </section>

      <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".02em", lineHeight: 1.5 }}>
        {t("fx.fiche.bail.avenir")}
      </p>
    </div>
  );
}
