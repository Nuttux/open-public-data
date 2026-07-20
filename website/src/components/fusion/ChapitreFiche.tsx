"use client";

import Link from "next/link";
import type { ChapitreFiche as ChapitreFicheType } from "@/lib/fusion-data";
import { useCity } from "./CityContext";
import CoverageWarnBox from "./CoverageWarnBox";
import TopProjetsGrid from "./TopProjetsGrid";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";

export default function ChapitreFiche({ chap }: { chap: ChapitreFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const fmtEur = useFmtEur();

  const { v, u } = fmtEur(chap.total);
  const decimal = locale === "en" ? "." : ",";
  const coverageAmount = fmtEur(chap.coverage.amount);
  const hasProjets = chap.nbProjets > 0;
  const coverageLine = fill(t("fx.fiche.chap.coverage"), {
    pct: chap.coverage.pct.toFixed(chap.coverage.pct < 10 ? 1 : 0).replace(".", decimal),
    amount: `${coverageAmount.v} ${coverageAmount.u}`,
  });

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{fill(t("fx.fiche.chap.montant"), { year: chap.year })}</div>
          <div className="fx-fiche-kpi-value tnum">
            {v}
            <span className="u">{u}</span>
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.chap.part")}</div>
          <div className="fx-fiche-kpi-value tnum">{chap.share.toFixed(1).replace(".", decimal)} <span className="u">%</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.chap.rang")}</div>
          <div className="fx-fiche-kpi-value tnum">#{chap.rank} <span className="u" style={{ fontSize: 14 }}>/ {chap.nbChapitres}</span></div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.chap.projets")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 28 }}>
            {chap.nbProjets}
          </div>
        </div>
      </div>

      {hasProjets && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 18,
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            letterSpacing: 0.3,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          {coverageLine}
          <span style={{ marginLeft: 6, opacity: 0.75 }}>
            · {fill(t("fx.fiche.chap.coverage_source"), { source: chap.coverage.sourceLabel })}
          </span>
        </div>
      )}

      {!hasProjets && (
        <CoverageWarnBox title={t("fx.fiche.chap.no_projets_title")}>
          {fill(t("fx.fiche.chap.no_projets_body"), { year: chap.year })}
        </CoverageWarnBox>
      )}

      {hasProjets && chap.topArrondissements.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{fill(t("fx.fiche.chap.top_arr"), { label: chap.label.toLowerCase() })}</div>
          <div>
            {chap.topArrondissements.map((a) => {
              const f = fmtEur(a.amount);
              return (
                <Link
                  key={a.arr}
                  href={`${basePath}/investissements/arrondissement/${a.arr}`}
                  scroll={false}
                  className="fx-row-link"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "baseline",
                    gap: 14,
                    padding: "10px 6px",
                    borderBottom: "1px solid var(--rule)",
                    fontFamily: "var(--f-ui)",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ocre)", minWidth: 32 }}>
                    {a.arr}{sufOrdinal(a.arr, locale)}
                  </span>
                  <span className="muted" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                    {a.count} {a.count > 1 ? t("fx.fiche.chap.projet_p") : t("fx.fiche.chap.projet_s")}
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

      {hasProjets && (
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.fiche.chap.top_proj"), { label: chap.label.toLowerCase() })}</div>
        <TopProjetsGrid
          items={chap.topProjets}
          href={(p) => `${basePath}/investissements/projet/${encodeURIComponent(p.id)}`}
          detail={(p) =>
            p.arr > 0 ? `${p.arr}${sufOrdinal(p.arr, locale)} arr.` : t("fx.fiche.chap.transverse")
          }
        />
      </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.shared.source")}</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          {fill(t("fx.fiche.chap.source_note"), { year: chap.year })}{" "}
          <a
            /* Le libellé chapitre de la fiche est un renommage éditorial : on ne
             * peut pas refine dessus. On pointe les lignes M57 dépenses
             * d'investissement de l'exercice (jamais vide, périmètre exact). */
            href={`https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/table/?refine.exercice_comptable=${chap.year}&refine.section_budgetaire_i_f=Investissement&refine.sens_depense_recette=D%C3%A9penses`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {t("fx.fiche.chap.source_link")}
          </a>
        </p>
      </section>
    </div>
  );
}
