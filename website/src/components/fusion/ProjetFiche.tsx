import type { ProjetFiche as ProjetFicheType } from "@/lib/fusion-data";

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

const TYPOLOGIE_LABELS: Record<string, string> = {
  ecole: "École",
  college: "Collège",
  lycee: "Lycée",
  creche: "Crèche",
  gymnase: "Gymnase",
  piscine: "Piscine",
  bibliotheque: "Bibliothèque",
  "espace-vert": "Espace vert",
  voirie: "Voirie",
  "logement-social": "Logement social",
  "equipement-culturel": "Équipement culturel",
  "equipement-sante": "Équipement santé",
  administration: "Administration",
  autre: "Autre",
};

export default function ProjetFiche({ projet }: { projet: ProjetFicheType }) {
  const { v, u } = fmtEur(projet.montant);
  const mapUrl =
    projet.lat && projet.lon
      ? `https://www.openstreetmap.org/?mlat=${projet.lat}&mlon=${projet.lon}#map=17/${projet.lat}/${projet.lon}`
      : null;
  const vulg = projet.vulgarization;
  const typoLabel = vulg?.typologie_normalisee
    ? TYPOLOGIE_LABELS[vulg.typologie_normalisee] ?? vulg.typologie_normalisee
    : null;

  return (
    <div>
      {/* Badge typologie + statut extraction */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {typoLabel && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              border: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--bg)",
              borderRadius: 2,
            }}
          >
            {typoLabel}
          </span>
        )}
        {projet.typeAp && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              border: "1px solid var(--rule)",
              color: "var(--muted)",
              borderRadius: 2,
            }}
          >
            {projet.typeAp}
          </span>
        )}
        {projet.confidence != null && projet.confidence < 0.7 && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              border: "1px solid var(--ocre)",
              color: "var(--ocre)",
              borderRadius: 2,
            }}
            title="Extraction PDF à fiabilité modérée — vérifiez la source"
          >
            Fiabilité {(projet.confidence * 100).toFixed(0)} %
          </span>
        )}
      </div>

      {/* Bloc vulgarisation LLM */}
      {vulg && (vulg.description_claire || vulg.quoi_concretement) && (
        <div className="fx-fiche-lead">
          <div className="fx-fiche-ai-badge" aria-label="Vulgarisation générée par IA">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 0.5 L6.2 3.8 L9.5 5 L6.2 6.2 L5 9.5 L3.8 6.2 L0.5 5 L3.8 3.8 Z" fill="currentColor" />
            </svg>
            Vulgarisation IA · {vulg.model?.replace("-preview", "") ?? "Gemini"}
            <span className="fx-fiche-ai-verify" title="Généré automatiquement, à vérifier sur la source">· à vérifier</span>
          </div>
          {vulg.description_claire && (
            <p className="fx-fiche-lead-main">{vulg.description_claire}</p>
          )}
          {vulg.quoi_concretement && (
            <p className="fx-fiche-lead-sub">{vulg.quoi_concretement}</p>
          )}
          {vulg.pourquoi_ca_compte && (
            <p className="fx-fiche-lead-impact">→ {vulg.pourquoi_ca_compte}</p>
          )}
        </div>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Montant voté</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Exercice</div>
          <div className="fx-fiche-kpi-value tnum">{projet.year}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Arrondissement</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 20 }}>
            {projet.arrondissement > 0 ? `${projet.arrondissement}${suf(projet.arrondissement)}` : "Transverse"}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Chapitre</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 14, lineHeight: 1.2 }}>
            {projet.chapitre}
          </div>
        </div>
      </div>

      {/* Rank strip — classement typologie */}
      {projet.typologieRank && (
        <div className="fx-fiche-rank">
          <span className="fx-fiche-rank-num">#{projet.typologieRank.rank}</span>
          <span>
            plus gros projet <b>{TYPOLOGIE_LABELS[projet.typologieRank.typologie] ?? projet.typologieRank.typologie}</b>
            {" "}sur {projet.typologieRank.total} projets classés (exercice {projet.year}).
          </span>
        </div>
      )}
      {projet.arrRank && projet.arrRank.rank <= 10 && (
        <div className="fx-fiche-rank" style={{ marginTop: projet.typologieRank ? -12 : 0 }}>
          <span className="fx-fiche-rank-num" style={{ color: "var(--bleu)" }}>#{projet.arrRank.rank}</span>
          <span>
            plus gros projet dans le <b>{projet.arrRank.arr}{suf(projet.arrRank.arr)} arrondissement</b>
            {" "}sur {projet.arrRank.total} projets (exercice {projet.year}).
          </span>
        </div>
      )}

      {/* Budget réel / surcoût — honnête */}
      <div className="fx-fiche-note" style={{ marginTop: 0 }}>
        <b>Montant final & surcoût</b> — non disponibles publiquement à ce stade.
        Les comptes administratifs publient le budget voté mais pas systématiquement
        le solde en fin d&apos;opération ni les avenants. Sur notre roadmap.
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Intitulé officiel</div>
        <p style={{ fontFamily: "var(--f-ui)", fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
          {projet.name}
        </p>
      </section>

      {/* Localisation */}
      {(projet.geoLabel || mapUrl) && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Localisation</div>
          {projet.geoLabel && (
            <p style={{ fontFamily: "var(--f-ui)", fontSize: 14, color: "var(--ink-2)", margin: "0 0 8px", lineHeight: 1.4 }}>
              {projet.geoLabel}
            </p>
          )}
          {projet.lat && projet.lon && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
              {projet.lat.toFixed(5)}, {projet.lon.toFixed(5)}
            </div>
          )}
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
            >
              Voir sur OpenStreetMap ↗
            </a>
          )}
        </section>
      )}

      {/* Projets similaires */}
      {projet.similaires.length > 0 && typoLabel && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Autres projets {typoLabel.toLowerCase()} · {projet.year}</div>
          <div>
            {projet.similaires.map((s) => {
              const f = fmtEur(s.montant);
              return (
                <a
                  key={s.id}
                  href={`/investissements/projet/${encodeURIComponent(s.id)}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                    color: "var(--ink)",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                    {s.arrondissement > 0 && (
                      <span className="muted" style={{ marginLeft: 8, fontSize: 11, fontFamily: "var(--f-mono)" }}>
                        {s.arrondissement}{suf(s.arrondissement)}
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {f.v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{f.u}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Source PDF — confiance */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <dl>
          {projet.sourcePdf && (
            <div className="fx-fiche-prop">
              <dt>Annexe CA {projet.year}</dt>
              <dd>
                <a
                  href={projet.sourcePdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  PDF source{projet.sourcePage ? ` · page ${projet.sourcePage}` : ""} ↗
                </a>
              </dd>
            </div>
          )}
          <div className="fx-fiche-prop">
            <dt>ID interne</dt>
            <dd style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{projet.id}</dd>
          </div>
          {projet.confidence != null && (
            <div className="fx-fiche-prop">
              <dt>Fiabilité extraction</dt>
              <dd style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                {(projet.confidence * 100).toFixed(0)} %
                {projet.confidence < 0.7 && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    · vérification recommandée sur la source
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
