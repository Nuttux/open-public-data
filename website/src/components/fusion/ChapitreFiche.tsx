import Link from "next/link";

import type { ChapitreFiche as ChapitreFicheType } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

/**
 * Fiche chapitre — affichée en drawer quand l'utilisateur clique un segment
 * du StackedBarTheme. KPIs + top arrondissements + top 10 projets.
 */
export default function ChapitreFiche({ chap }: { chap: ChapitreFicheType }) {
  const { v, u } = fmtEur(chap.total);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Montant · {chap.year}</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Part du budget invest.</div>
          <div className="fx-fiche-kpi-value tnum">{chap.share.toFixed(1).replace(".", ",")} <span className="u">%</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Rang chapitre</div>
          <div className="fx-fiche-kpi-value tnum">#{chap.rank} <span className="u" style={{ fontSize: 14 }}>/ {chap.nbChapitres}</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Projets identifiés</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 28 }}>
            {chap.nbProjets}
          </div>
        </div>
      </div>

      {chap.topArrondissements.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Top arrondissements · {chap.label.toLowerCase()}</div>
          <div>
            {chap.topArrondissements.map((a) => {
              const f = fmtEur(a.amount);
              return (
                <Link
                  key={a.arr}
                  href={`/investissements/arrondissement/${a.arr}`}
                  scroll={false}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "baseline",
                    gap: 14,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                    color: "var(--ink)",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ocre)", minWidth: 32 }}>
                    {a.arr}{suf(a.arr)}
                  </span>
                  <span className="muted" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {a.count} projet{a.count > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700 }}>
                    {f.v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{f.u}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Top projets · {chap.label.toLowerCase()}</div>
        <div className="fx-arr-top-grid">
          {chap.topProjets.map((p, i) => {
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
                  <div className="fx-arr-top-chap">
                    {p.arr > 0 ? `${p.arr}${suf(p.arr)} arr.` : "Transverse"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
