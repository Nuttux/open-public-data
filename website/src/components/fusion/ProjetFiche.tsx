"use client";

import type { ProjetFiche as ProjetFicheType } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
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

export default function ProjetFiche({ projet }: { projet: ProjetFicheType }) {
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
          projetId={projet.id}
          aspectRatio="16 / 9"
          fallbackLabel={projet.name}
          typologieOverride={vulg?.typologie_normalisee}
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
            title={t("fx.fiche.projet.fiabilite_title")}
          >
            {fill(t("fx.fiche.projet.fiabilite"), { n: (projet.confidence * 100).toFixed(0) })}
          </span>
        )}
      </div>

      {/* Bloc vulgarisation LLM */}
      {vulg && (vulg.description_claire || vulg.quoi_concretement) && (
        <div className="fx-fiche-lead">
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

      {projet.similaires.length > 0 && typoLabel && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{fill(t("fx.fiche.projet.similaires"), { typo: typoLabel.toLowerCase(), year: projet.year })}</div>
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
