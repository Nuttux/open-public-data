"use client";

/**
 * /us/city/sf/the-city — the client shell.
 *
 * Same shape as every other page in this section: `PageIntro` + stats, the
 * killer view first, then the sections that explain it, then the shared
 * `SfSourceFooter`. The map is the first section because the map IS the page —
 * everything under it is the answer to "where did that come from".
 *
 * EN-only (ADR-0010 D3): copy flows through `us.sf.thecity.*` keys whose EN and
 * FR values are identical English, like the rest of the SF surface.
 */

import dynamic from "next/dynamic";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import SectionHead from "@/components/fusion/SectionHead";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { useT } from "@/lib/localeContext";

const CityMap = dynamic(() => import("@/components/us/city/CityMap"), {
  ssr: false,
  loading: () => (
    <div className="fx-city-stage" style={{ height: 660 }}>
      <div className="fx-city-overlay" role="status">
        <p className="fx-fiche-note">Preparing the map…</p>
      </div>
    </div>
  ),
});

const nfInt = new Intl.NumberFormat("en-US");

export interface TheCityPageData {
  buildings: number;
  solos: number;
  blocks: number;
  streets: number;
  baseChunks: number;
  baseGzip: number;
  manifestBytes: number;
  manifestGzip: number;
  sidecarGzip: number;
  firstPaintGzip: number;
  wholeRecordChunks: number;
  wholeRecordBytes: number;
  tiers: { tier: string; chunks: number; gzipBytes: number; minZ: number }[];
  decisions: number;
  unplaced: number;
  volumes: number;
  precisionCounts: Record<string, number>;
  clickableBlocks: number;
  streetOnlyBlocks: number;
  emptyBlocks: number;
  accuracy: {
    n: number;
    exact: number;
    within_one_block_face: number;
    within_250m: number;
    over_600m: number;
    street_tier_note: string;
  };
  sources: {
    key: string;
    dataset: string | null;
    publisher: string | null;
    what: string | null;
    url: string | null;
  }[];
}

const kb = (b: number): string => `${Math.round(b / 1024)} KB`;
const mb = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;

const TIER_WHEN: Record<string, string> = {
  base: "the first paint",
  bldg: "when the median building reaches 1.6 px",
  canopy: "with the buildings",
  strt: "when a street surface is wider than its own centreline",
  tree: "with the street surfaces",
  water1: "when the refined bathymetry resolves above 2 px",
  face: "when a wall is worth openings",
};

