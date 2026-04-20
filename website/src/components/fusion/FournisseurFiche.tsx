import Link from "next/link";
import type { FournisseurFiche as FournisseurFicheType, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function FournisseurFiche({
  fournisseur,
  sirene,
}: {
  fournisseur: FournisseurFicheType;
  sirene?: SireneCompany | null;
}) {
  const { v: vTot, u: uTot } = fmtEur(fournisseur.totalAmount);
  const firstYear = fournisseur.yearsActive[0];
  const maxByYear = Math.max(...fournisseur.byYear.map((y) => y.amount), 1);
  const maxByCat = Math.max(...fournisseur.byCategory.map((c) => c.amount), 1);

  return (
    <div>
      {sirene ? (
        <div className="fx-fiche-lead">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 16, lineHeight: 1.4 }}>
            {sirene.nom || fournisseur.nom}
          </p>
          {sirene.libelle_activite && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {sirene.libelle_activite}
              {sirene.activite_principale && (
                <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11, marginLeft: 8 }}>
                  NAF {sirene.activite_principale}
                </span>
              )}
            </p>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
            {[
              sirene.forme_juridique,
              sirene.commune && `siège à ${sirene.commune}`,
              sirene.tranche_effectifs && `effectif ${sirene.tranche_effectifs.toLowerCase()}`,
              sirene.date_creation && `créée en ${sirene.date_creation.slice(0, 4)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Prestataire identifié par son SIREN{fournisseur.siren ? ` ${fournisseur.siren}` : ""}. Le profil détaillé
          (secteur, effectifs, dirigeants) est disponible sur l&apos;
          <a
            href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            annuaire des entreprises
          </a>.
        </p>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Cumul Paris</div>
          <div className="fx-fiche-kpi-value tnum">
            {vTot}
            <span className="u">{uTot}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Contrats</div>
          <div className="fx-fiche-kpi-value tnum">{fournisseur.contratCount}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Actif depuis</div>
          <div className="fx-fiche-kpi-value tnum">{firstYear ?? "—"}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Années actives</div>
          <div className="fx-fiche-kpi-value tnum">{fournisseur.yearsActive.length}</div>
        </div>
      </div>

      {fournisseur.siret && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Identité</div>
          <dl>
            {fournisseur.siret !== "#" && (
              <div className="fx-fiche-prop">
                <dt>SIRET</dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{fournisseur.siret}</dd>
              </div>
            )}
            {fournisseur.siren && fournisseur.siren !== "#" && (
              <div className="fx-fiche-prop">
                <dt>SIREN</dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{fournisseur.siren}</dd>
              </div>
            )}
            {sirene?.adresse && (
              <div className="fx-fiche-prop">
                <dt>Adresse</dt>
                <dd>{sirene.adresse}</dd>
              </div>
            )}
            {sirene?.etat && (
              <div className="fx-fiche-prop">
                <dt>État</dt>
                <dd style={{ textTransform: "capitalize" }}>{sirene.etat.toLowerCase()}</dd>
              </div>
            )}
            {sirene?.dirigeants && sirene.dirigeants.length > 0 && (
              <div className="fx-fiche-prop">
                <dt>Dirigeant</dt>
                <dd>
                  {sirene.dirigeants
                    .slice(0, 2)
                    .map((d) => `${d.prenom} ${d.nom}`.trim())
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
            <div className="fx-fiche-prop">
              <dt>Annuaire</dt>
              <dd>
                <a
                  href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${fournisseur.siren}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  annuaire-entreprises.data.gouv.fr ↗
                </a>
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Historique année par année</div>
        <div>
          {fournisseur.byYear
            .slice()
            .reverse()
            .map((y) => {
              const { v, u } = fmtEur(y.amount);
              const pct = (y.amount / maxByYear) * 100;
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
                        background: "var(--ink)",
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 14 }}>
                    {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                  </span>
                  <span className="muted" style={{ textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {y.count} contrats
                  </span>
                </div>
              );
            })}
        </div>
      </section>

      {fournisseur.byCategory.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Répartition par catégorie</div>
          {fournisseur.byCategory.slice(0, 6).map((c) => {
            const { v, u } = fmtEur(c.amount);
            return (
              <div
                key={c.category}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px",
                  gap: 14,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--rule)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 13,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ position: "relative", display: "inline-block", width: `${(c.amount / maxByCat) * 100}%`, height: 4, background: "var(--ink)", verticalAlign: "middle", marginRight: 8, maxWidth: "35%" }} />
                  {c.category}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>
                  {v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{u}</span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Contrats notifiés · top 8</div>
        <table className="fx-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Objet</th>
              <th>Année</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {fournisseur.contrats.slice(0, 8).map((c) => {
              const { v, u } = fmtEur(c.montant);
              return (
                <tr key={c.numero}>
                  <td style={{ fontWeight: 500, maxWidth: 280 }}>
                    {(() => {
                      const clean = normalizeObjet(c.objet);
                      const shown = clean.length > 70 ? clean.slice(0, 70) + "…" : clean;
                      return c.numero ? (
                        <Link
                          href={`/marches-publics/contrat/${c.numero}`}
                          style={{ color: "var(--ink)" }}
                          scroll={false}
                        >
                          {shown}
                        </Link>
                      ) : (
                        <span>{shown}</span>
                      );
                    })()}
                  </td>
                  <td className="rank">{c.year}</td>
                  <td className="muted">{fmtDate(c.date)}</td>
                  <td className="num">
                    {v} <span className="muted">{u}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {fournisseur.contrats.length > 8 && (
          <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
            + {fournisseur.contrats.length - 8} autres contrats sur la période.
          </p>
        )}
      </section>

      <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".02em", lineHeight: 1.5 }}>
        <b>À venir</b> : profil SIRENE complet (NAF, effectifs, création, dirigeant),
        autres collectivités clientes (via DECP national agrégé), site web officiel.
      </p>
    </div>
  );
}
