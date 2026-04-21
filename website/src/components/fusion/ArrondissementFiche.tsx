import Link from "next/link";

import type { ArrondissementFiche as ArrondissementFicheType } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

/**
 * Fiche arrondissement — affichée dans un drawer quand l'utilisateur clique
 * sur un polygone du choropleth. Montre les KPIs + top 10 projets avec
 * vignettes photo (si dispo, sinon pictogramme).
 */
export default function ArrondissementFiche({ arr }: { arr: ArrondissementFicheType }) {
  const { v, u } = fmtEur(arr.total);
  const topChap = arr.byChapitre[0];

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Investi en {arr.year}</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Part Paris géolocalisé</div>
          <div className="fx-fiche-kpi-value tnum">{arr.totalShare.toFixed(1).replace(".", ",")} <span className="u">%</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Rang parmi 20 arr.</div>
          <div className="fx-fiche-kpi-value tnum">#{arr.rank}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Projets identifiés</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 24 }}>
            {arr.nbProjets} <span className="muted" style={{ fontSize: 12 }}>· {arr.nbGeo} géolocalisés</span>
          </div>
        </div>
      </div>

      {topChap && (
        <div className="fx-fiche-rank">
          <span className="fx-fiche-rank-num" style={{ color: "var(--ocre)" }}>1er</span>
          <span>
            chapitre : <b>{topChap.label}</b> — {fmtEur(topChap.amount).v} {fmtEur(topChap.amount).u}
            {" "}sur {topChap.count} projets.
          </span>
        </div>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Top projets · {arr.year}</div>
        <div className="fx-arr-top-grid">
          {arr.topProjets.map((p, i) => {
            const f = fmtEur(p.amount);
            return (
              <Link
                key={p.id}
                href={`/investissements/projet/${encodeURIComponent(p.id)}`}
                scroll={false}
                className="fx-arr-top-item"
              >
                <div className="fx-arr-top-thumb">
                  <ProjetThumb projetId={p.id} aspectRatio="4 / 3" fallbackLabel={p.name} />
                </div>
                <div className="fx-arr-top-meta">
                  <div className="fx-arr-top-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="fx-arr-top-name">{p.name.slice(0, 80)}</div>
                  <div className="fx-arr-top-amount">{f.v} <span className="u">{f.u}</span></div>
                  <div className="fx-arr-top-chap">{p.chapitre}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {arr.byChapitre.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Répartition par chapitre</div>
          <div>
            {arr.byChapitre.map((c) => {
              const pct = (c.amount / arr.total) * 100;
              const f = fmtEur(c.amount);
              return (
                <div
                  key={c.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{c.label}</span>
                  <span className="muted" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {c.count} projet{c.count > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, minWidth: 80, textAlign: "right" }}>
                    {f.v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{f.u}</span>
                    <span className="muted" style={{ marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: 11 }}>
                      {pct.toFixed(0)} %
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
