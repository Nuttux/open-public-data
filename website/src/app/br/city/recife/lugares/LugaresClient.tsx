"use client";

import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { useT } from "@/lib/localeContext";
import RecifePlacesExplorer from "@/components/br/RecifePlacesExplorer";
import type { PlaceIndexEntry, PlacesSource } from "@/lib/br/recife-places-data";
import { fmtInt } from "@/lib/br/format";

export default function LugaresClient({
  places, locale, count, familias, source, perimeter,
}: {
  places: PlaceIndexEntry[];
  locale: "pt" | "en";
  count: number;
  familias: { familia: string; n: number }[];
  source: PlacesSource;
  perimeter: string;
}) {
  const t = useT();
  const saude = familias.find((f) => f.familia === "Saúde")?.n ?? 0;
  const educ = familias.find((f) => f.familia === "Educação")?.n ?? 0;
  const pracas = familias.find((f) => f.familia === "Praças")?.n ?? 0;

  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        kicker={t("br.recife.lugares.kicker")}
        title={<>{t("br.recife.lugares.title")}</>}
        lede={t("br.recife.lugares.subtitle")}
        stats={
          <>
            <IntroStat value={fmtInt(count)} label={t("br.recife.lugares.stat_total")} />
            <IntroStat value={fmtInt(saude)} label={t("br.recife.lugares.stat_saude")} />
            <IntroStat value={fmtInt(educ)} label={t("br.recife.lugares.stat_educacao")} />
            <IntroStat value={fmtInt(pracas)} label={t("br.recife.lugares.stat_pracas")} />
          </>
        }
      />

      <RecifePlacesExplorer places={places} locale={locale} />

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
