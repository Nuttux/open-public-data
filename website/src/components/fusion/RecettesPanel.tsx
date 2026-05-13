/**
 * Panel "D'où vient l'argent ?" pour /france/budget. Trois cartes
 * horizontales (Sécu / État / Local) — chaque carte a une barre empilée
 * par nature de recette (cotisations, CSG, fiscalité directe, indirecte,
 * non-fiscal, transferts). Ligne "déficit / emprunt" séparée en bas.
 *
 * Voix institutionnelle stricte (mémoire feedback_editorial_political_framing).
 * Aucune projection personnelle — l'utilisateur voit déjà sa composition
 * fiscale sur Daily Bread §01.
 *
 * Données : loadRecettesApu() depuis recettes_apu.json. Tout est sourcé
 * (PLF V&M, PLFSS annexe 4, OFGL, INSEE, Cour des comptes).
 */
import Link from "next/link";

import type {
  RecetteInstitution,
  RecettesApu,
} from "@/lib/recettes-apu";
import SectionHead from "./SectionHead";

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
    const m = abs / 1e6;
    return `${sign}${m.toFixed(0)}${space}M€`;
  }
  return `${sign}${Math.round(abs).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
  )}${space}€`;
}

function fmtPct(share: number, locale: Locale): string {
  const pct = (share * 100).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
    { maximumFractionDigits: 1 },
  );
  return `${pct} %`;
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
  data: RecettesApu;
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export default function RecettesPanel({ data, locale, t }: Props) {
  const { macro, institutions, europe } = data;

  const renderCard = (
    institution: RecetteInstitution,
    color: "secu" | "etat" | "local",
  ) => {
    const label =
      locale === "en" ? institution.label_en : institution.label_fr;
    const sortedItems = [...institution.items].sort(
      (a, b) => b.annual_eur - a.annual_eur,
    );
    return (
      <div className={`fx-recettes-card fx-recettes-card-${color}`}>
        <div className="fx-recettes-card-head">
          <h3 className="fx-recettes-card-name">{label}</h3>
          <p className="fx-recettes-card-total tnum">
            {fmtBnEur(institution.annual_eur, locale)}
            <span className="fx-recettes-card-total-unit">
              /{locale === "en" ? "yr" : "an"}
            </span>
          </p>
        </div>
        <ul className="fx-recettes-card-items">
          {sortedItems.map((item) => {
            const itemLabel =
              locale === "en" ? item.label_en : item.label_fr;
            const share =
              institution.annual_eur > 0
                ? item.annual_eur / institution.annual_eur
                : 0;
            const href = `/france/budget/recettes/${encodeURIComponent(item.key)}`;
            return (
              <li key={item.key} className="fx-recettes-item">
                <Link
                  href={href}
                  scroll={false}
                  prefetch={false}
                  className="fx-recettes-item-link"
                >
                  <div className="fx-recettes-item-head">
                    <span className="fx-recettes-item-name">
                      {itemLabel}
                      <span
                        aria-hidden
                        className="fx-recettes-item-chevron"
                      >
                        →
                      </span>
                    </span>
                    <span className="fx-recettes-item-val tnum">
                      {fmtBnEur(item.annual_eur, locale)}
                      <span className="fx-recettes-item-pct">
                        {" · "}
                        {fmtPct(share, locale)}
                      </span>
                    </span>
                  </div>
                  <div className="fx-recettes-item-bar">
                    <div
                      className={`fx-recettes-item-fill fx-recettes-c-${color}`}
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                  <p className="fx-recettes-item-nature">
                    {natureLabel(item.nature, locale)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section className="fx-section" id="recettes-apu">
      <div className="fx-wrap">
        <SectionHead
          number="02"
          kind={t("budget.recettes.kicker")}
          title={t("budget.recettes.title")}
          subtitle={t("budget.recettes.subtitle", {
            total: fmtBnEur(macro.recettes_apu_md_eur * 1e9, locale),
            depenses: fmtBnEur(macro.depenses_apu_md_eur * 1e9, locale),
          })}
        />

        <div className="fx-recettes-grid">
          {renderCard(institutions.S1314, "secu")}
          {renderCard(institutions.S1311, "etat")}
          {renderCard(institutions.S1313, "local")}
        </div>

        {/* Ligne déficit / emprunt — séparée visuellement, en charbon. */}
        <div className="fx-recettes-deficit">
          <p className="fx-recettes-deficit-eyebrow">
            {t("budget.recettes.deficit.eyebrow")}
          </p>
          <div className="fx-recettes-deficit-row">
            <span className="fx-recettes-deficit-label">
              {t("budget.recettes.deficit.label")}
            </span>
            <span className="fx-recettes-deficit-val tnum">
              {fmtBnEur(macro.deficit_md_eur * 1e9, locale)}
              <span className="fx-recettes-deficit-pct">
                {" · "}
                {macro.deficit_pct_pib.toLocaleString(
                  locale === "en" ? "en-GB" : "fr-FR",
                  { maximumFractionDigits: 1 },
                )}{" "}
                % {locale === "en" ? "of GDP" : "du PIB"}
              </span>
            </span>
          </div>
          <p className="fx-recettes-deficit-explain">
            {t("budget.recettes.deficit.explain", {
              recettes: fmtBnEur(macro.recettes_apu_md_eur * 1e9, locale),
              depenses: fmtBnEur(macro.depenses_apu_md_eur * 1e9, locale),
            })}
          </p>
        </div>

        {/* Bilan UE — séparé visuellement, contribution nette. Les deux
            lignes (versé et reçu) sont cliquables pour ouvrir le drawer
            détaillé avec décomposition RNB/TVA/plastique/NGEU. */}
        <div className="fx-recettes-ue">
          <p className="fx-recettes-ue-eyebrow">
            {t("budget.recettes.ue.eyebrow")}
          </p>
          <div className="fx-recettes-ue-flow">
            <Link
              href="/france/budget/recettes/psr_ue"
              scroll={false}
              prefetch={false}
              className="fx-recettes-ue-row fx-recettes-ue-row-link"
            >
              <span className="fx-recettes-ue-label">
                {t("budget.recettes.ue.verse")}
                <span aria-hidden className="fx-recettes-ue-chevron">→</span>
              </span>
              <span className="fx-recettes-ue-val tnum">
                − {fmtBnEur(europe.psr_ue_brut_md_eur * 1e9, locale)}
                <span className="fx-recettes-ue-yr">
                  /{locale === "en" ? "yr" : "an"}
                </span>
              </span>
            </Link>
            <Link
              href="/france/budget/recettes/ue_fonds_recus"
              scroll={false}
              prefetch={false}
              className="fx-recettes-ue-row fx-recettes-ue-row-link"
            >
              <span className="fx-recettes-ue-label">
                {t("budget.recettes.ue.recus")}
                <span aria-hidden className="fx-recettes-ue-chevron">→</span>
              </span>
              <span className="fx-recettes-ue-val fx-recettes-ue-val-plus tnum">
                + {fmtBnEur(europe.fonds_recus_md_eur * 1e9, locale)}
                <span className="fx-recettes-ue-yr">
                  /{locale === "en" ? "yr" : "an"}
                </span>
              </span>
            </Link>
            <div className="fx-recettes-ue-row fx-recettes-ue-row-net">
              <span className="fx-recettes-ue-label">
                {t("budget.recettes.ue.net")}
              </span>
              <span className="fx-recettes-ue-val tnum">
                − {fmtBnEur(europe.contribution_nette_md_eur * 1e9, locale)}
                <span className="fx-recettes-ue-yr">
                  /{locale === "en" ? "yr" : "an"}
                </span>
              </span>
            </div>
          </div>
          <p className="fx-recettes-ue-explain">{europe.notes_fr}</p>
        </div>

        {/* Note méthodo */}
        <p className="fx-recettes-method-note">
          {t("budget.recettes.method_note")}
        </p>
      </div>
    </section>
  );
}
