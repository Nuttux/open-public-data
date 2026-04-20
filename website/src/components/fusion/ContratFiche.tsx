import Link from "next/link";

import type { ContratFiche as ContratFicheType, ContratRanking, MarcheVulgarization, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet, isObjetCryptic } from "@/lib/objet-normalizer";

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

/**
 * Fiche contrat — contenu rendu dans le drawer ou la page dédiée.
 * Ne contient PAS le drawer chrome ; c'est juste le body.
 *
 * TODO: enrichir avec `objet_clair`, `quoi_concretement`, `pourquoi_ca_compte`
 * une fois le pipeline Gemini 3 Flash de vulgarisation en place.
 */
export default function ContratFiche({
  contrat,
  vulgarization,
  fournisseurSirene,
  ranking,
}: {
  contrat: ContratFicheType;
  vulgarization?: MarcheVulgarization | null;
  fournisseurSirene?: SireneCompany | null;
  ranking?: ContratRanking | null;
}) {
  const { v: vMax, u: uMax } = fmtEur(contrat.montantMax);
  const dureeAnnees = contrat.dureeJours > 0 ? (contrat.dureeJours / 365).toFixed(1).replace(".", ",") : "—";

  return (
    <div>
      {ranking && ranking.rankYear > 0 && (
        <div className="fx-rank-strip">
          <span className="fx-rank-badge">
            #{ranking.rankYear}
            <span className="fx-rank-of"> sur {ranking.totalYear}</span>
          </span>
          <span className="fx-rank-text">
            plus gros marché {contrat.year}
            {ranking.totalNature > 0 && (
              <>
                {" · "}
                <b>#{ranking.rankNature}</b> des {ranking.totalNature.toLocaleString("fr-FR")}{" "}
                marchés <i>{contrat.nature.toLowerCase()}</i>
              </>
            )}
            {ranking.medianNature > 0 && contrat.montantMax > 0 && (
              <>
                {" · "}
                {contrat.montantMax >= 2 * ranking.medianNature
                  ? <><b>{(contrat.montantMax / ranking.medianNature).toFixed(1).replace(".", ",")}×</b> la médiane</>
                  : contrat.montantMax <= ranking.medianNature / 2
                  ? <>en dessous de la médiane ({fmtEur(ranking.medianNature).v} {fmtEur(ranking.medianNature).u})</>
                  : <>proche de la médiane</>}
              </>
            )}
          </span>
        </div>
      )}
      {vulgarization ? (
        <div className="fx-fiche-lead">
          {vulgarization.objet_clair && (
            <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 17, lineHeight: 1.45 }}>
              {vulgarization.objet_clair}
            </p>
          )}
          {vulgarization.quoi_concretement && (
            <p style={{ margin: "10px 0 0", fontSize: 14.5, color: "var(--ink-2)" }}>
              {vulgarization.quoi_concretement}
            </p>
          )}
          {vulgarization.pourquoi_ca_compte && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
              → {vulgarization.pourquoi_ca_compte}
            </p>
          )}
        </div>
      ) : (
        <div className="fx-fiche-lead">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 17, lineHeight: 1.45 }}>
            {normalizeObjet(contrat.objet)}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
            Libellé reformulé depuis le titre technique DECP. Retrouvez l&apos;intitulé exact
            plus bas dans « Objet du marché ».
          </p>
        </div>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Enveloppe max</div>
          <div className="fx-fiche-kpi-value tnum">
            {vMax}
            <span className="u">{uMax}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Durée contractuelle</div>
          <div className="fx-fiche-kpi-value tnum">
            {dureeAnnees}
            <span className="u">{dureeAnnees !== "—" ? "ans" : ""}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Nature</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
            {contrat.nature}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Notifié le</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
            {fmtDate(contrat.dateNotification)}
          </div>
        </div>
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Objet du marché</div>
        <p style={{ fontFamily: "var(--f-ui)", fontSize: 15, color: "var(--ink)", lineHeight: 1.55, margin: 0 }}>
          {normalizeObjet(contrat.objet) || "—"}
        </p>
        {isObjetCryptic(contrat.objet) && contrat.objet && (
          <p
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11.5,
              color: "var(--muted)",
              letterSpacing: ".02em",
              marginTop: 8,
              lineHeight: 1.45,
            }}
          >
            Libellé brut DECP : {contrat.objet}
          </p>
        )}
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Titulaire(s)</div>
        {contrat.multiAttributaire ? (
          <div
            style={{
              padding: "14px 16px",
              background: "rgba(166, 118, 56, 0.06)",
              border: "1px solid var(--ocre)",
              fontFamily: "var(--f-ui)",
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--ink-2)",
            }}
          >
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ocre)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
              Marché multi-attributaire
            </div>
            Ce marché a été attribué à <b>plusieurs entreprises simultanément</b>. Le détail
            (qui a pris quelle part) n&apos;est pas publié dans les données essentielles de la
            commande publique (DECP) à ce jour. À enrichir via croisement DECP national.
          </div>
        ) : (
          <dl>
            <div className="fx-fiche-prop">
              <dt>Nom</dt>
              <dd>{contrat.fournisseur}</dd>
            </div>
            {fournisseurSirene?.libelle_activite && (
              <div className="fx-fiche-prop">
                <dt>Activité</dt>
                <dd>{fournisseurSirene.libelle_activite}</dd>
              </div>
            )}
            {fournisseurSirene?.commune && (
              <div className="fx-fiche-prop">
                <dt>Siège</dt>
                <dd>{fournisseurSirene.commune} · {fournisseurSirene.code_postal ?? ""}</dd>
              </div>
            )}
            {fournisseurSirene?.tranche_effectifs && (
              <div className="fx-fiche-prop">
                <dt>Effectif</dt>
                <dd>{fournisseurSirene.tranche_effectifs}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt>SIRET</dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.fournisseurSiret}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt>Voir</dt>
                <dd>
                  <Link
                    href={`/marches-publics/fournisseur/${contrat.fournisseurSiret.replace(/\s/g, "")}`}
                    style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
                    scroll={false}
                  >
                    Fiche complète du fournisseur →
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Classification</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>Catégorie</dt>
            <dd>{contrat.categorie}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>Périmètre</dt>
            <dd>{contrat.perimetre}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>Exercice</dt>
            <dd>{contrat.year}</dd>
          </div>
        </dl>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Sources &amp; vérification</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>N° marché</dt>
            <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.numero}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>DECP nat.</dt>
            <dd>
              <a
                href={`https://www.data.gouv.fr/datasets/donnees-essentielles-de-la-commande-publique/#/_search?q=${encodeURIComponent(contrat.numero)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                Rechercher sur data.gouv.fr ↗
              </a>
            </dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>Open data</dt>
            <dd>
              <a
                href="https://opendata.paris.fr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                opendata.paris.fr ↗
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".02em", lineHeight: 1.5 }}>
        <b>À venir</b> : liens directs vers l&apos;avis BOAMP, la liste des co-attributaires
        déclarés, les avenants et sous-traitants — via enrichissement du pipeline DECP.
      </p>
    </div>
  );
}
