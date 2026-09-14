"use client";

import type { ChapitreFiche as ChapitreFicheType } from "@/lib/fusion-data";
import { useCity } from "./CityContext";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { V3Amt, V3Foot, V3Hero, V3Row, V3Section } from "@/components/fiche/v3";
import AnneesRail, { RAIL_MIN } from "./AnneesRail";

/**
 * Fiche chapitre d'investissement v3 (2026-09-03) — UN chiffre (le montant
 * de l'exercice) avec la part du budget et le rang en ligne grise, puis
 * « Par arrondissement » et « Les plus gros projets » en rangées qui ouvrent
 * l'arrondissement ou le projet. Plus de cellule « Projets répertoriés : 0 »
 * ni d'encadré d'alerte : quand la source ne détaille pas ce chapitre, une
 * phrase le dit.
 */
export default function ChapitreFiche({ chap }: { chap: ChapitreFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const fmtEur = useFmtEur();
  const decimal = locale === "en" ? "." : ",";
  const { v, u } = fmtEur(chap.total);
  const hasProjets = chap.nbProjets > 0;
  const cov = fmtEur(chap.coverage.amount);

  return (
    <div className="fx-v3">
      <V3Hero
        v={v} u={u}
        caption={fill(t("fx.fiche.chap.hero_cap"), { year: chap.year })}
        meta={fill(t("fx.fiche.chap.meta"), { share: Math.round(chap.share), rank: `${chap.rank}${sufOrdinal(chap.rank, locale)}`, n: chap.nbChapitres })}
      />

      {chap.series.length >= RAIL_MIN && (
        <V3Section title={t("fx.fiche.chap.h.annees")}>
          <AnneesRail rows={chap.series} />
        </V3Section>
      )}

      {hasProjets && chap.topArrondissements.length > 0 && (
        <V3Section title={t("fx.fiche.chap.h.arr")}>
          {chap.topArrondissements.map((a) => (
            <V3Row key={a.arr} href={`${basePath}/investissements/arrondissement/${a.arr}`}
              label={`${a.arr}${sufOrdinal(a.arr, locale)} ${t("fx.fiche.projet.meta_arr")}`}
              sub={`${a.count} ${a.count > 1 ? t("fx.fiche.chap.projet_p") : t("fx.fiche.chap.projet_s")}`}
              amount={<V3Amt {...fmtEur(a.amount)} />} />
          ))}
        </V3Section>
      )}

      {hasProjets ? (
        <V3Section
          title={t("fx.fiche.chap.h.projets")}
          sub={fill(t("fx.fiche.chap.projets_sub"), { n: chap.nbProjets, pct: chap.coverage.pct.toFixed(chap.coverage.pct < 10 ? 1 : 0).replace(".", decimal), amount: `${cov.v} ${cov.u}`, source: chap.coverage.sourceLabel })}
        >
          {chap.topProjets.map((p) => (
            <V3Row key={p.id} href={`${basePath}/investissements/projet/${encodeURIComponent(p.id)}`}
              label={p.name}
              sub={p.arr > 0 ? `${p.arr}${sufOrdinal(p.arr, locale)}` : t("fx.fiche.chap.transverse")}
              amount={<V3Amt {...fmtEur(p.amount)} />} />
          ))}
        </V3Section>
      ) : (
        <V3Section title={t("fx.fiche.chap.h.projets")}>
          <p className="fx-v3-sentence" style={{ color: "var(--muted)" }}>{fill(t("fx.fiche.chap.no_projets_body"), { year: chap.year })}</p>
          {chap.fallback && (
            <>
              <p className="fx-v3-sentence">{fill(t("fx.fiche.chap.fallback"), { year: chap.fallback.year })}</p>
              {chap.fallback.projets.map((p) => (
                <V3Row key={p.id} href={`${basePath}/investissements/projet/${encodeURIComponent(p.id)}`}
                  label={p.name}
                  sub={p.arr > 0 ? `${p.arr}${sufOrdinal(p.arr, locale)}` : t("fx.fiche.chap.transverse")}
                  amount={<V3Amt {...fmtEur(p.amount)} />} />
              ))}
            </>
          )}
        </V3Section>
      )}

      <V3Foot>
        {fill(t("fx.fiche.chap.source_note"), { year: chap.year })}{" "}
        <a
          href={`https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/table/?refine.exercice_comptable=${chap.year}&refine.section_budgetaire_i_f=Investissement&refine.sens_depense_recette=D%C3%A9penses`}
          target="_blank" rel="noopener noreferrer"
        >
          {t("fx.fiche.chap.source_link")}
        </a>
      </V3Foot>
    </div>
  );
}
