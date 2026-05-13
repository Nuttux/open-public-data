import type { ReactNode } from "react";

import type {
  RecetteItem,
  RecetteInstitution,
  RecettesApu,
} from "@/lib/recettes-apu";

type Locale = "fr" | "en";

function fmtBnEur(amountEur: number, locale: Locale): string {
  if (!Number.isFinite(amountEur)) return "—";
  const sep = locale === "fr" ? "," : ".";
  const space = " ";
  const sign = amountEur < 0 ? "− " : "";
  const abs = Math.abs(amountEur);
  if (abs >= 1e9) {
    const md = abs / 1e9;
    const s = md.toFixed(1).replace(".", sep);
    return `${sign}${s}${space}${locale === "en" ? "bn€" : "Md€"}`;
  }
  if (abs >= 1e6) {
    return `${sign}${(abs / 1e6).toFixed(0)}${space}M€`;
  }
  return `${sign}${Math.round(abs).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
  )}${space}€`;
}

function natureLabel(nature: string, locale: Locale): string {
  const fr: Record<string, string> = {
    cotisation: "Cotisations sociales",
    csg: "CSG/CRDS",
    direct: "Fiscalité directe",
    indirect: "Fiscalité indirecte",
    non_fiscal: "Recettes non-fiscales",
    transfert: "Transferts intra-APU",
    transfert_ue: "Flux UE",
  };
  const en: Record<string, string> = {
    cotisation: "Social contributions",
    csg: "CSG/CRDS",
    direct: "Direct taxes",
    indirect: "Indirect taxes",
    non_fiscal: "Non-tax revenue",
    transfert: "Intra-APU transfers",
    transfert_ue: "EU flows",
  };
  return (locale === "en" ? en : fr)[nature] ?? nature;
}

type Props = {
  /** Item recette résolu côté server (depuis recettes_apu.json). */
  item: RecetteItem;
  /** Institution parente (S1311/S1313/S1314) — pour breadcrumb + part. */
  institution: RecetteInstitution;
  /** Décomposition spécifique UE (si applicable) — composantes brutes/reçues. */
  ueDecomposition?: {
    type: "psr_verse" | "fonds_recus";
    items: NonNullable<RecettesApu["europe"]["psr_decomposition"]>;
    totalNetMdEur: number;
    sourceUrl: string;
  } | null;
  locale: Locale;
};

/**
 * Fiche détaillée d'une recette publique — sert le drawer et le standalone
 * `/france/budget/recettes/[key]`. Affiche le montant national absolu, la
 * part dans son sous-secteur, la source officielle clickable, les notes
 * méthodologiques, et pour l'UE une décomposition (RNB/TVA/plastique/NGEU
 * versés, PAC/FEDER/Horizon/NGEU reçus).
 */
export default function RecetteFiche({
  item,
  institution,
  ueDecomposition,
  locale,
}: Props): ReactNode {
  const itemLabel = locale === "en" ? item.label_en : item.label_fr;
  const instLabel =
    locale === "en" ? institution.label_en : institution.label_fr;
  const shareOfInst =
    institution.annual_eur > 0
      ? item.annual_eur / institution.annual_eur
      : 0;

  return (
    <div className="db-fiche">
      <p className="db-fiche-kicker">
        {locale === "en" ? "Public revenue" : "Recette publique"} ·{" "}
        {instLabel}
      </p>

      <div className="db-fiche-lead">
        <p className="db-fiche-lead-name">{itemLabel}</p>
        <dl className="db-fiche-amounts">
          <div className="db-fiche-amount-row">
            <dt className="db-fiche-amount-key">
              {locale === "en" ? "National (€/yr)" : "National (€/an)"}
            </dt>
            <dd className="db-fiche-amount-val tnum">
              {fmtBnEur(item.annual_eur, locale)}
            </dd>
          </div>
          <div className="db-fiche-amount-row">
            <dt className="db-fiche-amount-key">
              {locale === "en"
                ? `Share of ${instLabel}`
                : `Part dans ${instLabel}`}
            </dt>
            <dd className="db-fiche-amount-val tnum">
              {(shareOfInst * 100).toLocaleString(
                locale === "en" ? "en-GB" : "fr-FR",
                { maximumFractionDigits: 1 },
              )}{" "}
              %
            </dd>
          </div>
          <div className="db-fiche-amount-row">
            <dt className="db-fiche-amount-key">
              {locale === "en" ? "Category" : "Nature"}
            </dt>
            <dd className="db-fiche-amount-val tnum">
              {natureLabel(item.nature, locale)}
            </dd>
          </div>
        </dl>
      </div>

      {item.notes && (
        <div className="db-fiche-section">
          <p className="db-fiche-section-head">
            {locale === "en"
              ? "Methodology notes"
              : "Notes méthodologiques"}
          </p>
          <p className="db-fiche-source">{item.notes}</p>
        </div>
      )}

      {ueDecomposition && ueDecomposition.items && (
        <div className="db-fiche-section">
          <p className="db-fiche-section-head">
            {ueDecomposition.type === "psr_verse"
              ? locale === "en"
                ? "Composition of the gross contribution"
                : "Composition de la contribution brute"
              : locale === "en"
                ? "Composition of EU funds received"
                : "Composition des fonds européens reçus"}
          </p>
          <ul className="db-fiche-agg-grid db-fiche-children-annual-only">
            {ueDecomposition.items.map((sub) => {
              const subLabel =
                locale === "en" ? sub.label_en : sub.label_fr;
              return (
                <li key={sub.key}>
                  <div
                    className="db-fiche-agg-card"
                    style={{ cursor: "default" }}
                  >
                    <span className="db-fiche-agg-card-annual tnum">
                      {sub.annual_eur_md.toLocaleString(
                        locale === "en" ? "en-GB" : "fr-FR",
                        { maximumFractionDigits: 1 },
                      )}{" "}
                      {locale === "en" ? "bn€" : "Md€"}
                    </span>
                    <span className="db-fiche-agg-card-name">{subLabel}</span>
                    {sub.notes && (
                      <span
                        className="db-fiche-agg-card-monthly"
                        style={{ fontSize: 11, lineHeight: 1.5 }}
                      >
                        {sub.notes}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p
            className="db-fiche-source"
            style={{
              marginTop: 16,
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            {ueDecomposition.type === "psr_verse"
              ? locale === "en"
                ? `Net French contribution to EU: ~ ${ueDecomposition.totalNetMdEur} bn€/year after deducting funds received.`
                : `Contribution nette France à l'UE : ~ ${ueDecomposition.totalNetMdEur} Md€/an après déduction des fonds reçus.`
              : locale === "en"
                ? "EU funds received are not paid to the central State budget but to direct beneficiaries (farmers, regions, researchers, etc.)."
                : "Les fonds européens reçus ne reviennent pas au budget de l'État central, mais à des bénéficiaires directs (agriculteurs, régions, chercheurs, etc.)."}
          </p>
        </div>
      )}

      <div className="db-fiche-section">
        <p className="db-fiche-section-head">
          {locale === "en" ? "Official source" : "Source officielle"}
        </p>
        <p className="db-fiche-source">
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="db-fiche-source-link"
          >
            {item.source} ↗
          </a>
        </p>
      </div>
    </div>
  );
}
