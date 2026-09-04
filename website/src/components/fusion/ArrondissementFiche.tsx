"use client";

import type { ArrondissementFiche as ArrondissementFicheType } from "@/lib/fusion-data";
import { useCity } from "./CityContext";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { FicheBreakdown } from "@/components/fiche";
import { V3Amt, V3Hero, V3Row, V3Section } from "@/components/fiche/v3";

/**
 * Fiche arrondissement · investissements v3 (2026-09-03) — UN chiffre (l'investi
 * géolocalisé dans l'arrondissement cette année-là) avec part, rang et
 * projets en ligne grise, « Les plus gros projets » en rangées qui ouvrent
 * le projet, « Par chapitre » en barres. Plus de bandeau KPI ni de grille.
 */
export default function ArrondissementFiche({ arr }: { arr: ArrondissementFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const fmtEur = useFmtEur();
  const { v, u } = fmtEur(arr.total);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };

  return (
    <div className="fx-v3">
      <V3Hero
        v={v} u={u}
        caption={fill(t("fx.fiche.arr.hero_cap"), { year: arr.year })}
        meta={fill(t("fx.fiche.arr.meta"), { share: Math.round(arr.totalShare), rank: `${arr.rank}${sufOrdinal(arr.rank, locale)}`, n: arr.nbProjets, geo: arr.nbGeo })}
      />

      {arr.topProjets.length > 0 && (
        <V3Section title={fill(t("fx.fiche.arr.h.projets"), { year: arr.year })}>
          {arr.topProjets.map((p) => (
            <V3Row key={p.id} href={`${basePath}/investissements/projet/${encodeURIComponent(p.id)}`} label={p.name} sub={trLabel(p.chapitre, locale)} amount={<V3Amt {...fmtEur(p.amount)} />} />
          ))}
        </V3Section>
      )}

      {arr.byChapitre.length > 1 && (
        <V3Section title={t("fx.fiche.arr.h.chapitres")}>
          <FicheBreakdown
            cap={arr.byChapitre.length}
            rows={arr.byChapitre.map((c) => ({
              key: c.label, label: trLabel(c.label, locale), value: c.amount,
              meta: `${c.count} ${c.count > 1 ? t("fx.fiche.arr.projet_p") : t("fx.fiche.arr.projet_s")} · ${arr.total > 0 ? ((c.amount / arr.total) * 100).toFixed(0) : 0} %`,
            }))}
            format={eurTxt}
          />
        </V3Section>
      )}
    </div>
  );
}
