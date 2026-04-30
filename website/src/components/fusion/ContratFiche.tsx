"use client";

import Link from "next/link";
import type { ContratFiche as ContratFicheType, ContratRanking, MarcheVulgarization, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet, isObjetCryptic } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import Tip from "./Tip";

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
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locStr, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const { v: vMax, u: uMax } = fmtEur(contrat.montantMax);
  const dureeAnnees = contrat.dureeJours > 0
    ? (contrat.dureeJours / 365).toFixed(1).replace(".", locale === "en" ? "." : ",")
    : "—";

  // Enrichissement DECP — affichage conditionnel.
  const decp = contrat.decp;
  const showNotifie = Boolean(decp?.afficherDeuxMontants && decp?.montantNotifie != null && decp.montantNotifie > 0);
  const notifie = showNotifie ? fmtEur(decp!.montantNotifie!) : null;

  // Tags DECP (affichés en ligne sous l'objet, uniquement si ≠ null/vide).
  type Tag = { label: string; title?: string };
  const decpTags: Tag[] = [];
  if (decp?.ccag) {
    decpTags.push({ label: decp.ccag, title: t("fx.fiche.contrat.tag.ccag_title") });
  }
  if (decp?.cpvFamille && decp.cpvFamille !== decp.ccag) {
    decpTags.push({ label: decp.cpvFamille, title: t("fx.fiche.contrat.tag.cpv_title") });
  }
  if (decp?.lieuExecution) {
    decpTags.push({ label: `📍 ${decp.lieuExecution}`, title: t("fx.fiche.contrat.tag.lieu_title") });
  }
  if (decp?.offresRecues != null && decp.offresRecues > 0) {
    decpTags.push({
      label: decp.offresRecues === 1
        ? t("fx.fiche.contrat.tag.offres_singular")
        : t("fx.fiche.contrat.tag.offres_plural").replace("{n}", String(decp.offresRecues)),
      title: decp.offresRecues === 1
        ? t("fx.fiche.contrat.tag.offres_singular_title")
        : t("fx.fiche.contrat.tag.offres_plural_title"),
    });
  }
  if (decp?.hasConsiderationSociale) {
    decpTags.push({
      label: t("fx.fiche.contrat.tag.clauses_sociales"),
      title: t("fx.fiche.contrat.tag.clauses_sociales_title"),
    });
  }
  if (decp?.hasConsiderationEnvironnementale) {
    decpTags.push({
      label: t("fx.fiche.contrat.tag.clauses_env"),
      title: t("fx.fiche.contrat.tag.clauses_env_title"),
    });
  }

  return (
    <div>
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
            {t("fx.fiche.contrat.libelle_reformat")}
          </p>
        </div>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {showNotifie ? (
              <Tip label={t("fx.fiche.contrat.kpi.plafond_tip")}>
                {t("fx.fiche.contrat.kpi.plafond")}
              </Tip>
            ) : (
              t("fx.fiche.contrat.enveloppe")
            )}
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {vMax}
            <span className="u">{uMax}</span>
          </div>
        </div>
        {showNotifie && notifie && (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">
              <Tip label={t("fx.fiche.contrat.kpi.notifie_tip")}>
                {t("fx.fiche.contrat.kpi.notifie")}
              </Tip>
            </div>
            <div className="fx-fiche-kpi-value tnum" style={{ color: "var(--bleu)" }}>
              {notifie.v}
              <span className="u">{notifie.u}</span>
            </div>
          </div>
        )}
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.contrat.duree")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {dureeAnnees}
            <span className="u">{dureeAnnees !== "—" ? t("fx.fiche.contrat.duree_unit") : ""}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.shared.nature")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
            {trLabel(contrat.nature, locale)}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.contrat.notifie")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
            {fmtDate(contrat.dateNotification)}
          </div>
        </div>
      </div>

      {decpTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 0" }}>
          {decpTags.map((tg) => (
            <span
              key={tg.label}
              title={tg.title}
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: ".02em",
                padding: "3px 8px",
                background: "rgba(59, 99, 173, 0.06)",
                border: "1px solid rgba(59, 99, 173, 0.25)",
                color: "var(--ink-2)",
                borderRadius: 2,
                cursor: tg.title ? "help" : "default",
              }}
            >
              {tg.label}
            </span>
          ))}
        </div>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.contrat.objet")}</div>
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
            {t("fx.fiche.contrat.libelle_brut")} : {contrat.objet}
          </p>
        )}
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.contrat.titulaire")}</div>
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
              {t("fx.fiche.contrat.multi_badge")}
            </div>
            {t("fx.fiche.contrat.multi_desc")}
          </div>
        ) : (
          <dl>
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.shared.nom")}</dt>
              <dd>{contrat.fournisseur}</dd>
            </div>
            {fournisseurSirene?.libelle_activite && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.activite")}</dt>
                <dd>{fournisseurSirene.libelle_activite}</dd>
              </div>
            )}
            {fournisseurSirene?.commune && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.siege")}</dt>
                <dd>{fournisseurSirene.commune} · {fournisseurSirene.code_postal ?? ""}</dd>
              </div>
            )}
            {fournisseurSirene?.tranche_effectifs && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.effectif")}</dt>
                <dd>{fournisseurSirene.tranche_effectifs}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt><Tip label={t("fx.fiche.siret.tip")}>SIRET</Tip></dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.fournisseurSiret}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.voir")}</dt>
                <dd>
                  <Link
                    href={`/marches-publics/fournisseur/${contrat.fournisseurSiret.replace(/\s/g, "")}`}
                    style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
                    scroll={false}
                  >
                    {t("fx.fiche.contrat.fiche_fourn")}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.contrat.classification")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.categorie")}</dt>
            <dd>{trLabel(contrat.categorie, locale)}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.perimetre")}</dt>
            <dd>{contrat.perimetre}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.shared.exercice")}</dt>
            <dd>{contrat.year}</dd>
          </div>
        </dl>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.shared.sources")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.num_marche")}</dt>
            <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.numero}</dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.decp")}</dt>
            <dd>
              <a
                href={`https://www.data.gouv.fr/datasets/donnees-essentielles-de-la-commande-publique/#/_search?q=${encodeURIComponent(contrat.numero)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                {t("fx.fiche.contrat.decp_link")}
              </a>
            </dd>
          </div>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.opendata")}</dt>
            <dd>
              <a
                href="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/"
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
        <b>{t("fx.fiche.coming_soon")}</b> : {t("fx.fiche.contrat.avenir")}
      </p>
    </div>
  );
}
