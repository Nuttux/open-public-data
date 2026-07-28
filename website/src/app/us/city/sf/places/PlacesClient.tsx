"use client";

import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import EmptyState from "@/components/fusion/EmptyState";
import SfPlacesExplorer from "@/components/us/SfPlacesExplorer";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact } from "@/lib/us/format";
import type { SfPlaceIndexEntry } from "@/lib/us/sf-places-data";

/**
 * /us/city/sf/places — client shell. Was a server page with hardcoded
 * English strings; now on the same `us.sf.*` key convention as the rest of
 * the SF surface (EN and FR values are identical English, ADR-0010 D3), and
 * it closes with the shared sources footer like every other city page.
 */

const nfInt = new Intl.NumberFormat("en-US");

export default function PlacesClient({
  places,
  totalDocs,
  totalFunds,
  nDepts,
}: {
  places: SfPlaceIndexEntry[];
  totalDocs: number;
  totalFunds: number;
  nDepts: number;
}) {
  const t = useT();

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageIntro
        title={
          <>
            {t("us.sf.places.title.before")}
            <em>{t("us.sf.places.title.em")}</em>
          </>
        }
        lede={t("us.sf.places.lede")}
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={totalFunds} format={(n) => fmtUsdCompact(n)} />}
              label={t("us.sf.places.stat.funds")}
            />
            <IntroStat
              value={<AnimatedNumber value={places.length} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.places.stat.places")}
            />
            <IntroStat
              value={<AnimatedNumber value={totalDocs} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.places.stat.documents")}
            />
            <IntroStat
              value={<AnimatedNumber value={nDepts} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.places.stat.departments")}
            />
          </>
        }
      />

      <section className="fx-section" id="sec-places">
        <div className="fx-wrap">
          {places.length > 0 ? (
            <SfPlacesExplorer places={places} />
          ) : (
            <EmptyState
              label={t("us.sf.places.empty.label")}
              title={t("us.sf.places.empty.title")}
              body={t("us.sf.places.empty.body")}
            />
          )}
        </div>
      </section>

      <SfSourceFooter
        perimeter={t("us.sf.places.footer.perimeter")}
        coverage={t("us.sf.places.footer.coverage")}
        source={{
          name: "Internet Archive · SF open data",
          href: "https://archive.org/details/sanfranciscopubliclibrary",
        }}
        exports={[{ label: "index.json", href: "/data/us/sf/places/index.json" }]}
      />
    </main>
  );
}
