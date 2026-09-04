"use client";

import Link from "next/link";
import type { ArrondissementLogementData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, fmtDec, fmtInt, sufOrdinal } from "@/lib/fmt";
import { useCity } from "./CityContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Hero, V3Row, V3Section } from "@/components/fiche/v3";

/**
 * Fiche arrondissement · logement social v3 (2026-09-03) — UN chiffre (les
 * logements financés dans l'année) avec opérations, part et rang en ligne
 * grise, « Les opérations » en rangées (adresse, bailleur · nature, logements)
 * et « Par bailleur » en barres. Plus de bandeau KPI à quatre cellules.
 */
export default function ArrondissementLogementFiche({
  data,
  topN = 6,
}: {
  data: ArrondissementLogementData;
  topN?: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const shown = data.projects.slice(0, topN);
  const remaining = data.projects.length - shown.length;

  return (
    <div className="fx-v3">
      <V3Hero
        v={fmtInt(data.totalLogements)}
        caption={fill(t("fx.arr_log.hero_cap"), { year: data.year })}
        meta={fill(t(data.nbOperations === 1 ? "fx.arr_log.meta1" : "fx.arr_log.meta"), { n: data.nbOperations, share: Math.round(data.shareCity), rank: `${data.rank}${sufOrdinal(data.rank, locale)}` })}
      />

      <V3Section title={fill(t("fx.arr_log.h.ops"), { year: data.year })}>
        {shown.map((p) => (
          <V3Row key={p.id} label={p.adresse} subText={`${p.bailleur} · ${p.natureProgramme}`}
            amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtInt(p.nbLogements)}<span className="u">{t(p.nbLogements === 1 ? "fx.arr_log.unit_one" : "fx.arr_log.unit")}</span></span>} />
        ))}
        {remaining > 0 && (
          <p className="fx-v3-sentence"><Link href={`${basePath}/logement/arrondissement/${data.slug}`} scroll={false}>{fill(t("fx.arr_log.see_all"), { n: remaining })}</Link></p>
        )}
      </V3Section>

      {data.byBailleur.length > 1 && (
        <V3Section title={t("fx.arr_log.bailleurs.head")}>
          <FicheBreakdown
            rows={data.byBailleur.map((b) => ({
              key: b.name, label: b.name, value: b.nbLogements,
              meta: `${b.nbOperations} ${b.nbOperations > 1 ? t("fx.arr_log.ops_plural") : t("fx.arr_log.ops_singular")} · ${fmtDec(data.totalLogements > 0 ? (b.nbLogements / data.totalLogements) * 100 : 0, 0)} %`,
            }))}
            format={(n) => `${fmtInt(n)} ${t(n === 1 ? "fx.arr_log.unit_one" : "fx.arr_log.unit")}`}
            cap={10}
          />
        </V3Section>
      )}
    </div>
  );
}
