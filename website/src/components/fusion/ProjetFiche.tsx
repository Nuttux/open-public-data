"use client";

import Link from "next/link";
import type { ProjetFiche as ProjetFicheType, ProjetPhotoResolved } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const TYPOLOGIE_LABELS_FR: Record<string, string> = {
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

const TYPOLOGIE_LABELS_EN: Record<string, string> = {
  ecole: "School",
  college: "Secondary school",
  lycee: "High school",
  creche: "Nursery",
  gymnase: "Gym",
  piscine: "Swimming pool",
  bibliotheque: "Library",
  "espace-vert": "Green space",
  voirie: "Roads",
  "logement-social": "Social housing",
  "equipement-culturel": "Cultural facility",
  "equipement-sante": "Health facility",
  administration: "Administration",
  autre: "Other",
};

export default function ProjetFiche({ projet, photo }: { projet: ProjetFicheType; photo?: ProjetPhotoResolved }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const TYPOLOGIE_LABELS = locale === "en" ? TYPOLOGIE_LABELS_EN : TYPOLOGIE_LABELS_FR;
  const suf = (n: number) => (locale === "en" ? (n === 1 ? "st" : "th") : n === 1 ? "er" : "ᵉ");

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

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
      {/* Vignette projet */}
      <div className="fx-fiche-thumb-wrap">
        <ProjetThumb
          photo={photo?.photo}
          generic={photo?.generic}
          typologie={photo?.typologie ?? vulg?.typologie_normalisee ?? null}
          aspectRatio="16 / 9"
          fallbackLabel={projet.name}
          className="fx-fiche-thumb"
        />
      </div>

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
            {trLabel(projet.typeAp, locale)}
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
            title={t("fx.fiche.projet.fiabilite_title")}
          >
            {fill(t("fx.fiche.projet.fiabilite"), { n: (projet.confidence * 100).toFixed(0) })}
          </span>
        )}
      </div>

      {/* Bloc vulgarisation LLM — EN sibling fields populated when vulgarization_projets_en.json is present */}
      {vulg && (vulg.description_claire || vulg.quoi_concretement) && (() => {
        const descClair = locale === "en" && vulg.description_claire_en ? vulg.description_claire_en : vulg.description_claire;
        const quoi = locale === "en" && vulg.quoi_concretement_en ? vulg.quoi_concretement_en : vulg.quoi_concretement;
        const pourquoi = locale === "en" && vulg.pourquoi_ca_compte_en ? vulg.pourquoi_ca_compte_en : vulg.pourquoi_ca_compte;
        return (
          <div className="fx-fiche-lead">
            {descClair && <p className="fx-fiche-lead-main">{descClair}</p>}
            {quoi && <p className="fx-fiche-lead-sub">{quoi}</p>}
            {pourquoi && <p className="fx-fiche-lead-impact">→ {pourquoi}</p>}
          </div>
        );
      })()}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.projet.montant_vote")}</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.shared.exercice")}</div>
          <div className="fx-fiche-kpi-value tnum">{projet.year}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.shared.arrondissement")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 20 }}>
            {projet.arrondissement > 0 ? `${projet.arrondissement}${suf(projet.arrondissement)}` : t("fx.fiche.projet.transverse")}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.shared.chapitre")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 14, lineHeight: 1.2 }}>
            {trLabel(projet.chapitre, locale)}
          </div>
        </div>
      </div>

      <div className="fx-fiche-note" style={{ marginTop: 0 }}>
        {t("fx.fiche.projet.note_surcout")}
      </div>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.projet.intitule")}</div>
        <p style={{ fontFamily: "var(--f-ui)", fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
          {projet.name}
        </p>
      </section>

      {(projet.geoLabel || mapUrl) && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.fiche.projet.localisation")}</div>
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
              {t("fx.fiche.projet.voir_osm")}
            </a>
          )}
        </section>
      )}

      {projet.marches.length === 0 && projet.marchesCoverage.total > 0 && (
        <section className="fx-fiche-section">
          <div
            style={{
              padding: "16px 18px",
              border: "1px solid var(--rule)",
              background: "rgba(166, 118, 56, 0.04)",
              borderLeft: "3px solid var(--ocre)",
              fontFamily: "var(--f-ui)",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--ink-2)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "var(--ocre)",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {t("fx.fiche.projet.entreprises_empty_title")}
            </div>
            <p style={{ margin: 0 }}>
              {fill(t("fx.fiche.projet.entreprises_empty_body"), {
                pct: projet.marchesCoverage.pct.toFixed(0),
                matched: new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR").format(projet.marchesCoverage.matched),
                total: new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR").format(projet.marchesCoverage.total),
                minYear: projet.marchesCoverage.scopeYears[0],
                maxYear: projet.marchesCoverage.scopeYears[1],
              })}
            </p>
          </div>
        </section>
      )}

      {projet.marches.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            {t("fx.fiche.projet.entreprises")}
            <span
              style={{
                fontSize: 10.5,
                fontFamily: "var(--f-mono)",
                color: "var(--muted)",
                marginLeft: 10,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
              title={t("fx.fiche.projet.entreprises_auto_title")}
            >
              {t("fx.fiche.projet.entreprises_auto")}
            </span>
          </div>

          <p
            style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: t("fx.fiche.projet.entreprises_intro") }}
          />

          <div>
            {projet.marches.map((m) => {
              const f = fmtEur(m.montant_max);
              const confidence = m.label === "confirmed" ? t("fx.fiche.projet.confidence.confirmed") : t("fx.fiche.projet.confidence.probable");
              const badgeColor = m.label === "confirmed" ? "var(--vert)" : "var(--ocre)";
              return (
                <Link
                  key={m.numero_marche}
                  href={`/ville/paris/marches/contrat/${encodeURIComponent(m.numero_marche)}`}
                  scroll={false}
                  className="fx-row-link"
                  style={{
                    display: "block",
                    padding: "12px 6px",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>
                      {m.fournisseur_nom || t("fx.fiche.projet.fournisseur_unknown")}
                    </span>
                    <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                      {f.v}
                      <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}> {f.u}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, marginBottom: 4 }}>
                    {m.objet.length > 120 ? m.objet.slice(0, 120) + "…" : m.objet}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10.5, fontFamily: "var(--f-mono)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <span style={{ color: badgeColor, fontWeight: 600 }}>
                      {confidence}
                    </span>
                    {m.annee && <span>· {m.annee}</span>}
                    {m.ccag && <span>· {m.ccag}</span>}
                    {m.cpv_famille && <span>· {m.cpv_famille}</span>}
                    {m.lieu_execution && <span>· {m.lieu_execution}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {projet.similaires.length > 0 && typoLabel && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{fill(t("fx.fiche.projet.similaires"), { typo: typoLabel.toLowerCase(), year: projet.year })}</div>
          <div>
            {projet.similaires.map((s) => {
              const f = fmtEur(s.montant);
              return (
                <Link
                  key={s.id}
                  href={`/ville/paris/investissements/projet/${encodeURIComponent(s.id)}`}
                  scroll={false}
                  className="fx-row-link"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "10px 6px",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {locale === "en" && s.name_en ? s.name_en : s.name}
                    {s.arrondissement > 0 && (
                      <span className="muted" style={{ marginLeft: 8, fontSize: 11, fontFamily: "var(--f-mono)" }}>
                        {s.arrondissement}{suf(s.arrondissement)}
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {f.v} <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}>{f.u}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.shared.source")}</div>
        <dl>
          {projet.sourcePdf && (
            <div className="fx-fiche-prop">
              <dt>{fill(t("fx.fiche.projet.annexe"), { year: projet.year })}</dt>
              <dd>
                <a
                  href={projet.sourcePdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {t("fx.fiche.projet.pdf_source")}{projet.sourcePage ? ` ${fill(t("fx.fiche.projet.pdf_page"), { n: projet.sourcePage })}` : ""} ↗
                </a>
              </dd>
            </div>
          )}
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.projet.id_interne")}</dt>
            <dd style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{projet.id}</dd>
          </div>
          {projet.confidence != null && (
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.projet.fiabilite_ext")}</dt>
              <dd style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                {(projet.confidence * 100).toFixed(0)} %
                {projet.confidence < 0.7 && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {t("fx.fiche.projet.verif")}
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