export default function TheCityClient({ data }: { data: TheCityPageData }) {
  const t = useT();

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageIntro
        title={
          <>
            {t("us.sf.thecity.title.before")}
            <em>{t("us.sf.thecity.title.em")}</em>
          </>
        }
        lede={t("us.sf.thecity.lede")}
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={data.buildings} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.thecity.stat.buildings")}
            />
            <IntroStat
              value={<AnimatedNumber value={data.blocks} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.thecity.stat.blocks")}
            />
            <IntroStat
              value={<AnimatedNumber value={data.decisions} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.thecity.stat.decisions")}
            />
            <IntroStat
              value={<AnimatedNumber value={data.streets} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.thecity.stat.streets")}
            />
          </>
        }
      />

      {/* ── the map, first, because the map is the page ── */}
      <section className="fx-section" id="sec-map">
        <div className="fx-wrap">
          <CityMap height={680} />
        </div>
      </section>

      {/* ── what a click gets you, and how precisely ── */}
      <section className="fx-section" id="sec-record">
        <div className="fx-wrap">
          <SectionHead
            title={t("us.sf.thecity.record.title")}
            subtitle={t("us.sf.thecity.record.lede")}
          />

          <dl className="fx-city-grid">
            <Fact
              k={t("us.sf.thecity.record.clickable")}
              v={`${nfInt.format(data.clickableBlocks)} of ${nfInt.format(data.blocks)}`}
              note={t("us.sf.thecity.record.clickable_note")}
            />
            <Fact
              k={t("us.sf.thecity.record.street_only")}
              v={nfInt.format(data.streetOnlyBlocks)}
              note={t("us.sf.thecity.record.street_only_note")}
            />
            <Fact
              k={t("us.sf.thecity.record.empty")}
              v={nfInt.format(data.emptyBlocks)}
              note={t("us.sf.thecity.record.empty_note")}
            />
            <Fact
              k={t("us.sf.thecity.record.volumes")}
              v={nfInt.format(data.volumes)}
              note={t("us.sf.thecity.record.volumes_note")}
            />
          </dl>

          <h3 className="fx-city-h3">{t("us.sf.thecity.precision.title")}</h3>
          <p className="fx-note">{t("us.sf.thecity.precision.lede")}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="fx-table fx-table-cards">
              <thead>
                <tr>
                  <th scope="col">{t("us.sf.thecity.precision.col_tier")}</th>
                  <th scope="col" className="num">
                    {t("us.sf.thecity.precision.col_n")}
                  </th>
                  <th scope="col">{t("us.sf.thecity.precision.col_means")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["stated", "the record names this assessor block in its own text"],
                  ["addr", "a house number in the text falls inside this block's parcel address range"],
                  ["segment", "“between Y and Z” — blocks on that stretch"],
                  ["corner", "two streets in one item; blocks fronting both"],
                  ["street", "only a street name — every block fronting it, and NOT a claim about any one of them"],
                ].map(([k, means]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className="num tnum">
                      {nfInt.format(data.precisionCounts[k] ?? 0)}
                    </td>
                    <td>{means}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fx-fiche-note">
            {t("us.sf.thecity.precision.accuracy")
              .replace("{exact}", data.accuracy.exact.toFixed(1))
              .replace("{face}", data.accuracy.within_one_block_face.toFixed(1))
              .replace("{far}", data.accuracy.over_600m.toFixed(1))
              .replace("{n}", nfInt.format(data.accuracy.n))}{" "}
            {data.accuracy.street_tier_note}
          </p>
          <p className="fx-fiche-note">
            {t("us.sf.thecity.record.unplaced").replace(
              "{n}",
              nfInt.format(data.unplaced),
            )}
          </p>
        </div>
      </section>

      {/* ── what it costs to look ── */}
      <section className="fx-section" id="sec-bytes">
        <div className="fx-wrap">
          <SectionHead
            title={t("us.sf.thecity.bytes.title")}
            subtitle={t("us.sf.thecity.bytes.lede")
              .replace("{first}", kb(data.firstPaintGzip))
              .replace("{whole}", mb(data.wholeRecordBytes))
              .replace("{chunks}", nfInt.format(data.wholeRecordChunks))}
          />
          <div style={{ overflowX: "auto" }}>
            <table className="fx-table fx-table-cards">
              <thead>
                <tr>
                  <th scope="col">{t("us.sf.thecity.bytes.col_tier")}</th>
                  <th scope="col" className="num">
                    {t("us.sf.thecity.bytes.col_chunks")}
                  </th>
                  <th scope="col" className="num">
                    {t("us.sf.thecity.bytes.col_gzip")}
                  </th>
                  <th scope="col">{t("us.sf.thecity.bytes.col_when")}</th>
                </tr>
              </thead>
              <tbody>
                {data.tiers.map((tr) => (
                  <tr key={tr.tier}>
                    <th scope="row">{tr.tier}</th>
                    <td className="num tnum">{nfInt.format(tr.chunks)}</td>
                    <td className="num tnum">{kb(tr.gzipBytes)}</td>
                    <td>
                      {tr.minZ === 0
                        ? TIER_WHEN[tr.tier] ?? "—"
                        : `z ≥ ${tr.minZ} — ${TIER_WHEN[tr.tier] ?? ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fx-fiche-note">
            {t("us.sf.thecity.bytes.note")
              .replace("{n}", String(data.baseChunks))
              .replace("{base}", kb(data.baseGzip))
              .replace("{manifest}", kb(data.manifestGzip))}
          </p>
        </div>
      </section>

      {/* ── where every field came from ── */}
      <section className="fx-section" id="sec-provenance">
        <div className="fx-wrap">
          <SectionHead
            title={t("us.sf.thecity.prov.title")}
            subtitle={t("us.sf.thecity.prov.lede")}
          />
          <ul className="fx-city-sources">
            {data.sources.map((s) => (
              <li key={s.key}>
                <span className="fx-city-source-what">{s.what ?? s.key}</span>
                <span className="fx-city-source-who">
                  {s.publisher ?? "—"}
                  {s.dataset ? ` · ${s.dataset}` : ""}
                  {s.url ? (
                    <>
                      {" "}
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        ↗
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SfSourceFooter
        perimeter={t("us.sf.thecity.footer.perimeter")
          .replace("{buildings}", nfInt.format(data.buildings))
          .replace("{blocks}", nfInt.format(data.blocks))
          .replace("{streets}", nfInt.format(data.streets))}
        coverage={t("us.sf.thecity.footer.coverage")
          .replace("{decisions}", nfInt.format(data.decisions))
          .replace("{unplaced}", nfInt.format(data.unplaced))}
        source={{
          name: "DataSF · Internet Archive · USGS · US Census",
          href: "https://datasf.org/opendata/",
        }}
        exports={[
          { label: "manifest.json", href: "/data/us/sf/city/manifest.json" },
          { label: "block-index.json", href: "/data/us/sf/city/blocks/block-index.json" },
          { label: "accuracy.json", href: "/data/us/sf/city/blocks/accuracy.json" },
        ]}
      />
    </main>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="fx-city-fact">
      <dt>{k}</dt>
      <dd className="tnum">{v}</dd>
      <p>{note}</p>
    </div>
  );
}
