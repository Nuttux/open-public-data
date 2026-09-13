"use client";

import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { useT } from "@/lib/localeContext";
import RecifePlacesExplorer from "@/components/br/RecifePlacesExplorer";
import type { PlaceIndexEntry, PlacesSource } from "@/lib/br/recife-places-data";
import { fmtInt, fmtBrlCompactNum, brlMagnitude } from "@/lib/br/format";

export default function LugaresClient({
  places, locale, count, source, perimeter,
}: {
  places: PlaceIndexEntry[];
  locale: "pt" | "en";
  count: number;
  familias: { familia: string; n: number }[];
  source: PlacesSource;
  perimeter: string;
}) {
  const t = useT();
  // Total identified spending across the featured places — the money stat that
  // mirrors Paris's "M€ d'argent public identifié" (no family breakdown).
  const totalObras = places.reduce((s, p) => s + (p.obras_total ?? 0), 0);

  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        kicker={t("br.recife.lugares.kicker")}
        title={<>{t("br.recife.lugares.title")}</>}
        lede={t("br.recife.lugares.subtitle")}
        stats={
          <>
            <IntroStat value={fmtInt(count)} label={t("br.recife.lugares.stat_total")} />
            <IntroStat
              value={fmtBrlCompactNum(totalObras)}
              unit={brlMagnitude(totalObras)}
              label={t("br.recife.lugares.stat_identificado")}
            />
          </>
        }
      />

      <section className="fx-section">
        <div className="fx-wrap">
          <RecifePlacesExplorer places={places} locale={locale} />
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <p className="fx-footer-sources-meta">
            {perimeter} <b>{t("br.recife.source")}</b>:{" "}
            <a href={source.source_url ?? "#"} target="_blank" rel="noopener noreferrer">{source.name ?? t("br.recife.portal")}</a>
          </p>
        </div>
      </section>
    </main>
  );
}
