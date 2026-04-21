import Link from "next/link";

import type { MarcheCategorieFiche } from "@/lib/fusion-data";
import { fmtCompactEur, fmtInt, fmtDec } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";

export default function CategorieMarcheFiche({ fiche }: { fiche: MarcheCategorieFiche }) {
  const total = fmtCompactEur(fiche.total);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Enveloppe max {fiche.year}</div>
          <div className="fx-fiche-kpi-value tnum">
            {total.value}
            <span className="u">{total.unit}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Part du total Paris</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtDec(fiche.shareOfTotalPct, 1)}
            <span className="u">%</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Contrats</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbContrats)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Titulaires distincts</div>
          <div className="fx-fiche-kpi-value tnum">{fmtInt(fiche.nbTitulaires)}</div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">10 plus gros marchés de la catégorie · {fiche.year}</div>
        <table className="fx-fiche-subv-table">
          <thead>
            <tr>
              <th>Objet</th>
              <th>Titulaire</th>
              <th style={{ textAlign: "right" }}>Enveloppe</th>
            </tr>
          </thead>
          <tbody>
            {fiche.topContrats.map((c) => {
              const { value, unit } = fmtCompactEur(c.montant);
              const objet = c.objetClair || normalizeObjet(c.objet || "");
              return (
                <tr key={c.numero}>
                  <td style={{ maxWidth: 360 }}>
                    {c.numero ? (
                      <Link
                        href={`/marches-publics/contrat/${encodeURIComponent(c.numero)}`}
                        scroll={false}
                        style={{ color: "var(--ink)" }}
                      >
                        {objet.length > 90 ? objet.slice(0, 90) + "…" : objet}
                      </Link>
                    ) : (
                      <span>{objet}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.fournisseurSiret ? (
                      <Link
                        href={`/marches-publics/fournisseur/${encodeURIComponent(c.fournisseurSiret)}`}
                        scroll={false}
                        style={{ color: "var(--ink-2)" }}
                      >
                        {c.fournisseur.slice(0, 40)}
                      </Link>
                    ) : (
                      c.fournisseur.slice(0, 40)
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700 }}>
                    {value} <span style={{ color: "var(--muted)", fontSize: ".75em" }}>{unit}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Top titulaires · part de la catégorie</div>
        <div>
          {fiche.topTitulaires.map((t, i) => {
            const { value, unit } = fmtCompactEur(t.amount);
            const pct = (t.amount / fiche.total) * 100;
            const href = t.siret ? `/marches-publics/fournisseur/${encodeURIComponent(t.siret)}` : null;
            const inner = (
              <>
                <span className="rank">#{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 500 }}>{t.name}</span>
                <span className="muted fx-mini-hide-mobile">{t.nb} contrat{t.nb > 1 ? "s" : ""} · {fmtDec(pct, 1)} % de la catégorie</span>
                <span className="num">
                  {value} <span className="muted">{unit}</span>
                </span>
              </>
            );
            return href ? (
              <Link key={i} href={href} scroll={false} className="fx-mini-row fx-mini-row-link">
                {inner}
              </Link>
            ) : (
              <div key={i} className="fx-mini-row">{inner}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
