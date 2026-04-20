import type { BailleurFiche as BailleurFicheType } from "@/lib/fusion-data";

export default function BailleurFiche({ bailleur }: { bailleur: BailleurFicheType }) {
  return (
    <div>
      <p className="fx-fiche-lead">
        <b>En clair</b> — {bailleur.description}
      </p>

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Part du parc</div>
          <div className="fx-fiche-kpi-value tnum">
            ~ {bailleur.share}
            <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Type</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 16 }}>
            {bailleur.type}
          </div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Identité</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>Nom</dt>
            <dd>{bailleur.name}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>Statut</dt>
            <dd>{bailleur.type}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>Description</dt>
            <dd>{bailleur.description}</dd>
          </div>
        </dl>
      </section>

      <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".02em", lineHeight: 1.5 }}>
        <b>À venir</b> : nombre exact de logements gérés, répartition par arrondissement,
        taux de rotation, profil des attributions, bilan financier — via enrichissement
        des rapports annuels des bailleurs.
      </p>
    </div>
  );
}
