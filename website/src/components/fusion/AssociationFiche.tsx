import type { AssociationFiche as AssociationFicheType, SubventionVulgarization } from "@/lib/fusion-data";

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

export default function AssociationFiche({
  asso,
  vulgarization,
}: {
  asso: AssociationFicheType;
  vulgarization?: SubventionVulgarization | null;
}) {
  const { v: vTot, u: uTot } = fmtEur(asso.totalAmount);
  const firstYear = asso.yearsActive[0];
  const lastYear = asso.yearsActive[asso.yearsActive.length - 1];
  const maxByYear = Math.max(...asso.byYear.map((y) => y.amount), 1);

  return (
    <div>
      {vulgarization ? (
        <div className="fx-fiche-lead">
          <div className="fx-fiche-ai-badge" aria-label="Vulgarisation générée par IA">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 0.5 L6.2 3.8 L9.5 5 L6.2 6.2 L5 9.5 L3.8 6.2 L0.5 5 L3.8 3.8 Z" fill="currentColor" />
            </svg>
            Vulgarisation IA · {vulgarization.model?.replace("-preview", "") ?? "Gemini"}
            <span className="fx-fiche-ai-verify" title="Généré automatiquement, à vérifier sur la source">· à vérifier</span>
          </div>
          {vulgarization.activite_claire && (
            <p className="fx-fiche-lead-main">
              {vulgarization.activite_claire}
            </p>
          )}
          {vulgarization.pourquoi_subvention && (
            <p className="fx-fiche-lead-sub">
              {vulgarization.pourquoi_subvention}
            </p>
          )}
          {vulgarization.impact_citoyen && (
            <p className="fx-fiche-lead-impact">
              → {vulgarization.impact_citoyen}
            </p>
          )}
        </div>
      ) : null}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Cumul reçu</div>
          <div className="fx-fiche-kpi-value tnum">
            {vTot}
            <span className="u">{uTot}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Subventions</div>
          <div className="fx-fiche-kpi-value tnum">{asso.subventionCount}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Actif depuis</div>
          <div className="fx-fiche-kpi-value tnum">{firstYear ?? "—"}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Dernière année</div>
          <div className="fx-fiche-kpi-value tnum">{lastYear ?? "—"}</div>
        </div>
      </div>

      {asso.themeRank && (
        <div className="fx-fiche-rank">
          <span className="fx-fiche-rank-num">#{asso.themeRank.rank}</span>
          <span>
            plus subventionné{asso.themeRank.rank === 1 ? "" : "e"} en{" "}
            <b>{asso.themeRank.theme}</b> sur {asso.themeRank.total} bénéficiaires
            classés (exercice {lastYear}).
          </span>
        </div>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Identité</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>Nom</dt>
            <dd>{asso.name}</dd>
          </div>
          {asso.natureJuridique && (
            <div className="fx-fiche-prop">
              <dt>Nature</dt>
              <dd>{asso.natureJuridique}</dd>
            </div>
          )}
          {asso.theme && (
            <div className="fx-fiche-prop">
              <dt>Thématique</dt>
              <dd>{asso.theme}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Historique année par année</div>
        <div>
          {asso.byYear
            .slice()
            .reverse()
            .map((y) => {
              const { v, u } = fmtEur(y.amount);
              const pct = (y.amount / maxByYear) * 100;
              const highlight = asso.highlights.find((h) => h.year === y.year);
              return (
                <div
                  key={y.year}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr 100px 80px",
                    gap: 14,
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)" }}>{y.year}</span>
                  <span style={{ position: "relative", height: 8 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 1,
                        height: 6,
                        width: `${pct}%`,
                        background: highlight
                          ? highlight.kind === "up"
                            ? "var(--rouge)"
                            : "var(--bleu)"
                          : "var(--ink)",
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>
                    {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {highlight ? (
                      <span style={{ color: highlight.kind === "up" ? "var(--rouge)" : "var(--bleu)" }}>
                        {highlight.kind === "up" ? "↑" : "↓"}{" "}
                        {Math.abs(highlight.pct).toFixed(0)} %
                      </span>
                    ) : (
                      <span className="muted">{y.count} sub.</span>
                    )}
                  </span>
                </div>
              );
            })}
        </div>
        {asso.highlights.length > 0 && (
          <p className="fx-fiche-note">
            <b>Mouvements notables</b> ·{" "}
            {asso.highlights
              .slice(-3)
              .reverse()
              .map((h) =>
                `${h.year}: ${h.kind === "up" ? "+" : "−"} ${Math.abs(h.pct).toFixed(0)} % vs année précédente`,
              )
              .join(" · ")}
          </p>
        )}
      </section>

    </div>
  );
}
